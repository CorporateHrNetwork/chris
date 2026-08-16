function PayrollSummary() {
  return (
    <div style={cardStyle}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "3px",
          background:
            "linear-gradient(90deg, rgba(8,122,67,0.90), rgba(212,175,55,0.90), rgba(8,122,67,0.18))",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: "150px",
          height: "150px",
          right: "-55px",
          bottom: "-70px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(8,122,67,0.08), transparent 68%)",
        }}
      />

      <h3 style={titleStyle}>
        Payroll Summary
      </h3>

      <p style={bodyStyle}>
        Payroll statistics will appear here.
      </p>
    </div>
  );
}

const cardStyle = {
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

  minHeight:
    "280px",

  position:
    "relative",

  overflow:
    "hidden",
};

const titleStyle = {
  margin:
    0,

  color:
    "#075F36",

  fontSize:
    "17px",

  fontWeight:
    "900",

  letterSpacing:
    "0.01em",

  position:
    "relative",
};

const bodyStyle = {
  margin:
    "10px 0 0",

  color:
    "#6B7D73",

  fontSize:
    "13px",

  lineHeight:
    "1.65",

  fontWeight:
    "600",

  position:
    "relative",
};

export default PayrollSummary;