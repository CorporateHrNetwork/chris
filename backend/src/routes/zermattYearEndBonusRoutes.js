const express = require("express");
const { requireAuth, requireAnyPermission } = require("../middleware/authMiddleware");
const { listYearEndBonus } = require("../services/zermattYearEndBonusService");
const router = express.Router();
router.use(requireAuth, requireAnyPermission("benefits.year_end_bonus.view", "payroll.manage"));
function allowedLocations(req) {
  if (req.auth?.locationScope === "ALL_LOCATIONS" && !req.auth?.activeLocationId) return null;
  const allowed = (req.auth?.availableLocations || []).map(item => item.id).filter(Boolean);
  if (req.auth?.activeLocationId) return allowed.includes(req.auth.activeLocationId) ? [req.auth.activeLocationId] : [];
  return allowed;
}
function yearParam(req) {
  const year = Number(req.query.year || new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    const error = new Error("Year must be between 2020 and 2100."); error.statusCode = 400; throw error;
  }
  return year;
}
function safeCsv(value) {
  const raw = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
async function read(req, res, exportCsv = false) {
  try {
    const scope = allowedLocations(req);
    if (scope?.length === 0) return res.status(403).json({ status: "error", message: "No assigned branch is available for this Benefits report." });
    const data = await listYearEndBonus({ organizationId: req.auth.organizationId, year: yearParam(req), locationIds: scope });
    if (!exportCsv) return res.json({ status: "success", data });
    const header = ["Employee No", "Full Name", "Branch", "Department", "Designation", "Employment Type", "Hire Date", "Exit Date", "Gross Monthly Salary", "End of Month Gross", "Basic Salary", "Months Worked", "Full Year Bonus", "Prorated Bonus", "Eligibility"];
    const rows = data.rows.map(r => [r.employeeNumber, r.employeeName, r.location, r.department, r.designation, r.employmentType, r.hireDate, r.exitDate, r.grossMonthly, r.endMonthGross, r.basicSalary, r.months, r.fullBonus, r.bonus, r.status]);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="Zermatt-Year-End-Bonus-${data.year}.csv"`);
    return res.status(200).send("\uFEFF" + [header, ...rows].map(row => row.map(safeCsv).join(",")).join("\r\n"));
  } catch (error) {
    console.error("Zermatt Year-End Bonus error:", error);
    return res.status(error.statusCode || 500).json({ status: "error", message: error.statusCode ? error.message : "Unable to load Year-End Bonus register." });
  }
}
router.get("/", (req, res) => read(req, res));
router.get("/export.csv", (req, res) => read(req, res, true));
module.exports = router;
