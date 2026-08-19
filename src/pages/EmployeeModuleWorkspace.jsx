import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaUsers,
  FaUserClock,
  FaChartPie,
  FaExchangeAlt,
  FaArrowUp,
  FaSignOutAlt,
  FaSitemap,
  FaEye,
} from "react-icons/fa";

import { apiRequest } from "../services/api";

const CONFIG = {
  profiles: {
    eyebrow: "PEOPLE MANAGEMENT",
    title: "Employee Profiles",
    description:
      "Browse permanent employee identities and open the full employee workspace.",
    icon: <FaUsers />,
  },
  onboarding: {
    eyebrow: "PEOPLE MANAGEMENT",
    title: "Onboarding",
    description:
      "Monitor employees in early employment stages and open their employee workspace.",
    icon: <FaUserClock />,
  },
  analytics: {
    eyebrow: "PEOPLE ANALYTICS",
    title: "Employee Analytics",
    description:
      "Live workforce distribution by status, gender, department and work location.",
    icon: <FaChartPie />,
  },
  transfers: {
    eyebrow: "EMPLOYEE MOVEMENT",
    title: "Transfers",
    description:
      "Open controlled employee transfer workflows while preserving permanent employment history.",
    icon: <FaExchangeAlt />,
  },
  promotions: {
    eyebrow: "CAREER MANAGEMENT",
    title: "Promotions",
    description:
      "Open controlled promotion workflows against the employee's current career structure.",
    icon: <FaArrowUp />,
  },
  exits: {
    eyebrow: "EMPLOYMENT LIFECYCLE",
    title: "Exits",
    description:
      "Review current and exited employees and continue controlled exit, reinstatement or rehire workflows.",
    icon: <FaSignOutAlt />,
  },
  "line-managers": {
    eyebrow: "ORGANIZATION STRUCTURE",
    title: "Line Managers",
    description:
      "Review employee reporting context while CHRIS uses the permanent employee identity across related modules.",
    icon: <FaSitemap />,
  },
};

const EXITED = new Set(["RESIGNED", "TERMINATED", "RETIRED"]);

