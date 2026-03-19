import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Copy,
  FileText,
  ListChecks,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react';
import Card from '../ui/Card.jsx';

const STATUS_CONFIG = {
  active: {
    className: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100',
  },
  closed: {
    className: 'border-amber-400/60 bg-amber-500/15 text-amber-100',
  },
  scheduled: {
    className: 'border-slate-600/70 bg-slate-900/70 text-slate-200',
  },
  draft: {
    className: 'border-slate-600/70 bg-slate-900/70 text-slate-300',
  },
};

const PRIMARY_ACTION_CONFIG = {
  primary: 'ds-btn ds-btn-primary',
  neutral: 'ds-btn ds-btn-secondary',
  muted: 'ds-btn ds-btn-ghost',
};

function ActionIconButton({ label, icon: Icon, tone = 'default', onClick }) {
  const toneClass =
    tone === 'danger'
      ? 'border-rose-500/30 bg-rose-500/8 text-rose-200/90 hover:border-rose-400/65 hover:bg-rose-500/15'
      : 'border-slate-700/70 bg-slate-900/40 text-slate-300 hover:border-cyan-400/40 hover:bg-slate-800/70 hover:text-cyan-100';

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-200 ${toneClass}`}
    >
      <Icon size={12} />
    </button>
  );
}

export default function MonitoreoCard({
  title,
  status = 'scheduled',
  statusLabel,
  sections = 0,
  questions = 0,
  updatedAtLabel = '',
  deadlineLabel = '',
  note = '',
  primaryActionLabel = 'Programado',
  primaryActionVariant = 'primary',
  primaryActionDisabled = false,
  onPrimaryAction,
  onEdit,
  onDuplicate,
  onShare,
  shareLabel = 'Compartir',
  onDelete,
}) {
  const statusClass = STATUS_CONFIG[status]?.className || STATUS_CONFIG.scheduled.className;
  const primaryActionClass =
    PRIMARY_ACTION_CONFIG[primaryActionVariant] || PRIMARY_ACTION_CONFIG.primary;
  const hasActionBar = Boolean(onEdit || onDuplicate || onShare || onDelete);

  return (
    <Card className="group h-full border border-slate-800/80 bg-slate-950/55 p-3 shadow-[0_0_0_1px_rgba(148,163,184,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/45 hover:bg-slate-950/70 hover:shadow-[0_14px_30px_rgba(8,47,73,0.35)]">
      <article className="flex h-full min-h-[176px] flex-col">
        <header className="flex items-start justify-between gap-3">
          <h3
            title={title}
            className="text-h3"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </h3>
          <span
            className={`text-small shrink-0 rounded-full border px-2.5 py-0.5 font-semibold ${statusClass}`}
          >
            {statusLabel}
          </span>
        </header>

        <section className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-small inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-slate-300">
            <ListChecks size={12} />
            {sections} {sections === 1 ? 'seccion' : 'secciones'}
          </span>
          <span className="text-small inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-slate-300">
            <FileText size={12} />
            {questions} {questions === 1 ? 'pregunta' : 'preguntas'}
          </span>
          {updatedAtLabel ? (
            <span className="text-small inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-slate-300">
              <CalendarClock size={12} />
              Act. {updatedAtLabel}
            </span>
          ) : null}
          {deadlineLabel && !updatedAtLabel ? (
            <span className="text-small inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-slate-300">
              <CalendarDays size={12} />
              Vence {deadlineLabel}
            </span>
          ) : null}
          {note ? (
            <span className="text-small inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">
              {note}
            </span>
          ) : null}
        </section>

        {hasActionBar ? (
          <section className="mt-2 flex items-center gap-1.5 opacity-70 transition-opacity duration-200 group-hover:opacity-100">
            {onEdit ? (
              <ActionIconButton label="Editar monitoreo" icon={Pencil} onClick={onEdit} />
            ) : null}
            {onDuplicate ? (
              <ActionIconButton label="Duplicar monitoreo" icon={Copy} onClick={onDuplicate} />
            ) : null}
            {onShare ? (
              <ActionIconButton label={shareLabel} icon={Share2} onClick={onShare} />
            ) : null}
            {onDelete ? (
              <ActionIconButton
                label="Eliminar monitoreo"
                icon={Trash2}
                tone="danger"
                onClick={onDelete}
              />
            ) : null}
          </section>
        ) : null}

        <footer className="mt-auto pt-2.5">
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
            className={`h-9 w-full ${primaryActionClass} ${
              primaryActionDisabled ? 'cursor-not-allowed opacity-90' : ''
            }`}
          >
            {primaryActionLabel}
            <ArrowRight
              size={13}
              className={primaryActionDisabled ? '' : 'transition-transform group-hover:translate-x-0.5'}
            />
          </button>
        </footer>
      </article>
    </Card>
  );
}
