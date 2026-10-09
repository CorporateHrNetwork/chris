const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://chris-auth-test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

const { verifySupabaseAccessToken } = require("../src/services/supabaseAuth");

test("verifies a bearer token with Supabase Auth and returns the authenticated identity", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://chris-auth-test.supabase.co/auth/v1/user");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.apikey, "test-publishable-key");
    assert.equal(options.headers.Authorization, "Bearer valid-access-token");
    return new Response(JSON.stringify({
      id: "supabase-user-id",
      email: "hr@example.com",
      email_confirmed_at: "2026-01-01T00:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const user = await verifySupabaseAccessToken("valid-access-token");
    assert.equal(user.id, "supabase-user-id");
    assert.equal(user.email, "hr@example.com");
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects expired or invalid Supabase access tokens", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ message: "Invalid JWT" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
  try {
    await assert.rejects(
      verifySupabaseAccessToken("invalid-access-token"),
      (error) => error.code === "SUPABASE_TOKEN_INVALID"
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects an Auth response without a stable user ID and email", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ id: "user-without-email" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try {
    await assert.rejects(
      verifySupabaseAccessToken("malformed-identity-token"),
      (error) => error.code === "SUPABASE_TOKEN_INVALID"
    );
  } finally {
    global.fetch = originalFetch;
  }
});
