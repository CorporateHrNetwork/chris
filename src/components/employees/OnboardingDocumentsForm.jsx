import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../services/api";

const DOCUMENT_TYPES = [
  ["CV_RESUME", "CV / Resume"],
  ["OFFER_APPOINTMENT", "Offer / Appointment Letter"],
  ["VALID_ID", "Valid ID"],
  ["CERTIFICATES", "Certificates"],
  ["PASSPORT_PHOTO", "Passport Photograph"],
  ["OTHER", "Other Required Documents"],
];

export default function OnboardingDocumentsForm({ record, onSaved, onCompleted, inputStyle }) {
  const [category, setCategory] = useState("CV_RESUME");
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [replacingDocument, setReplacingDocument] = useState(null);
  const fileInputRef = useRef(null);

  async function loadDocuments() {
    if (!record?.id) return;
    const result = await apiRequest(
      `/api/employees/onboarding/records/${encodeURIComponent(record.id)}/documents`
    );
    setDocuments(result?.data || []);
  }

  useEffect(() => {
    loadDocuments().catch(() => {});
  }, [record?.id]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const successMessages = [
      "Employee document deleted successfully.",
      "Employee document uploaded successfully.",
      "Employee document replaced successfully.",
      "Document deleted.",
      "Document uploaded.",
      "Document replaced.",
    ];

    const shouldAutoDismiss =
      successMessages.some((message) =>
        feedback.includes(message)
      );

    if (!shouldAutoDismiss) {
      return undefined;
    }

    const timer =
      window.setTimeout(() => {
        setFeedback("");
      }, 4000);

    return () =>
      window.clearTimeout(timer);
  }, [feedback]);

  function clearEditor() {
    setFile(null);
    setNotes("");
    setReplacingDocument(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function beginReplace(document) {
    setReplacingDocument(document);
    setCategory(document.category || "CV_RESUME");
    setNotes(document.notes || "");
    setFile(null);
    setFeedback(`Replacing ${document.originalName}. Choose the new file.`);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function saveDocument() {
    if (!file) {
      setFeedback(
        replacingDocument ? "Choose the replacement file." : "Choose a file to upload."
      );
      return;
    }

    setBusy(true);
    setFeedback("");

    try {
      const body = new FormData();
      body.append("document", file);
      body.append("category", category);
      body.append("notes", notes);

      const replacing = Boolean(replacingDocument?.id);
      const endpoint = replacing
        ? `/api/employees/onboarding/records/${encodeURIComponent(record.id)}/documents/${encodeURIComponent(replacingDocument.id)}/replace`
        : `/api/employees/onboarding/records/${encodeURIComponent(record.id)}/documents`;

      const result = await apiRequest(endpoint, {
        method: "POST",
        body,
      });

      setFeedback(
        result?.message || (replacing ? "Document replaced." : "Document uploaded.")
      );
      clearEditor();
      await loadDocuments();

      if (onSaved) await onSaved(result?.onboarding);
    } catch (error) {
      setFeedback(error?.message || "Unable to save document.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(document) {
    const confirmed = window.confirm(
      `Delete "${document.originalName}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setBusy(true);
    setFeedback("");

    try {
      const result = await apiRequest(
        `/api/employees/onboarding/records/${encodeURIComponent(record.id)}/documents/${encodeURIComponent(document.id)}`,
        { method: "DELETE" }
      );

      if (replacingDocument?.id === document.id) clearEditor();
      setFeedback(result?.message || "Document deleted.");
      await loadDocuments();
      if (onSaved) await onSaved(result?.onboarding);
    } catch (error) {
      setFeedback(error?.message || "Unable to delete document.");
    } finally {
      setBusy(false);
    }
  }

  async function completeDocuments() {
    setCompleting(true);
    setFeedback("");
    try {
      const result = await apiRequest(
        `/api/employees/onboarding/records/${encodeURIComponent(record.id)}/documents/complete`,
        { method: "POST" }
      );
      setFeedback(result?.message || "Documents section completed successfully.");
      await onCompleted?.(result?.data);
    } catch (error) {
      setFeedback(error?.message || "Unable to complete the Documents section.");
    } finally {
      setCompleting(false);
    }
  }

  const completedCategories = new Set(documents.map((document) => document.category));
  const requiredCount = DOCUMENT_TYPES.length;
  const completedCount = DOCUMENT_TYPES.filter(([value]) => completedCategories.has(value)).length;

  return (
    <div style={wrapStyle}>
      <style>{`
        .chris-onboarding-file-input::file-selector-button {
          margin-right: 10px;
          min-height: 32px;
          padding: 0 14px;
          border: 1px solid var(--chris-gold);
          border-radius: 8px;
          background: rgba(212, 175, 55, 0.10);
          color: var(--chris-gold);
          font-weight: 800;
          cursor: pointer;
        }

        .chris-onboarding-file-input::file-selector-button:hover {
          background: rgba(212, 175, 55, 0.18);
        }
      `}</style>
      {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}

      <div style={documentProgressStyle}>
        <strong>Required documents</strong>
        <span>{completedCount}/{requiredCount} uploaded</span>
      </div>

      {replacingDocument ? (
        <div style={replaceBannerStyle}>
          <div>
            <strong>Replace document</strong>
            <div style={mutedStyle}>{replacingDocument.originalName}</div>
          </div>
          <button type="button" onClick={clearEditor} disabled={busy} style={cancelButtonStyle}>
            Cancel Replace
          </button>
        </div>
      ) : null}

      <div style={formGridStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Document Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {DOCUMENT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>File</span>
          <input
            ref={fileInputRef}
            type="file"
            className="chris-onboarding-file-input"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
        </label>

        <button type="button" onClick={saveDocument} disabled={busy} style={uploadButtonStyle}>
          {busy ? "Working..." : replacingDocument ? "Replace Document" : "Upload Document"}
        </button>
      </div>

      <div style={listStyle}>
        {documents.length ? documents.map((document) => (
          <div key={document.id} style={documentRowStyle}>
            <div style={documentInfoStyle}>
              <strong>{document.categoryLabel}</strong>
              <div style={mutedStyle}>{document.originalName}</div>
              <div style={mutedStyle}>
                {Math.max(1, Math.round(Number(document.sizeBytes || 0) / 1024))}{" KB"}
              </div>
            </div>

            <div style={actionStyle}>
              <button
                type="button"
                onClick={() => beginReplace(document)}
                disabled={busy}
                style={replaceButtonStyle}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => deleteDocument(document)}
                disabled={busy}
                style={deleteButtonStyle}
              >
                Delete
              </button>
            </div>
          </div>
        )) : (
          <div style={mutedStyle}>No onboarding documents uploaded yet.</div>
        )}
      </div>

      {completedCount === requiredCount ? (
        <button
          type="button"
          onClick={completeDocuments}
          disabled={busy || completing}
          style={completeButtonStyle}
        >
          {completing ? "Completing Documents…" : "Complete Documents & Continue"}
        </button>
      ) : null}
    </div>
  );
}

const wrapStyle = { display: "grid", gap: 16 };
const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 12,
  alignItems: "end",
};
const fieldStyle = { display: "grid", gap: 7 };
const labelStyle = {
  color: "var(--chris-text-secondary)",
  fontSize: "var(--chris-font-sm)",
  fontWeight: 800,
};
const uploadButtonStyle = {
  minHeight: 44,
  border: "1px solid var(--chris-gold)",
  borderRadius: "var(--chris-radius-md)",
  background: "var(--chris-gold)",
  color: "#07130D",
  fontWeight: 900,
  cursor: "pointer",
};
const listStyle = { display: "grid", gap: 8 };
const documentProgressStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  border: "1px solid var(--chris-border)",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(255,255,255,.025)",
};
const completeButtonStyle = {
  minHeight: 42,
  justifySelf: "end",
  padding: "0 16px",
  border: "1px solid var(--chris-gold)",
  borderRadius: "var(--chris-radius-md)",
  background: "var(--chris-gold)",
  color: "#07130D",
  fontWeight: 900,
  cursor: "pointer",
};
const documentRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  padding: 12,
  border: "1px solid var(--chris-border)",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(255,255,255,.02)",
};
const documentInfoStyle = { minWidth: 0 };
const actionStyle = { display: "flex", gap: 8, flexWrap: "wrap" };
const replaceButtonStyle = {
  minHeight: 36,
  padding: "0 13px",
  border: "1px solid var(--chris-gold)",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(212,175,55,.08)",
  color: "var(--chris-gold)",
  fontWeight: 800,
  cursor: "pointer",
};
const deleteButtonStyle = {
  minHeight: 36,
  padding: "0 13px",
  border: "1px solid rgba(239,68,68,.45)",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(239,68,68,.08)",
  color: "#FCA5A5",
  fontWeight: 800,
  cursor: "pointer",
};
const cancelButtonStyle = {
  minHeight: 34,
  padding: "0 12px",
  border: "1px solid var(--chris-border)",
  borderRadius: "var(--chris-radius-md)",
  background: "transparent",
  color: "var(--chris-text-main)",
  fontWeight: 800,
  cursor: "pointer",
};
const replaceBannerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  border: "1px solid rgba(212,175,55,.28)",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(212,175,55,.06)",
};
const feedbackStyle = {
  padding: 11,
  border: "1px solid rgba(212,175,55,.22)",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(212,175,55,.05)",
  color: "var(--chris-text-main)",
};
const mutedStyle = {
  color: "var(--chris-text-secondary)",
  fontSize: "var(--chris-font-sm)",
};
