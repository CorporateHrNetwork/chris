const XLSX = require("xlsx");

function cleanOrganizationName(organization = {}) {
  const raw = String(organization?.legalName || organization?.name || "Organisation").trim();
  return raw.replace(/\s*[—-]\s*SYNTHETIC STAGING ACCEPTANCE\s*$/i, "").trim();
}

function scopeLabel(scope = {}) {
  if (scope.mode === "HEAD_OFFICE_CONSOLIDATED") return "HEAD OFFICE · CONSOLIDATED";
  const name = String(scope.locationName || "BRANCH").trim();
  const code = String(scope.locationCode || "").trim();
  return code ? name + " · " + code : name;
}

function appendReportCoverSheet(workbook, { organization, reportTitle, scope, generatedAt }) {
  const rows = [
    [cleanOrganizationName(organization)],
    [String(reportTitle || "Report")],
    [scopeLabel(scope)],
    ["Generated", generatedAt || new Date().toISOString()],
    [],
    ["Document Owner", cleanOrganizationName(organization)],
    ["System", "CHRiS — CorporateHR Network Information System"],
    ["Brand Credit", "Powered by CHRiS"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Report Cover");
  return sheet;
}

module.exports = {
  appendReportCoverSheet,
  cleanOrganizationName,
  scopeLabel,
};
