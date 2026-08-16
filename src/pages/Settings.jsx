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
    <div>
      <div
        style={{
          display: "flex",

          gap: "10px",

          flexWrap:
            "wrap",

          marginBottom:
            "24px",
        }}
      >
        <button
          type="button"

          onClick={() =>
            setActiveSection(
              "users-roles"
            )
          }

          style={{
            ...sectionButtonStyle,

            background:
              activeSection ===
              "users-roles"
                ? "#087A43"
                : "#FFFFFF",

            color:
              activeSection ===
              "users-roles"
                ? "#FFFFFF"
                : "#475569",

            border:
              activeSection ===
              "users-roles"
                ? "1px solid #087A43"
                : "1px solid #CBD5E1",
          }}
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

          style={{
            ...sectionButtonStyle,

            background:
              activeSection ===
              "locations"
                ? "#087A43"
                : "#FFFFFF",

            color:
              activeSection ===
              "locations"
                ? "#FFFFFF"
                : "#475569",

            border:
              activeSection ===
              "locations"
                ? "1px solid #087A43"
                : "1px solid #CBD5E1",
          }}
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

const sectionButtonStyle = {
  padding:
    "10px 14px",

  borderRadius:
    "8px",

  fontSize:
    "12px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

export default Settings;