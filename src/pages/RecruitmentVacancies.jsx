import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaBriefcase,
  FaCheck,
  FaEdit,
  FaPlus,
  FaSyncAlt,
  FaTimes,
} from "react-icons/fa";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

const EMPTY_FORM = {
  requisitionId: "",
  title: "",
  openings: 1,
  summary: "",
  responsibilities: "",
  requirements: "",
  openingDate: "",
  closingDate: "",
};

function RecruitmentVacancies() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthorization();
  const canManage = hasPermission("recruitment.manage");
  const [vacancies, setVacancies] = useState([]);
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState({ scope: null, requisitions: [] });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [listResult, summaryResult, optionResult] = await Promise.all([
        apiRequest("/api/recruitment/vacancies"),
        apiRequest("/api/recruitment/vacancies/summary"),
        apiRequest("/api/recruitment/vacancies/options"),
      ]);
      setVacancies(listResult?.data || []);
      setSummary(summaryResult?.data || null);
      setOptions(optionResult?.data || { scope: null, requisitions: [] });
    } catch (err) {
      setError(err?.message || "Unable to load vacancies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handleLocationChange = () => {
      setEditingId(null);
      setForm(EMPTY_FORM);
      load();
    };
    window.addEventListener("chris:location-context-changed", handleLocationChange);
    return () => window.removeEventListener("chris:location-context-changed", handleLocationChange);
  }, [load]);

  const headOffice = options?.scope?.mode === "HEAD_OFFICE_CONSOLIDATED";
  const selectedRequisition = useMemo(
    () => options.requisitions?.find((row) => row.id === form.requisitionId) || null,
    [options.requisitions, form.requisitionId]
  );

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const payload = {
        ...form,
        openings: Number(form.openings),
      };
      const result = await apiRequest(
        editingId ? `/api/recruitment/vacancies/${editingId}` : "/api/recruitment/vacancies",
        {
          method: editingId ? "PATCH" : "POST",
          body: payload,
        }
      );
      setMessage(result?.message || "Vacancy saved.");
      resetForm();
      await load();
    } catch (err) {
      setError(err?.message || "Unable to save vacancy.");
    } finally {
      setSaving(false);
    }
  };

  const act = async (vacancy, action) => {
    try {
      let body = {};
      if (action === "close" || action === "cancel") {
        const reason = window.prompt(`${action === "close" ? "Closure" : "Cancellation"} reason:`, "");
        if (reason === null) return;
        body = { reason };
      }
      setSaving(true);
      setError("");
      setMessage("");
      const result = await apiRequest(`/api/recruitment/vacancies/${vacancy.id}/${action}`, {
        method: "POST",
        body,
      });
      setMessage(result?.message || "Vacancy updated.");
      await load();
    } catch (err) {
      setError(err?.message || "Unable to update vacancy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <button type="button" style={linkButtonStyle} onClick={() => navigate("/recruitment")}>
            <FaArrowLeft /> Recruitment Dashboard
          </button>
          <div style={eyebrowStyle}>RECRUITMENT · VACANCIES</div>
          <h1 style={titleStyle}>Vacancies</h1>
          <p style={subtitleStyle}>
            Create controlled vacancy records only from approved/open job requisitions, then publish them through Head Office.
          </p>
        </div>
        <div style={headerActionsStyle}>
          <span style={scopePillStyle}>
            {headOffice
              ? "HEAD OFFICE · CONSOLIDATED"
              : `${options?.scope?.locationName || "BRANCH"}${options?.scope?.locationCode ? ` · ${options.scope.locationCode}` : ""}`}
          </span>
          <button type="button" style={secondaryButtonStyle} onClick={load} disabled={loading || saving}>
            <FaSyncAlt /> Refresh
          </button>
        </div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {message && <div style={successStyle}>{message}</div>}

      <div style={metricsStyle}>
        <Metric label="Total Vacancies" value={loading ? "…" : summary?.total || 0} />
        <Metric label="Draft" value={loading ? "…" : summary?.draft || 0} />
        <Metric label="Published" value={loading ? "…" : summary?.published || 0} />
        <Metric label="Published Openings" value={loading ? "…" : summary?.publishedOpenings || 0} />
      </div>

      {canManage && (
        <form onSubmit={save} style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={eyebrowStyle}>{editingId ? "EDIT DRAFT" : "CREATE VACANCY"}</div>
              <h2 style={sectionTitleStyle}>{editingId ? "Update Draft Vacancy" : "Create from Approved Requisition"}</h2>
            </div>
            {editingId && (
              <button type="button" style={secondaryButtonStyle} onClick={resetForm}>
                <FaTimes /> Cancel Edit
              </button>
            )}
          </div>

          <div style={formGridStyle}>
            {!editingId && (
              <label style={labelStyle}>
                Approved Job Requisition
                <select
                  value={form.requisitionId}
                  onChange={(event) => {
                    const requisitionId = event.target.value;
                    const row = options.requisitions?.find((item) => item.id === requisitionId);
                    setForm((current) => ({
                      ...current,
                      requisitionId,
                      title: row?.title || "",
                      openings: row?.requestedHeadcount || 1,
                    }));
                  }}
                  required
                  style={inputStyle}
                >
                  <option value="">Select approved/open requisition</option>
                  {(options.requisitions || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.requisitionNumber} · {row.title} · {row.locationCode || row.locationName} · {row.requestedHeadcount} opening{row.requestedHeadcount === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={labelStyle}>
              Vacancy Title
              <input value={form.title} onChange={(e) => setField("title", e.target.value)} required style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Openings
              <input
                type="number"
                min="1"
                max={selectedRequisition?.requestedHeadcount || undefined}
                value={form.openings}
                onChange={(e) => setField("openings", e.target.value)}
                required
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Opening Date
              <input type="date" value={form.openingDate} onChange={(e) => setField("openingDate", e.target.value)} style={inputStyle} />
            </label>

            <label style={labelStyle}>
              Closing Date
              <input type="date" value={form.closingDate} onChange={(e) => setField("closingDate", e.target.value)} style={inputStyle} />
            </label>
          </div>

          <label style={labelStyle}>
            Vacancy Summary
            <textarea value={form.summary} onChange={(e) => setField("summary", e.target.value)} required rows={3} style={textareaStyle} />
          </label>

          <label style={labelStyle}>
            Responsibilities
            <textarea value={form.responsibilities} onChange={(e) => setField("responsibilities", e.target.value)} rows={4} style={textareaStyle} />
          </label>

          <label style={labelStyle}>
            Requirements
            <textarea value={form.requirements} onChange={(e) => setField("requirements", e.target.value)} required rows={4} style={textareaStyle} />
          </label>

          <button type="submit" style={primaryButtonStyle} disabled={saving}>
            {editingId ? <FaCheck /> : <FaPlus />} {saving ? "Saving…" : editingId ? "Save Changes" : "Create Draft Vacancy"}
          </button>
        </form>
      )}

      <div style={panelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <div style={eyebrowStyle}>VACANCY REGISTER</div>
            <h2 style={sectionTitleStyle}>Current Vacancies</h2>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Vacancy</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Branch</th>
                <th style={thStyle}>Openings</th>
                <th style={thStyle}>Dates</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && vacancies.length === 0 && (
                <tr><td colSpan="7" style={emptyCellStyle}>No vacancies in this operating context.</td></tr>
              )}
              {vacancies.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <strong>{row.vacancyNumber}</strong>
                    <div style={subtleStyle}>{row.requisitionNumber}</div>
                  </td>
                  <td style={tdStyle}>
                    <strong>{row.title}</strong>
                    <div style={subtleStyle}>{row.employmentType}</div>
                  </td>
                  <td style={tdStyle}>{row.locationCode || row.locationName}</td>
                  <td style={tdStyle}>{row.openings}</td>
                  <td style={tdStyle}>
                    <div>{row.openingDate || "—"}</div>
                    <div style={subtleStyle}>Close: {row.closingDate || "—"}</div>
                  </td>
                  <td style={tdStyle}><Status status={row.status} /></td>
                  <td style={tdStyle}>
                    <div style={actionWrapStyle}>
                      {canManage && row.status === "DRAFT" && (
                        <button
                          type="button"
                          style={miniButtonStyle}
                          onClick={() => {
                            setEditingId(row.id);
                            setForm({
                              requisitionId: row.requisitionId,
                              title: row.title || "",
                              openings: row.openings || 1,
                              summary: row.summary || "",
                              responsibilities: row.responsibilities || "",
                              requirements: row.requirements || "",
                              openingDate: row.openingDate || "",
                              closingDate: row.closingDate || "",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <FaEdit /> Edit
                        </button>
                      )}
                      {canManage && headOffice && row.status === "DRAFT" && (
                        <button type="button" style={miniButtonStyle} onClick={() => act(row, "publish")}>
                          <FaCheck /> Publish
                        </button>
                      )}
                      {canManage && row.status === "DRAFT" && (
                        <button type="button" style={miniDangerButtonStyle} onClick={() => act(row, "cancel")}>
                          <FaTimes /> Cancel
                        </button>
                      )}
                      {canManage && headOffice && row.status === "PUBLISHED" && (
                        <button type="button" style={miniDangerButtonStyle} onClick={() => act(row, "close")}>
                          Close
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{Number(value || 0).toLocaleString("en-NG")}</div>
    </div>
  );
}

function Status({ status }) {
  return <span style={statusStyle(status)}>{String(status || "").replaceAll("_", " ")}</span>;
}

const pageStyle = { padding: 24, display: "grid", gap: 18, color: "var(--chris-dashboard-text, #10231A)" };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" };
const headerActionsStyle = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const linkButtonStyle = { border: "none", background: "transparent", color: "var(--chris-green, #087A43)", fontWeight: 800, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 7 };
const eyebrowStyle = { marginTop: 10, color: "var(--chris-green, #087A43)", fontSize: 11, fontWeight: 900, letterSpacing: ".12em" };
const titleStyle = { margin: "6px 0", fontSize: 30 };
const subtitleStyle = { margin: 0, maxWidth: 760, color: "#617168" };
const scopePillStyle = { padding: "8px 11px", borderRadius: 999, background: "rgba(8,122,67,.10)", color: "#087A43", fontSize: 11, fontWeight: 900 };
const metricsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 };
const metricStyle = { background: "#fff", border: "1px solid #E4EBE7", borderRadius: 12, padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,.04)" };
const metricLabelStyle = { fontSize: 11, fontWeight: 800, color: "#728078", textTransform: "uppercase" };
const metricValueStyle = { marginTop: 8, fontSize: 26, fontWeight: 900 };
const panelStyle = { background: "#fff", border: "1px solid #E4EBE7", borderRadius: 14, padding: 18, boxShadow: "0 6px 20px rgba(0,0,0,.04)", display: "grid", gap: 14 };
const panelHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" };
const sectionTitleStyle = { margin: "4px 0 0", fontSize: 20 };
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const labelStyle = { display: "grid", gap: 6, fontSize: 12, fontWeight: 800 };
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #CBD8D1", borderRadius: 8, padding: "10px 11px", font: "inherit", background: "#fff" };
const textareaStyle = { ...inputStyle, resize: "vertical" };
const primaryButtonStyle = { justifySelf: "start", border: "none", borderRadius: 8, padding: "10px 14px", background: "#087A43", color: "#fff", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 };
const secondaryButtonStyle = { border: "1px solid #CBD8D1", borderRadius: 8, padding: "9px 12px", background: "#fff", color: "#264437", fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 };
const errorStyle = { padding: 12, borderRadius: 8, background: "#FFF1F1", color: "#9A2626", fontWeight: 700 };
const successStyle = { padding: 12, borderRadius: 8, background: "#EDF9F2", color: "#176B3A", fontWeight: 700 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { padding: "10px 9px", textAlign: "left", borderBottom: "1px solid #DDE7E1", fontSize: 11, color: "#6F7F76", textTransform: "uppercase" };
const tdStyle = { padding: "11px 9px", borderBottom: "1px solid #EEF3F0", verticalAlign: "top", fontSize: 12 };
const subtleStyle = { marginTop: 4, color: "#7D8A83", fontSize: 11 };
const emptyCellStyle = { ...tdStyle, textAlign: "center", padding: 28, color: "#7D8A83" };
const actionWrapStyle = { display: "flex", flexWrap: "wrap", gap: 6 };
const miniButtonStyle = { border: "1px solid #C7D6CE", borderRadius: 7, padding: "6px 8px", background: "#fff", color: "#21513A", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 };
const miniDangerButtonStyle = { ...miniButtonStyle, color: "#8D2B2B", borderColor: "#E7C6C6" };
const statusStyle = (status) => ({
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  background: status === "PUBLISHED" ? "#E7F6ED" : status === "DRAFT" ? "#FFF7DB" : "#EEF2F0",
  color: status === "PUBLISHED" ? "#176B3A" : status === "DRAFT" ? "#80630B" : "#59665F",
});

export default RecruitmentVacancies;
