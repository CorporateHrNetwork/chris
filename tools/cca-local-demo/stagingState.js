"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function readOptional(file, maxBytes = 1024 * 1024) {
  let fd;
  try { fd = fs.openSync(file, "r"); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw Error("CCA_STAGING_INVALID_FILE");
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}

function replaceFile(file, contents) {
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function deriveKey(master, purpose) {
  if (!Buffer.isBuffer(master) || master.length !== 32) throw Error("CCA_STAGING_KEY_REQUIRED");
  return Buffer.from(crypto.hkdfSync("sha256", master, "", "cca-local-staging/" + purpose, 32));
}

function createCheckpoint({ file, files, key, initialize = false }) {
  const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, filename]) => {
    const bytes = readOptional(filename);
    return [name, bytes === null ? null : crypto.createHash("sha256").update(bytes).digest("hex")];
  })));
  const sign = state => crypto.createHmac("sha256", key).update(state).digest("hex");
  function encode(state) {
    return Buffer.from(JSON.stringify({ state, mac: sign(state) }));
  }
  let expected = readOptional(file, 4096);
  const current = snapshot();
  if (initialize) {
    if (expected || Object.values(JSON.parse(current)).some(value => value !== null))
      throw Error("CCA_STAGING_ALREADY_INITIALIZED");
    expected = encode(current);
    replaceFile(file, expected);
  }
  function verify() {
    if (!expected || !expected.equals(readOptional(file, 4096) || Buffer.alloc(0)) ||
        !expected.equals(encode(snapshot()))) throw Error("CCA_STAGING_CHECKPOINT_MISMATCH");
  }
  verify();
  return Object.freeze({
    verify,
    commit() {
      if (!expected.equals(readOptional(file, 4096) || Buffer.alloc(0)))
        throw Error("CCA_STAGING_CHECKPOINT_MISMATCH");
      const next = encode(snapshot());
      if (!expected.equals(next)) replaceFile(file, next);
      expected = next;
    },
  });
}

function createPersistentThrottle({ file, clock = () => Math.floor(Date.now() / 1000),
  windowSeconds = 300, maxAttempts = 10, maxSources = 64 }) {
  const saved = readOptional(file, 65536);
  const rows = saved ? JSON.parse(saved) : [];
  if (!Array.isArray(rows) || rows.length > maxSources) throw Error("CCA_STAGING_THROTTLE_INVALID");
  const buckets = new Map(rows);
  if (buckets.size !== rows.length || rows.some(([id, row]) =>
    !/^[a-f0-9]{64}:(password|mfa)$/.test(id) ||
    !Number.isSafeInteger(row?.count) || row.count < 1 || row.count > maxAttempts ||
    !Number.isSafeInteger(row.resetAt))) throw Error("CCA_STAGING_THROTTLE_INVALID");

  return Object.freeze({
    reserve(peer, route) {
      if (!/^(?:::ffff:)?127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(peer) || !["password", "mfa"].includes(route))
        throw Error("CCA_STAGING_TRUSTED_PEER_REQUIRED");
      const id = crypto.createHash("sha256").update("127.0.0.1").digest("hex") + ":" + route;
      const now = clock();
      for (const [bucket, row] of buckets) {
        if (row.resetAt <= now) buckets.delete(bucket);
      }
      let row = buckets.get(id);
      if (row?.count >= maxAttempts || (!row && buckets.size >= maxSources))
        return { allowed: false, retryAfterSeconds: Math.max(1, (row?.resetAt ?? now + windowSeconds) - now) };
      if (!row) {
        row = { count: 0, resetAt: now + windowSeconds };
        buckets.set(id, row);
      }
      row.count++;
      replaceFile(file, JSON.stringify([...buckets]));
      return { allowed: true };
    },
  });
}

module.exports = { createCheckpoint, createPersistentThrottle, deriveKey };
