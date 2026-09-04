function normalizeOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  try {
    return new URL(text).origin;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(rawValue = process.env.CORS_ALLOWED_ORIGINS) {
  return String(rawValue || "")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isCorsOriginAllowed(
  origin,
  {
    allowedOrigins = parseAllowedOrigins(),
    nodeEnv = process.env.NODE_ENV || "development",
  } = {}
) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return true;
  if (allowedOrigins.includes(normalized)) return true;
  return nodeEnv !== "production" && isLoopbackOrigin(normalized);
}

function corsOptionsDelegate(req, callback) {
  const origin = req.headers.origin;
  const allowed = isCorsOriginAllowed(origin);

  callback(null, {
    origin: allowed,
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Cache-Control"],
    exposedHeaders: ["Content-Disposition"],
    maxAge: 600,
  });
}

function applySecurityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });

  if (process.env.NODE_ENV === "production") {
    res.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
}

module.exports = {
  normalizeOrigin,
  parseAllowedOrigins,
  isCorsOriginAllowed,
  corsOptionsDelegate,
  applySecurityHeaders,
};
