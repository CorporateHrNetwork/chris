"use strict";

// CCA local-only identity security laboratory. NOT a production IdP.
// No HTTP exports, CHRiS tenant users, secrets, or database integrations.
const crypto = require("node:crypto");
const { derivePlatformContext, isAuthorized } = require("../../backend/src/cca/platformDirectoryPolicy");

const TOTP_SECONDS = 30;
const CHALLENGE_SECONDS = 120;
const SESSION_SECONDS = 900;
const MAX_FAILURES = 5;
const LOCK_SECONDS = 300;

const randomString = (size = 32) => crypto.randomBytes(size).toString("base64url");
const tokenHash = value => crypto.createHash("sha256").update(value).digest("hex");
function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
}
function otpAt(secret, counter) {
  if (!Buffer.isBuffer(secret) || secret.length < 20 ||
      !Number.isSafeInteger(counter) || counter < 0) throw new Error("CCA_INVALID_OTP_INPUT");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", secret).update(bytes).digest();
  const index = mac[mac.length - 1] & 0x0f;
  const number = (mac.readUInt32BE(index) & 0x7fffffff) % 1000000;
  return String(number).padStart(6, "0");
}
function checkOtp(secret, code, nowSeconds, minimumCounter = -1) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code) ||
      !Number.isSafeInteger(nowSeconds)) return -1;
  const counter = Math.floor(nowSeconds / TOTP_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const candidate = counter + offset;
    if (candidate < 0 || candidate <= minimumCounter) continue;
    const expected = Buffer.from(otpAt(secret, candidate), "ascii");
    if (crypto.timingSafeEqual(expected, Buffer.from(code, "ascii"))) return candidate;
  }
  return -1;
}
function createLocalIdentityLab({ clock = () => Math.floor(Date.now() / 1000) } = {}) {
  const users = new Map();
  const challenges = new Map();
  const sessions = new Map();
  function enroll({ id, password, secret = crypto.randomBytes(20), role, tenantIds = [] }) {
    if (typeof id !== "string" || !/^cca-demo-[a-z0-9-]{3,40}$/.test(id) ||
        users.has(id) || users.size >= 20 ||
        typeof password !== "string" || password.length < 12 || password.length > 256 ||
        !(Buffer.isBuffer(secret)) || secret.length < 20 ||
        !Array.isArray(tenantIds) || tenantIds.length > 10 ||
        !tenantIds.every(t => ["demo-cedar", "demo-atlas"].includes(t)) ||
        !["SERVICE_AGENT", "PLATFORM_APPROVER", "AUDITOR"].includes(role))
      throw new Error("CCA_INVALID_LOCAL_ENROLLMENT");
    const salt = crypto.randomBytes(16);
    const hashed = passwordHash(password, salt);
    users.set(id, { id, salt, hashed, secret: Buffer.from(secret),
      role, tenantIds: [...new Set(tenantIds)], active: true,
      version: 1, lastOtpCounter: -1, failures: 0, blockedUntil: 0 });
    // For local testing only; never return enrollment secret in an HTTP API.
    return Object.freeze({ id, enrolled: true });
  }
  function loginPassword({ id, password }) {
    const now = clock();
    const principal = users.get(id);
    // Fake hash for unknown users to avoid a fast existence oracle.
    const fakeSalt = Buffer.alloc(16, 0);
    const salt = principal?.salt || fakeSalt;
    const expected = principal?.hashed || Buffer.alloc(64);
    const actual = typeof password === "string" && password.length <= 256
      ? passwordHash(password, salt) : Buffer.alloc(64);
    const matches = crypto.timingSafeEqual(expected, actual);
    if (!principal || !principal.active || now < principal.blockedUntil || !matches) {
      if (principal && now >= principal.blockedUntil) {
        principal.failures += 1;
        if (principal.failures >= MAX_FAILURES) {
          principal.blockedUntil = now + LOCK_SECONDS;
          principal.failures = 0;
        }
      }
      return { ok: false, code: "CCA_AUTH_FAILED" };
    }
    principal.failures = 0;
    const challenge = randomString();
    challenges.set(tokenHash(challenge), { id, expires: now + CHALLENGE_SECONDS, version: principal.version });
    return { ok: true, challenge };
  }
  function loginOtp({ challenge, code }) {
    const now = clock();
    if (typeof challenge !== "string" || challenge.length > 200) return { ok: false, code: "CCA_AUTH_FAILED" };
    const key = tokenHash(challenge);
    const pending = challenges.get(key);
    challenges.delete(key); // Single attempt per password challenge.
    const principal = pending && users.get(pending.id);
    if (!pending || !principal || !principal.active ||
        pending.expires <= now || pending.version !== principal.version ||
        now < principal.blockedUntil) return { ok: false, code: "CCA_AUTH_FAILED" };
    const counter = checkOtp(principal.secret, code, now, principal.lastOtpCounter);
    if (counter < 0) return { ok: false, code: "CCA_AUTH_FAILED" };
    principal.lastOtpCounter = counter;
    const token = randomString();
    const sessionId = randomString(16);
    sessions.set(tokenHash(token), { id: principal.id, sessionId,
      version: principal.version, expires: now + SESSION_SECONDS, revoked: false });
    return { ok: true, token, expiresAt: now + SESSION_SECONDS };
  }
  function resolveSession(token, permission, tenantId) {
    const reject = { accepted: false, reason: "CCA_UNAUTHORIZED" };
    if (typeof token !== "string" || token.length > 200) return reject;
    const stored = sessions.get(tokenHash(token));
    const principal = stored && users.get(stored.id);
    if (!stored || !principal || !principal.active || stored.revoked ||
        stored.version !== principal.version || stored.expires <= clock()) return reject;
    const assignments = [
      { assignmentId: "platform-" + principal.id, principalId: principal.id,
        active: true, scope: "PLATFORM", role: principal.role },
      ...principal.tenantIds.map(t => ({
        assignmentId: "tenant-" + principal.id + "-" + t,
        principalId: principal.id, active: true, scope: "TENANT",
        tenantId: t, role: principal.role
      }))
    ];
    const context = derivePlatformContext({
      sessionResult: { accepted: true, platformPrincipalId: principal.id, sessionId: stored.sessionId },
      principal: { id: principal.id, active: true }, assignments
    });
    if (!context.accepted || (permission && !isAuthorized(context, permission, tenantId))) return reject;
    return Object.freeze({ ...context, accepted: true });
  }
  function revoke(token) {
    if (typeof token !== "string" || token.length > 200) return false;
    const key = tokenHash(token);
    const found = sessions.get(key);
    if (!found) return false;
    found.revoked = true;
    sessions.delete(key);
    return true;
  }
  function disable(id) {
    const principal = users.get(id);
    if (!principal) return false;
    principal.active = false;
    principal.version++;
    for (const [key, stored] of sessions) if (stored.id === id) sessions.delete(key);
    for (const [key, pending] of challenges) if (pending.id === id) challenges.delete(key);
    return true;
  }
  return Object.freeze({ enroll, loginPassword, loginOtp, resolveSession, revoke, disable });
}
module.exports = { createLocalIdentityLab, otpAt, checkOtp };
