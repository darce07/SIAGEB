export default function SectionHeader({
  eyebrow,
  title,
  description,
  size = 'section',
  titleMaxChars = 70,
  descriptionMaxChars = 110,
}) {
  const titleText = String(title || '').trim();
  const descriptionText = String(description || '').trim();
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
      {titleText ? (
        <TitleTag title={titleText.length > titleMaxChars ? titleText : undefined} className={`${titleClassName} break-words`}>
          {titleText}
        </TitleTag>
      ) : null}
      {descriptionText ? (
        <p
          title={descriptionText.length > descriptionMaxChars ? descriptionText : undefined}
          className="text-body break-words text-slate-400/90"
        >
          {descriptionText}
        </p>
      ) : null}
    </div>
  );
}
