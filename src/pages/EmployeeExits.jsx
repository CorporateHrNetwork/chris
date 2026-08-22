import EmployeeStatusBadge from "../components/common/StatusBadge";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaCheckCircle, FaRedo, FaSignOutAlt } from "react-icons/fa";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

const EXIT_TYPES = [
  ["RESIGNATION", "Resignation"],
  ["TERMINATION", "Termination"],
  ["RETIREMENT", "Retirement"],
  ["END_OF_CONTRACT", "End of Contract"],
  ["REDUNDANCY", "Redundancy"],
  ["OTHER", "Other"],
];

const NOTICE_STATUSES = [
  ["IN_PROGRESS", "In Progress"],
  ["SERVED", "Served"],
  ["WAIVED", "Waived"],
  ["NOT_REQUIRED", "Not Required"],
];

const CLEARANCE_ITEMS = [
  ["assetsReturned", "Company Assets Returned"],
  ["accessDisabled", "System / Access Disabled"],
  ["handoverCompleted", "Handover Completed"],
  ["financeCleared", "Finance Clearance"],
  ["payrollCleared", "Payroll Clearance"],
  ["hrCleared", "HR Clearance"],
];

const EMPTY_EXIT = {
  exitType: "RESIGNATION",
  noticeDate: "",
  noticeStatus: "IN_PROGRESS",
  lastWorkingDay: "",
  reason: "",
  notes: "",
};

const EMPTY_REHIRE = {
  status: "ACTIVE",
  effectiveDate: new Date().toISOString().slice(0, 10),
  departmentId: "",
  designationId: "",
  locationId: "",
  reason: "",
  notes: "",
};

