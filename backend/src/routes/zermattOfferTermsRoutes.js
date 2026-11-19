const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requireAnyPermission } = require("../middleware/authMiddleware");
const { resolveZermattOfferTerms } = require("../services/zermattOfferEntitlementService");
const router = express.Router();
router.use(requireAuth, requireAnyPermission("employees.view", "recruitment.view"));
// Search by the employee's name, not by manually entering an employee number.
// Each name token must match one of the employee's name fields. Location
// restrictions apply at the database query, before results are returned.
router.get("/search", async (req, res) => {
  try {
    if (req.auth.organization?.slug !== "zermatt-liquor-limited") {
      return res.status(404).json({ status: "error", message: "Not available for this organization." });
    }
    const query = String(req.query.name || "").trim().replace(/\\s+/g, " ");
    if (query.length < 2 || query.length > 100) {
      return res.status(400).json({ status: "error", message: "Enter at least two letters of an employee name (maximum 100 characters)." });
    }
    const assignedLocations = (req.auth.availableLocations || []).map(row => row.id).filter(Boolean);
    const locationFilter = req.auth.activeLocationId
      ? { locationId: req.auth.activeLocationId }
      : req.auth.locationScope === "ALL_LOCATIONS" ? {} : { locationId: { in: assignedLocations } };
    if (req.auth.locationScope !== "ALL_LOCATIONS" && !assignedLocations.length) {
      return res.json({ status: "success", data: [] });
    }
    const tokens = query.split(" ").slice(0, 8);
    const employees = await prisma.employee.findMany({
      where: {
        organizationId: req.auth.organizationId,
        ...locationFilter,
        AND: tokens.map(token => ({
          OR: [
            { firstName: { contains: token, mode: "insensitive" } },
            { middleName: { contains: token, mode: "insensitive" } },
            { lastName: { contains: token, mode: "insensitive" } },
          ],
        })),
      },
      select: {
        employeeNumber: true, firstName: true, middleName: true, lastName: true,
        location: { select: { name: true } },
        designation: { select: { name: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 25,
    });
    return res.json({
      status: "success",
      data: employees.map(employee => ({
        employeeNumber: employee.employeeNumber,
        employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
        branch: employee.location?.name || "",
        designation: employee.designation?.name || "",
      })),
    });
  } catch (error) {
    console.error("Offer employee name search:", error);
    return res.status(500).json({ status: "error", message: "Unable to search employee names." });
  }
});
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
