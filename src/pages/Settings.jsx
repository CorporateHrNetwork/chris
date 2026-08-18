import {
  useState,
} from "react";

import UsersRolesSettings from "../components/settings/UsersRolesSettings";
import OrganizationLocationsSettings from "../components/settings/OrganizationLocationsSettings";

function Settings() {
  const [
    activeSection,
    setActiveSection,
  ] = useState(
    "users-roles"
  );

  return (
    <div className="chris-settings-skin">
      <div
        style={{
          marginBottom: "20px",
        }}
      >
        <p
          style={{
            margin: "0 0 6px",
            color:
              "var(--chris-dashboard-gold-bright)",
            fontSize: "12px",
            fontWeight: "900",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          System Administration
        </p>

        <h1
          style={{
            margin: 0,
            color:
              "var(--chris-dashboard-text)",
            fontSize: "30px",
            fontWeight: "850",
          }}
        >
          Settings
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            color:
              "var(--chris-dashboard-muted)",
            fontSize: "14px",
          }}
        >
          Manage users, roles, permissions and organization locations.
        </p>
      </div>

      <div className="chris-settings-tabs">
        <button
          type="button"
          onClick={() =>
            setActiveSection(
              "users-roles"
            )
          }
          className={[
            "chris-settings-tab",
            activeSection ===
            "users-roles"
              ? "chris-settings-tab--active"
              : "chris-settings-tab--inactive",
          ].join(" ")}
        >
          Users & Roles
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveSection(
              "locations"
            )
          }
          className={[
            "chris-settings-tab",
            activeSection ===
            "locations"
              ? "chris-settings-tab--active"
              : "chris-settings-tab--inactive",
          ].join(" ")}
        >
          Organization Locations
        </button>
      </div>

      {activeSection ===
        "users-roles" && (
        <UsersRolesSettings />
      )}

      {activeSection ===
        "locations" && (
        <OrganizationLocationsSettings />
      )}
    </div>
  );
}

export default Settings;
