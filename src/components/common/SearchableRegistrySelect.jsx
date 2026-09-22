import { useMemo, useState } from "react";
import "./SearchableRegistrySelect.css";

export default function SearchableRegistrySelect({ value = "", options = [], onChange, placeholder = "Search and select", inputStyle, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const query = String(value || "").trim().toLowerCase();
  const filtered = useMemo(() => options.filter((option) =>
    !query || String(option.label).toLowerCase().includes(query)
  ).slice(0, 50), [options, query]);

  return <div className="chris-searchable-select">
    <input type="search" value={value} aria-label={ariaLabel} aria-expanded={open} aria-autocomplete="list" placeholder={placeholder} autoComplete="off" style={inputStyle}
      onFocus={() => setOpen(true)}
      onChange={(event) => { onChange(event.target.value, null); setOpen(true); }}
      onBlur={() => window.setTimeout(() => setOpen(false), 120)} />
    <div className="chris-searchable-options" role="listbox" hidden={!open}>
      {filtered.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.label === value}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onChange(option.label, option); setOpen(false); }}>{option.label}</button>)}
      {!filtered.length && <span>No supported option matches this search.</span>}
    </div>
  </div>;
}
