export default function Toggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-slate-700/70 bg-slate-900/70 p-1">
      {["SI", "NO"].map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
            value === option
              ? option === 'SI'
                ? 'bg-emerald-500/80 text-slate-950'
                : 'bg-rose-500/80 text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
