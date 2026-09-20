import React from "react";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidMount() {
    window.__CHRIS_MARK_BOOT_COMPLETE__?.();
  }

  componentDidCatch(error, info) {
    console.error("CHRiS frontend runtime failure", error, info);
    window.__CHRIS_MARK_BOOT_COMPLETE__?.();
  }

  reload = () => {
    window.__CHRIS_RETRY_BOOT__?.();
  };

  login = () => {
    window.location.assign("/login");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={screenStyle} role="alert">
        <div style={cardStyle}>
          <div style={markStyle}>CH</div>
          <h1 style={titleStyle}>CHRiS could not open this screen</h1>
          <p style={messageStyle}>
            The application encountered a browser-side error while loading this workspace. Reload CHRiS to obtain the latest deployed bundle.
          </p>
          <div style={buttonRowStyle}>
            <button type="button" style={primaryButtonStyle} onClick={this.reload}>Reload CHRiS</button>
            <button type="button" style={secondaryButtonStyle} onClick={this.login}>Return to Login</button>
          </div>
        </div>
      </div>
    );
  }
}

const screenStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  boxSizing: "border-box",
  background: "#07110C",
  color: "#F7FAF8",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: 520,
  padding: 30,
  borderRadius: 16,
  border: "1px solid rgba(212,175,55,.45)",
  background: "linear-gradient(145deg,#083221,#03140D)",
  boxShadow: "0 18px 46px rgba(0,0,0,.28)",
  textAlign: "center",
};

const markStyle = {
  width: 58,
  height: 58,
  margin: "0 auto 16px",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  background: "#D4AF37",
  color: "#07140D",
  fontWeight: 900,
  fontSize: 21,
};

const titleStyle = { margin: "0 0 10px", color: "#D4AF37", fontSize: 24 };
const messageStyle = { margin: 0, color: "#C7D3CC", lineHeight: 1.65, fontSize: 14 };
const buttonRowStyle = { marginTop: 22, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" };
const primaryButtonStyle = { padding: "11px 18px", border: 0, borderRadius: 9, background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle = { ...primaryButtonStyle, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.5)" };

export default AppErrorBoundary;
