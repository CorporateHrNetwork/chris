export default function ModuleDashboardShell({
  eyebrow,
  title,
  description,
  metrics,
  analytics,
  recentActivity,
  quickActions,
}) {
  return (
    <div className="chris-module-dashboard">
      <header className="chris-module-dashboard__header">
        <div className="chris-module-dashboard__eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>

      {metrics ? <div className="chris-dashboard-grid">{metrics}</div> : null}

      {analytics || recentActivity ? (
        <div className="chris-dashboard-lower-grid">
          {analytics}
          {recentActivity}
        </div>
      ) : null}

      {quickActions ? (
        <section className="chris-quick-actions-section">
          <div className="chris-quick-actions-section__title">QUICK ACTIONS</div>
          <div className="chris-quick-actions-grid">{quickActions}</div>
        </section>
      ) : null}
    </div>
  );
}
