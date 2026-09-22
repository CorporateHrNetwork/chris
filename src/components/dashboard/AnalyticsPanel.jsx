export default function AnalyticsPanel({
  title,
  subtitle,
  icon,
  actionLabel,
  onAction,
  children,
}) {
  return (
    <section className="chris-analytics-panel">
      <div className="chris-analytics-panel__header">
        <div className="chris-analytics-panel__heading">
          {icon ? <div className="chris-analytics-panel__icon">{icon}</div> : null}

          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
            <div className="chris-dashboard-card__accent" />
          </div>
        </div>

        {actionLabel && onAction ? (
          <button
            type="button"
            className="chris-panel-action"
            onClick={onAction}
          >
            {actionLabel}
            <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </div>

      <div className="chris-analytics-panel__body">{children}</div>
    </section>
  );
}
