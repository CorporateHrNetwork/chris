import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

const toDateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
const person = (user) => {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return name && user?.email ? `${name} — ${user.email}` : name || user?.email || "—";
};
const resolved = (task) => ["COMPLETED", "NOT_APPLICABLE"].includes(task.status);

export default function OnboardingTaskChecklist({ record, onSaved }) {
  const [owners, setOwners] = useState([]);
  const [persistedTasks, setPersistedTasks] = useState(record?.tasks || []);
  const [drafts, setDrafts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [busy, setBusy] = useState("");
  const [recentlySavedId, setRecentlySavedId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [ownerError, setOwnerError] = useState("");
  const [branchHrOwners, setBranchHrOwners] = useState([]);
  const [branchHrOwnerId, setBranchHrOwnerId] = useState("");
  const [branchHrError, setBranchHrError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/api/employees/onboarding/task-owners")
      .then((result) => {
        if (active) {
          setOwners(result.data || []);
          setOwnerError("");
        }
      })
      .catch((error) => {
        if (active) {
          setOwners([]);
          setOwnerError(error?.message || "Unable to load eligible task owners.");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!record?.id) return undefined;
    apiRequest(`/api/employees/onboarding/records/${encodeURIComponent(record.id)}/branch-hr-owners`)
      .then((result) => {
        if (active) {
          setBranchHrOwners(result.data || []);
          setBranchHrError("");
        }
      })
      .catch((error) => {
        if (active) {
          setBranchHrOwners([]);
          setBranchHrError(error?.message || "Branch HR owners are unavailable.");
        }
      });
    return () => { active = false; };
  }, [record?.id]);

  useEffect(() => {
    setPersistedTasks(record?.tasks || []);
    setDrafts({});
    setFeedback(null);
    setRecentlySavedId("");
  }, [record?.id, record?.tasks]);

  useEffect(() => {
    if (feedback?.type !== "success") return undefined;
    const timer = window.setTimeout(() => {
      setFeedback(null);
      setRecentlySavedId("");
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const groups = useMemo(() => {
    const grouped = new Map();
    persistedTasks.forEach((task) => {
      const category = task.category || "Other";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(task);
    });
    return Array.from(grouped, ([category, tasks]) => ({
      category,
      tasks,
      completed: tasks.filter(resolved).length,
      overdue: tasks.filter((task) => task.isOverdue).length,
      inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    }));
  }, [persistedTasks]);

  useEffect(() => {
    setExpanded((current) => {
      const next = { ...current };
      groups.forEach((group, index) => {
        if (!(group.category in next)) {
          next[group.category] = group.overdue > 0 || group.inProgress > 0 || index === 0;
        }
      });
      return next;
    });
  }, [record?.id, groups]);

  const draft = (task) => drafts[task.id] || {
    status: task.status,
    ownerUserId: task.ownerUserId || "",
    dueDate: toDateInput(task.dueDate),
    notes: task.notes || "",
  };
  const set = (task, field, value) => setDrafts((current) => ({
    ...current, [task.id]: { ...draft(task), [field]: value },
  }));

  async function save(task) {
    setBusy(task.id); setFeedback(null); setRecentlySavedId("");
    try {
      const result = await apiRequest(`/api/employees/onboarding/records/${encodeURIComponent(record.id)}/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH", body: draft(task),
      });
      const saved = result?.data || task;
      setPersistedTasks((current) => {
        const next = current.map((item) => item.id === task.id ? saved : item);
        const categoryTasks = next.filter((item) => (item.category || "Other") === (task.category || "Other"));
        if (categoryTasks.length && categoryTasks.every(resolved)) {
          setExpanded((open) => ({ ...open, [task.category || "Other"]: false }));
        }
        return next;
      });
      setDrafts((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setRecentlySavedId(task.id);
      setFeedback({ type: "success", message: `${task.title} updated.` });
      await onSaved?.(saved);
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "Unable to update checklist task." });
    } finally { setBusy(""); }
  }

  async function assignBranchHr() {
    if (!branchHrOwnerId) {
      setFeedback({ type: "error", message: "Select the branch HR & Admin Officer first." });
      return;
    }
    setBusy("assign-branch-hr");
    setFeedback(null);
    try {
      const result = await apiRequest(`/api/employees/onboarding/records/${encodeURIComponent(record.id)}/tasks/assign-branch-hr`, {
        method: "POST",
        body: { ownerUserId: branchHrOwnerId, overwriteExisting: false },
      });
      setPersistedTasks(result?.data?.tasks || []);
      setDrafts({});
      setFeedback({ type: "success", message: `${result?.data?.assigned || 0} unassigned checklist task(s) assigned to the selected branch HR officer. Already assigned tasks were preserved.` });
      await onSaved?.();
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "Unable to assign branch HR task owners." });
    } finally {
      setBusy("");
    }
  }

  if (!record) return null;
  const completedCount = persistedTasks.filter(resolved).length;
  const outstandingCount = persistedTasks.length - completedCount;
  const overdueCount = persistedTasks.filter((task) => task.isOverdue).length;
  return <section className="onboarding-task-panel">
    <div><strong>Operational Checklist</strong><span>{persistedTasks.length ? `${completedCount}/${persistedTasks.length} complete · ${outstandingCount} outstanding · ${overdueCount} overdue` : "No deterministic template tasks available"}</span></div>
    <div className="onboarding-task-context"><strong>Onboarding Progress: {Number(record.completionPercent || 0)}%</strong><span>Operational tasks track accountability. Completed sections satisfy untouched matching tasks; explicitly managed tasks remain independent.</span></div>
    <div className="onboarding-task-owner-mode" role="group" aria-label="Onboarding task ownership">
      <strong>Assign all to Branch HR &amp; Admin Officer</strong>
      <p className="onboarding-task-owner-help">Select the officer responsible for this employee’s branch and assign all currently unassigned operational checklist tasks in one action.</p>
      <div className="onboarding-task-owner-controls">
        <select aria-label="Branch HR and Admin Officer" value={branchHrOwnerId} onChange={(event) => setBranchHrOwnerId(event.target.value)}>
          <option value="">Select Branch HR &amp; Admin Officer</option>
          {branchHrOwners.map((owner) => <option key={owner.id} value={owner.id}>{person(owner)}</option>)}
        </select>
        <button type="button" className="onboarding-task-assign-all" disabled={Boolean(busy) || !branchHrOwnerId} onClick={assignBranchHr}>
          {busy === "assign-branch-hr" ? "Assigning…" : "Assign All to Branch HR & Admin Officer"}
        </button>
      </div>
      {branchHrError && <div className="onboarding-task-feedback is-error" role="alert">{branchHrError}</div>}
      {!branchHrError && branchHrOwners.length === 0 && <small>No eligible officer has been linked to this branch yet. Assign the officer’s HR/Admin role and branch in CHRiS.</small>}
      <p className="onboarding-task-owner-help">Alternatively, retain the default workflow: assign different owners using the individual Owner dropdown on each task below. Existing owners and completed task statuses are preserved.</p>
    </div>
    {ownerError && <div className="onboarding-task-feedback is-error" role="alert">{ownerError}</div>}
    {feedback && <div className={`onboarding-task-feedback ${feedback.type === "error" ? "is-error" : ""}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</div>}
    {groups.map((group) => <div className="onboarding-task-group" key={group.category}>
      <button
        type="button"
        className="onboarding-task-group__toggle"
        aria-expanded={expanded[group.category] === true}
        onClick={() => setExpanded((current) => ({ ...current, [group.category]: !current[group.category] }))}
      >
        <span><strong>{group.category}</strong><small>{group.completed}/{group.tasks.length} complete</small></span>
        <span>{group.overdue ? `${group.overdue} overdue · ` : ""}{expanded[group.category] ? "Collapse" : "Expand"}</span>
      </button>
      {expanded[group.category] ? <div className="onboarding-task-group__items">
        {group.tasks.map((task) => { const value = draft(task); const dirty = Boolean(drafts[task.id]); return <article key={task.id} className={task.isOverdue ? "is-overdue" : ""}>
          <header><div><strong>{task.title}</strong><small>{task.isRequired ? "Required" : "Optional"}{task.completionSource === "SECTION_INFERRED" ? " · Satisfied by completed onboarding section" : task.completionSource === "OPTIONAL_SECTION_INFERRED" ? " · Optional after workflow completion" : ""}</small></div>{task.isOverdue && <b>Overdue</b>}</header>
          <div className="onboarding-task-grid">
            <label>Owner<select value={value.ownerUserId} onChange={(event) => set(task, "ownerUserId", event.target.value)}><option value="">Unassigned</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{person(owner)}</option>)}</select></label>
            <label>Due Date<input type="date" value={value.dueDate} onChange={(event) => set(task, "dueDate", event.target.value)} /></label>
            <label>Status<select value={value.status} onChange={(event) => set(task, "status", event.target.value)}><option value="NOT_STARTED">Not Started</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option><option value="NOT_APPLICABLE">Not Applicable</option></select></label>
            <label>Notes<input value={value.notes} onChange={(event) => set(task, "notes", event.target.value)} placeholder={value.status === "NOT_APPLICABLE" ? "Reason required" : "Notes"} /></label>
          </div>
          {(task.completedBy || task.completedAt) && <small>Completed by {person(task.completedBy)} · {task.completedAt ? new Date(task.completedAt).toLocaleString("en-NG") : "—"}</small>}
          <button type="button" disabled={busy === task.id || !dirty} onClick={() => save(task)}>{busy === task.id ? "Saving…" : dirty ? "Save Task" : recentlySavedId === task.id ? "Saved" : "No changes"}</button>
        </article>; })}
      </div> : null}
    </div>)}
  </section>;
}
