import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiEye,
  FiEyeOff,
  FiLock,
  FiArrowLeft,
} from "react-icons/fi";

import loginBackground from "../assets/images/login-bg.png";
import chrisLogo from "../assets/images/chris-logo.png";

function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  /*
    During local development, Login.jsx will pass
    the reset token here after Forgot Password succeeds.

    Later, when email delivery is implemented,
    the token will come from the secure reset URL.
  */
  const resetToken =
    location.state?.resetToken || "";

  const [newPassword, setNewPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showNewPassword,
    setShowNewPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      if (!resetToken) {
        throw new Error(
          "Your password reset session is missing or has expired. Please start again from Forgot Password."
        );
      }

      if (
        !newPassword ||
        !confirmPassword
      ) {
        throw new Error(
          "Please complete both password fields."
        );
      }

      if (newPassword.length < 10) {
        throw new Error(
          "Your new password must contain at least 10 characters."
        );
      }

      if (
        newPassword !==
        confirmPassword
      ) {
        throw new Error(
          "The passwords do not match."
        );
      }

      const response = await fetch(
        "http://localhost:5000/api/auth/reset-password",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            token: resetToken,
            newPassword,
            confirmPassword,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Unable to reset password."
        );
      }

      setNewPassword("");
      setConfirmPassword("");

      setSuccess(
        result.message ||
          "Password reset successfully."
      );

      /*
        Give the user time to see the confirmation,
        then return to Sign In.
      */
      window.setTimeout(() => {
        navigate("/login", {
          replace: true,
        });
      }, 2500);
    } catch (err) {
      console.error(
        "CHRIS reset password error:",
        err
      );

      setError(
        err.message ||
          "CHRIS could not reset your password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        padding: "32px",
        boxSizing: "border-box",

        backgroundImage: `
          linear-gradient(
            135deg,
            rgba(3,45,29,0.42),
            rgba(0,0,0,0.16)
          ),
          url(${loginBackground})
        `,

        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,

          background:
            "radial-gradient(circle at 18% 20%, rgba(212,175,55,0.13), transparent 38%)",

          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: "460px",

          position: "relative",
          zIndex: 1,

          background:
            "rgba(255,255,255,0.68)",

          backdropFilter:
            "blur(14px)",

          WebkitBackdropFilter:
            "blur(14px)",

          border:
            "1px solid rgba(255,255,255,0.68)",

          borderRadius: "24px",

          padding: "38px",

          boxShadow:
            "0 25px 70px rgba(0,0,0,0.22)",
        }}
      >
        <button
          type="button"
          onClick={() =>
            navigate("/login", {
              replace: true,
            })
          }
          style={backButtonStyle}
        >
          <FiArrowLeft size={16} />

          Back to Sign In
        </button>

        <div
          style={{
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              width: "110px",
              minHeight: "82px",

              margin:
                "0 auto 16px",

              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={chrisLogo}
              alt="CorporateHr Network CHRIS"
              style={{
                display: "block",
                maxWidth: "110px",
                maxHeight: "82px",
                width: "auto",
                height: "auto",
                objectFit: "contain",
              }}
            />
          </div>

          <h1
            style={{
              margin: 0,

              color: "#087A43",

              fontSize: "27px",

              fontWeight: "800",
            }}
          >
            Create New Password
          </h1>

          <p
            style={{
              margin: "9px 0 0",

              color: "#475569",

              fontSize: "14px",

              lineHeight: "1.6",
            }}
          >
            Choose a secure new password
            for your CHRIS account.
          </p>
        </div>

        {!resetToken && (
          <MessageBox
            type="error"
            message="No active password reset session was found. Return to Sign In and select Forgot password?"
          />
        )}

        {error && (
          <MessageBox
            type="error"
            message={error}
          />
        )}

        {success && (
          <MessageBox
            type="success"
            message={`${success} Returning you to Sign In...`}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              marginBottom: "18px",
            }}
          >
            <label style={labelStyle}>
              New Password
            </label>

            <PasswordField
              value={newPassword}
              onChange={(event) =>
                setNewPassword(
                  event.target.value
                )
              }
              visible={showNewPassword}
              onToggle={() =>
                setShowNewPassword(
                  (current) =>
                    !current
                )
              }
              placeholder="Enter new password"
              autoComplete="new-password"
            />

            <p
              style={{
                margin: "7px 0 0",
                color: "#64748B",
                fontSize: "11px",
                lineHeight: "1.5",
              }}
            >
              Minimum 10 characters.
            </p>
          </div>

          <div
            style={{
              marginBottom: "24px",
            }}
          >
            <label style={labelStyle}>
              Confirm New Password
            </label>

            <PasswordField
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              visible={
                showConfirmPassword
              }
              onToggle={() =>
                setShowConfirmPassword(
                  (current) =>
                    !current
                )
              }
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={
              loading ||
              success ||
              !resetToken
            }
            style={{
              ...submitButtonStyle,

              background:
                loading ||
                success ||
                !resetToken
                  ? "#688B79"
                  : "#087A43",

              cursor:
                loading ||
                success ||
                !resetToken
                  ? "not-allowed"
                  : "pointer",

              opacity:
                loading ||
                success ||
                !resetToken
                  ? 0.75
                  : 1,
            }}
          >
            {loading
              ? "Resetting Password..."
              : success
              ? "Password Reset"
              : "Reset Password"}
          </button>
        </form>

        <div
          style={{
            marginTop: "28px",

            height: "1px",

            background:
              "rgba(203,213,225,0.70)",
          }}
        />

        <p
          style={{
            margin: "20px 0 0",

            textAlign: "center",

            color: "#64748B",

            fontSize: "12px",

            fontWeight: "700",
          }}
        >
          People | Performance | Rewards
        </p>
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  visible,
  onToggle,
  placeholder,
  autoComplete,
}) {
  return (
    <div style={inputWrapperStyle}>
      <FiLock
        size={18}
        style={inputIconStyle}
      />

      <input
        type={
          visible
            ? "text"
            : "password"
        }
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        autoComplete={autoComplete}
        style={{
          ...inputStyle,
          paddingRight: "50px",
        }}
      />

      <button
        type="button"
        onClick={onToggle}
        aria-label={
          visible
            ? "Hide password"
            : "Show password"
        }
        title={
          visible
            ? "Hide password"
            : "Show password"
        }
        style={eyeButtonStyle}
      >
        {visible ? (
          <FiEyeOff size={19} />
        ) : (
          <FiEye size={19} />
        )}
      </button>
    </div>
  );
}

