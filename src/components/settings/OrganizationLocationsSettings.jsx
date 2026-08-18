import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaBuilding,
  FaMapMarkerAlt,
  FaPlus,
  FaEdit,
  FaToggleOn,
  FaToggleOff,
  FaTimes,
  FaSave,
} from "react-icons/fa";

import {
  apiRequest,
} from "../../services/api";

import useAuthorization from "../../hooks/useAuthorization";


import "./chris-settings-visual.css";
const EMPTY_FORM = {
  id: "",
  name: "",
  code: "",
  type: "BRANCH",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "Nigeria",
  phone: "",
  email: "",
};

function OrganizationLocationsSettings() {
  const {
    hasPermission,
  } = useAuthorization();

  const canView =
    hasPermission(
      "settings.view"
    );

  const canManage =
    hasPermission(
      "settings.manage"
    );

  const [
    locations,
    setLocations,
  ] = useState([]);

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
    showForm,
    setShowForm,
  ] = useState(false);

  const [
    formMode,
    setFormMode,
  ] = useState("create");

  const [
    form,
    setForm,
  ] = useState(
    EMPTY_FORM
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    statusUpdatingId,
    setStatusUpdatingId,
  ] = useState(null);

  const loadLocations =
    useCallback(
      async () => {
        if (!canView) {
          setLoading(false);
          return;
        }

        try {
          setLoading(true);
          setError("");

          const result =
            await apiRequest(
              "/api/locations"
            );

          setLocations(
            result.data || []
          );
        } catch (
          requestError
        ) {
          console.error(
            "CHRIS locations load error:",
            requestError
          );

          setError(
            requestError.message ||
              "Unable to load organization locations."
          );
        } finally {
          setLoading(false);
        }
      },
      [canView]
    );

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const totals =
    useMemo(
      () => ({
        total:
          locations.length,

        active:
          locations.filter(
            (location) =>
              location.isActive
          ).length,

        branches:
          locations.filter(
            (location) =>
              location.type ===
              "BRANCH"
          ).length,

        employees:
          locations.reduce(
            (
              sum,
              location
            ) =>
              sum +
              (location.employeeCount ||
                0),
            0
          ),
      }),
      [locations]
    );

  const openCreateForm =
    () => {
      setForm(
        EMPTY_FORM
      );

      setFormMode(
        "create"
      );

      setSuccess("");
      setError("");

      setShowForm(
        true
      );
    };

  const openEditForm =
    (location) => {
      setForm({
        id:
          location.id,

        name:
          location.name || "",

        code:
          location.code || "",

        type:
          location.type ||
          "BRANCH",

        addressLine1:
          location.addressLine1 ||
          "",

        addressLine2:
          location.addressLine2 ||
          "",

        city:
          location.city || "",

        state:
          location.state || "",

        country:
          location.country ||
          "Nigeria",

        phone:
          location.phone || "",

        email:
          location.email || "",
      });

      setFormMode(
        "edit"
      );

      setSuccess("");
      setError("");

      setShowForm(
        true
      );
    };

  const closeForm =
    () => {
      if (saving) {
        return;
      }

      setShowForm(false);

      setForm(
        EMPTY_FORM
      );
    };

  const handleChange =
    (event) => {
      const {
        name,
        value,
      } = event.target;

      setForm(
        (current) => ({
          ...current,

          [name]:
            value,
        })
      );

      setError("");
      setSuccess("");
    };

  const handleSubmit =
    async (event) => {
      event.preventDefault();

      if (!canManage) {
        setError(
          "You do not have permission to manage organization locations."
        );

        return;
      }

      if (!form.name.trim()) {
        setError(
          "Location name is required."
        );

        return;
      }

      try {
        setSaving(true);
        setError("");
        setSuccess("");

        const payload = {
          name:
            form.name,

          code:
            form.code,

          type:
            form.type,

          addressLine1:
            form.addressLine1,

          addressLine2:
            form.addressLine2,

          city:
            form.city,

          state:
            form.state,

          country:
            form.country,

          phone:
            form.phone,

          email:
            form.email,
        };

        if (
          formMode ===
          "create"
        ) {
          await apiRequest(
            "/api/locations",
            {
              method:
                "POST",

              body:
                JSON.stringify(
                  payload
                ),
            }
          );

          setSuccess(
            "CHRIS location created successfully."
          );
        } else {
          await apiRequest(
            `/api/locations/${form.id}`,
            {
              method:
                "PUT",

              body:
                JSON.stringify(
                  payload
                ),
            }
          );

          setSuccess(
            "CHRIS location updated successfully."
          );
        }

        setShowForm(false);

        setForm(
          EMPTY_FORM
        );

        await loadLocations();

        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (
        requestError
      ) {
        console.error(
          "CHRIS location save error:",
          requestError
        );

        setError(
          requestError.message ||
            "Unable to save CHRIS location."
        );
      } finally {
        setSaving(false);
      }
    };

  const handleStatusChange =
    async (
      location
    ) => {
      if (!canManage) {
        return;
      }

      const nextStatus =
        !location.isActive;

      if (!nextStatus) {
        const confirmed =
          window.confirm(
            `Deactivate ${location.name}?`
          );

        if (!confirmed) {
          return;
        }
      }

      try {
        setStatusUpdatingId(
          location.id
        );

        setError("");
        setSuccess("");

        const result =
          await apiRequest(
            `/api/locations/${location.id}/status`,
            {
              method:
                "PATCH",

              body:
                JSON.stringify({
                  isActive:
                    nextStatus,
                }),
            }
          );

        setSuccess(
          result.message ||
            (nextStatus
              ? "CHRIS location activated successfully."
              : "CHRIS location deactivated successfully.")
        );

        await loadLocations();

        setTimeout(() => {
          setSuccess("");
        }, 4000);
      } catch (
        requestError
      ) {
        console.error(
          "CHRIS location status error:",
          requestError
        );

        setError(
          requestError.message ||
            "Unable to update CHRIS location status."
        );
      } finally {
        setStatusUpdatingId(
          null
        );
      }
    };

  if (!canView) {
    return (
      <div
        style={
          accessDeniedStyle
        }
      >
        You do not have
        permission to view
        organization locations.
      </div>
    );
  }

  return (
    <div className="chris-organization-locations">
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: "16px",
          flexWrap:
            "wrap",
          marginBottom:
            "24px",
        }}
      >
        <div>
          <p
            style={{
              margin:
                "0 0 6px",
              color:
                "#64748B",
              fontSize:
                "13px",
              fontWeight:
                "700",
            }}
          >
            Organization Structure
          </p>

          <h2
            style={{
              margin: 0,
              color:
                "#087A43",
              fontSize:
                "26px",
              fontWeight:
                "800",
            }}
          >
            Organization Locations
          </h2>

          <p
            style={{
              margin:
                "7px 0 0",
              color:
                "#64748B",
              fontSize:
                "13px",
              lineHeight:
                1.6,
            }}
          >
            Manage Head Office,
            branches, offices and
            operational sites.
          </p>
        </div>

        {canManage &&
          !showForm && (
            <button
              type="button"
              onClick={
                openCreateForm
              }
              style={
                primaryButtonStyle
              }
            >
              <FaPlus />
              Add Location
            </button>
          )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "14px",
          marginBottom:
            "22px",
        }}
      >
        <MetricCard
          label="Total Locations"
          value={
            totals.total
          }
        />

        <MetricCard
          label="Active"
          value={
            totals.active
          }
        />

        <MetricCard
          label="Branches"
          value={
            totals.branches
          }
        />

        <MetricCard
          label="Employees"
          value={
            totals.employees
          }
        />
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

      {success && (
        <div
          style={
            successStyle
          }
        >
          {success}
        </div>
      )}

      {showForm && (
        <LocationForm
          form={
            form
          }
          formMode={
            formMode
          }
          saving={
            saving
          }
          onChange={
            handleChange
          }
          onSubmit={
            handleSubmit
          }
          onCancel={
            closeForm
          }
        />
      )}

      <div
        style={{
          marginTop:
            "22px",
        }}
      >
        {loading ? (
          <div
            style={
              messageStyle
            }
          >
            Loading organization
            locations...
          </div>
        ) : locations.length ===
          0 ? (
          <div
            style={
              messageStyle
            }
          >
            No organization
            locations found.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "18px",
            }}
          >
            {locations.map(
              (location) => (
                <LocationCard
                  key={
                    location.id
                  }
                  location={
                    location
                  }
                  canManage={
                    canManage
                  }
                  statusUpdating={
                    statusUpdatingId ===
                    location.id
                  }
                  onEdit={() =>
                    openEditForm(
                      location
                    )
                  }
                  onStatusChange={() =>
                    handleStatusChange(
                      location
                    )
                  }
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LocationForm({
  form,
  formMode,
  saving,
  onChange,
  onSubmit,
  onCancel,
}) {
  return (
    <form
      onSubmit={
        onSubmit
      }
      style={
        formCardStyle
      }
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "center",
          gap: "12px",
          marginBottom:
            "18px",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              color:
                "#0F172A",
              fontSize:
                "18px",
              fontWeight:
                "800",
            }}
          >
            {formMode ===
            "create"
              ? "Add Organization Location"
              : "Edit Organization Location"}
          </h3>
        </div>

        <button
          type="button"
          onClick={
            onCancel
          }
          disabled={
            saving
          }
          style={
            iconButtonStyle
          }
        >
          <FaTimes />
        </button>
      </div>

      <div
        style={
          formGridStyle
        }
      >
        <Field
          label="Location Name"
          required
        >
          <input
            name="name"
            value={
              form.name
            }
            onChange={
              onChange
            }
            placeholder="e.g. Lagos Branch"
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="Location Code"
        >
          <input
            name="code"
            value={
              form.code
            }
            onChange={
              onChange
            }
            placeholder="e.g. LAG-01"
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="Location Type"
          required
        >
          <select
            name="type"
            value={
              form.type
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          >
            <option value="HEAD_OFFICE">
              Head Office
            </option>

            <option value="BRANCH">
              Branch
            </option>

            <option value="OFFICE">
              Office
            </option>

            <option value="SITE">
              Site
            </option>
          </select>
        </Field>

        <Field
          label="City"
        >
          <input
            name="city"
            value={
              form.city
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="State"
        >
          <input
            name="state"
            value={
              form.state
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="Country"
        >
          <input
            name="country"
            value={
              form.country
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="Phone"
        >
          <input
            name="phone"
            value={
              form.phone
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="Email"
        >
          <input
            type="email"
            name="email"
            value={
              form.email
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          />
        </Field>
      </div>

      <div
        style={{
          marginTop:
            "16px",
        }}
      >
        <Field
          label="Address Line 1"
        >
          <input
            name="addressLine1"
            value={
              form.addressLine1
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          />
        </Field>
      </div>

      <div
        style={{
          marginTop:
            "16px",
        }}
      >
        <Field
          label="Address Line 2"
        >
          <input
            name="addressLine2"
            value={
              form.addressLine2
            }
            onChange={
              onChange
            }
            style={
              inputStyle
            }
          />
        </Field>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent:
            "flex-end",
          gap: "10px",
          marginTop:
            "20px",
          paddingTop:
            "16px",
          borderTop:
            "1px solid #E5E7EB",
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
          style={
            secondaryButtonStyle
          }
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={
            saving
          }
          style={
            primaryButtonStyle
          }
        >
          <FaSave />

          {saving
            ? "Saving..."
            : formMode ===
                "create"
              ? "Create Location"
              : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function LocationCard({
  location,
  canManage,
  statusUpdating,
  onEdit,
  onStatusChange,
}) {
  const typeLabel =
    formatType(
      location.type
    );

  return (
    <div
      style={
        locationCardStyle
      }
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: "14px",
          alignItems:
            "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems:
              "flex-start",
          }}
        >
          <div
            style={
              locationIconStyle
            }
          >
            {location.type ===
            "HEAD_OFFICE" ? (
              <FaBuilding />
            ) : (
              <FaMapMarkerAlt />
            )}
          </div>

          <div>
            <h3
              style={{
                margin: 0,
                color:
                  "#087A43",
                fontSize:
                  "17px",
                fontWeight:
                  "800",
              }}
            >
              {
                location.name
              }
            </h3>

            <div
              style={{
                display:
                  "flex",
                gap: "6px",
                flexWrap:
                  "wrap",
                marginTop:
                  "7px",
              }}
            >
              <Badge>
                {typeLabel}
              </Badge>

              {location.code && (
                <Badge>
                  {
                    location.code
                  }
                </Badge>
              )}

              <StatusBadge
                active={
                  location.isActive
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "12px",
          marginTop:
            "18px",
        }}
      >
        <MetricBox
          label="Employees"
          value={
            location.employeeCount ||
            0
          }
        />

        <MetricBox
          label="Assigned Users"
          value={
            location.assignedUserCount ||
            0
          }
        />
      </div>

      <div
        style={{
          marginTop:
            "16px",
          color:
            "#64748B",
          fontSize:
            "12px",
          lineHeight:
            1.6,
        }}
      >
        <div>
          <strong>
            Location:
          </strong>{" "}
          {[
            location.city,
            location.state,
            location.country,
          ]
            .filter(Boolean)
            .join(", ") ||
            "Not specified"}
        </div>

        {location.addressLine1 && (
          <div
            style={{
              marginTop:
                "4px",
            }}
          >
            <strong>
              Address:
            </strong>{" "}
            {
              location.addressLine1
            }
          </div>
        )}
      </div>

      {canManage && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap:
              "wrap",
            marginTop:
              "18px",
            paddingTop:
              "15px",
            borderTop:
              "1px solid #E5E7EB",
          }}
        >
          <button
            type="button"
            onClick={
              onEdit
            }
            style={
              editButtonStyle
            }
          >
            <FaEdit />
            Edit
          </button>

          <button
            type="button"
            onClick={
              onStatusChange
            }
            disabled={
              statusUpdating
            }
            style={
              location.isActive
                ? deactivateButtonStyle
                : activateButtonStyle
            }
          >
            {location.isActive ? (
              <FaToggleOff />
            ) : (
              <FaToggleOn />
            )}

            {statusUpdating
              ? "Updating..."
              : location.isActive
                ? "Deactivate"
                : "Activate"}
          </button>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
}) {
  return (
    <div
      style={
        metricCardStyle
      }
    >
      <div
        style={{
          color:
            "#64748B",
          fontSize:
            "11px",
          fontWeight:
            "800",
          textTransform:
            "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop:
            "6px",
          color:
            "#087A43",
          fontSize:
            "26px",
          fontWeight:
            "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MetricBox({
  label,
  value,
}) {
  return (
    <div
      style={{
        padding:
          "12px",
        background:
          "#F8FAFC",
        border:
          "1px solid #E2E8F0",
        borderRadius:
          "10px",
      }}
    >
      <div
        style={{
          color:
            "#087A43",
          fontSize:
            "18px",
          fontWeight:
            "800",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop:
            "3px",
          color:
            "#64748B",
          fontSize:
            "10px",
          fontWeight:
            "700",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}) {
  return (
    <label
      style={{
        display:
          "block",
      }}
    >
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
        {label}

        {required && (
          <span
            style={{
              color:
                "#B91C1C",
            }}
          >
            {" "}
            *
          </span>
        )}
      </div>

      {children}
    </label>
  );
}

function Badge({
  children,
}) {
  return (
    <span
      style={
        badgeStyle
      }
    >
      {children}
    </span>
  );
}

function StatusBadge({
  active,
}) {
  return (
    <span
      style={{
        ...badgeStyle,
        background:
          active
            ? "#ECFDF5"
            : "#FEF2F2",
        color:
          active
            ? "#047857"
            : "#B91C1C",
        border:
          active
            ? "1px solid #A7F3D0"
            : "1px solid #FECACA",
      }}
    >
      {active
        ? "ACTIVE"
        : "INACTIVE"}
    </span>
  );
}

function formatType(
  value
) {
  switch (value) {
    case "HEAD_OFFICE":
      return "Head Office";

    case "BRANCH":
      return "Branch";

    case "OFFICE":
      return "Office";

    case "SITE":
      return "Site";

    default:
      return value;
  }
}

const formGridStyle = {
  display:
    "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap:
    "16px",
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
    "8px",
  fontSize:
    "13px",
  color:
    "#0F172A",
  background:
    "#FFFFFF",
  fontFamily:
    "inherit",
};

const formCardStyle = {
  padding:
    "20px",
  background:
    "#FFFFFF",
  border:
    "1px solid #E5E7EB",
  borderRadius:
    "14px",
  boxShadow:
    "0 7px 22px rgba(15,23,42,0.05)",
};

const locationCardStyle = {
  background:
    "#FFFFFF",
  border:
    "1px solid #E5E7EB",
  borderRadius:
    "14px",
  padding:
    "18px",
  boxShadow:
    "0 6px 20px rgba(15,23,42,0.04)",
};

const locationIconStyle = {
  width:
    "40px",
  height:
    "40px",
  display:
    "flex",
  alignItems:
    "center",
  justifyContent:
    "center",
  borderRadius:
    "10px",
  background:
    "#ECFDF5",
  color:
    "#087A43",
};

const metricCardStyle = {
  background:
    "#FFFFFF",
  border:
    "1px solid #E5E7EB",
  borderRadius:
    "12px",
  padding:
    "16px",
};

const primaryButtonStyle = {
  display:
    "flex",
  alignItems:
    "center",
  gap:
    "7px",
  padding:
    "10px 14px",
  border:
    "none",
  borderRadius:
    "8px",
  background:
    "#087A43",
  color:
    "#FFFFFF",
  fontSize:
    "12px",
  fontWeight:
    "800",
  cursor:
    "pointer",
};

const secondaryButtonStyle = {
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
  fontSize:
    "12px",
  fontWeight:
    "800",
  cursor:
    "pointer",
};

const iconButtonStyle = {
  border:
    "none",
  background:
    "transparent",
  color:
    "#64748B",
  fontSize:
    "17px",
  cursor:
    "pointer",
};

const editButtonStyle = {
  display:
    "flex",
  alignItems:
    "center",
  gap:
    "5px",
  padding:
    "7px 10px",
  border:
    "1px solid #BFDBFE",
  borderRadius:
    "7px",
  background:
    "#EFF6FF",
  color:
    "#1D4ED8",
  fontSize:
    "11px",
  fontWeight:
    "800",
  cursor:
    "pointer",
};

const deactivateButtonStyle = {
  display:
    "flex",
  alignItems:
    "center",
  gap:
    "5px",
  padding:
    "7px 10px",
  border:
    "1px solid #FECACA",
  borderRadius:
    "7px",
  background:
    "#FEF2F2",
  color:
    "#B91C1C",
  fontSize:
    "11px",
  fontWeight:
    "800",
  cursor:
    "pointer",
};

const activateButtonStyle = {
  display:
    "flex",
  alignItems:
    "center",
  gap:
    "5px",
  padding:
    "7px 10px",
  border:
    "1px solid #A7F3D0",
  borderRadius:
    "7px",
  background:
    "#ECFDF5",
  color:
    "#047857",
  fontSize:
    "11px",
  fontWeight:
    "800",
  cursor:
    "pointer",
};

const badgeStyle = {
  display:
    "inline-block",
  padding:
    "4px 8px",
  border:
    "1px solid #E2E8F0",
  borderRadius:
    "999px",
  background:
    "#F8FAFC",
  color:
    "#475569",
  fontSize:
    "9px",
  fontWeight:
    "800",
};

const errorStyle = {
  marginBottom:
    "16px",
  padding:
    "12px 14px",
  border:
    "1px solid #FECACA",
  borderRadius:
    "9px",
  background:
    "#FEF2F2",
  color:
    "#B91C1C",
  fontSize:
    "12px",
  fontWeight:
    "700",
};

const successStyle = {
  marginBottom:
    "16px",
  padding:
    "12px 14px",
  border:
    "1px solid #A7F3D0",
  borderRadius:
    "9px",
  background:
    "#ECFDF5",
  color:
    "#047857",
  fontSize:
    "12px",
  fontWeight:
    "700",
};

const messageStyle = {
  padding:
    "28px",
  textAlign:
    "center",
  color:
    "#64748B",
  fontSize:
    "13px",
};

const accessDeniedStyle = {
  padding:
    "18px",
  border:
    "1px solid #FECACA",
  borderRadius:
    "10px",
  background:
    "#FEF2F2",
  color:
    "#991B1B",
  fontSize:
    "13px",
  fontWeight:
    "700",
};

export default OrganizationLocationsSettings;