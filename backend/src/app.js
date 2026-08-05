const express = require("express");
const cors = require("cors");

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

module.exports = app;