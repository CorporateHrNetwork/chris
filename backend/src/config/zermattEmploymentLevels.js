const ZERMATT_EMPLOYMENT_LEVELS = [
  { levelNumber: 1, code: "L1", name: "Entry / Support", description: "Entry-level operational support roles working under direct supervision." },
  { levelNumber: 2, code: "L2", name: "Operational / Junior Staff", description: "Junior operational, service, security, technical and support roles." },
  { levelNumber: 3, code: "L3", name: "Senior Support / Assistant", description: "Experienced support roles, assistants and senior operational contributors." },
  { levelNumber: 4, code: "L4", name: "Team Leader", description: "Front-line team leaders coordinating defined work groups or shifts." },
  { levelNumber: 5, code: "L5", name: "Supervisor", description: "Supervisors with direct responsibility for day-to-day team or floor oversight." },
  { levelNumber: 6, code: "L6", name: "Officer / Professional", description: "Officers, professionals and technical individual contributors accountable for defined workstreams." },
  { levelNumber: 7, code: "L7", name: "Senior Officer / Specialist", description: "Senior officers, specialists and senior professional individual contributors with substantial responsibility." },
  { levelNumber: 8, code: "L8", name: "Assistant Manager", description: "Assistant managers supporting management of a branch, floor, unit or function." },
  { levelNumber: 9, code: "L9", name: "Manager", description: "Managers accountable for a branch, unit, function or significant operational area." },
  { levelNumber: 10, code: "L10", name: "Head / Senior Management", description: "Heads of function and senior management roles immediately below executive management." },
  { levelNumber: 11, code: "L11", name: "Executive Management", description: "Managing Director, General Manager and equivalent highest organizational leadership roles." },
].map((level) => ({ ...level, displayOrder: level.levelNumber, isActive: true }));

/*
 * Authoritative ZERMATT Designation -> Employment Level base catalogue.
 *
 * Source: ZERMATT CHRiS workforce migration reference data. Employment Level
 * is designation-driven; employees must never be graded independently of their
 * selected tenant-owned designation.
 *
 * Keep this 117-row base catalogue intact. Later validated ZERMATT-specific
 * structure changes are registered separately below as tenant extensions.
 */
