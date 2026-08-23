const assert = require("node:assert/strict");
const { configureIsolatedAcceptanceEnvironment } = require("../src/services/leaveAcceptanceEnvironment");
assert.throws(() => configureIsolatedAcceptanceEnvironment({ DATABASE_URL: "development" }), /TEST_DATABASE_URL_REQUIRED/);
assert.throws(() => configureIsolatedAcceptanceEnvironment({ DATABASE_URL: "same", TEST_DATABASE_URL: "same" }), /MUST_DIFFER/);
const env = { DATABASE_URL: "development", TEST_DATABASE_URL: "isolated-test" };
assert.equal(configureIsolatedAcceptanceEnvironment(env), "isolated-test");
assert.equal(env.DATABASE_URL, "isolated-test");
console.log("PASS: leave acceptance isolation tests passed.");
