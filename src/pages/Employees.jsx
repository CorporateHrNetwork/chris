import { useState } from "react";
import EmployeeTable from "../components/employees/EmployeeTable";
import AddEmployee from "../components/employees/AddEmployee";
import employees from "../data/employees";

function Employees() {
  const [showAddEmployee, setShowAddEmployee] = useState(false);

  const totalEmployees = employees.length;

  const activeEmployees = employees.filter(
    (employee) => employee.status === "Active"
  ).length;

  const employeesOnLeave = employees.filter(
    (employee) => employee.status === "Leave"
  ).length;

  const employeesOnProbation = employees.filter(
    (employee) => employee.status === "Probation"
  ).length;

  if (showAddEmployee) {
    return (
      <AddEmployee
        onBack={() => setShowAddEmployee(false)}
        onSave={() => {
          setShowAddEmployee(false);
        }}
      />
    );
  }

  return (
    <div>
      {/* PAGE HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "20px",
          marginBottom: "25px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 6px",
              color: "#64748B",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            People Management
          </p>

          <h1
            style={{
              margin: 0,
              color: "#0B5E3B",
              fontSize: "32px",
              fontWeight: "800",
            }}
          >
            Employees
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#64748B",
              fontSize: "15px",
            }}
          >
            Manage employee records, profiles and employment information.
          </p>
        </div>

        {/* ADD EMPLOYEE BUTTON */}
        <button
          type="button"
          onClick={() => setShowAddEmployee(true)}
          style={{
            background: "#0B5E3B",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "10px",
            padding: "14px 22px",
            fontSize: "14px",
            fontWeight: "700",
            cursor: "pointer",
            boxShadow: "0 6px 15px rgba(11,94,59,0.18)",
          }}
        >
          + Add Employee
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "18px",
          marginBottom: "28px",
        }}
      >
        <SummaryCard
          title="Total Employees"
          value={totalEmployees}
          subtitle="All employee records"
        />

        <SummaryCard
          title="Active"
          value={activeEmployees}
          subtitle="Currently active"
        />

        <SummaryCard
          title="On Leave"
          value={employeesOnLeave}
          subtitle="Currently on leave"
        />

        <SummaryCard
          title="Probation"
          value={employeesOnProbation}
          subtitle="Under probation"
        />
      </div>

      {/* EMPLOYEE DIRECTORY */}
      <EmployeeTable />
    </div>
  );
}

/* SUMMARY CARD */

function SummaryCard({ title, value, subtitle }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: "16px",
        padding: "22px",
        minHeight: "125px",
        boxShadow: "0 6px 20px rgba(15,23,42,0.05)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          color: "#64748B",
          fontSize: "13px",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#0B5E3B",
          fontSize: "30px",
          fontWeight: "800",
          lineHeight: 1,
          marginTop: "10px",
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: "#94A3B8",
          fontSize: "12px",
          marginTop: "8px",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

export default Employees;