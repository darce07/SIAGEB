import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Copy,
  FileText,
  ImageOff,
  ImagePlus,
  Lock,
  Pencil,
  Trash2,
} from 'lucide-react';
import Card from '../ui/Card.jsx';

const LOCAL_MONITORING_COVERS = Object.entries(
  import.meta.glob('../../img/monitoreos/*.{png,jpg,jpeg,webp,avif}', {
    eager: true,
    import: 'default',
  }),
)
  .map(([path, url]) => ({
    path,
    url,
    fileName: String(path).split('/').pop()?.toLowerCase() || '',
  }))
  .sort((left, right) => {
    const leftNum = Number.parseInt(left.fileName, 10);
    const rightNum = Number.parseInt(right.fileName, 10);
    if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) {
      return left.fileName.localeCompare(right.fileName);
    }
    return leftNum - rightNum;
  });

const COVER_FOCUS_BY_FILE = {
  '1.jpg': 'center center',
  '2.jpg': 'center 45%',
  '3.jpg': 'center 52%',
  '4.jpg': 'center 45%',
  '5.jpg': 'center 42%',
  '6.jpg': 'center 50%',
  '7.jpg': 'center 45%',
  '8.jpg': 'center 38%',
};

const STATUS_CONFIG_LIGHT = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  closed: 'border-amber-200 bg-amber-50 text-amber-700',
  scheduled: 'border-sky-200 bg-sky-50 text-sky-700',
  draft: 'border-slate-200 bg-slate-100 text-slate-600',
};

const STATUS_CONFIG_DARK = {
  active: 'border-emerald-400/65 bg-emerald-500/35 text-emerald-50',
  closed: 'border-amber-300/70 bg-amber-500/35 text-amber-50',
  scheduled: 'border-sky-300/70 bg-sky-500/35 text-sky-50',
  draft: 'border-slate-300/55 bg-slate-700/80 text-slate-100',
};

const PRIMARY_ACTION_CONFIG_LIGHT = {
  primary:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-cyan-700 bg-cyan-700 px-3 text-sm font-semibold text-white transition hover:bg-cyan-800',
  neutral:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50',
  muted:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-200',
  blocked:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-200 px-3 text-sm font-semibold text-slate-600 transition',
};

const PRIMARY_ACTION_CONFIG_DARK = {
  primary:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/45 bg-cyan-500/20 px-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30',
  neutral:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-600/80 bg-slate-900/70 px-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/80',
  muted:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 text-sm font-semibold text-slate-400 transition hover:bg-slate-800/70',
  blocked:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#5e503f]/80 bg-[#5e503f]/35 px-3 text-sm font-semibold text-slate-200 transition',
};

const FALLBACK_COVERS = [
  'linear-gradient(135deg, #eef5ff 0%, #e6fbff 55%, #f3ecff 100%)',
  'linear-gradient(135deg, #fff7e6 0%, #ffecc2 45%, #ffe7d6 100%)',
  'linear-gradient(135deg, #ebfff3 0%, #d8edff 55%, #ece6ff 100%)',
];

const hashSeed = (value = '') => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getDefaultCover = (seed) => {
  if (LOCAL_MONITORING_COVERS.length) {
    const index = hashSeed(seed) % LOCAL_MONITORING_COVERS.length;
    const selected = LOCAL_MONITORING_COVERS[index];
    return {
      type: 'image',
      value: selected.url,
      objectPosition: COVER_FOCUS_BY_FILE[selected.fileName] || 'center center',
    };
  }
  const gradientIndex = hashSeed(seed) % FALLBACK_COVERS.length;
  return {
    type: 'gradient',
    value: FALLBACK_COVERS[gradientIndex],
    objectPosition: 'center center',
  };
};

