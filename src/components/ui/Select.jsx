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
    ? 'flex flex-col gap-1 text-[13px] leading-[1.45] text-slate-200'
    : 'flex flex-col gap-1.5 text-[14px] leading-[1.5] text-slate-200';
  const labelTextClass = compact
    ? 'text-[10px] uppercase tracking-[0.12em] text-slate-400'
    : 'text-[10px] uppercase tracking-[0.16em] text-slate-400';
  const selectClass = compact
    ? 'h-9 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-[13px] leading-[1.45] text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30'
    : 'h-9 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-[14px] leading-[1.5] text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30';

  return (
    <label className={labelClass} htmlFor={id}>
      {hideLabel ? <span className="sr-only">{label}</span> : <span className={labelTextClass}>{label}</span>}
      <select id={id} className={`${selectClass} ${className}`} {...props}>
        {children}
      </select>
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </label>
  );
}
