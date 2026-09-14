import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

const DEFINITIONS = {
  employees: {
    eyebrow: "WORKFORCE CONFIGURATION",
    title: "Employee Settings",
    description: "Control employee defaults, onboarding safeguards and employee-data governance.",
    fields: [
      ["defaultEmploymentType", "Default Employment Type", "select", ["Permanent", "Contract", "Temporary", "Probation", "Intern / Trainee", "Expatriate"]],
      ["defaultEmployeeStatus", "Default Employee Status", "select", ["PROBATION", "ACTIVE"]],
      ["requireNin", "Require NIN where applicable", "boolean"],
      ["enforceDuplicateEmailProtection", "Prevent duplicate employee email", "boolean"],
      ["onboardingCompletionRequired", "Require onboarding completion controls", "boolean"],
      ["employeeProfileChangeAudit", "Audit employee profile changes", "boolean"],
    ],
  },
  payroll: {
    eyebrow: "PAYROLL GOVERNANCE",
    title: "Payroll Settings",
    description: "Configure payroll operating controls, recovery automation and approval safeguards.",
    fields: [
      ["currency", "Payroll Currency", "select", ["NGN", "USD", "GBP", "EUR"]],
      ["payrollFrequency", "Payroll Frequency", "select", ["MONTHLY", "BIWEEKLY", "WEEKLY"]],
      ["requireApprovalBeforeFinalization", "Require approval before finalization", "boolean"],
      ["loansAutoRecovery", "Automatic loan recovery", "boolean"],
      ["salaryAdvanceAutoRecovery", "Automatic salary-advance recovery", "boolean"],
      ["attendanceReadinessRequired", "Require attendance readiness for payroll", "boolean"],
    ],
  },
  attendance: {
    eyebrow: "TIME & ATTENDANCE CONTROL",
    title: "Attendance Settings",
    description: "Configure daily hours, lateness, overtime and payroll-attendance controls.",
    fields: [
      ["standardDailyHours", "Standard Daily Hours", "number", { min: 1, max: 24 }],
      ["latenessGraceMinutes", "Lateness Grace Minutes", "number", { min: 0, max: 240 }],
      ["overtimeApprovalRequired", "Require overtime approval", "boolean"],
      ["attendanceRequiredForPayroll", "Attendance required for payroll", "boolean"],
      ["suppressAttendanceDuringActiveLeave", "Suppress attendance during active leave", "boolean"],
      ["publicHolidayCalendarEnabled", "Use public-holiday calendar", "boolean"],
    ],
  },
  leave: {
    eyebrow: "LEAVE GOVERNANCE",
    title: "Leave Settings",
    description: "Configure leave-year controls, approvals, balances and return-to-work governance.",
    fields: [
      ["leaveYearStartMonth", "Leave Year Start Month", "number", { min: 1, max: 12 }],
      ["requireManagerApproval", "Require manager approval", "boolean"],
      ["preventNegativeBalance", "Prevent negative leave balance", "boolean"],
      ["returnToWorkRequired", "Require return-to-work completion", "boolean"],
      ["attachmentRulesEnabled", "Enforce attachment rules", "boolean"],
      ["autoCommencementEnabled", "Enable automatic leave commencement", "boolean"],
    ],
  },
  benefits: {
    eyebrow: "BENEFITS GOVERNANCE",
    title: "Benefits Settings",
    description: "Control benefit programmes and effective-dated eligibility governance.",
    fields: [
      ["pensionEnabled", "Pension programme enabled", "boolean"],
      ["healthInsuranceEnabled", "Health insurance enabled", "boolean"],
      ["lifeInsuranceEnabled", "Life insurance enabled", "boolean"],
      ["gratuityEnabled", "Gratuity programme enabled", "boolean"],
      ["benefitEligibilityAudit", "Audit benefit eligibility decisions", "boolean"],
      ["effectiveDatedBenefitRules", "Use effective-dated benefit rules", "boolean"],
    ],
  },
  recruitment: {
    eyebrow: "TALENT ACQUISITION CONTROL",
    title: "Recruitment Settings",
    description: "Configure requisition, candidate, interview, offer and talent-pool controls.",
    fields: [
      ["requisitionApprovalRequired", "Require job-requisition approval", "boolean"],
      ["structuredInterviewEnabled", "Structured interviews enabled", "boolean"],
      ["candidateConsentRequired", "Require candidate data consent", "boolean"],
      ["duplicateCandidateProtection", "Prevent duplicate candidate records", "boolean"],
      ["offerApprovalRequired", "Require offer approval", "boolean"],
      ["talentPoolEnabled", "Enable talent pool", "boolean"],
    ],
  },
  notifications: {
    eyebrow: "COMMUNICATION CONTROL",
    title: "Notification Settings",
    description: "Control notification channels and operational alerts across CHRiS.",
    fields: [
      ["inAppNotifications", "In-app notifications", "boolean"],
      ["emailNotifications", "Email notifications", "boolean"],
      ["whatsappNotifications", "WhatsApp notifications", "boolean"],
      ["criticalIncidentAlerts", "Critical incident alerts", "boolean"],
      ["approvalReminders", "Approval reminders", "boolean"],
      ["supportCaseUpdates", "Support case updates", "boolean"],
    ],
  },
  security: {
    eyebrow: "ACCESS & DATA PROTECTION",
    title: "Security Settings",
    description: "Configure account security, session controls, audit retention and sensitive-export safeguards.",
    fields: [
      ["sessionHours", "Session Duration (hours)", "number", { min: 1, max: 24 }],
      ["passwordMinimumLength", "Minimum Password Length", "number", { min: 8, max: 64 }],
      ["failedLoginLimit", "Failed Login Limit", "number", { min: 3, max: 20 }],
      ["requireMfa", "Require multi-factor authentication", "boolean"],
      ["auditRetentionDays", "Audit Retention (days)", "number", { min: 90, max: 3650 }],
      ["sensitiveExportConfirmation", "Require confirmation for sensitive exports", "boolean"],
    ],
  },
  system: {
    eyebrow: "TENANT SYSTEM CONFIGURATION",
    title: "System Settings",
    description: "Control tenant-wide locale, date, currency, timezone and support configuration.",
    fields: [
      ["timezone", "Timezone", "select", ["Africa/Lagos", "UTC", "Europe/Zurich", "Europe/London"]],
      ["locale", "Locale", "select", ["en-NG", "en-GB", "en-US"]],
      ["dateFormat", "Date Format", "select", ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]],
      ["currency", "Default Currency", "select", ["NGN", "USD", "GBP", "EUR"]],
      ["supportEmail", "Support Email", "text"],
      ["maintenanceMode", "Maintenance mode", "boolean"],
    ],
  },
};

