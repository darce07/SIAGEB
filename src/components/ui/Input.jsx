export default function Input({ label, id, error, className = '', ...props }) {
  return (
    <label className="flex flex-col gap-1.5 text-[14px] leading-[1.5] text-slate-200" htmlFor={id}>
      <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <input
        id={id}
        className={`h-9 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-[14px] leading-[1.5] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${className}`}
        {...props}
      />
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </label>
  );
}
