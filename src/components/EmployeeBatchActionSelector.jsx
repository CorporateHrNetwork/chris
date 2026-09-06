import { useMemo } from "react";

const normalize = (value) => String(value || "").trim().toLowerCase();

export default function EmployeeBatchActionSelector({
  rows = [],
  selectedIds = [],
  onSelectedIdsChange,
  searchValue = "",
  onSearchValueChange,
  getId = (row) => row.id,
  getEmployeeNumber = (row) => row.employeeNumber,
  getEmployeeName = (row) => row.employeeName,
  getSearchText = null,
  actions = [],
  viewSelectedOnly = false,
  onViewSelectedOnlyChange,
  label = "Employee Selection",
  placeholder = "Search employee number or name",
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const searchTerm = normalize(searchValue);

  const visibleRows = useMemo(() => {
    if (!searchTerm) return rows;
    return rows.filter((row) => {
      const text = getSearchText
        ? getSearchText(row)
        : [getEmployeeNumber(row), getEmployeeName(row), row.department, row.designation, row.locationName, row.status]
            .filter(Boolean)
            .join(" ");
      return normalize(text).includes(searchTerm);
    });
  }, [rows, searchTerm, getSearchText, getEmployeeNumber, getEmployeeName]);

  const visibleIds = visibleRows.map(getId).filter(Boolean);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const setSelected = (next) => onSelectedIdsChange?.(Array.from(new Set(next)));
  const toggleOne = (id) => setSelected(selectedSet.has(id)
    ? selectedIds.filter((value) => value !== id)
    : [...selectedIds, id]);
  const toggleVisible = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleIds);
      setSelected(selectedIds.filter((id) => !visibleSet.has(id)));
    } else {
      setSelected([...selectedIds, ...visibleIds]);
    }
  };

  return (
    <section style={shellStyle} aria-label={label}>
      <div style={topRowStyle}>
        <label style={searchLabelStyle}>
          <span style={captionStyle}>{label}</span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchValueChange?.(event.target.value)}
            placeholder={placeholder}
            style={searchInputStyle}
          />
        </label>
        <div style={selectionSummaryStyle}>
          <strong>{selectedIds.length}</strong> selected
          <span>·</span>
          <span>{visibleRows.length} visible</span>
        </div>
      </div>

      <div style={controlRowStyle}>
        <label style={checkLabelStyle}>
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!visibleIds.length} />
          Select all visible
        </label>
        <button type="button" style={secondaryButton} onClick={() => setSelected([])} disabled={!selectedIds.length}>Clear selection</button>
        {onViewSelectedOnlyChange && (
          <button type="button" style={viewSelectedOnly ? activeButton : secondaryButton} onClick={() => onViewSelectedOnlyChange(!viewSelectedOnly)} disabled={!selectedIds.length && !viewSelectedOnly}>
            {viewSelectedOnly ? "Show All" : "View Selected"}
          </button>
        )}
        <div style={actionAreaStyle}>
          {actions.map((action) => (
            <button
              key={action.key || action.label}
              type="button"
              style={action.danger ? dangerButton : action.primary ? primaryButton : secondaryButton}
              disabled={Boolean(action.disabled) || !selectedIds.length}
              onClick={() => action.onClick?.(selectedIds)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <div style={chipsStyle}>
        {visibleRows.slice(0, 24).map((row) => {
          const id = getId(row);
          const checked = selectedSet.has(id);
          return (
            <label key={id} style={{ ...employeeOptionStyle, ...(checked ? selectedOptionStyle : {}) }}>
              <input type="checkbox" checked={checked} onChange={() => toggleOne(id)} />
              <span><strong>{getEmployeeNumber(row)}</strong> — {getEmployeeName(row)}</span>
            </label>
          );
        })}
        {visibleRows.length > 24 && <span style={moreStyle}>+{visibleRows.length - 24} more matching employees in the register</span>}
      </div>
    </section>
  );
}

const shellStyle = { display: "grid", gap: 12, marginBottom: 16, padding: 14, border: "1px solid rgba(212,175,55,.34)", borderRadius: 12, background: "rgba(0,0,0,.12)" };
const topRowStyle = { display: "flex", gap: 14, alignItems: "end", justifyContent: "space-between", flexWrap: "wrap" };
const searchLabelStyle = { display: "grid", gap: 6, flex: "1 1 320px", maxWidth: 620 };
const captionStyle = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".06em", textTransform: "uppercase" };
const searchInputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const selectionSummaryStyle = { display: "flex", gap: 7, alignItems: "center", color: "#C7D3CC", fontSize: 12 };
const controlRowStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const checkLabelStyle = { display: "inline-flex", gap: 7, alignItems: "center", color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
const actionAreaStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" };
const buttonBase = { borderRadius: 8, padding: "8px 11px", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...buttonBase, border: "1px solid rgba(212,175,55,.48)", background: "transparent", color: "#D4AF37" };
const activeButton = { ...buttonBase, border: "1px solid #D4AF37", background: "rgba(212,175,55,.15)", color: "#F8D56B" };
const primaryButton = { ...buttonBase, border: 0, background: "#D4AF37", color: "#07140D" };
const dangerButton = { ...buttonBase, border: "1px solid rgba(248,113,113,.65)", background: "rgba(185,28,28,.11)", color: "#FCA5A5" };
const chipsStyle = { display: "flex", gap: 7, flexWrap: "wrap", maxHeight: 150, overflowY: "auto" };
const employeeOptionStyle = { display: "inline-flex", gap: 7, alignItems: "center", padding: "7px 9px", borderRadius: 9, border: "1px solid rgba(255,255,255,.08)", color: "#C7D3CC", background: "rgba(255,255,255,.025)", fontSize: 11, cursor: "pointer" };
const selectedOptionStyle = { border: "1px solid rgba(212,175,55,.65)", background: "rgba(212,175,55,.10)", color: "#F7FAF8" };
const moreStyle = { padding: "7px 4px", color: "#9FB7AA", fontSize: 11 };
