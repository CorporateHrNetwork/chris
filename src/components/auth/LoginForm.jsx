import chrisLogo from "../../assets/logos/chris-logo.png";
import background from "../../assets/images/login-bg.png";

function LoginForm() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: `linear-gradient(rgba(0,0,0,.30), rgba(0,0,0,.30)), url(${background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          width: "460px",
          padding: "18px",

          background: "rgba(255,255,255,0.42)",

          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",

          border: "1px solid rgba(255,255,255,.22)",

          borderRadius: "22px",

          boxShadow:
            "0 20px 45px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.18)",
        }}
      >
        {/* Logo */}

        <div
          style={{
            textAlign: "center",
            marginBottom: "16px",
          }}
        >
          <img
            src={chrisLogo}
            alt="CHRIS Logo"
            style={{
              width: "72px",
              marginBottom: "8px",
            }}
          />

          <h2
            style={{
              margin: 0,
              color: "#0B5E3B",
              fontSize: "24px",
              fontWeight: "700",
            }}
          >
            Welcome to CHRIS
          </h2>

          <p
            style={{
              marginTop: "4px",
              marginBottom: "16px",
              color: "#333",
              fontSize: "14px",
            }}
          >
            CorporateHr Information System
          </p>
        </div>

        <input
          type="email"
          placeholder="Email Address"
          style={inputStyle}
        />

        <input
          type="password"
          placeholder="Password"
          style={inputStyle}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            fontSize: "13px",
          }}
        >
          <label
            style={{
              color: "#222",
            }}
          >
            <input
              type="checkbox"
              style={{
                marginRight: "6px",
              }}
            />
            Remember Me
          </label>

          <a
            href="#"
            style={{
              color: "#0B5E3B",
              textDecoration: "none",
              fontWeight: "600",
            }}
          >
            Forgot Password?
          </a>
        </div>

        <button style={buttonStyle}>
          Sign In
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "16px 0",
          }}
        >
          <hr
            style={{
              flex: 1,
              border: "none",
              borderTop: "1px solid rgba(255,255,255,.45)",
            }}
          />

          <span
            style={{
              margin: "0 12px",
              fontSize: "12px",
              color: "#444",
            }}
          >
            OR
          </span>

          <hr
            style={{
              flex: 1,
              border: "none",
              borderTop: "1px solid rgba(255,255,255,.45)",
            }}
          />
        </div>

        <div
          style={{
            textAlign: "center",
            color: "#222",
            fontSize: "12px",
            lineHeight: "1.5",
          }}
        >
          <strong>Need access to CHRIS?</strong>

          <br />

          Please contact your HR Administrator

          <br />

          or System Administrator.
        </div>

        <hr
          style={{
            margin: "16px 0",
            border: "none",
            borderTop: "1px solid rgba(255,255,255,.45)",
          }}
        />

        <div
          style={{
            textAlign: "center",
            fontSize: "11px",
            color: "#222",
            lineHeight: "1.5",
          }}
        >
          © 2026 CorporateHr Network

          <br />

          <strong>CHRIS v1.0</strong>

          <br />

          CorporateHr Information System

          <br />

          <span
            style={{
              color: "#0B5E3B",
              fontWeight: "700",
            }}
          >
            People | Performance | Rewards
          </span>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  marginBottom: "12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,.50)",
  background: "rgba(255,255,255,.60)",
  fontSize: "14px",
  color: "#222",
  boxSizing: "border-box",
  outline: "none",
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  border: "none",
  borderRadius: "10px",
  background: "linear-gradient(135deg,#0B5E3B,#14824F)",
  color: "#fff",
  fontSize: "15px",
  fontWeight: "700",
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(11,94,59,.35)",
};

export default LoginForm;