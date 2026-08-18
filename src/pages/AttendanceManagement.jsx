import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import { useNavigate } from "react-router-dom";

const panel = {
  background:
    "linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",
  border:
    "1px solid var(--chris-border-gold)",
  borderRadius:
    "var(--chris-radius-card)",
  padding: 20,
  boxShadow:
    "var(--chris-shadow-card)",
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  borderRadius:
    "var(--chris-radius-md)",
  border:
    "1px solid var(--chris-border-soft)",
  background:
    "var(--chris-input-bg)",
  color:
    "var(--chris-text-main)",
  fontFamily:
    "var(--chris-font-family)",
  fontSize:
    "var(--chris-font-md)",
  outline: "none",
};

function AttendanceManagement({
  view = "dashboard",
}) {
  const navigate = useNavigate();
  const [shifts, setShifts] =
    useState([]);

  const [report, setReport] =
    useState(null);

  const [
    shiftError,
    setShiftError,
  ] = useState("");

  const [
    reportError,
    setReportError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    shiftForm,
    setShiftForm,
  ] = useState({
    name: "",
    code: "",
    startTime:
      "08:00",
    endTime:
      "17:00",
    graceMinutes:
      "10",
    breakMinutes:
      "60",
  });

  const [
    recordForm,
    setRecordForm,
  ] = useState({
    employeeNumber: "",
    attendanceDate: "",
    clockIn: "",
    clockOut: "",
    status:
      "PRESENT",
    notes: "",
  });

  async function loadShifts() {
    setShiftError("");

    try {
      const result =
        await apiRequest(
          "/api/attendance/shifts"
        );

      setShifts(
        result.data || []
      );
    } catch (error) {
      setShiftError(
        error.message ||
          "Unable to load work shifts."
      );
    }
  }

  async function loadReport() {
    setReportError("");

    try {
      const result =
        await apiRequest(
          "/api/attendance/report"
        );

      setReport(
        result.data || null
      );
    } catch (error) {
      setReportError(
        error.message ||
          "Unable to load attendance report."
      );
    }
  }

  useEffect(() => {
    if (
      view ===
        "dashboard" ||
      view === "shifts"
    ) {
      loadShifts();
    }

    if (
      view ===
      "dashboard"
    ) {
      loadReport();
    }
  }, [view]);

  async function createShift(
    event
  ) {
    event.preventDefault();
    setMessage("");
    setShiftError("");

    try {
      await apiRequest(
        "/api/attendance/shifts",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              ...shiftForm,

              graceMinutes:
                Number(
                  shiftForm
                    .graceMinutes
                ),

              breakMinutes:
                Number(
                  shiftForm
                    .breakMinutes
                ),
            }),
        }
      );

      setMessage(
        "Work shift created successfully."
      );

      setShiftForm({
        name: "",
        code: "",
        startTime:
          "08:00",
        endTime:
          "17:00",
        graceMinutes:
          "10",
        breakMinutes:
          "60",
      });

      await loadShifts();
    } catch (error) {
      setShiftError(
        error.message ||
          "Unable to create work shift."
      );
    }
  }

  async function recordAttendance(
    event
  ) {
    event.preventDefault();
    setMessage("");
    setReportError("");

    try {
      const date =
        recordForm
          .attendanceDate;

      await apiRequest(
        "/api/attendance/records",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              employeeNumber:
                recordForm
                  .employeeNumber
                  .trim(),

              attendanceDate:
                date,

              clockIn:
                recordForm
                  .clockIn
                  ? `${date}T${recordForm.clockIn}:00`
                  : null,

              clockOut:
                recordForm
                  .clockOut
                  ? `${date}T${recordForm.clockOut}:00`
                  : null,

              status:
                recordForm
                  .status,

              source:
                "MANUAL",

              notes:
                recordForm
                  .notes ||
                null,
            }),
        }
      );

      setMessage(
        "Attendance recorded successfully."
      );

      setRecordForm({
        employeeNumber: "",
        attendanceDate: "",
        clockIn: "",
        clockOut: "",
        status:
          "PRESENT",
        notes: "",
      });
    } catch (error) {
      setReportError(
        error.message ||
          "Unable to record attendance."
      );
    }
  }

  const totals =
    report?.totals || {};

  const pageCopy =
    useMemo(
      () => ({
        dashboard: {
          eyebrow:
            "WORKFORCE OPERATIONS",
          title:
            "Attendance Dashboard",
          description:
            "Monitor attendance records, lateness, overtime and active shifts from one operational view.",
        },

        register: {
          eyebrow:
            "WORKFORCE OPERATIONS",
          title:
            "Attendance Register",
          description:
            "Capture or update daily attendance while CHRIS applies shift, lateness and overtime rules automatically.",
        },

        shifts: {
          eyebrow:
            "WORKFORCE OPERATIONS",
          title:
            "Work Shifts",
          description:
            "Configure standard work shifts, grace periods and working-hour rules for attendance processing.",
        },
      }),
      []
    );

  const copy =
    pageCopy[view] ||
    pageCopy.dashboard;

  return (
    <div
      style={{
        color:
          "var(--chris-text-main)",
      }}
    >
      {view !== "dashboard" && (
        <button
          type="button"
          onClick={() => navigate("/attendance")}
          style={{
            marginBottom: 16,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--chris-gold)",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {"\u2190"} Back to Time & Attendance
        </button>
      )}

      <div
        style={{
          marginBottom:
            22,
        }}
      >
        <div
          style={{
            color:
              "var(--chris-gold)",

            fontSize:
              12,

            fontWeight:
              800,

            letterSpacing:
              1.8,
          }}
        >
          {copy.eyebrow}
        </div>

        <h1
          style={{
            margin:
              "7px 0 6px",

            fontSize:
              30,
          }}
        >
          {copy.title}
        </h1>

        <p
          style={{
            margin:
              0,

            color:
              "var(--chris-text-secondary)",

            maxWidth:
              900,
          }}
        >
          {copy.description}
        </p>
      </div>

      {message && (
        <Notice
          tone="success"
        >
          {message}
        </Notice>
      )}

      
{view ===
        "dashboard" && (
        <>
          <section
            style={{
              ...panel,
              marginBottom: 18,
            }}
          >
            <SectionHeader
              title="Operational Areas"
              subtitle="Open the operational workspaces connected to Time & Attendance."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(220px,1fr))",
                gap: 12,
              }}
            >
              <DashboardLauncher
                title="Attendance Register"
                description="Capture and maintain daily employee attendance records."
                action="Open Register"
                onClick={() =>
                  navigate("/attendance/register")
                }
              />

              <DashboardLauncher
                title="Work Shifts"
                description="Configure work shifts, working hours and grace periods."
                action="Manage Shifts"
                onClick={() =>
                  navigate("/attendance/shifts")
                }
              />

              <DashboardLauncher
                title="Lateness & Absence"
                description="Analyse attendance exceptions, lateness and absence patterns."
                action="Planned"
                planned
              />

              <DashboardLauncher
                title="Overtime"
                description="Analyse overtime hours and workforce overtime patterns."
                action="Planned"
                planned
              />
            </div>
          </section>
          {reportError && (
            <Notice
              tone="warning"
            >
              Attendance reporting is temporarily unavailable. Other attendance operations remain available.
            </Notice>
          )}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(4,minmax(0,1fr))",

              gap:
                16,

              marginBottom:
                18,
            }}
          >
            <Metric
              label="Attendance Records"
              value={
                totals.records ??
                0
              }
            />

            <Metric
              label="Late Minutes"
              value={
                totals.lateMinutes ??
                0
              }
            />

            <Metric
              label="Overtime Minutes"
              value={
                totals.overtimeMinutes ??
                0
              }
            />

            <Metric
              label="Active Shifts"
              value={
                shifts.filter(
                  (item) =>
                    item.isActive !==
                    false
                ).length
              }
            />
          </div>

          <section
            style={panel}
          >
            <SectionHeader
              title="Attendance Status"
              subtitle="Current distribution of recorded attendance statuses."
            />

            {Object.keys(
              totals.byStatus ||
                {}
            ).length ? (
              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(170px,1fr))",

                  gap:
                    12,
                }}
              >
                {Object.entries(
                  totals.byStatus
                ).map(
                  ([
                    status,
                    count,
                  ]) => (
                    <div
                      key={
                        status
                      }
                      style={
                        statusCard
                      }
                    >
                      <span
                        style={{
                          color:
                            "var(--chris-text-secondary)",

                          fontSize:
                            12,

                          fontWeight:
                            700,
                        }}
                      >
                        {formatStatus(
                          status
                        )}
                      </span>

                      <strong
                        style={{
                          color:
                            "var(--chris-gold)",

                          fontSize:
                            22,
                        }}
                      >
                        {count}
                      </strong>
                    </div>
                  )
                )}
              </div>
            ) : (
              <Empty
                text="No attendance records have been captured yet."
              />
            )}
          </section>
        </>
      )}

      {view ===
        "register" && (
        <>
          {reportError && (
            <Notice
              tone="warning"
            >
              {reportError}
            </Notice>
          )}

          <section
            style={{
              ...panel,
              maxWidth:
                980,
            }}
          >
            <SectionHeader
              title="Record Attendance"
              subtitle="Daily employee attendance capture."
            />

            <form
              onSubmit={
                recordAttendance
              }
              style={{
                display:
                  "grid",

                gap:
                  14,
              }}
            >
              <Field
                label="Employee Number"
              >
                <input
                  style={
                    input
                  }
                  placeholder="e.g. CHR000006"
                  value={
                    recordForm
                      .employeeNumber
                  }
                  onChange={(
                    event
                  ) =>
                    setRecordForm(
                      {
                        ...recordForm,

                        employeeNumber:
                          event
                            .target
                            .value,
                      }
                    )
                  }
                  required
                />
              </Field>

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "1fr 1fr",

                  gap:
                    12,
                }}
              >
                <Field
                  label="Attendance Date"
                >
                  <input
                    style={
                      input
                    }
                    type="date"
                    value={
                      recordForm
                        .attendanceDate
                    }
                    onChange={(
                      event
                    ) =>
                      setRecordForm(
                        {
                          ...recordForm,

                          attendanceDate:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                    required
                  />
                </Field>

                <Field
                  label="Status"
                >
                  <select
                    style={
                      input
                    }
                    value={
                      recordForm
                        .status
                    }
                    onChange={(
                      event
                    ) =>
                      setRecordForm(
                        {
                          ...recordForm,

                          status:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                  >
                    <option value="PRESENT">
                      Present
                    </option>

                    <option value="ABSENT">
                      Absent
                    </option>

                    <option value="HALF_DAY">
                      Half Day
                    </option>

                    <option value="REST_DAY">
                      Rest Day
                    </option>

                    <option value="HOLIDAY">
                      Holiday
                    </option>
                  </select>
                </Field>
              </div>

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "1fr 1fr",

                  gap:
                    12,
                }}
              >
                <Field
                  label="Clock In"
                >
                  <input
                    style={
                      input
                    }
                    type="time"
                    value={
                      recordForm
                        .clockIn
                    }
                    onChange={(
                      event
                    ) =>
                      setRecordForm(
                        {
                          ...recordForm,

                          clockIn:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                  />
                </Field>

                <Field
                  label="Clock Out"
                >
                  <input
                    style={
                      input
                    }
                    type="time"
                    value={
                      recordForm
                        .clockOut
                    }
                    onChange={(
                      event
                    ) =>
                      setRecordForm(
                        {
                          ...recordForm,

                          clockOut:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                  />
                </Field>
              </div>

              <Field
                label="Notes"
              >
                <textarea
                  style={{
                    ...input,

                    minHeight:
                      95,

                    resize:
                      "vertical",
                  }}
                  value={
                    recordForm
                      .notes
                  }
                  onChange={(
                    event
                  ) =>
                    setRecordForm(
                      {
                        ...recordForm,

                        notes:
                          event
                            .target
                            .value,
                      }
                    )
                  }
                />
              </Field>

              <button
                style={
                  buttonStyle
                }
              >
                Record Attendance
              </button>
            </form>
          </section>
        </>
      )}

      {view ===
        "shifts" && (
        <>
          {shiftError && (
            <Notice
              tone="warning"
            >
              {shiftError}
            </Notice>
          )}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "minmax(330px,.8fr) minmax(430px,1.2fr)",

              gap:
                18,
            }}
          >
            <section
              style={panel}
            >
              <SectionHeader
                title="Create Work Shift"
                subtitle="Define standard work hours and grace periods."
              />

              <form
                onSubmit={
                  createShift
                }
                style={{
                  display:
                    "grid",

                  gap:
                    12,
                }}
              >
                <Field label="Shift Name">
                  <input
                    style={
                      input
                    }
                    value={
                      shiftForm
                        .name
                    }
                    onChange={(
                      event
                    ) =>
                      setShiftForm(
                        {
                          ...shiftForm,

                          name:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                    required
                  />
                </Field>

                <Field label="Shift Code">
                  <input
                    style={
                      input
                    }
                    value={
                      shiftForm
                        .code
                    }
                    onChange={(
                      event
                    ) =>
                      setShiftForm(
                        {
                          ...shiftForm,

                          code:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                    required
                  />
                </Field>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "1fr 1fr",

                    gap:
                      12,
                  }}
                >
                  <Field label="Start Time">
                    <input
                      style={
                        input
                      }
                      type="time"
                      value={
                        shiftForm
                          .startTime
                      }
                      onChange={(
                        event
                      ) =>
                        setShiftForm(
                          {
                            ...shiftForm,

                            startTime:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      required
                    />
                  </Field>

                  <Field label="End Time">
                    <input
                      style={
                        input
                      }
                      type="time"
                      value={
                        shiftForm
                          .endTime
                      }
                      onChange={(
                        event
                      ) =>
                        setShiftForm(
                          {
                            ...shiftForm,

                            endTime:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      required
                    />
                  </Field>
                </div>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "1fr 1fr",

                    gap:
                      12,
                  }}
                >
                  <Field label="Grace Minutes">
                    <input
                      style={
                        input
                      }
                      type="number"
                      min="0"
                      value={
                        shiftForm
                          .graceMinutes
                      }
                      onChange={(
                        event
                      ) =>
                        setShiftForm(
                          {
                            ...shiftForm,

                            graceMinutes:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                    />
                  </Field>

                  <Field label="Break Minutes">
                    <input
                      style={
                        input
                      }
                      type="number"
                      min="0"
                      value={
                        shiftForm
                          .breakMinutes
                      }
                      onChange={(
                        event
                      ) =>
                        setShiftForm(
                          {
                            ...shiftForm,

                            breakMinutes:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                    />
                  </Field>
                </div>

                <button
                  style={
                    buttonStyle
                  }
                >
                  Create Shift
                </button>
              </form>
            </section>

            <section
              style={panel}
            >
              <SectionHeader
                title="Configured Shifts"
                subtitle="Available work shifts for this organization."
              />

              {shifts.length ? (
                <div
                  style={{
                    display:
                      "grid",

                    gap:
                      12,
                  }}
                >
                  {shifts.map(
                    (shift) => (
                      <div
                        key={
                          shift.id
                        }
                        style={
                          shiftRow
                        }
                      >
                        <div>
                          <strong>
                            {
                              shift.name
                            }
                          </strong>

                          <div
                            style={
                              muted
                            }
                          >
                            {shift.code}
                            {" \u00B7 "}
                            {shift.startTime}
                            {" - "}
                            {shift.endTime}
                          </div>
                        </div>

                        <div
                          style={{
                            textAlign:
                              "right",
                          }}
                        >
                          <span
                            style={
                              activeBadge
                            }
                          >
                            {shift.isActive !==
                            false
                              ? "ACTIVE"
                              : "INACTIVE"}
                          </span>

                          <div
                            style={
                              muted
                            }
                          >
                            {
                              shift.graceMinutes
                            }{" "}
                            min grace
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <Empty
                  text="No work shifts configured yet."
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardLauncher({
  title,
  description,
  action,
  onClick,
  planned = false,
}) {
  return (
    <button
      type="button"
      disabled={planned}
      onClick={
        planned
          ? undefined
          : onClick
      }
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        minHeight: 150,
        padding: 18,
        textAlign: "left",

        borderRadius:
          "var(--chris-radius-md)",

        border:
          planned
            ? "1px solid var(--chris-border-soft)"
            : "1px solid var(--chris-border-gold)",

        background:
          planned
            ? "rgba(255,255,255,.025)"
            : "linear-gradient(145deg, rgba(12,38,26,.78), rgba(7,18,13,.90))",

        color:
          "var(--chris-text-main)",

        boxShadow:
          planned
            ? "none"
            : "var(--chris-shadow-soft)",

        cursor:
          planned
            ? "default"
            : "pointer",

        opacity:
          planned
            ? 0.55
            : 1,

        fontFamily:
          "var(--chris-font-family)",
      }}
    >
      <div
        style={{
          fontSize:
            "var(--chris-font-lg)",
          fontWeight: 800,
          lineHeight: 1.25,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 8,
          color:
            "var(--chris-text-secondary)",
          fontSize:
            "var(--chris-font-sm)",
          lineHeight: 1.55,
        }}
      >
        {description}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 16,
          color:
            "var(--chris-gold)",
          fontSize:
            "var(--chris-font-sm)",
          fontWeight: 800,
        }}
      >
        {action}
      </div>
    </button>
  );
}

function Metric({
  label,
  value,
}) {
  return (
    <div style={panel}>
      <div style={muted}>
        {label}
      </div>

      <div
        style={{
          fontSize:
            26,

          fontWeight:
            800,

          marginTop:
            9,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}) {
  return (
    <div
      style={{
        marginBottom:
          18,
      }}
    >
      <h2
        style={{
          margin:
            0,

          fontSize:
            18,
        }}
      >
        {title}
      </h2>

      <p
        style={{
          ...muted,

          marginBottom:
            0,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}) {
  return (
    <label>
      <div
        style={{
          ...muted,

          color:
            "#CBD5E1",

          fontWeight:
            700,

          marginBottom:
            7,
        }}
      >
        {label}
      </div>

      {children}
    </label>
  );
}

function Notice({
  tone,
  children,
}) {
  const success =
    tone ===
    "success";

  return (
    <div
      style={{
        ...panel,

        padding:
          "12px 16px",

        marginBottom:
          18,

        color:
          success
            ? "#86EFAC"
            : "#F6D365",
      }}
    >
      {children}
    </div>
  );
}

function Empty({
  text,
}) {
  return (
    <div
      style={{
        color:
          "#64748B",

        padding:
          "18px 0",
      }}
    >
      {text}
    </div>
  );
}

function formatStatus(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

const muted = {
  color:
    "var(--chris-text-secondary)",

  fontSize:
    12,

  marginTop:
    4,
};

const buttonStyle = {
  border:
    0,

  borderRadius:
    10,

  padding:
    "11px 16px",

  background:
    "linear-gradient(135deg,#D4AF37,#B88A16)",

  color:
    "#07110C",

  fontWeight:
    800,

  cursor:
    "pointer",
};

const statusCard = {
  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "center",

  padding:
    14,

  borderRadius:
    12,

  background:
    "rgba(255,255,255,.035)",

  border:
    "1px solid rgba(255,255,255,.06)",
};

const shiftRow = {
  display:
    "flex",

  justifyContent:
    "space-between",

  gap:
    14,

  padding:
    13,

  borderRadius:
    12,

  background:
    "rgba(255,255,255,.035)",

  border:
    "1px solid rgba(255,255,255,.06)",
};

const activeBadge = {
  display:
    "inline-block",

  padding:
    "5px 9px",

  borderRadius:
    999,

  background:
    "rgba(16,185,129,.12)",

  border:
    "1px solid rgba(16,185,129,.25)",

  color:
    "#6EE7B7",

  fontSize:
    10,

  fontWeight:
    900,
};

export default AttendanceManagement;
