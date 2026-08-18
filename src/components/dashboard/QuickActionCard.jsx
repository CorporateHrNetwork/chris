export default function QuickActionCard({
  title,
  subtitle,
  icon,
  onClick,
  disabled = false,
}) {
  return (
    <button
      type="button"
      className="chris-quick-action-card"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ opacity: disabled ? 0.55 : 1 }}
    >
      <div className="chris-quick-action-card__icon">{icon}</div>

      <div className="chris-quick-action-card__content">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>

      <div className="chris-quick-action-card__arrow">›</div>
    </button>
  );
}
