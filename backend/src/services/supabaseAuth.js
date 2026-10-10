const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";

async function verifySupabaseAccessToken(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const error = new Error("Supabase Auth is not configured on the CHRIS backend.");
    error.code = "SUPABASE_AUTH_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const error = new Error("Supabase access token is invalid or expired.");
    error.code = "SUPABASE_TOKEN_INVALID";
    throw error;
  }
  const user = await response.json();
  if (!user?.id || !user?.email) {
    const error = new Error("Supabase did not return a verified user identity.");
    error.code = "SUPABASE_TOKEN_INVALID";
    throw error;
  }
  return user;
}

module.exports = { verifySupabaseAccessToken };
