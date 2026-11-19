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
    const query = String(req.query.name || "").trim().replace(/\s+/g, " ");
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
function scopedLocationWhere(req) {
  const assigned = (req.auth.availableLocations || []).map(row => row.id).filter(Boolean);
  if (req.auth.activeLocationId) return { locationId: req.auth.activeLocationId };
  return req.auth.locationScope === "ALL_LOCATIONS" ? {} : { locationId: { in: assigned } };
}
function validOfferDate(value) {
  const date = String(value || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) || new Date(date + "T00:00:00.000Z").toISOString().slice(0,10) !== date) {
    const err = new Error("A valid offer letter date in YYYY-MM-DD format is required.");
    err.statusCode = 400; throw err;
  }
  return date;
}
// Type-to-search a reporting manager by name. Selection stores the employee ID;
// the manager's name and title are copied into the draft, not freely guessed.
router.get("/managers/search", async (req,res) => {
  try {
    if (req.auth.organization?.slug !== "zermatt-liquor-limited") return res.status(404).json({ status:"error",message:"Not available for this organization." });
    const query=String(req.query.name || "").trim().replace(/\s+/g, " ");
    if (query.length < 2 || query.length > 100) return res.status(400).json({ status:"error",message:"Enter at least two letters of the reporting manager's name." });
    const tokens=query.split(" ").slice(0,8);
    const records=await prisma.employee.findMany({
      where: {
        organizationId:req.auth.organizationId,
        ...scopedLocationWhere(req),
        status: { in: ["ACTIVE","PROBATION","LEAVE","SUSPENDED"] },
        AND: tokens.map(token=>({ OR: [
          {firstName:{contains:token,mode:"insensitive"}},
          {middleName:{contains:token,mode:"insensitive"}},
          {lastName:{contains:token,mode:"insensitive"}}
        ]}))
      },
      select: {id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,
        designation:{select:{name:true}}, location:{select:{name:true}}},
      orderBy:[{firstName:"asc"},{lastName:"asc"}],take:25
    });
    return res.json({status:"success",data:records.map(row=>({
      id:row.id,employeeNumber:row.employeeNumber,
      name:[row.firstName,row.middleName,row.lastName].filter(Boolean).join(" "),
      designation:row.designation?.name||"",branch:row.location?.name||""
    }))});
  } catch(error){ console.error("Offer reporting-manager search:",error);return res.status(500).json({status:"error",message:"Unable to search reporting managers."}); }
});
router.post("/reference", async(req,res)=>{
  try {
    if(req.auth.organization?.slug!=="zermatt-liquor-limited") return res.status(404).json({status:"error",message:"Not available for this organization."});
    const employeeNumber=String(req.body?.employeeNumber||"").trim().toUpperCase();
    const letterDate=validOfferDate(req.body?.letterDate);
    const employee=await prisma.employee.findFirst({
      where:{organizationId:req.auth.organizationId,employeeNumber,...scopedLocationWhere(req)},
      select:{id:true,location:{select:{code:true,name:true}}}
    });
    if(!employee) return res.status(404).json({status:"error",message:"Employee not found in your authorized branch."});
    const code=String(employee.location?.code||employee.location?.name||"BR").toUpperCase().replace(/[^A-Z]/g,"").slice(0,2)||"BR";
    const month=letterDate.slice(5,7), year=letterDate.slice(2,4);
    const prefix=`ZLL/${code}/${month}/${year}`;
    // PostgreSQL unique constraint prevents two concurrent requests from using
    // different references for the same employee and letter date.
    const rows=await prisma.$queryRawUnsafe(
      `INSERT INTO public.zermatt_offer_references
        ("organizationId","employeeId","letterDate",reference,"createdByUserId")
       VALUES ($1,$2,$3::date,$4 || '/' || LPAD(nextval('public.zermatt_offer_reference_seq')::text,6,'0'),$5)
       ON CONFLICT ("organizationId","employeeId","letterDate")
       DO UPDATE SET reference = zermatt_offer_references.reference
       RETURNING reference`,
      req.auth.organizationId,employee.id,letterDate,prefix,req.auth.userId
    );
    return res.json({status:"success",data:{reference:rows[0].reference,employeeNumber,letterDate,status:"DRAFT"}});
  } catch(error) {
    console.error("Offer reference generator:",error);
    return res.status(error.statusCode||500).json({status:"error",message:error.statusCode?error.message:"Unable to generate offer reference."});
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
