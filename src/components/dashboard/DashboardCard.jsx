export default function DashboardCard({
  title,
  value,
  subtitle,
  icon,
  tone = "green",
  progress,
  actionLabel,
  onAction,
  compact = false,
}) {
  const valueClass =
    tone === "gold"
      ? "chris-kpi-value chris-kpi-value--gold"
      : "chris-kpi-value chris-kpi-value--green";

  return (
    <article className={`chris-dashboard-card ${compact ? "chris-dashboard-card--compact" : ""}`}>
      <div className="chris-dashboard-card__shine" />

      <div className="chris-dashboard-card__header">
        <div>
          <div className="chris-dashboard-card__title">{title}</div>
          <div className="chris-dashboard-card__accent" />
        </div>

        {icon ? <div className="chris-dashboard-card__icon">{icon}</div> : null}
      </div>

      <div className={valueClass}>{value}</div>

      {subtitle ? (
        <div className="chris-dashboard-card__subtitle">{subtitle}</div>
      ) : null}

      {typeof progress === "number" ? (
        <div className="chris-progress">
          <div
            className="chris-progress__bar"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}

      {actionLabel && onAction ? (
        <button
          type="button"
          className="chris-dashboard-card__action"
          onClick={onAction}
        >
          {actionLabel}
          <span aria-hidden="true">›</span>
        </button>
      ) : null}
    </article>
  );
}
