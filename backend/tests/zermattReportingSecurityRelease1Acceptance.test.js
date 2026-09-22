const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  isCorsOriginAllowed,
  applySecurityHeaders,
} = require("../src/middleware/securityMiddleware");

const root = path.resolve(__dirname, "../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("ZERMATT R1 reporting and security release gate", () => {
  assert.equal(
    isCorsOriginAllowed("https://evil.example", {
      allowedOrigins: ["https://hr.zermatt.example"],
      nodeEnv: "production",
    }),
    false
  );
  assert.equal(
    isCorsOriginAllowed("https://hr.zermatt.example", {
      allowedOrigins: ["https://hr.zermatt.example"],
      nodeEnv: "production",
    }),
    true
  );
  assert.equal(
    isCorsOriginAllowed("http://localhost:5173", {
      allowedOrigins: [],
      nodeEnv: "development",
    }),
    true
  );

  const headers = {};
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  applySecurityHeaders(
    {},
    {
      set(nameOrObject, value) {
        if (typeof nameOrObject === "string") {
          headers[nameOrObject] = value;
        } else {
          Object.assign(headers, nameOrObject);
        }
      },
    },
    () => {}
  );
  process.env.NODE_ENV = previousNodeEnv;

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);

  const app = read("backend/src/app.js");
  const auth = read("backend/src/routes/authRoutes.js");
  const reportRoutes = read("backend/src/routes/employeeReportRoutes.js");
  const api = read("src/services/api.js");
  const login = read("src/pages/Login.jsx");
  const reset = read("src/pages/ResetPassword.jsx");
  const reports = read("src/pages/Reports.jsx");
  const frontendApp = read("src/App.jsx");

  assert.match(app, /app\.disable\("x-powered-by"\)/);
  assert.match(app, /cors\(corsOptionsDelegate\)/);
  assert.doesNotMatch(app, /app\.use\(cors\(\)\)/);

  assert.match(
    auth,
    /process\.env\.NODE_ENV[\s\S]{0,120}!==[\s\S]{0,40}"production"[\s\S]{0,220}resetToken:\s*rawToken/
  );

  assert.match(api, /import\.meta\.env\.VITE_API_BASE_URL/);
  assert.match(login, /API_BASE_URL/);
  assert.match(reset, /API_BASE_URL/);
  assert.doesNotMatch(login, /http:\/\/localhost:5000\/api\/auth/);
  assert.doesNotMatch(reset, /http:\/\/localhost:5000\/api\/auth/);

  assert.match(
    reportRoutes,
    /requirePermission\([\s\S]*?"employees\.view"[\s\S]*?"reports\.view"[\s\S]*?\)/
  );
  assert.match(frontendApp, /permission="reports\.view"/);

  assert.match(reports, /apiDownload/);
  assert.match(reports, /employee-reports\/workforce\?format=csv/);
  assert.match(reports, /navigate\("\/attendance"\)/);
  assert.match(reports, /navigate\("\/leave"\)/);
  assert.match(reports, /navigate\("\/employees\/export-queue"\)/);
});
