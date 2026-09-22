import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  clearAuthSession,
  getAuthToken,
  verifyAuthSession,
} from "../../services/api";

const RETURN_TO_KEY = "chris_return_to";

function currentReturnTo() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
}

function rememberReturnTo() {
  if (typeof window === "undefined") return;
  const target = currentReturnTo();
  if (target !== "/" && !target.startsWith("/login")) {
    sessionStorage.setItem(RETURN_TO_KEY, target);
  }
}

function consumeReturnTo() {
  if (typeof window === "undefined") return "";
  const target = sessionStorage.getItem(RETURN_TO_KEY) || "";
  if (!target) return "";
  sessionStorage.removeItem(RETURN_TO_KEY);
  return target.startsWith("/") && !target.startsWith("//") ? target : "";
}

function ProtectedRoute({ children }) {
  const [authState, setAuthState] = useState("checking");
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    let active = true;

    const validateSession = async () => {
      const token = getAuthToken();
      if (!token) {
        if (active) setAuthState("unauthenticated");
        return;
      }

      if (navigator.onLine === false) {
        if (active) {
          setConnectionError("CHRIS requires an active connection to the server.");
          setAuthState("offline");
        }
        return;
      }

      try {
        await verifyAuthSession();
        if (active) {
          setConnectionError("");
          setAuthState("authenticated");
        }
      } catch (error) {
        if (!active) return;
        if (error.code === "AUTH_INVALID") {
          clearAuthSession();
          setAuthState("unauthenticated");
          return;
        }
        setConnectionError("CHRIS cannot connect to the server. Check your internet connection and try again.");
        setAuthState("offline");
      }
    };

    validateSession();

    const handleOnline = () => {
      if (!active) return;
      setAuthState("checking");
      setConnectionError("");
      validateSession();
    };
    const handleOffline = () => {
      if (!active) return;
      setConnectionError("CHRIS requires an active connection to the server.");
      setAuthState("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (authState === "checking") {
    return <FullScreenMessage title="Connecting to CHRIS" message="Verifying your secure session..." />;
  }

  if (authState === "offline") {
    return (
      <FullScreenMessage
        title="CHRIS is unavailable offline"
        message={connectionError || "An active connection to the CHRIS server is required."}
        showRetry
      />
    );
  }

  if (authState === "unauthenticated") {
    rememberReturnTo();
    return <Navigate to="/login" replace />;
  }

  if (authState === "authenticated" && currentReturnTo() === "/") {
    const returnTo = consumeReturnTo();
    if (returnTo && returnTo !== "/") {
      return <Navigate to={returnTo} replace />;
    }
  }

  return children;
}

function FullScreenMessage({ title, message, showRetry = false }) {
  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={markStyle}>CH</div>
        <h2 style={titleStyle}>{title}</h2>
        <p style={messageStyle}>{message}</p>
        {showRetry && (
          <button type="button" onClick={() => window.location.reload()} style={retryStyle}>
            Retry Connection
          </button>
        )}
      </div>
    </div>
  );
}

const screenStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#F8FAFC",
  boxSizing: "border-box",
};
const cardStyle = {
  width: "100%",
  maxWidth: 460,
  padding: 28,
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  textAlign: "center",
  boxShadow: "0 12px 35px rgba(15,23,42,0.08)",
};
const markStyle = {
  width: 54,
  height: 54,
  margin: "0 auto 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  background: "#ECFDF5",
  color: "#087A43",
  fontSize: 22,
  fontWeight: 900,
};
const titleStyle = { margin: "0 0 10px", color: "#087A43", fontSize: 22, fontWeight: 800 };
const messageStyle = { margin: 0, color: "#64748B", fontSize: 14, lineHeight: 1.7 };
const retryStyle = {
  marginTop: 20,
  padding: "11px 18px",
  border: "none",
  borderRadius: 9,
  background: "#087A43",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

export default ProtectedRoute;
