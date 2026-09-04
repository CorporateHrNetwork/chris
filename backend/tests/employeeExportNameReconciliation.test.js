const assert = require("node:assert/strict");

const {
  composeExportEmployeeName,
} = require("../src/services/employeeDataOperationsService");

assert.equal(
  composeExportEmployeeName(
    { firstName: "Sule", middleName: "Smart", lastName: "Ajayi" },
    {}
  ),
  "Sule Smart Ajayi",
  "Distinct first, middle and last names must be preserved."
);

assert.equal(
  composeExportEmployeeName(
    { firstName: "John", middleName: "Odey", lastName: "Odey" },
    {}
  ),
  "John Odey",
  "Repeated adjacent name parts must not be duplicated in Employee Name."
);

assert.equal(
  composeExportEmployeeName(
    { firstName: "Sunday", middleName: null, lastName: "Odiamehi" },
    {}
  ),
  "Sunday Odiamehi",
  "Blank middle names must remain clean."
);

assert.equal(
  composeExportEmployeeName(
    { firstName: "Nelson", middleName: "Adone", lastName: "Yehu" },
    { fullName: "Nelson Adone Yehu" }
  ),
  "Nelson Adone Yehu",
  "Authoritative onboarding fullName should be preferred when present."
);

assert.equal(
  composeExportEmployeeName(
    { firstName: "John", middleName: "Odey", lastName: "Odey" },
    { fullName: "John Odey Odey" }
  ),
  "John Odey",
  "An authoritative fullName is still normalized against adjacent duplication."
);

console.log("PASS: CHRiS employee export name reconciliation tests passed.");
