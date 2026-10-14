import { useState } from "react";
import { apiRequest } from "../../services/api";

function CreateRoleForm({ onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      setError("");
      const result = await apiRequest("/api/roles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });
      onCreated?.(result?.data);
    } catch (err) {
      setError(err.message || "Unable to create CHRIS role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="chris-create-role-form"
      onSubmit={submit}
      style={{
        marginBottom: "22px",
        padding: "20px",
        background: "#FFFFFF",
        border: "1px solid #DDE7E2",
        borderRadius: "14px",
        boxShadow: "0 6px 20px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ margin: 0, color: "#0F172A", fontSize: "18px", fontWeight: "800" }}>
          Create Organization Role
        </h3>
        <p style={{ margin: "6px 0 0", color: "#64748B", fontSize: "13px", lineHeight: 1.5 }}>
          Create a tenant role, then configure its permissions before assigning it to users.
        </p>
      </div>

      {error && (
        <div style={{
          marginBottom: "14px",
          padding: "12px 14px",
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          borderRadius: "9px",
          color: "#B91C1C",
          fontSize: "13px",
          fontWeight: "600",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(280px, 2fr)", gap: "14px" }}>
        <label style={{ color: "#334155", fontSize: "12px", fontWeight: "800" }}>
          Role Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
            placeholder="e.g. Branch HR Manager"
            style={inputStyle}
          />
        </label>

        <label style={{ color: "#334155", fontSize: "12px", fontWeight: "800" }}>
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={250}
            placeholder="Describe the responsibilities of this role"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: "9px", justifyContent: "flex-end", marginTop: "16px" }}>
        <button type="button" onClick={onCancel} disabled={saving} style={secondaryButtonStyle}>
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} style={primaryButtonStyle}>
          {saving ? "Creating…" : "Create Role"}
        </button>
      </div>
    </form>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: "7px",
  padding: "10px 12px",
  border: "1px solid #CBD5E1",
  borderRadius: "8px",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: "13px",
  boxSizing: "border-box",
};

const secondaryButtonStyle = {
  padding: "10px 14px",
  border: "1px solid #CBD5E1",
  borderRadius: "8px",
  background: "#FFFFFF",
  color: "#475569",
  fontSize: "12px",
  fontWeight: "800",
  cursor: "pointer",
};

const primaryButtonStyle = {
  padding: "10px 14px",
  border: "1px solid #087A43",
  borderRadius: "8px",
  background: "#087A43",
  color: "#FFFFFF",
  fontSize: "12px",
  fontWeight: "800",
  cursor: "pointer",
};

export default CreateRoleForm;