function ActionIconButton({ label, icon: Icon, tone = 'default', onClick, isLightTheme }) {
  const toneClass =
    tone === 'danger'
      ? isLightTheme
        ? 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100'
        : 'border-rose-500/35 bg-slate-900/90 text-rose-300 hover:border-rose-400/60 hover:bg-rose-500/15'
      : isLightTheme
        ? 'border-slate-200 bg-white text-slate-500 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700'
        : 'border-slate-700/70 bg-slate-900/70 text-slate-300 hover:border-cyan-400/50 hover:bg-slate-800/80 hover:text-cyan-200';

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-all duration-200 ${toneClass}`}
    >
      <Icon size={12} />
    </button>
  );
}

export default function MonitoreoCard({
  isLightTheme = false,
  templateId = '',
  title,
  description = '',
  status = 'scheduled',
  statusLabel,
  questions = 0,
  deadlineLabel = '',
  deadlineTone = 'neutral',
  primaryActionLabel = 'Programado',
  primaryActionVariant = 'primary',
  primaryActionDisabled = false,
  onPrimaryAction,
  onEdit,
  onDuplicate,
  onDelete,
  onUploadCover,
  onRemoveCover,
  coverImageUrl = '',
  imageLoading = 'lazy',
  imageFetchPriority = 'auto',
}) {
  const statusConfig = isLightTheme ? STATUS_CONFIG_LIGHT : STATUS_CONFIG_DARK;
  const primaryConfig = isLightTheme ? PRIMARY_ACTION_CONFIG_LIGHT : PRIMARY_ACTION_CONFIG_DARK;
  const statusClass = statusConfig[status] || statusConfig.scheduled;
  const primaryActionClass = primaryConfig[primaryActionVariant] || primaryConfig.primary;

  const hasActionBar = Boolean(onEdit || onDuplicate || onDelete);
  const isDraft = status === 'draft';
  const isClosed = status === 'closed';
  const hasCustomCover = Boolean(String(coverImageUrl || '').trim());
  const fallbackCover = getDefaultCover(`${templateId}-${title}`);
  const coverLabel = isDraft ? 'Borrador' : statusLabel;

  const deadlineToneClass =
    deadlineTone === 'danger'
      ? isLightTheme
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-rose-500/35 bg-rose-500/15 text-rose-200'
      : deadlineTone === 'warning'
        ? isLightTheme
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-amber-500/35 bg-amber-500/15 text-amber-200'
        : isLightTheme
          ? 'border-slate-200 bg-slate-50 text-slate-600'
          : 'border-slate-700/70 bg-slate-800/70 text-slate-300';

  return (
    <Card
      className={`group h-full p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        isDraft
          ? isLightTheme
            ? 'border border-dashed border-slate-300 bg-slate-50'
            : 'border border-dashed border-slate-700/70 bg-slate-900/60'
          : isLightTheme
            ? 'border border-slate-200 bg-white'
            : 'border border-slate-700/70 bg-slate-900/55'
      }`}
    >
      <article className="flex h-full min-h-[218px] flex-col overflow-hidden rounded-xl">
        <header
          className={`relative h-24 ${isDraft ? 'grayscale-[0.85]' : ''}`}
          style={{
            backgroundImage: hasCustomCover
              ? undefined
              : fallbackCover.type === 'gradient'
                ? fallbackCover.value
                : `url("${fallbackCover.value}")`,
          }}
        >
          {hasCustomCover || fallbackCover.type === 'image' ? (
            <img
              src={hasCustomCover ? coverImageUrl : fallbackCover.value}
              alt={`Portada de ${title}`}
              className="h-full w-full object-cover"
              style={{
                filter: isLightTheme
                  ? 'brightness(1.04) saturate(1.08) contrast(1.02)'
                  : 'brightness(1.05) saturate(1.15) contrast(1.04) blur(0.6px)',
                transform: isLightTheme ? 'scale(1.01)' : 'scale(1.015)',
                objectPosition: hasCustomCover ? 'center center' : fallbackCover.objectPosition,
              }}
              loading={imageLoading}
              fetchPriority={imageFetchPriority}
              decoding="async"
            />
          ) : null}

          <div
            className={`pointer-events-none absolute inset-0 ${
              isLightTheme
                ? 'bg-gradient-to-t from-slate-900/12 via-white/8 to-transparent'
                : 'bg-gradient-to-t from-slate-950/45 via-slate-900/20 to-transparent'
            }`}
          />
          {!isLightTheme ? (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-300/15 via-transparent to-indigo-300/12" />
          ) : null}

          {onUploadCover || (onRemoveCover && hasCustomCover) ? (
            <div className="absolute left-3 top-3 flex items-center gap-1.5">
              {!hasCustomCover && onUploadCover ? (
                <ActionIconButton
                  label="Subir portada"
                  icon={ImagePlus}
                  onClick={onUploadCover}
                  isLightTheme={isLightTheme}
                />
              ) : null}
              {hasCustomCover && onRemoveCover ? (
                <ActionIconButton
                  label="Quitar portada"
                  icon={ImageOff}
                  tone="danger"
                  onClick={onRemoveCover}
                  isLightTheme={isLightTheme}
                />
              ) : null}
            </div>
          ) : null}

          <div className="absolute right-3 top-3">
            <span
              className={`text-small inline-flex shrink-0 rounded-full border px-2.5 py-0.5 font-semibold shadow-sm ${
                isLightTheme ? '' : 'backdrop-blur-sm'
              } ${statusClass} ${isDraft && isLightTheme ? 'bg-white/90' : ''}`}
            >
              {coverLabel}
            </span>
          </div>

          {isDraft ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${
                  isLightTheme
                    ? 'border-slate-200 bg-white/90 text-slate-600'
                    : 'border-slate-600/80 bg-slate-900/85 text-slate-200'
                }`}
              >
                Borrador
              </span>
            </div>
          ) : null}
        </header>

        <section className="flex flex-1 flex-col p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3
                title={title}
                className={`text-[0.92rem] font-semibold leading-[1.15rem] ${
                  isDraft
                    ? isLightTheme
                      ? 'text-slate-500'
                      : 'text-slate-400'
                    : isLightTheme
                      ? 'text-slate-900'
                      : 'text-slate-100'
                }`}
                style={{
                  display: '-webkit-box',
                    WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {title}
              </h3>

              {description ? (
                <p
                  className={`text-[11px] ${
                    isDraft
                      ? isLightTheme
                        ? 'text-slate-400'
                        : 'text-slate-500'
                      : isLightTheme
                        ? 'text-slate-500'
                        : 'text-slate-400'
                  }`}
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {description}
                </p>
              ) : null}
            </div>

            {hasActionBar ? (
              <section className="flex items-center gap-1">
                {onEdit ? (
                  <ActionIconButton
                    label="Editar monitoreo"
                    icon={Pencil}
                    onClick={onEdit}
                    isLightTheme={isLightTheme}
                  />
                ) : null}
                {onDuplicate ? (
                  <ActionIconButton
                    label="Duplicar monitoreo"
                    icon={Copy}
                    onClick={onDuplicate}
                    isLightTheme={isLightTheme}
                  />
                ) : null}
                {onDelete ? (
                  <ActionIconButton
                    label="Eliminar monitoreo"
                    icon={Trash2}
                    tone="danger"
                    onClick={onDelete}
                    isLightTheme={isLightTheme}
                  />
                ) : null}
              </section>
            ) : null}
          </div>

          <section className="mt-1.5 flex flex-wrap gap-1">
            <span
              className={`text-small inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                isLightTheme
                  ? 'border-slate-200 bg-slate-50 text-slate-600'
                  : 'border-slate-700/70 bg-slate-800/70 text-slate-300'
              }`}
            >
              <FileText size={12} />
              {questions} {questions === 1 ? 'pregunta' : 'preguntas'}
            </span>

            {deadlineLabel ? (
              <span
                className={`text-small inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${deadlineToneClass}`}
              >
                <CalendarClock size={12} />
                {deadlineLabel}
              </span>
            ) : null}
          </section>

          {isDraft ? (
            <p
              className={`mt-2.5 inline-flex items-center gap-2 text-xs italic ${
                isLightTheme ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              <AlertCircle size={13} />
              Faltan definir instituciones o preguntas para este borrador.
            </p>
          ) : null}

          <footer className="mt-auto pt-2">
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={primaryActionDisabled}
              title={isClosed ? 'Monitoreo vencido: ya no permite registrar fichas.' : undefined}
              aria-disabled={primaryActionDisabled}
              className={`w-full ${primaryActionClass} ${
                primaryActionDisabled ? 'cursor-not-allowed opacity-90' : ''
              }`}
            >
              {primaryActionLabel}
              {isClosed ? (
                <Lock size={13} />
              ) : (
                <ArrowRight
                  size={13}
                  className={primaryActionDisabled ? '' : 'transition-transform group-hover:translate-x-0.5'}
                />
              )}
            </button>
          </footer>
        </section>
      </article>
    </Card>
  );
}
