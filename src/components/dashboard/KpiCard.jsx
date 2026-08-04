function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "18px",
        padding: "28px",
        boxShadow: "0 8px 25px rgba(0,0,0,.05)",
        transition: ".25s",
        cursor: "pointer",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-6px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          position: "absolute",
          right: "25px",
          top: "22px",
          fontSize: "38px",
          opacity: .18,
        }}
      >
        {icon}
      </div>

      <div
        style={{
          color: "#6B7280",
          fontSize: "15px",
        }}
      >
        {title}
      </div>

      <h2
        style={{
          color,
          fontSize: "48px",
          margin: "20px 0 12px",
        }}
      >
        {value}
      </h2>

      <div
        style={{
          color: "#6B7280",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

export default KpiCard;