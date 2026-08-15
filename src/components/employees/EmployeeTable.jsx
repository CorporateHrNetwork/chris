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
  FaMapMarkerAlt,
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
    organizationLocations,
    setOrganizationLocations,
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
    locationFilter,
    setLocationFilter,
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
  REINSTATE FORM STATE
  ============================================================
  */

  const [
    reinstateEmployee,
    setReinstateEmployee,
  ] = useState(null);

  const [
    reinstateStatus,
    setReinstateStatus,
  ] = useState("ACTIVE");

  const [
    reinstateEffectiveDate,
    setReinstateEffectiveDate,
  ] = useState(
    new Date()
      .toISOString()
      .slice(0, 10)
  );

  const [
    reinstateReason,
    setReinstateReason,
  ] = useState("");

  const [
    reinstateNotes,
    setReinstateNotes,
  ] = useState("");

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

                locationId:
                  employee.location
                    ?.id ||
                  null,

                location:
                  employee.location
                    ?.name ||
                  "Not Assigned",

                locationCode:
                  employee.location
                    ?.code ||
                  "",

                locationType:
                  employee.location
                    ?.type ||
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

          showError(
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
  LOAD ORGANIZATION LOCATION CATALOGUE
  ============================================================
  */

  const fetchOrganizationLocations =
    useCallback(
      async () => {
        try {
          const result =
            await apiRequest(
              "/api/location-catalog"
            );

          setOrganizationLocations(
            result.data || []
          );
        } catch (err) {
          console.error(
            "CHRIS location catalogue error:",
            err
          );

          showError(
            err.message ||
              "CHRIS could not load organization locations."
          );
        }
      },
      []
    );

  useEffect(() => {
    fetchOrganizationLocations();
  }, [fetchOrganizationLocations]);

  /*
  ============================================================
  FILTER OPTIONS
  ============================================================
  */

  const departments =
    useMemo(
      () => [
        "All",
        ...Array.from(
          new Set(
            employees
              .map(
                (employee) =>
                  employee.department
              )
              .filter(Boolean)
          )
        ).sort(),
      ],
      [employees]
    );

  const locations =
    useMemo(
      () => [
        {
          id: "All",
          name: "All Locations",
          code: "",
          employeeCount:
            employees.length,
        },

        ...organizationLocations.map(
          (location) => ({
            id:
              location.id,

            name:
              location.name,

            code:
              location.code,

            employeeCount:
              location.employeeCount || 0,
          })
        ),
      ],
      [
        organizationLocations,
        employees.length,
      ]
    );

  const statuses =
    useMemo(
      () => [
        "All",
        ...Array.from(
          new Set(
            employees
              .map(
                (employee) =>
                  employee.status
              )
              .filter(Boolean)
          )
        ).sort(),
      ],
      [employees]
    );

  /*
  ============================================================
  FILTERED EMPLOYEES
  ============================================================
  */

  const filteredEmployees =
    useMemo(() => {
      return employees.filter(
        (employee) => {
          const searchTerm =
            search
              .toLowerCase()
              .trim();

          const searchMatch =
            !searchTerm ||
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
              ) ||
            employee.email
              .toLowerCase()
              .includes(
                searchTerm
              );

          const departmentMatch =
            department ===
              "All" ||
            employee.department ===
              department;

          const locationMatch =
            locationFilter ===
              "All" ||
            employee.locationId ===
              locationFilter;

          const statusMatch =
            status ===
              "All" ||
            employee.status ===
              status;

          return (
            searchMatch &&
            departmentMatch &&
            locationMatch &&
            statusMatch
          );
        }
      );
    }, [
      employees,
      search,
      department,
      locationFilter,
      status,
    ]);

  /*
  ============================================================
  LOCATION COUNTS
  ============================================================
  */

  const selectedLocation =
    locations.find(
      (location) =>
        location.id ===
        locationFilter
    );

  const currentLocationCount =
    locationFilter ===
    "All"
      ? employees.length
      : employees.filter(
          (employee) =>
            employee.locationId ===
            locationFilter
        ).length;

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
  ERROR MESSAGE
  ============================================================
  */

  const showError =
    (message) => {
      setError(
        message
      );

      setTimeout(() => {
        setError("");
      }, 5000);
    };

  /*
  ============================================================
  SUSPEND
  ============================================================

  This controlled transaction is completed on Employee Profile,
  where HR provides the required effective date and supporting
  information.
  ============================================================
  */

  const handleSuspend =
    (employee) => {
      setError("");
      setSuccess("");

      navigate(
        `/employees/${employee.id}?action=suspend`
      );
    };

  /*
  ============================================================
  DEACTIVATE
  ============================================================

  This controlled transaction is completed on Employee Profile,
  where HR provides the required effective date and supporting
  information.
  ============================================================
  */

  const handleDeactivate =
    (employee) => {
      setError("");
      setSuccess("");

      navigate(
        `/employees/${employee.id}?action=deactivate`
      );
    };

  /*
  ============================================================
  REACTIVATE
  ============================================================

  This controlled transaction is completed on Employee Profile,
  where HR provides the required effective date and supporting
  information.
  ============================================================
  */

  const handleReactivate =
    (employee) => {
      setError("");
      setSuccess("");

      navigate(
        `/employees/${employee.id}?action=reactivate`
      );
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
        showError(
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
        showError(
          requestError.message ||
            "Unable to process employee exit."
        );
      } finally {
        setActionEmployeeNumber(
          null
        );
      }
    };

  /*
  ============================================================
  OPEN REINSTATE FORM
  ============================================================
  */

  const openReinstateForm =
    (employee) => {
      /*
      Exit and Reinstate forms should not be open
      simultaneously.
      */

      setExitEmployee(
        null
      );

      setReinstateEmployee(
        employee
      );

      setReinstateStatus(
        "ACTIVE"
      );

      setReinstateEffectiveDate(
        new Date()
          .toISOString()
          .slice(0, 10)
      );

      setReinstateReason(
        ""
      );

      setReinstateNotes(
        ""
      );

      setError("");
      setSuccess("");
    };

  /*
  ============================================================
  PROCESS REINSTATEMENT
  ============================================================
  */

  const handleReinstate =
    async (event) => {
      event.preventDefault();

      if (
        !reinstateEmployee
      ) {
        return;
      }

      if (
        !reinstateEffectiveDate
      ) {
        showError(
          "Reinstatement effective date is required."
        );

        return;
      }

      try {
        setActionEmployeeNumber(
          reinstateEmployee.id
        );

        setError("");

        const result =
          await apiRequest(
            `/api/employees/${reinstateEmployee.id}/reinstate`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  status:
                    reinstateStatus,

                  effectiveDate:
                    reinstateEffectiveDate,

                  reason:
                    reinstateReason
                      .trim(),

                  notes:
                    reinstateNotes
                      .trim(),
                }),
            }
          );

        setReinstateEmployee(
          null
        );

        setReinstateReason(
          ""
        );

        setReinstateNotes(
          ""
        );

        showSuccess(
          result.message
        );

        await fetchEmployees();
      } catch (
        requestError
      ) {
        showError(
          requestError.message ||
            "Unable to reinstate employee."
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
        style={
          filtersPanelStyle
        }
      >
        <div
          style={{
            flex:
              "1 1 280px",
          }}
        >
          <FilterLabel>
            Search
          </FilterLabel>

          <input
            type="text"

            placeholder="Search employee, ID, branch, department..."

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

            style={{
              ...inputStyle,

              width:
                "100%",

              boxSizing:
                "border-box",
            }}
          />
        </div>

        <div
          style={
            filterFieldStyle
          }
        >
          <FilterLabel>
            Location / Branch
          </FilterLabel>

          <div
            style={{
              position:
                "relative",
            }}
          >
            <FaMapMarkerAlt
              style={{
                position:
                  "absolute",

                left:
                  "12px",

                top:
                  "50%",

                transform:
                  "translateY(-50%)",

                color:
                  "#0B5E3B",

                pointerEvents:
                  "none",
              }}
            />

            <select
              value={
                locationFilter
              }

              onChange={(
                event
              ) =>
                setLocationFilter(
                  event.target
                    .value
                )
              }

              style={{
                ...inputStyle,

                width:
                  "100%",

                paddingLeft:
                  "34px",

                boxSizing:
                  "border-box",

                fontWeight:
                  "700",

                color:
                  "#0B5E3B",
              }}
            >
              {locations.map(
                (location) => (
                  <option
                    key={
                      location.id
                    }

                    value={
                      location.id
                    }
                  >
                    {location.name}
                    {location.id !==
                    "All"
                      ? ` (${location.employeeCount})`
                      : ""}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        <div
          style={
            filterFieldStyle
          }
        >
          <FilterLabel>
            Department
          </FilterLabel>

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

            style={{
              ...inputStyle,

              width:
                "100%",

              boxSizing:
                "border-box",
            }}
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
                  {dept ===
                  "All"
                    ? "All Departments"
                    : dept}
                </option>
              )
            )}
          </select>
        </div>

        <div
          style={
            filterFieldStyle
          }
        >
          <FilterLabel>
            Status
          </FilterLabel>

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

            style={{
              ...inputStyle,

              width:
                "100%",

              boxSizing:
                "border-box",
            }}
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
                  {item ===
                  "All"
                    ? "All Statuses"
                    : item}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      {/* CURRENT LOCATION SUMMARY */}

      <div
        style={
          locationSummaryStyle
        }
      >
        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            gap:
              "9px",
          }}
        >
          <div
            style={
              locationIconStyle
            }
          >
            <FaMapMarkerAlt />
          </div>

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
                  "0.04em",
              }}
            >
              Viewing Location
            </div>

            <div
              style={{
                marginTop:
                  "2px",

                color:
                  "#0B5E3B",

                fontSize:
                  "15px",

                fontWeight:
                  "800",
              }}
            >
              {selectedLocation
                ?.name ||
                "All Locations"}
            </div>
          </div>
        </div>

        <div
          style={{
            textAlign:
              "right",
          }}
        >
          <div
            style={{
              color:
                "#0B5E3B",

              fontSize:
                "22px",

              fontWeight:
                "800",
            }}
          >
            {
              currentLocationCount
            }
          </div>

          <div
            style={{
              color:
                "#64748B",

              fontSize:
                "10px",

              fontWeight:
                "700",
            }}
          >
            employee
            {currentLocationCount ===
            1
              ? ""
              : "s"}
          </div>
        </div>
      </div>

      {/* SUCCESS */}

      {success && (
        <div
          style={
            successStyle
          }
        >
          âœ“ {success}
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
              {exitEmployee.name} Â·{" "}
              {exitEmployee.id}
            </div>
          </div>

          <div
            style={
              exitGridStyle
            }
          >
            <label>
              <FilterLabel>
                Exit Type
              </FilterLabel>

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
              <FilterLabel>
                Exit Date
              </FilterLabel>

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

      {/* REINSTATE FORM */}

      {reinstateEmployee && (
        <form
          onSubmit={
            handleReinstate
          }

          style={
            reinstateFormStyle
          }
        >
          <div>
            <h3
              style={{
                margin:
                  "0 0 5px",

                color:
                  "#047857",

                fontSize:
                  "18px",
              }}
            >
              Reinstate Employee
            </h3>

            <div
              style={{
                color:
                  "#64748B",

                fontSize:
                  "13px",
              }}
            >
              {reinstateEmployee.name} Â·{" "}
              {reinstateEmployee.id}
            </div>

            <div
              style={{
                marginTop:
                  "7px",

                color:
                  "#64748B",

                fontSize:
                  "12px",

                lineHeight:
                  "1.5",
              }}
            >
              Current status:{" "}
              <strong>
                {reinstateEmployee.status}
              </strong>
              . Reinstatement clears the employee's exit date
              and restores the same employment relationship.
            </div>
          </div>

          <div
            style={
              reinstateGridStyle
            }
          >
            <label>
              <FilterLabel>
                Restored Status
              </FilterLabel>

              <select
                value={
                  reinstateStatus
                }

                onChange={(
                  event
                ) =>
                  setReinstateStatus(
                    event.target
                      .value
                  )
                }

                style={{
                  ...inputStyle,

                  width:
                    "100%",

                  boxSizing:
                    "border-box",
                }}
              >
                <option value="ACTIVE">
                  Active
                </option>

                <option value="PROBATION">
                  Probation
                </option>
              </select>
            </label>

            <label>
              <FilterLabel>
                Effective Date
              </FilterLabel>

              <input
                type="date"

                value={
                  reinstateEffectiveDate
                }

                onChange={(
                  event
                ) =>
                  setReinstateEffectiveDate(
                    event.target
                      .value
                  )
                }

                style={{
                  ...inputStyle,

                  width:
                    "100%",

                  boxSizing:
                    "border-box",
                }}
              />
            </label>

            <label>
              <FilterLabel>
                Reason
              </FilterLabel>

              <input
                type="text"

                placeholder="e.g. Exit entered in error"

                value={
                  reinstateReason
                }

                onChange={(
                  event
                ) =>
                  setReinstateReason(
                    event.target
                      .value
                  )
                }

                style={{
                  ...inputStyle,

                  width:
                    "100%",

                  boxSizing:
                    "border-box",
                }}
              />
            </label>
          </div>

          <div
            style={{
              marginTop:
                "15px",
            }}
          >
            <FilterLabel>
              Notes
            </FilterLabel>

            <textarea
              value={
                reinstateNotes
              }

              onChange={(
                event
              ) =>
                setReinstateNotes(
                  event.target
                    .value
                )
              }

              placeholder="Optional HR notes concerning the reinstatement..."

              rows={3}

              style={
                reinstateTextareaStyle
              }
            />
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
                setReinstateEmployee(
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

              disabled={
                actionEmployeeNumber ===
                reinstateEmployee.id
              }

              style={
                confirmReinstateButtonStyle
              }
            >
              {actionEmployeeNumber ===
              reinstateEmployee.id
                ? "Reinstating..."
                : "Confirm Reinstate"}
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
                  } matching current filters`}
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
                              display:
                                "flex",

                              alignItems:
                                "center",

                              gap:
                                "6px",

                              fontWeight:
                                "700",

                              color:
                                "#334155",
                            }}
                          >
                            <FaMapMarkerAlt
                              size={11}
                              color="#0B5E3B"
                            />

                            {
                              employee.location
                            }
                          </div>

                          {employee.locationCode && (
                            <div
                              style={{
                                marginTop:
                                  "3px",

                                marginLeft:
                                  "17px",

                                fontSize:
                                  "10px",

                                color:
                                  "#94A3B8",
                              }}
                            >
                              {
                                employee.locationCode
                              }
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

                            {canUpdateEmployees &&
                              exited && (
                                <button
                                  type="button"

                                  disabled={
                                    updating
                                  }

                                  onClick={() =>
                                    openReinstateForm(
                                      employee
                                    )
                                  }

                                  style={
                                    reinstateButtonStyle
                                  }
                                >
                                  <FaUndo />
                                  Reinstate
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
                    No employees found for the selected location or filters.
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

function FilterLabel({
  children,
}) {
  return (
    <div
      style={{
        marginBottom:
          "6px",

        color:
          "#475569",

        fontSize:
          "10px",

        fontWeight:
          "800",

        textTransform:
          "uppercase",

        letterSpacing:
          "0.04em",
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

  if (
    [
      "Terminated",
      "Resigned",
      "Retired",
      "Inactive",
    ].includes(
      status
    )
  ) {
    background =
      "#F1F5F9";

    color =
      "#475569";
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

const filtersPanelStyle = {
  display:
    "flex",

  alignItems:
    "flex-end",

  gap:
    "14px",

  flexWrap:
    "wrap",

  marginBottom:
    "14px",

  padding:
    "16px",

  background:
    "#FFFFFF",

  border:
    "1px solid #E5E7EB",

  borderRadius:
    "14px",

  boxShadow:
    "0 5px 18px rgba(15,23,42,0.04)",
};

const filterFieldStyle = {
  flex:
    "1 1 190px",

  minWidth:
    "180px",
};

const inputStyle = {
  padding:
    "11px 13px",

  borderRadius:
    "9px",

  border:
    "1px solid #CBD5E1",

  minWidth:
    "180px",

  background:
    "#FFFFFF",

  color:
    "#0F172A",

  fontSize:
    "13px",

  outline:
    "none",
};

const locationSummaryStyle = {
  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "space-between",

  gap:
    "15px",

  marginBottom:
    "18px",

  padding:
    "13px 16px",

  background:
    "#F0FDF4",

  border:
    "1px solid #BBF7D0",

  borderRadius:
    "12px",
};

const locationIconStyle = {
  width:
    "34px",

  height:
    "34px",

  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "center",

  borderRadius:
    "9px",

  background:
    "#FFFFFF",

  color:
    "#0B5E3B",

  border:
    "1px solid #D1FAE5",
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

const reinstateButtonStyle = {
  ...baseActionButton,

  border:
    "1px solid #86EFAC",

  background:
    "#F0FDF4",

  color:
    "#047857",
};

const reinstateFormStyle = {
  marginBottom:
    "22px",

  padding:
    "20px",

  background:
    "#FFFFFF",

  border:
    "1px solid #A7F3D0",

  borderRadius:
    "14px",

  boxShadow:
    "0 7px 22px rgba(15,23,42,0.05)",
};

const reinstateGridStyle = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",

  gap:
    "15px",

  marginTop:
    "16px",
};

const reinstateTextareaStyle = {
  width:
    "100%",

  boxSizing:
    "border-box",

  resize:
    "vertical",

  minHeight:
    "82px",

  padding:
    "11px 13px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "9px",

  background:
    "#FFFFFF",

  color:
    "#0F172A",

  fontFamily:
    "inherit",

  fontSize:
    "13px",

  outline:
    "none",
};

const confirmReinstateButtonStyle = {
  padding:
    "10px 14px",

  border:
    "none",

  borderRadius:
    "8px",

  background:
    "#047857",

  color:
    "#FFFFFF",

  fontWeight:
    "800",

  cursor:
    "pointer",
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