import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import Logo from "../Logo/Logo";

import {
  FaTachometerAlt,
  FaUsers,
  FaUserPlus,
  FaClock,
  FaCalendarAlt,
  FaMoneyCheckAlt,
  FaChartLine,
  FaGraduationCap,
  FaFileAlt,
  FaCog,
  FaSignOutAlt,
  FaChevronDown,
  FaChevronRight,
  FaBuilding,
  FaGift,
  FaHeartbeat,
  FaFolderOpen,
  FaLaptop,
  FaProjectDiagram,
  FaClipboardCheck,
  FaUserTie,
  FaMoneyBillWave,
  FaShieldAlt,
  FaBriefcase,
  FaFileInvoiceDollar,
  FaSitemap,
} from "react-icons/fa";

import {
  clearAuthSession,
} from "../../../services/api";

import useAuthorization from "../../../hooks/useAuthorization";

function Sidebar() {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const {
    hasPermission,
    loading:
      authorizationLoading,
  } = useAuthorization();

  const [
    openGroups,
    setOpenGroups,
  ] = useState({});

  /*
  ============================================================
  MENU BLUEPRINT
  ============================================================

  Existing working pages use real routes.

  Future submodules are shown as planned navigation items
  but are not clickable yet.

  This allows CHRIS to adopt the complete product structure
  without breaking unfinished modules.
  ============================================================
  */

  const menuGroups =
    useMemo(
      () => [
        {
          id: "dashboard",
          label: "Dashboard",
          icon:
            <FaTachometerAlt />,
          permission:
            "dashboard.view",
          path: "/",
          exact: true,
        },

        {
          id: "employees",
          label: "Employees",
          icon:
            <FaUsers />,
          permission:
            "employees.view",

          children: [
            {
              label:
                "Employee Directory",
              path:
                "/employees",
            },
            {
              label:
                "Employee Profiles",
              planned: true,
            },
            {
              label:
                "Onboarding",
              planned: true,
            },
            {
              label:
                "Employee Analytics",
              planned: true,
            },
            {
              label:
                "Transfers",
              planned: true,
            },
            {
              label:
                "Promotions",
              planned: true,
            },
            {
              label:
                "Exits",
              planned: true,
            },
            {
              label:
                "Line Managers",
              planned: true,
            },
          ],
        },

        {
          id: "recruitment",
          label:
            "Recruitment",
          icon:
            <FaUserPlus />,
          permission:
            "recruitment.view",

          children: [
            {
              label:
                "Recruitment Dashboard",
              path:
                "/recruitment",
            },
            {
              label:
                "Job Requisitions",
              planned: true,
            },
            {
              label:
                "Vacancies",
              planned: true,
            },
            {
              label:
                "Candidates",
              planned: true,
            },
            {
              label:
                "Interviews",
              planned: true,
            },
            {
              label:
                "Offers",
              planned: true,
            },
            {
              label:
                "Applicant Tracking System",
              planned: true,
            },
            {
              label:
                "Talent Pool",
              planned: true,
            },
          ],
        },

        {
          id:
            "time-attendance",

          label:
            "Time & Attendance",

          icon:
            <FaClock />,

          permission:
            "attendance.view",

          children: [
            {
              label:
                "Attendance Dashboard",
              path:
                "/attendance",
            },
            {
              label:
                "Attendance Register",
              planned: true,
            },
            {
              label:
                "Shifts",
              planned: true,
            },
            {
              label:
                "Shift Schedule",
              planned: true,
            },
            {
              label:
                "Worked Hours",
              planned: true,
            },
            {
              label:
                "Worked Days",
              planned: true,
            },
            {
              label:
                "Off Days",
              planned: true,
            },
            {
              label:
                "Overtime",
              planned: true,
            },
            {
              label:
                "Public Holidays",
              planned: true,
            },
            {
              label:
                "Lateness & Absence",
              planned: true,
            },
          ],
        },

        {
          id: "leave",
          label: "Leave",
          icon:
            <FaCalendarAlt />,
          permission:
            "leave.view",

          children: [
            {
              label:
                "Leave Overview",
              path:
                "/leave",
            },
            {
              label:
                "Leave Requests",
              planned: true,
            },
            {
              label:
                "Leave Calendar",
              planned: true,
            },
            {
              label:
                "Leave Entitlements",
              planned: true,
            },
            {
              label:
                "Leave Balances",
              planned: true,
            },
            {
              label:
                "Leave Policies",
              planned: true,
            },
          ],
        },

        {
          id: "payroll",
          label: "Payroll",
          icon:
            <FaMoneyCheckAlt />,
          permission:
            "payroll.view",

          children: [
            {
              label:
                "Payroll Dashboard",
              path:
                "/payroll",
            },
            {
              label:
                "Execute Payroll",
              planned: true,
            },
            {
              label:
                "Payroll Periods",
              planned: true,
            },
            {
              label:
                "Salary Rates",
              planned: true,
            },
            {
              label:
                "Allowances",
              planned: true,
            },
            {
              label:
                "Deductions",
              planned: true,
            },
            {
              label:
                "Payslips",
              planned: true,
            },
            {
              label:
                "Loans",
              path:
                "/loans",
            },
            {
              label:
                "Salary Advances",
              planned: true,
            },
            {
              label:
                "Paid Leave",
              planned: true,
            },
            {
              label:
                "Payroll Approvals",
              planned: true,
            },
          ],
        },

        {
          id:
            "compensation",

          label:
            "Compensation & Rewards",

          icon:
            <FaMoneyBillWave />,

          adminOnly: true,

          children: [
            {
              label:
                "Compensation Dashboard",
              planned: true,
            },
            {
              label:
                "Salary Structure",
              planned: true,
            },
            {
              label:
                "Grades & Levels",
              planned: true,
            },
            {
              label:
                "Salary Bands",
              planned: true,
            },
            {
              label:
                "Compensation Reviews",
              planned: true,
            },
            {
              label:
                "Salary Adjustments",
              planned: true,
            },
            {
              label:
                "Promotions",
              planned: true,
            },
            {
              label:
                "Bonuses & Incentives",
              planned: true,
            },
            {
              label:
                "Total Rewards",
              planned: true,
            },
          ],
        },

        {
          id: "benefits",
          label:
            "Benefits",
          icon:
            <FaGift />,

          adminOnly: true,

          children: [
            {
              label:
                "Benefits Overview",
              planned: true,
            },
            {
              label:
                "Pension",
              planned: true,
            },
            {
              label:
                "Gratuity",
              planned: true,
            },
            {
              label:
                "Health Insurance",
              planned: true,
            },
            {
              label:
                "Life Insurance",
              planned: true,
            },
            {
              label:
                "Medical Benefits",
              planned: true,
            },
            {
              label:
                "Housing / Rent",
              planned: true,
            },
            {
              label:
                "Transport Benefits",
              planned: true,
            },
            {
              label:
                "Meal Benefits",
              planned: true,
            },
            {
              label:
                "Other Benefits",
              planned: true,
            },
          ],
        },

        {
          id:
            "statutories",

          label:
            "Statutories",

          icon:
            <FaShieldAlt />,

          adminOnly: true,

          children: [
            {
              label:
                "Statutory Dashboard",
              planned: true,
            },
            {
              label:
                "PAYE / Tax",
              planned: true,
            },
            {
              label:
                "Pension Compliance",
              planned: true,
            },
            {
              label:
                "NHIA",
              planned: true,
            },
            {
              label:
                "NSITF",
              planned: true,
            },
            {
              label:
                "ITF",
              planned: true,
            },
            {
              label:
                "Remittances",
              planned: true,
            },
          ],
        },

        {
          id:
            "performance",

          label:
            "Performance",

          icon:
            <FaChartLine />,

          permission:
            "performance.view",

          children: [
            {
              label:
                "Performance Dashboard",
              path:
                "/performance",
            },
            {
              label:
                "Goals / KPIs",
              planned: true,
            },
            {
              label:
                "Performance Cycles",
              planned: true,
            },
            {
              label:
                "Reviews",
              planned: true,
            },
            {
              label:
                "Appraisals",
              planned: true,
            },
            {
              label:
                "Improvement Plans",
              planned: true,
            },
          ],
        },

        {
          id: "training",
          label:
            "Training & Development",
          icon:
            <FaGraduationCap />,
          permission:
            "training.view",

          children: [
            {
              label:
                "Training Dashboard",
              path:
                "/training",
            },
            {
              label:
                "Training Programs",
              planned: true,
            },
            {
              label:
                "Training Calendar",
              planned: true,
            },
            {
              label:
                "Employee Training",
              planned: true,
            },
            {
              label:
                "Assessments",
              planned: true,
            },
            {
              label:
                "Certifications",
              planned: true,
            },
          ],
        },

        {
          id: "assets",
          label: "Assets",
          icon:
            <FaLaptop />,
          adminOnly: true,

          children: [
            {
              label:
                "Asset Register",
              planned: true,
            },
            {
              label:
                "Asset Categories",
              planned: true,
            },
            {
              label:
                "Asset Assignment",
              planned: true,
            },
            {
              label:
                "Asset Transfers",
              planned: true,
            },
            {
              label:
                "Asset Returns",
              planned: true,
            },
            {
              label:
                "Maintenance",
              planned: true,
            },
          ],
        },

        {
          id:
            "documents",

          label:
            "Documents",

          icon:
            <FaFolderOpen />,

          adminOnly: true,

          children: [
            {
              label:
                "Employee Documents",
              planned: true,
            },
            {
              label:
                "HR Documents",
              planned: true,
            },
            {
              label:
                "Company Policies",
              planned: true,
            },
            {
              label:
                "Templates",
              planned: true,
            },
            {
              label:
                "Document Categories",
              planned: true,
            },
            {
              label:
                "Expiry Tracking",
              planned: true,
            },
          ],
        },

        {
          id: "reports",
          label:
            "Reports & Analytics",
          icon:
            <FaFileAlt />,
          permission:
            "reports.view",

          children: [
            {
              label:
                "Reports Dashboard",
              path:
                "/reports",
            },
            {
              label:
                "Workforce Analytics",
              planned: true,
            },
            {
              label:
                "Employee Reports",
              planned: true,
            },
            {
              label:
                "Headcount Reports",
              planned: true,
            },
            {
              label:
                "Branch Reports",
              planned: true,
            },
            {
              label:
                "Payroll Reports",
              planned: true,
            },
            {
              label:
                "Attendance Reports",
              planned: true,
            },
            {
              label:
                "Custom Reports",
              planned: true,
            },
          ],
        },

        {
          id:
            "organization",

          label:
            "Organization",

          icon:
            <FaSitemap />,

          adminOnly: true,

          children: [
            {
              label:
                "Organization Profile",
              planned: true,
            },
            {
              label:
                "Head Office & Branches",
              path:
                "/settings",
            },
            {
              label:
                "Departments",
              planned: true,
            },
            {
              label:
                "Designations",
              planned: true,
            },
            {
              label:
                "Organization Chart",
              planned: true,
            },
            {
              label:
                "Reporting Lines",
              planned: true,
            },
            {
              label:
                "Cost Centres",
              planned: true,
            },
          ],
        },

        {
          id:
            "workflows",

          label:
            "Workflows & Approvals",

          icon:
            <FaClipboardCheck />,

          adminOnly: true,

          children: [
            {
              label:
                "Approval Inbox",
              planned: true,
            },
            {
              label:
                "My Requests",
              planned: true,
            },
            {
              label:
                "Workflow Templates",
              planned: true,
            },
            {
              label:
                "Approval Chains",
              planned: true,
            },
            {
              label:
                "Delegations",
              planned: true,
            },
            {
              label:
                "Workflow History",
              planned: true,
            },
          ],
        },

        {
          id:
            "employment-types",

          label:
            "Employment Types",

          icon:
            <FaBriefcase />,

          adminOnly: true,

          children: [
            {
              label:
                "Type Management",
              planned: true,
            },
            {
              label:
                "Permanent",
              planned: true,
            },
            {
              label:
                "Contract",
              planned: true,
            },
            {
              label:
                "Temporary",
              planned: true,
            },
            {
              label:
                "Probation",
              planned: true,
            },
            {
              label:
                "Intern / Trainee",
              planned: true,
            },
            {
              label:
                "Expatriate",
              planned: true,
            },
            {
              label:
                "Custom Types",
              planned: true,
            },
          ],
        },

        {
          id:
            "settings",

          label:
            "Settings",

          icon:
            <FaCog />,

          permission:
            "settings.view",

          children: [
            {
              label:
                "Users & Roles",
              path:
                "/settings",
            },
            {
              label:
                "Roles & Permissions",
              path:
                "/settings",
            },
            {
              label:
                "Location Access",
              path:
                "/settings",
            },
            {
              label:
                "Employee Settings",
              planned: true,
            },
            {
              label:
                "Payroll Settings",
              planned: true,
            },
            {
              label:
                "Attendance Settings",
              planned: true,
            },
            {
              label:
                "Leave Settings",
              planned: true,
            },
            {
              label:
                "Benefits Settings",
              planned: true,
            },
            {
              label:
                "Security",
              planned: true,
            },
            {
              label:
                "System Settings",
              planned: true,
            },
          ],
        },

        {
          id:
            "billing",

          label:
            "Billing & Subscription",

          icon:
            <FaFileInvoiceDollar />,

          adminOnly: true,

          children: [
            {
              label:
                "Current Plan",
              planned: true,
            },
            {
              label:
                "Subscription",
              planned: true,
            },
            {
              label:
                "Usage",
              planned: true,
            },
            {
              label:
                "Billing Details",
              planned: true,
            },
            {
              label:
                "Billing History",
              planned: true,
            },
            {
              label:
                "Invoices",
              planned: true,
            },
          ],
        },
      ],
      []
    );

  /*
  ============================================================
  ACCESS RULES
  ============================================================
  */

  const canViewSettings =
    !authorizationLoading &&
    hasPermission(
      "settings.view"
    );

  const visibleGroups =
    authorizationLoading
      ? []
      : menuGroups.filter(
          (group) => {
            if (
              group.adminOnly
            ) {
              return canViewSettings;
            }

            if (
              group.permission
            ) {
              return hasPermission(
                group.permission
              );
            }

            return false;
          }
        );

  /*
  ============================================================
  AUTO-OPEN ACTIVE GROUP
  ============================================================
  */

  useEffect(() => {
    const currentPath =
      location.pathname;

    const activeGroup =
      visibleGroups.find(
        (group) =>
          group.children?.some(
            (child) =>
              child.path &&
              (
                child.path === "/"
                  ? currentPath ===
                    "/"
                  : currentPath ===
                      child.path ||
                    currentPath.startsWith(
                      `${child.path}/`
                    )
              )
          )
      );

    if (activeGroup) {
      setOpenGroups(
        (current) => ({
          ...current,

          [activeGroup.id]:
            true,
        })
      );
    }
  }, [
    location.pathname,
    visibleGroups,
  ]);

  /*
  ============================================================
  GROUP TOGGLE
  ============================================================
  */

  const toggleGroup =
    (groupId) => {
      setOpenGroups(
        (current) => ({
          ...current,

          [groupId]:
            !current[groupId],
        })
      );
    };

  /*
  ============================================================
  LOGOUT
  ============================================================
  */

  const handleLogout =
    () => {
      clearAuthSession();

      window.location.replace(
        "/login"
      );
    };

  /*
  ============================================================
  PLANNED MODULE MESSAGE
  ============================================================
  */

  const handlePlannedItem =
    (label) => {
      window.alert(
        `${label} is part of the approved CHRIS architecture and will be activated during its implementation stage.`
      );
    };

  return (
    <aside
      style={{
        width: "276px",
        minWidth: "276px",
        height: "100vh",

        display: "flex",
        flexDirection:
          "column",

        background:
          "#0B5E3B",

        color:
          "#FFFFFF",

        boxShadow:
          "4px 0 16px rgba(15,23,42,0.15)",

        overflow:
          "hidden",

        boxSizing:
          "border-box",

        position:
          "relative",

        zIndex: 30,
      }}
    >
      {/* LOGO */}

      <div
        style={{
          flexShrink: 0,

          borderBottom:
            "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <Logo />
      </div>

      {/* MODULE NAVIGATION */}

      <nav
        style={{
          flex: 1,
          minHeight: 0,

          overflowY:
            "auto",

          overflowX:
            "hidden",

          padding:
            "12px 8px 22px",

          scrollbarWidth:
            "thin",

          scrollbarColor:
            "rgba(255,255,255,.30) transparent",
        }}
      >
        <div
          style={{
            padding:
              "5px 12px 9px",

            color:
              "#91B7A4",

            fontSize:
              "9px",

            fontWeight:
              "900",

            textTransform:
              "uppercase",

            letterSpacing:
              "0.12em",
          }}
        >
          Main Menu
        </div>

        {visibleGroups.map(
          (group) => {
            if (!group.children) {
              return (
                <NavLink
                  key={
                    group.id
                  }

                  to={
                    group.path
                  }

                  end={
                    group.exact
                  }

                  style={({
                    isActive,
                  }) => ({
                    ...mainItemStyle,

                    background:
                      isActive
                        ? "#14824F"
                        : "transparent",

                    color:
                      isActive
                        ? "#FFFFFF"
                        : "#D7E8DF",

                    borderLeft:
                      isActive
                        ? "3px solid #D4AF37"
                        : "3px solid transparent",
                  })}
                >
                  <span
                    style={
                      iconStyle
                    }
                  >
                    {group.icon}
                  </span>

                  <span
                    style={{
                      flex: 1,
                    }}
                  >
                    {group.label}
                  </span>
                </NavLink>
              );
            }

            const isOpen =
              Boolean(
                openGroups[
                  group.id
                ]
              );

            const groupActive =
              group.children.some(
                (child) =>
                  child.path &&
                  (
                    location.pathname ===
                      child.path ||
                    (
                      child.path !==
                        "/" &&
                      location.pathname.startsWith(
                        `${child.path}/`
                      )
                    )
                  )
              );

            return (
              <div
                key={
                  group.id
                }
                style={{
                  marginBottom:
                    "2px",
                }}
              >
                <button
                  type="button"

                  onClick={() =>
                    toggleGroup(
                      group.id
                    )
                  }

                  style={{
                    ...groupButtonStyle,

                    background:
                      groupActive
                        ? "rgba(20,130,79,0.72)"
                        : "transparent",

                    color:
                      groupActive
                        ? "#FFFFFF"
                        : "#D7E8DF",

                    borderLeft:
                      groupActive
                        ? "3px solid #D4AF37"
                        : "3px solid transparent",
                  }}
                >
                  <span
                    style={
                      iconStyle
                    }
                  >
                    {group.icon}
                  </span>

                  <span
                    style={{
                      flex: 1,

                      textAlign:
                        "left",
                    }}
                  >
                    {group.label}
                  </span>

                  <span
                    style={{
                      fontSize:
                        "10px",

                      opacity:
                        0.9,
                    }}
                  >
                    {isOpen
                      ? <FaChevronDown />
                      : <FaChevronRight />}
                  </span>
                </button>

                {isOpen && (
                  <div
                    style={{
                      margin:
                        "2px 0 5px 39px",

                      paddingLeft:
                        "8px",

                      borderLeft:
                        "1px solid rgba(255,255,255,0.14)",
                    }}
                  >
                    {group.children.map(
                      (
                        child,
                        index
                      ) => {
                        if (
                          child.planned
                        ) {
                          return (
                            <button
                              key={`${group.id}-${index}`}

                              type="button"

                              onClick={() =>
                                handlePlannedItem(
                                  child.label
                                )
                              }

                              style={
                                plannedChildStyle
                              }
                            >
                              <span
                                style={
                                  childDotStyle
                                }
                              />

                              <span
                                style={{
                                  flex: 1,

                                  textAlign:
                                    "left",
                                }}
                              >
                                {child.label}
                              </span>

                              <span
                                style={{
                                  color:
                                    "#91B7A4",

                                  fontSize:
                                    "8px",

                                  fontWeight:
                                    "800",

                                  textTransform:
                                    "uppercase",
                                }}
                              >
                                planned
                              </span>
                            </button>
                          );
                        }

                        return (
                          <NavLink
                            key={`${group.id}-${index}`}

                            to={
                              child.path
                            }

                            end={
                              child.path ===
                              "/"
                            }

                            style={({
                              isActive,
                            }) => ({
                              ...childLinkStyle,

                              background:
                                isActive
                                  ? "rgba(255,255,255,0.10)"
                                  : "transparent",

                              color:
                                isActive
                                  ? "#FFFFFF"
                                  : "#BFD5CA",

                              fontWeight:
                                isActive
                                  ? "800"
                                  : "500",
                            })}
                          >
                            {({
                              isActive,
                            }) => (
                              <>
                                <span
                                  style={{
                                    ...childDotStyle,

                                    background:
                                      isActive
                                        ? "#D4AF37"
                                        : "rgba(255,255,255,0.35)",
                                  }}
                                />

                                <span>
                                  {child.label}
                                </span>
                              </>
                            )}
                          </NavLink>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            );
          }
        )}
      </nav>

      {/* BOTTOM */}

      <div
        style={{
          flexShrink: 0,

          borderTop:
            "1px solid rgba(255,255,255,0.10)",

          padding:
            "9px 8px 12px",

          background:
            "#094F33",
        }}
      >
        <button
          type="button"

          onClick={
            handleLogout
          }

          style={
            logoutButtonStyle
          }
        >
          <span
            style={
              iconStyle
            }
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

const mainItemStyle = {
  minHeight: "44px",

  display: "flex",
  alignItems: "center",

  gap: "11px",

  margin: "2px 0",

  padding:
    "9px 11px",

  borderRadius:
    "7px",

  textDecoration:
    "none",

  fontSize: "12px",

  fontWeight:
    "700",

  boxSizing:
    "border-box",
};

const groupButtonStyle = {
  width: "100%",

  minHeight: "44px",

  display: "flex",
  alignItems: "center",

  gap: "11px",

  margin: "2px 0",

  padding:
    "9px 11px",

  border:
    "none",

  borderRadius:
    "7px",

  fontFamily:
    "inherit",

  fontSize:
    "12px",

  fontWeight:
    "700",

  cursor:
    "pointer",

  boxSizing:
    "border-box",
};

const childLinkStyle = {
  minHeight:
    "34px",

  display:
    "flex",

  alignItems:
    "center",

  gap:
    "8px",

  padding:
    "6px 9px",

  borderRadius:
    "6px",

  textDecoration:
    "none",

  fontSize:
    "11px",

  boxSizing:
    "border-box",
};

const plannedChildStyle = {
  width: "100%",

  minHeight:
    "34px",

  display:
    "flex",

  alignItems:
    "center",

  gap:
    "8px",

  padding:
    "6px 9px",

  border:
    "none",

  borderRadius:
    "6px",

  background:
    "transparent",

  color:
    "#A9C6B7",

  fontFamily:
    "inherit",

  fontSize:
    "11px",

  cursor:
    "pointer",

  boxSizing:
    "border-box",
};

const childDotStyle = {
  width: "5px",
  height: "5px",

  minWidth: "5px",

  borderRadius:
    "50%",

  background:
    "rgba(255,255,255,0.35)",
};

const iconStyle = {
  width: "20px",
  minWidth: "20px",

  display: "flex",

  justifyContent:
    "center",

  fontSize: "14px",
};

const logoutButtonStyle = {
  width: "100%",

  minHeight: "42px",

  display: "flex",

  alignItems:
    "center",

  gap: "11px",

  padding:
    "9px 11px",

  border: "none",

  borderRadius:
    "7px",

  background:
    "transparent",

  color: "#F5D8D5",

  fontFamily:
    "inherit",

  fontSize:
    "12px",

  fontWeight:
    "700",

  cursor:
    "pointer",
};

export default Sidebar;