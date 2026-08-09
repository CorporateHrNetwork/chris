import {
  FaBell,
  FaSearch,
  FaBars,
} from "react-icons/fa";

import avatar from "../../../assets/images/avatar.png";

import {
  getStoredUser,
  getStoredOrganization,
} from "../../../services/api";

function Topbar() {
  const user =
    getStoredUser();

  const organization =
    getStoredOrganization();

  const today =
    new Date().toLocaleDateString(
      "en-NG",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );

  const userName =
    [
      user?.firstName,
      user?.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "CHRIS User";

  const organizationName =
    organization?.name ||
    "CHRIS";

  return (
    <header
      style={{
        height: "78px",
        minHeight: "78px",
        flexShrink: 0,

        background: "#FFFFFF",

        display: "flex",
        alignItems: "center",
        justifyContent:
          "space-between",

        gap: "20px",

        padding: "0 28px",

        borderBottom:
          "1px solid #E5E7EB",

        boxShadow:
          "0 2px 8px rgba(15,23,42,0.04)",

        boxSizing: "border-box",
        position: "relative",
        zIndex: 20,
      }}
    >
      {/* LEFT */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          minWidth: 0,
        }}
      >
        <button
          type="button"
          style={{
            display: "none",
            alignItems: "center",
            justifyContent:
              "center",
            width: "38px",
            height: "38px",
            border:
              "1px solid #E2E8F0",
            borderRadius: "9px",
            background: "#FFFFFF",
            color: "#0B5E3B",
          }}
          aria-label="Open navigation"
        >
          <FaBars />
        </button>

        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              color: "#0B5E3B",
              fontSize: "18px",
              fontWeight: "800",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow:
                "ellipsis",
            }}
          >
            {organizationName}
          </div>

          <div
            style={{
              marginTop: "3px",
              color: "#64748B",
              fontSize: "11px",
              fontWeight: "600",
            }}
          >
            {today}
          </div>
        </div>
      </div>

      {/* RIGHT */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          minWidth: 0,
        }}
      >
        {/* SEARCH */}

        <div
          style={{
            width: "300px",
            maxWidth: "30vw",

            display: "flex",
            alignItems: "center",

            padding:
              "9px 14px",

            border:
              "1px solid #E2E8F0",

            borderRadius:
              "10px",

            background:
              "#F8FAFC",
          }}
        >
          <FaSearch
            size={13}
            color="#94A3B8"
          />

          <input
            type="text"
            placeholder="Search CHRIS..."
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background:
                "transparent",

              marginLeft:
                "9px",

              color: "#334155",
              fontSize: "13px",
            }}
          />
        </div>

        {/* NOTIFICATIONS */}

        <button
          type="button"
          title="Notifications"
          style={{
            width: "38px",
            height: "38px",

            display: "flex",
            alignItems: "center",
            justifyContent:
              "center",

            border:
              "1px solid #E2E8F0",

            borderRadius:
              "9px",

            background:
              "#FFFFFF",

            color:
              "#0B5E3B",

            cursor:
              "pointer",
          }}
        >
          <FaBell />
        </button>

        {/* USER */}

        <div
          style={{
            display: "flex",
            alignItems:
              "center",
            gap: "10px",

            paddingLeft:
              "4px",
          }}
        >
          <img
            src={avatar}
            alt={userName}
            style={{
              width: "40px",
              height: "40px",

              borderRadius:
                "50%",

              objectFit:
                "cover",

              border:
                "2px solid #D4AF37",
            }}
          />

          <div
            style={{
              maxWidth:
                "160px",
            }}
          >
            <div
              style={{
                color:
                  "#0F172A",

                fontSize:
                  "12px",

                fontWeight:
                  "800",

                whiteSpace:
                  "nowrap",

                overflow:
                  "hidden",

                textOverflow:
                  "ellipsis",
              }}
            >
              {userName}
            </div>

            <div
              style={{
                marginTop:
                  "2px",

                color:
                  "#64748B",

                fontSize:
                  "10px",
              }}
            >
              Signed in
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;