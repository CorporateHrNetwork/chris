import {
  useEffect,
  useState,
} from "react";

import {
  FaSave,
  FaTimes,
  FaUserShield,
  FaBuilding,
  FaMapMarkerAlt,
  FaEnvelope,
  FaIdBadge,
} from "react-icons/fa";

import {
  apiRequest,
} from "../../services/api";

function EditUserForm({
  user,
  roles,
  onCancel,
  onUpdated,
}) {
  const [
    firstName,
    setFirstName,
  ] = useState("");

  const [
    lastName,
    setLastName,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    selectedRoleIds,
    setSelectedRoleIds,
  ] = useState([]);

  const [
    locationScope,
    setLocationScope,
  ] = useState(
    "ALL_LOCATIONS"
  );

  const [
    selectedLocationIds,
    setSelectedLocationIds,
  ] = useState([]);

  const [
    locations,
    setLocations,
  ] = useState([]);

  const [
    locationsLoading,
    setLocationsLoading,
  ] = useState(true);

  const [
    locationsError,
    setLocationsError,
  ] = useState("");

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  /*
  ============================================================
  LOAD USER
  ============================================================
  */

  useEffect(() => {
    if (!user) {
      return;
    }

    setFirstName(
      user.firstName || ""
    );

    setLastName(
      user.lastName || ""
    );

    setEmail(
      user.email || ""
    );

    setSelectedRoleIds(
      (user.roles || []).map(
        (role) => role.id
      )
    );

    setLocationScope(
      user.locationScope ||
        "ALL_LOCATIONS"
    );

    setSelectedLocationIds(
      (
        user.assignedLocations ||
        []
      ).map(
        (location) =>
          location.id
      )
    );

    setError("");
  }, [user]);

  /*
  ============================================================
  LOAD ORGANIZATION LOCATIONS
  ============================================================
  */

  useEffect(() => {
    let active = true;

    const loadLocations =
      async () => {
        try {
          setLocationsLoading(
            true
          );

          setLocationsError("");

          const result =
            await apiRequest(
              "/api/locations"
            );

          if (!active) {
            return;
          }

          const availableLocations =
            (
              result.data || []
            ).filter(
              (location) =>
                location.isActive !==
                false
            );

          setLocations(
            availableLocations
          );
        } catch (
          requestError
        ) {
          console.error(
            "CHRIS locations fetch error:",
            requestError
          );

          if (!active) {
            return;
          }

          setLocationsError(
            requestError.message ||
              "Unable to load organization locations."
          );
        } finally {
          if (active) {
            setLocationsLoading(
              false
            );
          }
        }
      };

    loadLocations();

    return () => {
      active = false;
    };
  }, []);

  /*
  ============================================================
  ROLE SELECTION
  ============================================================
  */

  const toggleRole =
    (roleId) => {
      setSelectedRoleIds(
        (current) => {
          if (
            current.includes(
              roleId
            )
          ) {
            return current.filter(
              (id) =>
                id !== roleId
            );
          }

          return [
            ...current,
            roleId,
          ];
        }
      );
    };

  /*
  ============================================================
  LOCATION SELECTION
  ============================================================
  */

  const toggleLocation =
    (locationId) => {
      setSelectedLocationIds(
        (current) => {
          if (
            current.includes(
              locationId
            )
          ) {
            return current.filter(
              (id) =>
                id !==
                locationId
            );
          }

          return [
            ...current,
            locationId,
          ];
        }
      );
    };

  const handleScopeChange =
    (scope) => {
      setLocationScope(
        scope
      );

      setError("");

      if (
        scope ===
          "ASSIGNED_LOCATIONS" &&
        selectedLocationIds.length ===
          0 &&
        user?.employee
          ?.locationId
      ) {
        setSelectedLocationIds([
          user.employee
            .locationId,
        ]);
      }
    };

  /*
  ============================================================
  SUBMIT
  ============================================================
  */

  const handleSubmit =
    async (event) => {
      event.preventDefault();

      setError("");

      const employeeLinked =
        Boolean(
          user?.employeeId &&
            user?.employee
        );

      /*
      Bootstrap / unlinked accounts
      still require editable identity.
      */

      if (
        !employeeLinked &&
        (
          !firstName.trim() ||
          !lastName.trim() ||
          !email.trim()
        )
      ) {
        setError(
          "Complete all required fields."
        );

        return;
      }

      if (
        selectedRoleIds.length ===
        0
      ) {
        setError(
          "Assign at least one role to the user."
        );

        return;
      }

      if (
        locationScope ===
          "ASSIGNED_LOCATIONS" &&
        selectedLocationIds.length ===
          0
      ) {
        setError(
          "Select at least one organization location for this user's restricted access."
        );

        return;
      }

      try {
        setSaving(true);

        const payload = {
          roleIds:
            selectedRoleIds,

          locationScope,

          locationIds:
            locationScope ===
            "ASSIGNED_LOCATIONS"
              ? selectedLocationIds
              : [],
        };

        /*
        Only unlinked bootstrap accounts
        submit editable identity.
        */

        if (!employeeLinked) {
          payload.firstName =
            firstName.trim();

          payload.lastName =
            lastName.trim();

          payload.email =
            email
              .trim()
              .toLowerCase();
        }

        const result =
          await apiRequest(
            `/api/users/${user.id}`,
            {
              method: "PUT",

              body:
                JSON.stringify(
                  payload
                ),
            }
          );

        if (onUpdated) {
          await onUpdated(
            result.data
          );
        }
      } catch (
        requestError
      ) {
        console.error(
          "CHRIS user update error:",
          requestError
        );

        setError(
          requestError.message ||
            "Unable to update CHRIS user."
        );
      } finally {
        setSaving(false);
      }
    };

  if (!user) {
    return null;
  }

  const employeeLinked =
    Boolean(
      user.employeeId &&
        user.employee
    );

  const employee =
    user.employee ||
    null;

  const currentWorkLocation =
    employee?.location ||
    null;

  const employeeName =
    employee
      ? [
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  return (
    <div
      style={{
        background:
          "#FFFFFF",

        border:
          "1px solid #DDE5E1",

        borderRadius:
          "16px",

        padding:
          "24px",

        marginBottom:
          "24px",

        boxShadow:
          "0 8px 24px rgba(15,23,42,0.06)",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap: "16px",

          marginBottom:
            "22px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",

              alignItems:
                "center",

              gap: "9px",

              marginBottom:
                "5px",
            }}
          >
            <FaUserShield
              style={{
                color:
                  "#D4AF37",

                fontSize:
                  "20px",
              }}
            />

            <h2
              style={{
                margin: 0,

                color:
                  "#0B5E3B",

                fontSize:
                  "21px",

                fontWeight:
                  "800",
              }}
            >
              Edit User Access
            </h2>
          </div>

          <p
            style={{
              margin: 0,

              color:
                "#64748B",

              fontSize:
                "13px",

              lineHeight:
                1.6,
            }}
          >
            Manage CHRIS roles
            and organization-location
            access.
          </p>
        </div>

        <button
          type="button"

          onClick={
            onCancel
          }

          disabled={
            saving
          }

          style={{
            border:
              "none",

            background:
              "#F1F5F9",

            color:
              "#475569",

            width:
              "36px",

            height:
              "36px",

            borderRadius:
              "9px",

            cursor:
              saving
                ? "not-allowed"
                : "pointer",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",
          }}

          title="Close"
        >
          <FaTimes />
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div
          style={{
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
              "600",
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={
          handleSubmit
        }
      >
        {/* EMPLOYEE-LINKED IDENTITY */}

        {employeeLinked && (
          <div
            style={
              employeeCardStyle
            }
          >
            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  "8px",

                marginBottom:
                  "15px",
              }}
            >
              <FaIdBadge
                style={{
                  color:
                    "#D4AF37",

                  fontSize:
                    "18px",
                }}
              />

              <div>
                <div
                  style={{
                    color:
                      "#0B5E3B",

                    fontSize:
                      "14px",

                    fontWeight:
                      "800",
                  }}
                >
                  Employee
                  Master Record
                </div>

                <div
                  style={{
                    marginTop:
                      "2px",

                    color:
                      "#64748B",

                    fontSize:
                      "11px",
                  }}
                >
                  Identity is
                  read-only in
                  User Management.
                </div>
              </div>
            </div>

            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))",

                gap:
                  "14px",
              }}
            >
              <ReadOnlyItem
                label="Employee"
                value={
                  employeeName ||
                  "—"
                }
              />

              <ReadOnlyItem
                label="Employee Number"
                value={
                  employee.employeeNumber ||
                  "—"
                }
              />

              <ReadOnlyItem
                label="Email"
                value={
                  employee.email ||
                  "—"
                }
              />

              <ReadOnlyItem
                label="Department"
                value={
                  employee.department
                    ?.name ||
                  "—"
                }
              />

              <ReadOnlyItem
                label="Designation"
                value={
                  employee.designation
                    ?.name ||
                  "—"
                }
              />

              <ReadOnlyItem
                label="Current Work Location"
                value={
                  currentWorkLocation
                    ?.name ||
                  "Not assigned"
                }
              />
            </div>

            <div
              style={{
                marginTop:
                  "15px",

                padding:
                  "10px 12px",

                background:
                  "#FFFFFF",

                border:
                  "1px solid #DDE5E1",

                borderRadius:
                  "9px",

                color:
                  "#64748B",

                fontSize:
                  "11px",

                lineHeight:
                  1.6,
              }}
            >
              To change the
              employee's name,
              email, department,
              designation or work
              location, update the
              Employee Profile.
            </div>
          </div>
        )}

        {/* BOOTSTRAP ACCOUNT IDENTITY */}

        {!employeeLinked && (
          <div
            style={{
              marginBottom:
                "24px",
            }}
          >
            <SectionTitle>
              Bootstrap Account
              Identity
            </SectionTitle>

            <div
              style={{
                padding:
                  "11px 13px",

                marginBottom:
                  "15px",

                background:
                  "#FFF7ED",

                border:
                  "1px solid #FED7AA",

                borderRadius:
                  "9px",

                color:
                  "#9A3412",

                fontSize:
                  "11px",

                lineHeight:
                  1.6,
              }}
            >
              This is an unlinked
              CHRIS setup account
              without an Employee
              master record. Its
              identity may be
              maintained here until
              it is linked or retired.
            </div>

            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",

                gap:
                  "18px",
              }}
            >
              <FormField
                label="First Name"
                required
              >
                <input
                  type="text"

                  value={
                    firstName
                  }

                  onChange={(
                    event
                  ) =>
                    setFirstName(
                      event.target
                        .value
                    )
                  }

                  disabled={
                    saving
                  }

                  style={
                    inputStyle
                  }
                />
              </FormField>

              <FormField
                label="Last Name"
                required
              >
                <input
                  type="text"

                  value={
                    lastName
                  }

                  onChange={(
                    event
                  ) =>
                    setLastName(
                      event.target
                        .value
                    )
                  }

                  disabled={
                    saving
                  }

                  style={
                    inputStyle
                  }
                />
              </FormField>

              <FormField
                label="Email Address"
                required
              >
                <input
                  type="email"

                  value={
                    email
                  }

                  onChange={(
                    event
                  ) =>
                    setEmail(
                      event.target
                        .value
                    )
                  }

                  disabled={
                    saving
                  }

                  style={
                    inputStyle
                  }
                />
              </FormField>
            </div>
          </div>
        )}

        {/* ROLES */}

        <div
          style={{
            marginTop:
              "24px",
          }}
        >
          <SectionTitle>
            Assigned Roles *
          </SectionTitle>

          <p
            style={{
              margin:
                "-4px 0 12px",

              color:
                "#64748B",

              fontSize:
                "11px",

              lineHeight:
                1.5,
            }}
          >
            Roles determine what
            this user can do in
            CHRIS.
          </p>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",

              gap:
                "10px",
            }}
          >
            {roles.map(
              (role) => {
                const selected =
                  selectedRoleIds.includes(
                    role.id
                  );

                return (
                  <label
                    key={
                      role.id
                    }

                    style={{
                      display:
                        "flex",

                      alignItems:
                        "center",

                      gap:
                        "9px",

                      padding:
                        "12px",

                      border:
                        selected
                          ? "1px solid #0B5E3B"
                          : "1px solid #E2E8F0",

                      borderRadius:
                        "10px",

                      background:
                        selected
                          ? "#ECFDF5"
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
                        toggleRole(
                          role.id
                        )
                      }
                    />

                    <span
                      style={{
                        color:
                          selected
                            ? "#0B5E3B"
                            : "#475569",

                        fontSize:
                          "13px",

                        fontWeight:
                          "700",
                      }}
                    >
                      {role.name}
                    </span>
                  </label>
                );
              }
            )}
          </div>
        </div>

        {/* LOCATION ACCESS */}

        <div
          style={{
            marginTop:
              "28px",

            paddingTop:
              "24px",

            borderTop:
              "1px solid #E2E8F0",
          }}
        >
          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              gap:
                "8px",

              marginBottom:
                "5px",
            }}
          >
            <FaMapMarkerAlt
              style={{
                color:
                  "#D4AF37",
              }}
            />

            <SectionTitle
              noMargin
            >
              Location Access *
            </SectionTitle>
          </div>

          <p
            style={{
              margin:
                "0 0 16px",

              color:
                "#64748B",

              fontSize:
                "12px",

              lineHeight:
                1.6,
            }}
          >
            Location access
            determines where this
            user may operate in
            CHRIS. It does not
            change the employee's
            work location.
          </p>

          <label
            style={{
              ...scopeCardStyle,

              border:
                locationScope ===
                "ALL_LOCATIONS"
                  ? "1px solid #0B5E3B"
                  : "1px solid #E2E8F0",

              background:
                locationScope ===
                "ALL_LOCATIONS"
                  ? "#ECFDF5"
                  : "#FFFFFF",
            }}
          >
            <input
              type="radio"

              name="locationScope"

              checked={
                locationScope ===
                "ALL_LOCATIONS"
              }

              disabled={
                saving
              }

              onChange={() =>
                handleScopeChange(
                  "ALL_LOCATIONS"
                )
              }
            />

            <div>
              <div
                style={{
                  color:
                    "#0F172A",

                  fontSize:
                    "13px",

                  fontWeight:
                    "800",
                }}
              >
                All Locations
              </div>

              <div
                style={{
                  marginTop:
                    "3px",

                  color:
                    "#64748B",

                  fontSize:
                    "12px",

                  lineHeight:
                    1.5,
                }}
              >
                Organization-wide
                access to Head Office
                and all branches.
              </div>
            </div>
          </label>

          <label
            style={{
              ...scopeCardStyle,

              marginTop:
                "10px",

              border:
                locationScope ===
                "ASSIGNED_LOCATIONS"
                  ? "1px solid #0B5E3B"
                  : "1px solid #E2E8F0",

              background:
                locationScope ===
                "ASSIGNED_LOCATIONS"
                  ? "#ECFDF5"
                  : "#FFFFFF",
            }}
          >
            <input
              type="radio"

              name="locationScope"

              checked={
                locationScope ===
                "ASSIGNED_LOCATIONS"
              }

              disabled={
                saving
              }

              onChange={() =>
                handleScopeChange(
                  "ASSIGNED_LOCATIONS"
                )
              }
            />

            <div>
              <div
                style={{
                  color:
                    "#0F172A",

                  fontSize:
                    "13px",

                  fontWeight:
                    "800",
                }}
              >
                Assigned Locations
              </div>

              <div
                style={{
                  marginTop:
                    "3px",

                  color:
                    "#64748B",

                  fontSize:
                    "12px",

                  lineHeight:
                    1.5,
                }}
              >
                Restrict this user
                to one or more
                selected locations.
              </div>
            </div>
          </label>

          {locationScope ===
            "ASSIGNED_LOCATIONS" && (
            <div
              style={{
                marginTop:
                  "14px",

                marginLeft:
                  "28px",

                padding:
                  "15px",

                background:
                  "#F8FAFC",

                border:
                  "1px solid #E2E8F0",

                borderRadius:
                  "12px",
              }}
            >
              {locationsLoading ? (
                <div
                  style={
                    messageStyle
                  }
                >
                  Loading organization
                  locations...
                </div>
              ) : locationsError ? (
                <div
                  style={{
                    color:
                      "#B91C1C",

                    fontSize:
                      "13px",

                    fontWeight:
                      "600",
                  }}
                >
                  {locationsError}
                </div>
              ) : locations.length ===
                0 ? (
                <div
                  style={
                    messageStyle
                  }
                >
                  No active
                  organization
                  locations are
                  available.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      marginBottom:
                        "10px",

                      color:
                        "#334155",

                      fontSize:
                        "12px",

                      fontWeight:
                        "800",
                    }}
                  >
                    Select accessible
                    locations
                  </div>

                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(200px, 1fr))",

                      gap:
                        "9px",
                    }}
                  >
                    {locations.map(
                      (
                        location
                      ) => {
                        const selected =
                          selectedLocationIds.includes(
                            location.id
                          );

                        const isEmployeeLocation =
                          employee
                            ?.locationId ===
                          location.id;

                        return (
                          <label
                            key={
                              location.id
                            }

                            style={{
                              display:
                                "flex",

                              alignItems:
                                "flex-start",

                              gap:
                                "9px",

                              padding:
                                "11px",

                              background:
                                selected
                                  ? "#FFFFFF"
                                  : "transparent",

                              border:
                                selected
                                  ? "1px solid #0B5E3B"
                                  : "1px solid #CBD5E1",

                              borderRadius:
                                "9px",

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
                                toggleLocation(
                                  location.id
                                )
                              }
                            />

                            <div>
                              <div
                                style={{
                                  color:
                                    selected
                                      ? "#0B5E3B"
                                      : "#334155",

                                  fontSize:
                                    "13px",

                                  fontWeight:
                                    "800",
                                }}
                              >
                                {
                                  location.name
                                }
                              </div>

                              <div
                                style={{
                                  marginTop:
                                    "2px",

                                  color:
                                    "#64748B",

                                  fontSize:
                                    "11px",
                                }}
                              >
                                {
                                  location.code
                                }

                                {location.city
                                  ? ` • ${location.city}`
                                  : ""}
                              </div>

                              {isEmployeeLocation && (
                                <div
                                  style={{
                                    marginTop:
                                      "4px",

                                    color:
                                      "#0B5E3B",

                                    fontSize:
                                      "10px",

                                    fontWeight:
                                      "800",
                                  }}
                                >
                                  CURRENT WORK
                                  LOCATION
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      }
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ACTIONS */}

        <div
          style={{
            display:
              "flex",

            justifyContent:
              "flex-end",

            gap:
              "10px",

            marginTop:
              "28px",

            flexWrap:
              "wrap",
          }}
        >
          <button
            type="button"

            onClick={
              onCancel
            }

            disabled={
              saving
            }

            style={{
              ...cancelButtonStyle,

              opacity:
                saving
                  ? 0.7
                  : 1,
            }}
          >
            <FaTimes />

            Cancel
          </button>

          <button
            type="submit"

            disabled={
              saving ||
              locationsLoading
            }

            style={{
              ...saveButtonStyle,

              opacity:
                saving ||
                locationsLoading
                  ? 0.7
                  : 1,

              cursor:
                saving ||
                locationsLoading
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            <FaSave />

            {saving
              ? "Saving..."
              : "Save Access Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}) {
  return (
    <label>
      <div
        style={{
          marginBottom:
            "7px",

          color:
            "#334155",

          fontSize:
            "13px",

          fontWeight:
            "700",
        }}
      >
        {label}

        {required && (
          <span
            style={{
              color:
                "#B91C1C",
            }}
          >
            {" "}*
          </span>
        )}
      </div>

      {children}
    </label>
  );
}

function SectionTitle({
  children,
  noMargin = false,
}) {
  return (
    <div
      style={{
        marginBottom:
          noMargin
            ? 0
            : "10px",

        color:
          "#334155",

        fontSize:
          "13px",

        fontWeight:
          "800",
      }}
    >
      {children}
    </div>
  );
}

function ReadOnlyItem({
  label,
  value,
}) {
  return (
    <div>
      <div
        style={{
          marginBottom:
            "5px",

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
        {label}
      </div>

      <div
        style={{
          minHeight:
            "20px",

          color:
            "#0F172A",

          fontSize:
            "13px",

          fontWeight:
            "700",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const employeeCardStyle = {
  padding:
    "18px",

  marginBottom:
    "24px",

  background:
    "#F8FAFC",

  border:
    "1px solid #DDE5E1",

  borderRadius:
    "12px",
};

const inputStyle = {
  width:
    "100%",

  boxSizing:
    "border-box",

  padding:
    "11px 12px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "9px",

  outline:
    "none",

  fontSize:
    "14px",

  color:
    "#0F172A",

  background:
    "#FFFFFF",
};

const scopeCardStyle = {
  display:
    "flex",

  alignItems:
    "flex-start",

  gap:
    "11px",

  padding:
    "14px",

  borderRadius:
    "11px",

  cursor:
    "pointer",
};

const cancelButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "7px",

  padding:
    "11px 16px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "9px",

  background:
    "#FFFFFF",

  color:
    "#475569",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const saveButtonStyle = {
  display:
    "flex",

  alignItems:
    "center",

  gap:
    "7px",

  padding:
    "11px 17px",

  border:
    "none",

  borderRadius:
    "9px",

  background:
    "#0B5E3B",

  color:
    "#FFFFFF",

  fontWeight:
    "800",

  boxShadow:
    "0 5px 14px rgba(11,94,59,0.18)",
};

const messageStyle = {
  color:
    "#64748B",

  fontSize:
    "13px",
};

export default EditUserForm;