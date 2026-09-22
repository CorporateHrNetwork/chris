import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

export default function EmployeeExportModal({ onClose, onCreated }) {
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState([]);
  const [includeExited, setIncludeExited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    apiRequest("/api/employee-data/exports/catalog")
      .then((result) => {
        if (!live) return;
        setCatalog(result.data?.columns || []);
        setSelected(result.data?.defaultColumns || []);
      })
      .catch((err) => live && setError(err.message || "Unable to load export columns."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const allSelected = useMemo(
    () => catalog.length > 0 && selected.length === catalog.length,
    [catalog, selected]
  );

  const toggle = (key) => {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key]
    );
  };

  const submit = async () => {
    try {
      setCreating(true);
      setError("");
      const result = await apiRequest("/api/employee-data/exports", {
        method: "POST",
        body: {
          columns: selected,
          filters: { includeExited },
        },
      });
      onCreated?.(result.data);
      onClose();
    } catch (err) {
      setError(err.message || "Unable to create employee export.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={backdropStyle} role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" style={modalStyle} onMouseDown={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>EMPLOYEE DATA</div>
            <h2 style={titleStyle}>Export Employee Details</h2>
          </div>
          <button type="button" onClick={onClose} style={closeStyle} aria-label="Close export dialog">×</button>
        </header>

        <div style={bodyStyle}>
          <div style={sectionLabel}>File Format</div>
          <label style={radioRow}><input type="radio" checked readOnly /> Excel (.xlsx)</label>

          <div style={sectionLabel}>Scope</div>
          <label style={radioRow}>
            <input type="radio" checked={!includeExited} onChange={() => setIncludeExited(false)} />
            Current workforce
          </label>
          <label style={radioRow}>
            <input type="radio" checked={includeExited} onChange={() => setIncludeExited(true)} />
            All employee records, including exited/inactive employees
          </label>

          <div style={columnsHeader}>
            <div style={sectionLabel}>Columns</div>
            <button
              type="button"
              style={textButton}
              onClick={() => setSelected(allSelected ? [] : catalog.map((row) => row.key))}
              disabled={loading}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>

          {loading ? (
            <p style={muted}>Loading export fields…</p>
          ) : (
            <div style={gridStyle}>
              {catalog.map((column) => (
                <label key={column.key} style={checkboxRow}>
                  <input type="checkbox" checked={selected.includes(column.key)} onChange={() => toggle(column.key)} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          )}

          {error && <div role="alert" style={errorStyle}>{error}</div>}
        </div>

        <footer style={footerStyle}>
          <button type="button" style={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" style={primaryButton} onClick={submit} disabled={creating || selected.length === 0}>
            {creating ? "Generating…" : "Export"}
          </button>
        </footer>
      </section>
    </div>
  );
}

const backdropStyle = { position: "fixed", inset: 0, zIndex: 1500, display: "grid", placeItems: "center", padding: 20, background: "rgba(0,0,0,.6)", backdropFilter: "blur(3px)" };
const modalStyle = { width: "min(760px,100%)", maxHeight: "calc(100vh - 40px)", overflow: "auto", borderRadius: 18, border: "1px solid rgba(212,175,55,.62)", background: "#06291b", color: "#F7FAF8", boxShadow: "0 28px 80px rgba(0,0,0,.5)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,.09)" };
const eyebrowStyle = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".15em" };
const titleStyle = { margin: "4px 0 0", fontSize: 23 };
const closeStyle = { border: 0, background: "transparent", color: "#F7FAF8", fontSize: 27, cursor: "pointer" };
const bodyStyle = { padding: 22 };
const sectionLabel = { margin: "10px 0 9px", fontSize: 13, fontWeight: 900, color: "#D4AF37", textTransform: "uppercase", letterSpacing: ".05em" };
const radioRow = { display: "flex", gap: 8, alignItems: "center", margin: "8px 0", color: "#E5ECE8" };
const columnsHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 };
const textButton = { border: 0, background: "transparent", color: "#2EE98B", cursor: "pointer", fontWeight: 800 };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "10px 18px" };
const checkboxRow = { display: "flex", gap: 8, alignItems: "flex-start", color: "#E5ECE8", fontSize: 13 };
const muted = { color: "#AFC2B8" };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(185,28,28,.15)", border: "1px solid rgba(248,113,113,.5)", color: "#FCA5A5" };
const footerStyle = { display: "flex", justifyContent: "flex-end", gap: 10, padding: "17px 22px", borderTop: "1px solid rgba(255,255,255,.09)" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 17px", background: "#D4AF37", color: "#08140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.55)" };