const ZERMATT_BASE_DESIGNATION_LEVELS = [
  { name: "Managing Director", code: "EXEC-MD", careerTrack: "EXECUTIVE_MANAGEMENT", levelNumber: 11 },
  { name: "General Manager", code: "EXEC-GM", careerTrack: "EXECUTIVE_MANAGEMENT", levelNumber: 11 },
  { name: "Deputy General Manager", code: "EXEC-DGM", careerTrack: "EXECUTIVE_MANAGEMENT", levelNumber: 10 },
  { name: "Executive Assistant", code: "EXEC-EA", careerTrack: "EXECUTIVE_SUPPORT", levelNumber: 7 },
  { name: "Company Secretary", code: "EXEC-CS", careerTrack: "CORPORATE_GOVERNANCE", levelNumber: 9 },
  { name: "Head of HR & Admin", code: "HRA-HOD", careerTrack: "HUMAN_RESOURCES", levelNumber: 10 },
  { name: "HR & Admin Manager", code: "HRA-MGR", careerTrack: "HUMAN_RESOURCES", levelNumber: 9 },
  { name: "Senior HR & Admin Officer", code: "HRA-SRO", careerTrack: "HUMAN_RESOURCES", levelNumber: 7 },
  { name: "HR & Admin Officer", code: "HRA-OFF", careerTrack: "HUMAN_RESOURCES", levelNumber: 6 },
  { name: "HR & Admin Assistant", code: "HRA-AST", careerTrack: "HUMAN_RESOURCES", levelNumber: 3 },
  { name: "Payroll & Benefits Officer", code: "HRA-PBO", careerTrack: "HUMAN_RESOURCES_SPECIALIST", levelNumber: 7 },
  { name: "Learning & Development Officer", code: "HRA-LDO", careerTrack: "HUMAN_RESOURCES_SPECIALIST", levelNumber: 7 },
  { name: "Employee Relations Officer", code: "HRA-ERO", careerTrack: "HUMAN_RESOURCES_SPECIALIST", levelNumber: 7 },
  { name: "Recruitment & Onboarding Officer", code: "HRA-ROO", careerTrack: "HUMAN_RESOURCES_SPECIALIST", levelNumber: 7 },
  { name: "Chief Accountant", code: "FIN-CA", careerTrack: "FINANCE", levelNumber: 10 },
  { name: "Senior Accountant", code: "FIN-SA", careerTrack: "FINANCE", levelNumber: 7 },
  { name: "Branch Accountant", code: "FIN-BA", careerTrack: "FINANCE", levelNumber: 7 },
  { name: "Accountant", code: "FIN-ACC", careerTrack: "FINANCE", levelNumber: 6 },
  { name: "Accounts Officer", code: "FIN-AO", careerTrack: "FINANCE", levelNumber: 6 },
  { name: "Accounts Assistant", code: "FIN-AA", careerTrack: "FINANCE", levelNumber: 3 },
  { name: "Cash Officer", code: "FIN-CO", careerTrack: "FINANCE", levelNumber: 6 },
  { name: "Head of Audit & Internal Control", code: "AIC-HOD", careerTrack: "AUDIT_INTERNAL_CONTROL", levelNumber: 10 },
  { name: "Internal Control Manager", code: "AIC-MGR", careerTrack: "AUDIT_INTERNAL_CONTROL", levelNumber: 9 },
  { name: "Senior Internal Auditor", code: "AIC-SIA", careerTrack: "AUDIT_INTERNAL_CONTROL", levelNumber: 7 },
  { name: "Internal Auditor", code: "AIC-IA", careerTrack: "AUDIT_INTERNAL_CONTROL", levelNumber: 6 },
  { name: "Internal Control Officer", code: "AIC-ICO", careerTrack: "AUDIT_INTERNAL_CONTROL", levelNumber: 6 },
  { name: "Audit Assistant", code: "AIC-AA", careerTrack: "AUDIT_INTERNAL_CONTROL", levelNumber: 3 },
  { name: "Beer Barn Branch Operations Manager", code: "BBO-BOM", careerTrack: "BEER_BARN_OPERATIONS", levelNumber: 9 },
  { name: "Beer Barn Assistant Branch Operations Manager", code: "BBO-ABOM", careerTrack: "BEER_BARN_OPERATIONS", levelNumber: 8 },
  { name: "Beer Barn Floor Operations Manager", code: "BBO-FOM", careerTrack: "BEER_BARN_OPERATIONS", levelNumber: 9 },
  { name: "Beer Barn Assistant Floor Operations Manager", code: "BBO-AFOM", careerTrack: "BEER_BARN_OPERATIONS", levelNumber: 8 },
  { name: "Beer Barn Floor Operations Supervisor", code: "BBO-FOS", careerTrack: "BEER_BARN_OPERATIONS", levelNumber: 5 },
  { name: "Bar Team Leader", code: "BBO-BTL", careerTrack: "BEER_BARN_BAR", levelNumber: 4 },
  { name: "Assistant Bar Team Leader", code: "BBO-ABTL", careerTrack: "BEER_BARN_BAR", levelNumber: 3 },
  { name: "Bartender", code: "BBO-BTD", careerTrack: "BEER_BARN_BAR", levelNumber: 2 },
  { name: "Bar Attendant", code: "BBO-BAR", careerTrack: "BEER_BARN_BAR", levelNumber: 2 },
  { name: "Kitchen Team Leader / Head Chef", code: "BBO-HC", careerTrack: "BEER_BARN_KITCHEN", levelNumber: 4 },
  { name: "Assistant Kitchen Team Leader / Sous Chef", code: "BBO-SC", careerTrack: "BEER_BARN_KITCHEN", levelNumber: 3 },
  { name: "Cook / Chef", code: "BBO-CHF", careerTrack: "BEER_BARN_KITCHEN", levelNumber: 2 },
  { name: "Kitchen Attendant", code: "BBO-KA", careerTrack: "BEER_BARN_KITCHEN", levelNumber: 1 },
  { name: "Senior Service Attendant", code: "BBO-SSA", careerTrack: "BEER_BARN_SERVICE", levelNumber: 3 },
  { name: "Waiter", code: "BBO-WTR", careerTrack: "BEER_BARN_SERVICE", levelNumber: 2 },
  { name: "Waitress", code: "BBO-WTS", careerTrack: "BEER_BARN_SERVICE", levelNumber: 2 },
  { name: "Host / Hostess", code: "BBO-HOST", careerTrack: "BEER_BARN_SERVICE", levelNumber: 2 },
  { name: "Bottle Service Attendant", code: "BBO-BSA", careerTrack: "BEER_BARN_SERVICE", levelNumber: 2 },
  { name: "Shisha Attendant", code: "BBO-SHA", careerTrack: "BEER_BARN_SERVICE", levelNumber: 2 },
  { name: "Pool Attendant", code: "BBO-PA", careerTrack: "BEER_BARN_SERVICE", levelNumber: 2 },
  { name: "Beer Barn Cashier", code: "BBO-CAS", careerTrack: "BEER_BARN_CASH", levelNumber: 2 },
  { name: "BB Takeaway Team Leader", code: "BBO-TL", careerTrack: "BB_TAKEAWAY", levelNumber: 4 },
  { name: "Assistant BB Takeaway Team Leader", code: "BBO-ATL", careerTrack: "BB_TAKEAWAY", levelNumber: 3 },
  { name: "BB Takeaway Attendant", code: "BBO-TA", careerTrack: "BB_TAKEAWAY", levelNumber: 2 },
  { name: "BB Takeaway Shredder", code: "BBO-TS", careerTrack: "BB_TAKEAWAY", levelNumber: 2 },
  { name: "BB Takeaway Cashier", code: "BBO-TC", careerTrack: "BB_TAKEAWAY", levelNumber: 2 },
  { name: "Zermatt Branch Operations Manager", code: "ZOP-BOM", careerTrack: "ZERMATT_OPERATIONS", levelNumber: 9 },
  { name: "Zermatt Assistant Branch Operations Manager", code: "ZOP-ABOM", careerTrack: "ZERMATT_OPERATIONS", levelNumber: 8 },
  { name: "Zermatt Floor Operations Manager", code: "ZOP-FOM", careerTrack: "ZERMATT_OPERATIONS", levelNumber: 9 },
  { name: "Zermatt Assistant Floor Operations Manager", code: "ZOP-AFOM", careerTrack: "ZERMATT_OPERATIONS", levelNumber: 8 },
  { name: "Zermatt Floor Operations Supervisor", code: "ZOP-FOS", careerTrack: "ZERMATT_OPERATIONS", levelNumber: 5 },
  { name: "Senior Sales Representative", code: "ZOP-SSR", careerTrack: "ZERMATT_SALES", levelNumber: 7 },
  { name: "Sales Representative", code: "ZOP-SR", careerTrack: "ZERMATT_SALES", levelNumber: 6 },
  { name: "Shop Attendant", code: "ZOP-SA", careerTrack: "ZERMATT_SALES", levelNumber: 2 },
  { name: "Zermatt Cashier", code: "ZOP-CAS", careerTrack: "ZERMATT_SALES", levelNumber: 2 },
  { name: "Procurement Manager", code: "PROC-MGR", careerTrack: "SUPPLY_CHAIN", levelNumber: 9 },
  { name: "Senior Procurement Officer", code: "PROC-SRO", careerTrack: "SUPPLY_CHAIN", levelNumber: 7 },
  { name: "Procurement Officer", code: "PROC-OFF", careerTrack: "SUPPLY_CHAIN", levelNumber: 6 },
  { name: "Purchasing Officer", code: "PROC-PO", careerTrack: "SUPPLY_CHAIN", levelNumber: 6 },
  { name: "Procurement Assistant", code: "PROC-AST", careerTrack: "SUPPLY_CHAIN", levelNumber: 3 },
  { name: "Warehouse & Stores Manager", code: "WHSE-MGR", careerTrack: "SUPPLY_CHAIN", levelNumber: 9 },
  { name: "Warehouse Supervisor", code: "WHSE-SUP", careerTrack: "SUPPLY_CHAIN", levelNumber: 5 },
  { name: "Inventory Control Officer", code: "WHSE-ICO", careerTrack: "SUPPLY_CHAIN", levelNumber: 6 },
  { name: "Warehouse Officer", code: "WHSE-OFF", careerTrack: "SUPPLY_CHAIN", levelNumber: 6 },
  { name: "Storekeeper", code: "WHSE-SK", careerTrack: "SUPPLY_CHAIN", levelNumber: 3 },
  { name: "Assistant Storekeeper", code: "WHSE-ASK", careerTrack: "SUPPLY_CHAIN", levelNumber: 2 },
  { name: "Warehouse Assistant", code: "WHSE-AST", careerTrack: "SUPPLY_CHAIN", levelNumber: 2 },
  { name: "Loader / Warehouse Operative", code: "WHSE-LOAD", careerTrack: "SUPPLY_CHAIN", levelNumber: 1 },
  { name: "Transport & Logistics Manager", code: "LOG-MGR", careerTrack: "SUPPLY_CHAIN", levelNumber: 9 },
  { name: "Transport Supervisor", code: "LOG-SUP", careerTrack: "SUPPLY_CHAIN", levelNumber: 5 },
  { name: "Fleet Officer", code: "LOG-FO", careerTrack: "SUPPLY_CHAIN", levelNumber: 6 },
  { name: "Logistics Officer", code: "LOG-LO", careerTrack: "SUPPLY_CHAIN", levelNumber: 6 },
  { name: "Dispatch / Logistics Officer", code: "LOG-DLO", careerTrack: "SUPPLY_CHAIN", levelNumber: 6 },
  { name: "Senior Driver", code: "LOG-SD", careerTrack: "SUPPLY_CHAIN", levelNumber: 3 },
  { name: "Driver", code: "LOG-DRV", careerTrack: "SUPPLY_CHAIN", levelNumber: 2 },
  { name: "Motor Boy / Driver Assistant", code: "LOG-MB", careerTrack: "SUPPLY_CHAIN", levelNumber: 1 },
  { name: "Head of Security", code: "SEC-HOD", careerTrack: "SECURITY", levelNumber: 10 },
  { name: "Security Supervisor", code: "SEC-SUP", careerTrack: "SECURITY", levelNumber: 5 },
  { name: "Senior Security Officer", code: "SEC-SSO", careerTrack: "SECURITY", levelNumber: 3 },
  { name: "Security Officer", code: "SEC-SO", careerTrack: "SECURITY", levelNumber: 2 },
  { name: "Security Guard", code: "SEC-SG", careerTrack: "SECURITY", levelNumber: 1 },
  { name: "CCTV / Surveillance Officer", code: "SEC-CCTV", careerTrack: "SECURITY", levelNumber: 6 },
  { name: "Chief Bouncer / Security Team Leader", code: "SEC-CB", careerTrack: "SECURITY_CROWD_CONTROL", levelNumber: 4 },
  { name: "Bouncer", code: "SEC-BOU", careerTrack: "SECURITY_CROWD_CONTROL", levelNumber: 2 },
  { name: "Traffic Marshal Team Leader", code: "SEC-TMTL", careerTrack: "SECURITY_TRAFFIC_CONTROL", levelNumber: 4 },
  { name: "Traffic Marshal", code: "SEC-TM", careerTrack: "SECURITY_TRAFFIC_CONTROL", levelNumber: 2 },
  { name: "Housekeeping Team Leader", code: "HKF-HTL", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 4 },
  { name: "Assistant Housekeeping Supervisor", code: "HKF-AHS", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 3 },
  { name: "Senior Housekeeper", code: "HKF-SH", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 3 },
  { name: "Housekeeper", code: "HKF-HK", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 2 },
  { name: "Cleaner", code: "HKF-CLN", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 1 },
  { name: "Facilities / Maintenance Officer", code: "HKF-FMO", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 6 },
  { name: "Maintenance Technician", code: "HKF-MT", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 2 },
  { name: "Domestic Staff - Housekeeper", code: "HKF-DSH", careerTrack: "DOMESTIC_SUPPORT", levelNumber: 1 },
  { name: "Entertainment Manager / Coordinator", code: "ENT-MGR", careerTrack: "ENTERTAINMENT", levelNumber: 9 },
  { name: "Senior DJ", code: "ENT-SDJ", careerTrack: "ENTERTAINMENT_DJ", levelNumber: 7 },
  { name: "Intermediate DJ", code: "ENT-IDJ", careerTrack: "ENTERTAINMENT_DJ", levelNumber: 3 },
  { name: "Junior DJ", code: "ENT-JDJ", careerTrack: "ENTERTAINMENT_DJ", levelNumber: 2 },
  { name: "Hype Man / MC", code: "ENT-MC", careerTrack: "ENTERTAINMENT", levelNumber: 3 },
  { name: "Drummer", code: "ENT-DRM", careerTrack: "ENTERTAINMENT", levelNumber: 2 },
  { name: "Sound Engineer", code: "ENT-SE", careerTrack: "ENTERTAINMENT_TECH", levelNumber: 6 },
  { name: "AV / Sound Technician", code: "ENT-AV", careerTrack: "ENTERTAINMENT_TECH", levelNumber: 3 },
  { name: "Dancer", code: "ENT-DAN", careerTrack: "ENTERTAINMENT", levelNumber: 2 },
  { name: "ICT Manager / Head of ICT", code: "ICT-HOD", careerTrack: "ICT", levelNumber: 10 },
  { name: "Systems Administrator", code: "ICT-SA", careerTrack: "ICT", levelNumber: 7 },
  { name: "Network Administrator", code: "ICT-NA", careerTrack: "ICT", levelNumber: 7 },
  { name: "ICT Officer", code: "ICT-OFF", careerTrack: "ICT", levelNumber: 6 },
  { name: "IT Support Officer", code: "ICT-SUP", careerTrack: "ICT", levelNumber: 6 },
  { name: "ICT Assistant", code: "ICT-AST", careerTrack: "ICT", levelNumber: 3 },
  { name: "Personal Assistant / Executive Secretary", code: "EXEC-PAES", careerTrack: "EXECUTIVE_SUPPORT", levelNumber: 7 },
];

