const crypto = require("crypto");
const database = () => require("../config/prisma");
const BRAND = "Zermatt Liquor Limited | Powered by CHRiS";

const ZERMATT_SLUG = "zermatt-liquor-limited";
const CHANNELS = ["ESS", "EMAIL", "PHONE"];

function text(value) { return String(value ?? "").trim(); }
function hashMessage(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function fullName(row) { return [row?.firstName, row?.middleName, row?.lastName].filter(Boolean).join(" ").trim(); }

function lagosToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = {};
  for (const part of parts) if (part.type !== "literal") value[part.type] = part.value;
  return `${value.year}-${value.month}-${value.day}`;
}

function isoDate(value) {
  const raw = value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : "") : String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

function monthDay(value, celebrationYear) {
  const raw = isoDate(value);
  if (!raw) return null;
  // Observe February 29 on February 28 in non-leap years.
  const leap = new Date(Date.UTC(celebrationYear, 1, 29)).getUTCMonth() === 1;
  return raw.slice(5) === "02-29" && !leap ? "02-28" : raw.slice(5);
}

function validateToday(date, now = new Date()) {
  if (!isoDate(date) || date !== lagosToday(now)) {
    const error = new Error("Celebrations can only be dispatched for today in Africa/Lagos.");
    error.statusCode = 400; error.code = "CELEBRATION_DATE_NOT_TODAY"; throw error;
  }
}

function normalizePhone(value) {
  let phone = text(value).replace(/[\s().-]/g, "");
  if (/^0[789]\d{9}$/.test(phone)) phone = `+234${phone.slice(1)}`;
  else if (/^234[789]\d{9}$/.test(phone)) phone = `+${phone}`;
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

function deliveryConfiguration(env = process.env) {
  const configuredFrom = text(env.CELEBRATION_EMAIL_FROM || env.PAYROLL_EMAIL_FROM || env.RESEND_FROM);
  const mailbox = configuredFrom.includes("<") ? configuredFrom.match(/<([^<>]+)>/)?.[1] : configuredFrom;
  const from = mailbox && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(mailbox)
    ? `${BRAND} <${mailbox}>` : null;
  const webhook = text(env.CELEBRATION_SMS_WEBHOOK_URL || env.PHONE_NOTIFICATION_WEBHOOK_URL);
  let smsConfigured = false;
  try { smsConfigured = new URL(webhook).protocol === "https:"; } catch {}
    let termiiConfigured = false;
  try {
    const base = new URL(text(env.TERMII_BASE_URL));
    termiiConfigured = base.protocol === "https:" && base.hostname.endsWith(".termii.com") && !base.username && !base.password && Boolean(text(env.TERMII_API_KEY)) && /^[A-Za-z0-9 ]{3,11}$/.test(text(env.TERMII_SENDER_ID));
  } catch {}
  return { from, webhook, emailConfigured: Boolean(text(env.RESEND_API_KEY) && from), smsConfigured: smsConfigured || termiiConfigured, smsProvider: smsConfigured ? "WEBHOOK" : termiiConfigured ? "TERMII" : null };
}

async function organizationIsZermatt({ organizationId, prismaClient = database() }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","slug","name" FROM "organizations" WHERE "id"=$1 LIMIT 1`, organizationId
  );
  return rows[0]?.slug === ZERMATT_SLUG;
}

