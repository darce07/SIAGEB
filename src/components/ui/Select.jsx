export default function Select({ label, id, error, className = '', children, ...props }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-slate-200" htmlFor={id}>
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <select
        id={id}
        className={`w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${className}`}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </label>
  );
}
