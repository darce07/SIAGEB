export default function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? (
        <span className="text-xs uppercase tracking-[0.25em] text-slate-500">{eyebrow}</span>
      ) : null}
      <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      {description ? <p className="text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}
