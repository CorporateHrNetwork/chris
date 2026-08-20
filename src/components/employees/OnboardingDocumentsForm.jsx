import { useEffect, useState } from "react";
import {
  apiRequest,
} from "../../services/api";

const DOCUMENT_TYPES = [
  ["CV_RESUME", "CV / Resume"],
  ["OFFER_APPOINTMENT", "Offer / Appointment Letter"],
  ["VALID_ID", "Valid ID"],
  ["CERTIFICATES", "Certificates"],
  ["PASSPORT_PHOTO", "Passport Photograph"],
  ["OTHER", "Other Required Documents"],
];

export default function OnboardingDocumentsForm({
  record,
  onSaved,
  inputStyle,
}) {
  const [category, setCategory] =
    useState("CV_RESUME");
  const [file, setFile] =
    useState(null);
  const [notes, setNotes] =
    useState("");
  const [documents, setDocuments] =
    useState([]);
  const [busy, setBusy] =
    useState(false);
  const [feedback, setFeedback] =
    useState("");

  async function loadDocuments() {
    if (!record?.id) return;

    const result =
      await apiRequest(
        `/api/employees/onboarding/records/${encodeURIComponent(
          record.id
        )}/documents`
      );

    setDocuments(
      result?.data || []
    );
  }

  useEffect(() => {
    loadDocuments().catch(() => {});
  }, [record?.id]);

  async function uploadDocument() {
    if (!file) {
      setFeedback(
        "Choose a file to upload."
      );
      return;
    }

    setBusy(true);
    setFeedback("");

    try {
      const body = new FormData();
      body.append(
        "document",
        file
      );
      body.append(
        "category",
        category
      );
      body.append(
        "notes",
        notes
      );

      const result =
        await apiRequest(
          `/api/employees/onboarding/records/${encodeURIComponent(
            record.id
          )}/documents`,
          {
            method: "POST",
            body,
          }
        );

      setFeedback(
        result?.message ||
          "Document uploaded."
      );

      setFile(null);
      setNotes("");
      await loadDocuments();

      if (onSaved) {
        await onSaved(
          result?.onboarding
        );
      }
    } catch (error) {
      setFeedback(
        error?.message ||
          "Unable to upload document."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={wrapStyle}>
      {feedback ? (
        <div style={feedbackStyle}>
          {feedback}
        </div>
      ) : null}

      <div style={formGridStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>
            Document Type
          </span>
          <select
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value
              )
            }
            style={inputStyle}
          >
            {DOCUMENT_TYPES.map(
              ([value, label]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              )
            )}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>
            File
          </span>
          <input
            type="file"
            onChange={(event) =>
              setFile(
                event.target.files?.[0] ||
                  null
              )
            }
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>
            Notes
          </span>
          <input
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value
              )
            }
            style={inputStyle}
          />
        </label>

        <button
          type="button"
          onClick={uploadDocument}
          disabled={busy}
          style={uploadButtonStyle}
        >
          {busy
            ? "Uploading..."
            : "Upload Document"}
        </button>
      </div>

      <div style={listStyle}>
        {documents.length ? (
          documents.map(
            (document) => (
              <div
                key={document.id}
                style={documentRowStyle}
              >
                <div>
                  <strong>
                    {
                      document.categoryLabel
                    }
                  </strong>
                  <div style={mutedStyle}>
                    {document.originalName}
                  </div>
                </div>

                <div style={mutedStyle}>
                  {Math.max(
                    1,
                    Math.round(
                      Number(
                        document.sizeBytes ||
                          0
                      ) / 1024
                    )
                  )}
                  {" KB"}
                </div>
              </div>
            )
          )
        ) : (
          <div style={mutedStyle}>
            No onboarding documents uploaded yet.
          </div>
        )}
      </div>
    </div>
  );
}

const wrapStyle = {
  display: "grid",
  gap: 16,
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(220px,1fr))",
  gap: 12,
  alignItems: "end",
};

const fieldStyle = {
  display: "grid",
  gap: 7,
};

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

const listStyle = {
  display: "grid",
  gap: 8,
};

const documentRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: 12,
  border: "1px solid var(--chris-border)",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(255,255,255,.02)",
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
