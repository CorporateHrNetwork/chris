import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../services/api";

export default function EmployeeExportQueue() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await apiRequest("/api/employee-data/exports");
      setJobs(result.data || []);
    } catch (err) {
      setError(err.message || "Unable to load employee exports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = async (job) => {
    try {
      setDownloading(job.id);
      setError("");
      saveDownloadedBlob(await apiDownload(`/api/employee-data/exports/${encodeURIComponent(job.id)}/download`));
    } catch (err) {
      setError(err.message || "Unable to download export.");
    } finally {
      setDownloading("");
    }
  };

  return (
    <section style={pageStyle}>
      <button type="button" style={backStyle} onClick={() => navigate("/employees/directory")}>← Employee Directory</button>
      <div style={headerStyle}>
        <div><div style={eyebrow}>EMPLOYEE DATA OPERATIONS</div><h1 style={title}>Queued Employee Reports</h1><p style={lead}>A tenant-scoped history of generated employee Excel reports.</p></div>
        <button type="button" style={secondaryButton} onClick={load} disabled={loading}>Refresh</button>
      </div>
      {error && <div role="alert" style={errorStyle}>{error}</div>}
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead><tr><th>Date created</th><th>Requested by</th><th>Scope</th><th>Type</th><th>Rows</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7">Loading employee exports…</td></tr> :
            jobs.length ? jobs.map((job) => (
              <tr key={job.id}>
                <td>{new Date(job.createdAt).toLocaleString()}</td>
                <td>{[job.requestedBy?.firstName, job.requestedBy?.lastName].filter(Boolean).join(" ") || job.requestedBy?.email || "-"}</td>
                <td>{job.filters?.includeExited ? "All employee records" : "Current workforce"}</td>
                <td>Excel</td>
                <td>{job.rowCount ?? "-"}</td>
                <td><span style={badge(job.status)}>{job.status}</span></td>
                <td>{job.status === "COMPLETED" ? <button type="button" style={secondaryButton} onClick={() => download(job)} disabled={downloading === job.id}>{downloading === job.id ? "Downloading…" : "Download"}</button> : "-"}</td>
              </tr>
            )) : <tr><td colSpan="7">No employee reports have been generated yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function badge(status) { const ok = status === "COMPLETED"; const bad = status === "FAILED"; return { display: "inline-block", padding: "4px 8px", borderRadius: 999, fontSize: 10, fontWeight: 900, background: ok ? "rgba(46,233,139,.15)" : bad ? "rgba(248,113,113,.14)" : "rgba(212,175,55,.15)", color: ok ? "#2EE98B" : bad ? "#FCA5A5" : "#D4AF37" }; }
const pageStyle = { maxWidth: 1250, margin: "0 auto", color: "var(--chris-text-main)" };
const backStyle = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 800, cursor: "pointer", padding: "0 0 16px" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const title = { margin: "7px 0", fontSize: 32 };
const lead = { color: "var(--chris-text-secondary)", margin: 0 };
const secondaryButton = { borderRadius: 9, padding: "9px 13px", background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)", fontWeight: 900, cursor: "pointer" };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.5)", background: "rgba(185,28,28,.14)" };
const tableWrap = { marginTop: 22, overflowX: "auto", border: "1px solid rgba(212,175,55,.45)", borderRadius: 13 };
const tableStyle = { width: "100%", minWidth: 900, borderCollapse: "collapse" };
