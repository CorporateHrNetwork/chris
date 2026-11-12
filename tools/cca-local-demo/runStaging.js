"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { base32 } = require("./localAuthServer");
const { createIdentityVault, STAGING_CEDAR_APPROVER } = require("./identityVault");
const { createDurableDemoState } = require("./server");
const { createAuditLedger } = require("./auditLedger");
const { createStagingServer } = require("./stagingAuthAdapter");
const { createCheckpoint, createPersistentThrottle, deriveKey } = require("./stagingState");

const ACCOUNT = "cca-staging-operator";
const PORT = 4184;
const STAGING_HOST = "127.0.0.2";

function openStaging({ directory, master, initialize = false, enrollApprover = false, clock }) {
  const state = path.join(directory, "state");
  const security = path.join(directory, "host-security");
  const files = {
    vault: path.join(state, "cca-identities.enc.json"),
    backup: path.join(state, "cca-identities.previous.enc.json"),
    recovery: path.join(state, "cca-recovery-review-required"),
    audit: path.join(state, "auth-audit.log"),
    throttle: path.join(state, "source-throttle.json"),
  };
  const lock = path.join(security, "writer.lock");
  fs.mkdirSync(lock, { mode: 0o700 });
  const release = () => fs.rmdirSync(lock);
  try {
    const encryptionKey = deriveKey(master, "vault-v1");
    const auditKey = deriveKey(master, "audit-v1");
    const checkpointKey = deriveKey(master, "checkpoint-v1");
    const checkpoint = createCheckpoint({
      file: path.join(security, "state-checkpoint.json"), files, key: checkpointKey, initialize,
    });
    const vault = createIdentityVault({ directory: state, encryptionKey, clock });
    const ledger = createAuditLedger({ file: files.audit, key: auditKey });
    ledger.verify();
    if (initialize) {
      return { release, enroll(password, secret) {
        checkpoint.verify();
        vault.register({ id: ACCOUNT, password, mfaSecret: secret, roles: ["SERVICE_AGENT"], tenantIds: ["demo-cedar"] });
        ledger.append({ event: "CCA_STAGING_ENROLLED", actor: "LOCAL_OPERATOR", target: ACCOUNT });
        checkpoint.commit();
      } };
    }
    if (!fs.existsSync(files.vault) || !fs.existsSync(files.audit))
      throw Error("CCA_STAGING_ENROLLMENT_REQUIRED");
    if (enrollApprover) {
      return { release, enroll(password, mfaSecret) {
        checkpoint.verify();
        vault.enrollStagingCedarApprover({ password, mfaSecret });
        ledger.append({ event: "CCA_STAGING_APPROVER_ENROLLED", actor: "LOCAL_STAGING_HOST",
          target: STAGING_CEDAR_APPROVER });
        checkpoint.commit();
      } };
    }
    const server = createStagingServer({
      vault, account: ACCOUNT, auditLedger: ledger, checkpoint, stagingHost: STAGING_HOST,
      support: createDurableDemoState({ dataDir: path.join(directory, "fictional-support") }),
      sourceThrottle: createPersistentThrottle({ file: files.throttle, clock }),
    });
    return { release, server };
  } catch (error) {
    release();
    throw error;
  }
}

async function main() {
  const [directory, mode] = process.argv.slice(2);
  if (process.platform !== "win32" || !directory || !path.isAbsolute(directory) || !["enroll", "enroll-approver", "serve"].includes(mode))
    throw Error("CCA_STAGING_WINDOWS_HOST_REQUIRED");
  let input = "";
  for await (const chunk of process.stdin.setEncoding("utf8")) {
    input += chunk;
    if (input.length > 4096) throw Error("CCA_STAGING_INPUT_TOO_LARGE");
  }
  const payload = JSON.parse(input.replace(/^\uFEFF/, ""));
  const master = Buffer.from(payload.master, "base64");
  try {
    const runtime = openStaging({ directory, master, initialize: mode === "enroll",
      enrollApprover: mode === "enroll-approver" });
    if (mode !== "serve") {
      const secret = crypto.randomBytes(20);
      try {
        const password = payload.generatePassword === true
          ? crypto.randomBytes(24).toString("base64url")
          : payload.password;
        runtime.enroll(password, secret);
        console.log("Account:", mode === "enroll" ? ACCOUNT : STAGING_CEDAR_APPROVER);
        if (payload.generatePassword === true)
          console.log("Generated staging password (keep private, shown once):", password);
        const label = mode === "enroll" ? "CCA Local Staging" : "CCA Cedar Approver";
        console.log("Google Authenticator: Add a setup key, name it " + label + ", and select Time based.");
        console.log("Setup key (keep private, shown once):", base32(secret));
      } finally { secret.fill(0); runtime.release(); }
      return;
    }
    const { server, release } = runtime;
    process.on("exit", release);
    process.once("SIGINT", () => server.close(() => process.exit(0)));
    server.once("error", () => {
      console.error("CCA staging could not bind its local port.");
      process.exitCode = 1;
    });
    server.listen(PORT, STAGING_HOST, () => console.log("CCA Local Staging: http://" + STAGING_HOST + ":" + PORT + "/"));
  } finally { master.fill(0); }
}

if (require.main === module) {
  main().catch(() => {
    console.error("CCA staging startup blocked. Check enrollment, the writer lock, and the audit checkpoint.");
    process.exitCode = 1;
  });
}
module.exports = { openStaging, ACCOUNT, STAGING_HOST };
