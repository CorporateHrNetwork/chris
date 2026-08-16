import {
  useEffect,
  useState,
} from "react";

import {
  Navigate,
} from "react-router-dom";

import {
  clearAuthSession,
  getAuthToken,
  verifyAuthSession,
} from "../../services/api";

function ProtectedRoute({
  children,
}) {
  const [
    authState,
    setAuthState,
  ] = useState("checking");

  const [
    connectionError,
    setConnectionError,
  ] = useState("");

  useEffect(() => {
    let active = true;

    const validateSession =
      async () => {
        const token =
          getAuthToken();

        /*
        No stored token:
        user is not authenticated.
        */

        if (!token) {
          if (active) {
            setAuthState(
              "unauthenticated"
            );
          }

          return;
        }

        /*
        Browser already knows it
        has no network connection.
        */

        if (
          navigator.onLine ===
          false
        ) {
          if (active) {
            setConnectionError(
              "CHRIS requires an active connection to the server."
            );

            setAuthState(
              "offline"
            );
          }

          return;
        }

        /*
        A stored token alone is NOT
        enough to enter CHRIS.

        Verify it against the backend.
        */

        try {
          await verifyAuthSession();

          if (active) {
            setConnectionError(
              ""
            );

            setAuthState(
              "authenticated"
            );
          }
        } catch (error) {
          if (!active) {
            return;
          }

          /*
          Invalid / expired authentication.
          */

          if (
            error.code ===
            "AUTH_INVALID"
          ) {
            clearAuthSession();

            setAuthState(
              "unauthenticated"
            );

            return;
          }

          /*
          Server/network unavailable.

          Do NOT clear the login merely
          because connectivity disappeared.

          But do NOT show protected CHRIS
          screens either.
          */

          setConnectionError(
            "CHRIS cannot connect to the server. Check your internet connection and try again."
          );

          setAuthState(
            "offline"
          );
        }
      };

    validateSession();

    /*
    Revalidate when connectivity
    changes while CHRIS is open.
    */

    const handleOnline =
      () => {
        if (active) {
          setAuthState(
            "checking"
          );

          setConnectionError(
            ""
          );

          validateSession();
        }
      };

    const handleOffline =
      () => {
        if (active) {
          setConnectionError(
            "CHRIS requires an active connection to the server."
          );

          setAuthState(
            "offline"
          );
        }
      };

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    return () => {
      active = false;

      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );
    };
  }, []);

  /*
  ============================================================
  CHECKING SESSION
  ============================================================
  */

  if (
    authState ===
    "checking"
  ) {
    return (
      <FullScreenMessage
        title="Connecting to CHRIS"
        message="Verifying your secure session..."
      />
    );
  }

  /*
  ============================================================
  OFFLINE / SERVER UNAVAILABLE
  ============================================================
  */

  if (
    authState ===
    "offline"
  ) {
    return (
      <FullScreenMessage
        title="CHRIS is unavailable offline"
        message={
          connectionError ||
          "An active connection to the CHRIS server is required."
        }
        showRetry
      />
    );
  }

  /*
  ============================================================
  NOT AUTHENTICATED
  ============================================================
  */

  if (
    authState ===
    "unauthenticated"
  ) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  /*
  ============================================================
  AUTHENTICATED
  ============================================================
  */

  return children;
}

function FullScreenMessage({
  title,
  message,
  showRetry = false,
}) {
  return (
    <div
      style={{
        minHeight:
          "100vh",

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "center",

        padding:
          "24px",

        background:
          "#F8FAFC",

        boxSizing:
          "border-box",
      }}
    >
      <div
        style={{
          width:
            "100%",

          maxWidth:
            "460px",

          padding:
            "28px",

          background:
            "#FFFFFF",

          border:
            "1px solid #E2E8F0",

          borderRadius:
            "16px",

          textAlign:
            "center",

          boxShadow:
            "0 12px 35px rgba(15,23,42,0.08)",
        }}
      >
        <div
          style={{
            width:
              "54px",

            height:
              "54px",

            margin:
              "0 auto 16px",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            borderRadius:
              "50%",

            background:
              "#ECFDF5",

            color:
              "#087A43",

            fontSize:
              "22px",

            fontWeight:
              "900",
          }}
        >
          CH
        </div>

        <h2
          style={{
            margin:
              "0 0 10px",

            color:
              "#087A43",

            fontSize:
              "22px",

            fontWeight:
              "800",
          }}
        >
          {title}
        </h2>

        <p
          style={{
            margin:
              0,

            color:
              "#64748B",

            fontSize:
              "14px",

            lineHeight:
              1.7,
          }}
        >
          {message}
        </p>

        {showRetry && (
          <button
            type="button"

            onClick={() =>
              window.location.reload()
            }

            style={{
              marginTop:
                "20px",

              padding:
                "11px 18px",

              border:
                "none",

              borderRadius:
                "9px",

              background:
                "#087A43",

              color:
                "#FFFFFF",

              fontSize:
                "13px",

              fontWeight:
                "800",

              cursor:
                "pointer",
            }}
          >
            Retry Connection
          </button>
        )}
      </div>
    </div>
  );
}

export default ProtectedRoute;
