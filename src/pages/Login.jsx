import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiArrowLeft,
} from "react-icons/fi";

import loginBackground from "../assets/images/login-bg.png";
import chrisLogo from "../assets/images/chris-logo.png";

/*
  CHRIS_TENANT_AWARE_LOGIN

  Tenant is resolved from:
    /login?organization=<organization-slug>

  CorporateHr Network remains the safe development fallback.
*/
function Login() {
  const organizationSlug =
    new URLSearchParams(
      window.location.search
    ).get("organization") ||
    "corporatehr-network";
  const navigate = useNavigate();

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [mode, setMode] =
    useState("login");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    rememberMe,
    setRememberMe,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [
    recoveryLoading,
    setRecoveryLoading,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  /*
    Keep login fields empty whenever the
    Login page is opened.

    Some browsers restore credentials directly
    into form fields, so we clear both React
    state and the actual DOM inputs.
  */
  useEffect(() => {
    const clearCredentialFields = () => {
      setEmail("");
      setPassword("");
      setRememberMe(false);
      setShowPassword(false);
      setError("");
      setNotice("");

      if (emailRef.current) {
        emailRef.current.value = "";
      }

      if (passwordRef.current) {
        passwordRef.current.value = "";
      }
    };

    clearCredentialFields();

    const firstTimer =
      window.setTimeout(
        clearCredentialFields,
        100
      );

    const secondTimer =
      window.setTimeout(
        clearCredentialFields,
        600
      );

    const handlePageShow = () => {
      clearCredentialFields();
    };

    window.addEventListener(
      "pageshow",
      handlePageShow
    );

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);

      window.removeEventListener(
        "pageshow",
        handlePageShow
      );
    };
  }, []);

  const clearExistingSession = () => {
    localStorage.removeItem(
      "chris_token"
    );

    localStorage.removeItem(
      "chris_user"
    );

    localStorage.removeItem(
      "chris_organization"
    );

    sessionStorage.removeItem(
      "chris_token"
    );

    sessionStorage.removeItem(
      "chris_user"
    );

    sessionStorage.removeItem(
      "chris_organization"
    );
  };

  const handleSubmit = async (
    event
  ) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      setNotice("");

      const response = await fetch(
        "http://localhost:5000/api/auth/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            email:
              email.trim().toLowerCase(),

            password,

            organizationSlug,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Unable to sign in."
        );
      }

      clearExistingSession();

      /*
        Remember Me checked:
        localStorage survives browser restart.

        Remember Me unchecked:
        sessionStorage lasts for the current
        browser session.
      */
      const storage =
        rememberMe
          ? localStorage
          : sessionStorage;

      storage.setItem(
        "chris_token",
        result.data.token
      );

      storage.setItem(
        "chris_user",
        JSON.stringify(
          result.data.user
        )
      );

      storage.setItem(
        "chris_organization",
        JSON.stringify(
          result.data.organization
        )
      );

      navigate("/", {
        replace: true,
      });
    } catch (err) {
      console.error(
        "CHRIS login error:",
        err
      );

      setError(
        err.message ||
          "CHRIS could not complete sign in."
      );
    } finally {
      setLoading(false);
    }
  };

  /*
    FORGOT PASSWORD

    Calls the real CHRIS backend.

    During development, the backend returns
    the reset token directly.

    Later, when email delivery is implemented,
    this token will instead be delivered through
    a secure reset link.
  */
  const handleForgotPassword =
    async (event) => {
      event.preventDefault();

      try {
        setRecoveryLoading(true);
        setError("");
        setNotice("");

        const normalizedEmail =
          email.trim().toLowerCase();

        if (!normalizedEmail) {
          throw new Error(
            "Enter the email address linked to your CHRIS account."
          );
        }

        const response = await fetch(
          "http://localhost:5000/api/auth/forgot-password",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email: normalizedEmail,

              organizationSlug,
            }),
          }
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.message ||
              "Unable to prepare password reset."
          );
        }

        /*
          DEVELOPMENT RESET FLOW

          A valid development account receives
          resetToken in result.data.

          Invalid/non-existent accounts still receive
          the same generic success message from the
          backend, protecting account privacy.
        */
        const resetToken =
          result.data?.resetToken;

        if (!resetToken) {
          setNotice(
            result.message ||
              "If an active CHRIS account exists for this email, password reset instructions have been prepared."
          );

          return;
        }

        /*
          Pass the development reset token directly
          to the Reset Password page without placing
          it in the visible URL.
        */
        navigate(
          "/reset-password",
          {
            state: {
              resetToken,
              email:
                normalizedEmail,
            },
          }
        );
      } catch (err) {
        console.error(
          "CHRIS forgot password error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not prepare password recovery."
        );
      } finally {
        setRecoveryLoading(false);
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
            "linear-gradient(180deg, rgba(3,12,8,0.94), rgba(5,24,15,0.92))",

          backdropFilter:
            "blur(14px)",

          WebkitBackdropFilter:
            "blur(14px)",

          border:
            "1px solid rgba(212,175,55,0.38)",

          borderRadius: "24px",

          padding: "38px",

          boxShadow:
            "0 28px 80px rgba(0,0,0,0.46), 0 0 30px rgba(8,122,67,0.12)",
        }}
      >
        {mode === "login" ? (
          <>
            <LoginHeader />

            {error && (
              <MessageBox
                type="error"
                message={error}
              />
            )}

            <form
              onSubmit={handleSubmit}
              autoComplete="off"
            >
              {/* Browser autofill decoys */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                tabIndex="-1"
                aria-hidden="true"
                style={decoyStyle}
              />

              <input
                type="password"
                name="password"
                autoComplete="current-password"
                tabIndex="-1"
                aria-hidden="true"
                style={decoyStyle}
              />

              <div
                style={{
                  marginBottom: "18px",
                }}
              >
                <label
                  style={labelStyle}
                >
                  Email Address
                </label>

                <div
                  style={
                    inputWrapperStyle
                  }
                >
                  <FiMail
                    size={18}
                    style={
                      inputIconStyle
                    }
                  />

                  <input
                    ref={emailRef}
                    name="chris_account_identifier"
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value
                      )
                    }
                    placeholder="Enter your email address"
                    required
                    autoComplete="off"
                    spellCheck="false"
                    style={
                      iconInputStyle
                    }
                  />
                </div>
              </div>

              <div
                style={{
                  marginBottom: "14px",
                }}
              >
                <label
                  style={labelStyle}
                >
                  Password
                </label>

                <div
                  style={
                    inputWrapperStyle
                  }
                >
                  <FiLock
                    size={18}
                    style={
                      inputIconStyle
                    }
                  />

                  <input
                    ref={passwordRef}
                    name="chris_secure_access"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(event) =>
                      setPassword(
                        event.target.value
                      )
                    }
                    placeholder="Enter your password"
                    required
                    autoComplete="new-password"
                    style={{
                      ...iconInputStyle,

                      paddingRight:
                        "50px",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current
                      )
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    title={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    style={
                      eyeButtonStyle
                    }
                  >
                    {showPassword ? (
                      <FiEyeOff
                        size={19}
                      />
                    ) : (
                      <FiEye
                        size={19}
                      />
                    )}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "space-between",

                  gap: "16px",

                  marginBottom:
                    "24px",

                  flexWrap:
                    "wrap",
                }}
              >
                <label
                  style={{
                    display: "flex",

                    alignItems:
                      "center",

                    gap: "8px",

                    color:
                      "#334155",

                    fontSize:
                      "13px",

                    fontWeight:
                      "700",

                    cursor:
                      "pointer",
                  }}
                >
                  <input
                    type="checkbox"

                    checked={
                      rememberMe
                    }

                    onChange={(
                      event
                    ) =>
                      setRememberMe(
                        event.target
                          .checked
                      )
                    }

                    style={{
                      width:
                        "16px",

                      height:
                        "16px",

                      accentColor:
                        "#087A43",

                      cursor:
                        "pointer",
                    }}
                  />

                  Remember me
                </label>

                <button
                  type="button"

                  onClick={() => {
                    setMode(
                      "forgot"
                    );

                    setEmail("");
                    setPassword("");
                    setError("");
                    setNotice("");
                  }}

                  style={
                    linkButtonStyle
                  }
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"

                disabled={loading}

                style={{
                  ...signInButtonStyle,

                  background:
                    loading
                      ? "#688B79"
                      : "#087A43",

                  cursor:
                    loading
                      ? "not-allowed"
                      : "pointer",

                  opacity:
                    loading
                      ? 0.8
                      : 1,
                }}
              >
                {loading
                  ? "Signing in..."
                  : "Sign In"}
              </button>
            </form>

            <Footer />
          </>
        ) : (
          <>
            {/* FORGOT PASSWORD */}
            <button
              type="button"

              onClick={() => {
                setMode("login");

                setEmail("");
                setPassword("");
                setError("");
                setNotice("");
              }}

              style={
                backButtonStyle
              }
            >
              <FiArrowLeft
                size={16}
              />

              Back to Sign In
            </button>

            <div
              style={{
                textAlign: "center",

                marginBottom:
                  "28px",
              }}
            >
              <ChrisLogo />

              <h1
                style={{
                  margin: 0,

                  color:
                    "#087A43",

                  fontSize:
                    "26px",

                  fontWeight:
                    "800",
                }}
              >
                Forgot Password?
              </h1>

              <p
                style={
                  subtitleStyle
                }
              >
                Enter the email
                address linked to
                your CHRIS account.
              </p>
            </div>

            {error && (
              <MessageBox
                type="error"
                message={error}
              />
            )}

            {notice && (
              <MessageBox
                type="notice"
                message={notice}
              />
            )}

            <form
              onSubmit={
                handleForgotPassword
              }
              autoComplete="off"
            >
              <div
                style={{
                  marginBottom:
                    "22px",
                }}
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  Email Address
                </label>

                <div
                  style={
                    inputWrapperStyle
                  }
                >
                  <FiMail
                    size={18}
                    style={
                      inputIconStyle
                    }
                  />

                  <input
                    type="email"

                    value={email}

                    onChange={(event) =>
                      setEmail(
                        event.target.value
                      )
                    }

                    required

                    autoComplete="off"

                    placeholder="Enter your account email"

                    style={
                      iconInputStyle
                    }
                  />
                </div>
              </div>

              <button
                type="submit"

                disabled={
                  recoveryLoading
                }

                style={{
                  ...signInButtonStyle,

                  background:
                    recoveryLoading
                      ? "#688B79"
                      : "#087A43",

                  cursor:
                    recoveryLoading
                      ? "not-allowed"
                      : "pointer",

                  opacity:
                    recoveryLoading
                      ? 0.8
                      : 1,
                }}
              >
                {recoveryLoading
                  ? "Preparing Reset..."
                  : "Continue"}
              </button>
            </form>

            <Footer />
          </>
        )}
      </div>
    </div>
  );
}

