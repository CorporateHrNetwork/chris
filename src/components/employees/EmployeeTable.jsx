import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  FaEye,
  FaPauseCircle,
  FaUserSlash,
  FaSignOutAlt,
  FaUndo,
} from "react-icons/fa";

import {
  apiRequest,
} from "../../services/api";

import useAuthorization from "../../hooks/useAuthorization";

function EmployeeTable() {
  const navigate =
    useNavigate();

  const {
    hasPermission,
  } = useAuthorization();

  const canUpdateEmployees =
    hasPermission(
      "employees.update"
    );

  const [
    employees,
    setEmployees,
  ] = useState([]);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    department,
    setDepartment,
  ] = useState("All");

  const [
    status,
    setStatus,
  ] = useState("All");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    actionEmployeeNumber,
    setActionEmployeeNumber,
  ] = useState(null);

  const [
    exitEmployee,
    setExitEmployee,
  ] = useState(null);

  const [
    exitStatus,
    setExitStatus,
  ] = useState("RESIGNED");

  const [
    exitDate,
    setExitDate,
  ] = useState(
    new Date()
      .toISOString()
      .slice(0, 10)
  );

  /*
  ============================================================
  LOAD EMPLOYEES
  ============================================================
  */

  const fetchEmployees =
    useCallback(
      async () => {
        try {
          setLoading(true);
          setError("");

          const result =
            await apiRequest(
              "/api/employees"
            );

          const normalizedEmployees =
            (
              result.data || []
            ).map(
              (employee) => ({
                databaseId:
                  employee.id,

                id:
                  employee.employeeNumber,

                name: [
                  employee.firstName,
                  employee.middleName,
                  employee.lastName,
                ]
                  .filter(Boolean)
                  .join(" "),

                department:
                  employee.department
                    ?.name ||
                  "-",

                designation:
                  employee.designation
                    ?.name ||
                  "-",

                location:
                  employee.location
                    ?.name ||
                  "Not Assigned",

                locationCode:
                  employee.location
                    ?.code ||
                  "",

                email:
                  employee.email ||
                  "",

                phone:
                  employee.phone ||
                  "",

                statusCode:
                  employee.status,

                status:
                  formatStatus(
                    employee.status
                  ),

                hasUser:
                  Boolean(
                    employee.user
                  ),

                userActive:
                  employee.user
                    ?.isActive ??
                  null,

                exitDate:
                  employee.exitDate,
              })
            );

          setEmployees(
            normalizedEmployees
          );
        } catch (err) {
          console.error(
            "Employee API error:",
            err
          );

          setError(
            err.message ||
              "CHRIS could not load employee records."
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  /*
  ============================================================
  FILTERS
  ============================================================
  */

  const departments = [
    "All",
    ...new Set(
      employees.map(
        (employee) =>
          employee.department
      )
    ),
  ];

  const statuses = [
    "All",
    ...new Set(
      employees.map(
        (employee) =>
          employee.status
      )
    ),
  ];

  const filteredEmployees =
    useMemo(() => {
      return employees.filter(
        (employee) => {
          const searchTerm =
            search
              .toLowerCase()
              .trim();

          const searchMatch =
            employee.name
              .toLowerCase()
              .includes(
                searchTerm
              ) ||
            employee.id
              .toLowerCase()
              .includes(
                searchTerm
              ) ||
            employee.department
              .toLowerCase()
              .includes(
                searchTerm
              ) ||
            employee.designation
              .toLowerCase()
              .includes(
                searchTerm
              ) ||
            employee.location
              .toLowerCase()
              .includes(
                searchTerm
              );

          const departmentMatch =
            department ===
              "All" ||
            employee.department ===
              department;

          const statusMatch =
            status ===
              "All" ||
            employee.status ===
              status;

          return (
            searchMatch &&
            departmentMatch &&
            statusMatch
          );
        }
      );
    }, [
      employees,
      search,
      department,
      status,
    ]);

  /*
  ============================================================
  SUCCESS MESSAGE
  ============================================================
  */

  const showSuccess =
    (message) => {
      setSuccess(
        message
      );

      setTimeout(() => {
        setSuccess("");
      }, 4000);
    };

  /*
  ============================================================
  SUSPEND
  ============================================================
  */

  const handleSuspend =
    async (employee) => {
      const confirmed =
        window.confirm(
          `Suspend ${employee.name}? Their linked CHRIS login will also be disabled.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionEmployeeNumber(
          employee.id
        );

        setError("");

        const result =
          await apiRequest(
            `/api/employees/${employee.id}/suspend`,
            {
              method:
                "PATCH",
            }
          );

        showSuccess(
          result.message
        );

        await fetchEmployees();
      } catch (
        requestError
      ) {
        setError(
          requestError.message ||
            "Unable to suspend employee."
        );
      } finally {
        setActionEmployeeNumber(
          null
        );
      }
    };

  /*
  ============================================================
  DEACTIVATE
  ============================================================
  */

  const handleDeactivate =
    async (employee) => {
      const confirmed =
        window.confirm(
          `Deactivate ${employee.name}? Their linked CHRIS login will also be disabled.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionEmployeeNumber(
          employee.id
        );

        setError("");

        const result =
          await apiRequest(
            `/api/employees/${employee.id}/deactivate`,
            {
              method:
                "PATCH",
            }
          );

        showSuccess(
          result.message
        );

        await fetchEmployees();
      } catch (
        requestError
      ) {
        setError(
          requestError.message ||
            "Unable to deactivate employee."
        );
      } finally {
        setActionEmployeeNumber(
          null
        );
      }
    };

  /*
  ============================================================
  REACTIVATE
  ============================================================
  */

  const handleReactivate =
    async (employee) => {
      const confirmed =
        window.confirm(
          `Reactivate ${employee.name}?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionEmployeeNumber(
          employee.id
        );

        setError("");

        const result =
          await apiRequest(
            `/api/employees/${employee.id}/reactivate`,
            {
              method:
                "PATCH",
            }
          );

        showSuccess(
          result.message
        );

        await fetchEmployees();
      } catch (
        requestError
      ) {
        setError(
          requestError.message ||
            "Unable to reactivate employee."
        );
      } finally {
        setActionEmployeeNumber(
          null
        );
      }
    };

  /*
  ============================================================
  OPEN EXIT FORM
  ============================================================
  */

  const openExitForm =
    (employee) => {
      setExitEmployee(
        employee
      );

      setExitStatus(
        "RESIGNED"
      );

      setExitDate(
        new Date()
          .toISOString()
          .slice(0, 10)
      );

      setError("");
    };

  /*
  ============================================================
  PROCESS EXIT
  ============================================================
  */

  const handleExit =
    async (event) => {
      event.preventDefault();

      if (
        !exitEmployee
      ) {
        return;
      }

      if (!exitDate) {
        setError(
          "Exit date is required."
        );

        return;
      }

      try {
        setActionEmployeeNumber(
          exitEmployee.id
        );

        setError("");

        const result =
          await apiRequest(
            `/api/employees/${exitEmployee.id}/exit`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  exitStatus,
                  exitDate,
                }),
            }
          );

        setExitEmployee(
          null
        );

        showSuccess(
          result.message
        );

        await fetchEmployees();
      } catch (
        requestError
      ) {
        setError(
          requestError.message ||
            "Unable to process employee exit."
        );
      } finally {
        setActionEmployeeNumber(
          null
        );
      }
    };

  return (
    <div>
      {/* FILTERS */}

      <div
        style={{
          display:
            "flex",

          gap:
            "15px",

          marginBottom:
            "25px",

          flexWrap:
            "wrap",
        }}
      >
        <input
          type="text"

          placeholder="Search employees, locations..."

          value={
            search
          }

          onChange={(
            event
          ) =>
            setSearch(
              event.target
                .value
            )
          }

          style={
            inputStyle
          }
        />

        <select
          value={
            department
          }

          onChange={(
            event
          ) =>
            setDepartment(
              event.target
                .value
            )
          }

          style={
            inputStyle
          }
        >
          {departments.map(
            (dept) => (
              <option
                key={
                  dept
                }

                value={
                  dept
                }
              >
                {dept}
              </option>
            )
          )}
        </select>

        <select
          value={
            status
          }

          onChange={(
            event
          ) =>
            setStatus(
              event.target
                .value
            )
          }

          style={
            inputStyle
          }
        >
          {statuses.map(
            (item) => (
              <option
                key={
                  item
                }

                value={
                  item
                }
              >
                {item}
              </option>
            )
          )}
        </select>
      </div>

      {/* SUCCESS */}

      {success && (
        <div
          style={
            successStyle
          }
        >
          ✓ {success}
        </div>
      )}

      {/* ERROR */}

      {error && (
        <div
          style={
            errorStyle
          }
        >
          {error}
        </div>
      )}

      {/* EXIT FORM */}

      {exitEmployee && (
        <form
          onSubmit={
            handleExit
          }

          style={
            exitFormStyle
          }
        >
          <div>
            <h3
              style={{
                margin:
                  "0 0 5px",

                color:
                  "#0B5E3B",

                fontSize:
                  "18px",
              }}
            >
              Exit Employee
            </h3>

            <div
              style={{
                color:
                  "#64748B",

                fontSize:
                  "13px",
              }}
            >
              {exitEmployee.name} ·{" "}
              {exitEmployee.id}
            </div>
          </div>

          <div
            style={
              exitGridStyle
            }
          >
            <label>
              <FieldLabel>
                Exit Type
              </FieldLabel>

              <select
                value={
                  exitStatus
                }

                onChange={(
                  event
                ) =>
                  setExitStatus(
                    event.target
                      .value
                  )
                }

                style={
                  inputStyle
                }
              >
                <option value="RESIGNED">
                  Resigned
                </option>

                <option value="TERMINATED">
                  Terminated
                </option>

                <option value="RETIRED">
                  Retired
                </option>
              </select>
            </label>

            <label>
              <FieldLabel>
                Exit Date
              </FieldLabel>

              <input
                type="date"

                value={
                  exitDate
                }

                onChange={(
                  event
                ) =>
                  setExitDate(
                    event.target
                      .value
                  )
                }

                style={
                  inputStyle
                }
              />
            </label>
          </div>

          <div
            style={{
              display:
                "flex",

              justifyContent:
                "flex-end",

              gap:
                "10px",

              marginTop:
                "16px",
            }}
          >
            <button
              type="button"

              onClick={() =>
                setExitEmployee(
                  null
                )
              }

              style={
                cancelButtonStyle
              }
            >
              Cancel
            </button>

            <button
              type="submit"

              style={
                exitButtonStyle
              }
            >
              Confirm Exit
            </button>
          </div>
        </form>
      )}

      {/* DIRECTORY */}

      <div
        style={{
          background:
            "#FFFFFF",

          borderRadius:
            "18px",

          padding:
            "25px",

          boxShadow:
            "0 8px 25px rgba(0,0,0,0.05)",

          border:
            "1px solid #E5E7EB",
        }}
      >
        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap:
              "15px",

            marginBottom:
              "20px",

            flexWrap:
              "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,

                color:
                  "#0B5E3B",

                fontSize:
                  "20px",

                fontWeight:
                  "800",
              }}
            >
              Employee Directory
            </h2>

            <p
              style={{
                margin:
                  "5px 0 0",

                color:
                  "#64748B",

                fontSize:
                  "13px",
              }}
            >
              {loading
                ? "Loading employees..."
                : `${filteredEmployees.length} employee${
                    filteredEmployees.length !==
                    1
                      ? "s"
                      : ""
                  }`}
            </p>
          </div>
        </div>

        <div
          style={{
            width:
              "100%",

            overflowX:
              "auto",
          }}
        >
          <table
            style={{
              width:
                "100%",

              minWidth:
                "1150px",

              borderCollapse:
                "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background:
                    "#F3F6F4",
                }}
              >
                <th style={th}>
                  Employee ID
                </th>

                <th style={th}>
                  Name
                </th>

                <th style={th}>
                  Department
                </th>

                <th style={th}>
                  Designation
                </th>

                <th style={th}>
                  Location
                </th>

                <th style={th}>
                  Status
                </th>

                <th style={th}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="7"

                    style={
                      emptyCellStyle
                    }
                  >
                    Loading employee records...
                  </td>
                </tr>
              ) : filteredEmployees.length >
                0 ? (
                filteredEmployees.map(
                  (employee) => {
                    const updating =
                      actionEmployeeNumber ===
                      employee.id;

                    const exited = [
                      "Terminated",
                      "Resigned",
                      "Retired",
                    ].includes(
                      employee.status
                    );

                    const suspended =
                      employee.status ===
                      "Suspended";

                    const inactive =
                      employee.status ===
                      "Inactive";

                    return (
                      <tr
                        key={
                          employee.databaseId
                        }
                      >
                        <td style={td}>
                          {employee.id}
                        </td>

                        <td
                          style={{
                            ...td,

                            fontWeight:
                              "700",

                            color:
                              "#0F172A",
                          }}
                        >
                          {employee.name}
                        </td>

                        <td style={td}>
                          {employee.department}
                        </td>

                        <td style={td}>
                          {employee.designation}
                        </td>

                        <td style={td}>
                          <div
                            style={{
                              fontWeight:
                                "700",

                              color:
                                "#334155",
                            }}
                          >
                            {employee.location}
                          </div>

                          {employee.locationCode && (
                            <div
                              style={{
                                marginTop:
                                  "3px",

                                fontSize:
                                  "10px",

                                color:
                                  "#94A3B8",
                              }}
                            >
                              {employee.locationCode}
                            </div>
                          )}
                        </td>

                        <td style={td}>
                          <StatusBadge
                            status={
                              employee.status
                            }
                          />
                        </td>

                        <td style={td}>
                          <div
                            style={
                              actionRowStyle
                            }
                          >
                            <button
                              type="button"

                              onClick={() =>
                                navigate(
                                  `/employees/${employee.id}`
                                )
                              }

                              style={
                                viewButtonStyle
                              }
                            >
                              <FaEye />
                              View
                            </button>

                            {canUpdateEmployees &&
                              !exited &&
                              !suspended &&
                              !inactive && (
                                <>
                                  <button
                                    type="button"

                                    disabled={
                                      updating
                                    }

                                    onClick={() =>
                                      handleSuspend(
                                        employee
                                      )
                                    }

                                    style={
                                      suspendButtonStyle
                                    }
                                  >
                                    <FaPauseCircle />
                                    Suspend
                                  </button>

                                  <button
                                    type="button"

                                    disabled={
                                      updating
                                    }

                                    onClick={() =>
                                      handleDeactivate(
                                        employee
                                      )
                                    }

                                    style={
                                      deactivateButtonStyle
                                    }
                                  >
                                    <FaUserSlash />
                                    Deactivate
                                  </button>

                                  <button
                                    type="button"

                                    disabled={
                                      updating
                                    }

                                    onClick={() =>
                                      openExitForm(
                                        employee
                                      )
                                    }

                                    style={
                                      exitButtonSmallStyle
                                    }
                                  >
                                    <FaSignOutAlt />
                                    Exit
                                  </button>
                                </>
                              )}

                            {canUpdateEmployees &&
                              (suspended ||
                                inactive) && (
                                <button
                                  type="button"

                                  disabled={
                                    updating
                                  }

                                  onClick={() =>
                                    handleReactivate(
                                      employee
                                    )
                                  }

                                  style={
                                    reactivateButtonStyle
                                  }
                                >
                                  <FaUndo />
                                  Reactivate
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )
              ) : (
                <tr>
                  <td
                    colSpan="7"

                    style={
                      emptyCellStyle
                    }
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

function FieldLabel({
  children,
}) {
  return (
    <div
      style={{
        marginBottom:
          "6px",

        color:
          "#334155",

        fontSize:
          "12px",

        fontWeight:
          "800",
      }}
    >
      {children}
    </div>
  );
}

function formatStatus(
  status
) {
  const labels = {
    ACTIVE:
      "Active",

    PROBATION:
      "Probation",

    LEAVE:
      "Leave",

    SUSPENDED:
      "Suspended",

    TERMINATED:
      "Terminated",

    RESIGNED:
      "Resigned",

    RETIRED:
      "Retired",

    INACTIVE:
      "Inactive",
  };

  return (
    labels[status] ||
    status
  );
}

function StatusBadge({
  status,
}) {
  let background =
    "#F1F5F9";

  let color =
    "#475569";

  if (
    status ===
    "Active"
  ) {
    background =
      "#E8F8F0";

    color =
      "#087443";
  }

  if (
    status ===
    "Leave"
  ) {
    background =
      "#FFF4E5";

    color =
      "#B45309";
  }

  if (
    status ===
    "Probation"
  ) {
    background =
      "#F0E9FF";

    color =
      "#6D28D9";
  }

  if (
    status ===
    "Suspended"
  ) {
    background =
      "#FEF2F2";

    color =
      "#B91C1C";
  }

  return (
    <span
      style={{
        display:
          "inline-flex",

        alignItems:
          "center",

        padding:
          "6px 10px",

        borderRadius:
          "999px",

        background,

        color,

        fontSize:
          "12px",

        fontWeight:
          "700",
      }}
    >
      {status}
    </span>
  );
}

const inputStyle = {
  padding:
    "12px 14px",

  borderRadius:
    "10px",

  border:
    "1px solid #D1D5DB",

  minWidth:
    "220px",

  background:
    "#FFFFFF",

  color:
    "#0F172A",

  fontSize:
    "14px",

  outline:
    "none",
};

const th = {
  textAlign:
    "left",

  padding:
    "14px",

  color:
    "#475569",

  fontSize:
    "12px",

  fontWeight:
    "800",

  textTransform:
    "uppercase",

  letterSpacing:
    "0.03em",

  borderBottom:
    "1px solid #E5E7EB",
};

const td = {
  padding:
    "15px 14px",

  borderBottom:
    "1px solid #EEF2F1",

  color:
    "#475569",

  fontSize:
    "14px",

  verticalAlign:
    "top",
};

const actionRowStyle = {
  display:
    "flex",

  gap:
    "6px",

  flexWrap:
    "wrap",

  minWidth:
    "310px",
};

const baseActionButton = {
  display:
    "inline-flex",

  alignItems:
    "center",

  gap:
    "5px",

  padding:
    "7px 9px",

  borderRadius:
    "7px",

  fontSize:
    "10px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const viewButtonStyle = {
  ...baseActionButton,

  border:
    "1px solid #0B5E3B",

  background:
    "#0B5E3B",

  color:
    "#FFFFFF",
};

const suspendButtonStyle = {
  ...baseActionButton,

  border:
    "1px solid #FDE68A",

  background:
    "#FFFBEB",

  color:
    "#92400E",
};

const deactivateButtonStyle = {
  ...baseActionButton,

  border:
    "1px solid #CBD5E1",

  background:
    "#F8FAFC",

  color:
    "#475569",
};

const exitButtonSmallStyle = {
  ...baseActionButton,

  border:
    "1px solid #FECACA",

  background:
    "#FEF2F2",

  color:
    "#B91C1C",
};

const reactivateButtonStyle = {
  ...baseActionButton,

  border:
    "1px solid #A7F3D0",

  background:
    "#ECFDF5",

  color:
    "#047857",
};

const exitFormStyle = {
  marginBottom:
    "22px",

  padding:
    "20px",

  background:
    "#FFFFFF",

  border:
    "1px solid #FECACA",

  borderRadius:
    "14px",

  boxShadow:
    "0 7px 22px rgba(15,23,42,0.05)",
};

const exitGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",

  gap:
    "15px",

  marginTop:
    "16px",
};

const cancelButtonStyle = {
  padding:
    "10px 14px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "8px",

  background:
    "#FFFFFF",

  color:
    "#475569",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const exitButtonStyle = {
  padding:
    "10px 14px",

  border:
    "none",

  borderRadius:
    "8px",

  background:
    "#B91C1C",

  color:
    "#FFFFFF",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const successStyle = {
  marginBottom:
    "18px",

  padding:
    "13px 15px",

  background:
    "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "10px",

  color:
    "#047857",

  fontSize:
    "13px",

  fontWeight:
    "700",
};

const errorStyle = {
  marginBottom:
    "18px",

  padding:
    "13px 15px",

  background:
    "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius:
    "10px",

  color:
    "#B91C1C",

  fontSize:
    "13px",

  fontWeight:
    "700",
};

const emptyCellStyle = {
  padding:
    "40px",

  textAlign:
    "center",

  color:
    "#64748B",
};

export default EmployeeTable;