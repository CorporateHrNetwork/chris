import { useMemo, useState } from "react";
import employees from "../../data/employees";
import EmployeeProfile from "./EmployeeProfile";

function EmployeeTable() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const departments = [
    "All",
    ...new Set(employees.map((employee) => employee.department)),
  ];

  const statuses = [
    "All",
    ...new Set(employees.map((employee) => employee.status)),
  ];

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const searchTerm = search.toLowerCase().trim();

      const searchMatch =
        employee.name.toLowerCase().includes(searchTerm) ||
        employee.id.toLowerCase().includes(searchTerm) ||
        employee.department.toLowerCase().includes(searchTerm);

      const departmentMatch =
        department === "All" ||
        employee.department === department;

      const statusMatch =
        status === "All" ||
        employee.status === status;

      return searchMatch && departmentMatch && statusMatch;
    });
  }, [search, department, status]);

  /* 
     When an employee is selected, show the employee profile
     instead of the directory.
  */
  if (selectedEmployee) {
    return (
      <EmployeeProfile
        employee={selectedEmployee}
        onBack={() => setSelectedEmployee(null)}
      />
    );
  }

  return (
    <div>
      {/* FILTERS */}
      <div
        style={{
          display: "flex",
          gap: "15px",
          marginBottom: "25px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search employees..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={inputStyle}
        />

        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          style={inputStyle}
        >
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          style={inputStyle}
        >
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {/* EMPLOYEE DIRECTORY */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "18px",
          padding: "25px",
          boxShadow: "0 8px 25px rgba(0, 0, 0, 0.05)",
          border: "1px solid #E5E7EB",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "15px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "#0B5E3B",
                fontSize: "20px",
                fontWeight: "800",
              }}
            >
              Employee Directory
            </h2>

            <p
              style={{
                margin: "5px 0 0",
                color: "#64748B",
                fontSize: "13px",
              }}
            >
              {filteredEmployees.length} employee
              {filteredEmployees.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: "850px",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#F3F6F4",
                }}
              >
                <th style={th}>Employee ID</th>
                <th style={th}>Name</th>
                <th style={th}>Department</th>
                <th style={th}>Designation</th>
                <th style={th}>Status</th>
                <th style={th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td style={td}>{employee.id}</td>

                    <td
                      style={{
                        ...td,
                        fontWeight: "700",
                        color: "#0F172A",
                      }}
                    >
                      {employee.name}
                    </td>

                    <td style={td}>{employee.department}</td>

                    <td style={td}>{employee.designation}</td>

                    <td style={td}>
                      <StatusBadge status={employee.status} />
                    </td>

                    <td style={td}>
                      <button
                        type="button"
                        onClick={() => setSelectedEmployee(employee)}
                        style={{
                          background: "#0B5E3B",
                          color: "#FFFFFF",
                          border: "none",
                          padding: "9px 16px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "700",
                          fontSize: "13px",
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      padding: "40px",
                      textAlign: "center",
                      color: "#64748B",
                    }}
                  >
                    No employees found matching your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* STATUS BADGE */

function StatusBadge({ status }) {
  let background = "#F1F5F9";
  let color = "#475569";

  if (status === "Active") {
    background = "#E8F8F0";
    color = "#087443";
  }

  if (status === "Leave") {
    background = "#FFF4E5";
    color = "#B45309";
  }

  if (status === "Probation") {
    background = "#F0E9FF";
    color = "#6D28D9";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: "999px",
        background,
        color,
        fontSize: "12px",
        fontWeight: "700",
      }}
    >
      {status}
    </span>
  );
}

const inputStyle = {
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid #D1D5DB",
  minWidth: "220px",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: "14px",
  outline: "none",
};

const th = {
  textAlign: "left",
  padding: "14px",
  color: "#475569",
  fontSize: "12px",
  fontWeight: "800",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: "1px solid #E5E7EB",
};

const td = {
  padding: "15px 14px",
  borderBottom: "1px solid #EEF2F1",
  color: "#475569",
  fontSize: "14px",
};

export default EmployeeTable;