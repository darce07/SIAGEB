const truncateWithMeta = (value, maxChars) => {
  const source = String(value || '').trim();
  if (!source) return { text: '', isTruncated: false };
  if (source.length <= maxChars) return { text: source, isTruncated: false };
  return { text: `${source.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`, isTruncated: true };
};

export default function SectionHeader({
  eyebrow,
  title,
  description,
  size = 'section',
  titleMaxChars = 70,
  descriptionMaxChars = 110,
}) {
  const titleMeta = truncateWithMeta(title, titleMaxChars);
  const descriptionMeta = truncateWithMeta(description, descriptionMaxChars);
  const titleClassName =
    size === 'page'
      ? 'text-[1.9rem] font-semibold leading-tight tracking-[-0.01em] text-slate-100 md:text-[2.15rem]'
      : 'text-lg font-semibold leading-tight tracking-[-0.01em] text-slate-100 md:text-[1.3rem]';
  const TitleTag = size === 'page' ? 'h1' : 'h2';

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {eyebrow ? (
        <span
          title={eyebrow}
          className="truncate text-[10px] uppercase tracking-[0.2em] text-slate-500"
        >
          {eyebrow}
        </span>
      ) : null}
      {titleMeta.text ? (
        <TitleTag title={titleMeta.isTruncated ? String(title || '') : undefined} className={`${titleClassName} truncate`}>
          {titleMeta.text}
        </TitleTag>
      ) : null}
      {descriptionMeta.text ? (
        <p
          title={descriptionMeta.isTruncated ? String(description || '') : undefined}
          className="truncate text-sm leading-5 text-slate-400/85"
        >
          {descriptionMeta.text}
        </p>
      ) : null}
    </div>
  );
}
