function RecentEmployees() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "18px",
        padding: "24px",
        boxShadow: "0 8px 25px rgba(0,0,0,.05)",
        minHeight: "280px",
      }}
    >
      <h3 style={{ marginTop: 0, color: "#065F46" }}>
        Recent Employees
      </h3>

      <p style={{ color: "#6B7280" }}>
        Recently added employees will appear here.
      </p>
    </div>
  );
}

export default RecentEmployees;