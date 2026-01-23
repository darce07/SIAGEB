export default function Textarea({ label, id, error, className = '', ...props }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-slate-200" htmlFor={id}>
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <textarea
        id={id}
        className={`min-h-[110px] w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${className}`}
        {...props}
      />
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </label>
  );
}
