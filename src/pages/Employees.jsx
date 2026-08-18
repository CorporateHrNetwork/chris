import {
  useCallback,
  useEffect,
  useState,
} from "react";

import EmployeeTable from "../components/employees/EmployeeTable";
import AddEmployee from "../components/employees/AddEmployee";

import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

function Employees() {
  const [showAddEmployee, setShowAddEmployee] =
    useState(false);

  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    leave: 0,
    probation: 0,
  });

  const [summaryLoading, setSummaryLoading] =
    useState(true);

  const [summaryError, setSummaryError] =
    useState("");

  const {
    hasPermission,
    loading: authorizationLoading,
  } = useAuthorization();

  const canCreateEmployee =
    hasPermission("employees.create");

  const loadEmployeeSummary = useCallback(
    async () => {
      try {
        setSummaryLoading(true);
        setSummaryError("");

        const result = await apiRequest(
          "/api/employees"
        );

        const employees = result.data || [];

        setSummary({
          total: employees.length,

          active: employees.filter(
            (employee) =>
              employee.status === "ACTIVE"
          ).length,

          leave: employees.filter(
            (employee) =>
              employee.status === "LEAVE"
          ).length,

          probation: employees.filter(
            (employee) =>
              employee.status === "PROBATION"
          ).length,
        });
      } catch (error) {
        console.error(
          "Employee summary error:",
          error
        );

        setSummaryError(
          error.message ||
            "Unable to load employee summary."
        );
      } finally {
        setSummaryLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadEmployeeSummary();
  }, [loadEmployeeSummary]);

  const handleEmployeeSaved = async () => {
    setShowAddEmployee(false);

    await loadEmployeeSummary();
  };

  /*
  ============================================================
  PROTECT ADD EMPLOYEE VIEW
  ============================================================

  The backend remains the real security boundary.

  This frontend check prevents users without
  employees.create from opening the Add Employee UI.
  */
  if (
    showAddEmployee &&
    !authorizationLoading &&
    !canCreateEmployee
  ) {
    return (
      <div>
        <button
          type="button"
          onClick={() =>
            setShowAddEmployee(false)
          }
          style={backButtonStyle}
        >
          ← Back to Employee Directory
        </button>

        <div style={accessDeniedStyle}>
          <h2
            style={{
              margin: "0 0 8px",
              color: "#991B1B",
              fontSize: "20px",
              fontWeight: "800",
            }}
          >
            Access Restricted
          </h2>

          <p
            style={{
              margin: 0,
              color: "#7F1D1D",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            You do not have permission to add
            employee records.
          </p>
        </div>
      </div>
    );
  }

  if (
    showAddEmployee &&
    canCreateEmployee
  ) {
    return (
      <div>
        <button
          type="button"
          onClick={() =>
            setShowAddEmployee(false)
          }
          style={backButtonStyle}
        >
          ← Back to Employee Directory
        </button>

        <AddEmployee
          onBack={() =>
            setShowAddEmployee(false)
          }
          onSave={handleEmployeeSaved}
        />
      </div>
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
              color: "#087A43",
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
            Manage employee records, profiles and
            employment information.
          </p>
        </div>

        {!authorizationLoading &&
          canCreateEmployee && (
            <button
              type="button"
              onClick={() =>
                setShowAddEmployee(true)
              }
              style={addButtonStyle}
            >
              + Add Employee
            </button>
          )}
      </div>

      {summaryError && (
        <div style={errorStyle}>
          {summaryError}
        </div>
      )}

      {/* LIVE SUMMARY CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "18px",
          marginBottom: "28px",
        }}
      >
        <SummaryCard
          title="Total Employees"
          value={
            summaryLoading
              ? "..."
              : summary.total
          }
          subtitle="All employee records"
        />

        <SummaryCard
          title="Active"
          value={
            summaryLoading
              ? "..."
              : summary.active
          }
          subtitle="Currently active"
        />

        <SummaryCard
          title="On Leave"
          value={
            summaryLoading
              ? "..."
              : summary.leave
          }
          subtitle="Currently on leave"
        />

        <SummaryCard
          title="Probation"
          value={
            summaryLoading
              ? "..."
              : summary.probation
          }
          subtitle="Under probation"
        />
      </div>

      {/* EMPLOYEE DIRECTORY */}
      <div className="chris-employee-directory-skin">
        <EmployeeTable />
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 18% 0%, rgba(36,217,118,.13), transparent 30%), linear-gradient(145deg, #063722, #02170f)",
        border:
          "1px solid rgba(212,175,55,0.88)",
        borderRadius: "20px",
        padding: "22px",
        minHeight: "125px",
        boxShadow:
          "0 18px 42px rgba(0,0,0,0.34)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          color: "#F7FAF8",
          fontSize: "13px",
          fontWeight: "900",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#2EE98B",
          fontSize: "34px",
          fontWeight: "900",
          lineHeight: 1,
          marginTop: "10px",
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: "#C7D3CC",
          fontSize: "12px",
          marginTop: "8px",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

const addButtonStyle = {
  background: "#087A43",
  color: "#FFFFFF",

  border: "none",
  borderRadius: "10px",

  padding: "14px 22px",

  fontSize: "14px",
  fontWeight: "700",

  cursor: "pointer",

  boxShadow:
    "0 6px 15px rgba(11,94,59,0.18)",
};

const backButtonStyle = {
  border: "none",
  background: "transparent",

  color: "#087A43",

  fontSize: "14px",
  fontWeight: "800",

  cursor: "pointer",

  padding: 0,
  marginBottom: "18px",
};

const errorStyle = {
  marginBottom: "20px",

  padding: "14px 16px",

  background: "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius: "10px",

  color: "#B91C1C",

  fontSize: "14px",
  fontWeight: "600",
};

const accessDeniedStyle = {
  background: "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius: "14px",

  padding: "24px",

  maxWidth: "600px",
};

export default Employees;