function nameOf(employee) {
  return [employee?.firstName, employee?.middleName, employee?.lastName]
    .filter(Boolean)
    .join(" ");
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateText(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function EmployeeExits() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const employeeNumber = searchParams.get("employeeNumber");
  const rehireNumber = searchParams.get("rehire");

  const { hasPermission } = useAuthorization();
  const canUpdate = hasPermission("employees.update");

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeRecord,setSelectedEmployeeRecord] = useState(null);
  const [rehireEmployeeRecord,setRehireEmployeeRecord] = useState(null);
  const [exits, setExits] = useState([]);
  const [exitRegister, setExitRegister] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [exitForm, setExitForm] = useState(EMPTY_EXIT);
  const [rehireForm, setRehireForm] = useState(EMPTY_REHIRE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [employeeResult, exitResult, registerResult, departmentResult, designationResult, locationResult] =
        await Promise.all([
          apiRequest("/api/employees"),
          apiRequest("/api/exits"),
          apiRequest("/api/exits/register"),
          apiRequest("/api/employees/career/departments"),
          apiRequest("/api/employees/career/catalog"),
          apiRequest("/api/location-catalog"),
        ]);

      setEmployees(employeeResult?.data || []);
      setExits(exitResult?.data || []);
      setExitRegister(registerResult?.data || []);
      setDepartments((departmentResult?.data || []).filter((item) => item.isActive !== false));
      setDesignations((designationResult?.data || []).filter((item) => item.isActive !== false));
      setLocations((locationResult?.data || []).filter((item) => item.isActive !== false));
    } catch (error) {
      setFeedback(error?.message || "Unable to load exit records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    let active = true;
    if (!employeeNumber) {
      setSelectedEmployeeRecord(null);
      return undefined;
    }

    apiRequest(`/api/employees/${encodeURIComponent(employeeNumber)}`)
      .then((result) => {
        if (active) setSelectedEmployeeRecord(result?.data || null);
      })
      .catch((error) => {
        if (active) {
          setSelectedEmployeeRecord(null);
          setFeedback(error?.message || "Unable to load the selected employee.");
        }
      });

    return () => { active = false; };
  }, [employeeNumber]);

  useEffect(() => {
    let active = true;
    if (!rehireNumber) {
      setRehireEmployeeRecord(null);
      return undefined;
    }

    apiRequest(`/api/employees/${encodeURIComponent(rehireNumber)}`)
      .then((result) => {
        if (active) setRehireEmployeeRecord(result?.data || null);
      })
      .catch((error) => {
        if (active) {
          setRehireEmployeeRecord(null);
          setFeedback(error?.message || "Unable to load the exited employee.");
        }
      });

    return () => { active = false; };
  }, [rehireNumber]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(""), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const selectedEmployee = selectedEmployeeRecord;

  const rehireEmployee = rehireEmployeeRecord;

  const activeExit = useMemo(
    () =>
      selectedEmployee
        ? exits.find(
            (item) =>
              item.employeeId === selectedEmployee.id &&
              !["COMPLETED", "CANCELLED"].includes(item.status)
          ) || null
        : null,
    [selectedEmployee, exits]
  );

  const exitedEmployees = exitRegister;

  const rehireDesignationOptions = useMemo(
    () =>
      designations.filter(
        (item) => String(item.departmentId || "") === String(rehireForm.departmentId || "")
      ),
    [designations, rehireForm.departmentId]
  );

  useEffect(() => {
    if (!rehireEmployee) return;

    const departmentId =
      departments.some((item) => item.id === rehireEmployee.department?.id)
        ? rehireEmployee.department.id
        : "";

    const designationId =
      designations.some(
        (item) =>
          item.id === rehireEmployee.designation?.id &&
          item.departmentId === departmentId
      )
        ? rehireEmployee.designation.id
        : "";

    const locationId =
      locations.some((item) => item.id === rehireEmployee.location?.id)
        ? rehireEmployee.location.id
        : "";

    setRehireForm((current) => ({
      ...current,
      departmentId,
      designationId,
      locationId,
    }));
  }, [rehireEmployee, departments, designations, locations]);

  function setExitField(name, value) {
    setExitForm((current) => ({ ...current, [name]: value }));
  }

  function setRehireField(name, value) {
    setRehireForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "departmentId" ? { designationId: "" } : {}),
    }));
  }

  async function initiateExit(event) {
    event.preventDefault();
    if (!selectedEmployee) return;

    setBusy(true);
    setFeedback("");

    try {
      const result = await apiRequest("/api/exits", {
        method: "POST",
        body: {
          ...exitForm,
          employeeId: selectedEmployee.id,
        },
      });

      setFeedback(result?.message || "Exit process initiated.");
      await loadData();
    } catch (error) {
      setFeedback(error?.message || "Unable to initiate exit.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleClearance(key) {
    if (!activeExit || activeExit.status === "COMPLETED") return;

    setBusy(true);
    try {
      const result = await apiRequest(
        `/api/exits/${encodeURIComponent(activeExit.id)}`,
        {
          method: "PATCH",
          body: {
            clearance: {
              [key]: !activeExit.clearance?.[key],
            },
          },
        }
      );

      setExits((current) =>
        current.map((item) => (item.id === result.data.id ? result.data : item))
      );
      setFeedback(result?.message || "Exit clearance updated.");
    } catch (error) {
      setFeedback(error?.message || "Unable to update exit clearance.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelExit() {
    if (!activeExit) return;

    const reason = String(cancellationReason || "").trim();

    if (!reason) {
      setFeedback("A cancellation reason is required.");
      return;
    }

    if (
      !window.confirm(
        `Cancel exit processing for ${nameOf(
          activeExit.employee
        )}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setFeedback("");

    try {
      const result = await apiRequest(
        `/api/exits/${encodeURIComponent(activeExit.id)}/cancel`,
        {
          method: "POST",
          body: {
            cancellationReason: reason,
          },
        }
      );

      setCancellationReason("");
      setFeedback(
        result?.message ||
          "Exit processing cancelled successfully."
      );

      await loadData();
      navigate("/employees/directory");
    } catch (error) {
      setFeedback(
        error?.message ||
          "Unable to cancel exit processing."
      );
    } finally {
      setBusy(false);
    }
  }

  async function completeExit() {
    if (!activeExit) return;

    if (
      !window.confirm(
        `Complete the exit for ${nameOf(activeExit.employee)}? The employee will move to Exits.`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest(
        `/api/exits/${encodeURIComponent(activeExit.id)}/complete`,
        { method: "POST" }
      );

      setFeedback(result?.message || "Employee exit completed.");
      await loadData();
      navigate("/employees/exits");
    } catch (error) {
      setFeedback(error?.message || "Unable to complete employee exit.");
    } finally {
      setBusy(false);
    }
  }

  async function processRehire(event) {
    event.preventDefault();
    if (!rehireEmployee) return;

    setBusy(true);
    setFeedback("");

    try {
      const result = await apiRequest(
        `/api/employees/${encodeURIComponent(rehireEmployee.employeeNumber)}/rehire`,
        {
          method: "PATCH",
          body: rehireForm,
        }
      );

      setFeedback(result?.message || "Employee rehired successfully.");
      setRehireForm(EMPTY_REHIRE);
      await loadData();
      navigate("/employees/exits");
    } catch (error) {
      setFeedback(error?.message || "Unable to rehire employee.");
    } finally {
      setBusy(false);
    }
  }

  if (employeeNumber) {
    return (
      <div>
        <PageHero
          eyebrow="EMPLOYEE LIFECYCLE"
          title="Process Employee Exit"
          subtitle="Complete the exit workflow for the employee selected from Employee Directory."
          action={
            <button type="button" onClick={() => navigate("/employees/directory")} style={secondaryButton}>
              <FaArrowLeft /> Employee Directory
            </button>
          }
        />

        {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}

        {loading ? (
          <div style={panel}>Loading employee exit workflow...</div>
        ) : !selectedEmployee ? (
          <div style={warning}>Selected employee could not be found.</div>
        ) : (
          <div style={twoColumn}>
            <EmployeeCard employee={selectedEmployee} />

            <section style={panel}>
              {!activeExit ? (
                <>
                  <div style={eyebrow}>EXIT INITIATION</div>
                  <h2 style={sectionTitle}>Separation Details</h2>

                  <form onSubmit={initiateExit} style={formGrid}>
                    <Field label="Exit Type">
                      <select value={exitForm.exitType} onChange={(e) => setExitField("exitType", e.target.value)} style={input}>
                        {EXIT_TYPES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Notice Date">
                      <input type="date" value={exitForm.noticeDate} onChange={(e) => setExitField("noticeDate", e.target.value)} style={input} />
                    </Field>

                    <Field label="Notice Status">
                      <select value={exitForm.noticeStatus} onChange={(e) => setExitField("noticeStatus", e.target.value)} style={input}>
                        {NOTICE_STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Last Working Day">
                      <input type="date" value={exitForm.lastWorkingDay} onChange={(e) => setExitField("lastWorkingDay", e.target.value)} style={input} required />
                    </Field>

                    <div style={full}>
                      <Field label="Exit Reason">
                        <textarea value={exitForm.reason} onChange={(e) => setExitField("reason", e.target.value)} style={textarea} required />
                      </Field>
                    </div>

                    <div style={full}>
                      <Field label="HR Notes">
                        <textarea value={exitForm.notes} onChange={(e) => setExitField("notes", e.target.value)} style={textarea} />
                      </Field>
                    </div>

                    <div style={footer}>
                      <span style={muted}>
                        Initiating the exit does not remove the employee. Complete clearance below before final exit.
                      </span>
                      <button type="submit" disabled={busy || !canUpdate} style={primaryButton}>
                        <FaSignOutAlt /> {busy ? "Saving..." : "Initiate Exit"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div style={eyebrow}>EXIT CLEARANCE</div>
                  <h2 style={sectionTitle}>Complete Separation Workflow</h2>

                  <div style={processMeta}>
                    <span>Exit Type: <strong>{titleCase(activeExit.exitType)}</strong></span>
                    <span>Last Working Day: <strong>{dateText(activeExit.lastWorkingDay)}</strong></span>
                    <span>Process: <strong>{titleCase(activeExit.status)}</strong></span>
                  </div>

                  <div style={clearanceGrid}>
                    {CLEARANCE_ITEMS.map(([key, label]) => (
                      <label key={key} style={clearanceItem}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeExit.clearance?.[key])}
                          onChange={() => toggleClearance(key)}
                          disabled={busy || !canUpdate}
                          style={{ accentColor: "#087A43" }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <Field label="Cancellation Reason">
                      <textarea
                        value={cancellationReason}
                        onChange={(event) =>
                          setCancellationReason(event.target.value)
                        }
                        placeholder="Enter the reason if this exit process is being cancelled."
                        style={textarea}
                        disabled={busy || !canUpdate}
                      />
                    </Field>
                    <div style={{ ...muted, marginTop: 7 }}>
                      Required only when cancelling the exit process. The reason is retained in the exit audit record.
                    </div>
                  </div>

<div style={footer}>
  <span style={muted}>
    All six clearance items must be complete before CHRIS closes the employment episode.
  </span>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 10,
      flexWrap: "wrap",
    }}
  >
    <button
      type="button"
      onClick={cancelExit}
      disabled={
        busy ||
        !canUpdate ||
        !String(cancellationReason || "").trim()
      }
      style={{
        ...secondaryButton,
        opacity:
          String(cancellationReason || "").trim()
            ? 1
            : 0.45,
        minHeight: 42,
        borderColor: "rgba(239,68,68,.65)",
        background: "rgba(127,29,29,.20)",
        color: "#FCA5A5",
        fontWeight: 900,
      }}
    >
      Cancel Exit Processing
    </button>

    <button
      type="button"
      onClick={completeExit}
      disabled={
        busy ||
        !activeExit.clearanceComplete ||
        !canUpdate
      }
      style={{
        ...primaryButton,
        opacity:
          activeExit.clearanceComplete
            ? 1
            : 0.42,
      }}
    >
      <FaCheckCircle /> Complete Exit
    </button>
  </div>
</div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    );
  }

  if (rehireNumber) {
    return (
      <div>
        <PageHero
          eyebrow="EMPLOYEE LIFECYCLE"
          title="Rehire Employee"
          subtitle="Start a new employment episode while preserving the employee's permanent CHRIS identity and history."
          action={
            <button type="button" onClick={() => navigate("/employees/exits")} style={secondaryButton}>
              <FaArrowLeft /> Exited Employees
            </button>
          }
        />

        {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}

        {loading ? (
          <div style={panel}>Loading rehire workflow...</div>
        ) : !rehireEmployee ? (
          <div style={warning}>Selected exited employee could not be found.</div>
        ) : (
          <div style={twoColumn}>
            <EmployeeCard employee={rehireEmployee} />

            <section style={panel}>
              <div style={eyebrow}>NEW EMPLOYMENT EPISODE</div>
              <h2 style={sectionTitle}>Rehire Details</h2>

              <form onSubmit={processRehire} style={formGrid}>
                <Field label="Employment Status">
                  <select value={rehireForm.status} onChange={(e) => setRehireField("status", e.target.value)} style={input}>
                    <option value="ACTIVE">Active</option>
                    <option value="PROBATION">Probation</option>
                  </select>
                </Field>

                <Field label="Effective Date">
                  <input type="date" value={rehireForm.effectiveDate} onChange={(e) => setRehireField("effectiveDate", e.target.value)} style={input} required />
                </Field>

                <Field label="Department">
                  <select value={rehireForm.departmentId} onChange={(e) => setRehireField("departmentId", e.target.value)} style={input} required>
                    <option value="">Select department</option>
                    {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>

                <Field label="Designation">
                  <select value={rehireForm.designationId} onChange={(e) => setRehireField("designationId", e.target.value)} style={input} required>
                    <option value="">Select designation</option>
                    {rehireDesignationOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>

                <Field label="Work Location">
                  <select value={rehireForm.locationId} onChange={(e) => setRehireField("locationId", e.target.value)} style={input} required>
                    <option value="">Select location</option>
                    {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>

                <div style={full}>
                  <Field label="Rehire Reason">
                    <textarea value={rehireForm.reason} onChange={(e) => setRehireField("reason", e.target.value)} style={textarea} required />
                  </Field>
                </div>

                <div style={full}>
                  <Field label="HR Notes">
                    <textarea value={rehireForm.notes} onChange={(e) => setRehireField("notes", e.target.value)} style={textarea} />
                  </Field>
                </div>

                <div style={footer}>
                  <span style={muted}>Rehire creates a new employment episode; previous exit history remains preserved.</span>
                  <button type="submit" disabled={busy || !canUpdate} style={primaryButton}>
                    <FaRedo /> {busy ? "Saving..." : "Rehire Employee"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHero
        eyebrow="EMPLOYEE LIFECYCLE"
        title="Exited Employees"
        subtitle="Current-state exit register for employees whose employment relationship has concluded."
      />

      {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}

      <section style={panel}>
        <div style={sectionHeader}>
          <div>
            <div style={eyebrow}>EXIT REGISTER</div>
            <h2 style={sectionTitle}>Exited Employee Records</h2>
          </div>
          <span style={countBadge}>
            {loading ? "..." : exitedEmployees.length} record{exitedEmployees.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div style={empty}>Loading exited employees...</div>
        ) : exitedEmployees.length ? (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Employee</th>
                  <th style={th}>Department</th>
                  <th style={th}>Designation</th>
                  <th style={th}>Location</th>
                  <th style={th}>Status</th>
                  <th style={th}>Exit Date</th>
                  <th style={th}>Exit Workflow</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {exitedEmployees.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td style={td}>
                      <strong style={{ color: "#F7FAF8" }}>{nameOf(employee)}</strong>
                      <div style={muted}>{employee.employeeNumber}</div>
                    </td>
                    <td style={td}>{employee.department?.name || "-"}</td>
                    <td style={td}>{employee.designation?.name || "-"}</td>
                    <td style={td}>{employee.location?.name || "-"}</td>
                    <td style={td}><EmployeeStatusBadge status={employee.status} /></td>
                    <td style={td}>{dateText(employee.exitProcess?.effectiveDate || employee.exitDate)}</td>
                    <td style={td}>{employee.exitProcess ? `${titleCase(employee.exitProcess.status)} · ${titleCase(employee.exitProcess.exitType)}` : "Not recorded"}</td>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/employees/exits?rehire=${encodeURIComponent(employee.employeeNumber)}`)
                        }
                        style={rehireButton}
                        disabled={!canUpdate}
                      >
                        <FaRedo /> Rehire
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={empty}>No exited employee records yet.</div>
        )}
      </section>
    </div>
  );
}

function PageHero({ eyebrow: kicker, title, subtitle, action }) {
  return (
    <div style={hero}>
      <div>
        <div style={eyebrow}>{kicker}</div>
        <h1 style={pageTitle}>{title}</h1>
        <p style={subtitleStyle}>{subtitle}</p>
      </div>
      {action || null}
    </div>
  );
}

function EmployeeCard({ employee }) {
  return (
    <section style={employeeCard}>
      <div style={eyebrow}>SELECTED EMPLOYEE</div>
      <h2 style={employeeNameStyle}>{nameOf(employee)}</h2>
      <div style={employeeNumberStyle}>{employee.employeeNumber}</div>
      <div style={divider} />
      <Info label="Department" value={employee.department?.name || "-"} />
      <Info label="Designation" value={employee.designation?.name || "-"} />
      <Info label="Location" value={employee.location?.name || "-"} />
      <Info label="Current Status" value={titleCase(employee.status)} />
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div style={infoRow}>
      <span style={muted}>{label}</span>
      <strong style={infoValue}>{value}</strong>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={field}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

const hero = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  padding: "24px 26px",
  marginBottom: 20,
  border: "1px solid rgba(212,175,55,.46)",
  borderRadius: 20,
  background:
    "radial-gradient(circle at 88% 10%,rgba(212,175,55,.12),transparent 28%),radial-gradient(circle at 8% 0%,rgba(46,233,139,.11),transparent 30%),linear-gradient(145deg,#063722,#02170f)",
  boxShadow: "0 20px 50px rgba(0,0,0,.28)",
};

const eyebrow = {
  color: "var(--chris-gold)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".13em",
  marginBottom: 6,
};

const pageTitle = {
  margin: 0,
  color: "#F7FAF8",
  fontSize: 31,
  fontWeight: 900,
};

const subtitleStyle = {
  margin: "8px 0 0",
  color: "#C7D3CC",
  fontSize: 14,
  lineHeight: 1.6,
};

const twoColumn = {
  display: "grid",
  gridTemplateColumns: "minmax(260px,.72fr) minmax(0,1.6fr)",
  gap: 18,
};

const panel = {
  padding: 20,
  border: "1px solid rgba(212,175,55,.30)",
  borderRadius: 18,
  background: "linear-gradient(145deg,rgba(4,36,23,.94),rgba(2,19,13,.96))",
  boxShadow: "0 18px 42px rgba(0,0,0,.22)",
};

const employeeCard = {
  ...panel,
  alignSelf: "start",
  background: "linear-gradient(160deg,rgba(6,55,34,.98),rgba(2,23,15,.98))",
};

const employeeNameStyle = { margin: "10px 0 0", color: "#F7FAF8", fontSize: 22, fontWeight: 900 };
const employeeNumberStyle = { marginTop: 4, color: "#AFC0B7", fontSize: 12, fontWeight: 700 };
const divider = { height: 1, margin: "18px 0", background: "rgba(212,175,55,.18)" };
const infoRow = { display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.035)" };
const infoValue = { color: "#F4F7F5", fontSize: 12, textAlign: "right" };
const sectionTitle = { margin: 0, color: "#F7FAF8", fontSize: 20, fontWeight: 900 };
const sectionHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 };
const countBadge = { padding: "7px 10px", border: "1px solid rgba(212,175,55,.25)", borderRadius: 999, color: "#C7D3CC", fontSize: 11, fontWeight: 800 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, marginTop: 18 };
const full = { gridColumn: "1 / -1" };
const field = { display: "grid", gap: 7 };
const fieldLabel = { color: "#B8C7BF", fontSize: 11, fontWeight: 850 };
const input = { width: "100%", minHeight: 43, boxSizing: "border-box", border: "1px solid rgba(212,175,55,.20)", borderRadius: 9, outline: "none", background: "#061A11", color: "#F5F7F6", padding: "0 12px", fontSize: 13 };
const textarea = { ...input, minHeight: 92, padding: 12, resize: "vertical", lineHeight: 1.5 };
const footer = { gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, marginTop: 16 };
const muted = { color: "#8FA298", fontSize: 11, lineHeight: 1.55 };
const primaryButton = { minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 16px", border: "1px solid var(--chris-gold)", borderRadius: 9, background: "linear-gradient(135deg,#D4AF37,#C59A22)", color: "#08140E", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const secondaryButton = { minHeight: 42, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 15px", border: "1px solid rgba(212,175,55,.65)", borderRadius: 10, background: "rgba(212,175,55,.06)", color: "var(--chris-gold)", fontWeight: 850, cursor: "pointer" };
const feedbackStyle = { marginBottom: 16, padding: "12px 15px", border: "1px solid rgba(212,175,55,.35)", borderRadius: 10, background: "rgba(212,175,55,.07)", color: "#F5F7F6", fontSize: 13, fontWeight: 700 };
const warning = { padding: 16, border: "1px solid rgba(212,175,55,.30)", borderRadius: 12, background: "rgba(212,175,55,.07)", color: "#EDE5C8", fontSize: 13 };
const processMeta = { display: "flex", flexWrap: "wrap", gap: 14, margin: "16px 0", color: "#B8C7BF", fontSize: 12 };
const clearanceGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 };
const clearanceItem = { display: "flex", alignItems: "center", gap: 9, padding: 12, border: "1px solid rgba(212,175,55,.18)", borderRadius: 10, background: "rgba(255,255,255,.015)", color: "#E7EEEA", fontSize: 12, fontWeight: 700 };
const tableWrap = { overflowX: "auto", border: "1px solid rgba(255,255,255,.055)", borderRadius: 13 };
const table = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const th = { padding: "12px 14px", textAlign: "left", borderBottom: "1px solid rgba(212,175,55,.20)", background: "rgba(255,255,255,.025)", color: "#AFC0B7", fontSize: 10, fontWeight: 900, textTransform: "uppercase" };
const td = { padding: "13px 14px", borderBottom: "1px solid rgba(255,255,255,.045)", color: "#E5ECE8", fontSize: 12 };
const rehireButton = { minHeight: 34, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", border: "1px solid rgba(212,175,55,.45)", borderRadius: 8, background: "rgba(212,175,55,.07)", color: "var(--chris-gold)", fontWeight: 850, cursor: "pointer" };
const empty = { minHeight: 150, display: "grid", placeItems: "center", color: "#9FB0A7", fontSize: 13 };