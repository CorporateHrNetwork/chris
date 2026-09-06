import { useMemo, useState } from "react";
import { apiRequest } from "../../services/api";
import { Notice, Panel, styles } from "./LeaveUi";

const currentYear = () => new Date().getFullYear();

export default function ZermattAnnualCarryoverPanel() {
  const [sourceYear, setSourceYear] = useState(currentYear());
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const targetYear = Number(sourceYear) + 1;
  const sourceClosed = useMemo(
    () => new Date() >= new Date(`${targetYear}-01-01T00:00:00`),
    [targetYear]
  );
  const q1ExpiredForTarget = useMemo(
    () => new Date() > new Date(`${targetYear}-03-31T23:59:59`),
    [targetYear]
  );

  async function loadPreview() {
    try {
      setBusy("preview");
      setError("");
      setMessage("");
      const result = await apiRequest(`/api/zermatt/leave-carryover/preview?sourceYear=${encodeURIComponent(sourceYear)}`);
      setPreview(result?.data || null);
    } catch (requestError) {
      setError(requestError?.message || "Unable to preview Annual Leave carryover.");
    } finally {
      setBusy("");
    }
  }

  async function applyCarryover() {
    const confirmed = window.confirm(
      `Carry unused ${sourceYear} Annual Leave balances into ${targetYear}? Pending source-year Annual Leave requests must be resolved first. Carryover expires after 31 March ${targetYear}.`
    );
    if (!confirmed) return;
    try {
      setBusy("apply");
      setError("");
      setMessage("");
      const result = await apiRequest("/api/zermatt/leave-carryover/apply", {
        method: "POST",
        body: { sourceYear: Number(sourceYear) },
      });
      setMessage(result?.message || "Annual Leave carryover applied.");
      await loadPreview();
    } catch (requestError) {
      setError(requestError?.message || "Unable to apply Annual Leave carryover.");
    } finally {
      setBusy("");
    }
  }

  async function forfeitExpired() {
    const confirmed = window.confirm(
      `Forfeit unused carryover remaining after 31 March ${targetYear}? This preserves Annual Leave already used in Q1 and removes only the unused carryover balance.`
    );
    if (!confirmed) return;
    try {
      setBusy("forfeit");
      setError("");
      setMessage("");
      const result = await apiRequest("/api/zermatt/leave-carryover/forfeit-expired", {
        method: "POST",
        body: { leaveYear: targetYear },
      });
      setMessage(result?.message || "Expired carryover processed.");
    } catch (requestError) {
      setError(requestError?.message || "Unable to process expired carryover.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel
      title="Annual Leave Carryover"
      subtitle="ZERMATT policy: unused Annual Leave may be carried into the next operational year. Carryover is consumed first and must be used by 31 March or forfeited."
    >
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}

      <div style={controls}>
        <label style={field}>
          <span>Source Leave Year</span>
          <input
            style={styles.input}
            type="number"
            min="2000"
            max="2200"
            value={sourceYear}
            onChange={(event) => {
              setSourceYear(Number(event.target.value));
              setPreview(null);
              setError("");
              setMessage("");
            }}
          />
        </label>
        <div style={yearCard}>
          <span style={styles.muted}>Target Operational Year</span>
          <strong>{targetYear}</strong>
        </div>
        <button type="button" style={styles.button} disabled={Boolean(busy)} onClick={loadPreview}>
          {busy === "preview" ? "Loading…" : "Preview Carryover"}
        </button>
        <button
          type="button"
          style={{ ...styles.primary, opacity: sourceClosed ? 1 : 0.5 }}
          disabled={Boolean(busy) || !sourceClosed}
          title={sourceClosed ? "" : `Available after ${sourceYear} operational year closes.`}
          onClick={applyCarryover}
        >
          Carry Forward to {targetYear}
        </button>
        <button
          type="button"
          style={{ ...styles.button, opacity: q1ExpiredForTarget ? 1 : 0.5 }}
          disabled={Boolean(busy) || !q1ExpiredForTarget}
          title={q1ExpiredForTarget ? "" : `Unused carryover can only be forfeited after 31 March ${targetYear}.`}
          onClick={forfeitExpired}
        >
          Forfeit Expired Carryover
        </button>
      </div>

      <div style={ruleBox}>
        <strong>Balance rule:</strong> Target-year Available Annual Leave = Current-year entitlement + Carryover B/F + adjustments − used/committed leave. Q1 Annual Leave consumes Carryover B/F first. Any carryover still unused after 31 March is removed by an audited forfeiture adjustment; the current-year entitlement remains available.
      </div>

      {preview && (
        <div style={{ marginTop: 14 }}>
          <div style={summaryGrid}>
            <Summary label="Employees Reviewed" value={preview.summary?.employees || 0} />
            <Summary label="Ready to Carry" value={preview.summary?.ready || 0} />
            <Summary label="Pending Review Blockers" value={preview.summary?.blocked || 0} />
            <Summary label="Total Carryable Days" value={Number(preview.summary?.totalCarryable || 0).toLocaleString()} />
            <Summary label="Use-by Date" value={`31 Mar ${preview.targetYear}`} />
          </div>
          {preview.summary?.blocked > 0 && (
            <Notice error>
              Resolve pending Annual Leave requests before closing the source-year carryover. CHRiS will not guess whether a pending request should consume or carry forward the balance.
            </Notice>
          )}
        </div>
      )}
    </Panel>
  );
}

function Summary({ label, value }) {
  return (
    <div style={summaryCard}>
      <span style={styles.muted}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const controls = { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" };
const field = { display: "grid", gap: 6, minWidth: 160 };
const yearCard = { display: "grid", gap: 5, padding: "8px 12px", minWidth: 150, border: "1px solid rgba(212,175,55,.25)", borderRadius: 10 };
const ruleBox = { marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,.04)", color: "var(--chris-text-secondary)", lineHeight: 1.55, fontSize: 12 };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 };
const summaryCard = { display: "grid", gap: 4, padding: 10, border: "1px solid rgba(212,175,55,.2)", borderRadius: 10, background: "rgba(255,255,255,.03)" };
