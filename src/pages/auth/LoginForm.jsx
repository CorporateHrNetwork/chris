function LoginForm() {
  return (
    <div
      style={{
        background: "#FFFFFF",
        width: "420px",
        padding: "40px",
        borderRadius: "16px",
        boxShadow: "0 10px 25px rgba(0,0,0,.08)",
      }}
    >
      {/* Heading */}
      <h2
        style={{
          color: "#087A43",
          marginBottom: "10px",
          textAlign: "center",
        }}
      >
        CHRIS Login
      </h2>

      <p
        style={{
          textAlign: "center",
          color: "#666",
          marginBottom: "30px",
          fontSize: "14px",
        }}
      >
        CorporateHr Information System
      </p>

      {/* Email */}
      <input
        type="email"
        placeholder="Email Address"
        style={{
          width: "100%",
          padding: "14px",
          marginBottom: "18px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          fontSize: "15px",
          boxSizing: "border-box",
        }}
      />

      {/* Password */}
      <input
        type="password"
        placeholder="Password"
        style={{
          width: "100%",
          padding: "14px",
          marginBottom: "15px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          fontSize: "15px",
          boxSizing: "border-box",
        }}
      />

      {/* Remember Me / Forgot Password */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "25px",
          fontSize: "14px",
        }}
      >
        <label style={{ color: "#444" }}>
          <input type="checkbox" /> Remember Me
        </label>

        <a
          href="/forgot-password"
          style={{
            color: "#087A43",
            textDecoration: "none",
            fontWeight: "600",
          }}
        >
          Forgot Password?
        </a>
      </div>

      {/* Sign In Button */}
      <button
        style={{
          width: "100%",
          padding: "14px",
          background: "#087A43",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontWeight: "600",
          fontSize: "16px",
          cursor: "pointer",
          transition: "0.3s",
        }}
      >
        Sign In
      </button>

      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          margin: "30px 0 20px",
        }}
      >
        <hr
          style={{
            flex: 1,
            border: "none",
            borderTop: "1px solid #ddd",
          }}
        />

        <span
          style={{
            margin: "0 15px",
            color: "#777",
            fontSize: "13px",
            fontWeight: "500",
          }}
        >
          OR
        </span>

        <hr
          style={{
            flex: 1,
            border: "none",
            borderTop: "1px solid #ddd",
          }}
        />
      </div>

      {/* Contact Information */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "25px",
          lineHeight: "1.7",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            color: "#555",
          }}
        >
          Need access to CHRIS?
        </div>

        <div
          style={{
            color: "#087A43",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          Please contact your HR Administrator
          <br />
          or System Administrator.
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          textAlign: "center",
          borderTop: "1px solid #eee",
          paddingTop: "18px",
          color: "#777",
          lineHeight: "1.8",
          fontSize: "12px",
        }}
      >
        <strong style={{ color: "#087A43" }}>
          © 2026 CorporateHr Network
        </strong>

        <br />

        <strong>CHRIS v1.0</strong>

        <br />

        CorporateHr Information System

        <br />

        <span
          style={{
            color: "#C9A227",
            fontWeight: "600",
          }}
        >
          People | Performance | Rewards
        </span>
      </div>
    </div>
  );
}

export default LoginForm;