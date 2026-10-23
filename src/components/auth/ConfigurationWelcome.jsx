import { useState } from "react";

// Navigation only. The API remains responsible for organization membership.
export default function ConfigurationWelcome({ initialSlug, standardSlug, onContinue }) {
  const [path, setPath] = useState("");
  const [slug, setSlug] = useState(initialSlug || "");
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return (
    <section aria-labelledby="welcome-title" style={{ color: "#F7F8FA" }}>
      <h1 id="welcome-title">WELCOME TO CHRiS</h1>
      <p>Choose your path</p>
      <div style={{ display: "grid", gap: 12 }}>
        <button type="button" style={choiceStyle} disabled={!validSlug.test(standardSlug || "")}
          onClick={() => onContinue(standardSlug, "standard")}>
          CHRiS Standard Configuration
        </button>
        {!validSlug.test(standardSlug || "") && <p>Contact your administrator for standard workspace access.</p>}
        <button type="button" style={choiceStyle} onClick={() => setPath("custom")}>
          Custom Standards
        </button>
      </div>
      {path === "custom" && (
        <form onSubmit={(event) => {
          event.preventDefault();
          if (validSlug.test(slug.trim())) onContinue(slug.trim(), "custom");
        }} style={{ marginTop: 24 }}>
          <label htmlFor="workspace-slug">Organization workspace code</label>
          <input id="workspace-slug" value={slug} onChange={(event) => setSlug(event.target.value)}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} required
            pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100}
            style={{ width: "100%", boxSizing: "border-box", padding: 12, margin: "8px 0 12px" }} />
          <button type="submit" style={choiceStyle}>Continue to organization sign in</button>
        </form>
      )}
      <p style={{ lineHeight: 1.6 }}>Use the workspace code provided by your administrator. Your sign-in permissions determine access. Choosing a path does not change your organization’s settings.</p>
    </section>
  );
}

const choiceStyle = { padding: 14, borderRadius: 10, border: "1px solid #C89B2C", background: "#0B6B3A", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" };
