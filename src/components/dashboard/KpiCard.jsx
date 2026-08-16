function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
}) {
  const accentColor =
    color || "#087A43";

  return (
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.985), rgba(246,250,247,0.97))",

        border:
          "1px solid rgba(212,175,55,0.20)",

        borderRadius:
          "18px",

        padding:
          "24px",

        boxShadow:
          "0 14px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.90)",

        transition:
          "transform .22s ease, box-shadow .22s ease, border-color .22s ease",

        cursor:
          "pointer",

        position:
          "relative",

        overflow:
          "hidden",

        minHeight:
          "155px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform =
          "translateY(-4px)";

        e.currentTarget.style.boxShadow =
          "0 18px 42px rgba(0,0,0,0.24), 0 0 0 1px rgba(8,122,67,0.06)";

        e.currentTarget.style.borderColor =
          "rgba(212,175,55,0.34)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform =
          "translateY(0)";

        e.currentTarget.style.boxShadow =
          "0 14px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.90)";

        e.currentTarget.style.borderColor =
          "rgba(212,175,55,0.20)";
      }}
    >
      {/* GREEN / GOLD AMBIENT ACCENTS */}

      <div
        aria-hidden="true"
        style={{
          position:
            "absolute",

          width:
            "120px",

          height:
            "120px",

          right:
            "-42px",

          top:
            "-42px",

          borderRadius:
            "50%",

          background:
            "radial-gradient(circle, rgba(8,122,67,0.12), transparent 68%)",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position:
            "absolute",

          left:
            0,

          top:
            0,

          width:
            "100%",

          height:
            "3px",

          background:
            "linear-gradient(90deg, rgba(8,122,67,0.90), rgba(212,175,55,0.92), rgba(8,122,67,0.22))",
        }}
      />

      <div
        style={{
          position:
            "absolute",

          right:
            "22px",

          top:
            "20px",

          width:
            "48px",

          height:
            "48px",

          borderRadius:
            "14px",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          fontSize:
            "27px",

          background:
            "linear-gradient(145deg, rgba(8,122,67,0.09), rgba(212,175,55,0.08))",

          border:
            "1px solid rgba(8,122,67,0.10)",
        }}
      >
        {icon}
      </div>

      <div
        style={{
          color:
            "#52665B",

          fontSize:
            "12px",

          fontWeight:
            "800",

          textTransform:
            "uppercase",

          letterSpacing:
            "0.06em",

          position:
            "relative",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color:
            accentColor,

          fontSize:
            "40px",

          lineHeight:
            "1",

          margin:
            "18px 0 10px",

          fontWeight:
            "900",

          position:
            "relative",
        }}
      >
        {value}
      </div>

      <div
        style={{
          color:
            "#6B7D73",

          fontSize:
            "13px",

          fontWeight:
            "600",

          position:
            "relative",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

export default KpiCard;