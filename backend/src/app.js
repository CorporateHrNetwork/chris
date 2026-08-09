const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const locationRoutes = require("./routes/locationRoutes");

const app = express();

app.use(cors());
app.use(express.json());

/*
============================================================
HEALTH CHECK
============================================================
*/

app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      status: "success",

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