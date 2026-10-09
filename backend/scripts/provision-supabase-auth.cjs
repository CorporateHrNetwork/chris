require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const crypto = require("crypto");
const prisma = require("../src/config/prisma");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const RESET_REDIRECT = process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL || "";

async function adminRequest(path, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  return { response, payload };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY || !RESET_REDIRECT) {
    throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY), and SUPABASE_PASSWORD_RESET_REDIRECT_URL in backend/.env before running.");
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      email: true,
      organization: { select: { slug: true, status: true } },
    },
  });

  const byEmail = new Map();
  for (const user of users) {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email || user.organization?.status !== "ACTIVE") continue;
    if (!byEmail.has(email)) byEmail.set(email, user.organization.slug);
  }

  let created = 0;
  let alreadyPresent = 0;
  let recoverySent = 0;
  const failures = [];

  for (const [email, organizationSlug] of byEmail) {
    const temporaryPassword = crypto.randomBytes(32).toString("base64url") + "aA9!";
    const createdUser = await adminRequest("admin/users", {
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { chris_account: true },
    });

    if (createdUser.response.ok) {
      created += 1;
    } else {
      const code = String(createdUser.payload.code || createdUser.payload.error_code || "");
      const message = String(createdUser.payload.msg || createdUser.payload.message || "");
      const duplicate = /already|exists|registered/i.test(`${code} ${message}`);
      if (duplicate) {
        alreadyPresent += 1;
      } else {
        failures.push({ email, stage: "create-auth-user", status: createdUser.response.status, message: message || code || "Supabase Auth admin request failed" });
        continue;
      }
    }

    const redirect = new URL(RESET_REDIRECT);
    redirect.searchParams.set("organization", organizationSlug);
    const recoveryResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect.toString())}`,
      {
        method: "POST",
        headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
      }
    );
    if (recoveryResponse.ok) {
      recoverySent += 1;
    } else {
      let payload = {};
      try { payload = await recoveryResponse.json(); } catch {}
      failures.push({ email, stage: "send-recovery-email", status: recoveryResponse.status, message: payload.msg || payload.message || "Recovery email could not be requested" });
    }
  }

  console.log(JSON.stringify({
    activeUniqueEmails: byEmail.size,
    authUsersCreated: created,
    identitiesAlreadyPresent: alreadyPresent,
    recoveryEmailsRequested: recoverySent,
    failures,
  }, null, 2));

  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Supabase Auth provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