function LoginHeader() {
  return (
    <div
      style={{
        textAlign: "center",
        marginBottom: "28px",
      }}
    >
      <div
        style={{
          color: "#D4AF37",
          fontSize: "16px",
          fontWeight: "800",
          letterSpacing: "0.04em",
          marginBottom: "8px",
        }}
      >
        Welcome to
      </div>

      <ChrisLogo />

      <div
        style={{
          marginTop: "3px",
          color: "#087A43",
          fontSize: "17px",
          fontWeight: "900",
          lineHeight: "1.25",
          letterSpacing: "0.01em",
          textShadow:
            "0 0 9px rgba(8,122,67,0.22)",
        }}
      >
        CorporateHR Network
      </div>

      <div
        style={{
          marginTop: "5px",
          color: "#D4AF37",
          fontSize: "10px",
          fontWeight: "800",
          lineHeight: "1.3",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          textShadow:
            "0 0 8px rgba(212,175,55,0.18)",
        }}
      >
        Information System
      </div>

      <div
        aria-hidden="true"
        style={{
          width: "62%",
          height: "1px",
          margin: "15px auto 0",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(8,122,67,0.72) 25%, rgba(212,175,55,0.92) 50%, rgba(8,122,67,0.72) 75%, transparent 100%)",
        }}
      />
    </div>
  );
}

