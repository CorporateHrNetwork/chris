const { configureIsolatedAcceptanceEnvironment } = require("../src/services/leaveAcceptanceEnvironment");
configureIsolatedAcceptanceEnvironment();
console.log("CHRIS leave runtime acceptance is restricted to TEST_DATABASE_URL.");
console.log("Run lifecycle acceptance only after the isolated test database has been migrated and seeded.");
