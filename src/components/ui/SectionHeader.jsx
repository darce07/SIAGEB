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
  const titleClassName = size === 'page' ? 'text-h1' : 'text-h2';
  const TitleTag = size === 'page' ? 'h1' : 'h2';

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {eyebrow ? (
        <span
          title={eyebrow}
          className="text-label truncate tracking-[0.18em]"
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
          className="text-body truncate text-slate-400/90"
        >
          {descriptionMeta.text}
        </p>
      ) : null}
    </div>
  );
}