function ChrisLogo() {
  return (
    <>
      <style>
        {`
          @keyframes chrisLoginLogoPulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
              filter:
                drop-shadow(0 0 6px rgba(0,155,74,0.24))
                drop-shadow(0 0 5px rgba(212,175,55,0.15));
            }

            50% {
              opacity: 0.64;
              transform: scale(1.035);
              filter:
                drop-shadow(0 0 14px rgba(0,185,88,0.40))
                drop-shadow(0 0 11px rgba(212,175,55,0.28));
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .chris-login-logo {
              animation: none !important;
            }
          }
        `}
      </style>

      <div
        style={{
          width: "100%",
          minHeight: "86px",
          margin: "0 auto 5px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        <img
          className="chris-login-logo"
          src={chrisLogo}
          alt="CHRIS"
          style={{
            display: "block",
            width: "245px",
            maxWidth: "92%",
            height: "auto",
            objectFit: "contain",
            border: "none",
            outline: "none",
            background: "transparent",
            animation:
              "chrisLoginLogoPulse 2.5s ease-in-out infinite",
            transformOrigin: "center",
          }}
        />
      </div>
    </>
  );
}

function Footer() {
  return (
    <>
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
          margin:
            "20px 0 0",

          textAlign: "center",

          color: "#7FAF96",

          fontSize: "12px",

          fontWeight: "700",
        }}
      >
        People | Performance | Rewards
      </p>
    </>
  );
}

