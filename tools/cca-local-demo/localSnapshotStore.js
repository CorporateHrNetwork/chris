"use strict";

// Fictional CCA-only on-disk snapshots. No database, external accounts or API.
// Files live under user-local application data, never inside the CHRiS repo.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const VERSION = 1;
const MAX_BYTES = 2 * 1024 * 1024;
function defaultDataDir() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "CRNetwork", "CCA-Fictional-Demo");
}
function digest(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
function assertPayload(payload) {
  if (!payload || payload.version !== VERSION || payload.demonstration !== true ||
      !payload.snapshot || typeof payload.snapshot !== "object" ||
      !Array.isArray(payload.snapshot.index) ||
      !payload.snapshot.workflow || typeof payload.snapshot.workflow !== "object") {
    throw new Error("CCA_INVALID_SNAPSHOT");
  }
}
function parseEnvelope(content) {
  if (Buffer.byteLength(content) > MAX_BYTES) throw new Error("CCA_SNAPSHOT_TOO_LARGE");
  const envelope = JSON.parse(content);
  if (!envelope || envelope.version !== VERSION || !envelope.payload ||
      typeof envelope.checksum !== "string" ||
      digest(envelope.payload) !== envelope.checksum) {
    throw new Error("CCA_SNAPSHOT_CHECKSUM_MISMATCH");
  }
  assertPayload(envelope.payload);
  return envelope.payload.snapshot;
}
function makeEnvelope(snapshot) {
  const payload = { version: VERSION, demonstration: true, snapshot };
  assertPayload(payload);
  const text = JSON.stringify({ version: VERSION, payload, checksum: digest(payload) }, null, 2);
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("CCA_SNAPSHOT_TOO_LARGE");
  return text;
}
function createLocalSnapshotStore({ dataDir = defaultDataDir() } = {}) {
  const directory = path.resolve(dataDir);
  const primary = path.join(directory, "state.json");
  const backup = path.join(directory, "state.backup.json");

  function readFileChecked(filename) {
    const bytes = fs.readFileSync(filename);
    if (bytes.length > MAX_BYTES) throw new Error("CCA_SNAPSHOT_TOO_LARGE");
    return parseEnvelope(bytes.toString("utf8"));
  }
  function load() {
    if (!fs.existsSync(primary)) {
      if (fs.existsSync(backup)) throw new Error("CCA_PRIMARY_MISSING_BACKUP_EXISTS_MANUAL_RECOVERY_REQUIRED");
      return null;
    }
    // Fail closed on corruption: a backup must be explicitly restored, not
    // silently substituted (which could conceal lost transactions).
    return readFileChecked(primary);
  }
  function save(snapshot) {
    const text = makeEnvelope(snapshot);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    // Detect damage before rotating a backup.
    if (fs.existsSync(primary)) readFileChecked(primary);
    const tmp = path.join(directory, ".state-" + crypto.randomUUID() + ".tmp");
    let fd;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, text, "utf8");
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      if (fs.existsSync(primary)) fs.copyFileSync(primary, backup);
      fs.renameSync(tmp, primary);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  function inspectBackup() {
    if (!fs.existsSync(backup)) return { available: false };
    const snapshot = readFileChecked(backup);
    return { available: true, cases: snapshot.workflow.cases.length };
  }
  // Not automatically invoked. Operator must explicitly authorize recovery
  // after reviewing whether current state is damaged.
  function restoreBackup() {
    const snapshot = readFileChecked(backup);
    if (fs.existsSync(primary)) {
      const corruptPath = path.join(directory, "state.before-restore-" + Date.now() + ".json");
      fs.copyFileSync(primary, corruptPath);
    }
    saveRecovered(snapshot);
    return snapshot;
  }
  function saveRecovered(snapshot) {
    const text = makeEnvelope(snapshot);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const tmp = path.join(directory, ".restore-" + crypto.randomUUID() + ".tmp");
    let fd;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, text, "utf8"); fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(tmp, primary);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  return Object.freeze({ load, save, inspectBackup, restoreBackup, primary, backup });
}
module.exports = { createLocalSnapshotStore, defaultDataDir, parseEnvelope, makeEnvelope };
