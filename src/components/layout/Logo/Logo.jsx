import chrisLogo from "../../../assets/images/chris-logo.png";

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
        alt="CHRiS"
        style={{
          width: "min(180px, 90%)",
          height: "auto",
          objectFit: "contain",
          marginBottom: "10px",
        }}
      />

    </div>
  );
}

export default Logo;