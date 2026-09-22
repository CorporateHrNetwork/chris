import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";
import EmployeeLookup from "../components/shared/EmployeeLookup";

const EMPTY = {
  employeeNumber: "",
  shiftId: "",
  assignmentType: "RECURRING",
  effectiveFrom: "",
  effectiveTo: "",
};

function ShiftSchedule() {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  async function load() {
    setError("");

    try {
      const [shiftResult, assignmentResult] = await Promise.all([
        apiRequest("/api/attendance/shifts"),
        apiRequest("/api/attendance/shift-assignments"),
      ]);

      setShifts(shiftResult.data || []);
      setAssignments(assignmentResult.data || []);
    } catch (err) {
      setError(err.message || "Unable to load shift schedule.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [message]);

  const visibleAssignments = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    if (!needle) {
      return assignments;
    }

    return assignments.filter((item) => {
      const employeeName = [
        item.employee?.firstName,
        item.employee?.middleName,
        item.employee?.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        String(item.employee?.employeeNumber || "")
          .toLowerCase()
          .includes(needle) ||
        employeeName.includes(needle) ||
        String(item.shift?.name || "")
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [assignments, filter]);

  const currentCount = useMemo(
    () =>
      assignments.filter((item) => isCurrent(item)).length,
    [assignments]
  );

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  function beginEdit(item) {
    setEditingId(item.id);
    setMessage("");
    setError("");

    setForm({
      employeeNumber:
        item.employee?.employeeNumber || "",
      shiftId:
        item.shiftId ||
        item.shift?.id ||
        "",
      assignmentType:
        item.effectiveTo
          ? "FIXED"
          : "RECURRING",
      effectiveFrom:
        toDateInput(item.effectiveFrom),
      effectiveTo:
        toDateInput(item.effectiveTo),
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    if (
      form.assignmentType === "FIXED" &&
      !form.effectiveTo
    ) {
      setBusy(false);
      setError(
        "Fixed-period assignments require an Effective To date."
      );
      return;
    }

    try {
      const payload = {
        shiftId:
          form.shiftId,
        effectiveFrom:
          form.effectiveFrom,
        effectiveTo:
          form.assignmentType === "RECURRING"
            ? null
            : form.effectiveTo,
      };

      if (editingId) {
        await apiRequest(
          `/api/attendance/shift-assignments/${editingId}`,
          {
            method:
              "PATCH",
            body:
              JSON.stringify(payload),
          }
        );

        setMessage(
          "Shift assignment updated successfully."
        );
      } else {
        await apiRequest(
          "/api/attendance/shift-assignments",
          {
            method:
              "POST",
            body:
              JSON.stringify({
                employeeNumber:
                  form.employeeNumber.trim(),
                ...payload,
              }),
          }
        );

        setMessage(
          form.assignmentType === "RECURRING"
            ? "Recurring shift assignment created successfully."
            : "Fixed-period shift assignment created successfully."
        );
      }

      reset();
      await load();
    } catch (err) {
      setError(
        err.message ||
          "Unable to save shift assignment."
      );
    } finally {
      setBusy(false);
    }
  }

  async function endAssignment(item) {
    const endDate =
      new Date()
        .toISOString()
        .slice(0, 10);

    if (
      !window.confirm(
        `End this recurring shift assignment effective ${endDate}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    try {
      await apiRequest(
        `/api/attendance/shift-assignments/${item.id}/end`,
        {
          method:
            "POST",
          body:
            JSON.stringify({
              effectiveTo:
                endDate,
            }),
        }
      );

      setMessage(
        "Recurring shift assignment ended successfully."
      );

      if (
        editingId === item.id
      ) {
        reset();
      }

      await load();
    } catch (err) {
      setError(
        err.message ||
          "Unable to end shift assignment."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(item) {
    if (
      !window.confirm(
        "Delete this shift assignment? CHRIS will block deletion when attendance history depends on it."
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    try {
      await apiRequest(
        `/api/attendance/shift-assignments/${item.id}`,
        {
          method:
            "DELETE",
        }
      );

      setMessage(
        "Unused shift assignment deleted successfully."
      );

      if (
        editingId === item.id
      ) {
        reset();
      }

      await load();
    } catch (err) {
      setError(
        err.message ||
          "Unable to delete shift assignment."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        color:
          "var(--chris-text-main)",
      }}
    >
      <button
        type="button"
        onClick={() =>
          navigate("/attendance")
        }
        style={backStyle}
      >
        {"\u2190"} Back to Time & Attendance Dashboard
      </button>

      <div
        style={{
          marginBottom:
            22,
        }}
      >
        <div style={eyebrowStyle}>
          TIME & ATTENDANCE
        </div>

        <h1 style={titleStyle}>
          Shift Schedule
        </h1>

        <p style={descriptionStyle}>
          Assign employees to fixed-period or recurring work shifts using effective-dated schedules.
        </p>
      </div>

      {message && (
        <Notice success>
          {message}
        </Notice>
      )}

      {error && (
        <Notice>
          {error}
        </Notice>
      )}

      <div style={metricGridStyle}>
        <Metric
          label="Assignments"
          value={assignments.length}
        />

        <Metric
          label="Current Assignments"
          value={currentCount}
        />

        <Metric
          label="Recurring"
          value={
            assignments.filter(
              (item) =>
                !item.effectiveTo
            ).length
          }
        />

        <Metric
          label="Scheduled Employees"
          value={
            new Set(
              assignments
                .map(
                  (item) =>
                    item.employee
                      ?.employeeNumber
                )
                .filter(Boolean)
            ).size
          }
        />
      </div>

      <div style={workspaceGridStyle}>
        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2
                style={{
                  margin:
                    0,
                }}
              >
                {editingId
                  ? "Edit Shift Assignment"
                  : "Assign Employee Shift"}
              </h2>

              <p style={sectionSubStyle}>
                Choose whether the assignment has a defined end date or continues until HR ends it.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={reset}
                style={secondaryButtonStyle}
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form
            onSubmit={submit}
            style={formStyle}
          >
            <Field label="Search Employee">
              <EmployeeLookup
                value={
                  form.employeeNumber
                }
                disabled={
                  Boolean(
                    editingId
                  )
                }
                onSelect={({
                  employeeNumber,
                }) =>
                  setForm({
                    ...form,
                    employeeNumber,
                  })
                }
              />
            </Field>

            <Field label="Work Shift">
              <select
                required
                style={inputStyle}
                value={
                  form.shiftId
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    shiftId:
                      event.target
                        .value,
                  })
                }
              >
                <option value="">
                  Select active shift
                </option>

                {shifts
                  .filter(
                    (shift) =>
                      shift.isActive !==
                        false ||
                      shift.id ===
                        form.shiftId
                  )
                  .map((shift) => (
                    <option
                      key={
                        shift.id
                      }
                      value={
                        shift.id
                      }
                    >
                      {shift.name} (
                      {shift.startTime} -{" "}
                      {shift.endTime})
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Assignment Type">
              <div style={typeGridStyle}>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      assignmentType:
                        "RECURRING",
                      effectiveTo:
                        "",
                    })
                  }
                  style={
                    form.assignmentType ===
                    "RECURRING"
                      ? selectedTypeStyle
                      : typeButtonStyle
                  }
                >
                  <strong>
                    Recurring
                  </strong>

                  <span style={typeDescriptionStyle}>
                    Continues until HR ends or changes the assignment.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      assignmentType:
                        "FIXED",
                    })
                  }
                  style={
                    form.assignmentType ===
                    "FIXED"
                      ? selectedTypeStyle
                      : typeButtonStyle
                  }
                >
                  <strong>
                    Fixed Period
                  </strong>

                  <span style={typeDescriptionStyle}>
                    Runs between a defined start date and end date.
                  </span>
                </button>
              </div>
            </Field>

            <Field label="Effective From">
              <input
                required
                type="date"
                style={inputStyle}
                value={
                  form.effectiveFrom
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    effectiveFrom:
                      event.target
                        .value,
                  })
                }
              />
            </Field>

            {form.assignmentType ===
              "FIXED" && (
              <Field label="Effective To">
                <input
                  required
                  type="date"
                  min={
                    form.effectiveFrom ||
                    undefined
                  }
                  style={inputStyle}
                  value={
                    form.effectiveTo
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      effectiveTo:
                        event.target
                          .value,
                    })
                  }
                />
              </Field>
            )}

            {form.assignmentType ===
              "RECURRING" && (
              <div style={recurringNoticeStyle}>
                <strong>
                  Open-ended assignment
                </strong>

                <span>
                  No end date will be stored. Use the End action later when the employee stops following this shift.
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                ...primaryButtonStyle,
                opacity:
                  busy
                    ? 0.65
                    : 1,
              }}
            >
              {editingId
                ? "Save Assignment"
                : "Assign Shift"}
            </button>
          </form>
        </section>

        <section style={panelStyle}>
          <h2
            style={{
              margin:
                0,
            }}
          >
            Employee Shift Schedule
          </h2>

          <p style={sectionSubStyle}>
            Current and historical effective-dated assignments.
          </p>

          <input
            style={{
              ...inputStyle,
              marginTop:
                16,
            }}
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value
              )
            }
            placeholder="Search employee number, name or shift..."
          />

          <div
            style={{
              overflowX:
                "auto",
              marginTop:
                16,
            }}
          >
            <table>
              <thead>
                <tr>
                  <th>
                    Employee
                  </th>

                  <th>
                    Shift
                  </th>

                  <th>
                    Type
                  </th>

                  <th>
                    Effective From
                  </th>

                  <th>
                    Effective To
                  </th>

                  <th>
                    Status
                  </th>

                  <th></th>
                </tr>
              </thead>

              <tbody>
                {visibleAssignments.length ? (
                  visibleAssignments.map(
                    (item) => {
                      const current =
                        isCurrent(
                          item
                        );

                      const recurring =
                        !item.effectiveTo;

                      return (
                        <tr
                          key={
                            item.id
                          }
                        >
                          <td>
                            <strong>
                              {item.employee
                                ?.employeeNumber ||
                                "\u2014"}
                            </strong>

                            <div style={mutedStyle}>
                              {[
                                item.employee
                                  ?.firstName,
                                item.employee
                                  ?.middleName,
                                item.employee
                                  ?.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            </div>
                          </td>

                          <td>
                            {item.shift
                              ?.name ||
                              "\u2014"}
                          </td>

                          <td>
                            <span
                              style={
                                recurring
                                  ? recurringBadgeStyle
                                  : fixedBadgeStyle
                              }
                            >
                              {recurring
                                ? "RECURRING"
                                : "FIXED"}
                            </span>
                          </td>

                          <td>
                            {formatDate(
                              item.effectiveFrom
                            )}
                          </td>

                          <td>
                            {recurring
                              ? "Open-ended"
                              : formatDate(
                                  item.effectiveTo
                                )}
                          </td>

                          <td>
                            <span
                              style={
                                current
                                  ? activeBadgeStyle
                                  : inactiveBadgeStyle
                              }
                            >
                              {current
                                ? "CURRENT"
                                : "ENDED"}
                            </span>
                          </td>

                          <td>
                            <div style={actionGroupStyle}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  beginEdit(
                                    item
                                  )
                                }
                                style={actionButtonStyle}
                              >
                                Edit
                              </button>

                              {current &&
                                recurring && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      endAssignment(
                                        item
                                      )
                                    }
                                    style={warningButtonStyle}
                                  >
                                    End
                                  </button>
                                )}

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  removeAssignment(
                                    item
                                  )
                                }
                                style={dangerButtonStyle}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="7"
                      style={emptyCellStyle}
                    >
                      No matching shift assignments.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function isCurrent(item) {
  if (!item.effectiveTo) {
    return true;
  }

  const end =
    dateOnly(
      item.effectiveTo
    );

  const today =
    dateOnly(
      new Date()
    );

  return (
    end !== null &&
    today !== null &&
    end >= today
  );
}

function dateOnly(value) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return Number(
    `${date.getUTCFullYear()}${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}${String(
      date.getUTCDate()
    ).padStart(2, "0")}`
  );
}

function toDateInput(value) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0"),
    String(
      date.getUTCDate()
    ).padStart(2, "0"),
  ].join("-");
}

function formatDate(value) {
  if (!value) {
    return "\u2014";
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? "\u2014"
    : date.toLocaleDateString(
        undefined,
        {
          timeZone:
            "UTC",
        }
      );
}

function Field({
  label,
  children,
}) {
  return (
    <label>
      <div style={fieldLabelStyle}>
        {label}
      </div>

      {children}
    </label>
  );
}

function Metric({
  label,
  value,
}) {
  return (
    <div style={panelStyle}>
      <div style={metricLabelStyle}>
        {label}
      </div>

      <div style={metricValueStyle}>
        {value}
      </div>

      <div style={mutedStyle}>
        Live scheduling data
      </div>
    </div>
  );
}

function Notice({
  children,
  success = false,
}) {
  return (
    <div
      style={{
        ...panelStyle,
        padding:
          "12px 16px",
        marginBottom:
          18,
        color:
          success
            ? "var(--chris-success)"
            : "var(--chris-warning)",
      }}
    >
      {children}
    </div>
  );
}

const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const metricGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:18};
const workspaceGridStyle={display:"grid",gridTemplateColumns:"minmax(350px,.9fr) minmax(650px,1.7fr)",gap:18,alignItems:"start"};
const formStyle={display:"grid",gap:13,marginTop:18};
const inputStyle={width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)"};
const primaryButtonStyle={border:0,borderRadius:"var(--chris-radius-md)",padding:"12px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800,cursor:"pointer"};
const secondaryButtonStyle={border:"1px solid var(--chris-border-soft)",borderRadius:"var(--chris-radius-md)",padding:"8px 11px",background:"rgba(255,255,255,.04)",color:"var(--chris-text-main)",fontWeight:800,cursor:"pointer"};
const actionButtonStyle={...secondaryButtonStyle,color:"var(--chris-gold)"};
const warningButtonStyle={...secondaryButtonStyle,color:"var(--chris-warning)",border:"1px solid rgba(246,211,101,.28)"};
const dangerButtonStyle={...secondaryButtonStyle,color:"var(--chris-danger)",border:"1px solid rgba(251,113,133,.30)"};
const typeGridStyle={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10};
const typeButtonStyle={display:"grid",gap:5,textAlign:"left",padding:12,border:"1px solid var(--chris-border-soft)",borderRadius:"var(--chris-radius-md)",background:"rgba(255,255,255,.025)",color:"var(--chris-text-main)",cursor:"pointer"};
const selectedTypeStyle={...typeButtonStyle,border:"1px solid var(--chris-border-gold)",background:"rgba(212,175,55,.08)"};
const typeDescriptionStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-xs)",lineHeight:1.45};
const recurringNoticeStyle={display:"grid",gap:4,padding:12,border:"1px solid rgba(52,211,153,.20)",borderRadius:"var(--chris-radius-md)",background:"rgba(52,211,153,.05)",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const sectionHeaderStyle={display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16};
const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const fieldLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700,marginBottom:7};
const metricLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700};
const metricValueStyle={fontSize:28,fontWeight:800,marginTop:10};
const mutedStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-xs)",marginTop:4};
const actionGroupStyle={display:"flex",gap:7,flexWrap:"wrap",justifyContent:"flex-end"};
const activeBadgeStyle={display:"inline-block",padding:"4px 8px",borderRadius:"var(--chris-radius-pill)",background:"rgba(52,211,153,.10)",color:"var(--chris-success)",fontSize:"var(--chris-font-xs)",fontWeight:800};
const inactiveBadgeStyle={...activeBadgeStyle,background:"rgba(255,255,255,.05)",color:"var(--chris-text-muted)"};
const recurringBadgeStyle={...activeBadgeStyle,background:"rgba(212,175,55,.10)",color:"var(--chris-gold)"};
const fixedBadgeStyle={...activeBadgeStyle,background:"rgba(96,165,250,.10)",color:"#93C5FD"};
const emptyCellStyle={padding:"24px 12px",color:"var(--chris-text-secondary)",textAlign:"center"};

export default ShiftSchedule;
