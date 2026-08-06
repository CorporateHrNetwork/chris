import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

function EmployeeProfile() {
  const { employeeNumber } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `http://localhost:5000/api/employees/${encodeURIComponent(
          employeeNumber
        )}`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to load employee profile."
        );
      }

      const employee = result.data;

      const normalizedProfile = {
        databaseId: employee.id,
        id: employee.employeeNumber,

        name: [
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ]
          .filter(Boolean)
          .join(" "),

        department: employee.department?.name || "",
        designation: employee.designation?.name || "",

        email: employee.email || "",
        phone: employee.phone || "",

        status: formatStatus(employee.status),

        hireDate: employee.hireDate,
        confirmationDate: employee.confirmationDate,
        exitDate: employee.exitDate,
      };

      setProfile(normalizedProfile);

      setFormData({
        name: normalizedProfile.name,
        department: normalizedProfile.department,
        designation: normalizedProfile.designation,
        email: normalizedProfile.email,
        phone: normalizedProfile.phone,
        status: normalizedProfile.status,

        hireDate: toDateInput(normalizedProfile.hireDate),

        confirmationDate: toDateInput(
          normalizedProfile.confirmationDate
        ),

        exitDate: toDateInput(normalizedProfile.exitDate),
      });
    } catch (err) {
      console.error("Employee profile error:", err);

      setError(
        err.message || "CHRIS could not load the employee profile."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [employeeNumber]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `http://localhost:5000/api/employees/${encodeURIComponent(
          employeeNumber
        )}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to update employee."
        );
      }

      await loadProfile();

      setEditing(false);

      setSuccess("Employee updated successfully.");

      setTimeout(() => {
        setSuccess("");
      }, 4000);
    } catch (err) {
      console.error("Employee update error:", err);

      setError(
        err.message || "CHRIS could not update this employee."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setError("");
    setSuccess("");

    setFormData({
      name: profile.name,
      department: profile.department,
      designation: profile.designation,
      email: profile.email,
      phone: profile.phone,
      status: profile.status,

      hireDate: toDateInput(profile.hireDate),

      confirmationDate: toDateInput(
        profile.confirmationDate
      ),

      exitDate: toDateInput(profile.exitDate),
    });
  };

  if (loading) {
    return (
      <div style={loadingStyle}>
        Loading employee profile...
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div style={pageStyle}>
        <button
          type="button"
          onClick={() => navigate("/employees")}
          style={backButtonStyle}
        >
          &lt; Back to Employees
        </button>

        <ErrorMessage message={error} />
      </div>
    );
  }

  const initials = profile.name
    .split(" ")
    .map((name) => name.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={pageStyle}>
      <button
        type="button"
        onClick={() => navigate("/employees")}
        style={backButtonStyle}
      >
        &lt; Back to Employees
      </button>

      {success && (
        <div style={successStyle}>
          {success}
        </div>
      )}

      {error && (
        <ErrorMessage message={error} />
      )}

      <div style={headerCardStyle}>
        <div style={profileIdentityStyle}>
          <div style={avatarStyle}>
            {initials}
          </div>

          <div>
            <p style={eyebrowStyle}>
              Employee Profile
            </p>

            <h1 style={nameStyle}>
              {profile.name}
            </h1>

            <p style={subtitleStyle}>
              {profile.designation} - {profile.department}
            </p>

            <p style={employeeNumberStyle}>
              {profile.id}
            </p>
          </div>
        </div>

        <StatusBadge status={profile.status} />
      </div>

      {editing ? (
        <form
          onSubmit={handleSave}
          style={editCardStyle}
        >
          <div style={editHeaderStyle}>
            <div>
              <h2 style={editTitleStyle}>
                Edit Employee
              </h2>

              <p style={editSubtitleStyle}>
                Update the employee record and save changes to CHRIS.
              </p>
            </div>

            <div style={buttonGroupStyle}>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                style={cancelButtonStyle}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                style={{
                  ...saveButtonStyle,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </div>

          <div style={formGridStyle}>
            <FormField
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />

            <FormField
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
            />

            <FormField
              label="Phone Number"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
            />

            <FormField
              label="Department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              required
            />

            <FormField
              label="Designation"
              name="designation"
              value={formData.designation}
              onChange={handleChange}
              required
            />

            <div>
              <label style={labelStyle}>
                Employment Status
              </label>

              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                style={fieldStyle}
              >
                <option value="Active">Active</option>
                <option value="Probation">Probation</option>
                <option value="Leave">Leave</option>
                <option value="Suspended">Suspended</option>
                <option value="Resigned">Resigned</option>
                <option value="Terminated">Terminated</option>
                <option value="Retired">Retired</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <FormField
              label="Hire Date"
              name="hireDate"
              type="date"
              value={formData.hireDate}
              onChange={handleChange}
            />

            <FormField
              label="Confirmation Date"
              name="confirmationDate"
              type="date"
              value={formData.confirmationDate}
              onChange={handleChange}
            />

            <FormField
              label="Exit Date"
              name="exitDate"
              type="date"
              value={formData.exitDate}
              onChange={handleChange}
            />
          </div>
        </form>
      ) : (
        <div style={cardsGridStyle}>
          <InformationCard title="Employee Information">
            <InfoRow
              label="Full Name"
              value={profile.name}
            />

            <InfoRow
              label="Employee ID"
              value={profile.id}
            />

            <InfoRow
              label="Department"
              value={profile.department}
            />

            <InfoRow
              label="Designation"
              value={profile.designation}
            />

            <InfoRow
              label="Employment Status"
              value={profile.status}
            />
          </InformationCard>

          <InformationCard title="Contact Information">
            <InfoRow
              label="Email"
              value={profile.email}
            />

            <InfoRow
              label="Phone"
              value={profile.phone}
            />
          </InformationCard>

          <InformationCard title="Employment">
            <InfoRow
              label="Hire Date"
              value={formatDate(profile.hireDate)}
            />

            <InfoRow
              label="Confirmation Date"
              value={formatDate(
                profile.confirmationDate
              )}
            />

            <InfoRow
              label="Exit Date"
              value={formatDate(profile.exitDate)}
            />
          </InformationCard>

          <InformationCard title="Quick Actions">
            <div style={actionsGridStyle}>
              <button
                type="button"
                onClick={() => {
                  setSuccess("");
                  setError("");
                  setEditing(true);
                }}
                style={actionButtonStyle}
              >
                Edit Employee
              </button>

              <ActionButton text="Leave" />
              <ActionButton text="Payroll" />
              <ActionButton text="Documents" />
            </div>
          </InformationCard>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required ? " *" : ""}
      </label>

      <input
        name={name}
        type={type}
        value={value || ""}
        onChange={onChange}
        required={required}
        style={fieldStyle}
      />
    </div>
  );
}

function ErrorMessage({ message }) {
  return (
    <div style={errorStyle}>
      {message}
    </div>
  );
}

function formatStatus(status) {
  const labels = {
    ACTIVE: "Active",
    PROBATION: "Probation",
    LEAVE: "Leave",
    SUSPENDED: "Suspended",
    TERMINATED: "Terminated",
    RESIGNED: "Resigned",
    RETIRED: "Retired",
    INACTIVE: "Inactive",
  };

  return labels[status] || status;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function toDateInput(value) {
  if (!value) {
    return "";
  }

  return new Date(value)
    .toISOString()
    .slice(0, 10);
}

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

  if (status === "Suspended") {
    background = "#FEF2F2";
    color = "#B91C1C";
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 14px",
        borderRadius: "999px",
        background,
        color,
        fontSize: "13px",
        fontWeight: "700",
      }}
    >
      {status}
    </div>
  );
}

function InformationCard({
  title,
  children,
}) {
  return (
    <div style={informationCardStyle}>
      <h2 style={informationTitleStyle}>
        {title}
      </h2>

      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}) {
  return (
    <div style={infoRowStyle}>
      <span style={infoLabelStyle}>
        {label}
      </span>

      <span style={infoValueStyle}>
        {value || "-"}
      </span>
    </div>
  );
}

function ActionButton({ text }) {
  return (
    <button
      type="button"
      style={actionButtonStyle}
    >
      {text}
    </button>
  );
}

const pageStyle = {
  width: "100%",
  maxWidth: "1200px",
  margin: "0 auto",
};

const loadingStyle = {
  padding: "40px",
  textAlign: "center",
  color: "#64748B",
  fontSize: "14px",
};

const backButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#0B5E3B",
  fontSize: "14px",
  fontWeight: "700",
  cursor: "pointer",
  padding: 0,
  marginBottom: "22px",
};

const headerCardStyle = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "26px",
  marginBottom: "22px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "20px",
  flexWrap: "wrap",
};

const profileIdentityStyle = {
  display: "flex",
  alignItems: "center",
  gap: "18px",
};

const avatarStyle = {
  width: "72px",
  height: "72px",
  borderRadius: "50%",
  background: "#E8F5EF",
  color: "#0B5E3B",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
  fontWeight: "800",
  flexShrink: 0,
};

const eyebrowStyle = {
  margin: "0 0 5px",
  color: "#64748B",
  fontSize: "13px",
  fontWeight: "600",
};

const nameStyle = {
  margin: 0,
  color: "#0F172A",
  fontSize: "28px",
  fontWeight: "800",
};

const subtitleStyle = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: "14px",
};

const employeeNumberStyle = {
  margin: "5px 0 0",
  color: "#0B5E3B",
  fontSize: "13px",
  fontWeight: "700",
};

const cardsGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "22px",
};

const informationCardStyle = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "24px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
};

const informationTitleStyle = {
  margin: "0 0 18px",
  color: "#0B5E3B",
  fontSize: "18px",
  fontWeight: "800",
};

const infoRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "20px",
  padding: "13px 0",
  borderBottom: "1px solid #EEF2F1",
};

const infoLabelStyle = {
  color: "#64748B",
  fontSize: "13px",
};

const infoValueStyle = {
  color: "#0F172A",
  fontSize: "14px",
  fontWeight: "700",
  textAlign: "right",
};

const actionsGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(2, 1fr)",
  gap: "12px",
};

const actionButtonStyle = {
  border: "1px solid #D1E5DB",
  background: "#F8FCFA",
  color: "#0B5E3B",
  borderRadius: "10px",
  padding: "12px",
  fontSize: "13px",
  fontWeight: "700",
  cursor: "pointer",
};

const editCardStyle = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "26px",
  boxShadow:
    "0 6px 24px rgba(15, 23, 42, 0.05)",
};

const editHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "20px",
  flexWrap: "wrap",
  marginBottom: "25px",
};

const editTitleStyle = {
  margin: 0,
  color: "#0B5E3B",
  fontSize: "21px",
  fontWeight: "800",
};

const editSubtitleStyle = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: "13px",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "20px",
};

const labelStyle = {
  display: "block",
  marginBottom: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: "700",
};

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 13px",
  borderRadius: "10px",
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: "14px",
  outline: "none",
};

const buttonGroupStyle = {
  display: "flex",
  gap: "10px",
};

const saveButtonStyle = {
  border: "none",
  background: "#0B5E3B",
  color: "#FFFFFF",
  borderRadius: "9px",
  padding: "11px 18px",
  fontSize: "13px",
  fontWeight: "700",
  cursor: "pointer",
};

const cancelButtonStyle = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#475569",
  borderRadius: "9px",
  padding: "11px 18px",
  fontSize: "13px",
  fontWeight: "700",
  cursor: "pointer",
};

const successStyle = {
  padding: "14px 16px",
  marginBottom: "18px",
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: "700",
};

const errorStyle = {
  padding: "14px 16px",
  marginBottom: "18px",
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: "700",
};

export default EmployeeProfile;