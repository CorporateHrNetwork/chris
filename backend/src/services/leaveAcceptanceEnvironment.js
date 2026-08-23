function configureIsolatedAcceptanceEnvironment(env = process.env) {
  const testUrl = String(env.TEST_DATABASE_URL || "").trim();
  const normalUrl = String(env.DATABASE_URL || "").trim();
  if (!testUrl) throw new Error("TEST_DATABASE_URL_REQUIRED");
  if (testUrl === normalUrl) throw new Error("TEST_DATABASE_MUST_DIFFER_FROM_DEVELOPMENT_DATABASE");
  env.DATABASE_URL = testUrl;
  return testUrl;
}
module.exports = { configureIsolatedAcceptanceEnvironment };
