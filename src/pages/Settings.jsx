import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import UsersRolesSettings from "../components/settings/UsersRolesSettings";
import OrganizationLocationsSettings from "../components/settings/OrganizationLocationsSettings";
import OperationalSettings from "./OperationalSettings";

const OPERATIONAL_SECTIONS = new Set([
  "employees",
  "payroll",
  "attendance",
  "leave",
  "benefits",
  "recruitment",
  "notifications",
  "security",
  "system",
]);

function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useMemo(() => new URLSearchParams(location.search).get("workspace") || "users", [location.search]);

  const openWorkspace = (next) => {
    navigate(next === "users" ? "/settings" : `/settings?workspace=${encodeURIComponent(next)}`);
  };

  if (OPERATIONAL_SECTIONS.has(workspace)) {
    return (
      <div className="chris-settings-skin">
        <OperationalSettings section={workspace} />
      </div>
    );
  }

  const showLocations = workspace === "locations";

  return (
    <div className="chris-settings-skin">
      <div style={{ marginBottom: "20px" }}>
        <p style={{ margin: "0 0 6px", color: "var(--chris-dashboard-gold-bright)", fontSize: "12px", fontWeight: "900", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          System Administration
        </p>
        <h1 style={{ margin: 0, color: "var(--chris-dashboard-text)", fontSize: "30px", fontWeight: "850" }}>
          Settings
        </h1>
        <p style={{ margin: "8px 0 0", color: "var(--chris-dashboard-muted)", fontSize: "14px" }}>
          Manage users, roles, permissions, locations and audited CHRiS operating configuration.
        </p>
      </div>

      <div className="chris-settings-tabs" style={{ marginBottom: 18 }}>
        <button type="button" onClick={() => openWorkspace("users")} className={["chris-settings-tab", !showLocations ? "chris-settings-tab--active" : "chris-settings-tab--inactive"].join(" ")}>
          Users & Roles
        </button>
        <button type="button" onClick={() => openWorkspace("locations")} className={["chris-settings-tab", showLocations ? "chris-settings-tab--active" : "chris-settings-tab--inactive"].join(" ")}>
          Organization Locations
        </button>
      </div>

      {!showLocations && <UsersRolesSettings />}
      {showLocations && <OrganizationLocationsSettings />}
    </div>
  );
}

export default Settings;
