export default function Badge({ label, tone = 'info' }) {
  const toneStyles = {
    info: 'bg-slate-800/80 text-slate-200 border-slate-700/60',
    success: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    warning: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    danger: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
    blue: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        toneStyles[tone]
      }`}
    >
      {label}
    </span>
  );
}
