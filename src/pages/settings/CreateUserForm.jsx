import { useState } from "react";
import {
  FaUserPlus,
  FaTimes,
} from "react-icons/fa";

import { apiRequest } from "../../services/api";

function CreateUserForm({
  roles,
  onCancel,
  onCreated,
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    temporaryPassword: "",
    roleIds: [],
  });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
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
  };

  const handleSubmit = async (
    event
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.temporaryPassword
    ) {
      setError(
        "Complete all required fields."
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
              firstName:
                form.firstName.trim(),

              lastName:
                form.lastName.trim(),

              email:
                form.email
                  .trim()
                  .toLowerCase(),

              temporaryPassword:
                form.temporaryPassword,

              roleIds:
                form.roleIds,
            }),
          }
        );

      setSuccess(
        result.message ||
          "CHRIS user created successfully."
      );

      setForm({
        firstName: "",
        lastName: "",
        email: "",
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
    <div
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

              color: "#0B5E3B",

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
              Create a login account
              and assign access roles.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          title="Close"
          style={{
            border: "none",
            background:
              "transparent",
            color: "#64748B",
            cursor: "pointer",
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
          <div
            style={errorStyle}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={successStyle}
          >
            {success}
          </div>
        )}

        {/* NAME */}
        <div
          style={twoColumnStyle}
        >
          <FormField
            label="First Name"
            required
          >
            <input
              type="text"
              name="firstName"
              value={
                form.firstName
              }
              onChange={
                handleChange
              }
              placeholder="Enter first name"
              style={inputStyle}
              disabled={saving}
            />
          </FormField>

          <FormField
            label="Last Name"
            required
          >
            <input
              type="text"
              name="lastName"
              value={
                form.lastName
              }
              onChange={
                handleChange
              }
              placeholder="Enter last name"
              style={inputStyle}
              disabled={saving}
            />
          </FormField>
        </div>

        {/* EMAIL + PASSWORD */}
        <div
          style={twoColumnStyle}
        >
          <FormField
            label="Email Address"
            required
          >
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={
                handleChange
              }
              placeholder="user@example.com"
              style={inputStyle}
              disabled={saving}
            />
          </FormField>

          <FormField
            label="Temporary Password"
            required
            hint="Minimum 10 characters"
          >
            <input
              type="password"
              name="temporaryPassword"
              value={
                form.temporaryPassword
              }
              onChange={
                handleChange
              }
              placeholder="Enter temporary password"
              style={inputStyle}
              disabled={saving}
              autoComplete="new-password"
            />
          </FormField>
        </div>

        {/* ROLE ASSIGNMENT */}
        <div
          style={{
            marginTop: "4px",
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
              this user.
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
                          ? "2px solid #0B5E3B"
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

                color:
                  "#92400E",

                fontSize:
                  "12px",
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
            style={cancelButtonStyle}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              saving ||
              roles.length === 0
            }
            style={{
              ...saveButtonStyle,

              opacity:
                saving ||
                roles.length === 0
                  ? 0.65
                  : 1,

              cursor:
                saving ||
                roles.length === 0
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

const twoColumnStyle = {
  display: "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(240px, 1fr))",

  gap: "16px",

  marginBottom: "18px",
};

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

  background: "#0B5E3B",

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

const successStyle = {
  marginBottom: "18px",

  padding: "12px 14px",

  background: "#ECFDF5",

  border:
    "1px solid #A7F3D0",

  borderRadius: "9px",

  color: "#047857",

  fontSize: "12px",

  fontWeight: "700",
};

export default CreateUserForm;