async function loadTodayCelebrations({ organizationId, date = lagosToday(), prismaClient = database() }) {
  if (!isoDate(date)) throw new Error("Invalid celebration date.");
  const todayMonthDay = date.slice(5);
  const year = Number(date.slice(0, 4));
  const settings = await prismaClient.$queryRawUnsafe(
    `SELECT "birthdayMessagesEnabled","anniversaryMessagesEnabled" FROM "chris_automation_settings" WHERE "organizationId"=$1 LIMIT 1`, organizationId
  );
  const birthdayEnabled = settings[0]?.birthdayMessagesEnabled !== false;
  const anniversaryEnabled = settings[0]?.anniversaryMessagesEnabled !== false;
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",e."firstName",e."middleName",e."lastName",e."email",e."phone",
            to_char(e."hireDate",'YYYY-MM-DD') AS "hireDate",to_char(e."exitDate",'YYYY-MM-DD') AS "exitDate",d."name" AS "designationName",onboarding."dateOfBirth"
       FROM "employees" e
       LEFT JOIN "designations" d ON d."id"=e."designationId" AND d."organizationId"=e."organizationId"
       LEFT JOIN LATERAL (
         SELECT eo."sectionData"->'personal-details'->>'dateOfBirth' AS "dateOfBirth"
         FROM "employee_onboardings" eo
         WHERE eo."organizationId"=e."organizationId" AND eo."employeeId"=e."id"
         ORDER BY eo."updatedAt" DESC LIMIT 1
       ) onboarding ON TRUE
      WHERE e."organizationId"=$1
        AND e."status" IN ('ACTIVE','PROBATION','LEAVE','SUSPENDED')
      ORDER BY e."firstName",e."lastName"`,
    organizationId
  );

  const celebrations = [];
  for (const row of rows) {
    const hireDate = isoDate(row.hireDate);
    const exitDate = isoDate(row.exitDate);
    if ((exitDate && exitDate <= date) || (hireDate && hireDate > date)) continue;
    const name = fullName(row) || row.employeeNumber;

    if (birthdayEnabled && isoDate(row.dateOfBirth) < date && monthDay(row.dateOfBirth, year) === todayMonthDay) {
      celebrations.push({
        employeeId: row.id, employeeNumber: row.employeeNumber, employeeName: name,
        designationName: row.designationName || "Employee", email: text(row.email), phone: text(row.phone),
        type: "BIRTHDAY", title: `Happy Birthday, ${name}!`,
        message: `Happy Birthday, ${name}! May your new year bring you joy, good health, greater achievements and continued success. ${BRAND}`,
      });
    }

    if (anniversaryEnabled && hireDate && year > Number(hireDate.slice(0, 4)) && monthDay(row.hireDate, year) === todayMonthDay) {
      const hire = row.hireDate ? new Date(row.hireDate) : null;
      const today = new Date(`${date}T00:00:00Z`);
      const years = hire ? Math.max(1, today.getUTCFullYear() - hire.getUTCFullYear()) : 1;
      const ordinal = years % 10 === 1 && years % 100 !== 11 ? "st"
        : years % 10 === 2 && years % 100 !== 12 ? "nd"
        : years % 10 === 3 && years % 100 !== 13 ? "rd" : "th";
      celebrations.push({
        employeeId: row.id, employeeNumber: row.employeeNumber, employeeName: name,
        designationName: row.designationName || "Employee", email: text(row.email), phone: text(row.phone),
        type: "WORK_ANNIVERSARY",
        title: `Congratulations on your ${years}${ordinal} Work Anniversary, ${name}!`,
        message: `Congratulations on your ${years}${ordinal} work anniversary, ${name}! Thank you for your commitment and contribution to Zermatt Liquor Limited. We celebrate you today. ${BRAND}`,
      });
    }
  }
  return celebrations;
}

async function claimChannel({ organizationId, employeeId, celebrationType, celebrationDate, channel, messageHash, prismaClient = database() }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "employee_celebration_notification_ledger"
      ("id","organizationId","employeeId","celebrationType","celebrationDate","channel","messageHash","status")
     VALUES ($1,$2,$3,$4,$5::date,$6,$7,'PROCESSING')
     ON CONFLICT ("organizationId","employeeId","celebrationType","celebrationDate","channel")
     DO UPDATE SET "status"='PROCESSING',"messageHash"=EXCLUDED."messageHash","error"=NULL,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "employee_celebration_notification_ledger"."status" IN ('FAILED','PENDING_CONFIGURATION')
     RETURNING "id"`,
    crypto.randomUUID(), organizationId, employeeId, celebrationType, celebrationDate, channel, messageHash
  );
  return rows[0]?.id || null;
}

async function finishChannel({ id, status, providerMessageId = null, error = null, prismaClient = database() }) {
  await prismaClient.$executeRawUnsafe(
    `UPDATE "employee_celebration_notification_ledger"
        SET "status"=$2,"providerMessageId"=$3,"error"=$4,
            "sentAt"=CASE WHEN $2='SENT' THEN CURRENT_TIMESTAMP ELSE "sentAt" END,
            "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=$1`,
    id, status, providerMessageId, error ? String(error).slice(0, 2000) : null
  );
}