function formatTimestamp(value) {
  if (!value) return "Defaults currently in use";
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

export default function OperationalSettings({ section }) {
  const definition = DEFINITIONS[section];
  const { hasPermission } = useAuthorization();
  const canManage = hasPermission("settings.manage");
  const [values, setValues] = useState({});
  const [defaults, setDefaults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState({ updatedAt: null, updatedBy: null });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const result = await apiRequest(`/api/settings/${section}`);
        if (!active) return;
        setValues(result.data?.values || {});
        setDefaults(result.data?.defaults || {});
        setMeta({ updatedAt: result.data?.updatedAt || null, updatedBy: result.data?.updatedBy || null });
      } catch (requestError) {
        if (active) setError(requestError.message || "Unable to load settings.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [section]);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(defaults) || Boolean(meta.updatedAt), [values, defaults, meta.updatedAt]);

  if (!definition) return <div>Unknown settings section.</div>;

  function change(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice("");
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (!canManage) return;
    try {
      setSaving(true);
      setError("");
      setNotice("");
      const result = await apiRequest(`/api/settings/${section}`, {
        method: "PUT",
        body: { values, reason: `${definition.title} updated from CHRiS Settings` },
      });
      setValues(result.data?.values || values);
      setMeta({ updatedAt: result.data?.updatedAt || new Date().toISOString(), updatedBy: result.data?.updatedBy || null });
      setNotice(result.message || `${definition.title} saved successfully.`);
    } catch (requestError) {
      setError(requestError.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={page}>
      <section style={hero}>
        <div style={eyebrow}>{definition.eyebrow}</div>
        <h1 style={title}>{definition.title}</h1>
        <p style={muted}>{definition.description}</p>
        <div style={metaLine}>
          <span>Audited tenant configuration</span>
          <span>•</span>
          <span>{formatTimestamp(meta.updatedAt)}</span>
          {meta.updatedBy ? <><span>•</span><span>{meta.updatedBy}</span></> : null}
        </div>
      </section>

      {notice ? <div style={success}>{notice}</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      <form onSubmit={save} style={panel}>
        {loading ? <div style={muted}>Loading {definition.title.toLowerCase()}…</div> : (
          <div style={grid}>
            {definition.fields.map(([key, label, type, options]) => (
              <SettingField
                key={key}
                settingKey={key}
                label={label}
                type={type}
                options={options}
                value={values[key]}
                onChange={change}
                disabled={!canManage || saving}
              />
            ))}
          </div>
        )}

        <div style={footer}>
          <div style={helper}>{canManage ? "Changes are recorded in the CHRiS audit trail." : "You have view-only access to this configuration."}</div>
          <button type="submit" style={{ ...saveButton, opacity: (!canManage || saving || loading) ? .55 : 1 }} disabled={!canManage || saving || loading}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingField({ settingKey, label, type, options, value, onChange, disabled }) {
  if (type === "boolean") {
    return (
      <label style={toggleCard}>
        <div>
          <strong style={fieldLabel}>{label}</strong>
          <div style={fieldHint}>{value ? "Enabled" : "Disabled"}</div>
        </div>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(settingKey, event.target.checked)}
          style={{ width: 20, height: 20, accentColor: "#19D477" }}
        />
      </label>
    );
  }

  return (
    <label style={fieldCard}>
      <span style={fieldLabel}>{label}</span>
      {type === "select" ? (
        <select style={input} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(settingKey, event.target.value)}>
          {(options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          style={input}
          type={type === "number" ? "number" : "text"}
          value={value ?? ""}
          min={type === "number" ? options?.min : undefined}
          max={type === "number" ? options?.max : undefined}
          disabled={disabled}
          onChange={(event) => onChange(settingKey, type === "number" ? Number(event.target.value) : event.target.value)}
        />
      )}
    </label>
  );
}

const page = { color: "#F7FAF8" };
const hero = { padding: "22px 24px", marginBottom: 18, border: "1px solid rgba(212,175,55,.32)", borderRadius: 16, background: "linear-gradient(135deg,rgba(7,60,39,.82),rgba(3,24,16,.94))" };
const eyebrow = { color: "#F2CF57", fontSize: 10, fontWeight: 900, letterSpacing: ".13em" };
const title = { margin: "7px 0 6px", fontSize: 29, color: "#FFFFFF" };
const muted = { margin: 0, color: "#AEC2B6", lineHeight: 1.55 };
const metaLine = { marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", color: "#8FA99B", fontSize: 11, fontWeight: 700 };
const panel = { padding: 20, border: "1px solid rgba(212,175,55,.24)", borderRadius: 15, background: "rgba(2,22,14,.82)" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 };
const fieldCard = { display: "grid", gap: 8, padding: 14, border: "1px solid rgba(255,255,255,.08)", borderRadius: 11, background: "rgba(255,255,255,.025)" };
const toggleCard = { ...fieldCard, gridTemplateColumns: "1fr auto", alignItems: "center", cursor: "pointer" };
const fieldLabel = { color: "#EEF6F1", fontSize: 12, fontWeight: 850 };
const fieldHint = { marginTop: 4, color: "#8FA99B", fontSize: 10, fontWeight: 700 };
const input = { width: "100%", boxSizing: "border-box", padding: "10px 11px", borderRadius: 8, border: "1px solid rgba(82,145,110,.38)", background: "#07170F", color: "#F7FAF8", fontFamily: "inherit" };
const footer = { marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" };
const helper = { color: "#8FA99B", fontSize: 11 };
const saveButton = { border: 0, borderRadius: 9, padding: "10px 16px", background: "#087A43", color: "#FFFFFF", fontWeight: 900, cursor: "pointer" };
const success = { marginBottom: 14, padding: "11px 13px", borderRadius: 9, background: "rgba(25,212,119,.09)", color: "#73EFB0", border: "1px solid rgba(25,212,119,.28)" };
const errorBox = { marginBottom: 14, padding: "11px 13px", borderRadius: 9, background: "rgba(220,38,38,.09)", color: "#FCA5A5", border: "1px solid rgba(220,38,38,.28)" };