function MessageBox({
  type,
  message,
}) {
  const notice =
    type === "notice";

  return (
    <div
      style={{
        marginBottom:
          "20px",

        padding:
          "13px 15px",

        background:
          notice
            ? "rgba(240,253,244,0.94)"
            : "rgba(254,242,242,0.94)",

        border:
          notice
            ? "1px solid #BBF7D0"
            : "1px solid #FECACA",

        borderRadius:
          "10px",

        color:
          notice
            ? "#166534"
            : "#B91C1C",

        fontSize:
          "13px",

        fontWeight:
          "600",

        lineHeight: 1.5,
      }}
    >
      {message}
    </div>
  );
}

const decoyStyle = {
  position: "absolute",

  width: "1px",

  height: "1px",

  opacity: 0,

  pointerEvents: "none",
};

const subtitleStyle = {
  margin: "9px 0 0",

  color: "#A8C3B5",

  fontSize: "14px",

  fontWeight: "500",

  lineHeight: "1.6",
};

const labelStyle = {
  display: "block",

  marginBottom: "8px",

  color: "#D7E4DC",

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

const iconInputStyle = {
  width: "100%",

  padding:
    "13px 14px 13px 43px",

  boxSizing: "border-box",

  border:
    "1px solid rgba(8,122,67,0.70)",

  borderRadius: "11px",

  background:
    "rgba(2,10,7,0.62)",

  color: "#F8FAF9",

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

  justifyContent:
    "center",

  background: "transparent",

  color: "#475569",

  border: "none",

  borderRadius: "8px",

  cursor: "pointer",
};

const linkButtonStyle = {
  padding: 0,

  border: "none",

  background:
    "transparent",

  color: "#D4AF37",

  fontSize: "13px",

  fontWeight: "800",

  cursor: "pointer",
};

const signInButtonStyle = {
  width: "100%",

  border: "none",

  borderRadius: "11px",

  padding: "14px",

  background: "linear-gradient(90deg, #075F36, #0B7A45)",

  color: "#FFFFFF",

  fontSize: "15px",

  fontWeight: "800",

  cursor: "pointer",

  boxShadow:
    "0 8px 22px rgba(0,0,0,0.30), 0 0 14px rgba(8,122,67,0.18)",
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

export default Login;