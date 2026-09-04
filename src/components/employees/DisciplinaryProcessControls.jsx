import { useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

const PROCESS_EVENTS = [
  "COACHING",
  "WARNING",
  "PIP_STARTED",
  "PIP_REVIEW",
  "QUERY_ISSUED",
  "EMPLOYEE_RESPONSE",
  "INVESTIGATION",
  "HEARING",
  "FINDINGS",
  "MANAGEMENT_REVIEW",
  "DECISION",
  "DECISION_DELIVERED",
];

const EVIDENCE_CATEGORIES = [
  "PERFORMANCE_RECORD",
  "COACHING_RECORD",
  "WARNING",
  "PIP_RECORD",
  "ALLEGATION_QUERY",
  "EMPLOYEE_RESPONSE",
  "INVESTIGATION_NOTE",
  "HEARING_RECORD",
  "FINDINGS",
  "APPROVAL",
  "DECISION_LETTER",
  "PROOF_OF_DELIVERY",
  "OTHER",
];

export default function DisciplinaryProcessControls({
  records,
  catalog,
  busy,
  setBusy,
  reload,
  announce,
  setError,
}) {
  const [processEvent, setProcessEvent] = useState({
    caseId: "",
    eventType: "QUERY_ISSUED",
    participant: "",
    notes: "",
  });
  const [evidence, setEvidence] = useState({
    caseId: "",
    logicalEvidenceKey: "",
    category: "ALLEGATION_QUERY",
    title: "",
    contentText: "",
    documentReference: "",
    finalized: false,
  });
  const [caseTransition, setCaseTransition] = useState({
    caseId: "",
    status: "",
    outcome: "",
    reason: "",
  });

  const selectedCase = useMemo(
    () => records.find((row) => row.id === caseTransition.caseId),
    [records, caseTransition.caseId]
  );
  const allowedStatuses = selectedCase
    ? catalog?.disciplinaryTransitions?.[selectedCase.status] || []
    : [];

  const caseOptions = (value, onChange) => (
    <select required value={value} onChange={onChange} style={inputStyle}>
      <option value="">Select case</option>
      {records.map((row) => (
        <option key={row.id} value={row.id}>
          {row.caseNumber} — {row.employeeNumber} — {row.status}
        </option>
      ))}
    </select>
  );

  const recordProcessEvent = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await apiRequest(
        `/api/employment-governance/disciplinary-cases/${processEvent.caseId}/process-events`,
        {
          method: "POST",
          body: {
            eventType: processEvent.eventType,
            participant: processEvent.participant || undefined,
            notes: processEvent.notes || undefined,
            occurredAt: new Date().toISOString(),
          },
        }
      );
      announce("Disciplinary process event appended to the case audit trail.");
      setProcessEvent({
        caseId: "",
        eventType: "QUERY_ISSUED",
        participant: "",
        notes: "",
      });
      await reload();
    } catch (err) {
      setError(err.message || "Unable to record disciplinary process event.");
    } finally {
      setBusy(false);
    }
  };

  const appendEvidence = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await apiRequest(
        `/api/employment-governance/disciplinary-cases/${evidence.caseId}/evidence`,
        {
          method: "POST",
          body: {
            logicalEvidenceKey: evidence.logicalEvidenceKey || undefined,
            category: evidence.category,
            title: evidence.title,
            content: evidence.contentText
              ? { text: evidence.contentText }
              : undefined,
            documentReference: evidence.documentReference || undefined,
            finalized: evidence.finalized,
          },
        }
      );
      announce("Evidence version appended without overwriting prior evidence.");
      setEvidence({
        caseId: "",
        logicalEvidenceKey: "",
        category: "ALLEGATION_QUERY",
        title: "",
        contentText: "",
        documentReference: "",
        finalized: false,
      });
      await reload();
    } catch (err) {
      setError(err.message || "Unable to append disciplinary evidence.");
    } finally {
      setBusy(false);
    }
  };

  const advanceCase = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await apiRequest(
        `/api/employment-governance/disciplinary-cases/${caseTransition.caseId}`,
        {
          method: "PATCH",
          body: {
            status: caseTransition.status,
            outcome: caseTransition.outcome || undefined,
            reason: caseTransition.reason || undefined,
          },
        }
      );
      announce("Disciplinary case advanced and status-change audit event recorded.");
      setCaseTransition({
        caseId: "",
        status: "",
        outcome: "",
        reason: "",
      });
      await reload();
    } catch (err) {
      setError(err.message || "Unable to advance disciplinary case.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrapStyle}>
      <div style={controlNoteStyle}>
        <strong>Performance-management control:</strong> for poor-performance matters,
        record coaching, warning, PIP, review and employee response evidence before
        management decision. The case status cannot skip the defined governance stages.
      </div>

      <div style={gridStyle}>
        <form onSubmit={recordProcessEvent} style={cardStyle}>
          <h3 style={titleStyle}>Record Process Event</h3>
          <label style={fieldStyle}>
            <span style={labelStyle}>Internal Case</span>
            {caseOptions(processEvent.caseId, (e) =>
              setProcessEvent({ ...processEvent, caseId: e.target.value })
            )}
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Process Step</span>
            <select
              value={processEvent.eventType}
              onChange={(e) =>
                setProcessEvent({ ...processEvent, eventType: e.target.value })
              }
              style={inputStyle}
            >
              {PROCESS_EVENTS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Participant</span>
            <input
              value={processEvent.participant}
              onChange={(e) =>
                setProcessEvent({ ...processEvent, participant: e.target.value })
              }
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Notes</span>
            <textarea
              value={processEvent.notes}
              onChange={(e) =>
                setProcessEvent({ ...processEvent, notes: e.target.value })
              }
              style={textareaStyle}
            />
          </label>
          <button disabled={busy} style={primaryButton}>Append Process Event</button>
        </form>

        <form onSubmit={appendEvidence} style={cardStyle}>
          <h3 style={titleStyle}>Append Evidence Version</h3>
          <label style={fieldStyle}>
            <span style={labelStyle}>Internal Case</span>
            {caseOptions(evidence.caseId, (e) =>
              setEvidence({ ...evidence, caseId: e.target.value })
            )}
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Category</span>
            <select
              value={evidence.category}
              onChange={(e) => setEvidence({ ...evidence, category: e.target.value })}
              style={inputStyle}
            >
              {EVIDENCE_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Evidence Title</span>
            <input
              required
              value={evidence.title}
              onChange={(e) => setEvidence({ ...evidence, title: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Logical Evidence Key</span>
            <input
              value={evidence.logicalEvidenceKey}
              onChange={(e) =>
                setEvidence({ ...evidence, logicalEvidenceKey: e.target.value })
              }
              placeholder="Reuse to append a corrected version"
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Document Reference</span>
            <input
              value={evidence.documentReference}
              onChange={(e) =>
                setEvidence({ ...evidence, documentReference: e.target.value })
              }
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Evidence Notes / Content</span>
            <textarea
              value={evidence.contentText}
              onChange={(e) => setEvidence({ ...evidence, contentText: e.target.value })}
              style={textareaStyle}
            />
          </label>
          <label style={checkStyle}>
            <input
              type="checkbox"
              checked={evidence.finalized}
              onChange={(e) => setEvidence({ ...evidence, finalized: e.target.checked })}
            />
            Finalize this evidence version
          </label>
          <button disabled={busy} style={primaryButton}>Append Evidence</button>
        </form>

        <form onSubmit={advanceCase} style={cardStyle}>
          <h3 style={titleStyle}>Advance Case Status</h3>
          <label style={fieldStyle}>
            <span style={labelStyle}>Internal Case</span>
            {caseOptions(caseTransition.caseId, (e) =>
              setCaseTransition({
                caseId: e.target.value,
                status: "",
                outcome: "",
                reason: "",
              })
            )}
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Next Permitted Status</span>
            <select
              required
              value={caseTransition.status}
              onChange={(e) =>
                setCaseTransition({ ...caseTransition, status: e.target.value })
              }
              style={inputStyle}
              disabled={!caseTransition.caseId || !allowedStatuses.length}
            >
              <option value="">Select next status</option>
              {allowedStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Decision Outcome</span>
            <input
              required={caseTransition.status === "CLOSED"}
              value={caseTransition.outcome}
              onChange={(e) =>
                setCaseTransition({ ...caseTransition, outcome: e.target.value })
              }
              placeholder={
                caseTransition.status === "CLOSED"
                  ? "Required before closure"
                  : "Optional until decision"
              }
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Transition Reason / Authority</span>
            <textarea
              value={caseTransition.reason}
              onChange={(e) =>
                setCaseTransition({ ...caseTransition, reason: e.target.value })
              }
              style={textareaStyle}
            />
          </label>
          <button
            disabled={busy || !caseTransition.caseId || !caseTransition.status}
            style={primaryButton}
          >
            Record Case Transition
          </button>
        </form>
      </div>
    </div>
  );
}

const wrapStyle = { marginTop: 20 };
const controlNoteStyle = {
  border: "1px solid #6B5B14",
  background: "#1E210E",
  color: "#E7E0B0",
  borderRadius: 10,
  padding: 12,
  lineHeight: 1.5,
};
const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
  gap: 14,
  marginTop: 14,
};
const cardStyle = {
  display: "grid",
  gap: 10,
  alignContent: "start",
  border: "1px solid #315443",
  borderRadius: 11,
  padding: 14,
  background: "#09251A",
};
const titleStyle = { margin: 0, color: "#EFF6F1", fontSize: 16 };
const fieldStyle = { display: "grid", gap: 6 };
const labelStyle = {
  color: "#D6B437",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #315443",
  borderRadius: 8,
  background: "#0B291D",
  color: "#ECF4EF",
  padding: "10px 11px",
  minHeight: 42,
};
const textareaStyle = { ...inputStyle, minHeight: 82, resize: "vertical" };
const checkStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  color: "#BFCBC5",
  fontSize: 12,
};
const primaryButton = {
  border: 0,
  borderRadius: 9,
  padding: "11px 15px",
  minHeight: 42,
  background: "#D6B437",
  color: "#111A15",
  fontWeight: 900,
  cursor: "pointer",
};
