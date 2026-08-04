function DashboardHeader() {
  const today = new Date();

  const date = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hour = today.getHours();

  let greeting = "Good Morning";

  if (hour >= 12 && hour < 17) {
    greeting = "Good Afternoon";
  }

  if (hour >= 17) {
    greeting = "Good Evening";
  }

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
        {greeting},
      </div>

      <h1
        style={{
          margin: 0,
          color: "#065F46",
          fontSize: "46px",
          fontWeight: "700",
        }}
      >
        Administrator
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