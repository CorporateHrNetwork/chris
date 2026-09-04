import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaChartBar,
  FaUsers,
  FaClock,
  FaMoneyBillWave,
  FaUmbrellaBeach,
  FaDownload,
  FaFileAlt,
  FaChartPie,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";
import {
  apiDownload,
  saveDownloadedBlob,
} from "../services/api";

function Reports() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const downloadWorkforceReport = async () => {
    try {
      setDownloading(true);
      setError("");
      const file = await apiDownload(
        "/api/employee-reports/workforce?format=csv"
      );
      saveDownloadedBlob(file);
    } catch (err) {
      setError(
        err?.message ||
          "Unable to download the workforce report."
      );
    } finally {
      setDownloading(false);
    }
  };

  const activity = [
    {
      id: "workforce",
      icon: <FaUsers />,
      title: "Workforce Reports",
      description:
        "Employee workforce reporting is already available from the reporting engine.",
      time: "Available",
    },
    {
      id: "lifecycle",
      icon: <FaFileAlt />,
      title: "Lifecycle Reports",
      description:
        "Employee lifecycle reporting is available per employee.",
      time: "Available",
    },
    {
      id: "attendance",
      icon: <FaClock />,
      title: "Attendance Reports",
      description:
        "Attendance reporting will expand as more operational analytics are connected.",
      time: "Partial",
      tone: "warning",
    },
    {
      id: "payroll",
      icon: <FaMoneyBillWave />,
      title: "Payroll Reports",
      description:
        "Payroll analytics will activate with the payroll engine.",
      time: "Planned",
      tone: "warning",
    },
  ];

  return (
    <>
      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(185,28,28,.25)",
            background: "rgba(254,242,242,.92)",
            color: "#B91C1C",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      ) : null}

      <ModuleDashboardShell
        eyebrow="REPORTING & INSIGHTS"
        title="Reports & Analytics Dashboard"
        description="Access workforce, lifecycle, attendance, leave, payroll and management reporting from one analytical home."
        metrics={[
          <DashboardCard
            key="workforce"
            title="Workforce Reports"
            value="Live"
            subtitle="Employee workforce reporting"
            icon={<FaUsers />}
            tone="green"
          />,
          <DashboardCard
            key="lifecycle"
            title="Lifecycle Reports"
            value="Live"
            subtitle="Employee lifecycle history"
            icon={<FaFileAlt />}
            tone="gold"
          />,
          <DashboardCard
            key="attendance"
            title="Attendance Reports"
            value="Partial"
            subtitle="Operational attendance reporting"
            icon={<FaClock />}
            tone="green"
          />,
          <DashboardCard
            key="payroll"
            title="Payroll Reports"
            value="—"
            subtitle="Activates with payroll engine"
            icon={<FaMoneyBillWave />}
            tone="gold"
          />,
        ]}
        analytics={
          <AnalyticsPanel
            title="Reporting Coverage"
            subtitle="Current CHRIS reporting coverage across core modules."
            icon={<FaChartPie />}
          >
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              {[
                ["Workforce", 100],
                ["Employee Lifecycle", 100],
                ["Attendance", 45],
                ["Leave", 30],
                ["Payroll", 0],
                ["Performance", 0],
                ["Training", 0],
              ].map(([label, progress]) => (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "150px 1fr 55px",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color:
                        "var(--chris-dashboard-text)",
                      fontWeight: 800,
                    }}
                  >
                    {label}
                  </span>

                  <div className="chris-progress">
                    <div
                      className="chris-progress__bar"
                      style={{
                        width: `${progress}%`,
                      }}
                    />
                  </div>

                  <strong
                    style={{
                      color:
                        "var(--chris-dashboard-gold-bright)",
                      textAlign: "right",
                    }}
                  >
                    {progress}%
                  </strong>
                </div>
              ))}
            </div>
          </AnalyticsPanel>
        }
        recentActivity={
          <AnalyticsPanel
            title="Reporting Intelligence"
            subtitle="Availability and readiness of CHRIS analytical outputs."
            icon={<FaChartBar />}
          >
            <RecentActivityList
              items={activity}
            />
          </AnalyticsPanel>
        }
        quickActions={[
          <QuickActionCard
            key="workforce"
            title="Workforce Report"
            subtitle={
              downloading
                ? "Preparing workforce CSV..."
                : "Download workforce CSV"
            }
            icon={<FaUsers />}
            disabled={downloading}
            onClick={downloadWorkforceReport}
          />,
          <QuickActionCard
            key="lifecycle"
            title="Lifecycle Report"
            subtitle="Open employee lifecycle reporting"
            icon={<FaFileAlt />}
            onClick={() =>
              navigate("/employees/directory")
            }
          />,
          <QuickActionCard
            key="attendance"
            title="Attendance Report"
            subtitle="Review attendance analytics"
            icon={<FaClock />}
            onClick={() =>
              navigate("/attendance")
            }
          />,
          <QuickActionCard
            key="leave"
            title="Leave Report"
            subtitle="Review leave analytics"
            icon={<FaUmbrellaBeach />}
            onClick={() =>
              navigate("/leave")
            }
          />,
          <QuickActionCard
            key="export"
            title="Export Centre"
            subtitle="CSV and report exports"
            icon={<FaDownload />}
            onClick={() =>
              navigate("/employees/export-queue")
            }
          />,
        ]}
      />
    </>
  );
}

export default Reports;
