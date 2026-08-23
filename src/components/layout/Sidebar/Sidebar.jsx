import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  NavLink,
  useLocation,
} from "react-router-dom";

import chrisLogo from "../../../assets/images/chris-logo.png";

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
  FaGift,
  FaFolderOpen,
  FaLaptop,
  FaClipboardCheck,
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
  CHRIS NAVIGATION BLUEPRINT
  ============================================================

  Existing implemented modules have active routes.

  Future modules remain visible as planned items but do not
  navigate to non-existent routes.

  Backend permissions remain the real security boundary.
  ============================================================
  */

  const menuGroups =
    useMemo(
      () => [
        /*
        ========================================================
        DASHBOARD
        ========================================================
        */

        {
          id:
            "dashboard",

          label:
            "Dashboard",

          icon:
            <FaTachometerAlt />,

          permission:
            "dashboard.view",

          path:
            "/",

          exact:
            true,
        },

        /*
        ========================================================
        EMPLOYEES
        ========================================================
        */

        {
          id:
            "employees",

          label:
            "Employees",

          icon:
            <FaUsers />,

          permission:
            "employees.view",

          children: [
                        {
              label:
                "Employee Dashboard",

              path:
                "/employees",
            },
{
              label:
                "Employee Directory",

              path:
                "/employees/directory",
            },

            {
              label:
                "Employee Profiles",

              path:
                "/employees/profiles",
            },

            {
              label:
                "Onboarding",

              path:
                "/employees/onboarding",
            },

            {
              label:
                "Employee Analytics",

              path:
                "/employees/analytics",
            },

            {
              label:
                "Transfers",

              path:
                "/employees/transfers",
            },

            {
              label:
                "Promotions",

              path:
                "/employees/promotions",
            },

            {
              label:
                "Exits",

              path:
                "/employees/exits",
            },

            {
              label:
                "Line Managers",

              path:
                "/employees/line-managers",
            },
          ],
        },

        /*
        ========================================================
        RECRUITMENT
        ========================================================
        */

        {
          id:
            "recruitment",

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

              planned:
                true,
            },

            {
              label:
                "Vacancies",

              planned:
                true,
            },

            {
              label:
                "Candidates",

              planned:
                true,
            },

            {
              label:
                "Interviews",

              planned:
                true,
            },

            {
              label:
                "Offers",

              planned:
                true,
            },

            {
              label:
                "Applicant Tracking System",

              planned:
                true,
            },

            {
              label:
                "Talent Pool",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        TIME & ATTENDANCE
        ========================================================
        */

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

              path:
                "/attendance/register",
            },

            {
              label:
                "Shifts",

              path:
                "/attendance/shifts",
            },

            {
              label:
                "Shift Schedule",

              path:
                "/attendance/shift-schedule",
            },

            {
              label:
                "Worked Hours",

              path:
                "/attendance/worked-hours",
            },

            {
              label:
                "Worked Days",

              path:
                "/attendance/worked-days",
            },

            {
              label:
                "Off Days",

              path:
                "/attendance/off-days",
            },

            {
              label:
                "Overtime",

              path:
                "/attendance/overtime",
            },

            {
              label:
                "Public Holidays",

              path:
                "/attendance/public-holidays",
            },

            {
              label:
                "Lateness & Absence",

              path:
                "/attendance/lateness-absence",
            },
          ],
        },

        /*
        ========================================================
        LEAVE
        ========================================================
        */

        {
          id:
            "leave",

          label:
            "Leave",

          icon:
            <FaCalendarAlt />,

          permission:
            "leave.view",

          children: [
            { label: "Leave Overview", path: "/leave" },
            { label: "Leave Requests", path: "/leave/requests" },
            { label: "Active Leave", path: "/leave/active" },
            { label: "Return to Work", path: "/leave/returns" },
            { label: "Leave Calendar", path: "/leave/calendar" },
            { label: "Leave Balances", path: "/leave/balances" },
            { label: "Leave Entitlements", path: "/leave/entitlements" },
            { label: "Leave Policies", path: "/leave/policies" },
            { label: "Leave Exceptions", path: "/leave/exceptions" },
          ],
        },

        /*
        ========================================================
        PAYROLL
        ========================================================
        */

        {
          id:
            "payroll",

          label:
            "Payroll",

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

              planned:
                true,
            },

            {
              label:
                "Payroll Periods",

              planned:
                true,
            },

            {
              label:
                "Salary Rates",

              planned:
                true,
            },

            {
              label:
                "Allowances",

              planned:
                true,
            },

            {
              label:
                "Deductions",

              planned:
                true,
            },

            {
              label:
                "Payslips",

              planned:
                true,
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

              planned:
                true,
            },

            {
              label:
                "Paid Leave",

              planned:
                true,
            },

            {
              label:
                "Payroll Approvals",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        COMPENSATION & REWARDS
        ========================================================
        */

        {
          id:
            "compensation",

          label:
            "Compensation & Rewards",

          icon:
            <FaMoneyBillWave />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Compensation Dashboard",

              planned:
                true,
            },

            {
              label:
                "Salary Structure",

              planned:
                true,
            },

            {
              label:
                "Grades & Levels",

              planned:
                true,
            },

            {
              label:
                "Salary Bands",

              planned:
                true,
            },

            {
              label:
                "Compensation Reviews",

              planned:
                true,
            },

            {
              label:
                "Salary Adjustments",

              planned:
                true,
            },

            {
              label:
                "Promotions",

              planned:
                true,
            },

            {
              label:
                "Bonuses & Incentives",

              planned:
                true,
            },

            {
              label:
                "Total Rewards",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        BENEFITS
        ========================================================
        */

        {
          id:
            "benefits",

          label:
            "Benefits",

          icon:
            <FaGift />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Benefits Overview",

              path:
                "/benefits",
            },

            {
              label:
                "Pension",

              path:
                "/benefits/pension",
            },

            {
              label:
                "Gratuity",

              path:
                "/benefits/gratuity",
            },

            {
              label:
                "Health Insurance",

              path:
                "/benefits/health-insurance",
            },

            {
              label:
                "Life Insurance",

              path:
                "/benefits/life-insurance",
            },

            {
              label:
                "Medical Benefits",

              path:
                "/benefits/medical",
            },

            {
              label:
                "Housing / Rent",

              path:
                "/benefits/housing",
            },

            {
              label:
                "Transport Benefits",

              path:
                "/benefits/transport",
            },

            {
              label:
                "Meal Benefits",

              path:
                "/benefits/meals",
            },

            {
              label:
                "Other Benefits",

              path:
                "/benefits/other",
            },

            {
              label:
                "Benefit Enrolments",

              path:
                "/benefits/enrolments",
            },
          ],
        },

        /*
        ========================================================
        STATUTORIES
        ========================================================
        */

        {
          id:
            "statutories",

          label:
            "Statutories",

          icon:
            <FaShieldAlt />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Statutory Dashboard",

              planned:
                true,
            },

            {
              label:
                "PAYE / Tax",

              planned:
                true,
            },

            {
              label:
                "Pension Compliance",

              planned:
                true,
            },

            {
              label:
                "NHIA",

              planned:
                true,
            },

            {
              label:
                "NSITF",

              planned:
                true,
            },

            {
              label:
                "ITF",

              planned:
                true,
            },

            {
              label:
                "Remittances",

              planned:
                true,
            },

            {
              label:
                "Statutory Reports",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        PERFORMANCE
        ========================================================
        */

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

              planned:
                true,
            },

            {
              label:
                "Performance Cycles",

              planned:
                true,
            },

            {
              label:
                "Reviews",

              planned:
                true,
            },

            {
              label:
                "Appraisals",

              planned:
                true,
            },

            {
              label:
                "Improvement Plans",

              planned:
                true,
            },

            {
              label:
                "Performance Reports",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        TRAINING & DEVELOPMENT
        ========================================================
        */

        {
          id:
            "training",

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

              planned:
                true,
            },

            {
              label:
                "Training Calendar",

              planned:
                true,
            },

            {
              label:
                "Employee Training",

              planned:
                true,
            },

            {
              label:
                "Learning Records",

              planned:
                true,
            },

            {
              label:
                "Assessments",

              planned:
                true,
            },

            {
              label:
                "Certifications",

              planned:
                true,
            },

            {
              label:
                "Training Reports",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        ASSETS
        ========================================================
        */

        {
          id:
            "assets",

          label:
            "Assets",

          icon:
            <FaLaptop />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Asset Register",

              planned:
                true,
            },

            {
              label:
                "Asset Categories",

              planned:
                true,
            },

            {
              label:
                "Asset Assignment",

              planned:
                true,
            },

            {
              label:
                "Asset Transfers",

              planned:
                true,
            },

            {
              label:
                "Asset Returns",

              planned:
                true,
            },

            {
              label:
                "Maintenance",

              planned:
                true,
            },

            {
              label:
                "Asset Reports",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        DOCUMENTS
        ========================================================
        */

        {
          id:
            "documents",

          label:
            "Documents",

          icon:
            <FaFolderOpen />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Employee Documents",

              planned:
                true,
            },

            {
              label:
                "HR Documents",

              planned:
                true,
            },

            {
              label:
                "Company Policies",

              planned:
                true,
            },

            {
              label:
                "Templates",

              planned:
                true,
            },

            {
              label:
                "Document Categories",

              planned:
                true,
            },

            {
              label:
                "Expiry Tracking",

              planned:
                true,
            },

            {
              label:
                "Document Requests",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        REPORTS & ANALYTICS
        ========================================================
        */

        {
          id:
            "reports",

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

              planned:
                true,
            },

            {
              label:
                "Employee Reports",

              planned:
                true,
            },

            {
              label:
                "Headcount Reports",

              planned:
                true,
            },

            {
              label:
                "Branch Reports",

              planned:
                true,
            },

            {
              label:
                "Recruitment Reports",

              planned:
                true,
            },

            {
              label:
                "Attendance Reports",

              planned:
                true,
            },

            {
              label:
                "Leave Reports",

              planned:
                true,
            },

            {
              label:
                "Payroll Reports",

              planned:
                true,
            },

            {
              label:
                "Compensation Reports",

              planned:
                true,
            },

            {
              label:
                "Benefits Reports",

              planned:
                true,
            },

            {
              label:
                "Custom Reports",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        ORGANIZATION
        ========================================================
        */

        {
          id:
            "organization",

          label:
            "Organization",

          icon:
            <FaSitemap />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Organization Profile",

              planned:
                true,
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

              planned:
                true,
            },

            {
              label:
                "Designations",

              path:
                "/designations",
            },

            {
              label:
                "Organization Chart",

              planned:
                true,
            },

            {
              label:
                "Reporting Lines",

              planned:
                true,
            },

            {
              label:
                "Cost Centres",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        WORKFLOWS & APPROVALS
        ========================================================
        */

        {
          id:
            "workflows",

          label:
            "Workflows & Approvals",

          icon:
            <FaClipboardCheck />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Approval Inbox",

              planned:
                true,
            },

            {
              label:
                "My Requests",

              planned:
                true,
            },

            {
              label:
                "Workflow Templates",

              planned:
                true,
            },

            {
              label:
                "Approval Chains",

              planned:
                true,
            },

            {
              label:
                "Delegations",

              planned:
                true,
            },

            {
              label:
                "Workflow History",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        EMPLOYMENT TYPES
        ========================================================
        */

        {
          id:
            "employment-types",

          label:
            "Employment Types",

          icon:
            <FaBriefcase />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Type Management",

              planned:
                true,
            },

            {
              label:
                "Permanent",

              planned:
                true,
            },

            {
              label:
                "Contract",

              planned:
                true,
            },

            {
              label:
                "Temporary",

              planned:
                true,
            },

            {
              label:
                "Probation",

              planned:
                true,
            },

            {
              label:
                "Intern / Trainee",

              planned:
                true,
            },

            {
              label:
                "Expatriate",

              planned:
                true,
            },

            {
              label:
                "Custom Types",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        SETTINGS
        ========================================================
        */

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

              planned:
                true,
            },

            {
              label:
                "Payroll Settings",

              planned:
                true,
            },

            {
              label:
                "Attendance Settings",

              planned:
                true,
            },

            {
              label:
                "Leave Settings",

              planned:
                true,
            },

            {
              label:
                "Benefits Settings",

              planned:
                true,
            },

            {
              label:
                "Recruitment Settings",

              planned:
                true,
            },

            {
              label:
                "Notifications",

              planned:
                true,
            },

            {
              label:
                "Security",

              planned:
                true,
            },

            {
              label:
                "System Settings",

              planned:
                true,
            },
          ],
        },

        /*
        ========================================================
        BILLING & SUBSCRIPTION
        ========================================================
        */

        {
          id:
            "billing",

          label:
            "Billing & Subscription",

          icon:
            <FaFileInvoiceDollar />,

          adminOnly:
            true,

          children: [
            {
              label:
                "Current Plan",

              planned:
                true,
            },

            {
              label:
                "Subscription",

              planned:
                true,
            },

            {
              label:
                "Usage",

              planned:
                true,
            },

            {
              label:
                "Billing Details",

              planned:
                true,
            },

            {
              label:
                "Billing History",

              planned:
                true,
            },

            {
              label:
                "Invoices",

              planned:
                true,
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

  /*
  Keep the list memoized.

  This is important because Sidebar contains effects that
  respond to route changes. A stable array prevents needless
  render churn.
  */

  const visibleGroups =
    useMemo(
      () => {
        if (
          authorizationLoading
        ) {
          return [];
        }

        return menuGroups.filter(
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
      },
      [
        authorizationLoading,
        canViewSettings,
        hasPermission,
        menuGroups,
      ]
    );

  /*
  ============================================================
  AUTO-OPEN ACTIVE GROUP
  ============================================================

  IMPORTANT FIX:

  Previously the Sidebar updated openGroups on repeated
  renders, causing:

  "Maximum update depth exceeded"

  Now:
  - the effect is driven only by pathname
  - we return the SAME state when the group is already open
  - no unnecessary state update occurs
  ============================================================
  */

  useEffect(() => {
    const currentPath =
      location.pathname;

    const activeGroup =
      visibleGroups.find(
        (group) =>
          group.children?.some(
            (child) => {
              if (
                !child.path
              ) {
                return false;
              }

              if (
                child.path ===
                "/"
              ) {
                return (
                  currentPath ===
                  "/"
                );
              }

              return (
                currentPath ===
                  child.path ||
                currentPath.startsWith(
                  `${child.path}/`
                )
              );
            }
          )
      );

    if (
      !activeGroup
    ) {
      return;
    }

    setOpenGroups(
      (current) => {
        /*
        Already open.

        Return the SAME object.
        React therefore performs no
        additional state update.
        */

        if (
          current[
            activeGroup.id
          ]
        ) {
          return current;
        }

        return {
          ...current,

          [activeGroup.id]:
            true,
        };
      }
    );
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
            !current[
              groupId
            ],
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

  /*
  ============================================================
  RENDER
  ============================================================
  */

  return (
    <aside
      style={{
        width:
          "276px",

        minWidth:
          "276px",

        height:
          "100vh",

        display:
          "flex",

        flexDirection:
          "column",

        background:
          "linear-gradient(180deg, #030705 0%, #06110C 42%, #081A11 100%)",

        color:
          "#FFFFFF",

        boxShadow:
          "8px 0 28px rgba(0,0,0,0.34)",

        overflow:
          "hidden",

        boxSizing:
          "border-box",

        position:
          "relative",

        zIndex:
          30,
      }}
    >
      {/* CHRIS AMBIENT SIDEBAR DESIGN */}

      <div
        aria-hidden="true"

        style={{
          position:
            "absolute",

          inset:
            0,

          pointerEvents:
            "none",

          overflow:
            "hidden",

          zIndex:
            0,
        }}
      >
        <div
          style={{
            position:
              "absolute",

            width:
              "260px",

            height:
              "260px",

            top:
              "-85px",

            left:
              "-90px",

            borderRadius:
              "50%",

            background:
              "radial-gradient(circle, rgba(0,150,78,0.24) 0%, rgba(0,120,65,0.10) 38%, transparent 72%)",

            filter:
              "blur(8px)",
          }}
        />

        <div
          style={{
            position:
              "absolute",

            width:
              "220px",

            height:
              "220px",

            right:
              "-125px",

            top:
              "34%",

            borderRadius:
              "50%",

            background:
              "radial-gradient(circle, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.06) 40%, transparent 74%)",

            filter:
              "blur(10px)",
          }}
        />

        <div
          style={{
            position:
              "absolute",

            width:
              "340px",

            height:
              "150px",

            left:
              "-100px",

            bottom:
              "40px",

            transform:
              "rotate(-18deg)",

            borderRadius:
              "50%",

            borderTop:
              "1px solid rgba(212,175,55,0.22)",

            borderBottom:
              "1px solid rgba(0,150,78,0.16)",

            boxShadow:
              "0 -10px 45px rgba(0,140,75,0.06), 0 12px 45px rgba(212,175,55,0.05)",
          }}
        />

        <div
          style={{
            position:
              "absolute",

            inset:
              0,

            opacity:
              0.24,

            backgroundImage:
              "radial-gradient(circle at center, rgba(212,175,55,0.42) 0.8px, transparent 0.9px)",

            backgroundSize:
              "24px 24px",

            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 20%, black 82%, transparent 100%)",

            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 20%, black 82%, transparent 100%)",
          }}
        />
      </div>

      {/* CHRIS BRAND HEADER */}

      <style>
        {`
          @keyframes chrisLogoPulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);

              filter:
                drop-shadow(0 0 6px rgba(0, 155, 74, 0.24))
                drop-shadow(0 0 5px rgba(212, 175, 55, 0.15));
            }

            50% {
              opacity: 0.64;
              transform: scale(1.035);

              filter:
                drop-shadow(0 0 14px rgba(0, 185, 88, 0.40))
                drop-shadow(0 0 11px rgba(212, 175, 55, 0.28));
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .chris-sidebar-logo {
              animation: none !important;
            }
          }
        `}
      </style>

      <div
        style={{
          flexShrink:
            0,

          position:
            "relative",

          zIndex:
            1,

          padding:
            "18px 12px 17px",

          textAlign:
            "center",

          borderBottom:
            "1px solid rgba(212,175,55,0.18)",

          background:
            "linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0))",
        }}
      >
        {/* LARGE BLINKING CHRIS LOGO */}

        <div
          style={{
            width:
              "100%",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            overflow:
              "visible",
          }}
        >
          <img
            className="chris-sidebar-logo"

            src={
              chrisLogo
            }

            alt="CHRIS"

            style={{
              display:
                "block",

              width:
                "220px",

              maxWidth:
                "96%",

              height:
                "auto",

              objectFit:
                "contain",

              border:
                "none",

              outline:
                "none",

              background:
                "transparent",

              animation:
                "chrisLogoPulse 2.5s ease-in-out infinite",

              transformOrigin:
                "center",
            }}
          />
        </div>

        {/* CORPORATEHR NETWORK */}

        <div
          style={{
            marginTop:
              "4px",

            color:
              "#087A43",

            textAlign:
              "center",

            fontSize:
              "15px",

            fontWeight:
              "900",

            lineHeight:
              "1.25",

            letterSpacing:
              "0.01em",

            textShadow:
              "0 0 8px rgba(8,122,67,0.16)",
          }}
        >
          CorporateHR Network
        </div>

        {/* INFORMATION SYSTEM */}

        <div
          style={{
            marginTop:
              "5px",

            color:
              "#D4AF37",

            textAlign:
              "center",

            fontSize:
              "10px",

            fontWeight:
              "800",

            lineHeight:
              "1.3",

            letterSpacing:
              "0.16em",

            textTransform:
              "uppercase",

            textShadow:
              "0 0 7px rgba(212,175,55,0.16)",
          }}
        >
          Information System
        </div>

        {/* BRAND DIVIDER */}

        <div
          aria-hidden="true"

          style={{
            width:
              "74%",

            height:
              "1px",

            margin:
              "14px auto 0",

            background:
              "linear-gradient(90deg, transparent 0%, rgba(8,122,67,0.72) 25%, rgba(212,175,55,0.92) 50%, rgba(8,122,67,0.72) 75%, transparent 100%)",

            boxShadow:
              "0 0 8px rgba(212,175,55,0.14)",
          }}
        />
      </div>

      {/* NAVIGATION */}

      <nav
        style={{
          flex:
            1,

          minHeight:
            0,

          overflowY:
            "auto",

          overflowX:
            "hidden",

          padding:
            "12px 8px 22px",

          scrollbarWidth:
            "thin",

          scrollbarColor:
            "rgba(212,175,55,.35) transparent",

          position:
            "relative",

          zIndex:
            1,
        }}
      >
        <div
          style={{
            padding:
              "5px 12px 9px",

            color:
              "#D4AF37",

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
            /*
            ====================================================
            SIMPLE LINK
            ====================================================
            */

            if (
              !group.children
            ) {
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
                        ? "linear-gradient(90deg, rgba(8,122,67,0.24), rgba(8,122,67,0.10))"
                        : "linear-gradient(90deg, rgba(8,122,67,0.16), rgba(8,122,67,0.055))",

                    color:
                      isActive
                        ? "#FFFFFF"
                        : "#DCEBE3",

                    borderLeft:
                      isActive
                        ? "3px solid rgba(212,175,55,0.88)"
                        : "3px solid rgba(8,122,67,0.42)",

                    boxShadow:
                      isActive
                        ? "inset 0 0 0 1px rgba(212,175,55,0.08), 0 0 12px rgba(8,122,67,0.08)"
                        : "none",
                  })}
                >
                  <span
                    style={
                      iconStyle
                    }
                  >
                    {
                      group.icon
                    }
                  </span>

                  <span
                    style={{
                      flex:
                        1,
                    }}
                  >
                    {
                      group.label
                    }
                  </span>
                </NavLink>
              );
            }

            /*
            ====================================================
            EXPANDABLE GROUP
            ====================================================
            */

            const isOpen =
              Boolean(
                openGroups[
                  group.id
                ]
              );

            const groupActive =
              group.children.some(
                (child) => {
                  if (
                    !child.path
                  ) {
                    return false;
                  }

                  if (
                    child.path ===
                      "/" &&
                    location.pathname ===
                      "/"
                  ) {
                    return true;
                  }

                  if (
                    child.path ===
                    "/"
                  ) {
                    return false;
                  }

                  return (
                    location.pathname ===
                      child.path ||
                    location.pathname.startsWith(
                      `${child.path}/`
                    )
                  );
                }
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
                        ? "linear-gradient(90deg, rgba(8,122,67,0.24), rgba(8,122,67,0.10))"
                        : "linear-gradient(90deg, rgba(8,122,67,0.16), rgba(8,122,67,0.055))",

                    color:
                      groupActive
                        ? "#FFFFFF"
                        : "#DCEBE3",

                    borderLeft:
                      groupActive
                        ? "3px solid rgba(212,175,55,0.88)"
                        : "3px solid rgba(8,122,67,0.42)",

                    boxShadow:
                      groupActive
                        ? "inset 0 0 0 1px rgba(212,175,55,0.08), 0 0 12px rgba(8,122,67,0.08)"
                        : "none",
                  }}
                >
                  <span
                    style={
                      iconStyle
                    }
                  >
                    {
                      group.icon
                    }
                  </span>

                  <span
                    style={{
                      flex:
                        1,

                      textAlign:
                        "left",
                    }}
                  >
                    {
                      group.label
                    }
                  </span>

                  <span
                    style={{
                      fontSize:
                        "10px",

                      opacity:
                        0.9,
                    }}
                  >
                    {isOpen ? (
                      <FaChevronDown />
                    ) : (
                      <FaChevronRight />
                    )}
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
                        "1px solid rgba(212,175,55,0.20)",
                    }}
                  >
                    {group.children.map(
                      (
                        child,
                        index
                      ) => {
                        /*
                        ==========================================
                        PLANNED MODULE
                        ==========================================
                        */

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
                                  flex:
                                    1,

                                  textAlign:
                                    "left",
                                }}
                              >
                                {
                                  child.label
                                }
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

                        /*
                        ==========================================
                        ACTIVE ROUTE
                        ==========================================
                        */

                        return (
                          <NavLink
                            key={`${group.id}-${index}`}

                            to={
                              child.path
                            }

                            end={true}

                            style={({
                              isActive,
                            }) => ({
                              ...childLinkStyle,

                              background:
                                isActive
                                  ? "linear-gradient(90deg, rgba(212,175,55,0.13), rgba(0,122,67,0.16))"
                                  : "rgba(8,122,67,0.045)",

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
                                  {
                                    child.label
                                  }
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

      {/* LOGOUT */}

      <div
        style={{
          flexShrink:
            0,

          borderTop:
            "1px solid rgba(8,122,67,0.20)",

          padding:
            "8px 8px 10px",

          background:
            "transparent",

          position:
            "relative",

          zIndex:
            1,
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

/*
============================================================
STYLES
============================================================
*/

const mainItemStyle = {
  minHeight:
    "44px",

  display:
    "flex",

  alignItems:
    "center",

  gap:
    "11px",

  margin:
    "2px 0",

  padding:
    "9px 11px",

  borderRadius:
    "9px",

  textDecoration:
    "none",

  fontSize:
    "12px",

  fontWeight:
    "700",

  boxSizing:
    "border-box",

  transition:
    "background 0.15s ease, color 0.15s ease",
};

const groupButtonStyle = {
  width:
    "100%",

  minHeight:
    "44px",

  display:
    "flex",

  alignItems:
    "center",

  gap:
    "11px",

  margin:
    "2px 0",

  padding:
    "9px 11px",

  border:
    "none",

  borderRadius:
    "9px",

  background:
    "transparent",

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

  transition:
    "background 0.15s ease, color 0.15s ease",
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

  transition:
    "background 0.15s ease, color 0.15s ease",
};

const plannedChildStyle = {
  width:
    "100%",

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
    "rgba(8,122,67,0.045)",

  color:
    "#BBD3C6",

  fontFamily:
    "inherit",

  fontSize:
    "11px",

  cursor:
    "pointer",

  boxSizing:
    "border-box",

  transition:
    "background 0.15s ease",
};

const childDotStyle = {
  width:
    "5px",

  height:
    "5px",

  minWidth:
    "5px",

  borderRadius:
    "50%",

  background:
    "rgba(255,255,255,0.35)",
};

const iconStyle = {
  width:
    "20px",

  minWidth:
    "20px",

  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "center",

  fontSize:
    "14px",
};

const logoutButtonStyle = {
  width:
    "100%",

  minHeight:
    "42px",

  display:
    "flex",

  alignItems:
    "center",

  gap:
    "11px",

  padding:
    "9px 11px",

  border:
    "none",

  borderLeft:
    "3px solid rgba(8,122,67,0.42)",

  borderRadius:
    "9px",

  background:
    "linear-gradient(90deg, rgba(8,122,67,0.16), rgba(8,122,67,0.055))",

  color:
    "#DCEBE3",

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

  transition:
    "background 0.18s ease, color 0.18s ease, transform 0.18s ease",
};

export default Sidebar;