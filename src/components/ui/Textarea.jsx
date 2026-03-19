export default function Textarea({ label, id, error, className = '', ...props }) {
  return (
    <label className="ds-input-label" htmlFor={id}>
      <span className="ds-field-label tracking-[0.16em]">{label}</span>
      <textarea
        id={id}
        className={`ds-textarea min-h-[108px] ${className}`}
        {...props}
      />
      {error ? <span className="text-small text-rose-400">{error}</span> : null}
    </label>
  );
}
