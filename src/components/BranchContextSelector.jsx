import { useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  getActiveLocationId,
  setActiveLocationId,
} from "../services/api";

function locationLabel(location) {
  const name = String(location?.name || "Location").trim();
  const code = String(location?.code || "").trim();
  return `${name}${code ? ` · ${code}` : ""}`;
}

export default function BranchContextSelector({ compact = false }) {
  const [context, setContext] = useState(null);
  const [value, setValue] = useState(getActiveLocationId() || "");

  useEffect(() => {
    let cancelled = false;

    async function loadContext({ allowRecovery = true } = {}) {
      try {
        const result = await apiRequest("/api/zermatt/branch-context");
        if (cancelled) return;

        const nextContext = result?.data || null;
        setContext(nextContext);

        // ZERMATT Head Office is the consolidated 312-employee operating view.
        // The physical HEAD_OFFICE location row is therefore not a selectable
        // workforce branch. Only actual BRANCH locations receive a location ID.
        const selectableBranchIds = new Set(
          (nextContext?.availableLocations || [])
            .filter((location) => String(location?.type || "").toUpperCase() === "BRANCH")
            .map((location) => location.id)
        );

        const storedLocationId = getActiveLocationId() || "";
        const stillAvailable =
          !storedLocationId || selectableBranchIds.has(storedLocationId);

        if (!stillAvailable) {
          setActiveLocationId(null);
          setValue("");
        } else {
          setValue(storedLocationId);
        }
      } catch (error) {
        if (
          allowRecovery &&
          error?.code === "LOCATION_SCOPE_FORBIDDEN" &&
          getActiveLocationId()
        ) {
          setActiveLocationId(null);
          setValue("");
          await loadContext({ allowRecovery: false });
          return;
        }

        if (!cancelled) setContext(null);
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const branchLocations = useMemo(
    () =>
      (context?.availableLocations || [])
        .filter(
          (location) =>
            String(location?.type || "").toUpperCase() === "BRANCH"
        )
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [context]
  );

  const activeLocation = useMemo(
    () => branchLocations.find((location) => location.id === value) || null,
    [branchLocations, value]
  );

  if (!branchLocations.length) return null;

  const change = (event) => {
    const next = event.target.value;
    setValue(next);
    setActiveLocationId(next || null);
    window.location.reload();
  };

  const wrapStyle = compact ? compactWrapStyle : pageWrapStyle;
  const selectStyle = compact ? compactSelectStyle : pageSelectStyle;

  return (
    <div style={wrapStyle} data-chris-branch-context>
      <span style={labelStyle}>{compact ? "BRANCH" : "OPERATING CONTEXT"}</span>
      <select
        aria-label="CHRiS branch context"
        value={value}
        onChange={change}
        style={selectStyle}
      >
        <option value="">HEAD OFFICE</option>
        {branchLocations.map((location) => (
          <option key={location.id} value={location.id}>
            {locationLabel(location)}
          </option>
        ))}
      </select>
      <span style={compact ? compactScopeStyle : helperStyle}>
        {activeLocation
          ? `Operating in ${activeLocation.name}`
          : "Consolidated organization-wide view"}
      </span>
    </div>
  );
}

const labelStyle = {
  color: "#D4AF37",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: ".12em",
  whiteSpace: "nowrap",
};

const pageWrapStyle = {
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

const compactWrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
  maxWidth: 360,
  padding: "6px 8px",
  border: "1px solid rgba(212,175,55,.34)",
  borderRadius: 9,
  background: "rgba(2,10,7,.62)",
  boxShadow: "inset 0 0 12px rgba(8,122,67,.04)",
};

const pageSelectStyle = {
  minWidth: 260,
  border: "1px solid rgba(212,175,55,.4)",
  borderRadius: 8,
  padding: "7px 9px",
  background: "#05291A",
  color: "#F7FAF8",
  fontWeight: 800,
};

const compactSelectStyle = {
  minWidth: 190,
  maxWidth: 235,
  height: 32,
  border: "1px solid rgba(212,175,55,.36)",
  borderRadius: 7,
  padding: "0 7px",
  background: "#05291A",
  color: "#F7FAF8",
  fontSize: 11,
  fontWeight: 800,
  outline: "none",
};

const helperStyle = { color: "#AFC0B6", fontSize: 11 };

const compactScopeStyle = {
  color: "#9DB8AA",
  fontSize: 9,
  maxWidth: 105,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
