const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const employeeRoutes = require("./routes/employeeRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "CHRIS API is running",
    service: "CHRIS Backend",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);

module.exports = app;