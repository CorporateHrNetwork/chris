function clean(value) {
  return String(value || "").trim();
}

function resendConfigured() {
  return Boolean(clean(process.env.RESEND_API_KEY));
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
    from: clean(process.env.SMTP_FROM) || "CHRiS <chris@crnetwork.com.ng>",
  };
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
  return lines.join("\n");
}

async function sendViaResend({ to, subject, replyTo, type, lead, message }) {
  const apiKey = clean(process.env.RESEND_API_KEY);
  if (!apiKey) return null;

  const from = clean(process.env.RESEND_FROM) || "CHRiS <noreply@crnetwork.com.ng>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [clean(to)],
      subject: clean(subject),
      text: buildBody({ type, lead, message }),
      ...(replyTo ? { reply_to: clean(replyTo) } : {}),
    }),
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const providerMessage = responseBody?.message || responseBody?.name || `HTTP ${response.status}`;
    throw new Error(`Resend delivery failed: ${providerMessage}`);
  }

  return {
    status: "SENT",
    to: clean(to),
    channel: "RESEND_API",
    type,
    providerMessageId: responseBody?.id || null,
  };
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
    to: clean(to),
    channel: "EMAIL_WEBHOOK",
    type,
    httpStatus: response.status,
  };
}

async function dispatchCommercialEmail(payload) {
  if (resendConfigured()) {
    try {
      return await sendViaResend(payload);
    } catch (error) {
      console.error("[commercial-email] Resend delivery failed", {
        type: payload.type,
        to: payload.to,
        error: error.message,
      });
      return {
        status: "FAILED",
        to: payload.to,
        channel: "RESEND_API",
        type: payload.type,
        error: error.message,
      };
    }
  }

  try {
    const webhookResult = await sendViaWebhook(payload);
    if (webhookResult) return webhookResult;
  } catch (error) {
    console.error("[commercial-email] Webhook delivery failed", {
      type: payload.type,
      to: payload.to,
      error: error.message,
    });
    return {
      status: "FAILED",
      to: payload.to,
      channel: "EMAIL_WEBHOOK",
      type: payload.type,
      error: error.message,
    };
  }

  if (smtpConfigured()) {
    console.warn("[commercial-email] SMTP credentials are configured, but direct SMTP is disabled for the current Render Free deployment. Configure RESEND_API_KEY instead.");
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
  resendConfigured,
  smtpConfigured,
  smtpConfig,
};
