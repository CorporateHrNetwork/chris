import useAuthorization from "../../hooks/useAuthorization";

function DashboardHeader() {
  const today = new Date();

  const {
    roles,
    profile,
    loading,
  } = useAuthorization();

  const date =
    today.toLocaleDateString(
      "en-GB",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    );

  const hour =
    today.getHours();

  let greeting =
    "Good Morning";

  if (
    hour >= 12 &&
    hour < 17
  ) {
    greeting =
      "Good Afternoon";
  }

  if (hour >= 17) {
    greeting =
      "Good Evening";
  }

  /*
  ============================================================
  CURRENT USER DISPLAY ROLE
  ============================================================

  CHRIS supports multiple roles per user.

  For the dashboard heading, display the first assigned role.
  If authorization is still loading, show a temporary label.
  */

  const displayRole =
    loading
      ? "Loading..."
      : roles.length > 0
        ? roles[0]
        : "CHRIS User";

  const firstName =
    profile?.firstName ||
    "";

  return (
    <div
      style={{
        marginBottom: "35px",
      }}
    >
      <div
        style={{
          fontSize: "16px",
          color: "#6B7280",
          marginBottom: "10px",
        }}
      >
        {greeting}
        {firstName
          ? `, ${firstName}`
          : ","}
      </div>

      <h1
        style={{
          margin: 0,
          color: "#087A43",
          fontSize: "46px",
          fontWeight: "700",
        }}
      >
        {displayRole}
      </h1>

      <p
        style={{
          marginTop: "8px",
          color: "#6B7280",
          fontSize: "18px",
        }}
      >
        {date}
      </p>
    </div>
  );
}

export default DashboardHeader;