/*
 * Validated ZERMATT tenant extensions introduced by the approved reserved8
 * employment/cost-centre structure deployment. Their exact names/codes and
 * employee assignments are evidenced in the reserved8 policy/apply outputs.
 * They remain separate from the original 117-row workforce migration catalogue.
 */
const ZERMATT_VALIDATED_DESIGNATION_EXTENSIONS = [
  { name: "Inventory Systems & Stock Control Officer", code: "PROC-ISSC", careerTrack: "SUPPLY_CHAIN", levelNumber: 6, source: "ZERMATT_RESERVED8" },
  { name: "Procurement Cost Control Officer", code: "PROC-CCO", careerTrack: "SUPPLY_CHAIN", levelNumber: 6, source: "ZERMATT_RESERVED8" },
  { name: "Facilities Maintenance Officer", code: "FAC-MO", careerTrack: "HOUSEKEEPING_FACILITIES", levelNumber: 6, source: "ZERMATT_RESERVED8" },
];

const ZERMATT_DESIGNATION_LEVELS = [
  ...ZERMATT_BASE_DESIGNATION_LEVELS,
  ...ZERMATT_VALIDATED_DESIGNATION_EXTENSIONS,
];

function normalizeDesignationName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeDesignationCode(value) {
  return String(value || "").trim().toUpperCase();
}