function MessageBox({
  type,
  message,
}) {
  const isSuccess =
    type === "success";

  return (
    <div
      style={{
        marginBottom: "20px",

        padding: "13px 15px",

        background: isSuccess
          ? "rgba(240,253,244,0.94)"
          : "rgba(254,242,242,0.94)",

        border: isSuccess
          ? "1px solid #BBF7D0"
          : "1px solid #FECACA",

        borderRadius: "10px",

        color: isSuccess
          ? "#166534"
          : "#B91C1C",

        fontSize: "13px",

        fontWeight: "600",

        lineHeight: "1.5",
      }}
    >
      {message}
    </div>
  );
}

const labelStyle = {
  display: "block",

  marginBottom: "8px",

  color: "#1E293B",

  fontSize: "13px",

  fontWeight: "800",
};

const inputWrapperStyle = {
  position: "relative",

  width: "100%",
};

const inputIconStyle = {
  position: "absolute",

  left: "14px",

  top: "50%",

  transform:
    "translateY(-50%)",

  color: "#64748B",

  pointerEvents: "none",
};

const inputStyle = {
  width: "100%",

  padding:
    "13px 14px 13px 43px",

  boxSizing: "border-box",

  border:
    "1px solid rgba(148,163,184,0.60)",

  borderRadius: "11px",

  background:
    "rgba(255,255,255,0.67)",

  color: "#0F172A",

  fontSize: "14px",

  outline: "none",
};

const eyeButtonStyle = {
  position: "absolute",

  right: "10px",

  top: "50%",

  transform:
    "translateY(-50%)",

  width: "36px",

  height: "36px",

  display: "flex",

  alignItems: "center",

  justifyContent: "center",

  background: "transparent",

  color: "#475569",

  border: "none",

  borderRadius: "8px",

  cursor: "pointer",
};

const submitButtonStyle = {
  width: "100%",

  border: "none",

  borderRadius: "11px",

  padding: "14px",

  color: "#FFFFFF",

  fontSize: "15px",

  fontWeight: "800",

  boxShadow:
    "0 8px 18px rgba(11,94,59,0.24)",
};

const backButtonStyle = {
  display: "flex",

  alignItems: "center",

  gap: "7px",

  border: "none",

  background: "transparent",

  color: "#087A43",

  fontSize: "13px",

  fontWeight: "800",

  cursor: "pointer",

  padding: 0,

  marginBottom: "24px",
};

export default ResetPassword;