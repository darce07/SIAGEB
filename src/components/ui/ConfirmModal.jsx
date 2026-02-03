import { useEffect } from 'react';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';

const toneMap = {
  danger: {
    icon: ShieldAlert,
    container: 'border-rose-500/35 bg-rose-500/10 text-rose-100',
    button: 'border-rose-500/45 bg-rose-500/20 text-rose-100 hover:border-rose-400/70',
  },
  warning: {
    icon: AlertTriangle,
    container: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
    button: 'border-amber-500/45 bg-amber-500/20 text-amber-100 hover:border-amber-400/70',
  },
  neutral: {
    icon: Info,
    container: 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100',
    button: 'border-cyan-500/45 bg-cyan-500/20 text-cyan-100 hover:border-cyan-400/70',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all duration-200 ${theme.container}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon size={18} />
            <p className="text-lg font-semibold">{title}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-slate-600/60 p-1 text-slate-200 transition hover:border-slate-400/70"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
        {description ? <p className="mt-3 text-sm text-slate-200">{description}</p> : null}
        {details ? (
          typeof details === 'string' ? (
            <p className="mt-2 text-xs text-slate-300/80">{details}</p>
          ) : (
            <div className="mt-2 text-xs text-slate-300/80">{details}</div>
          )
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-700/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-500/80 disabled:opacity-60"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${theme.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
