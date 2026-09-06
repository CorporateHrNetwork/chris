import { useEffect, useState } from "react";
import { apiRequest, getActiveLocationId, setActiveLocationId } from "../services/api";

export default function BranchContextSelector() {
  const [context, setContext] = useState(null);
  const [value, setValue] = useState(getActiveLocationId() || "");

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/zermatt/branch-context")
      .then((result) => {
        if (!cancelled) setContext(result?.data || null);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      });
    return () => { cancelled = true; };
  }, []);

  if (!context?.availableLocations?.length) return null;

  const change = (event) => {
    const next = event.target.value;
    setValue(next);
    setActiveLocationId(next || null);
    window.location.reload();
  };

  return (
    <div style={wrapStyle}>
      <span style={labelStyle}>WORKFORCE VIEW</span>
      <select aria-label="CHRiS branch context" value={value} onChange={change} style={selectStyle}>
        <option value="">Head Office · Consolidated All Branches</option>
        {context.availableLocations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}{location.code ? ` · ${location.code}` : ""}
          </option>
        ))}
      </select>
      <span style={helperStyle}>
        {value ? "Branch-specific operational context" : "Consolidated organization-wide staff strength"}
      </span>
    </div>
  );
}

const wrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 14,
  padding: "9px 11px",
  border: "1px solid rgba(212,175,55,.35)",
  borderRadius: 10,
  background: "rgba(4,46,28,.58)",
};
const labelStyle = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".12em" };
const selectStyle = {
  minWidth: 260,
  border: "1px solid rgba(212,175,55,.4)",
  borderRadius: 8,
  padding: "7px 9px",
  background: "#05291A",
  color: "#F7FAF8",
  fontWeight: 800,
};
const helperStyle = { color: "#AFC0B6", fontSize: 11 };
