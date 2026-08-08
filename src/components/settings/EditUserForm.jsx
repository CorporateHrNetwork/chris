import {
  useEffect,
  useState,
} from "react";

import {
  FaSave,
  FaTimes,
  FaUserShield,
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
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

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

    setError("");
  }, [user]);

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

  const handleSubmit =
    async (event) => {
      event.preventDefault();

      setError("");

      if (
        !firstName.trim() ||
        !lastName.trim() ||
        !email.trim()
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

      try {
        setSaving(true);

        const result =
          await apiRequest(
            `/api/users/${user.id}`,
            {
              method: "PUT",

              body: JSON.stringify({
                firstName:
                  firstName.trim(),

                lastName:
                  lastName.trim(),

                email:
                  email
                    .trim()
                    .toLowerCase(),

                roleIds:
                  selectedRoleIds,
              }),
            }
          );

        if (onUpdated) {
          await onUpdated(
            result.data
          );
        }
      } catch (requestError) {
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

  return (
    <div
      style={{
        background: "#FFFFFF",

        border:
          "1px solid #DDE5E1",

        borderRadius: "16px",

        padding: "24px",

        marginBottom: "24px",

        boxShadow:
          "0 8px 24px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap: "16px",

          marginBottom: "22px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",

              alignItems:
                "center",

              gap: "9px",

              marginBottom: "5px",
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
              Edit User
            </h2>
          </div>

          <p
            style={{
              margin: 0,

              color:
                "#64748B",

              fontSize:
                "13px",
            }}
          >
            Update the user's
            account details and
            assigned CHRIS roles.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            border: "none",

            background:
              "#F1F5F9",

            color:
              "#475569",

            width: "36px",
            height: "36px",

            borderRadius:
              "9px",

            cursor:
              saving
                ? "not-allowed"
                : "pointer",

            display: "flex",

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
        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",

            gap: "18px",
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
              value={email}
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

        <div
          style={{
            marginTop: "24px",
          }}
        >
          <div
            style={{
              marginBottom:
                "10px",

              color:
                "#334155",

              fontSize:
                "13px",

              fontWeight:
                "800",
            }}
          >
            Assigned Roles *
          </div>

          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",

              gap: "10px",
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

                      gap: "9px",

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

        <div
          style={{
            display: "flex",

            justifyContent:
              "flex-end",

            gap: "10px",

            marginTop: "26px",

            flexWrap: "wrap",
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
            <FaTimes />

            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            style={{
              ...saveButtonStyle,

              opacity:
                saving
                  ? 0.7
                  : 1,

              cursor:
                saving
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            <FaSave />

            {saving
              ? "Saving..."
              : "Save Changes"}
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

const inputStyle = {
  width: "100%",

  boxSizing:
    "border-box",

  padding:
    "11px 12px",

  border:
    "1px solid #CBD5E1",

  borderRadius:
    "9px",

  outline: "none",

  fontSize:
    "14px",

  color:
    "#0F172A",

  background:
    "#FFFFFF",
};

const cancelButtonStyle = {
  display: "flex",

  alignItems:
    "center",

  gap: "7px",

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
  display: "flex",

  alignItems:
    "center",

  gap: "7px",

  padding:
    "11px 17px",

  border: "none",

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

export default EditUserForm;