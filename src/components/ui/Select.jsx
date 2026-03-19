export default function Select({
  label,
  id,
  error,
  className = '',
  children,
  compact = false,
  hideLabel = false,
  ...props
}) {
  const labelClass = compact
    ? 'ds-input-label-compact'
    : 'ds-input-label';
  const labelTextClass = compact
    ? 'ds-field-label-compact'
    : 'ds-field-label';
  const selectClass = compact
    ? 'ds-select ds-select-compact'
    : 'ds-select';

  return (
    <label className={labelClass} htmlFor={id}>
      {hideLabel ? <span className="sr-only">{label}</span> : <span className={labelTextClass}>{label}</span>}
      <select id={id} className={`${selectClass} ${className}`} {...props}>
        {children}
      </select>
      {error ? <span className="text-small text-rose-400">{error}</span> : null}
    </label>
  );
}
