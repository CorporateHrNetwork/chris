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

function createResponseQueue(socket) {
  let buffer = "";
  let current = null;
  const queued = [];
  const waiters = [];

  function deliver(response) {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(response);
    else queued.push(response);
  }

  function onData(chunk) {
    buffer += chunk.toString("utf8");
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const rawLine = buffer.slice(0, index + 1);
      buffer = buffer.slice(index + 1);
      const line = rawLine.replace(/\r?\n$/, "");
      const match = line.match(/^(\d{3})([- ])(.*)$/);
      if (!match) continue;
      const code = Number(match[1]);
      const separator = match[2];
      if (!current) current = { code, lines: [] };
      current.lines.push(line);
      if (separator === " ") {
        deliver({ code: current.code, response: current.lines.join("\r\n") });
        current = null;
      }
    }
  }

  function onError(error) {
    while (waiters.length) waiters.shift().reject(error);
  }

  socket.on("data", onData);
  socket.on("error", onError);

  function next(expectedCodes, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const validate = (response) => {
        if (!expectedCodes.includes(response.code)) {
          reject(new Error(`SMTP command failed with status ${response.code}: ${response.response}`));
          return;
        }
        resolve(response);
      };

      if (queued.length) {
        validate(queued.shift());
        return;
      }

      const timeout = setTimeout(() => {
        const index = waiters.findIndex((item) => item.resolve === wrappedResolve);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("SMTP response timeout."));
      }, timeoutMs);

      function wrappedResolve(response) {
        clearTimeout(timeout);
        validate(response);
      }

      function wrappedReject(error) {
        clearTimeout(timeout);
        reject(error);
      }

      waiters.push({ resolve: wrappedResolve, reject: wrappedReject });
    });
  }

  function destroy() {
    socket.off("data", onData);
    socket.off("error", onError);
  }

  return { next, destroy };
}

async function connectSecure(socket, timeoutMs = 8000) {
  if (socket.authorized || socket.encrypted && socket.secureConnecting === false) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(new Error("SMTP connection timeout.")), timeoutMs);
    function cleanup(error) {
      clearTimeout(timer);
      socket.off("secureConnect", onSecure);
      socket.off("error", onError);
      if (error) reject(error);
      else resolve();
    }
    function onSecure() { cleanup(); }
    function onError(error) { cleanup(error); }
    socket.once("secureConnect", onSecure);
    socket.once("error", onError);
  });
}

async function smtpCommand(socket, responses, value, expectedCodes) {
  socket.write(`${value}\r\n`);
  return responses.next(expectedCodes);
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
  const responses = createResponseQueue(socket);

  try {
    await connectSecure(socket);
    await responses.next([220]);
    await smtpCommand(socket, responses, `EHLO ${config.host}`, [250]);
    await smtpCommand(socket, responses, "AUTH LOGIN", [334]);
    await smtpCommand(socket, responses, Buffer.from(config.user).toString("base64"), [334]);
    await smtpCommand(socket, responses, Buffer.from(config.password).toString("base64"), [235]);
    await smtpCommand(socket, responses, `MAIL FROM:<${config.user}>`, [250]);
    await smtpCommand(socket, responses, `RCPT TO:<${clean(to)}>`, [250, 251]);
    await smtpCommand(socket, responses, "DATA", [354]);

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
    const accepted = await responses.next([250]);
    socket.write("QUIT\r\n");

    return {
      status: "SENT",
      to: clean(to),
      channel: "SMTP",
      type,
      smtpStatus: accepted.code,
    };
  } finally {
    responses.destroy();
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
