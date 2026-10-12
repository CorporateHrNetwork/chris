// Read-only projection of historic loan records. Does not mutate payroll or loan rows.
export const LOAN_HISTORY_VIEWS = Object.freeze(["ALL", "ACTIVE", "COMPLETED"]);
export function selectLoanHistory(loans, view = "ALL", search = "") {
  const validView = LOAN_HISTORY_VIEWS.includes(view) ? view : "ALL";
  const query = String(search || "").trim().toLowerCase();
  return (Array.isArray(loans) ? loans : []).filter((loan) => {
    const status = String(loan.status || "").toUpperCase();
    const matchesStatus = validView === "ALL"
      || (validView === "ACTIVE" && ["ACTIVE", "PAUSED"].includes(status))
      || (validView === "COMPLETED" && status === "COMPLETED");
    const haystack = [loan.employeeNumber, loan.employeeName, loan.loanNumber, loan.purpose, status]
      .filter(Boolean).join(" ").toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
}
export function employeeLifetimeLoanHistory(loans, employeeNumber) {
  const id = String(employeeNumber || "").trim().toUpperCase();
  if (!id) return [];
  return (Array.isArray(loans) ? loans : [])
    .filter(loan => String(loan.employeeNumber || "").trim().toUpperCase() === id)
    .sort((a, b) => String(b.disbursedDate || b.applicationDate || b.createdAt || "").localeCompare(String(a.disbursedDate || a.applicationDate || a.createdAt || "")));
}
