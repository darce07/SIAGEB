export default function Input({ label, id, error, className = '', ...props }) {
  return (
    <label className="ds-input-label" htmlFor={id}>
      <span className="ds-field-label">{label}</span>
      <input
        id={id}
        className={`ds-input ${className}`}
        {...props}
      />
      {error ? <span className="text-small text-rose-400">{error}</span> : null}
    </label>
  );
}
