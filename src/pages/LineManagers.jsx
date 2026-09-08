import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";
import SearchableRegistrySelect from "../components/common/SearchableRegistrySelect";

const today = new Date().toISOString().slice(0, 10);
const fullName = (value) => [value?.firstName, value?.middleName, value?.lastName].filter(Boolean).join(" ");

function employeeLabel(employee) {
  return [
    employee?.employeeNumber,
    fullName(employee),
    employee?.designation?.name || "No designation",
    employee?.location?.name || "No location",
  ].filter(Boolean).join(" · ");
}

export default function LineManagers() {
  const { hasPermission } = useAuthorization();
  const canUpdate = hasPermission("employees.update");
  const [employees, setEmployees] = useState([]);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [managerSearch, setManagerSearch] = useState("");
  const [managerData, setManagerData] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [form, setForm] = useState({
    managerEmployeeId: "",
    effectiveFrom: today,
    reason: "",
    notes: "",
    hierarchyOverride: false,
    hierarchyOverrideReason: "",
  });
  const [message, setMessage] = useState("");
  const [messageVersion, setMessageVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  function showMessage(value) {
    setMessage(value || "");
    setMessageVersion((current) => current + 1);
  }

  async function loadRecord(number = employeeNumber) {
    if (!number) {
      setManagerData(null);
      setHierarchy(null);
      return;
    }
    const [record, candidates] = await Promise.all([
      apiRequest(`/api/line-managers/employees/${encodeURIComponent(number)}`),
      apiRequest(`/api/line-managers/employees/${encodeURIComponent(number)}/candidates`),
    ]);
    setManagerData(record);
    setHierarchy(candidates.data || null);
    const currentManager = record.current?.manager || null;
    setManagerSearch(currentManager ? employeeLabel(currentManager) : "");
    setForm({
      managerEmployeeId: record.current?.managerEmployeeId || "",
      effectiveFrom: today,
      reason: "",
      notes: "",
      hierarchyOverride: false,
      hierarchyOverrideReason: "",
    });
  }

  useEffect(() => {
    apiRequest("/api/line-managers/eligible")
      .then((result) => setEmployees(result.data || []))
      .catch((error) => showMessage(error.message));
  }, []);

  useEffect(() => {
    loadRecord(employeeNumber).catch((error) => showMessage(error.message));
  }, [employeeNumber]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message, messageVersion]);

  const selected = useMemo(
    () => employees.find((item) => item.employeeNumber === employeeNumber),
    [employees, employeeNumber]
  );

  const employeeOptions = useMemo(
    () => employees.map((employee) => ({
      value: employee.employeeNumber,
      label: employeeLabel(employee),
      employee,
    })),
    [employees]
  );

  const hierarchyCandidates = hierarchy?.candidates || [];
  const managerPool = form.hierarchyOverride
    ? employees.filter((item) => item.employeeNumber !== employeeNumber)
    : hierarchyCandidates;
  const managerOptions = managerPool.map((manager) => ({
    value: manager.id,
    label: employeeLabel(manager),
    manager,
  }));

  async function save(event) {
    event.preventDefault();
    setMessage("");
    if (!form.managerEmployeeId) return showMessage("Select a line manager.");
    if (form.hierarchyOverride && !form.hierarchyOverrideReason.trim()) {
      return showMessage("Enter a reason for the hierarchy override.");
    }
    setBusy(true);
    try {
      const result = await apiRequest(`/api/line-managers/employees/${encodeURIComponent(employeeNumber)}`, {
        method: "PUT",
        body: form,
      });
      showMessage(result.message);
      await loadRecord();
    } catch (error) {
      showMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setMessage("");
    if (!form.reason.trim()) return showMessage("A reason is required when removing a manager.");
    if (!window.confirm("Remove the current line manager?")) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/api/line-managers/employees/${encodeURIComponent(employeeNumber)}`, {
        method: "DELETE",
        body: { effectiveTo: form.effectiveFrom, reason: form.reason, notes: form.notes },
      });
      showMessage(result.message);
      await loadRecord();
    } catch (error) {
      showMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <header style={hero}>
      <div style={eyebrow}>ORGANIZATION STRUCTURE</div>
      <h1 style={title}>Line Managers</h1>
      <p style={muted}>Designation hierarchy determines eligible managers; the employee assignment records the actual reporting relationship.</p>
    </header>

    {message ? <div style={feedback}>{message}</div> : null}

    <div style={columns}>
      <section style={panel}>
        <div style={eyebrow}>EMPLOYEE</div>
        <SearchableRegistrySelect
          value={employeeSearch}
          options={employeeOptions}
          placeholder="Search employee number, name, designation or location"
          ariaLabel="Search employee"
          inputStyle={field}
          onChange={(label, option) => {
            setMessage("");
            setEmployeeSearch(label);
            if (option) setEmployeeNumber(option.value);
            else if (!label) setEmployeeNumber("");
          }}
        />

        {selected ? <div style={card}>
          <strong>{fullName(selected)}</strong>
          <span>{selected.designation?.name || "No designation"}</span>
          <span>{selected.department?.name || "No department"} · {selected.location?.name || "No location"}</span>
        </div> : null}

        {managerData?.current ? <div style={card}>
          <div style={eyebrow}>CURRENT LINE MANAGER</div>
          <strong>{fullName(managerData.current.manager)}</strong>
          <span>{managerData.current.manager.employeeNumber}</span>
          <span>{managerData.current.manager.designation?.name || "No designation"}</span>
          <span>{managerData.current.manager.department?.name || "No department"}</span>
          <small>Effective {new Date(managerData.current.effectiveFrom).toLocaleDateString()}</small>
        </div> : employeeNumber ? <p style={muted}>No current manager assigned.</p> : null}
      </section>

      <section style={panel}>
        <div style={eyebrow}>DESIGNATION HIERARCHY</div>
        {employeeNumber && hierarchy ? <div style={hierarchyBox}>
          <div><strong>Reports-To Designation:</strong> {hierarchy.directReportsToDesignation?.name || "No parent designation"}</div>
          <div><strong>Resolved Manager Designation:</strong> {hierarchy.resolvedManagerDesignation?.name || "No occupied manager in hierarchy"}</div>
          <div><strong>Hierarchy path:</strong> {hierarchy.hierarchyHops ? `${hierarchy.hierarchyHops} level${hierarchy.hierarchyHops === 1 ? "" : "s"}` : "Not resolved"}</div>
          <div><strong>Valid candidates:</strong> {hierarchyCandidates.length}</div>
          {hierarchy.requiresManualSelection ? <div style={warning}>Several equally ranked hierarchy candidates remain. HR must select the actual manager.</div> : null}
          {hierarchy.hierarchyStatus === "NO_MANAGER_IN_HIERARCHY" ? <div style={warning}>Management Structure Gap: there is no occupied superior designation in this employee's hierarchy.</div> : null}
        </div> : <p style={muted}>Select an employee to resolve the reporting hierarchy.</p>}

        <div style={{ ...eyebrow, marginTop: 18 }}>ASSIGNMENT WORKFLOW</div>
        <h2>{managerData?.current ? "Change Manager" : "Assign Manager"}</h2>
        <form onSubmit={save} style={formGrid}>
          <label style={{ ...label, gridColumn: "1/-1" }}>Eligible Manager
            <SearchableRegistrySelect
              value={managerSearch}
              options={managerOptions}
              placeholder={form.hierarchyOverride ? "Search all current employees" : "Search hierarchy-approved candidates"}
              ariaLabel="Search eligible line manager"
              inputStyle={field}
              onChange={(labelValue, option) => {
                setManagerSearch(labelValue);
                setForm((current) => ({ ...current, managerEmployeeId: option?.value || "" }));
              }}
            />
          </label>

          <label style={label}>Effective Date
            <input required type="date" style={field} value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          </label>

          <label style={label}>Reason {managerData?.current ? "*" : ""}
            <textarea required={Boolean(managerData?.current)} style={textarea} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>

          <label style={{ ...label, gridColumn: "1/-1" }}>
            <span><input type="checkbox" checked={form.hierarchyOverride} onChange={(event) => {
              const checked = event.target.checked;
              setManagerSearch("");
              setForm((current) => ({
                ...current,
                managerEmployeeId: "",
                hierarchyOverride: checked,
                hierarchyOverrideReason: checked ? current.hierarchyOverrideReason : "",
              }));
            }} /> Authorized hierarchy override</span>
            <small style={muted}>Use only where management has approved a person outside the resolved designation hierarchy.</small>
          </label>

          {form.hierarchyOverride ? <label style={{ ...label, gridColumn: "1/-1" }}>Hierarchy Override Reason *
            <textarea required style={textarea} value={form.hierarchyOverrideReason} onChange={(e) => setForm({ ...form, hierarchyOverrideReason: e.target.value })} />
          </label> : null}

          <label style={{ ...label, gridColumn: "1/-1" }}>HR Notes
            <textarea style={textarea} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>

          <div style={actions}>
            {managerData?.current ? <button type="button" style={danger} disabled={!canUpdate || busy} onClick={remove}>Remove Manager</button> : null}
            <button style={primary} disabled={!canUpdate || busy || !employeeNumber}>{busy ? "Saving..." : "Save Assignment"}</button>
          </div>
        </form>
      </section>
    </div>

    <section style={{ ...panel, marginTop: 18 }}>
      <div style={eyebrow}>MANAGEMENT HISTORY</div>
      {managerData?.history?.length ? <div style={history}>{managerData.history.map((item) => <article key={item.id} style={card}>
        <strong>{fullName(item.manager)} · {item.manager.employeeNumber}</strong>
        <span>{item.manager.designation?.name || "No designation"} · {item.manager.department?.name || "No department"}</span>
        <span>{new Date(item.effectiveFrom).toLocaleDateString()} — {item.effectiveTo ? new Date(item.effectiveTo).toLocaleDateString() : "Current"}</span>
        <span>{item.reason || "Initial assignment"}</span>
        {item.notes ? <small>{item.notes}</small> : null}
      </article>)}</div> : <p style={muted}>Select an employee to review manager history.</p>}
    </section>
  </div>;
}

const hero = { padding: 24, marginBottom: 18, borderRadius: 20, border: "1px solid rgba(212,175,55,.55)", background: "linear-gradient(145deg,#063722,#02170f)" };
const panel = { padding: 20, borderRadius: 18, border: "1px solid rgba(212,175,55,.3)", background: "linear-gradient(145deg,#042417,#02130d)", color: "#F7FAF8" };
const columns = { display: "grid", gridTemplateColumns: "minmax(280px,.8fr) minmax(0,1.3fr)", gap: 18 };
const title = { margin: 0, color: "#F7FAF8", fontSize: 31 };
const eyebrow = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".13em", marginBottom: 6 };
const muted = { color: "#AFC0B7" };
const feedback = { padding: 12, marginBottom: 16, border: "1px solid rgba(212,175,55,.35)", borderRadius: 10, background: "rgba(212,175,55,.08)", color: "#F7FAF8" };
const hierarchyBox = { display: "grid", gap: 8, padding: 14, border: "1px solid rgba(212,175,55,.2)", borderRadius: 11, color: "#C7D3CC" };
const warning = { padding: 10, borderRadius: 8, border: "1px solid rgba(245,158,11,.45)", background: "rgba(245,158,11,.1)", color: "#FCD34D" };
const field = { width: "100%", minHeight: 43, boxSizing: "border-box", padding: "0 12px", borderRadius: 9, border: "1px solid rgba(212,175,55,.25)", background: "#061A11", color: "#F7FAF8" };
const textarea = { ...field, minHeight: 78, padding: 12 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 };
const label = { display: "grid", gap: 7, color: "#B8C7BF", fontSize: 12, fontWeight: 800 };
const card = { display: "grid", gap: 6, marginTop: 14, padding: 14, border: "1px solid rgba(212,175,55,.18)", borderRadius: 11, color: "#C7D3CC" };
const history = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 };
const actions = { gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 };
const primary = { minHeight: 42, padding: "0 16px", borderRadius: 9, border: "1px solid #D4AF37", background: "#D4AF37", color: "#08140E", fontWeight: 900 };
const danger = { ...primary, borderColor: "#EF4444", background: "rgba(127,29,29,.25)", color: "#FCA5A5" };
