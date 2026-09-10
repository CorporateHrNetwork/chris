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
  const noEligibleRequisitions = !loading && (options.requisitions || []).length === 0;

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
      const payload = { ...form, openings: Number(form.openings) };
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
        const reason = window.prompt(
          `${action === "close" ? "Closure" : "Cancellation"} reason:`,
          ""
        );
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
    <div className="chris-vacancy-workspace" style={pageStyle}>
      <style>{`
        .chris-vacancy-workspace :is(input, select, textarea):focus-visible {
          outline: 2px solid var(--chris-gold) !important;
          outline-offset: 1px;
          border-color: var(--chris-gold) !important;
        }
        .chris-vacancy-workspace input::placeholder,
        .chris-vacancy-workspace textarea::placeholder {
          color: var(--chris-text-muted);
        }
        .chris-vacancy-workspace select option {
          background: var(--chris-green-darker);
          color: var(--chris-text-main);
        }
        .chris-vacancy-workspace button:disabled,
        .chris-vacancy-workspace select:disabled {
          opacity: .55;
          cursor: not-allowed !important;
        }
        @media (max-width: 720px) {
          .chris-vacancy-workspace { padding: 18px !important; }
        }
      `}</style>

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
              <h2 style={sectionTitleStyle}>
                {editingId ? "Update Draft Vacancy" : "Create from Approved Requisition"}
              </h2>
            </div>
            {editingId && (
              <button type="button" style={secondaryButtonStyle} onClick={resetForm}>
                <FaTimes /> Cancel Edit
              </button>
            )}
          </div>

          {!editingId && noEligibleRequisitions && (
            <div style={warningStyle}>
              <div>
                <strong>No approved/open job requisitions are available in this operating context.</strong>
                <div style={{ marginTop: 4 }}>
                  A vacancy can only be created after a Job Requisition has been submitted and approved/opened by Head Office.
                </div>
              </div>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => navigate("/recruitment?workspace=requisitions")}
              >
                Open Job Requisitions
              </button>
            </div>
          )}

          <div style={formGridStyle}>
            {!editingId && (
              <label style={labelStyle}>
                <span>Approved Job Requisition</span>
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
                  disabled={noEligibleRequisitions}
                  style={inputStyle}
                >
                  <option value="">
                    {noEligibleRequisitions ? "No approved/open requisitions available" : "Select approved/open requisition"}
                  </option>
                  {(options.requisitions || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.requisitionNumber} · {row.title} · {row.locationCode || row.locationName} · {row.requestedHeadcount} opening{row.requestedHeadcount === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={labelStyle}>
              <span>Vacancy Title</span>
              <input
                value={form.title}
                onChange={(event) => setField("title", event.target.value)}
                required
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span>Openings</span>
              <input
                type="number"
                min="1"
                max={selectedRequisition?.requestedHeadcount || undefined}
                value={form.openings}
                onChange={(event) => setField("openings", event.target.value)}
                required
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span>Opening Date</span>
              <input
                type="date"
                value={form.openingDate}
                onChange={(event) => setField("openingDate", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span>Closing Date</span>
              <input
                type="date"
                value={form.closingDate}
                onChange={(event) => setField("closingDate", event.target.value)}
                style={inputStyle}
              />
            </label>
          </div>

          <label style={labelStyle}>
            <span>Vacancy Summary</span>
            <textarea
              value={form.summary}
              onChange={(event) => setField("summary", event.target.value)}
              required
              rows={3}
              style={textareaStyle}
            />
          </label>

          <label style={labelStyle}>
            <span>Responsibilities</span>
            <textarea
              value={form.responsibilities}
              onChange={(event) => setField("responsibilities", event.target.value)}
              rows={4}
              style={textareaStyle}
            />
          </label>

          <label style={labelStyle}>
            <span>Requirements</span>
            <textarea
              value={form.requirements}
              onChange={(event) => setField("requirements", event.target.value)}
              required
              rows={4}
              style={textareaStyle}
            />
          </label>

          <button type="submit" style={primaryButtonStyle} disabled={saving || (!editingId && noEligibleRequisitions)}>
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
                <tr>
                  <td colSpan="7" style={emptyCellStyle}>
                    <FaBriefcase style={{ marginRight: 8 }} />
                    No vacancies in this operating context.
                  </td>
                </tr>
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
  const displayValue = typeof value === "number" ? value.toLocaleString("en-NG") : value;
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{displayValue ?? 0}</div>
    </div>
  );
}

function Status({ status }) {
  return <span style={statusStyle(status)}>{String(status || "").replaceAll("_", " ")}</span>;
}

const pageStyle = {
  padding: 24,
  display: "grid",
  gap: 18,
  color: "var(--chris-text-main)",
  fontFamily: "var(--chris-font-family)",
};
const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "flex-start",
  flexWrap: "wrap",
};
const headerActionsStyle = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const linkButtonStyle = {
  border: "none",
  background: "transparent",
  color: "var(--chris-gold)",
  fontWeight: 800,
  cursor: "pointer",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};
const eyebrowStyle = {
  marginTop: 10,
  color: "var(--chris-green-bright)",
  fontSize: "var(--chris-font-xs)",
  fontWeight: 900,
  letterSpacing: ".12em",
};
const titleStyle = {
  margin: "6px 0",
  fontSize: "var(--chris-font-2xl)",
  color: "var(--chris-text-main)",
  fontWeight: 900,
};
const subtitleStyle = {
  margin: 0,
  maxWidth: 760,
  color: "var(--chris-text-secondary)",
  lineHeight: 1.55,
};
const scopePillStyle = {
  padding: "8px 11px",
  borderRadius: "var(--chris-radius-pill)",
  background: "rgba(212,175,55,.08)",
  border: "1px solid var(--chris-border-gold)",
  color: "var(--chris-gold-bright)",
  fontSize: "var(--chris-font-xs)",
  fontWeight: 900,
};
const metricsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};
const metricStyle = {
  background: "linear-gradient(145deg, var(--chris-panel-bg), var(--chris-panel-bg-soft))",
  border: "1px solid var(--chris-border-gold)",
  borderRadius: "var(--chris-radius-card)",
  padding: 16,
  boxShadow: "var(--chris-shadow-soft)",
};
const metricLabelStyle = {
  fontSize: "var(--chris-font-xs)",
  fontWeight: 900,
  color: "var(--chris-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};
const metricValueStyle = {
  marginTop: 8,
  fontSize: 26,
  fontWeight: 900,
  color: "var(--chris-gold-bright)",
};
const panelStyle = {
  background: "linear-gradient(145deg, var(--chris-panel-bg), var(--chris-panel-bg-soft))",
  border: "1px solid var(--chris-border-gold)",
  borderRadius: "var(--chris-radius-card)",
  padding: 18,
  boxShadow: "var(--chris-shadow-card)",
  display: "grid",
  gap: 14,
};
const panelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  flexWrap: "wrap",
};
const sectionTitleStyle = {
  margin: "4px 0 0",
  fontSize: "var(--chris-font-xl)",
  color: "var(--chris-text-main)",
  fontWeight: 900,
};
const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};
const labelStyle = {
  display: "grid",
  gap: 7,
  fontSize: "var(--chris-font-sm)",
  fontWeight: 800,
  color: "var(--chris-text-secondary)",
};
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--chris-border-soft)",
  borderRadius: "var(--chris-radius-md)",
  padding: "10px 11px",
  font: "inherit",
  background: "var(--chris-input-bg)",
  color: "var(--chris-text-main)",
  colorScheme: "dark",
  minHeight: 42,
};
const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 92,
  lineHeight: 1.5,
};
const primaryButtonStyle = {
  justifySelf: "start",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: "var(--chris-radius-md)",
  padding: "10px 15px",
  background: "linear-gradient(135deg, var(--chris-gold), var(--chris-gold-bright))",
  color: "var(--chris-green-darker)",
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  boxShadow: "0 8px 22px rgba(212,175,55,.16)",
};
const secondaryButtonStyle = {
  border: "1px solid var(--chris-border-green)",
  borderRadius: "var(--chris-radius-md)",
  padding: "9px 12px",
  background: "rgba(8,122,67,.12)",
  color: "var(--chris-text-main)",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};
