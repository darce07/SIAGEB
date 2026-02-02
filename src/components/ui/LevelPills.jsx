const colors = {
  1: 'bg-amber-400/80 text-slate-950',
  2: 'bg-sky-400/80 text-slate-950',
  3: 'bg-emerald-400/80 text-slate-950',
  4: 'bg-cyan-400/80 text-slate-950',
  5: 'bg-teal-400/80 text-slate-950',
};

export default function LevelPills({ value, onChange, disabled, levels }) {
  const items = levels && levels.length ? levels : [1, 2, 3];
  return (
    <div className={`flex items-center gap-2 ${disabled ? 'opacity-50' : ''}`}>
      {items.map((_, index) => {
        const level = index + 1;
        return (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          disabled={disabled}
          className={`h-9 w-9 rounded-full text-sm font-semibold transition ${
            value === level ? colors[level] : 'border border-slate-700/60 text-slate-300'
          }`}
        >
          {level}
        </button>
      )})}
    </div>
  );
}
