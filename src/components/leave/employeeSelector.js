export function normalizeEmployees(response) {
  return (Array.isArray(response?.data) ? response.data : []).map(employee => ({
    ...employee,
    lastName: employee.lastName || employee.surname || "",
    department: employee.department || null,
    designation: employee.designation || null,
  }));
}
export function employeeSearchText(employee) {
  return [employee.employeeNumber, employee.id, employee.firstName, employee.lastName,
    [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ")]
    .filter(Boolean).join(" ").toLowerCase();
}
export function searchEmployees(employees, query) {
  const needle = String(query || "").trim().toLowerCase();
  return needle ? (employees || []).filter(employee => employeeSearchText(employee).includes(needle)) : [];
}
