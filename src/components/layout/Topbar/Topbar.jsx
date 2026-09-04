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

        background: "linear-gradient(90deg, #030705 0%, #06110C 48%, #081A11 100%)",

        display: "flex",
        alignItems: "center",
        justifyContent:
          "space-between",

        gap: "20px",

        padding: "0 28px",

        borderBottom:
          "1px solid rgba(212,175,55,0.24)",

        boxShadow:
          "0 5px 22px rgba(0,0,0,0.30), 0 1px 0 rgba(8,122,67,0.12)",

        boxSizing: "border-box",
        position: "relative",
        zIndex: 20,
        overflow: "hidden",
      }}
    >
      {/* AMBIENT TOPBAR DESIGN */}

      <div className="chris-topbar"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "260px",
            height: "140px",
            left: "8%",
            top: "-70px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(8,122,67,0.18), transparent 70%)",
            filter: "blur(10px)",
          }}
        />

        <div
          style={{
            position: "absolute",
            width: "240px",
            height: "120px",
            right: "12%",
            bottom: "-70px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(212,175,55,0.12), transparent 70%)",
            filter: "blur(10px)",
          }}
        />

        <div
          style={{
            position: "absolute",
            width: "52%",
            height: "1px",
            right: "0",
            bottom: "0",
            background:
              "linear-gradient(90deg, transparent, rgba(8,122,67,0.38), rgba(212,175,55,0.62), transparent)",
          }}
        />
      </div>

      {/* LEFT */}

      <div
        style={{
          minHeight: "50px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          minWidth: 0,
          position: "relative",
          zIndex: 1,
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
              "1px solid rgba(212,175,55,0.28)",

            borderRadius: "9px",

            background:
              "linear-gradient(145deg, rgba(255,255,255,0.035), rgba(8,122,67,0.10))",

            color: "#D4AF37",

            boxShadow:
              "inset 0 0 12px rgba(8,122,67,0.05)",
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
color: "#087A43",
              fontSize: "18px",
              fontWeight: "900",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow:
                "ellipsis",

              textShadow: "none",
            }}
          >
            {organizationName}
          </div>

          <div
            style={{
              marginTop: "3px",
              color: "#D4AF37",
              fontSize: "11px",
              fontWeight: "700",
              letterSpacing:
                "0.01em",
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
          position: "relative",
          zIndex: 1,
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
              "1px solid rgba(8,122,67,0.42)",

            borderRadius:
              "10px",

            background:
              "rgba(2,10,7,0.56)",

            boxShadow:
              "inset 0 0 16px rgba(8,122,67,0.04), 0 0 12px rgba(0,0,0,0.10)",
          }}
        >
          <FaSearch
            size={13}
            color="#D4AF37"
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

              color: "#F8FAF9",
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
              "1px solid rgba(212,175,55,0.30)",

            borderRadius:
              "9px",

            background:
              "linear-gradient(145deg, rgba(255,255,255,0.035), rgba(8,122,67,0.09))",

            color:
              "#D4AF37",

            cursor:
              "pointer",

            boxShadow:
              "0 0 14px rgba(212,175,55,0.06)",
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

              boxShadow:
                "0 0 12px rgba(212,175,55,0.16), 0 0 14px rgba(8,122,67,0.12)",
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
                  "#087A43",

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
                  "#9DB8AA",

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
