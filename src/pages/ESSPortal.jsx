import { useEffect, useState } from "react";
import {
  API_BASE_URL,
  clearEssAuthSession,
  essRequest,
  getEssAuthToken,
} from "../services/api";

const ORGANIZATION_SLUG = "zermatt-liquor-limited";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function display(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

export default function ESSPortal() {
  const [authenticated, setAuthenticated] = useState(Boolean(getEssAuthToken()));
  const [employee, setEmployee] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(Boolean(getEssAuthToken()));
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!getEssAuthToken()) {
      setLoading(false);
      return;
    }

    let active = true;
    essRequest("/api/ess/me")
      .then((result) => {
        if (!active) return;
        setEmployee(result?.data?.employee || null);
        setOrganization(result?.data?.organization || null);
        setAuthenticated(true);
      })
      .catch(() => {
        if (!active) return;
        setAuthenticated(false);
        setEmployee(null);
        setOrganization(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const result = await essRequest("/api/ess/login", {
        method: "POST",
        body: {
          email,
          password,
          organizationSlug: ORGANIZATION_SLUG,
        },
      });

      const token = result?.data?.token;
      if (!token) throw new Error("Employee portal authentication was not returned by the server.");

      localStorage.setItem("chris_ess_token", token);
      localStorage.setItem("chris_ess_employee", JSON.stringify(result.data.employee || {}));
      localStorage.setItem("chris_ess_organization", JSON.stringify(result.data.organization || {}));

      const profile = await essRequest("/api/ess/me");
      setEmployee(profile?.data?.employee || null);
      setOrganization(profile?.data?.organization || result.data.organization || null);
      setAuthenticated(true);
      setEmail("");
      setPassword("");
    } catch (error) {
      setMessage(error.message || "Unable to sign in to the employee portal.");
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    clearEssAuthSession();
    setAuthenticated(false);
    setEmployee(null);
    setOrganization(null);
    setMessage("");
    setPassword("");
  };

  if (loading && !employee && authenticated) {
    return <PortalShell><LoadingState /></PortalShell>;
  }

  if (!authenticated) {
    return (
      <PortalShell>
        <section style={cardStyle}>
          <div style={eyebrowStyle}>ZERMATT LIQUOR LIMITED</div>
          <h1 style={headingStyle}>Employee Self-Service</h1>
          <p style={subheadingStyle}>
            Sign in to your personal CHRiS employee portal. Your access is limited to your own employee record.
          </p>

          {message && (
            <div role="alert" style={errorStyle}>{message}</div>
          )}

          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label style={labelStyle}>
              Employee email
              <input
                required
                autoComplete="username"
                type="email"
                placeholder="Enter the email registered in CHRiS"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Password
              <input
                required
                autoComplete="current-password"
                type="password"
                placeholder="Enter your CHRiS employee portal password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={inputStyle}
              />
            </label>

            <button disabled={loading} type="submit" style={{ ...buttonStyle, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in…" : "Sign in to my portal"}
            </button>
          </form>

          <div style={securityNoteStyle}>
            <strong>Private employee access</strong>
            <span>This page does not provide access to the CHRiS administration system or other employees' records.</span>
          </div>
          <div style={footerStyle}>Powered by CHRiS • Corporate Resources Network</div>
        </section>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <section style={profileCardStyle}>
        <div style={topBarStyle}>
          <div>
            <div style={eyebrowStyle}>{organization?.name || "ZERMATT LIQUOR LIMITED"}</div>
            <h1 style={{ ...headingStyle, marginBottom: 4 }}>My Employee Portal</h1>
            <p style={{ ...subheadingStyle, marginBottom: 0 }}>
              Welcome, {display(employee?.firstName)}. This is your private CHRiS profile.
            </p>
          </div>
          <button type="button" onClick={signOut} style={signOutStyle}>Sign out</button>
        </div>

        <div style={profileHeroStyle}>
          <div style={avatarStyle}>
            {String(employee?.firstName || "E").charAt(0).toUpperCase()}
            {String(employee?.lastName || "").charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#073B24" }}>
              {[employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ")}
            </div>
            <div style={{ marginTop: 4, color: "#64748B", fontWeight: 700 }}>
              Employee No. {display(employee?.employeeNumber)}
            </div>
          </div>
          <div style={statusPillStyle}>{display(employee?.status)}</div>
        </div>

        <Section title="Personal Information">
          <Info label="Email address" value={employee?.email} />
          <Info label="Phone number" value={employee?.phone} />
          <Info label="Gender" value={employee?.gender} />
        </Section>

        <Section title="Employment Information">
          <Info label="Department" value={employee?.department?.name} />
          <Info label="Designation" value={employee?.designation?.name} />
          <Info label="Employment type" value={employee?.employmentType} />
          <Info label="Location / Branch" value={employee?.location?.name} />
          <Info label="Cost centre" value={employee?.costCentre?.name} />
          <Info label="Date employed" value={formatDate(employee?.hireDate)} />
          <Info label="Confirmation date" value={formatDate(employee?.confirmationDate)} />
        </Section>

        <div style={privacyBannerStyle}>
          <strong>Your data is scoped to you.</strong>
          <span>The portal obtains your employee ID from your authenticated account. It does not accept an employee number in the URL, so changing URLs cannot switch the profile to another employee.</span>
        </div>

        <div style={footerStyle}>CHRiS Employee Self-Service • {API_BASE_URL ? "Secure API connection" : "Secure CHRiS connection"}</div>
      </section>
    </PortalShell>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={infoGridStyle}>{children}</div>
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div style={infoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{display(value)}</div>
    </div>
  );
}

function PortalShell({ children }) {
  return (
    <main style={shellStyle}>
      <div style={brandMarkStyle}>CH</div>
      {children}
    </main>
  );
}

function LoadingState() {
  return (
    <section style={{ ...cardStyle, textAlign: "center" }}>
      <div style={brandMarkStyle}>CH</div>
      <h1 style={headingStyle}>Opening your portal…</h1>
      <p style={subheadingStyle}>Verifying your secure employee session.</p>
    </section>
  );
}

const shellStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "48px 20px",
  boxSizing: "border-box",
  background: "linear-gradient(135deg, #F4F8F6 0%, #EEF3F0 100%)",
  fontFamily: "Inter, Arial, Helvetica, sans-serif",
  color: "#0F172A",
};

const cardStyle = {
  width: "min(480px, 100%)",
  boxSizing: "border-box",
  background: "#FFFFFF",
  border: "1px solid #DDE8E1",
  borderRadius: 20,
  padding: 32,
  boxShadow: "0 18px 50px rgba(7, 59, 36, 0.10)",
};

const profileCardStyle = {
  ...cardStyle,
  width: "min(980px, 100%)",
  padding: 34,
};

const brandMarkStyle = {
  width: 54,
  height: 54,
  marginBottom: 16,
  display: "grid",
  placeItems: "center",
  borderRadius: 14,
  background: "#087A43",
  color: "#F7D66A",
  fontWeight: 950,
  fontSize: 18,
  boxShadow: "0 8px 22px rgba(8, 122, 67, 0.18)",
};

const eyebrowStyle = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1.25,
  color: "#087A43",
  textTransform: "uppercase",
};

const headingStyle = {
  margin: "7px 0 8px",
  color: "#073B24",
  fontSize: 30,
  lineHeight: 1.15,
  fontWeight: 950,
};

const subheadingStyle = {
  margin: "0 0 24px",
  color: "#64748B",
  fontSize: 14,
  lineHeight: 1.65,
};

const labelStyle = {
  display: "grid",
  gap: 7,
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  outline: "none",
  fontSize: 14,
  color: "#0F172A",
  background: "#FFFFFF",
};

const buttonStyle = {
  width: "100%",
  border: 0,
  borderRadius: 10,
  padding: "13px 16px",
  background: "#087A43",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
};

const errorStyle = {
  marginBottom: 16,
  padding: "11px 12px",
  borderRadius: 10,
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#991B1B",
  fontSize: 13,
  lineHeight: 1.5,
};

const securityNoteStyle = {
  display: "grid",
  gap: 4,
  marginTop: 22,
  padding: 13,
  borderRadius: 10,
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  color: "#166534",
  fontSize: 12,
  lineHeight: 1.55,
};

const footerStyle = {
  marginTop: 22,
  textAlign: "center",
  color: "#94A3B8",
  fontSize: 11,
};

const topBarStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 20,
  flexWrap: "wrap",
};

const signOutStyle = {
  border: "1px solid #CBD5E1",
  borderRadius: 9,
  background: "#FFFFFF",
  color: "#334155",
  padding: "9px 13px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const profileHeroStyle = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  marginTop: 26,
  padding: 18,
  borderRadius: 14,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
};

const avatarStyle = {
  width: 58,
  height: 58,
  flex: "0 0 58px",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  background: "#087A43",
  color: "#F7D66A",
  fontWeight: 950,
  fontSize: 17,
};

const statusPillStyle = {
  marginLeft: "auto",
  padding: "7px 11px",
  borderRadius: 999,
  background: "#DCFCE7",
  color: "#166534",
  fontSize: 11,
  fontWeight: 900,
};

const sectionTitleStyle = {
  margin: "0 0 12px",
  color: "#073B24",
  fontSize: 15,
  fontWeight: 900,
};

const infoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const infoItemStyle = {
  padding: 13,
  borderRadius: 10,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
};

const infoLabelStyle = {
  color: "#94A3B8",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const infoValueStyle = {
  marginTop: 5,
  color: "#1E293B",
  fontSize: 13,
  fontWeight: 700,
  wordBreak: "break-word",
};

const privacyBannerStyle = {
  display: "grid",
  gap: 4,
  marginTop: 26,
  padding: 14,
  borderRadius: 10,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#475569",
  fontSize: 12,
  lineHeight: 1.55,
};

