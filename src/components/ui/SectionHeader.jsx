export default function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? (
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{eyebrow}</span>
      ) : null}
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-slate-100">{title}</h2>
      {description ? <p className="text-[13px] leading-[1.45] text-slate-400">{description}</p> : null}
    </div>
  );
}
