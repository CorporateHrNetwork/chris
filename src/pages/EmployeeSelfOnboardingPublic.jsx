import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../services/api";
import chrisLogo from "../assets/images/chris-logo.png";

export default function EmployeeSelfOnboardingPublic() {
  const { token } = useParams();
  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState({ fullName: "", phone: "", gender: "", nationalIdentificationNumber: "" });
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/api/public/employee-invitations/${encodeURIComponent(token)}`)
      .then((result) => { setInvite(result.data); setState("ready"); })
      .catch((err) => { setError(err.message || "This employee invitation is unavailable."); setState("error"); });
  }, [token]);

  useEffect(() => {
    if (state !== "complete" || !showSuccess) return undefined;

    const timer = window.setTimeout(() => {
      setShowSuccess(false);
      setMessage("");
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [state, showSuccess]);

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    try {
      setState("submitting");
      setError("");
      const result = await apiRequest(`/api/public/employee-invitations/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        body: form,
      });
      setMessage(result.message || "Your details were submitted securely.");
      setShowSuccess(true);
      setState("complete");
    } catch (err) {
      setError(err.message || "Unable to submit your details.");
      setState("ready");
    }
  };

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={brandWrap}>
          <img src={chrisLogo} alt="CHRiS" style={brandLogo} />
        </div>
        <div style={eyebrow}>SECURE EMPLOYEE SELF-ONBOARDING</div>
        <h1 style={title}>{invite?.organization?.name ? `Join ${invite.organization.name}` : "Employee Onboarding"}</h1>

        {state === "loading" && <p style={muted}>Validating your secure invitationâ€¦</p>}
        {state === "error" && <div role="alert" style={errorStyle}>{error}</div>}
        {state === "complete" ? (
          showSuccess ? (
            <div role="status" aria-live="polite" style={successStyle}>
              <strong>Submitted</strong>
              <p>{message}</p>
              <p>HR will review your details before creating your official employee record.</p>
            </div>
          ) : (
            <div style={{ color: "#DDFBEA", lineHeight: 1.6 }}>
              <strong>Your information has been received.</strong>
              <p>HR will review your submission before creating your official employee record.</p>
              <p>You may close this page.</p>
            </div>
          )
        ) : state !== "loading" && state !== "error" ? (
          <>
            <p style={muted}>This link is intended for <strong>{invite?.recipientEmail}</strong>. Complete only your own information. Your organization placement is controlled by HR.</p>
            <form onSubmit={submit} style={formStyle}>
              <Field label="Full name"><input required autoComplete="name" value={form.fullName} onChange={change("fullName")} /></Field>
              <Field label="Email"><input readOnly value={invite?.recipientEmail || ""} /></Field>
              <Field label="Phone number"><input required autoComplete="tel" value={form.phone} onChange={change("phone")} /></Field>
              <Field label="Gender"><select required value={form.gender} onChange={change("gender")}><option value="">Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option><option value="UNSPECIFIED">Prefer not to specify</option></select></Field>
              <Field label="NIN (optional)"><input inputMode="numeric" maxLength="11" value={form.nationalIdentificationNumber} onChange={change("nationalIdentificationNumber")} /></Field>
              {error && <div role="alert" style={errorStyle}>{error}</div>}
              <button type="submit" style={buttonStyle} disabled={state === "submitting"}>{state === "submitting" ? "Submittingâ€¦" : "Submit Securely"}</button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}

function Field({ label, children }) { return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>; }
const pageStyle = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "radial-gradient(circle at top,#0c5033,#02160e 58%)", color: "#F7FAF8" };
const cardStyle = { width: "min(560px,100%)", padding: 28, borderRadius: 20, border: "1px solid rgba(212,175,55,.62)", background: "rgba(3,27,18,.96)", boxShadow: "0 28px 80px rgba(0,0,0,.45)" };
const brandWrap = { display: "flex", alignItems: "center", minHeight: 48 };
const brandLogo = { display: "block", width: "min(150px,42%)", height: "auto", objectFit: "contain" };
const eyebrow = { marginTop: 16, color: "#2EE98B", fontSize: 10, fontWeight: 900, letterSpacing: ".15em" };
const title = { margin: "7px 0 12px", fontSize: 30 };
const muted = { color: "#C7D3CC", lineHeight: 1.6 };
const formStyle = { display: "grid", gap: 14, marginTop: 20 };
const fieldStyle = { display: "grid", gap: 6 };
const labelStyle = { color: "#D4AF37", fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const buttonStyle = { marginTop: 4, border: 0, borderRadius: 10, padding: "13px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const errorStyle = { padding: 12, borderRadius: 10, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.5)", background: "rgba(185,28,28,.14)" };
const successStyle = { padding: 17, borderRadius: 12, color: "#DDFBEA", border: "1px solid rgba(46,233,139,.45)", background: "rgba(46,233,139,.09)" };

