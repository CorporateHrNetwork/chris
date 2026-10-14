const crypto = require("crypto");
const prisma = require("../config/prisma");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const CHANNELS = ["ESS", "EMAIL", "PHONE"];

function text(value) { return String(value ?? "").trim(); }
function hashMessage(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function fullName(row) { return [row?.firstName, row?.middleName, row?.lastName].filter(Boolean).join(" ").trim(); }

function lagosToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = {};
  for (const part of parts) if (part.type !== "literal") value[part.type] = part.value;
  return ${value.year}-${value.month}-${value.day};
}

function monthDay(value) {
  const raw = String(value || "").slice(0, 10);
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(raw) ? raw.slice(5) : null;
}

async function organizationIsZermatt({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","slug","name" FROM "organizations" WHERE "id"=$1 LIMIT 1`, organizationId
  );
  return rows[0]?.slug === ZERMATT_SLUG;
}

async function loadTodayCelebrations({ organizationId, date = lagosToday(), prismaClient = prisma }) {
  const todayMonthDay = date.slice(5);
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",e."firstName",e."middleName",e."lastName",e."email",e."phone",
            e."hireDate",d."name" AS "designationName",onboarding."dateOfBirth"
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
    const name = fullName(row) || row.employeeNumber;

    if (monthDay(row.dateOfBirth) === todayMonthDay) {
      celebrations.push({
        employeeId: row.id, employeeNumber: row.employeeNumber, employeeName: name,
        designationName: row.designationName || "Employee", email: text(row.email), phone: text(row.phone),
        type: "BIRTHDAY", title: `Happy Birthday, ${name}!`,
        message: `Happy Birthday, ${name}! May your new year bring you joy, good health, greater achievements and continued success. From everyone at Zermatt Liquor Limited.`,
      });
    }

    if (monthDay(row.hireDate) === todayMonthDay) {
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
        message: `Congratulations on your ${years}${ordinal} work anniversary, ${name}! Thank you for your commitment and contribution to Zermatt Liquor Limited. We celebrate you today.`,
      });
    }
  }
  return celebrations;
}

async function claimChannel({ organizationId, employeeId, celebrationType, celebrationDate, channel, messageHash, prismaClient = prisma }) {
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

async function finishChannel({ id, status, providerMessageId = null, error = null, prismaClient = prisma }) {
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

async function sendEmail({ celebration }) {
  if (!celebration.email) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "EMPLOYEE_EMAIL_NOT_AVAILABLE" };
  const apiKey = text(process.env.RESEND_API_KEY);
  if (!apiKey) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "RESEND_API_KEY_NOT_CONFIGURED" };
  const from = text(process.env.PAYROLL_EMAIL_FROM || process.env.RESEND_FROM) || "CHRiS <noreply@crnetwork.com.ng>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [celebration.email], subject: celebration.title, html: emailHtml(celebration), text: celebration.message }),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.message || `Resend HTTP ${response.status}`);
  return { status: "SENT", providerMessageId: body?.id || null };
}

async function sendPhone({ organizationId, celebration }) {
  if (!celebration.phone) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "EMPLOYEE_PHONE_NOT_AVAILABLE" };
  const webhook = text(process.env.CELEBRATION_SMS_WEBHOOK_URL || process.env.PHONE_NOTIFICATION_WEBHOOK_URL);
  if (!webhook) return { status: "PENDING_CONFIGURATION", providerMessageId: null, reason: "PHONE_NOTIFICATION_PROVIDER_NOT_CONFIGURED" };
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "ZERMATT_EMPLOYEE_CELEBRATION", organizationId, employeeNumber: celebration.employeeNumber,
      phone: celebration.phone, celebrationType: celebration.type, title: celebration.title, message: celebration.message,
    }),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.message || `Phone notification webhook HTTP ${response.status}`);
  return { status: "SENT", providerMessageId: body?.id || body?.messageId || null };
}

async function publishEss({ organizationId, celebration, celebrationDate, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "internal_news_posts"
      ("id","organizationId","category","title","summary","body","status","isPinned","publishAt","createdAt","updatedAt")
     VALUES ($1,$2,'EVENT',$3,$4,$5,'PUBLISHED',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     RETURNING "id"`,
    crypto.randomUUID(), organizationId, celebration.title,
    `Zermatt Liquor Limited celebration — ${celebrationDate}`, celebration.message
  );
  return { status: "SENT", providerMessageId: rows[0]?.id || null };
}

async function dispatchTodayCelebrations({ organizationId, date = lagosToday(), prismaClient = prisma }) {
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
        if (channel === "ESS") delivery = await publishEss({ organizationId, celebration, celebrationDate: date, prismaClient });
        else if (channel === "EMAIL") delivery = await sendEmail({ celebration });
        else delivery = await sendPhone({ organizationId, celebration });
        await finishChannel({ id: ledgerId, ...delivery, prismaClient });
        channelResults[channel] = delivery;
      } catch (error) {
        await finishChannel({ id: ledgerId, status: "FAILED", error: error.message, prismaClient });
        channelResults[channel] = { status: "FAILED", error: error.message };
      }
    }

    results.push({
      employeeId: celebration.employeeId, employeeNumber: celebration.employeeNumber, employeeName: celebration.employeeName,
      celebrationType: celebration.type, title: celebration.title, message: celebration.message, channels: channelResults,
    });
  }

  return { date, count: celebrations.length, results };
}

module.exports = { lagosToday, loadTodayCelebrations, dispatchTodayCelebrations };
