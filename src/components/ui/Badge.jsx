export default function Badge({ label, tone = 'info' }) {
  const toneStyles = {
    info: 'ds-badge-info',
    success: 'ds-badge-success',
    warning: 'ds-badge-warning',
    danger: 'ds-badge-danger',
    blue: 'ds-badge-info',
    neutral: 'ds-badge-neutral',
  };

  return (
    <span className={`ds-badge ${toneStyles[tone] || toneStyles.info}`}>
      {label}
    </span>
  );
}
