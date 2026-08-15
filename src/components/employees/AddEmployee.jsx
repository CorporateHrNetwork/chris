import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiRequest } from "../../services/api";

function AddEmployee({
  onBack,
  onSave,
}) {
  const [
    formData,
    setFormData,
  ] = useState({
    name: "",
    departmentId: "",
    designationId: "",
    locationId: "",
    email: "",
    phone: "",
    status: "Active",
  });

  const [
    departments,
    setDepartments,
  ] = useState([]);

  const [
    designations,
    setDesignations,
  ] = useState([]);

  const [
    locations,
    setLocations,
  ] = useState([]);

  const [
    structureLoading,
    setStructureLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    saving,
    setSaving,
  ] = useState(false);


  /*
  ============================================================
  LOAD CHRIS ORGANIZATION STRUCTURE
  ============================================================

  Add Employee must use the authenticated client's existing
  organizational structure rather than allowing free-text
  Department / Designation creation.

  Department source:
  GET /api/employees/career/departments

  Designation source:
  GET /api/employees/career/catalog
  ============================================================
  */

  useEffect(() => {
    let cancelled = false;

    async function loadStructure() {
      try {
        setStructureLoading(
          true
        );

        setError("");

        const [
          departmentResult,
          designationResult,
          locationResult,
        ] =
          await Promise.all([
            apiRequest(
              "/api/employees/career/departments"
            ),

            apiRequest(
              "/api/employees/career/catalog"
            ),

            apiRequest(
              "/api/location-catalog"
            ),
          ]);

        if (cancelled) {
          return;
        }

        const activeDepartments =
          Array.isArray(
            departmentResult?.data
          )
            ? departmentResult.data
                .filter(
                  (department) =>
                    department.isActive !==
                    false
                )
                .sort(
                  (a, b) =>
                    String(
                      a.name || ""
                    ).localeCompare(
                      String(
                        b.name || ""
                      )
                    )
                )
            : [];

        const activeDesignations =
          Array.isArray(
            designationResult?.data
          )
            ? designationResult.data
                .filter(
                  (designation) =>
                    designation.isActive !==
                      false &&
                    designation.departmentId &&
                    designation.department
                      ?.isActive !==
                      false
                )
                .sort(
                  (a, b) =>
                    String(
                      a.name || ""
                    ).localeCompare(
                      String(
                        b.name || ""
                      )
                    )
                )
            : [];

        const activeLocations =
          Array.isArray(
            locationResult?.data
          )
            ? locationResult.data
                .filter(
                  (location) =>
                    location.isActive !==
                    false
                )
                .sort(
                  (a, b) =>
                    String(
                      a.name || ""
                    ).localeCompare(
                      String(
                        b.name || ""
                      )
                    )
                )
            : [];

        setDepartments(
          activeDepartments
        );

        setDesignations(
          activeDesignations
        );

        setLocations(
          activeLocations
        );
      } catch (err) {
        console.error(
          "CHRIS organization structure load error:",
          err
        );

        if (!cancelled) {
          setError(
            err.message ||
              "CHRIS could not load the organization departments, designations and work locations."
          );
        }
      } finally {
        if (!cancelled) {
          setStructureLoading(
            false
          );
        }
      }
    }

    loadStructure();

    return () => {
      cancelled = true;
    };
  }, []);


  /*
  ============================================================
  DESIGNATIONS FOR SELECTED DEPARTMENT
  ============================================================
  */

  const availableDesignations =
    useMemo(
      () =>
        formData.departmentId
          ? designations.filter(
              (designation) =>
                designation.departmentId ===
                formData.departmentId
            )
          : [],
      [
        designations,
        formData.departmentId,
      ]
    );


  /*
  ============================================================
  FORM CHANGE
  ============================================================
  */

  const handleChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setFormData(
        (previous) => ({
          ...previous,

          [name]:
            value,

          /*
          A designation belongs to a specific department.
          Changing Department therefore clears any earlier
          Designation selection.
          */

          ...(name ===
          "departmentId"
            ? {
                designationId:
                  "",
              }
            : {}),
        })
      );

      setError("");
    };


  /*
  ============================================================
  SAVE EMPLOYEE
  ============================================================
  */

  const handleSubmit = async (
    event
  ) => {
    event.preventDefault();

    if (
      !formData.name.trim() ||
      !formData.departmentId ||
      !formData.designationId ||
      !formData.locationId ||
      !formData.email.trim() ||
      !formData.phone.trim()
    ) {
      setError(
        "Please complete all required fields before saving the employee."
      );

      return;
    }

    const selectedDesignation =
      designations.find(
        (designation) =>
          designation.id ===
          formData.designationId
      );

    if (
      !selectedDesignation ||
      selectedDesignation.departmentId !==
        formData.departmentId
    ) {
      setError(
        "The selected designation is not mapped to the selected department."
      );

      return;
    }

    try {
      setSaving(true);
      setError("");

      const result =
        await apiRequest(
          "/api/employees",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                name:
                  formData.name,

                departmentId:
                  formData.departmentId,

                designationId:
                  formData.designationId,

                locationId:
                  formData.locationId,

                email:
                  formData.email,

                phone:
                  formData.phone,

                status:
                  formData.status,
              }),
          }
        );

      onSave(
        result.data
      );
    } catch (err) {
      console.error(
        "Add employee error:",
        err
      );

      setError(
        err.message ||
          "CHRIS could not save the employee."
      );
    } finally {
      setSaving(false);
    }
  };


  return (
    <div
      style={{
        width:
          "100%",

        maxWidth:
          "1200px",

        margin:
          "0 auto",
      }}
    >
      <div
        style={{
          marginBottom:
            "25px",
        }}
      >
        <p
          style={{
            margin:
              "0 0 6px",

            color:
              "#64748B",

            fontSize:
              "14px",

            fontWeight:
              "600",
          }}
        >
          People Management
        </p>

        <h1
          style={{
            margin:
              0,

            color:
              "#0B5E3B",

            fontSize:
              "32px",

            fontWeight:
              "800",
          }}
        >
          Add Employee
        </h1>

        <p
          style={{
            margin:
              "8px 0 0",

            color:
              "#64748B",

            fontSize:
              "15px",
          }}
        >
          Create a new employee record using your organization&apos;s
          approved CHRIS structure.
        </p>
      </div>

      <form
        onSubmit={
          handleSubmit
        }
      >
        <div
          style={{
            background:
              "#FFFFFF",

            border:
              "1px solid #E5E7EB",

            borderRadius:
              "18px",

            padding:
              "28px",

            boxShadow:
              "0 6px 24px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "flex-start",

              gap:
                "20px",

              flexWrap:
                "wrap",

              marginBottom:
                "24px",
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    0,

                  color:
                    "#0B5E3B",

                  fontSize:
                    "19px",

                  fontWeight:
                    "800",
                }}
              >
                Employee Information
              </h2>

              <p
                style={{
                  margin:
                    "6px 0 0",

                  color:
                    "#64748B",

                  fontSize:
                    "13px",
                }}
              >
                Department, Designation and Work Location are selected
                from the client&apos;s existing CHRIS organization structure.
              </p>
            </div>

            <div
              style={
                structureBadgeStyle
              }
            >
              {structureLoading
                ? "Loading structure..."
                : `${departments.length} departments • ${designations.length} mapped designations • ${locations.length} locations`}
            </div>
          </div>

          {error && (
            <div
              style={
                errorStyle
              }
            >
              {error}
            </div>
          )}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",

              gap:
                "22px",
            }}
          >
            <FormField
              label="Full Name"
              name="name"
              value={
                formData.name
              }
              onChange={
                handleChange
              }
              placeholder="Enter employee full name"
              required
              disabled={
                saving
              }
            />

            <div>
              <RequiredLabel>
                Department
              </RequiredLabel>

              <select
                name="departmentId"

                value={
                  formData.departmentId
                }

                onChange={
                  handleChange
                }

                required

                disabled={
                  saving ||
                  structureLoading
                }

                style={{
                  ...fieldStyle,

                  cursor:
                    saving ||
                    structureLoading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <option value="">
                  {structureLoading
                    ? "Loading departments..."
                    : departments.length ===
                        0
                      ? "No active departments available"
                      : "Select department"}
                </option>

                {departments.map(
                  (department) => (
                    <option
                      key={
                        department.id
                      }
                      value={
                        department.id
                      }
                    >
                      {department.name}
                      {department.code
                        ? ` (${department.code})`
                        : ""}
                    </option>
                  )
                )}
              </select>

              {!structureLoading &&
                departments.length ===
                  0 && (
                  <p
                    style={
                      helperWarningStyle
                    }
                  >
                    No active department is configured. Create the
                    organization structure before adding employees.
                  </p>
                )}
            </div>

            <div>
              <RequiredLabel>
                Designation
              </RequiredLabel>

              <select
                name="designationId"

                value={
                  formData.designationId
                }

                onChange={
                  handleChange
                }

                required

                disabled={
                  saving ||
                  structureLoading ||
                  !formData.departmentId
                }

                style={{
                  ...fieldStyle,

                  background:
                    !formData.departmentId
                      ? "#F8FAFC"
                      : "#FFFFFF",

                  cursor:
                    saving ||
                    structureLoading ||
                    !formData.departmentId
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <option value="">
                  {!formData.departmentId
                    ? "Select department first"
                    : availableDesignations.length ===
                        0
                      ? "No mapped designations available"
                      : "Select designation"}
                </option>

                {availableDesignations.map(
                  (designation) => (
                    <option
                      key={
                        designation.id
                      }
                      value={
                        designation.id
                      }
                    >
                      {designation.name}
                      {designation.code
                        ? ` (${designation.code})`
                        : ""}
                    </option>
                  )
                )}
              </select>

              {formData.departmentId &&
                !structureLoading &&
                availableDesignations.length ===
                  0 && (
                  <p
                    style={
                      helperWarningStyle
                    }
                  >
                    This department has no active mapped designation.
                    Configure its designations before adding an
                    employee.
                  </p>
                )}
            </div>

            <div>
              <RequiredLabel>
                Work Location / Branch
              </RequiredLabel>

              <select
                name="locationId"

                value={
                  formData.locationId
                }

                onChange={
                  handleChange
                }

                required

                disabled={
                  saving ||
                  structureLoading
                }

                style={{
                  ...fieldStyle,

                  cursor:
                    saving ||
                    structureLoading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <option value="">
                  {structureLoading
                    ? "Loading locations..."
                    : locations.length ===
                        0
                      ? "No active locations available"
                      : "Select work location / branch"}
                </option>

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
                      {location.code
                        ? ` (${location.code})`
                        : ""}
                      {location.city
                        ? ` - ${location.city}`
                        : ""}
                    </option>
                  )
                )}
              </select>

              {!structureLoading &&
                locations.length ===
                  0 && (
                  <p
                    style={
                      helperWarningStyle
                    }
                  >
                    No active work location is configured. Create or
                    activate a location before adding employees.
                  </p>
                )}
            </div>

            <FormField
              label="Email Address"
              name="email"
              type="email"
              value={
                formData.email
              }
              onChange={
                handleChange
              }
              placeholder="employee@company.com"
              required
              disabled={
                saving
              }
            />

            <FormField
              label="Phone Number"
              name="phone"
              value={
                formData.phone
              }
              onChange={
                handleChange
              }
              placeholder="08012345678"
              required
              disabled={
                saving
              }
            />

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Employment Status
              </label>

              <select
                name="status"

                value={
                  formData.status
                }

                onChange={
                  handleChange
                }

                style={
                  fieldStyle
                }

                disabled={
                  saving
                }
              >
                <option value="Active">
                  Active
                </option>

                <option value="Probation">
                  Probation
                </option>

                <option value="Leave">
                  Leave
                </option>

                <option value="Suspended">
                  Suspended
                </option>

                <option value="Resigned">
                  Resigned
                </option>

                <option value="Terminated">
                  Terminated
                </option>

                <option value="Retired">
                  Retired
                </option>

                <option value="Inactive">
                  Inactive
                </option>
              </select>
            </div>
          </div>

          <div
            style={{
              display:
                "flex",

              justifyContent:
                "flex-end",

              gap:
                "12px",

              marginTop:
                "30px",

              paddingTop:
                "22px",

              borderTop:
                "1px solid #E5E7EB",
            }}
          >
            <button
              type="button"

              onClick={
                onBack
              }

              disabled={
                saving
              }

              style={{
                ...cancelButtonStyle,

                cursor:
                  saving
                    ? "not-allowed"
                    : "pointer",

                opacity:
                  saving
                    ? 0.6
                    : 1,
              }}
            >
              Cancel
            </button>

            <button
              type="submit"

              disabled={
                saving ||
                structureLoading ||
                !formData.departmentId ||
                !formData.designationId ||
                !formData.locationId
              }

              style={{
                ...saveButtonStyle,

                cursor:
                  saving ||
                  structureLoading ||
                  !formData.departmentId ||
                  !formData.designationId
                    ? "not-allowed"
                    : "pointer",

                opacity:
                  saving ||
                  structureLoading ||
                  !formData.departmentId ||
                  !formData.designationId
                    ? 0.6
                    : 1,
              }}
            >
              {saving
                ? "Saving Employee..."
                : "Save Employee"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}


function RequiredLabel({
  children,
}) {
  return (
    <label
      style={
        labelStyle
      }
    >
      {children}

      <span
        style={{
          color:
            "#DC2626",
        }}
      >
        {" "}
        *
      </span>
    </label>
  );
}


function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
}) {
  return (
    <div>
      <label
        style={
          labelStyle
        }
      >
        {label}

        {required && (
          <span
            style={{
              color:
                "#DC2626",
            }}
          >
            {" "}
            *
          </span>
        )}
      </label>

      <input
        type={
          type
        }
        name={
          name
        }
        value={
          value
        }
        onChange={
          onChange
        }
        placeholder={
          placeholder
        }
        required={
          required
        }
        disabled={
          disabled
        }
        style={
          fieldStyle
        }
      />
    </div>
  );
}


const labelStyle = {
  display:
    "block",

  marginBottom:
    "8px",

  color:
    "#334155",

  fontSize:
    "14px",

  fontWeight:
    "700",
};


const fieldStyle = {
  width:
    "100%",

  padding:
    "12px 14px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "10px",

  background:
    "#FFFFFF",

  color:
    "#0F172A",

  fontSize:
    "14px",

  outline:
    "none",

  boxSizing:
    "border-box",
};


const structureBadgeStyle = {
  padding:
    "8px 11px",

  border:
    "1px solid #D1FAE5",

  borderRadius:
    "999px",

  background:
    "#ECFDF5",

  color:
    "#047857",

  fontSize:
    "12px",

  fontWeight:
    "800",
};


const helperWarningStyle = {
  margin:
    "7px 0 0",

  color:
    "#B45309",

  fontSize:
    "12px",

  lineHeight:
    "1.45",
};


const errorStyle = {
  marginBottom:
    "22px",

  padding:
    "13px 16px",

  background:
    "#FEF2F2",

  border:
    "1px solid #FECACA",

  borderRadius:
    "10px",

  color:
    "#B91C1C",

  fontSize:
    "14px",

  fontWeight:
    "600",
};


const cancelButtonStyle = {
  background:
    "#FFFFFF",

  color:
    "#475569",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "10px",

  padding:
    "12px 20px",

  fontSize:
    "14px",

  fontWeight:
    "700",
};


const saveButtonStyle = {
  background:
    "#0B5E3B",

  color:
    "#FFFFFF",

  border:
    "none",

  borderRadius:
    "10px",

  padding:
    "12px 22px",

  fontSize:
    "14px",

  fontWeight:
    "700",

  boxShadow:
    "0 6px 15px rgba(11, 94, 59, 0.18)",
};


export default AddEmployee;