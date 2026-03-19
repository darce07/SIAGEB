import { useEffect } from 'react';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';

const toneMap = {
  danger: {
    icon: ShieldAlert,
    container: 'text-rose-100',
    badge: 'ds-badge ds-badge-danger',
    button: 'ds-btn ds-btn-danger',
  },
  warning: {
    icon: AlertTriangle,
    container: 'text-amber-100',
    badge: 'ds-badge ds-badge-warning',
    button: 'ds-btn ds-btn-secondary',
  },
  neutral: {
    icon: Info,
    container: 'text-cyan-100',
    badge: 'ds-badge ds-badge-info',
    button: 'ds-btn ds-btn-secondary',
  },
};

export default function ConfirmModal({
  open,
  title,
  description,
  details,
  tone = 'danger',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  loading = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  const theme = toneMap[tone] || toneMap.danger;
  const Icon = theme.icon;

  return (
    <div
      className="ds-modal-backdrop"
      onClick={onCancel}
    >
      <div
        className={`ds-modal-surface max-w-md p-5 ${theme.container}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={theme.badge}>
              <Icon size={14} />
            </span>
            <p className="text-h3">{title}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ds-btn ds-btn-ghost h-7 w-7 rounded-full p-0 text-slate-300"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
        {description ? <p className="text-body mt-2">{description}</p> : null}
        {details ? (
          typeof details === 'string' ? (
            <p className="text-small mt-1.5">{details}</p>
          ) : (
            <div className="text-small mt-1.5">{details}</div>
          )
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="ds-btn ds-btn-secondary text-xs"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={theme.button}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