function createUniqueIndex(items, selector, label) {
  const index = new Map();
  for (const item of items) {
    const key = selector(item);
    if (!key) continue;
    if (index.has(key)) throw new Error(`DUPLICATE_ZERMATT_${label}:${key}`);
    index.set(key, item);
  }
  return index;
}

const ZERMATT_DESIGNATION_LEVEL_BY_NAME = createUniqueIndex(
  ZERMATT_DESIGNATION_LEVELS,
  (item) => normalizeDesignationName(item.name),
  "DESIGNATION_NAME"
);
const ZERMATT_DESIGNATION_LEVEL_BY_CODE = createUniqueIndex(
  ZERMATT_DESIGNATION_LEVELS,
  (item) => normalizeDesignationCode(item.code),
  "DESIGNATION_CODE"
);

function resolveZermattDesignationLevel(designation) {
  const byCode = designation?.code
    ? ZERMATT_DESIGNATION_LEVEL_BY_CODE.get(normalizeDesignationCode(designation.code)) || null
    : null;
  const byName = designation?.name
    ? ZERMATT_DESIGNATION_LEVEL_BY_NAME.get(normalizeDesignationName(designation.name)) || null
    : null;

  if (byCode && byName && byCode !== byName) {
    const error = new Error("ZERMATT_DESIGNATION_REFERENCE_CONFLICT");
    error.details = {
      designationId: designation?.id || null,
      designationName: designation?.name || null,
      designationCode: designation?.code || null,
      codeLevel: byCode.levelNumber,
      nameLevel: byName.levelNumber,
    };
    throw error;
  }

  return byCode || byName || null;
}

module.exports = {
  ZERMATT_EMPLOYMENT_LEVELS,
  ZERMATT_BASE_DESIGNATION_LEVELS,
  ZERMATT_VALIDATED_DESIGNATION_EXTENSIONS,
  ZERMATT_DESIGNATION_LEVELS,
  resolveZermattDesignationLevel,
};
