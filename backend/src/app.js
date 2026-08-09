const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const locationRoutes = require("./routes/locationRoutes");

const app = express();

/*
============================================================
CORE MIDDLEWARE
============================================================
*/

app.use(cors());

app.use(express.json());

/*
============================================================
SECURITY / CACHE POLICY
============================================================

CHRIS contains sensitive HR information.

Authenticated API responses must not be stored in browser,
proxy or intermediary HTTP caches.

This does not replace authentication or authorization.
It complements them.
============================================================
*/

app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/")
  ) {
    res.set({
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",

      Pragma:
        "no-cache",

      Expires:
        "0",

      "Surrogate-Control":
        "no-store",
    });
  }

  next();
});

/*
============================================================
HEALTH CHECK
============================================================
*/

app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      status:
        "success",

      message:
        "CHRIS API is running",

      service:
        "CHRIS Backend",
    });
  }
);

/*
============================================================
CHRIS API ROUTES
============================================================
*/

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/employees",
  employeeRoutes
);

app.use(
  "/api/users",
  userRoutes
);

app.use(
  "/api/roles",
  roleRoutes
);

app.use(
  "/api/locations",
  locationRoutes
);

module.exports = app;