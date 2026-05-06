export default function Panel({ title, value, subtitle, icon }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {icon && <span className="panel-icon">{icon}</span>}
      </div>

      <div className="panel-value">
        {value ?? 0}
      </div>

      {subtitle && (
        <div className="panel-subtitle">
          {subtitle}
        </div>
      )}
    </div>
  );
}
