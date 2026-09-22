import useAuthorization from "../../hooks/useAuthorization";

function DashboardHeader() {
  const today = new Date();
  const { roles, profile, loading } = useAuthorization();
  const date = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hour = today.getHours();
  let greeting = "Good Morning";
  if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
  if (hour >= 17) greeting = "Good Evening";
  const displayRole = loading ? "Loading..." : roles.length > 0 ? roles[0] : "CHRIS User";
  const firstName = profile?.firstName || "";

  return (
    <div className="chris-dashboard-header" style={{ marginBottom: "35px" }}>
      <style>{`
        @media (max-width: 860px) {
          .chris-dashboard-header {
            margin-bottom: 22px !important;
          }

          .chris-dashboard-greeting {
            font-size: 11px !important;
            letter-spacing: .08em !important;
            line-height: 1.45 !important;
          }

          .chris-dashboard-role {
            font-size: clamp(26px, 8vw, 34px) !important;
            line-height: 1.08 !important;
            overflow-wrap: anywhere;
            word-break: normal;
          }

          .chris-dashboard-date {
            font-size: 13px !important;
            line-height: 1.45 !important;
          }
        }
      `}</style>

      <div
        className="chris-dashboard-greeting"
        style={{
          fontSize: "13px",
          color: "#F2CF57",
          marginBottom: "8px",
          fontWeight: "900",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        {greeting}{firstName ? `, ${firstName}` : ","}
      </div>

      <h1
        className="chris-dashboard-role"
        style={{
          margin: 0,
          color: "#F7FAF8",
          fontSize: "42px",
          fontWeight: "850",
        }}
      >
        {displayRole}
      </h1>

      <p
        className="chris-dashboard-date"
        style={{
          marginTop: "8px",
          color: "#9FB1A7",
          fontSize: "15px",
          fontWeight: "600",
        }}
      >
        {date}
      </p>
    </div>
  );
}

export default DashboardHeader;
