const tls = require("tls");

function clean(value) {
  return String(value || "").trim();
}

function smtpConfigured() {
  return Boolean(clean(process.env.SMTP_PASSWORD));
}

function smtpConfig() {
  return {
    host: clean(process.env.SMTP_HOST) || "mail.crnetwork.com.ng",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
    user: clean(process.env.SMTP_USER) || "chris@crnetwork.com.ng",
    password: String(process.env.SMTP_PASSWORD || ""),
    from: clean(process.env.SMTP_FROM) || "CHRiS <chris@crnetwork.com.ng>",
  };
}

function encodeHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function escapeDots(value) {
  return String(value || "").replace(/(^|\r?\n)\./g, "$1..");
}

function buildBody({ type, lead, message }) {
  const lines = [message || "CHRiS commercial notification.", ""];
  if (lead?.leadNumber) lines.push(`Reference: ${lead.leadNumber}`);
  if (lead?.companyName) lines.push(`Company: ${lead.companyName}`);
  if (lead?.contactName) lines.push(`Contact: ${lead.contactName}`);
  if (lead?.email) lines.push(`Email: ${lead.email}`);
  if (lead?.phone) lines.push(`Phone/WhatsApp: ${lead.phone}`);
  if (lead?.employeeCount) lines.push(`Employees: ${lead.employeeCount}`);
  if (lead?.locations) lines.push(`Locations: ${lead.locations}`);
  if (Array.isArray(lead?.modulesOfInterest) && lead.modulesOfInterest.length) {
    lines.push(`Modules: ${lead.modulesOfInterest.join(", ")}`);
  }
  if (lead?.currentHrSystem) lines.push(`Current HR/payroll system: ${lead.currentHrSystem}`);
  if (lead?.implementationTimeline) lines.push(`Implementation timeline: ${lead.implementationTimeline}`);
  if (lead?.preferredDemoDate) lines.push(`Preferred demo date: ${lead.preferredDemoDate}`);
  if (lead?.preferredDemoTime) lines.push(`Preferred demo time: ${lead.preferredDemoTime}`);
  if (lead?.message) lines.push(`Requirements: ${lead.message}`);
  if (type) lines.push("", `Notification type: ${type}`);
  lines.push("", "CHRiS — PEOPLE | PERFORMANCE | REWARD");
  return lines.join("\r\n");
}

function readResponse(socket, expectedCodes, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => cleanup(new Error("SMTP response timeout.")), timeoutMs);

    function cleanup(error, value) {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
      if (error) reject(error);
      else resolve(value);
    }

    function onError(error) {
      cleanup(error);
    }

    function onData(chunk) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (!/^\d{3} /.test(last)) return;
      const code = Number(last.slice(0, 3));
      if (!expectedCodes.includes(code)) {
        cleanup(new Error(`SMTP command failed with status ${code}.`));
        return;
      }
      cleanup(null, { code, response: buffer });
    }

    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function command(socket, value, expectedCodes) {
  socket.write(`${value}\r\n`);
  return readResponse(socket, expectedCodes);
}

async function sendViaSmtp({ to, subject, replyTo, type, lead, message }) {
  const config = smtpConfig();
  if (!config.secure) {
    throw new Error("CHRiS SMTP transport currently requires SMTP_SECURE=true (implicit TLS, normally port 465).");
  }

  const socket = tls.connect({
    host: config.host,
    port: config.port,
    servername: config.host,
    rejectUnauthorized: true,
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
      socket.setTimeout(20000, () => reject(new Error("SMTP connection timeout.")));
    });

    await readResponse(socket, [220]);
    await command(socket, `EHLO ${config.host}`, [250]);
    await command(socket, "AUTH LOGIN", [334]);
    await command(socket, Buffer.from(config.user).toString("base64"), [334]);
    await command(socket, Buffer.from(config.password).toString("base64"), [235]);
    await command(socket, `MAIL FROM:<${config.user}>`, [250]);
    await command(socket, `RCPT TO:<${clean(to)}>`, [250, 251]);
    await command(socket, "DATA", [354]);

    const body = escapeDots(buildBody({ type, lead, message }));
    const headers = [
      `From: ${encodeHeader(config.from)}`,
      `To: ${encodeHeader(to)}`,
      `Subject: ${encodeHeader(subject)}`,
      replyTo ? `Reply-To: ${encodeHeader(replyTo)}` : null,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@crnetwork.com.ng>`,
    ].filter(Boolean);

    socket.write(`${headers.join("\r\n")}\r\n\r\n${body}\r\n.\r\n`);
    const accepted = await readResponse(socket, [250]);
    socket.write("QUIT\r\n");

    return {
      status: "SENT",
      to: clean(to),
      channel: "SMTP",
      type,
      smtpStatus: accepted.code,
    };
  } finally {
    socket.end();
    socket.destroy();
  }
}

async function sendViaWebhook({ to, subject, replyTo, type, lead, message }) {
  const webhook = clean(process.env.COMMERCIAL_EMAIL_WEBHOOK_URL);
  if (!webhook) return null;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, subject, replyTo, type, lead, message }),
  });
  return {
    status: response.ok ? "SENT" : "FAILED",
    to,
    channel: "EMAIL_WEBHOOK",
    type,
    httpStatus: response.status,
  };
}

async function dispatchCommercialEmail(payload) {
  if (smtpConfigured()) {
    try {
      return await sendViaSmtp(payload);
    } catch (error) {
      const webhook = clean(process.env.COMMERCIAL_EMAIL_WEBHOOK_URL);
      if (!webhook) {
        return {
          status: "FAILED",
          to: payload.to,
          channel: "SMTP",
          type: payload.type,
          error: error.message,
        };
      }
    }
  }

  try {
    const webhookResult = await sendViaWebhook(payload);
    if (webhookResult) return webhookResult;
  } catch (error) {
    return {
      status: "FAILED",
      to: payload.to,
      channel: "EMAIL_WEBHOOK",
      type: payload.type,
      error: error.message,
    };
  }

  return {
    status: "PENDING_CONFIGURATION",
    to: payload.to,
    channel: "EMAIL",
    type: payload.type,
  };
}

module.exports = {
  dispatchCommercialEmail,
  smtpConfigured,
  smtpConfig,
};
