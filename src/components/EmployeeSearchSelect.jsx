import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../services/api";

const normalize = (value) => String(value || "").trim().toLowerCase();

function optionLabel(option) {
  return option
    ? `${option.employeeNumber} — ${option.employeeName}`
    : "";
}

export default function EmployeeSearchSelect({
  label = "Employee",
  value = "",
  onChange,
  disabled = false,
  required = false,
  placeholder = "Search employee number or name",
  endpoint = "/api/payroll/employee-options",
}) {
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const committedValueRef = useRef("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const response = await apiRequest(endpoint);
        if (active) setOptions(response?.data || []);
      } catch (requestError) {
        if (active) {
          setError(requestError?.message || "Unable to load employees.");
          setOptions([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [endpoint]);

  useEffect(() => {
    if (!value && committedValueRef.current) {
      committedValueRef.current = "";
      setQuery("");
      return;
    }
    if (value && value !== committedValueRef.current) {
      const option = options.find((row) => row.employeeNumber === value);
      if (option) {
        committedValueRef.current = value;
        setQuery(optionLabel(option));
      } else if (!loading) {
        committedValueRef.current = value;
        setQuery(value);
      }
    }
  }, [value, options, loading]);

  const selected = useMemo(
    () => options.find((row) => row.employeeNumber === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const term = normalize(query);
    const selectedLabel = normalize(optionLabel(selected));
    const useAll = !term || (selected && term === selectedLabel);
    const rows = useAll
      ? options
      : options.filter((option) => {
          const searchable = [
            option.employeeNumber,
            option.employeeName,
            option.department,
            option.designation,
            option.employmentType,
            option.location,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return searchable.includes(term);
        });
    return rows.slice(0, 20);
  }, [options, query, selected]);

  const selectEmployee = (option) => {
    committedValueRef.current = option.employeeNumber;
    setQuery(optionLabel(option));
    setOpen(false);
    onChange?.(option.employeeNumber, option);
  };

  const handleInput = (event) => {
    const next = event.target.value;
    setQuery(next);
    setOpen(true);
    if (value) {
      committedValueRef.current = "";
      onChange?.("", null);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      setOpen(false);
      if (!value && committedValueRef.current === "") setQuery("");
    }, 120);
  };

  return (
    <label style={fieldStyle}>
      <span>{label}{required ? " *" : ""}</span>
      <div style={pickerStyle}>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={loading ? "Loading employees…" : placeholder}
          onChange={handleInput}
          onFocus={() => !disabled && setOpen(true)}
          onBlur={handleBlur}
          style={{ ...inputStyle, ...(disabled ? disabledInputStyle : {}) }}
        />

        {open && !disabled && (
          <div role="listbox" style={menuStyle}>
            {loading && <div style={messageStyle}>Loading employees…</div>}
            {!loading && error && <div style={errorStyle}>{error}</div>}
            {!loading && !error && filtered.length === 0 && (
              <div style={messageStyle}>No matching current employee.</div>
            )}
            {!loading && !error && filtered.map((option) => (
              <button
                key={option.id || option.employeeNumber}
                type="button"
                role="option"
                aria-selected={option.employeeNumber === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectEmployee(option)}
                style={optionStyle}
              >
                <div style={optionHeaderStyle}>
                  <strong>{option.employeeNumber}</strong>
                  <span>{option.employeeName}</span>
                </div>
                <div style={optionMetaStyle}>
                  <span>{option.department || "No department"}</span>
                  <span>•</span>
                  <span>{option.designation || "No designation"}</span>
                  {option.employmentType && <><span>•</span><span>{option.employmentType}</span></>}
                  {option.location && <><span>•</span><span>{option.location}</span></>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && !disabled && (
        <small style={selectedStyle}>
          Selected: {selected.employeeNumber} · {selected.employeeName}
        </small>
      )}
      {!selected && value && !loading && (
        <small style={selectedStyle}>Selected employee: {value}</small>
      )}
    </label>
  );
}

const fieldStyle = {
  display: "grid",
  gap: 6,
  minWidth: 200,
  color: "var(--chris-dashboard-text, #C7D3CC)",
  fontSize: 12,
  fontWeight: 800,
};

const pickerStyle = {
  position: "relative",
  minWidth: 0,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 9,
  border: "1px solid var(--chris-dashboard-border, rgba(212,175,55,.35))",
  padding: "10px 11px",
  background: "var(--chris-dashboard-surface, rgba(255,255,255,.06))",
  color: "var(--chris-dashboard-text, #F7FAF8)",
  outline: "none",
};

const disabledInputStyle = {
  opacity: 0.72,
  cursor: "not-allowed",
};

const menuStyle = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 1000,
  maxHeight: 320,
  overflowY: "auto",
  borderRadius: 10,
  border: "1px solid var(--chris-dashboard-border, rgba(212,175,55,.45))",
  background: "#071f15",
  boxShadow: "0 18px 38px rgba(0,0,0,.42)",
};

const optionStyle = {
  display: "grid",
  gap: 4,
  width: "100%",
  padding: "10px 12px",
  border: 0,
  borderBottom: "1px solid rgba(255,255,255,.07)",
  background: "transparent",
  color: "#F7FAF8",
  textAlign: "left",
  cursor: "pointer",
};

const optionHeaderStyle = {
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  flexWrap: "wrap",
};

const optionMetaStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  color: "#9FB7AA",
  fontSize: 11,
  fontWeight: 600,
};

const messageStyle = {
  padding: 12,
  color: "#C7D3CC",
  fontSize: 12,
};

const errorStyle = {
  ...messageStyle,
  color: "#FCA5A5",
};

const selectedStyle = {
  color: "var(--chris-dashboard-muted, #9FB7AA)",
  fontWeight: 600,
};
