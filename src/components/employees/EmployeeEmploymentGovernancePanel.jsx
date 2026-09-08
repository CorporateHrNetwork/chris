import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";
import useAuthorization from "../../hooks/useAuthorization";
import SearchableRegistrySelect from "../common/SearchableRegistrySelect";

const today = new Date().toISOString().slice(0, 10);

function designationLabel(item) {
  return [
    item?.code || "NO-CODE",
    item?.name,
    item?.department?.name || "No department",
    item?.employmentLevel
      ? `${item.employmentLevel.code} · ${item.employmentLevel.name}`
      : "Level not configured",
  ]
    .filter(Boolean)
    .join(" · ");
}

function levelLabel(item) {
  return [item?.code, item?.name].filter(Boolean).join(" · ");
}

export default function EmployeeEmploymentGovernancePanel({ employeeNumber, onChanged }) {
  const { hasPermission } = useAuthorization();
  const canUpdate = hasPermission("employees.update");
  const [catalog, setCatalog] = useState({ designations: [], levels: [] });
  const [levelState, setLevelState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const [designationSearch, setDesignationSearch] = useState("");
  const [designationForm, setDesignationForm] = useState({
    designationId: "",
    effectiveDate: today,
    reason: "",
    notes: "",
  });

  const [levelSearch, setLevelSearch] = useState("");
  const [levelForm, setLevelForm] = useState({
    levelNumber: "",
    effectiveFrom: today,
    reason: "",
    notes: "",
  });

  async function load() {
    if (!employeeNumber) return;
    setLoading(true);
    setMessage("");
    try {
      const [designations, levels, levelResult] = await Promise.all([
        apiRequest("/api/employees/career/designations"),
        apiRequest("/api/employees/career/employment-levels"),
        apiRequest(`/api/employee-assignments/employment-level/${encodeURIComponent(employeeNumber)}`),
      ]);

      setCatalog({
        designations: designations.data || [],
        levels: levels.data || [],
      });
      setLevelState(levelResult.data || null);

      const currentDesignation = levelResult.data?.employee?.designation || null;
      setDesignationSearch(currentDesignation ? designationLabel(currentDesignation) : "");
      setDesignationForm((current) => ({
        ...current,
        designationId: currentDesignation?.id || "",
        reason: "",
        notes: "",
      }));

      const effectiveLevel = levelResult.data?.effective || null;
      setLevelSearch(effectiveLevel ? levelLabel(effectiveLevel) : "");
      setLevelForm((current) => ({
        ...current,
        levelNumber: effectiveLevel?.levelNumber ?? "",
        reason: "",
        notes: "",
      }));
    } catch (error) {
      setMessage(error.message || "Unable to load employment governance controls.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [employeeNumber]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const designationOptions = useMemo(
    () =>
      catalog.designations.map((item) => ({
        value: item.id,
        label: designationLabel(item),
        item,
      })),
    [catalog.designations]
  );

  const levelOptions = useMemo(
    () =>
      catalog.levels.map((item) => ({
        value: String(item.levelNumber),
        label: levelLabel(item),
        item,
      })),
    [catalog.levels]
  );

  async function saveDesignation(event) {
    event.preventDefault();
    const selected = catalog.designations.find(
      (item) => item.id === designationForm.designationId
    );
    if (!selected) {
      return setMessage("Select a designation from the controlled CHRiS catalogue.");
    }
    if (!designationForm.reason.trim()) {
      return setMessage("Enter the reason for the designation change.");
    }
    if (!selected.department?.id) {
      return setMessage("The selected designation must belong to a configured department.");
    }

    setBusy("designation");
    setMessage("");
    try {
      const result = await apiRequest(
        `/api/employees/${encodeURIComponent(employeeNumber)}/job-change`,
        {
          method: "PATCH",
          body: {
            departmentId: selected.department.id,
            designationId: selected.id,
            effectiveDate: designationForm.effectiveDate,
            reason: designationForm.reason,
            notes: designationForm.notes,
          },
        }
      );
      setMessage(result.message || "Designation updated.");
      await load();
      if (onChanged) await onChanged();
    } catch (error) {
      setMessage(error.message || "Unable to update designation.");
    } finally {
      setBusy("");
    }
  }

  async function saveLevel(event) {
    event.preventDefault();
    if (levelForm.levelNumber === "") {
      return setMessage("Select an Employment Level.");
    }
    if (!levelForm.reason.trim()) {
      return setMessage("Enter the reason for the employee-specific level assignment.");
    }

    setBusy("level");
    setMessage("");
    try {
      const result = await apiRequest(
        `/api/employee-assignments/employment-level/${encodeURIComponent(employeeNumber)}`,
        {
          method: "PUT",
          body: {
            levelNumber: Number(levelForm.levelNumber),
            effectiveFrom: levelForm.effectiveFrom,
            reason: levelForm.reason,
            notes: levelForm.notes,
          },
        }
      );
      setMessage(result.message || "Employment Level updated.");
      await load();
      if (onChanged) await onChanged();
    } catch (error) {
      setMessage(error.message || "Unable to update Employment Level.");
    } finally {
      setBusy("");
    }
  }

  async function restoreDesignationDefault() {
    if (!levelState?.currentOverride) return;
    if (!levelForm.reason.trim()) {
      return setMessage(
        "Enter the reason for removing the employee-specific level override."
      );
    }
    if (
      !window.confirm(
        "Remove the employee-specific Employment Level override and restore the designation default?"
      )
    ) {
      return;
    }

    setBusy("level");
    setMessage("");
    try {
      const result = await apiRequest(
        `/api/employee-assignments/employment-level/${encodeURIComponent(employeeNumber)}`,
        {
          method: "DELETE",
          body: {
            effectiveTo: levelForm.effectiveFrom,
            reason: levelForm.reason,
            notes: levelForm.notes,
          },
        }
      );
      setMessage(result.message || "Designation default restored.");
      await load();
      if (onChanged) await onChanged();
    } catch (error) {
      setMessage(error.message || "Unable to restore designation default.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <section style={panel}>
        <div style={eyebrow}>EMPLOYMENT GOVERNANCE</div>
        <p style={muted}>Loading controlled Designation and Employment Level controls...</p>
      </section>
    );
  }

  return (
    <section style={panel}>
      <div style={eyebrow}>EMPLOYMENT GOVERNANCE</div>
      <h2 style={heading}>Controlled Designation & Employee-specific Employment Level</h2>
      <p style={muted}>
        Designation defines the job structure and default grade. An authorized employee-specific
        level override changes only this employee and never mutates the designation for everyone else.
      </p>

      {message ? <div style={feedback}>{message}</div> : null}

      <div style={summaryGrid}>
        <div style={summaryCard}>
          <span style={summaryLabel}>Current Designation</span>
          <strong>{levelState?.employee?.designation?.name || "Not configured"}</strong>
          <small>{levelState?.employee?.designation?.code || ""}</small>
        </div>
        <div style={summaryCard}>
          <span style={summaryLabel}>Designation Default Level</span>
          <strong>
            {levelState?.designationDefault
              ? levelLabel(levelState.designationDefault)
              : "Not configured"}
          </strong>
        </div>
        <div style={summaryCard}>
          <span style={summaryLabel}>Effective Employment Level</span>
          <strong>
            {levelState?.effective ? levelLabel(levelState.effective) : "Not configured"}
          </strong>
          <small>
            Source: {levelState?.effective?.source === "EMPLOYEE_OVERRIDE"
              ? "Employee Override"
              : "Designation Default"}
          </small>
        </div>
      </div>

      <div style={workflowGrid}>
        <form onSubmit={saveDesignation} style={workflowCard}>
          <div style={eyebrow}>CONTROLLED DESIGNATION</div>
          <label style={label}>
            Designation
            <SearchableRegistrySelect
              value={designationSearch}
              options={designationOptions}
              placeholder="Search designation, code, department or level"
              ariaLabel="Search designation"
              inputStyle={input}
              onChange={(labelValue, option) => {
                setDesignationSearch(labelValue);
                setDesignationForm((current) => ({
                  ...current,
                  designationId: option?.value || "",
                }));
              }}
            />
          </label>
          <label style={label}>
            Effective Date
            <input
              type="date"
              required
              style={input}
              value={designationForm.effectiveDate}
              onChange={(event) =>
                setDesignationForm({ ...designationForm, effectiveDate: event.target.value })
              }
            />
          </label>
          <label style={label}>
            Reason *
            <textarea
              required
              style={textarea}
              value={designationForm.reason}
              onChange={(event) =>
                setDesignationForm({ ...designationForm, reason: event.target.value })
              }
            />
          </label>
          <label style={label}>
            Notes
            <textarea
              style={textarea}
              value={designationForm.notes}
              onChange={(event) =>
                setDesignationForm({ ...designationForm, notes: event.target.value })
              }
            />
          </label>
          <button style={primary} disabled={!canUpdate || busy === "designation"}>
            {busy === "designation" ? "Saving..." : "Save Designation"}
          </button>
        </form>

        <form onSubmit={saveLevel} style={workflowCard}>
          <div style={eyebrow}>EMPLOYEE-SPECIFIC LEVEL</div>
          <div style={defaultBox}>
            <span>Designation default</span>
            <strong>
              {levelState?.designationDefault
                ? levelLabel(levelState.designationDefault)
                : "Not configured"}
            </strong>
          </div>
          <label style={label}>
            Effective Employment Level
            <SearchableRegistrySelect
              value={levelSearch}
              options={levelOptions}
              placeholder="Search L1–L7 or tenant level"
              ariaLabel="Search employment level"
              inputStyle={input}
              onChange={(labelValue, option) => {
                setLevelSearch(labelValue);
                setLevelForm((current) => ({
                  ...current,
                  levelNumber: option?.value ?? "",
                }));
              }}
            />
          </label>
          <label style={label}>
            Effective Date
            <input
              type="date"
              required
              style={input}
              value={levelForm.effectiveFrom}
              onChange={(event) =>
                setLevelForm({ ...levelForm, effectiveFrom: event.target.value })
              }
            />
          </label>
          <label style={label}>
            Reason *
            <textarea
              required
              style={textarea}
              value={levelForm.reason}
              onChange={(event) =>
                setLevelForm({ ...levelForm, reason: event.target.value })
              }
            />
          </label>
          <label style={label}>
            Notes
            <textarea
              style={textarea}
              value={levelForm.notes}
              onChange={(event) =>
                setLevelForm({ ...levelForm, notes: event.target.value })
              }
            />
          </label>
          <div style={buttonRow}>
            {levelState?.currentOverride ? (
              <button
                type="button"
                style={secondary}
                disabled={!canUpdate || busy === "level"}
                onClick={restoreDesignationDefault}
              >
                Use Designation Default
              </button>
            ) : null}
            <button style={primary} disabled={!canUpdate || busy === "level"}>
              {busy === "level" ? "Saving..." : "Save Level Override"}
            </button>
          </div>
        </form>
      </div>

      {levelState?.history?.length ? (
        <details style={historyBox}>
          <summary>Employment Level override history ({levelState.history.length})</summary>
          <div style={historyGrid}>
            {levelState.history.map((item) => (
              <div key={item.id} style={historyItem}>
                <strong>{levelLabel(item.employmentLevel)}</strong>
                <span>
                  {new Date(item.effectiveFrom).toLocaleDateString()} — {item.effectiveTo
                    ? new Date(item.effectiveTo).toLocaleDateString()
                    : "Current"}
                </span>
                <span>{item.reason}</span>
                {item.performedBy?.email ? <small>By {item.performedBy.email}</small> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

const panel = {
  marginTop: 18,
  padding: 20,
  borderRadius: 18,
  border: "1px solid rgba(212,175,55,.3)",
  background: "linear-gradient(145deg,#042417,#02130d)",
  color: "#F7FAF8",
};
const heading = { margin: "0 0 6px", fontSize: 21, color: "#F7FAF8" };
const eyebrow = {
  color: "#D4AF37",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".13em",
  marginBottom: 6,
};
const muted = { color: "#AFC0B7" };
const feedback = {
  margin: "14px 0",
  padding: 11,
  borderRadius: 9,
  border: "1px solid rgba(212,175,55,.35)",
  background: "rgba(212,175,55,.08)",
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
  gap: 10,
  margin: "16px 0",
};
const summaryCard = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(212,175,55,.18)",
  background: "rgba(255,255,255,.02)",
};
const summaryLabel = {
  color: "#D4AF37",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
};
const workflowGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
  gap: 14,
};
const workflowCard = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(212,175,55,.2)",
  background: "#061A11",
};
const label = {
  display: "grid",
  gap: 6,
  color: "#C7D3CC",
  fontSize: 12,
  fontWeight: 800,
};
const input = {
  width: "100%",
  minHeight: 42,
  boxSizing: "border-box",
  padding: "0 11px",
  borderRadius: 8,
  border: "1px solid rgba(212,175,55,.28)",
  background: "#02130D",
  color: "#F7FAF8",
};
const textarea = { ...input, minHeight: 70, padding: 10 };
const defaultBox = {
  display: "grid",
  gap: 4,
  padding: 10,
  borderRadius: 8,
  border: "1px solid rgba(212,175,55,.15)",
  color: "#BFD0C7",
};
const buttonRow = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};
const primary = {
  minHeight: 40,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid #D4AF37",
  background: "#D4AF37",
  color: "#08140E",
  fontWeight: 900,
};
const secondary = { ...primary, background: "transparent", color: "#D4AF37" };
const historyBox = {
  marginTop: 14,
  padding: 12,
  border: "1px solid rgba(212,175,55,.18)",
  borderRadius: 10,
};
const historyGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
  gap: 8,
  marginTop: 10,
};
const historyItem = {
  display: "grid",
  gap: 4,
  padding: 10,
  borderRadius: 8,
  background: "rgba(255,255,255,.03)",
  color: "#C7D3CC",
};
