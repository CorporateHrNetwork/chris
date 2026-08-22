import { getEmployeeStatusMeta } from "../../utils/employeeStatus";

export default function StatusBadge({ status, style, className = "" }) {
  const meta = getEmployeeStatusMeta(status);
  return (
    <span
      className={`employee-status employee-status--${meta.tone} ${className}`.trim()}
      data-status={meta.key || "UNKNOWN"}
      aria-label={`Employment status: ${meta.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 26,
        padding: "3px 9px",
        border: `1px solid ${meta.border}`,
        borderRadius: 999,
        background: meta.background,
        color: meta.color,
        fontSize: 11,
        fontWeight: 850,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {meta.label}
    </span>
  );
}