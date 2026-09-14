import {
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";

import UsersRolesSettings from "../components/settings/UsersRolesSettings";
import OrganizationLocationsSettings from "../components/settings/OrganizationLocationsSettings";
import SupportDesk from "./SupportDesk";

function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedWorkspace = searchParams.get("workspace");
  const [
    activeSection,
    setActiveSection,
  ] = useState(
    requestedWorkspace === "support-desk" ? "support-desk" : "users-roles"
  );

  const selectSection = (section) => {
    setActiveSection(section);
    if (section === "support-desk") {
      setSearchParams({ workspace: "support-desk" }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className="chris-settings-skin">
      {activeSection !== "support-desk" ? (
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
            Manage users, roles, permissions, organization locations and CHRiS Support Desk.
          </p>
        </div>
      ) : null}

      <div className="chris-settings-tabs" style={{ marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => selectSection("users-roles")}
          className={[
            "chris-settings-tab",
            activeSection === "users-roles"
              ? "chris-settings-tab--active"
              : "chris-settings-tab--inactive",
          ].join(" ")}
        >
          Users & Roles
        </button>

        <button
          type="button"
          onClick={() => selectSection("locations")}
          className={[
            "chris-settings-tab",
            activeSection === "locations"
              ? "chris-settings-tab--active"
              : "chris-settings-tab--inactive",
          ].join(" ")}
        >
          Organization Locations
        </button>

        <button
          type="button"
          onClick={() => selectSection("support-desk")}
          className={[
            "chris-settings-tab",
            activeSection === "support-desk"
              ? "chris-settings-tab--active"
              : "chris-settings-tab--inactive",
          ].join(" ")}
        >
          CHRiS Support Desk
        </button>
      </div>

      {activeSection === "users-roles" && (
        <UsersRolesSettings />
      )}

      {activeSection === "locations" && (
        <OrganizationLocationsSettings />
      )}

      {activeSection === "support-desk" && (
        <SupportDesk />
      )}
    </div>
  );
}

export default Settings;
