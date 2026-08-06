import { useState } from "react";

function AddEmployee({ onBack, onSave }) {
  const [formData, setFormData] = useState({
    name: "",
    department: "",
    designation: "",
    email: "",
    phone: "",
    status: "Active",
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !formData.name.trim() ||
      !formData.department.trim() ||
      !formData.designation.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim()
    ) {
      setError(
        "Please complete all required fields before saving the employee."
      );
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        "http://localhost:5000/api/employees",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to save employee."
        );
      }

      onSave(result.data);
    } catch (err) {
      console.error("Add employee error:", err);

      setError(
        err.message ||
          "CHRIS could not save the employee. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          border: "none",
          background: "transparent",
          color: "#0B5E3B",
          fontSize: "14px",
          fontWeight: "700",
          cursor: "pointer",
          padding: 0,
          marginBottom: "22px",
        }}
      >
        &lt; Back to Employees
      </button>

      <div
        style={{
          marginBottom: "25px",
        }}
      >
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
          Add Employee
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            color: "#64748B",
            fontSize: "15px",
          }}
        >
          Create a new employee record and add the employee to CHRIS.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: "18px",
            padding: "28px",
            boxShadow: "0 6px 24px rgba(15,23,42,0.05)",
          }}
        >
          <h2
            style={{
              margin: "0 0 24px",
              color: "#0B5E3B",
              fontSize: "19px",
              fontWeight: "800",
            }}
          >
            Employee Information
          </h2>

          {error && (
            <div
              style={{
                marginBottom: "22px",
                padding: "13px 16px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "10px",
                color: "#B91C1C",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "22px",
            }}
          >
            <FormField
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter employee full name"
              required
            />

            <FormField
              label="Department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              placeholder="e.g. Finance"
              required
            />

            <FormField
              label="Designation"
              name="designation"
              value={formData.designation}
              onChange={handleChange}
              placeholder="e.g. Finance Manager"
              required
            />

            <FormField
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="employee@corporatehr.ng"
              required
            />

            <FormField
              label="Phone Number"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="08012345678"
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
                disabled={saving}
              >
                <option value="Active">Active</option>
                <option value="Probation">Probation</option>
                <option value="Leave">Leave</option>
              </select>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              marginTop: "30px",
              paddingTop: "22px",
              borderTop: "1px solid #E5E7EB",
            }}
          >
            <button
              type="button"
              onClick={onBack}
              disabled={saving}
              style={{
                background: "#FFFFFF",
                color: "#475569",
                border: "1px solid #CBD5E1",
                borderRadius: "10px",
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: "700",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              style={{
                background: "#0B5E3B",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "10px",
                padding: "12px 22px",
                fontSize: "14px",
                fontWeight: "700",
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow:
                  "0 6px 15px rgba(11,94,59,0.18)",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving Employee..." : "Save Employee"}
            </button>
          </div>
        </div>
      </form>
    </div>
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
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required && (
          <span style={{ color: "#DC2626" }}> *</span>
        )}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        style={fieldStyle}
      />
    </div>
  );
}

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: "700",
};

const fieldStyle = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid #CBD5E1",
  borderRadius: "10px",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

export default AddEmployee;