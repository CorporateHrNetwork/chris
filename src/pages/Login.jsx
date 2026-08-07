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

function Login() {
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

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  /*
    Force the visible credential fields to
    start empty whenever the login page opens.

    We clear both React state and the actual
    input elements because some browsers can
    restore saved credentials directly into
    the DOM.
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

            organizationSlug:
              "corporatehr-network",
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
        Remember Me affects session duration,
        not whether credentials are displayed.
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

      /*
        Do not clear state here before routing.
        First complete authentication and leave
        the Login page successfully.
      */
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

  const handleForgotPassword = (
    event
  ) => {
    event.preventDefault();

    setError("");
    setNotice("");

    if (!email.trim()) {
      setError(
        "Enter the email address linked to your CHRIS account."
      );

      return;
    }

    setNotice(
      "Password recovery is being prepared. No reset email has been sent yet."
    );
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
              {/*
                Decoy autofill inputs.

                These help prevent Chrome from
                inserting saved credentials into
                the real CHRIS login fields.
              */}
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
                        "#0B5E3B",

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
                      : "#0B5E3B",

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
                    "#0B5E3B",

                  fontSize:
                    "26px",

                  fontWeight:
                    "800",
                }}
              >
                Reset Password
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

                style={
                  signInButtonStyle
                }
              >
                Continue
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
      <ChrisLogo />

      <h1
        style={{
          margin: 0,

          color: "#0B5E3B",

          fontSize: "28px",

          fontWeight: "800",
        }}
      >
        Welcome to CHRIS
      </h1>

      <p
        style={
          subtitleStyle
        }
      >
        CorporateHr Information System
      </p>
    </div>
  );
}

function ChrisLogo() {
  return (
    <div
      style={{
        width: "110px",

        minHeight: "82px",

        margin:
          "0 auto 16px",

        display: "flex",

        alignItems: "center",

        justifyContent:
          "center",
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

          color: "#64748B",

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
            ? "rgba(240,253,244,0.92)"
            : "rgba(254,242,242,0.92)",

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

  color: "#475569",

  fontSize: "14px",

  fontWeight: "500",

  lineHeight: "1.6",
};

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

const iconInputStyle = {
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

  background: "transparent",

  color: "#0B5E3B",

  fontSize: "13px",

  fontWeight: "800",

  cursor: "pointer",
};

const signInButtonStyle = {
  width: "100%",

  border: "none",

  borderRadius: "11px",

  padding: "14px",

  background: "#0B5E3B",

  color: "#FFFFFF",

  fontSize: "15px",

  fontWeight: "800",

  cursor: "pointer",

  boxShadow:
    "0 8px 18px rgba(11,94,59,0.24)",
};

const backButtonStyle = {
  display: "flex",

  alignItems: "center",

  gap: "7px",

  border: "none",

  background: "transparent",

  color: "#0B5E3B",

  fontSize: "13px",

  fontWeight: "800",

  cursor: "pointer",

  padding: 0,

  marginBottom: "24px",
};

export default Login;