import { NavLink } from "react-router-dom";

import Logo from "../Logo/Logo";

import {
  FaTachometerAlt,
  FaUsers,
  FaUserPlus,
  FaClock,
  FaCalendarAlt,
  FaMoneyCheckAlt,
  FaHandHoldingUsd,
  FaChartLine,
  FaGraduationCap,
  FaFileAlt,
  FaCog,
  FaSignOutAlt,
} from "react-icons/fa";

import {
  clearAuthSession,
} from "../../../services/api";

import useAuthorization from "../../../hooks/useAuthorization";

function Sidebar() {
  const {
    hasPermission,
    loading: authorizationLoading,
  } = useAuthorization();

  /*
  ============================================================
  PERMISSION-AWARE NAVIGATION
  ============================================================

  Each CHRIS module appears only when the authenticated user
  has permission to view that module.

  Backend permissions remain the real security boundary.
  */

  const menuItems = [
    {
      icon: <FaTachometerAlt />,
      text: "Dashboard",
      path: "/",
      permission: "dashboard.view",
    },
    {
      icon: <FaUsers />,
      text: "Employees",
      path: "/employees",
      permission: "employees.view",
    },
    {
      icon: <FaUserPlus />,
      text: "Recruitment",
      path: "/recruitment",
      permission: "recruitment.view",
    },
    {
      icon: <FaClock />,
      text: "Attendance",
      path: "/attendance",
      permission: "attendance.view",
    },
    {
      icon: <FaCalendarAlt />,
      text: "Leave",
      path: "/leave",
      permission: "leave.view",
    },
    {
      icon: <FaMoneyCheckAlt />,
      text: "Payroll",
      path: "/payroll",
      permission: "payroll.view",
    },
    {
      icon: <FaHandHoldingUsd />,
      text: "Loans",
      path: "/loans",
      permission: "loans.view",
    },
    {
      icon: <FaChartLine />,
      text: "Performance",
      path: "/performance",
      permission: "performance.view",
    },
    {
      icon: <FaGraduationCap />,
      text: "Training",
      path: "/training",
      permission: "training.view",
    },
    {
      icon: <FaFileAlt />,
      text: "Reports",
      path: "/reports",
      permission: "reports.view",
    },
  ];

  const visibleMenuItems =
    authorizationLoading
      ? []
      : menuItems.filter((item) =>
          hasPermission(item.permission)
        );

  const canViewSettings =
    !authorizationLoading &&
    hasPermission("settings.view");

  /*
  ============================================================
  LOGOUT
  ============================================================

  1. Remove all CHRIS authentication data.
  2. Replace the current browser history entry
     with the Login page.
  3. ProtectedRoute prevents access to old
     authenticated routes without a token.
  */

  const handleLogout = () => {
    clearAuthSession();

    window.location.replace("/login");
  };

  const menuStyle = {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "13px 18px",
    margin: "3px 10px",
    color: "#D9E6DF",
    textDecoration: "none",
    fontSize: "15px",
    fontWeight: "500",
    borderRadius: "10px",
    transition: "all .2s ease",
    minHeight: "48px",
    boxSizing: "border-box",
  };

  return (
    <aside
      style={{
        width: "270px",
        height: "100vh",
        minHeight: "100vh",
        background: "#0B5E3B",
        color: "#FFFFFF",

        display: "flex",
        flexDirection: "column",
        flexShrink: 0,

        boxShadow:
          "4px 0 15px rgba(0,0,0,.12)",

        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* LOGO AREA */}
      <div
        style={{
          flexShrink: 0,
        }}
      >
        <Logo />
      </div>

      {/* MAIN NAVIGATION */}
      <nav
        style={{
          flex: 1,

          overflowY: "auto",
          overflowX: "hidden",

          paddingTop: "14px",
          paddingBottom: "10px",

          scrollbarWidth: "thin",
        }}
      >
        {visibleMenuItems.map((item) => (
          <NavLink
            key={item.text}
            to={item.path}
            style={({ isActive }) => ({
              ...menuStyle,

              background: isActive
                ? "#14824F"
                : "transparent",

              color: isActive
                ? "#FFFFFF"
                : "#D9E6DF",
            })}
            onMouseEnter={(event) => {
              event.currentTarget.style.background =
                "#14824F";

              event.currentTarget.style.color =
                "#FFFFFF";
            }}
            onMouseLeave={(event) => {
              const currentPath =
                window.location.pathname;

              const isCurrentPage =
                item.path === "/"
                  ? currentPath === "/"
                  : currentPath.startsWith(
                      item.path
                    );

              if (!isCurrentPage) {
                event.currentTarget.style.background =
                  "transparent";

                event.currentTarget.style.color =
                  "#D9E6DF";
              }
            }}
          >
            <span
              style={{
                width: "22px",
                minWidth: "22px",

                display: "flex",
                justifyContent: "center",

                fontSize: "17px",
              }}
            >
              {item.icon}
            </span>

            <span>
              {item.text}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* BOTTOM ACTIONS */}
      <div
        style={{
          flexShrink: 0,

          borderTop:
            "1px solid rgba(255,255,255,.10)",

          padding: "10px 0 14px",

          background: "#0B5E3B",
        }}
      >
        {/* SETTINGS */}
        {canViewSettings && (
          <NavLink
            to="/settings"
            style={({ isActive }) => ({
              ...menuStyle,

              background: isActive
                ? "#14824F"
                : "transparent",

              color: isActive
                ? "#FFFFFF"
                : "#D9E6DF",
            })}
            onMouseEnter={(event) => {
              event.currentTarget.style.background =
                "#14824F";

              event.currentTarget.style.color =
                "#FFFFFF";
            }}
            onMouseLeave={(event) => {
              if (
                window.location.pathname !==
                "/settings"
              ) {
                event.currentTarget.style.background =
                  "transparent";

                event.currentTarget.style.color =
                  "#D9E6DF";
              }
            }}
          >
            <span
              style={{
                width: "22px",
                minWidth: "22px",

                display: "flex",
                justifyContent: "center",

                fontSize: "17px",
              }}
            >
              <FaCog />
            </span>

            <span>
              Settings
            </span>
          </NavLink>
        )}

        {/* LOGOUT */}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            ...menuStyle,

            width:
              "calc(100% - 20px)",

            border: "none",

            background:
              "transparent",

            textAlign: "left",

            cursor: "pointer",

            fontFamily: "inherit",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background =
              "#A93226";

            event.currentTarget.style.color =
              "#FFFFFF";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background =
              "transparent";

            event.currentTarget.style.color =
              "#D9E6DF";
          }}
        >
          <span
            style={{
              width: "22px",
              minWidth: "22px",

              display: "flex",
              justifyContent: "center",

              fontSize: "17px",
            }}
          >
            <FaSignOutAlt />
          </span>

          <span>
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;