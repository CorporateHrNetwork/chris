import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../services/api";

function EmployeeLookup({ value, onSelect, disabled = false, placeholder = "Search employee name, number, department, designation, email or phone..." }) {
  const rootRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await apiRequest("/api/employees");
        if (!cancelled) setEmployees(result.data || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Unable to load employees.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function outside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  useEffect(() => {
    if (!value) {
      setQuery("");
      return;
    }
    const selected = employees.find((e) => e.employeeNumber === value);
    setQuery(selected ? formatSelected(selected) : value);
  }, [value, employees]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = employees.filter((employee) => {
      if (!term) return true;
      const searchable = [
        employee.employeeNumber,
        employee.firstName,
        employee.middleName,
        employee.lastName,
        employee.email,
        employee.phone,
        employee.department?.name,
        employee.designation?.name,
        employee.location?.name,
        employee.status,
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(term);
    });
    return list.slice(0, 8);
  }, [employees, query]);

  function selectEmployee(employee) {
    setQuery(formatSelected(employee));
    setOpen(false);
    onSelect?.({ employeeNumber: employee.employeeNumber, employee });
  }

  function clearSelection() {
    setQuery("");
    setOpen(true);
    onSelect?.({ employeeNumber: "", employee: null });
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      selectEmployee(filtered[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <input
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onSelect?.({ employeeNumber: "", employee: null });
          }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          style={{ width:"100%", boxSizing:"border-box", padding:"11px 42px 11px 12px", borderRadius:"var(--chris-radius-md)", border:"1px solid var(--chris-border-soft)", background:"var(--chris-input-bg)", color:"var(--chris-text-main)", fontFamily:"var(--chris-font-family)", opacity: disabled ? 0.65 : 1 }}
        />
        {value && !disabled && (
          <button type="button" onClick={clearSelection} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", width:28, height:28, border:"none", borderRadius:"50%", background:"rgba(255,255,255,.05)", color:"var(--chris-text-secondary)", fontSize:20, cursor:"pointer" }}>×</button>
        )}
      </div>

      {open && !disabled && (
        <div style={{ position:"absolute", zIndex:100, left:0, right:0, top:"calc(100% + 6px)", maxHeight:360, overflowY:"auto", padding:8, borderRadius:"var(--chris-radius-md)", border:"1px solid var(--chris-border-gold)", background:"linear-gradient(145deg, rgba(8,30,20,.99), rgba(4,16,11,.995))", boxShadow:"0 18px 45px rgba(0,0,0,.42)" }}>
          {loading ? <div style={stateStyle}>Loading employees...</div> :
           error ? <div style={{...stateStyle,color:"var(--chris-warning)"}}>{error}</div> :
           filtered.length ? filtered.map((employee,index) => (
            <button
              key={employee.id || employee.employeeNumber}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => { event.preventDefault(); selectEmployee(employee); }}
              style={{ display:"block", width:"100%", textAlign:"left", padding:"11px 12px", border:"1px solid transparent", borderRadius:"var(--chris-radius-md)", background:index===activeIndex ? "rgba(212,175,55,.10)" : "transparent", color:"var(--chris-text-main)", cursor:"pointer" }}
            >
              <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                <strong>{formatName(employee)}</strong>
                <span style={{ padding:"3px 7px", borderRadius:"var(--chris-radius-pill)", background:"rgba(212,175,55,.10)", color:"var(--chris-gold)", fontSize:"var(--chris-font-xs)", fontWeight:800 }}>{employee.employeeNumber}</span>
              </div>
              <div style={{ marginTop:5, color:"var(--chris-text-secondary)", fontSize:"var(--chris-font-xs)" }}>
                {[employee.department?.name, employee.designation?.name, employee.location?.name].filter(Boolean).join(" · ") || "Organization details not assigned"}
              </div>
              {(employee.email || employee.phone) && (
                <div style={{ marginTop:3, color:"var(--chris-text-muted)", fontSize:"var(--chris-font-xs)" }}>
                  {[employee.email, employee.phone].filter(Boolean).join(" · ")}
                </div>
              )}
            </button>
          )) : <div style={stateStyle}>No matching employees.</div>}
        </div>
      )}
    </div>
  );
}

function formatName(employee) {
  return [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ");
}
function formatSelected(employee) {
  const name = formatName(employee);
  return name ? `${name} — ${employee.employeeNumber}` : employee.employeeNumber || "";
}
const stateStyle = { padding:"14px 12px", color:"var(--chris-text-secondary)", fontSize:"var(--chris-font-sm)" };

export default EmployeeLookup;
