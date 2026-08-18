export default function RecentActivityList({
  items = [],
}) {
  if (!items.length) {
    return <div className="chris-empty-state">No recent activity yet.</div>;
  }

  return (
    <div className="chris-activity-list">
      {items.map((item) => (
        <div className="chris-activity-item" key={item.id}>
          <div className="chris-activity-item__icon">{item.icon}</div>

          <div className="chris-activity-item__content">
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </div>

          <div
            className={[
              "chris-activity-item__time",
              item.tone === "warning"
                ? "chris-activity-item__time--warning"
                : "",
              item.tone === "danger"
                ? "chris-activity-item__time--danger"
                : "",
            ].join(" ")}
          >
            {item.time}
          </div>
        </div>
      ))}
    </div>
  );
}
