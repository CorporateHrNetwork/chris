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

function Sidebar() {
  const menuItems = [
    {
      icon: <FaTachometerAlt />,
      text: "Dashboard",
      path: "/",
    },
    {
      icon: <FaUsers />,
      text: "Employees",
      path: "/employees",
    },
    {
      icon: <FaUserPlus />,
      text: "Recruitment",
      path: "/recruitment",
    },
    {
      icon: <FaClock />,
      text: "Attendance",
      path: "/attendance",
    },
    {
      icon: <FaCalendarAlt />,
      text: "Leave",
      path: "/leave",
    },
    {
      icon: <FaMoneyCheckAlt />,
      text: "Payroll",
      path: "/payroll",
    },
    {
      icon: <FaHandHoldingUsd />,
      text: "Loans",
      path: "/loans",
    },
    {
      icon: <FaChartLine />,
      text: "Performance",
      path: "/performance",
    },
    {
      icon: <FaGraduationCap />,
      text: "Training",
      path: "/training",
    },
    {
      icon: <FaFileAlt />,
      text: "Reports",
      path: "/reports",
    },
  ];

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
        boxShadow: "4px 0 15px rgba(0,0,0,.12)",
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
        {menuItems.map((item) => (
          <NavLink
            key={item.text}
            to={item.path}
            style={({ isActive }) => ({
              ...menuStyle,
              background: isActive ? "#14824F" : "transparent",
              color: isActive ? "#FFFFFF" : "#D9E6DF",
            })}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#14824F";
              e.currentTarget.style.color = "#FFFFFF";
            }}
            onMouseLeave={(e) => {
              const currentPath = window.location.pathname;

              if (currentPath !== item.path) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#D9E6DF";
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

            <span>{item.text}</span>
          </NavLink>
        ))}
      </nav>

      {/* BOTTOM ACTIONS */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,.10)",
          padding: "10px 0 14px",
          background: "#0B5E3B",
        }}
      >
        {/* SETTINGS */}
        <NavLink
          to="/settings"
          style={({ isActive }) => ({
            ...menuStyle,
            background: isActive ? "#14824F" : "transparent",
            color: isActive ? "#FFFFFF" : "#D9E6DF",
          })}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#14824F";
            e.currentTarget.style.color = "#FFFFFF";
          }}
          onMouseLeave={(e) => {
            if (window.location.pathname !== "/settings") {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#D9E6DF";
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

          <span>Settings</span>
        </NavLink>

        {/* LOGOUT */}
        <div
          style={{
            ...menuStyle,
            color: "#D9E6DF",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#A93226";
            e.currentTarget.style.color = "#FFFFFF";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#D9E6DF";
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

          <span>Logout</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;