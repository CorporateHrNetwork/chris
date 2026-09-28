const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/services/eosbService.js"), "utf8");
const functions = ["dateOnly", "utcDate", "serviceDaysBetween", "roundMoney", "calculateEosbValue"]
  .map((name) => {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `Missing EoSB function: ${name}`);
    return match[0];
  });
const context = vm.createContext({ Date, Number, Math });
vm.runInContext(`const FIXED_MONTH_DAYS = 30; const GRATUITY_FACTOR = 0.075; ${functions.join("\n")}`, context);

test("Zermatt EoSB uses Excel elapsed service days for every employee", () => {
  assert.equal(vm.runInContext('serviceDaysBetween("2025-05-06", "2026-09-21")', context), 503);
  assert.equal(vm.runInContext('serviceDaysBetween("2026-09-21", "2026-09-21")', context), 0);
  assert.equal(vm.runInContext('serviceDaysBetween("2025-05-06", "2025-05-07")', context), 1);
});

test("EoSB account amount flows from elapsed service days, not the former inclusive count", () => {
  const gross = 180000;
  const days = vm.runInContext('serviceDaysBetween("2025-05-06", "2026-09-21")', context);
  const value = vm.runInContext(`calculateEosbValue(${gross}, ${days})`, context);
  assert.equal(value, 226350);
  assert.notEqual(value, 226800);
  assert.ok(source.includes("const serviceDays = serviceDaysBetween(startDate, calculationDate)"));
  const settlement = fs.readFileSync(path.join(__dirname, "../src/services/exitSettlementService.js"), "utf8");
  assert.ok(settlement.includes("const gratuity = money(eosb?.eosb?.accruedValue || 0)"));
});
