const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("CHRiS provides a non-blank startup recovery shell", () => {
  const html = read("index.html");
  for (const expected of [
    "Starting CHRiS",
    "chris_boot_recovery_attempted",
    "__CHRIS_RETRY_BOOT__",
    "__CHRIS_MARK_BOOT_COMPLETE__",
    "__chris_boot",
    "__chris_fresh",
    "caches.delete",
    "serviceWorker.getRegistrations",
    "Open Fresh CHRiS",
  ]) assert.ok(html.includes(expected), `Missing boot recovery control: ${expected}`);
});

test("React root is protected by a global error boundary", () => {
  const main = read("src/main.jsx");
  const boundary = read("src/components/system/AppErrorBoundary.jsx");
  assert.ok(main.includes("<AppErrorBoundary>"));
  assert.ok(boundary.includes("getDerivedStateFromError"));
  assert.ok(boundary.includes("CHRiS could not open this screen"));
  assert.ok(boundary.includes("__CHRIS_MARK_BOOT_COMPLETE__"));
});