function emailHtml(celebration) {
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;padding:24px;font-family:Arial,sans-serif;color:#17211c">
    <div style="max-width:620px;margin:auto;background:#fffdf7;border:1px solid #d8c788;border-radius:10px;overflow:hidden">
      <div style="padding:22px;text-align:center;border-bottom:3px solid #0b6b43">
        <div style="font-weight:800;font-size:20px;color:#064e3b">Zermatt Liquor Limited</div>
        <div style="margin-top:5px;font-weight:700;font-size:11px;letter-spacing:.12em;color:#9a7410">CHRiS CELEBRATION</div>
      </div>
      <div style="padding:24px"><h2 style="color:#064e3b;margin-top:0">${safe(celebration.title)}</h2>
        <p style="font-size:15px;line-height:1.6">${safe(celebration.message)}</p>
        <p style="font-size:12px;color:#64748b">The same celebration message is available in CHRiS Employee Self Service.</p>
      </div>
      <div style="padding:12px 18px;border-top:1px solid #d8c788;text-align:center;font-size:11px;color:#64748b">Powered by CHRiS</div>
    </div>
  </body></html>`;
}

async function sendEmail({ celebration, deliveryKey, env = process.env, fetchImpl = fetch }) {
  if (!celebration.email) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "EMPLOYEE_EMAIL_NOT_AVAILABLE" };
  const apiKey = text(env.RESEND_API_KEY);
  if (!apiKey) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "RESEND_API_KEY_NOT_CONFIGURED" };
  const { from } = deliveryConfiguration(env);
  if (!from) return { status: "PENDING_CONFIGURATION", reason: "VERIFIED_EMAIL_SENDER_NOT_CONFIGURED" };
  const response = await fetchImpl("https://api.resend.com/emails", {
    signal: AbortSignal.timeout(15000),
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": deliveryKey },
    body: JSON.stringify({ from, to: [celebration.email], subject: celebration.title, html: emailHtml(celebration), text: celebration.message }),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
    error.safeToRetry = response.status === 429 || (response.status >= 400 && response.status < 500 && response.status !== 408);
    throw error;
  }
  if (!body?.id) throw new Error("EMAIL_PROVIDER_ACCEPTANCE_UNCONFIRMED");
  return { status: "SENT", providerMessageId: body?.id || null };
}

async function sendPhone({ organizationId, celebration, deliveryKey, env = process.env, fetchImpl = fetch }) {
  if (!celebration.phone) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "EMPLOYEE_PHONE_NOT_AVAILABLE" };
  const phone = normalizePhone(celebration.phone);
  if (!phone) return { status: "PENDING_CONFIGURATION", reason: "EMPLOYEE_PHONE_INVALID" };
  const { webhook, smsConfigured, smsProvider } = deliveryConfiguration(env);
  if (!smsConfigured) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "PHONE_NOTIFICATION_PROVIDER_NOT_CONFIGURED" };
  if (smsProvider === "TERMII") {
    const endpoint = new URL("/api/sms/send", text(env.TERMII_BASE_URL));
    const response = await fetchImpl(endpoint.toString(), {
      method: "POST", signal: AbortSignal.timeout(15000), headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: phone.slice(1), from: text(env.TERMII_SENDER_ID), sms: celebration.message,
        type: "plain", channel: "generic", api_key: text(env.TERMII_API_KEY) }),
    });
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(`SMS_PROVIDER_HTTP_${response.status}`);
      error.safeToRetry = response.status === 429 || (response.status >= 400 && response.status < 500 && response.status !== 408);
      throw error;
    }
    if (!body?.message_id) throw new Error("SMS_PROVIDER_ACCEPTANCE_UNCONFIRMED");
    return { status: "SENT", providerMessageId: body.message_id };
  }
  const response = await fetchImpl(webhook, {
    signal: AbortSignal.timeout(15000),
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": deliveryKey,
      ...(text(env.CELEBRATION_SMS_WEBHOOK_TOKEN) ? { Authorization: `Bearer ${text(env.CELEBRATION_SMS_WEBHOOK_TOKEN)}` } : {}) },
    body: JSON.stringify({
      type: "ZERMATT_EMPLOYEE_CELEBRATION", organizationId, employeeNumber: celebration.employeeNumber,
      phone, sender: "Zermatt Liquor Limited", poweredBy: "CHRiS", idempotencyKey: deliveryKey, celebrationType: celebration.type, title: celebration.title, message: celebration.message,
    }),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(`SMS_PROVIDER_HTTP_${response.status}`);
    error.safeToRetry = response.status === 429 || (response.status >= 400 && response.status < 500 && response.status !== 408);
    throw error;
  }
  if (body?.accepted !== true || !(body?.id || body?.messageId)) throw new Error("SMS_PROVIDER_ACCEPTANCE_UNCONFIRMED");
  return { status: "SENT", providerMessageId: body.id || body.messageId };
}

async function publishEss({ organizationId, celebration, celebrationDate, prismaClient = database() }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "internal_news_posts"
      ("id","organizationId","category","title","summary","body","status","isPinned","publishAt","createdAt","updatedAt")
     VALUES ($1,$2,'EVENT',$3,$4,$5,'PUBLISHED',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT ("id") DO UPDATE SET "id"=EXCLUDED."id"
     RETURNING "id"`,
    hashMessage(`${organizationId}|${celebration.employeeId}|${celebration.type}|${celebrationDate}|ESS`), organizationId, celebration.title,
    `Zermatt Liquor Limited celebration — ${celebrationDate}`, celebration.message
  );
  return { status: "SENT", providerMessageId: rows[0]?.id || null };
}

