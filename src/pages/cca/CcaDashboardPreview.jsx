import React from "react";

/**
 * CRNetwork Central Agency preview.
 * Deliberately NOT registered in App routes, menus, or auth. It makes no API
 * requests and cannot change tenant records, subscriptions, or deployments.
 */
const FEATURES = [
  { title: "Central Service Desk", detail: "Cross-tenant support intake, triage and auditable resolutions", stage: "Existing CHRiS support foundation; CCA integration pending" },
  { title: "AI Agent Studio", detail: "Investigations, specialist agent tasks and human approval gates", stage: "Platform agent orchestration pending" },
  { title: "Client Registry", detail: "Verified customer profiles and scoped product access", stage: "Platform data model pending" },
  { title: "Subscriptions & Renewals", detail: "Entitlement verification and approval-gated activation", stage: "Read-only design only" },
  { title: "Software Release Control", detail: "Test results, release approvals and rollback records", stage: "Release registry pending" },
  { title: "Security & Audit", detail: "Platform identities, least-privilege and action history", stage: "Authorization prototype available" },
];

export default function CcaDashboardPreview() {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24, color: "#153527", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ background: "#0c4f34", color: "#fff", borderRadius: 16, padding: 26 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Corporate Resources Network</div>
        <h1 style={{ margin: "8px 0 4px", fontSize: 29 }}>CRNetwork Central Agency</h1>
        <p style={{ margin: 0 }}>CCA · AI Operations, Client Services & Platform Administration</p>
      </header>

      <section aria-label="Development status" style={{ background: "#fff8e6", border: "1px solid #c5a659", borderRadius: 12, padding: 16, marginTop: 20 }}>
        <strong>Unconnected development preview</strong>
        <p style={{ marginBottom: 0 }}>No tenant data is loaded. No live actions are available. Platform authentication, subscriptions, and release controls require separate implementation and approval.</p>
      </section>

      <section aria-label="CCA planned workspaces" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 20 }}>
        {FEATURES.map((feature) => (
          <article key={feature.title} style={{ background: "#fff", border: "1px solid #d6e4dc", borderRadius: 13, padding: 20 }}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>{feature.title}</h2>
            <p style={{ lineHeight: 1.5 }}>{feature.detail}</p>
            <small style={{ color: "#547163" }}>{feature.stage}</small>
          </article>
        ))}
      </section>

      <footer style={{ fontSize: 13, marginTop: 20, color: "#547163" }}>
        CCA is a separate platform control plane. Existing CHRiS client tenants remain independent.
      </footer>
    </main>
  );
}
