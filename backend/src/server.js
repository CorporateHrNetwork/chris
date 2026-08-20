const path = require("path");

require("dotenv").config({
  path: path.join(
    __dirname,
    "../.env"
  ),
});

const app = require("./app");

const PORT =
  process.env.PORT || 5000;

const paystackConfigured =
  Boolean(
    String(
      process.env
        .PAYSTACK_SECRET_KEY ||
        ""
    ).trim()
  );

console.log(
  `CHRIS Paystack configured: ${
    paystackConfigured
      ? "YES"
      : "NO"
  }`
);

app.listen(PORT, () => {
  console.log(
    `CHRIS API running on http://localhost:${PORT}`
  );
});