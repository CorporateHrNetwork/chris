export default function ModuleDashboardShell({
  eyebrow,
  title,
  description,
  metrics,
  metricsColumns,
  analytics,
  recentActivity,
  quickActions,
}) {
  const metricGridClass = metricsColumns
    ? `chris-dashboard-grid chris-dashboard-grid--columns-${metricsColumns}`
    : "chris-dashboard-grid";

  return (
    <div className="chris-module-dashboard">
      <header className="chris-module-dashboard__header">
        <div className="chris-module-dashboard__eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>

      {metrics ? (
        <>
          {metricsColumns ? (
            <style>{`
              .chris-dashboard-grid--columns-${metricsColumns} {
                grid-template-columns: repeat(${metricsColumns}, minmax(0, 1fr));
              }
              @media (max-width: 1000px) {
                .chris-dashboard-grid--columns-${metricsColumns} {
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                }
              }
              @media (max-width: 680px) {
                .chris-dashboard-grid--columns-${metricsColumns} {
                  grid-template-columns: 1fr;
                }
              }
            `}</style>
          ) : null}
          <div className={metricGridClass}>{metrics}</div>
        </>
      ) : null}

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