async function dispatchTodayCelebrations({ organizationId, date = lagosToday(), prismaClient = database(), now = new Date(), env = process.env, fetchImpl = fetch }) {
  validateToday(date, now);
  if (!(await organizationIsZermatt({ organizationId, prismaClient }))) {
    const error = new Error("Celebration delivery is currently enabled only for Zermatt Liquor Limited.");
    error.code = "CELEBRATION_NOT_ENABLED"; error.statusCode = 403; throw error;
  }

  const celebrations = await loadTodayCelebrations({ organizationId, date, prismaClient });
  const results = [];

  for (const celebration of celebrations) {
    const messageHash = hashMessage(`${celebration.type}|${celebration.employeeId}|${date}|${celebration.message}`);
    const channelResults = {};

    for (const channel of CHANNELS) {
      const ledgerId = await claimChannel({
        organizationId, employeeId: celebration.employeeId, celebrationType: celebration.type,
        celebrationDate: date, channel, messageHash, prismaClient,
      });
      if (!ledgerId) { channelResults[channel] = { status: "ALREADY_PROCESSED" }; continue; }

      try {
        let delivery;
        const deliveryKey = hashMessage(`${organizationId}|${celebration.employeeId}|${celebration.type}|${date}|${channel}`);
        if (channel === "ESS") delivery = await publishEss({ organizationId, celebration, celebrationDate: date, prismaClient });
        else if (channel === "EMAIL") delivery = await sendEmail({ celebration, deliveryKey, env, fetchImpl });
        else delivery = await sendPhone({ organizationId, celebration, deliveryKey, env, fetchImpl });
        await finishChannel({ id: ledgerId, ...delivery, error: delivery.reason, prismaClient });
        channelResults[channel] = delivery;
      } catch (error) {
        // An external timeout or lost response may follow acceptance. Hold for
        // reconciliation rather than automatically sending a duplicate greeting.
        const status = channel === "ESS" || error.safeToRetry ? "FAILED" : "PROCESSING";
        await finishChannel({ id: ledgerId, status, error: error.message, prismaClient });
        channelResults[channel] = { status, error: error.message };
      }
    }

    results.push({
      employeeId: celebration.employeeId, employeeNumber: celebration.employeeNumber, employeeName: celebration.employeeName,
      celebrationType: celebration.type, title: celebration.title, message: celebration.message, channels: channelResults,
    });
  }

  return { date, count: celebrations.length, results };
}

module.exports = { BRAND, lagosToday, isoDate, monthDay, normalizePhone, deliveryConfiguration, loadTodayCelebrations, dispatchTodayCelebrations, sendEmail, sendPhone };
