import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaUserPlus,
  FaTimes,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";

import {
  apiRequest,
} from "../../services/api";

function CreateUserForm({
  roles,
  onCancel,
  onCreated,
}) {
  const [
    employees,
    setEmployees,
  ] = useState([]);

  const [
    employeesLoading,
    setEmployeesLoading,
  ] = useState(true);

  const [
    employeesError,
    setEmployeesError,
  ] = useState("");

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    employeeId: "",
    temporaryPassword: "",
    roleIds: [],
  });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  /*
  ============================================================
  LOAD EMPLOYEES ELIGIBLE FOR CHRIS ACCESS
  ============================================================

  Backend already filters this list so it contains only
  employees who:

  - belong to the current organization
  - have an email address
  - do not already have a CHRIS User account
  - are not terminated/resigned/retired/inactive
  */
  useEffect(() => {
    let cancelled = false;

    const loadEligibleEmployees =
      async () => {
        try {
          setEmployeesLoading(true);
          setEmployeesError("");

          const result =
            await apiRequest(
              "/api/users/eligible-employees"
            );

          if (!cancelled) {
            setEmployees(
              result.data || []
            );
          }
        } catch (requestError) {
          console.error(
            "Eligible employee load error:",
            requestError
          );

          if (!cancelled) {
            setEmployeesError(
              requestError.message ||
                "Unable to load employees eligible for CHRIS access."
            );
          }
        } finally {
          if (!cancelled) {
            setEmployeesLoading(
              false
            );
          }
        }
      };

    loadEligibleEmployees();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
  ============================================================
  SELECTED EMPLOYEE
  ============================================================
  */
  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) => {
      const name = [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean).join(" ").toLowerCase();
      const employeeNumber = String(employee.employeeNumber || "").toLowerCase();
      const email = String(employee.email || "").toLowerCase();
      return name.includes(query) || employeeNumber.includes(query) || email.includes(query);
    });
  }, [employees, employeeSearch]);

  const selectedEmployee =
    useMemo(
      () =>
        employees.find(
          (employee) =>
            employee.id ===
            form.employeeId
        ) || null,
      [
        employees,
        form.employeeId,
      ]
    );

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setError("");
  };

  const handleRoleChange = (
    roleId
  ) => {
    setForm((current) => {
      const selected =
        current.roleIds.includes(
          roleId
        );

      return {
        ...current,

        roleIds: selected
          ? current.roleIds.filter(
              (id) =>
                id !== roleId
            )
          : [
              ...current.roleIds,
              roleId,
            ],
      };
    });

    setError("");
  };

  /*
  ============================================================
  CREATE USER
  ============================================================
  */
  const handleSubmit = async (
    event
  ) => {
    event.preventDefault();

    setError("");

    if (!form.employeeId) {
      setError(
        "Select an employee before creating CHRIS access."
      );

      return;
    }

    if (
      !form.temporaryPassword
    ) {
      setError(
        "Enter a temporary password."
      );

      return;
    }

    if (
      form.temporaryPassword.length <
      10
    ) {
      setError(
        "Temporary password must contain at least 10 characters."
      );

      return;
    }

    if (
      form.roleIds.length === 0
    ) {
      setError(
        "Select at least one CHRIS role."
      );

      return;
    }

    try {
      setSaving(true);

      const result =
        await apiRequest(
          "/api/users",
          {
            method: "POST",

            body: JSON.stringify({
              employeeId:
                form.employeeId,

              temporaryPassword:
                form.temporaryPassword,

              roleIds:
                form.roleIds,
            }),
          }
        );

      /*
      Remove the newly linked employee immediately from the
      local eligible list. The parent component will also
      refresh the Users table through onCreated().
      */
      setEmployees(
        (current) =>
          current.filter(
            (employee) =>
              employee.id !==
              form.employeeId
          )
      );

      setForm({
        employeeId: "",
        temporaryPassword: "",
        roleIds: [],
      });

      if (onCreated) {
        await onCreated(
          result.data
        );
      }
    } catch (requestError) {
      console.error(
        "Create CHRIS user error:",
        requestError
      );

      setError(
        requestError.message ||
          "Unable to create CHRIS user."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="chris-create-user-form"
      style={{
        background: "#FFFFFF",
        border:
          "1px solid #E5E7EB",
        borderRadius: "16px",
        boxShadow:
          "0 12px 32px rgba(15,23,42,0.08)",
        overflow: "hidden",
        marginBottom: "24px",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "16px",
          padding: "20px 22px",
          borderBottom:
            "1px solid #E5E7EB",
          background: "#F8FAFC",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#ECFDF5",
              color: "#087A43",
              display: "flex",
              alignItems: "center",
              justifyContent:
                "center",
              fontSize: "17px",
            }}
          >
            <FaUserPlus />
          </div>

          <div>
            <h3
              style={{
                margin: 0,
                color: "#0F172A",
                fontSize: "18px",
                fontWeight: "800",
              }}
            >
              Create CHRIS User
            </h3>

            <p
              style={{
                margin:
                  "4px 0 0",
                color: "#64748B",
                fontSize: "12px",
              }}
            >
              Select an existing
              employee and assign
              CHRIS system access.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          title="Close"
          disabled={saving}
          style={{
            border: "none",
            background:
              "transparent",
            color: "#64748B",
            cursor: saving
              ? "not-allowed"
              : "pointer",
            fontSize: "18px",
            padding: "8px",
          }}
        >
          <FaTimes />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          padding: "22px",
        }}
      >
        {error && (
          <div style={errorStyle}>
            {error}
          </div>
        )}

        {employeesError && (
          <div style={errorStyle}>
            {employeesError}
          </div>
        )}

        {/* EMPLOYEE SELECTION */}
        <FormField
          label="Employee"
          required
          hint="Employee master record"
        >
          <div className="chris-employee-search">
            <div className="chris-employee-search-row">
              <input
                type="search"
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
                placeholder="Search by employee name or ID number"
                aria-label="Search employees by name or ID number"
                disabled={saving || employeesLoading}
                style={inputStyle}
                autoComplete="off"
              />
              {employeeSearch && (
                <button
                  type="button"
                  className="chris-employee-search-clear"
                  onClick={() => setEmployeeSearch("")}
                  disabled={saving}
                  aria-label="Clear employee search"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="chris-employee-search-results" role="listbox" aria-label="Eligible employees">
              {employeesLoading ? (
                <div className="chris-employee-search-state">Loading eligible employees...</div>
              ) : employees.length === 0 ? (
                <div className="chris-employee-search-state">No eligible employees available.</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="chris-employee-search-state">No employee matches that name or ID number.</div>
              ) : (
                filteredEmployees.slice(0, 50).map((employee) => {
                  const fullName = [employee.firstName, employee.middleName, employee.lastName]
                    .filter(Boolean).join(" ");
                  const selected = form.employeeId === employee.id;
                  return (
                    <button
                      key={employee.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`chris-employee-search-option${selected ? " is-selected" : ""}`}
                      onClick={() => {
                        setForm((current) => ({ ...current, employeeId: employee.id }));
                        setError("");
                      }}
                      disabled={saving}
                    >
                      <span className="chris-employee-search-name">{fullName}</span>
                      <span className="chris-employee-search-meta">
                        {employee.employeeNumber || "No ID"}{employee.email ? ` • ${employee.email}` : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {!employeesLoading && filteredEmployees.length > 50 && (
              <div className="chris-employee-search-limit">Showing the first 50 matches. Refine your search to find another employee.</div>
            )}
          </div>
        </FormField>

        {/*
        ========================================================
        SELECTED EMPLOYEE DETAILS

        Read-only. These values originate from Employee and
        cannot be edited from User Management.
        ========================================================
        */}
        {selectedEmployee && (
          <div
            style={
              employeeCardStyle
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "flex-start",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color:
                      "#64748B",
                    fontSize:
                      "10px",
                    fontWeight:
                      "800",
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.05em",
                  }}
                >
                  Selected Employee
                </div>

                <div
                  style={{
                    marginTop:
                      "5px",
                    color:
                      "#0F172A",
                    fontSize:
                      "17px",
                    fontWeight:
                      "800",
                  }}
                >
                  {[
                    selectedEmployee.firstName,
                    selectedEmployee.middleName,
                    selectedEmployee.lastName,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </div>

                <div
                  style={{
                    marginTop:
                      "4px",
                    color:
                      "#64748B",
                    fontSize:
                      "12px",
                  }}
                >
                  {
                    selectedEmployee.employeeNumber
                  }
                </div>
              </div>

              <span
                style={{
                  padding:
                    "6px 10px",
                  borderRadius:
                    "999px",
                  background:
                    "#ECFDF5",
                  color:
                    "#047857",
                  fontSize:
                    "10px",
                  fontWeight:
                    "800",
                }}
              >
                {
                  selectedEmployee.status
                }
              </span>
            </div>

            <div
              style={
                employeeDetailsGridStyle
              }
            >
              <EmployeeDetail
                label="Email"
                value={
                  selectedEmployee.email
                }
              />

              <EmployeeDetail
                label="Department"
                value={
                  selectedEmployee
                    .department
                    ?.name ||
                  "Not assigned"
                }
              />

              <EmployeeDetail
                label="Designation"
                value={
                  selectedEmployee
                    .designation
                    ?.name ||
                  "Not assigned"
                }
              />

              <EmployeeDetail
                label="Phone"
                value={
                  selectedEmployee.phone ||
                  "Not provided"
                }
              />
            </div>

            <div
              style={{
                marginTop:
                  "14px",
                padding:
                  "10px 12px",
                borderRadius:
                  "8px",
                background:
                  "#F8FAFC",
                color:
                  "#64748B",
                fontSize:
                  "11px",
                lineHeight: 1.5,
              }}
            >
              Name and email are
              controlled by the
              Employee master record.
              To change them, update
              the employee record
              rather than the CHRIS
              User account.
            </div>
          </div>
        )}

        {/*
        ========================================================
        PASSWORD
        ========================================================
        */}
        <div
          style={{
            marginTop: "18px",
          }}
        >
          <FormField
            label="Temporary Password"
            required
            hint="Minimum 10 characters"
          >
            <div className="chris-password-field">
              <input
                type={showPassword ? "text" : "password"}
                name="temporaryPassword"
                value={form.temporaryPassword}
                onChange={handleChange}
                placeholder="Enter temporary password"
                style={inputStyle}
                disabled={saving}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="chris-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                disabled={saving}
                aria-label={showPassword ? "Hide temporary password" : "Show temporary password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </FormField>
        </div>

        {/* ROLE ASSIGNMENT */}
        <div
          style={{
            marginTop: "20px",
          }}
        >
          <div
            style={{
              marginBottom:
                "10px",
            }}
          >
            <span
              style={{
                color: "#334155",
                fontSize: "13px",
                fontWeight: "800",
              }}
            >
              Assign Roles{" "}
              <span
                style={{
                  color: "#B91C1C",
                }}
              >
                *
              </span>
            </span>

            <div
              style={{
                marginTop: "4px",
                color: "#64748B",
                fontSize: "11px",
              }}
            >
              Select one or more
              authorization roles for
              this employee.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px",
            }}
          >
            {roles.map(
              (role) => {
                const selected =
                  form.roleIds.includes(
                    role.id
                  );

                return (
                  <label
                    key={role.id}
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "flex-start",
                      gap: "10px",
                      padding:
                        "13px",
                      border:
                        selected
                          ? "2px solid #087A43"
                          : "1px solid #E2E8F0",
                      borderRadius:
                        "10px",
                      background:
                        selected
                          ? "#F0FDF4"
                          : "#FFFFFF",
                      cursor:
                        saving
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selected
                      }
                      disabled={
                        saving
                      }
                      onChange={() =>
                        handleRoleChange(
                          role.id
                        )
                      }
                      style={{
                        marginTop:
                          "3px",
                      }}
                    />

                    <span>
                      <span
                        style={{
                          display:
                            "block",
                          color:
                            "#0F172A",
                          fontSize:
                            "13px",
                          fontWeight:
                            "800",
                        }}
                      >
                        {role.name}
                      </span>

                      <span
                        style={{
                          display:
                            "block",
                          marginTop:
                            "3px",
                          color:
                            "#64748B",
                          fontSize:
                            "10px",
                          lineHeight:
                            1.4,
                        }}
                      >
                        {role.description ||
                          "CHRIS authorization role"}
                      </span>
                    </span>
                  </label>
                );
              }
            )}
          </div>

          {roles.length === 0 && (
            <div
              style={{
                padding: "14px",
                background:
                  "#FFFBEB",
                border:
                  "1px solid #FDE68A",
                borderRadius:
                  "10px",
                color: "#92400E",
                fontSize: "12px",
              }}
            >
              No roles are currently
              available.
            </div>
          )}
        </div>

        {/* ACTIONS */}
        <div
          style={{
            display: "flex",
            justifyContent:
              "flex-end",
            gap: "10px",
            marginTop: "24px",
            paddingTop: "18px",
            borderTop:
              "1px solid #E5E7EB",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={
              cancelButtonStyle
            }
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              saving ||
              employeesLoading ||
              !form.employeeId ||
              roles.length === 0
            }
            style={{
              ...saveButtonStyle,

              opacity:
                saving ||
                employeesLoading ||
                !form.employeeId ||
                roles.length ===
                  0
                  ? 0.65
                  : 1,

              cursor:
                saving ||
                employeesLoading ||
                !form.employeeId ||
                roles.length ===
                  0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            <FaUserPlus />

            {saving
              ? "Creating..."
              : "Create User"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmployeeDetail({
  label,
  value,
}) {
  return (
    <div>
      <div
        style={{
          color: "#94A3B8",
          fontSize: "9px",
          fontWeight: "800",
          textTransform:
            "uppercase",
          letterSpacing:
            "0.04em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "4px",
          color: "#334155",
          fontSize: "12px",
          fontWeight: "700",
          overflowWrap:
            "anywhere",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function FormField({
  label,
  required,
  hint,
  children,
}) {
  return (
    <label
      style={{
        display: "block",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: "10px",
          marginBottom: "7px",
        }}
      >
        <span
          style={{
            color: "#334155",
            fontSize: "13px",
            fontWeight: "800",
          }}
        >
          {label}

          {required && (
            <span
              style={{
                color: "#B91C1C",
              }}
            >
              {" "}
              *
            </span>
          )}
        </span>

        {hint && (
          <span
            style={{
              color: "#94A3B8",
              fontSize: "10px",
            }}
          >
            {hint}
          </span>
        )}
      </div>

      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 13px",
  border:
    "1px solid #CBD5E1",
  borderRadius: "9px",
  outline: "none",
  color: "#0F172A",
  background: "#FFFFFF",
  fontSize: "13px",
  fontFamily: "inherit",
};

const employeeCardStyle = {
  marginTop: "14px",
  padding: "18px",
  border:
    "1px solid #D1FAE5",
  borderRadius: "12px",
  background: "#FAFFFC",
};

const employeeDetailsGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "14px",
  marginTop: "18px",
  paddingTop: "16px",
  borderTop:
    "1px solid #E2E8F0",
};

const cancelButtonStyle = {
  padding: "11px 16px",
  border:
    "1px solid #CBD5E1",
  borderRadius: "9px",
  background: "#FFFFFF",
  color: "#475569",
  fontSize: "13px",
  fontWeight: "800",
  cursor: "pointer",
  fontFamily: "inherit",
};

const saveButtonStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "11px 17px",
  border: "none",
  borderRadius: "9px",
  background: "#087A43",
  color: "#FFFFFF",
  fontSize: "13px",
  fontWeight: "800",
  fontFamily: "inherit",
};

const errorStyle = {
  marginBottom: "18px",
  padding: "12px 14px",
  background: "#FEF2F2",
  border:
    "1px solid #FECACA",
  borderRadius: "9px",
  color: "#B91C1C",
  fontSize: "12px",
  fontWeight: "600",
};

export default CreateUserForm;