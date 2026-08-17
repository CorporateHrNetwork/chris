const assert =
  require("assert");

const {
  balanceAvailable,
} = require(
  "../src/services/leaveService"
);

assert.equal(
  balanceAvailable({
    openingBalance:
      20,
    accrued:
      5,
    carriedForward:
      2,
    adjusted:
      -1,
    used:
      6,
  }),
  20
);

assert.equal(
  balanceAvailable({
    openingBalance:
      10,
    accrued:
      0,
    carriedForward:
      0,
    adjusted:
      0,
    used:
      12,
  }),
  -2
);

console.log(
  "PASS: CHRIS leave operations unit tests passed."
);
