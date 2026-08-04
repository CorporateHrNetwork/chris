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
    {
      icon: <FaCog />,
      text: "Settings",
      path: "/settings",
    },
  ];

  return (
    <aside
      style={{
        width: "270px",
        height: "100vh",
        background: "#0B5E3B",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "4px 0 15px rgba(0,0,0,.12)",
      }}
    >
      <div>
        <Logo />

        <div style={{ marginTop: "18px" }}>
          {menuItems.map((item) => (
            <NavLink
              key={item.text}
              to={item.path}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "14px 22px",
                margin: "4px 12px",
                borderRadius: "10px",
                textDecoration: "none",
                fontSize: "15px",
                fontWeight: "500",
                transition: ".25s",
                color: "#FFFFFF",
                background: isActive ? "#14824F" : "transparent",
              })}
            >
              <span style={{ fontSize: "18px" }}>
                {item.icon}
              </span>

              <span>{item.text}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,.08)",
          padding: "18px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px 22px",
            margin: "4px 12px",
            borderRadius: "10px",
            color: "#FFFFFF",
            cursor: "pointer",
          }}
        >
          <FaSignOutAlt />

          <span>Logout</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;