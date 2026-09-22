import { useMemo, useState } from "react";

const normalize = (value) => String(value ?? "").trim().toLowerCase();

export default function EmployeeBatchSelector({
  rows = [],
  getId = (row) => row.id,
  getSearchText = (row) => [row.employeeNumber, row.employeeName].filter(Boolean).join(" "),
  searchPlaceholder = "Search employee number or name",
  selectionLabel = "employee(s)",
  renderActions,
  pageSize = 0,
  children,
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [page, setPage] = useState(1);

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
  const unpagedDisplayRows = selectedOnly ? filteredRows.filter((row) => selectedIdSet.has(String(getId(row)))) : filteredRows;
  const effectivePageSize = Number(pageSize) > 0 ? Number(pageSize) : 0;
  const pageCount = effectivePageSize ? Math.max(1, Math.ceil(unpagedDisplayRows.length / effectivePageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const pageStart = effectivePageSize ? (safePage - 1) * effectivePageSize : 0;
  const displayRows = effectivePageSize
    ? unpagedDisplayRows.slice(pageStart, pageStart + effectivePageSize)
    : unpagedDisplayRows;
  const visibleIds = useMemo(() => displayRows.map((row) => String(getId(row))), [displayRows, getId]);
  const allFilteredSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIdSet.has(id));
  const someFilteredSelected = visibleIds.some((id) => selectedIdSet.has(id));

  const toggleOne = (row) => {
    const id = String(getId(row));
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleFiltered = () => {
    setSelectedIds((current) => {
      const currentSet = new Set(current);
      if (allFilteredSelected) visibleIds.forEach((id) => currentSet.delete(id));
      else visibleIds.forEach((id) => currentSet.add(id));
      return Array.from(currentSet);
    });
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedOnly(false);
    setPage(1);
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
    setSelectedOnly: (value) => {
      setSelectedOnly(value);
      setPage(1);
    },
    page: safePage,
    pageCount,
    pageSize: effectivePageSize,
    totalDisplayCount: unpagedDisplayRows.length,
  };

  return (
    <div style={shellStyle}>
      <div style={toolbarStyle}>
        <label style={searchStyle}>
          <span style={labelStyle}>Search / Select Employees</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
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
          <span style={mutedStyle}> · {displayRows.length} shown{effectivePageSize ? ` of ${unpagedDisplayRows.length}` : ""}</span>
        </div>

        <div style={buttonRowStyle}>
          <button type="button" style={secondaryButton} disabled={!selectedRows.length} onClick={() => { setSelectedOnly((value) => !value); setPage(1); }}>
            {selectedOnly ? "Show All" : "View Selected"}
          </button>
          <button type="button" style={secondaryButton} disabled={!selectedRows.length} onClick={clearSelection}>Clear Selection</button>
          {renderActions ? renderActions(api) : null}
        </div>
      </div>

      {effectivePageSize && pageCount > 1 && (
        <div style={paginationStyle}>
          <button type="button" style={secondaryButton} disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <span style={paginationTextStyle}>Page {safePage} of {pageCount}</span>
          <button type="button" style={secondaryButton} disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
        </div>
      )}

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

const paginationStyle = { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap" };
const paginationTextStyle = { color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
