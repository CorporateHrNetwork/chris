const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requireAnyPermission } = require("../middleware/authMiddleware");
const { resolveZermattOfferTerms } = require("../services/zermattOfferEntitlementService");
const router = express.Router();
router.use(requireAuth, requireAnyPermission("employees.view", "recruitment.view"));
router.get("/:employeeNumber", async (req, res) => {
  try {
    if (req.auth.organization?.slug !== "zermatt-liquor-limited") return res.status(404).json({ status: "error", message: "Not available for this organization." });
    const employeeNumber = String(req.params.employeeNumber || "").trim().toUpperCase();
    const employee = await prisma.employee.findFirst({
      where: { organizationId: req.auth.organizationId, employeeNumber },
      select: { id: true, locationId: true },
    });
    if (!employee) return res.status(404).json({ status: "error", message: "Employee not found." });
    const assigned = (req.auth.availableLocations || []).map(x => x.id);
    if (req.auth.locationScope !== "ALL_LOCATIONS" && (!employee.locationId || !assigned.includes(employee.locationId))) {
      return res.status(403).json({ status: "error", message: "Employee is outside your assigned branch." });
    }
    if (req.auth.activeLocationId && req.auth.activeLocationId !== employee.locationId) {
      return res.status(403).json({ status: "error", message: "Select the employee's authorized branch." });
    }
    const data = await resolveZermattOfferTerms({ organizationId: req.auth.organizationId, employeeNumber, asOf: new Date() });
    return res.json({ status: "success", data });
  } catch (error) {
    console.error("Offer entitlement preview:", error);
    return res.status(422).json({ status: "error", message: "Authoritative annual leave terms could not be resolved. Verify employee level and effective CHRiS leave policy." });
  }
});
module.exports = router;
