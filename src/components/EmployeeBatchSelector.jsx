import { useMemo, useState } from "react";

const normalize = (value) => String(value ?? "").trim().toLowerCase();

export default function EmployeeBatchSelector({
  rows = [],
  getId = (row) => row.id,
  getSearchText = (row) => [row.employeeNumber, row.employeeName].filter(Boolean).join(" "),
  searchPlaceholder = "Search employee number or name",
  selectionLabel = "employee(s)",
  renderActions,
  children,
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedOnly, setSelectedOnly] = useState(false);

  const filteredRows = useMemo(() => {
    const term = normalize(query);
    if (!term) return rows || [];
    return (rows || []).filter((row) => normalize(getSearchText(row)).includes(term));
  }, [rows, query, getSearchText]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRows = useMemo(
    () => (rows || []).filter((row) => selectedIdSet.has(String(getId(row)))),
    [rows, selectedIdSet, getId]
  );
  const filteredIds = useMemo(() => filteredRows.map((row) => String(getId(row))), [filteredRows, getId]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIdSet.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIdSet.has(id));
  const displayRows = selectedOnly ? filteredRows.filter((row) => selectedIdSet.has(String(getId(row)))) : filteredRows;

  const toggleOne = (row) => {
    const id = String(getId(row));
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleFiltered = () => {
    setSelectedIds((current) => {
      const currentSet = new Set(current);
      if (allFilteredSelected) filteredIds.forEach((id) => currentSet.delete(id));
      else filteredIds.forEach((id) => currentSet.add(id));
      return Array.from(currentSet);
    });
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedOnly(false);
  };

  const api = {
    query,
    filteredRows,
    displayRows,
    selectedRows,
    selectedIds,
    selectedCount: selectedRows.length,
    isSelected: (row) => selectedIdSet.has(String(getId(row))),
    toggleOne,
    toggleFiltered,
    allFilteredSelected,
    someFilteredSelected,
    clearSelection,
    selectedOnly,
    setSelectedOnly,
  };

  return (
    <div style={shellStyle}>
      <div style={toolbarStyle}>
        <label style={searchStyle}>
          <span style={labelStyle}>Search / Select Employees</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            style={inputStyle}
          />
        </label>

        <label style={selectVisibleStyle}>
          <input
            type="checkbox"
            checked={allFilteredSelected}
            ref={(element) => { if (element) element.indeterminate = !allFilteredSelected && someFilteredSelected; }}
            onChange={toggleFiltered}
          />
          <span>{allFilteredSelected ? "Unselect visible" : "Select visible"}</span>
        </label>

        <div style={statusStyle}>
          <strong>{selectedRows.length}</strong> {selectionLabel} selected
          <span style={mutedStyle}> · {displayRows.length} shown</span>
        </div>

        <div style={buttonRowStyle}>
          <button type="button" style={secondaryButton} disabled={!selectedRows.length} onClick={() => setSelectedOnly((value) => !value)}>
            {selectedOnly ? "Show All" : "View Selected"}
          </button>
          <button type="button" style={secondaryButton} disabled={!selectedRows.length} onClick={clearSelection}>Clear Selection</button>
          {renderActions ? renderActions(api) : null}
        </div>
      </div>

      {children(api)}
    </div>
  );
}

const shellStyle = { display: "grid", gap: 12 };
const toolbarStyle = { display: "grid", gridTemplateColumns: "minmax(280px,1fr) auto auto", gap: 12, alignItems: "end", padding: 12, border: "1px solid rgba(212,175,55,.28)", borderRadius: 12, background: "rgba(255,255,255,.025)" };
const searchStyle = { display: "grid", gap: 6 };
const labelStyle = { color: "#C7D3CC", fontSize: 12, fontWeight: 900 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const selectVisibleStyle = { display: "inline-flex", gap: 8, alignItems: "center", minHeight: 40, color: "#F7FAF8", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const statusStyle = { minHeight: 40, display: "flex", alignItems: "center", color: "#D4AF37", fontSize: 12, whiteSpace: "nowrap" };
const mutedStyle = { color: "#9FB7AA", fontWeight: 700 };
const buttonRowStyle = { gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap" };
const secondaryButton = { borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 900, cursor: "pointer", background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.5)" };