function EmployeeModuleWorkspace({ mode }) {
  const navigate = useNavigate();
  const config = CONFIG[mode] || CONFIG.profiles;

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const result = await apiRequest("/api/employees");

        if (active) {
          setEmployees(
            Array.isArray(result?.data)
              ? result.data
              : []
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message ||
              "Unable to load employee data."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const normalized = useMemo(
    () =>
      employees.map((employee) => ({
        ...employee,
        employeeName: [
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        departmentName:
          employee.department?.name ||
          "Not Assigned",
        designationName:
          employee.designation?.name ||
          "Not Assigned",
        locationName:
          employee.location?.name ||
          "Not Assigned",
        genderLabel:
          formatGender(employee.gender),
      })),
    [employees]
  );

  const filtered = useMemo(() => {
    let rows = normalized;

    if (mode === "onboarding") {
      rows = rows.filter((item) =>
        ["PROBATION", "ACTIVE"].includes(
          String(item.status || "").toUpperCase()
        )
      );
    }

    if (mode === "transfers" || mode === "promotions") {
      rows = rows.filter(
        (item) =>
          !EXITED.has(
            String(item.status || "").toUpperCase()
          ) &&
          !["INACTIVE", "SUSPENDED"].includes(
            String(item.status || "").toUpperCase()
          )
      );
    }

    if (mode === "exits") {
      rows = [...rows].sort((a, b) => {
        const left = EXITED.has(
          String(a.status || "").toUpperCase()
        )
          ? 0
          : 1;
        const right = EXITED.has(
          String(b.status || "").toUpperCase()
        )
          ? 0
          : 1;
        return left - right;
      });
    }

    const q = search.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((item) =>
      [
        item.employeeNumber,
        item.employeeName,
        item.departmentName,
        item.designationName,
        item.locationName,
        item.email,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(q)
      )
    );
  }, [normalized, mode, search]);

  const summary = useMemo(() => {
    const status = {};
    const gender = {};
    const departments = {};
    const locations = {};

    normalized.forEach((employee) => {
      const statusKey =
        String(employee.status || "UNSPECIFIED").toUpperCase();
      const genderKey =
        String(employee.gender || "UNSPECIFIED").toUpperCase();

      status[statusKey] =
        (status[statusKey] || 0) + 1;

      gender[genderKey] =
        (gender[genderKey] || 0) + 1;

      departments[employee.departmentName] =
        (departments[employee.departmentName] || 0) + 1;

      locations[employee.locationName] =
        (locations[employee.locationName] || 0) + 1;
    });

    return {
      total: normalized.length,
      active: status.ACTIVE || 0,
      probation: status.PROBATION || 0,
      exited:
        (status.RESIGNED || 0) +
        (status.TERMINATED || 0) +
        (status.RETIRED || 0),
      male: gender.MALE || 0,
      female: gender.FEMALE || 0,
      genderPending:
        (gender.UNSPECIFIED || 0) +
        (!gender.UNSPECIFIED
          ? normalized.filter(
              (employee) => !employee.gender
            ).length
          : 0),
      departments,
      locations,
      status,
    };
  }, [normalized]);

  function openProfile(employee, action) {
    const suffix = action
      ? `?action=${encodeURIComponent(action)}`
      : "";

    navigate(
      `/employees/${encodeURIComponent(
        employee.employeeNumber
      )}${suffix}`,
      {
        state: {
          from: window.location.pathname,
        },
      }
    );
  }

  return (
    <div style={pageStyle}>
      <button
        type="button"
        onClick={() => navigate("/employees")}
        style={backButtonStyle}
      >
        ← Employee Dashboard
      </button>

      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>
            {config.eyebrow}
          </div>

          <h1 style={titleStyle}>
            {config.title}
          </h1>

          <p style={descriptionStyle}>
            {config.description}
          </p>
        </div>

        <div style={headerIconStyle}>
          {config.icon}
        </div>
      </div>

      {error ? (
        <div style={errorStyle}>{error}</div>
      ) : null}

      <div style={metricGridStyle}>
        <Metric label="Employees" value={summary.total} />
        <Metric label="Active" value={summary.active} />
        <Metric label="Probation" value={summary.probation} />
        <Metric label="Exited" value={summary.exited} />
        <Metric label="Male" value={summary.male} />
        <Metric label="Female" value={summary.female} />
        <Metric
          label="Gender Data Pending"
          value={summary.genderPending}
        />
      </div>

      {mode === "analytics" ? (
        <AnalyticsWorkspace summary={summary} />
      ) : (
        <section style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>
                {config.title}
              </h2>

              <p style={panelSubtitleStyle}>
                {loading
                  ? "Loading employee data..."
                  : `${filtered.length} record${
                      filtered.length === 1 ? "" : "s"
                    }`}
              </p>
            </div>

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search name, employee number, department, designation..."
              style={searchStyle}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Gender</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filtered.length ? (
                  filtered.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <strong>
                          {employee.employeeNumber}
                        </strong>
                        <div style={mutedStyle}>
                          {employee.employeeName}
                        </div>
                      </td>
                      <td>{employee.genderLabel}</td>
                      <td>{employee.departmentName}</td>
                      <td>{employee.designationName}</td>
                      <td>{employee.locationName}</td>
                      <td>
                        <StatusBadge
                          status={employee.status}
                        />
                      </td>
                      <td>
                        <div style={actionsStyle}>
                          <button
                            type="button"
                            style={actionButtonStyle}
                            onClick={() =>
                              openProfile(
                                employee,
                                mode === "transfers"
                                  ? "transfer"
                                  : mode === "promotions"
                                    ? "promotion"
                                    : mode === "exits"
                                      ? "exit"
                                      : undefined
                              )
                            }
                          >
                            {mode === "transfers"
                              ? "Transfer"
                              : mode === "promotions"
                                ? "Promote"
                                : mode === "exits"
                                  ? EXITED.has(
                                      String(
                                        employee.status || ""
                                      ).toUpperCase()
                                    )
                                    ? "Open Record"
                                    : "Process Exit"
                                  : "View"}{" "}
                            <FaEye />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="7"
                      style={emptyStyle}
                    >
                      No employee records match this workspace.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {mode === "line-managers" ? (
            <div style={noticeStyle}>
              Reporting-line assignments are being surfaced through the
              Organization structure. This workspace is now routed and
              employee-aware; dedicated manager assignment controls can be
              added without changing permanent Employee IDs.
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

function AnalyticsWorkspace({ summary }) {
  return (
    <div style={analyticsGridStyle}>
      <Distribution
        title="Employment Status"
        data={summary.status}
      />

      <Distribution
        title="Department Distribution"
        data={summary.departments}
      />

      <Distribution
        title="Location Distribution"
        data={summary.locations}
      />
    </div>
  );
}

function Distribution({ title, data }) {
  const entries = Object.entries(data || {}).sort(
    (a, b) => Number(b[1]) - Number(a[1])
  );
  const max = Math.max(
    1,
    ...entries.map(([, value]) => Number(value))
  );

  return (
    <section style={panelStyle}>
      <h2 style={panelTitleStyle}>{title}</h2>

      <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
        {entries.length ? (
          entries.map(([label, value]) => (
            <div key={label}>
              <div style={distributionRowStyle}>
                <span>{formatStatus(label)}</span>
                <strong>{value}</strong>
              </div>

              <div className="chris-progress">
                <div
                  className="chris-progress__bar"
                  style={{
                    width: `${Math.round(
                      (Number(value) / max) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <div style={emptyStyle}>No data available.</div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
      <div style={mutedStyle}>Live employee master data</div>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={badgeStyle}>
      {formatStatus(status)}
    </span>
  );
}

function formatGender(value) {
  const labels = {
    MALE: "Male",
    FEMALE: "Female",
    OTHER: "Other",
    UNSPECIFIED: "Not Specified",
  };

  return (
    labels[String(value || "").toUpperCase()] ||
    "Not Specified"
  );
}

function formatStatus(value) {
  if (!value) return "Unspecified";

  return String(value)
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

const pageStyle = {
  color: "var(--chris-text-main)",
  fontFamily: "var(--chris-font-family)",
};

const backButtonStyle = {
  border: "none",
  padding: 0,
  marginBottom: 16,
  background: "transparent",
  color: "var(--chris-gold)",
  fontWeight: 800,
  cursor: "pointer",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 20,
  marginBottom: 22,
};

const eyebrowStyle = {
  color: "var(--chris-gold)",
  fontSize: "var(--chris-font-sm)",
  fontWeight: 900,
  letterSpacing: ".14em",
};

const titleStyle = {
  margin: "7px 0 6px",
  color: "var(--chris-text-main)",
  fontSize: "var(--chris-font-2xl)",
  fontWeight: 900,
};

const descriptionStyle = {
  margin: 0,
  maxWidth: 1000,
  color: "var(--chris-text-secondary)",
  lineHeight: 1.55,
};

const headerIconStyle = {
  width: 52,
  height: 52,
  display: "grid",
  placeItems: "center",
  borderRadius: 16,
  border: "1px solid var(--chris-border-gold)",
  color: "var(--chris-gold)",
  fontSize: 21,
  background: "rgba(212,175,55,.06)",
};

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(150px,1fr))",
  gap: 14,
  marginBottom: 18,
};

const metricStyle = {
  padding: 18,
  borderRadius: "var(--chris-radius-card)",
  border: "1px solid var(--chris-border-gold)",
  background:
    "linear-gradient(145deg,rgba(12,38,26,.94),rgba(7,18,13,.98))",
  boxShadow: "var(--chris-shadow-card)",
};

const metricLabelStyle = {
  color: "var(--chris-text-secondary)",
  fontSize: "var(--chris-font-xs)",
  fontWeight: 800,
  textTransform: "uppercase",
};

const metricValueStyle = {
  marginTop: 10,
  color: "var(--chris-text-main)",
  fontSize: 28,
  fontWeight: 900,
};

const panelStyle = {
  padding: 20,
  borderRadius: "var(--chris-radius-card)",
  border: "1px solid var(--chris-border-gold)",
  background:
    "linear-gradient(145deg,rgba(12,38,26,.94),rgba(7,18,13,.98))",
  boxShadow: "var(--chris-shadow-card)",
};

const panelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "flex-end",
  flexWrap: "wrap",
  marginBottom: 18,
};

const panelTitleStyle = {
  margin: 0,
  color: "var(--chris-text-main)",
  fontSize: "var(--chris-font-xl)",
  fontWeight: 900,
};

const panelSubtitleStyle = {
  margin: "5px 0 0",
  color: "var(--chris-text-secondary)",
  fontSize: "var(--chris-font-sm)",
};

const searchStyle = {
  minWidth: 320,
  maxWidth: "100%",
  padding: "11px 12px",
  borderRadius: "var(--chris-radius-md)",
  border: "1px solid var(--chris-border-soft)",
  background: "var(--chris-input-bg)",
  color: "var(--chris-text-main)",
  WebkitTextFillColor: "var(--chris-text-main)",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const mutedStyle = {
  color: "var(--chris-text-secondary)",
  fontSize: "var(--chris-font-xs)",
  marginTop: 4,
};

const badgeStyle = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: "var(--chris-radius-pill)",
  border: "1px solid rgba(212,175,55,.25)",
  background: "rgba(212,175,55,.07)",
  color: "var(--chris-gold)",
  fontSize: "var(--chris-font-xs)",
  fontWeight: 800,
};

const actionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
};

const actionButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: "1px solid var(--chris-border-gold)",
  borderRadius: "var(--chris-radius-md)",
  padding: "8px 10px",
  background: "rgba(212,175,55,.07)",
  color: "var(--chris-gold)",
  fontWeight: 800,
  cursor: "pointer",
};

const emptyStyle = {
  padding: 24,
  color: "var(--chris-text-secondary)",
  textAlign: "center",
};

const errorStyle = {
  marginBottom: 18,
  padding: "12px 14px",
  borderRadius: "var(--chris-radius-md)",
  border: "1px solid rgba(251,113,133,.3)",
  background: "rgba(251,113,133,.06)",
  color: "var(--chris-danger)",
  fontWeight: 700,
};

const analyticsGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(300px,1fr))",
  gap: 18,
};

const distributionRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 7,
  color: "var(--chris-text-main)",
  fontWeight: 700,
};

const noticeStyle = {
  marginTop: 18,
  padding: 13,
  borderRadius: "var(--chris-radius-md)",
  border: "1px solid rgba(212,175,55,.18)",
  background: "rgba(212,175,55,.04)",
  color: "var(--chris-text-secondary)",
  lineHeight: 1.55,
};

export default EmployeeModuleWorkspace;
