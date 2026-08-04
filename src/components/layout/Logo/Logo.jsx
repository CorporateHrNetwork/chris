import chrisLogo from "../../../assets/logos/chris-logo.png";

function Logo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 0",
        borderBottom: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <img
        src={chrisLogo}
        alt="CHRIS Logo"
        style={{
          width: "70px",
          marginBottom: "10px",
        }}
      />

      <h2
        style={{
          margin: 0,
          color: "#FFFFFF",
          fontSize: "20px",
          fontWeight: "700",
        }}
      >
        CHRIS
      </h2>

      <span
        style={{
          color: "#B8C7C2",
          fontSize: "11px",
          marginTop: "4px",
          textAlign: "center",
        }}
      >
        CorporateHr Information System
      </span>
    </div>
  );
}

export default Logo;