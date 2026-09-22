import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FaBriefcase,
  FaUsers,
  FaUserCheck,
  FaCalendarCheck,
  FaFileSignature,
  FaBullhorn,
  FaClipboardList,
  FaHandshake,
  FaArrowLeft,
  FaPlus,
  FaSyncAlt,
  FaPaperPlane,
  FaEdit,
  FaTimes,
  FaCheck,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

const EMPTY_FORM = {
  locationId: "",
  designationId: "",
  employmentType: "Full-Time",
  requestedHeadcount: 1,
  targetStartDate: "",
  reason: "",
};

function Recruitment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = String(searchParams.get("workspace") || "dashboard").toLowerCase();
  const { hasPermission } = useAuthorization();
  const canManage = hasPermission("recruitment.manage");

  const [summary, setSummary] = useState(null);
  const [requisitions, setRequisitions] = useState([]);
  const [options, setOptions] = useState({
    scope: null,
    locations: [],
    designations: [],
    employmentTypes: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [summaryResult, requisitionResult, optionResult] = await Promise.all([
        apiRequest("/api/recruitment/summary"),
        apiRequest("/api/recruitment/requisitions"),
        apiRequest("/api/recruitment/options"),
      ]);
      const nextOptions = optionResult?.data || {};
      setSummary(summaryResult?.data || null);
      setRequisitions(requisitionResult?.data || []);
      setOptions({
        scope: nextOptions.scope || null,
        locations: nextOptions.locations || [],
        designations: nextOptions.designations || [],
        employmentTypes: nextOptions.employmentTypes || [],
      });
      setForm((current) => ({
        ...current,
        locationId:
          current.locationId ||
          (nextOptions.locations?.length === 1 ? nextOptions.locations[0].id : ""),
      }));
    } catch (err) {
      setError(err?.message || "Unable to load Recruitment.");
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

  const latestActivity = useMemo(
    () =>
      requisitions.slice(0, 4).map((row) => ({
        id: row.id,
        icon: <FaBriefcase />,
        title: `${row.requisitionNumber} · ${row.title}`,
        description: `${row.locationCode || row.locationName || "Branch"} · ${row.requestedHeadcount} position${row.requestedHeadcount === 1 ? "" : "s"} · ${friendly(row.status)}`,
        time: formatDate(row.createdAt),
        tone: row.status === "OPEN" ? "success" : row.status === "PENDING_APPROVAL" ? "warning" : "neutral",
      })),
    [requisitions]
  );

  if (workspace === "requisitions") {
    return (
      <RequisitionWorkspace
        summary={summary}
        requisitions={requisitions}
        options={options}
        loading={loading}
        saving={saving}
        error={error}
        message={message}
        canManage={canManage}
        editingId={editingId}
        form={form}
        setForm={setForm}
        onBack={() => setSearchParams({})}
        onRefresh={load}
        onEdit={(row) => {
          setEditingId(row.id);
          setForm({
            locationId: row.locationId || "",
            designationId: row.designationId || "",
            employmentType: row.employmentType || "Full-Time",
            requestedHeadcount: Number(row.requestedHeadcount || 1),
            targetStartDate: row.targetStartDate || "",
            reason: row.reason || "",
          });
          setMessage("");
          setError("");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onCancelEdit={() => {
          setEditingId(null);
          setForm({
            ...EMPTY_FORM,
            locationId: options.locations?.length === 1 ? options.locations[0].id : "",
          });
        }}
        onSave={async (event) => {
          event.preventDefault();
          try {
            setSaving(true);
            setError("");
            setMessage("");
            const result = await apiRequest(
              editingId
                ? `/api/recruitment/requisitions/${editingId}`
                : "/api/recruitment/requisitions",
              {
                method: editingId ? "PATCH" : "POST",
                body: {
                  ...form,
                  requestedHeadcount: Number(form.requestedHeadcount),
                },
              }
            );
            setMessage(result?.message || "Job requisition saved.");
            setEditingId(null);
            setForm({
              ...EMPTY_FORM,
              locationId: options.locations?.length === 1 ? options.locations[0].id : "",
            });
            await load();
          } catch (err) {
            setError(err?.message || "Unable to save job requisition.");
          } finally {
            setSaving(false);
          }
        }}
        onAction={async (row, action) => {
          try {
            setSaving(true);
            setError("");
            setMessage("");
            let body = {};
            let endpoint = `/api/recruitment/requisitions/${row.id}/${action}`;
            if (["approve", "return", "reject"].includes(action)) {
              const notes = action === "approve"
                ? window.prompt("Approval note (optional):", "")
                : window.prompt(`${friendly(action)} reason:`, "");
              if (notes === null) return;
              body = { decision: action.toUpperCase(), notes };
              endpoint = `/api/recruitment/requisitions/${row.id}/decision`;
            } else if (action === "close") {
              const notes = window.prompt("Closure note (optional):", "");
              if (notes === null) return;
              body = { notes };
            } else if (action === "cancel") {
              const notes = window.prompt("Cancellation reason (optional):", "");
              if (notes === null) return;
              body = { notes };
            }
            const result = await apiRequest(endpoint, { method: "POST", body });
            setMessage(result?.message || "Requisition updated.");
            await load();
          } catch (err) {
            setError(err?.message || "Unable to update requisition.");
          } finally {
            setSaving(false);
          }
        }}
      />
    );
  }

  const stageValues = {
    Requisitions: summary?.totalRequisitions ?? 0,
    Applications: "—",
    Screened: "—",
    Interviewed: "—",
    Offered: "—",
    Hired: "—",
  };

  return (
    <ModuleDashboardShell
      eyebrow="TALENT ACQUISITION"
      title="Recruitment Dashboard"
      description="Manage recruitment demand, candidate pipelines, interviews, offers and hiring outcomes from one analytical home."
      metrics={[
        <DashboardCard
          key="open-roles"
          title="Open Roles"
          value={loading ? "…" : Number(summary?.openHeadcount || 0).toLocaleString("en-NG")}
          subtitle="Approved positions currently open"
          icon={<FaBriefcase />}
          tone="gold"
        />,
        <DashboardCard
          key="pending"
          title="Pending Approval"
          value={loading ? "…" : Number(summary?.pendingApproval || 0).toLocaleString("en-NG")}
          subtitle="Requisitions awaiting Head Office decision"
          icon={<FaClipboardList />}
          tone="green"
        />,
        <DashboardCard
          key="candidates"
          title="Active Candidates"
          value="—"
          subtitle="Activates with candidate pipeline"
          icon={<FaUsers />}
          tone="gold"
        />,
        <DashboardCard
          key="hires"
          title="Hires"
          value="—"
          subtitle="Activates with candidate-to-hire workflow"
          icon={<FaUserCheck />}
          tone="green"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Recruitment Funnel"
          subtitle="Job requisition demand is live. Candidate-stage conversion will activate with the next recruitment increment."
          icon={<FaBullhorn />}
        >
          {error && <div style={alertErrorStyle}>{error}</div>}
          <div style={{ display: "grid", gap: 14 }}>
            {Object.entries(stageValues).map(([stage, value]) => (
              <div
                key={stage}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 55px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--chris-dashboard-text)", fontWeight: 800 }}>
                  {stage}
                </span>
                <div className="chris-progress">
                  <div
                    className="chris-progress__bar"
                    style={{ width: stage === "Requisitions" && Number(value) > 0 ? "100%" : "0%" }}
                  />
                </div>
                <strong
                  style={{
                    color: "var(--chris-dashboard-gold-bright)",
                    textAlign: "right",
                  }}
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>
        </AnalyticsPanel>
      }
      recentActivity={
        <AnalyticsPanel
          title="Recruitment Intelligence"
          subtitle="Live requisition activity in the permitted operating context."
          icon={<FaClipboardList />}
        >
          <RecentActivityList
            items={
              latestActivity.length
                ? latestActivity
                : [{
                    id: "no-requisitions",
                    icon: <FaBriefcase />,
                    title: "No requisitions yet",
                    description: "Create the first controlled job requisition to begin the Recruitment workflow.",
                    time: "Ready",
                    tone: "neutral",
                  }]
            }
          />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="requisitions"
          title="Job Requisitions"
          subtitle="Create, submit and manage hiring demand"
          icon={<FaBriefcase />}
          onClick={() => setSearchParams({ workspace: "requisitions" })}
        />,
        <QuickActionCard
          key="candidates"
          title="Candidates"
          subtitle="Manage candidate pipeline"
          icon={<FaUsers />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="interviews"
          title="Interviews"
          subtitle="Schedule and manage interviews"
          icon={<FaCalendarCheck />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="offers"
          title="Offers"
          subtitle="Prepare and track offers"
          icon={<FaFileSignature />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="hiring"
          title="Hiring"
          subtitle="Complete hiring workflow"
          icon={<FaHandshake />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

function RequisitionWorkspace({
  summary,
  requisitions,
  options,
  loading,
  saving,
  error,
  message,
  canManage,
  editingId,
  form,
  setForm,
  onBack,
  onRefresh,
  onEdit,
  onCancelEdit,
  onSave,
  onAction,
}) {
  const headOffice = options?.scope?.mode === "HEAD_OFFICE_CONSOLIDATED";
  const selectedDesignation = options.designations.find((row) => row.id === form.designationId);
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <button type="button" style={linkButtonStyle} onClick={onBack}>
            <FaArrowLeft /> Recruitment Dashboard
          </button>
          <div style={eyebrowStyle}>RECRUITMENT · RELEASE 1</div>
          <h1 style={titleStyle}>Job Requisitions</h1>
          <p style={subtitleStyle}>
            Controlled hiring demand with branch isolation, Head Office approval and permanent audit history.
          </p>
        </div>
        <div style={headerActionsStyle}>
          <span style={scopePillStyle}>
            {headOffice
              ? "HEAD OFFICE · CONSOLIDATED"
              : `${options?.scope?.locationName || "BRANCH"}${options?.scope?.locationCode ? ` · ${options.scope.locationCode}` : ""}`}
          </span>
          <button type="button" style={secondaryButtonStyle} onClick={onRefresh} disabled={loading || saving}>
            <FaSyncAlt /> Refresh
          </button>
        </div>
      </div>

      <div style={kpiGridStyle}>
        <MiniKpi label="Total Requisitions" value={summary?.totalRequisitions} />
        <MiniKpi label="Open Positions" value={summary?.openHeadcount} />
        <MiniKpi label="Pending Approval" value={summary?.pendingApproval} />
        <MiniKpi label="Returned" value={summary?.returned} />
      </div>

      {message && <div style={alertSuccessStyle}>{message}</div>}
      {error && <div style={alertErrorStyle}>{error}</div>}

      {canManage && (
        <form style={panelStyle} onSubmit={onSave}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>{editingId ? "Edit Requisition" : "New Job Requisition"}</h2>
              <div style={panelSubtitleStyle}>
                Designation is selected from the controlled CHRiS job catalogue. Branch users cannot create demand outside their assigned branch.
              </div>
            </div>
            {editingId && (
              <button type="button" style={secondaryButtonStyle} onClick={onCancelEdit} disabled={saving}>
                <FaTimes /> Cancel Edit
              </button>
            )}
          </div>

          <div style={formGridStyle}>
            <Field label="Requesting Branch / Location">
              <select
                value={form.locationId}
                onChange={(e) => setField("locationId", e.target.value)}
                style={inputStyle}
                required
                disabled={!headOffice || editingId}
              >
                <option value="">Select operating location</option>
                {options.locations.map((row) => (
                  <option key={row.id} value={row.id}>{row.code ? `${row.code} · ` : ""}{row.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Designation">
              <select
                value={form.designationId}
                onChange={(e) => setField("designationId", e.target.value)}
                style={inputStyle}
                required
              >
                <option value="">Select controlled designation</option>
                {options.designations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code ? `${row.code} · ` : ""}{row.name}{row.department?.name ? ` · ${row.department.name}` : ""}
                  </option>
                ))}
              </select>
              {selectedDesignation?.department?.name && (
                <div style={fieldHintStyle}>Department: {selectedDesignation.department.name}</div>
              )}
            </Field>

            <Field label="Employment Type">
              <select
                value={form.employmentType}
                onChange={(e) => setField("employmentType", e.target.value)}
                style={inputStyle}
                required
              >
                {(options.employmentTypes.length ? options.employmentTypes : ["Full-Time", "Part-Time", "Expatriate", "Contract", "Temporary", "Intern / Trainee"]).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </Field>

            <Field label="Requested Headcount">
              <input
                type="number"
                min="1"
                step="1"
                value={form.requestedHeadcount}
                onChange={(e) => setField("requestedHeadcount", e.target.value)}
                style={inputStyle}
                required
              />
            </Field>

            <Field label="Target Start Date">
              <input
                type="date"
                value={form.targetStartDate}
                onChange={(e) => setField("targetStartDate", e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Business Justification" wide>
              <textarea
                rows="3"
                value={form.reason}
                onChange={(e) => setField("reason", e.target.value)}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="Why is this hire required? State replacement, expansion, operational need or approved manpower requirement."
                required
              />
            </Field>
          </div>

          <div style={formActionsStyle}>
            <button type="submit" style={primaryButtonStyle} disabled={saving || loading}>
              <FaPlus /> {saving ? "Saving..." : editingId ? "Save Changes" : "Create Draft Requisition"}
            </button>
          </div>
        </form>
      )}

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <h2 style={panelTitleStyle}>Requisition Register</h2>
            <div style={panelSubtitleStyle}>
              {requisitions.length.toLocaleString("en-NG")} requisition{requisitions.length === 1 ? "" : "s"} in the permitted operating context.
            </div>
          </div>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {["Requisition", "Role", "Branch", "Type", "HC", "Target", "Status", "Actions"].map((heading) => (
                  <th key={heading} style={thStyle}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requisitions.map((row) => (
                <tr key={row.id}>
                  <td style={tdStrongStyle}>{row.requisitionNumber}</td>
                  <td style={tdStyle}>
                    <div style={{ color: "#F1F8F4", fontWeight: 800 }}>{row.title}</div>
                    <div style={tableSubtextStyle}>{row.departmentName || "Department not assigned"}</div>
                  </td>
                  <td style={tdStyle}>{row.locationCode || row.locationName || "—"}</td>
                  <td style={tdStyle}>{row.employmentType}</td>
                  <td style={tdStrongStyle}>{row.requestedHeadcount}</td>
                  <td style={tdStyle}>{row.targetStartDate || "—"}</td>
                  <td style={tdStyle}><StatusBadge value={row.status} /></td>
                  <td style={tdStyle}>
                    <div style={rowActionsStyle}>
                      {canManage && ["DRAFT", "RETURNED"].includes(row.status) && (
                        <button type="button" style={actionButtonStyle} onClick={() => onEdit(row)} disabled={saving}>
                          <FaEdit /> Edit
                        </button>
                      )}
                      {canManage && ["DRAFT", "RETURNED"].includes(row.status) && (
                        <button type="button" style={actionButtonStyle} onClick={() => onAction(row, "submit")} disabled={saving}>
                          <FaPaperPlane /> Submit
                        </button>
                      )}
                      {canManage && ["DRAFT", "RETURNED", "PENDING_APPROVAL"].includes(row.status) && (
                        <button type="button" style={dangerButtonStyle} onClick={() => onAction(row, "cancel")} disabled={saving}>
                          <FaTimes /> Cancel
                        </button>
                      )}
                      {canManage && headOffice && row.status === "PENDING_APPROVAL" && (
                        <>
                          <button type="button" style={approveButtonStyle} onClick={() => onAction(row, "approve")} disabled={saving}>
                            <FaCheck /> Approve & Open
                          </button>
                          <button type="button" style={actionButtonStyle} onClick={() => onAction(row, "return")} disabled={saving}>Return</button>
                          <button type="button" style={dangerButtonStyle} onClick={() => onAction(row, "reject")} disabled={saving}>Reject</button>
                        </>
                      )}
                      {canManage && headOffice && row.status === "OPEN" && (
                        <button type="button" style={actionButtonStyle} onClick={() => onAction(row, "close")} disabled={saving}>Close</button>
                      )}
                      {!canManage && <span style={tableSubtextStyle}>View only</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !requisitions.length && (
                <tr><td colSpan={8} style={emptyCellStyle}>No job requisitions are recorded in this operating context yet.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={8} style={emptyCellStyle}>Loading controlled job requisitions...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div style={kpiCardStyle}>
      <div style={kpiLabelStyle}>{label}</div>
      <div style={kpiValueStyle}>{Number(value || 0).toLocaleString("en-NG")}</div>
    </div>
  );
}

function Field({ label, wide = false, children }) {
  return (
    <label style={{ ...fieldStyle, ...(wide ? { gridColumn: "1 / -1" } : {}) }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ value }) {
  const status = String(value || "UNKNOWN").toUpperCase();
  const style = status === "OPEN"
    ? { background: "rgba(46,233,139,.12)", color: "#76F3B2" }
    : status === "PENDING_APPROVAL"
      ? { background: "rgba(246,211,93,.12)", color: "#F6D35D" }
      : ["REJECTED", "CANCELLED"].includes(status)
        ? { background: "rgba(248,113,113,.12)", color: "#FCA5A5" }
        : { background: "rgba(255,255,255,.08)", color: "#C9DCD2" };
  return <span style={{ ...statusBadgeStyle, ...style }}>{friendly(status)}</span>;
}

function friendly(value) {
  return String(value || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

const pageStyle = { color: "#EAF5EF", padding: "4px 0 34px" };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", flexWrap: "wrap" };
const headerActionsStyle = { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" };
const eyebrowStyle = { marginTop: 12, color: "var(--chris-gold,#D4AF37)", fontSize: 10, fontWeight: 900, letterSpacing: ".12em" };
const titleStyle = { margin: "7px 0 0", color: "#F7FAF8", fontSize: 30 };
const subtitleStyle = { margin: "7px 0 0", color: "#AFC5B9", maxWidth: 760, lineHeight: 1.5, fontSize: 13 };
const linkButtonStyle = { border: "none", background: "transparent", color: "#76F3B2", cursor: "pointer", padding: 0, display: "inline-flex", gap: 7, alignItems: "center", fontWeight: 800 };
const scopePillStyle = { border: "1px solid rgba(212,175,55,.42)", color: "#F6D35D", padding: "9px 12px", borderRadius: 999, fontSize: 10, fontWeight: 900, background: "rgba(212,175,55,.06)" };
const buttonBaseStyle = { borderRadius: 9, padding: "9px 12px", cursor: "pointer", display: "inline-flex", gap: 7, alignItems: "center", fontWeight: 800, fontSize: 11 };
const secondaryButtonStyle = { ...buttonBaseStyle, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.055)", color: "#DCEBE3" };
const primaryButtonStyle = { ...buttonBaseStyle, border: "1px solid rgba(212,175,55,.48)", background: "linear-gradient(135deg,#087A43,#075F36)", color: "#FFFFFF" };
const kpiGridStyle = { marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 };
const kpiCardStyle = { border: "1px solid rgba(212,175,55,.25)", background: "linear-gradient(145deg,#063722,#02170f)", borderRadius: 14, padding: 15 };
const kpiLabelStyle = { color: "#C9DCD2", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".05em" };
const kpiValueStyle = { marginTop: 9, color: "#F6D35D", fontWeight: 900, fontSize: 27 };
const panelStyle = { marginTop: 18, border: "1px solid rgba(212,175,55,.20)", borderRadius: 16, padding: 19, background: "linear-gradient(145deg,rgba(6,55,34,.93),rgba(2,23,15,.95))", boxShadow: "0 12px 30px rgba(0,0,0,.16)" };
const panelHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 15, alignItems: "flex-start", flexWrap: "wrap" };
const panelTitleStyle = { margin: 0, color: "#F7FAF8", fontSize: 17 };
const panelSubtitleStyle = { marginTop: 5, color: "#9EB7A9", fontSize: 11, lineHeight: 1.45, maxWidth: 760 };
const formGridStyle = { marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 };
const fieldStyle = { display: "grid", gap: 6 };
const fieldLabelStyle = { color: "#DDECE4", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".035em" };
const fieldHintStyle = { color: "#91A99C", fontSize: 9 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, padding: "10px 11px", border: "1px solid rgba(212,175,55,.22)", background: "rgba(0,0,0,.22)", color: "#F7FAF8", outline: "none", fontFamily: "inherit" };
const formActionsStyle = { marginTop: 16, display: "flex", justifyContent: "flex-end" };
const alertSuccessStyle = { marginTop: 16, border: "1px solid rgba(46,233,139,.34)", background: "rgba(46,233,139,.08)", color: "#8CF5BE", padding: "11px 13px", borderRadius: 10, fontSize: 11 };
const alertErrorStyle = { marginTop: 16, border: "1px solid rgba(248,113,113,.34)", background: "rgba(248,113,113,.08)", color: "#FCA5A5", padding: "11px 13px", borderRadius: 10, fontSize: 11 };
const tableWrapStyle = { marginTop: 16, width: "100%", overflowX: "auto" };
const tableStyle = { width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 11 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#F6D35D", borderBottom: "1px solid rgba(212,175,55,.20)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".045em", whiteSpace: "nowrap" };
const tdStyle = { padding: "11px 9px", color: "#C9DCD2", borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top" };
const tdStrongStyle = { ...tdStyle, color: "#F1F8F4", fontWeight: 800 };
const tableSubtextStyle = { marginTop: 3, color: "#91A99C", fontSize: 9 };
const emptyCellStyle = { ...tdStyle, padding: 24, textAlign: "center", color: "#91A99C" };
const rowActionsStyle = { display: "flex", gap: 6, flexWrap: "wrap" };
const actionButtonStyle = { ...buttonBaseStyle, padding: "6px 8px", fontSize: 9, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: "#DCEBE3" };
const approveButtonStyle = { ...actionButtonStyle, borderColor: "rgba(46,233,139,.32)", color: "#76F3B2" };
const dangerButtonStyle = { ...actionButtonStyle, borderColor: "rgba(248,113,113,.30)", color: "#FCA5A5" };
const statusBadgeStyle = { display: "inline-flex", padding: "4px 8px", borderRadius: 999, fontSize: 9, fontWeight: 900, whiteSpace: "nowrap" };

export default Recruitment;