const warningStyle = {
  padding: 13,
  borderRadius: "var(--chris-radius-md)",
  border: "1px solid rgba(246,211,101,.28)",
  background: "rgba(246,211,101,.07)",
  color: "var(--chris-warning)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  fontSize: "var(--chris-font-sm)",
};
const errorStyle = {
  padding: 12,
  borderRadius: "var(--chris-radius-md)",
  border: "1px solid rgba(251,113,133,.25)",
  background: "rgba(251,113,133,.08)",
  color: "var(--chris-danger)",
  fontWeight: 700,
};
const successStyle = {
  padding: 12,
  borderRadius: "var(--chris-radius-md)",
  border: "1px solid rgba(52,211,153,.25)",
  background: "rgba(52,211,153,.08)",
  color: "var(--chris-success)",
  fontWeight: 700,
};
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900, color: "var(--chris-text-main)" };
const thStyle = {
  padding: "10px 9px",
  textAlign: "left",
  borderBottom: "1px solid var(--chris-border-gold)",
  fontSize: "var(--chris-font-xs)",
  color: "var(--chris-gold-soft)",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};
const tdStyle = {
  padding: "11px 9px",
  borderBottom: "1px solid var(--chris-border-soft)",
  verticalAlign: "top",
  fontSize: "var(--chris-font-sm)",
  color: "var(--chris-text-main)",
};
const subtleStyle = { marginTop: 4, color: "var(--chris-text-muted)", fontSize: "var(--chris-font-xs)" };
const emptyCellStyle = {
  ...tdStyle,
  textAlign: "center",
  padding: 28,
  color: "var(--chris-text-muted)",
};
const actionWrapStyle = { display: "flex", flexWrap: "wrap", gap: 6 };
const miniButtonStyle = {
  border: "1px solid var(--chris-border-green)",
  borderRadius: "var(--chris-radius-sm)",
  padding: "6px 8px",
  background: "rgba(8,122,67,.12)",
  color: "var(--chris-text-main)",
  fontSize: "var(--chris-font-xs)",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};
const miniDangerButtonStyle = {
  ...miniButtonStyle,
  color: "var(--chris-danger)",
  borderColor: "rgba(251,113,133,.28)",
  background: "rgba(251,113,133,.07)",
};
const statusStyle = (status) => ({
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: "var(--chris-radius-pill)",
  fontSize: 10,
  fontWeight: 900,
  border:
    status === "PUBLISHED"
      ? "1px solid rgba(52,211,153,.30)"
      : status === "DRAFT"
        ? "1px solid rgba(246,211,101,.30)"
        : "1px solid var(--chris-border-soft)",
  background:
    status === "PUBLISHED"
      ? "rgba(52,211,153,.10)"
      : status === "DRAFT"
        ? "rgba(246,211,101,.10)"
        : "rgba(255,255,255,.05)",
  color:
    status === "PUBLISHED"
      ? "var(--chris-success)"
      : status === "DRAFT"
        ? "var(--chris-warning)"
        : "var(--chris-text-secondary)",
});

export default RecruitmentVacancies;
