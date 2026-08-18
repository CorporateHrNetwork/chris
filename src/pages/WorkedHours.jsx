import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";
import EmployeeLookup from "../components/shared/EmployeeLookup";

const today =
  new Date()
    .toISOString()
    .slice(0, 10);

const monthStart =
  `${today.slice(0, 8)}01`;

const EMPTY_MANUAL = {
  employeeNumber: "",
  periodStart:
    monthStart,
  periodEnd:
    today,
  workedHours: "",
  workedDays: "",
  notes: "",
};

function WorkedHours() {
  const navigate =
    useNavigate();

  const [filters, setFilters] =
    useState({
      from:
        monthStart,
      to:
        today,
      employeeNumber:
        "",
    });

  const [comparison, setComparison] =
    useState({
      totals: {},
      employees: [],
      records: [],
    });

  const [basis, setBasis] =
    useState("SYSTEM");

  const [manualEntries, setManualEntries] =
    useState([]);

  const [manualForm, setManualForm] =
    useState(
      EMPTY_MANUAL
    );

  const [editingId, setEditingId] =
    useState(null);

  const [dailyHoursBasis, setDailyHoursBasis] =
    useState(null);

  const [sourceMessage, setSourceMessage] =
    useState("");

  const [sourceError, setSourceError] =
    useState("");

  const [filterError, setFilterError] =
    useState("");

  const [adminMessage, setAdminMessage] =
    useState("");

  const [adminError, setAdminError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [adminBusy, setAdminBusy] =
    useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!sourceMessage && !sourceError) {
      return undefined;
    }

    const timer =
      window.setTimeout(
        () => {
          setSourceMessage("");
          setSourceError("");
        },
        4000
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [
    sourceMessage,
    sourceError,
  ]);

  useEffect(() => {
    if (!adminMessage && !adminError) {
      return undefined;
    }

    const timer =
      window.setTimeout(
        () => {
          setAdminMessage("");
          setAdminError("");
        },
        4500
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [
    adminMessage,
    adminError,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    async function loadBasis() {
      setDailyHoursBasis(
        null
      );

      if (
        !manualForm.employeeNumber ||
        !manualForm.periodStart ||
        !manualForm.periodEnd
      ) {
        return;
      }

      try {
        const params =
          new URLSearchParams({
            employeeNumber:
              manualForm.employeeNumber,
            from:
              manualForm.periodStart,
            to:
              manualForm.periodEnd,
          });

        const result =
          await apiRequest(
            `/api/attendance/scheduled-hour-basis?${params.toString()}`
          );

        if (!cancelled) {
          const value =
            result.data
              ?.dailyHoursBasis;

          setDailyHoursBasis(
            value === null ||
            value === undefined
              ? null
              : Number(value)
          );
        }
      } catch {
        if (!cancelled) {
          setDailyHoursBasis(
            null
          );
        }
      }
    }

    loadBasis();

    return () => {
      cancelled =
        true;
    };
  }, [
    manualForm.employeeNumber,
    manualForm.periodStart,
    manualForm.periodEnd,
  ]);

  /*
   * Keep Admin Worked Hours synchronized with Worked Days when
   * the employee scheduled-hour basis arrives asynchronously.
   *
   * Worked Hours remains editable afterwards for an approved
   * client/admin override.
   */
  useEffect(() => {
    if (
      manualForm.workedDays === "" ||
      manualForm.workedDays === null ||
      manualForm.workedDays === undefined ||
      dailyHoursBasis === null ||
      !Number.isFinite(Number(dailyHoursBasis))
    ) {
      return;
    }

    const days = Number(
      manualForm.workedDays
    );

    if (!Number.isFinite(days)) {
      return;
    }

    const calculatedHours =
      roundInput(
        days *
          Number(dailyHoursBasis)
      );

    setManualForm((current) => {
      if (
        String(current.workedHours) ===
        String(calculatedHours)
      ) {
        return current;
      }

      return {
        ...current,
        workedHours:
          calculatedHours,
      };
    });
  }, [
    manualForm.workedDays,
    dailyHoursBasis,
  ]);
  async function loadData(
    nextFilters = filters
  ) {
    setLoading(true);
    setFilterError("");

    try {
      const params =
        new URLSearchParams();

      if (nextFilters.from) {
        params.set(
          "from",
          nextFilters.from
        );
      }

      if (nextFilters.to) {
        params.set(
          "to",
          nextFilters.to
        );
      }

      if (
        nextFilters.employeeNumber
      ) {
        params.set(
          "employeeNumber",
          nextFilters.employeeNumber
        );
      }

      const suffix =
        params.toString()
          ? `?${params.toString()}`
          : "";

      const [
        comparisonResult,
        basisResult,
        manualResult,
      ] =
        await Promise.all([
          apiRequest(
            `/api/attendance/scheduled-vs-actual${suffix}`
          ),
          apiRequest(
            "/api/attendance/payroll-basis"
          ),
          apiRequest(
            `/api/attendance/manual-payroll-inputs${suffix}`
          ),
        ]);

      setComparison(
        comparisonResult.data || {
          totals: {},
          employees: [],
          records: [],
        }
      );

      setBasis(
        basisResult.data?.basis ||
          "SYSTEM"
      );

      setManualEntries(
        manualResult.data || []
      );
    } catch (err) {
      setFilterError(
        err.message ||
          "Unable to load attendance comparison."
      );
    } finally {
      setLoading(false);
    }
  }

  async function applyFilters(
    event
  ) {
    event.preventDefault();
    await loadData(
      filters
    );
  }

  async function setPayrollBasis(
    nextBasis
  ) {
    setSourceMessage("");
    setSourceError("");

    try {
      await apiRequest(
        "/api/attendance/payroll-basis",
        {
          method:
            "PATCH",
          body:
            JSON.stringify({
              basis:
                nextBasis,
            }),
        }
      );

      setBasis(
        nextBasis
      );

      setSourceMessage(
        nextBasis ===
          "SYSTEM"
          ? "Payroll attendance basis set to System Calculated."
          : "Payroll attendance basis set to Client / Administrator Entered."
      );
    } catch (err) {
      setSourceError(
        err.message ||
          "Unable to change payroll attendance basis."
      );
    }
  }

  function changeWorkedDays(
    value
  ) {
    const days =
      value;

    let hours =
      manualForm.workedHours;

    if (
      days !==
        "" &&
      dailyHoursBasis !==
        null &&
      Number.isFinite(
        dailyHoursBasis
      )
    ) {
      hours =
        roundInput(
          Number(days) *
            dailyHoursBasis
        );
    }

    setManualForm({
      ...manualForm,
      workedDays:
        days,
      workedHours:
        hours,
    });
  }

  function beginEdit(
    item
  ) {
    setEditingId(
      item.id
    );

    setAdminMessage("");
    setAdminError("");

    setManualForm({
      employeeNumber:
        item.employeeNumber,
      periodStart:
        toDateInput(
          item.periodStart
        ),
      periodEnd:
        toDateInput(
          item.periodEnd
        ),
      workedHours:
        item.workedHours ===
          null ||
        item.workedHours ===
          undefined
          ? ""
          : String(
              item.workedHours
            ),
      workedDays:
        item.workedDays ===
          null ||
        item.workedDays ===
          undefined
          ? ""
          : String(
              item.workedDays
            ),
      notes:
        item.notes ||
        "",
    });

    window.setTimeout(
      () => {
        document
          .getElementById(
            "admin-payroll-input-card"
          )
          ?.scrollIntoView({
            behavior:
              "smooth",
            block:
              "start",
          });
      },
      50
    );
  }

  function cancelEdit() {
    setEditingId(
      null
    );

    setManualForm(
      EMPTY_MANUAL
    );

    setDailyHoursBasis(
      null
    );

    setAdminMessage("");
    setAdminError("");
  }

  async function saveManual(
    event
  ) {
    event.preventDefault();

    setAdminBusy(
      true
    );

    setAdminMessage("");
    setAdminError("");

    const hours =
      manualForm.workedHours ===
        ""
        ? null
        : Number(
            manualForm.workedHours
          );

    const days =
      manualForm.workedDays ===
        ""
        ? null
        : Number(
            manualForm.workedDays
          );

    if (
      hours === null &&
      days === null
    ) {
      setAdminBusy(
        false
      );

      setAdminError(
        "Enter worked hours, worked days, or both."
      );

      return;
    }

    try {
      const payload = {
        employeeNumber:
          manualForm.employeeNumber,
        periodStart:
          manualForm.periodStart,
        periodEnd:
          manualForm.periodEnd,
        workedHours:
          hours,
        workedDays:
          days,
        notes:
          manualForm.notes ||
          null,
      };

      if (editingId) {
        await apiRequest(
          `/api/attendance/manual-payroll-inputs/${editingId}`,
          {
            method:
              "PATCH",
            body:
              JSON.stringify(
                payload
              ),
          }
        );

        setAdminMessage(
          "Admin payroll attendance input updated successfully."
        );
      } else {
        await apiRequest(
          "/api/attendance/manual-payroll-inputs",
          {
            method:
              "POST",
            body:
              JSON.stringify(
                payload
              ),
          }
        );

        setAdminMessage(
          "Admin payroll attendance input saved successfully."
        );
      }

      setEditingId(
        null
      );

      setManualForm({
        ...EMPTY_MANUAL,
        periodStart:
          filters.from ||
          monthStart,
        periodEnd:
          filters.to ||
          today,
      });

      setDailyHoursBasis(
        null
      );

      await loadData(
        filters
      );
    } catch (err) {
      setAdminError(
        err.message ||
          "Unable to save admin payroll attendance input."
      );
    } finally {
      setAdminBusy(
        false
      );
    }
  }

  async function removeManual(
    item
  ) {
    const confirmed =
      window.confirm(
        `Delete the admin payroll input for ${item.employeeNumber}, ${formatDate(item.periodStart)} - ${formatDate(item.periodEnd)}?`
      );

    if (!confirmed) {
      return;
    }

    setAdminBusy(
      true
    );

    setAdminMessage("");
    setAdminError("");

    try {
      await apiRequest(
        `/api/attendance/manual-payroll-inputs/${item.id}`,
        {
          method:
            "DELETE",
        }
      );

      if (
        editingId ===
        item.id
      ) {
        cancelEdit();
      }

      setAdminMessage(
        "Admin payroll attendance input deleted successfully."
      );

      await loadData(
        filters
      );
    } catch (err) {
      setAdminError(
        err.message ||
          "Unable to delete admin payroll attendance input."
      );
    } finally {
      setAdminBusy(
        false
      );
    }
  }

  const totals =
    comparison.totals || {};

  const adminTotals =
    useMemo(
      () =>
        manualEntries.reduce(
          (acc, item) => {
            if (
              item.workedHours !==
                null &&
              item.workedHours !==
                undefined
            ) {
              acc.hours +=
                Number(
                  item.workedHours
                );
            }

            if (
              item.workedDays !==
                null &&
              item.workedDays !==
                undefined
            ) {
              acc.days +=
                Number(
                  item.workedDays
                );
            }

            return acc;
          },
          {
            hours:
              0,
            days:
              0,
          }
        ),
      [manualEntries]
    );

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
          navigate(
            "/attendance"
          )
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
          Worked Hours & Payroll Basis
        </h1>

        <p style={descriptionStyle}>
          Compare scheduled expectations, actual attendance and client-entered payroll values while preserving each source independently.
        </p>
      </div>

      <section style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2
              style={{
                margin:
                  0,
              }}
            >
              Payroll Attendance Source
            </h2>

            <p style={sectionSubStyle}>
              Payroll will later consume the selected client basis. Comparison data remains visible regardless of the selection.
            </p>
          </div>

          <span style={basisBadgeStyle}>
            DEFAULT:{" "}
            {basis ===
            "SYSTEM"
              ? "SYSTEM"
              : "CLIENT / ADMIN"}
          </span>
        </div>

        {sourceMessage && (
          <InlineNotice success>
            {sourceMessage}
          </InlineNotice>
        )}

        {sourceError && (
          <InlineNotice>
            {sourceError}
          </InlineNotice>
        )}

        <div style={sourceGridStyle}>
          <button
            type="button"
            onClick={() =>
              setPayrollBasis(
                "SYSTEM"
              )
            }
            style={
              basis ===
              "SYSTEM"
                ? selectedSourceStyle
                : sourceStyle
            }
          >
            <strong>
              System Calculated
            </strong>

            <span style={sourceDescriptionStyle}>
              Uses scheduled expectations and actual attendance produced by CHRIS.
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setPayrollBasis(
                "ADMIN_ENTERED"
              )
            }
            style={
              basis ===
              "ADMIN_ENTERED"
                ? selectedSourceStyle
                : sourceStyle
            }
          >
            <strong>
              Client / Administrator Entered
            </strong>

            <span style={sourceDescriptionStyle}>
              Uses approved payroll hours and/or days entered by the client administrator.
            </span>
          </button>
        </div>
      </section>

      <form
        onSubmit={
          applyFilters
        }
        style={{
          ...panelStyle,
          marginTop:
            18,
        }}
      >
        <h2
          style={{
            margin:
              0,
          }}
        >
          Reporting Period
        </h2>

        <p style={sectionSubStyle}>
          Apply Filters recalculates Scheduled, Actual and Admin Entered values for the selected period.
        </p>

        {filterError && (
          <InlineNotice>
            {filterError}
          </InlineNotice>
        )}

        <div style={filterGridStyle}>
          <Field label="From">
            <input
              required
              type="date"
              style={inputStyle}
              value={
                filters.from
              }
              onChange={(event) =>
                setFilters({
                  ...filters,
                  from:
                    event.target
                      .value,
                })
              }
            />
          </Field>

          <Field label="To">
            <input
              required
              type="date"
              min={
                filters.from ||
                undefined
              }
              max={today}
              style={inputStyle}
              value={
                filters.to
              }
              onChange={(event) =>
                setFilters({
                  ...filters,
                  to:
                    event.target
                      .value,
                })
              }
            />
          </Field>

          <Field label="Employee">
            <EmployeeLookup
              value={
                filters.employeeNumber
              }
              onSelect={({
                employeeNumber,
              }) =>
                setFilters({
                  ...filters,
                  employeeNumber,
                })
              }
            />
          </Field>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...primaryButtonStyle,
              opacity:
                loading
                  ? 0.65
                  : 1,
            }}
          >
            {loading
              ? "Calculating..."
              : "Apply Filters"}
          </button>
        </div>
      </form>

      <div style={metricGridStyle}>
        <Metric
          label="Scheduled Completed Days"
          value={
            totals.scheduledCompletedDays ||
            0
          }
          hint="Completed scheduled dates before today"
        />

        <Metric
          label="Scheduled Hours"
          value={
            formatNumber(
              totals.scheduledHours
            )
          }
          hint="Includes elapsed scheduled time today"
        />

        <Metric
          label="Actual Worked Days"
          value={
            totals.actualWorkedDays ||
            0
          }
          hint="Present / late attendance records"
        />

        <Metric
          label="Actual Worked Hours"
          value={
            formatNumber(
              totals.actualWorkedHours
            )
          }
          hint="Clock-in/out less configured breaks"
        />

        <Metric
          label="Admin Entered Days"
          value={
            formatNumber(
              adminTotals.days
            )
          }
          hint="Client payroll input"
        />

        <Metric
          label="Admin Entered Hours"
          value={
            formatNumber(
              adminTotals.hours
            )
          }
          hint="Client payroll input"
        />
      </div>

      <section style={panelStyle}>
        <h2
          style={{
            margin:
              0,
          }}
        >
          Scheduled vs Actual
        </h2>

        <p style={sectionSubStyle}>
          Public holidays are excluded. Today contributes elapsed scheduled hours but is not counted as a completed scheduled day.
        </p>

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
                <th>Employee</th>
                <th>Scheduled Days</th>
                <th>Scheduled Hours</th>
                <th>Actual Days</th>
                <th>Actual Hours</th>
                <th>Hours Variance</th>
              </tr>
            </thead>

            <tbody>
              {(comparison.employees ||
                []).length ? (
                comparison.employees.map(
                  (item) => (
                    <tr
                      key={
                        item.employee
                          .employeeNumber
                      }
                    >
                      <td>
                        <strong>
                          {
                            item.employee
                              .employeeNumber
                          }
                        </strong>

                        <div style={mutedStyle}>
                          {
                            item.employee
                              .name
                          }
                        </div>
                      </td>

                      <td>
                        {
                          item.scheduledCompletedDays
                        }
                      </td>

                      <td>
                        {formatNumber(
                          item.scheduledHours
                        )}
                      </td>

                      <td>
                        {
                          item.actualWorkedDays
                        }
                      </td>

                      <td>
                        {formatNumber(
                          item.actualWorkedHours
                        )}
                      </td>

                      <td>
                        {formatNumber(
                          item.varianceHours
                        )}
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan="6"
                    style={emptyCellStyle}
                  >
                    No employees or shift assignments match the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div style={workspaceGridStyle}>
        <section
          id="admin-payroll-input-card"
          style={panelStyle}
        >
          <div style={sectionHeaderStyle}>
            <div>
              <h2
                style={{
                  margin:
                    0,
                }}
              >
                {editingId
                  ? "Edit Admin Payroll Input"
                  : "Admin Payroll Input"}
              </h2>

              <p style={sectionSubStyle}>
                Enter client-approved worked days, hours, or both.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={
                  cancelEdit
                }
                style={secondaryButtonStyle}
              >
                Cancel Edit
              </button>
            )}
          </div>

          {adminMessage && (
            <InlineNotice success>
              {adminMessage}
            </InlineNotice>
          )}

          {adminError && (
            <InlineNotice>
              {adminError}
            </InlineNotice>
          )}

          <form
            onSubmit={
              saveManual
            }
            style={manualFormStyle}
          >
            <Field label="Employee">
              <EmployeeLookup
                value={
                  manualForm.employeeNumber
                }
                onSelect={({
                  employeeNumber,
                }) =>
                  setManualForm({
                    ...manualForm,
                    employeeNumber,
                  })
                }
              />
            </Field>

            <div style={twoColumnStyle}>
              <Field label="Period Start">
                <input
                  required
                  type="date"
                  style={inputStyle}
                  value={
                    manualForm.periodStart
                  }
                  onChange={(event) =>
                    setManualForm({
                      ...manualForm,
                      periodStart:
                        event.target
                          .value,
                    })
                  }
                />
              </Field>

              <Field label="Period End">
                <input
                  required
                  type="date"
                  min={
                    manualForm.periodStart ||
                    undefined
                  }
                  max={today}
                  style={inputStyle}
                  value={
                    manualForm.periodEnd
                  }
                  onChange={(event) =>
                    setManualForm({
                      ...manualForm,
                      periodEnd:
                        event.target
                          .value,
                    })
                  }
                />
              </Field>
            </div>

            <div style={basisHintStyle}>
              <strong>
                Scheduled daily hour basis:
              </strong>

              <span>
                {dailyHoursBasis ===
                null
                  ? "Not available â€” enter approved hours manually."
                  : `${formatNumber(dailyHoursBasis)} hours/day`}
              </span>
            </div>

            <div style={twoColumnStyle}>
              <Field label="Worked Days">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  style={inputStyle}
                  value={
                    manualForm.workedDays
                  }
                  onChange={(event) =>
                    changeWorkedDays(
                      event.target
                        .value
                    )
                  }
                  placeholder="Optional"
                />
              </Field>

              <Field label="Worked Hours">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                  value={
                    manualForm.workedHours
                  }
                  onChange={(event) =>
                    setManualForm({
                      ...manualForm,
                      workedHours:
                        event.target
                          .value,
                    })
                  }
                  placeholder="Auto-calculated from days when schedule basis exists"
                />
              </Field>
            </div>

            <div style={calculationNoteStyle}>
              Worked Hours auto-populates when Worked Days changes and a scheduled daily-hour basis can be determined. The calculated value remains editable for an approved client override.
            </div>

            <Field label="Reason / Notes">
              <textarea
                style={{
                  ...inputStyle,
                  minHeight:
                    80,
                  resize:
                    "vertical",
                }}
                value={
                  manualForm.notes
                }
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    notes:
                      event.target
                        .value,
                  })
                }
              />
            </Field>

            <button
              type="submit"
              disabled={
                adminBusy
              }
              style={{
                ...primaryButtonStyle,
                opacity:
                  adminBusy
                    ? 0.65
                    : 1,
              }}
            >
              {adminBusy
                ? "Saving..."
                : editingId
                  ? "Update Payroll Input"
                  : "Save Payroll Input"}
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
            Manual Payroll Inputs
          </h2>

          <p style={sectionSubStyle}>
            Admin-entered payroll values remain separate from actual attendance records.
          </p>

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
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Hours</th>
                  <th>Days</th>
                  <th>Entered By</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {manualEntries.length ? (
                  manualEntries.map(
                    (item) => (
                      <tr
                        key={
                          item.id
                        }
                      >
                        <td>
                          <strong>
                            {
                              item.employeeNumber
                            }
                          </strong>

                          <div style={mutedStyle}>
                            {
                              item.employeeName
                            }
                          </div>
                        </td>

                        <td>
                          {formatDate(
                            item.periodStart
                          )}{" "}
                          -{" "}
                          {formatDate(
                            item.periodEnd
                          )}
                        </td>

                        <td>
                          {displayNullable(
                            item.workedHours
                          )}
                        </td>

                        <td>
                          {displayNullable(
                            item.workedDays
                          )}
                        </td>

                        <td>
                          {item.recordedByName ||
                            "Administrator"}
                        </td>

                        <td>
                          {item.notes ||
                            "\u2014"}
                        </td>

                        <td>
                          <div style={actionGroupStyle}>
                            <button
                              type="button"
                              disabled={adminBusy}
                              onClick={() =>
                                beginEdit(
                                  item
                                )
                              }
                              style={actionButtonStyle}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              disabled={adminBusy}
                              onClick={() =>
                                removeManual(
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
                    )
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="7"
                      style={emptyCellStyle}
                    >
                      No manual payroll attendance inputs match the selected period.
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

function roundInput(
  value
) {
  return String(
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
        100
    ) /
      100
  );
}

function toDateInput(
  value
) {
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

function formatNumber(
  value
) {
  const number =
    Number(
      value || 0
    );

  return Number.isFinite(
    number
  )
    ? number
        .toFixed(2)
        .replace(
          /\.00$/,
          ""
        )
    : "0";
}

function displayNullable(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "\u2014";
  }

  return formatNumber(
    value
  );
}

function formatDate(
  value
) {
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
  hint,
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
        {hint}
      </div>
    </div>
  );
}

function InlineNotice({
  children,
  success = false,
}) {
  return (
    <div
      style={{
        marginTop:
          12,
        padding:
          "10px 12px",
        borderRadius:
          "var(--chris-radius-md)",
        border:
          success
            ? "1px solid rgba(52,211,153,.22)"
            : "1px solid rgba(246,211,101,.28)",
        background:
          success
            ? "rgba(52,211,153,.06)"
            : "rgba(246,211,101,.06)",
        color:
          success
            ? "var(--chris-success)"
            : "var(--chris-warning)",
        fontSize:
          "var(--chris-font-sm)",
        fontWeight:
          700,
      }}
    >
      {children}
    </div>
  );
}

const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const metricGridStyle={display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:14,margin:"18px 0"};
const workspaceGridStyle={display:"grid",gridTemplateColumns:"minmax(370px,.95fr) minmax(650px,1.55fr)",gap:18,alignItems:"start",marginTop:18};
const sourceGridStyle={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginTop:16};
const sourceStyle={display:"grid",gap:8,textAlign:"left",padding:16,border:"1px solid var(--chris-border-soft)",borderRadius:"var(--chris-radius-md)",background:"rgba(255,255,255,.025)",color:"var(--chris-text-main)",cursor:"pointer"};
const selectedSourceStyle={...sourceStyle,border:"1px solid var(--chris-border-gold)",background:"rgba(212,175,55,.08)"};
const sourceDescriptionStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",lineHeight:1.5};
const basisBadgeStyle={padding:"5px 9px",borderRadius:"var(--chris-radius-pill)",background:"rgba(212,175,55,.10)",color:"var(--chris-gold)",fontSize:"var(--chris-font-xs)",fontWeight:800};
const filterGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,alignItems:"end",marginTop:16};
const manualFormStyle={display:"grid",gap:12,marginTop:16};
const twoColumnStyle={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12};
const inputStyle={width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)"};
const primaryButtonStyle={border:0,borderRadius:"var(--chris-radius-md)",padding:"12px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800,cursor:"pointer"};
const secondaryButtonStyle={border:"1px solid var(--chris-border-soft)",borderRadius:"var(--chris-radius-md)",padding:"8px 11px",background:"rgba(255,255,255,.04)",color:"var(--chris-text-main)",fontWeight:800,cursor:"pointer"};
const actionButtonStyle={...secondaryButtonStyle,color:"var(--chris-gold)"};
const dangerButtonStyle={...secondaryButtonStyle,color:"var(--chris-danger)",border:"1px solid rgba(251,113,133,.30)"};
const actionGroupStyle={display:"flex",gap:7,flexWrap:"wrap",justifyContent:"flex-end"};
const basisHintStyle={display:"flex",gap:8,flexWrap:"wrap",padding:10,borderRadius:"var(--chris-radius-md)",border:"1px solid rgba(212,175,55,.16)",background:"rgba(212,175,55,.04)",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const calculationNoteStyle={padding:"9px 10px",borderRadius:"var(--chris-radius-md)",background:"rgba(255,255,255,.025)",color:"var(--chris-text-muted)",fontSize:"var(--chris-font-xs)",lineHeight:1.5};
const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:1050,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const sectionHeaderStyle={display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16};
const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const fieldLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700,marginBottom:7};
const metricLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700};
const metricValueStyle={fontSize:28,fontWeight:800,marginTop:10};
const mutedStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-xs)",marginTop:4};
const emptyCellStyle={padding:"24px 12px",color:"var(--chris-text-secondary)",textAlign:"center"};

export default WorkedHours;
