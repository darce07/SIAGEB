import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const METRIC_CONFIG = [
  { key: 'inProgress', label: 'En curso', tone: 'success' },
  { key: 'dueSoon', label: 'Por vencer', tone: 'warning' },
  { key: 'overdue', label: 'Vencidos', tone: 'danger' },
  { key: 'drafts', label: 'Borradores', tone: 'info' },
];

export default function InlineOperationalSummary({
  summary,
  collapsible = true,
  defaultCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const metrics = useMemo(
    () =>
      METRIC_CONFIG.map((item) => ({
        ...item,
        value: Number(summary?.[item.key] || 0),
      })),
    [summary],
  );

  const compactLine = useMemo(
    () => metrics.map((item) => `${item.label}: ${item.value}`).join(' | '),
    [metrics],
  );

  return (
    <section className="ds-inline-summary" aria-label="Resumen operativo">
      <div className="ds-inline-summary-head">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="ds-inline-summary-toggle"
            aria-expanded={!collapsed}
          >
            <span>{collapsed ? 'Resumen' : 'Resumen operativo'}</span>
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        ) : (
          <p className="ds-inline-summary-label">Resumen operativo</p>
        )}
        <p className="ds-inline-summary-meta">Periodo actual | Cumplimiento</p>
      </div>

      {collapsed ? (
        <p className="ds-inline-summary-compact">{compactLine}</p>
      ) : (
        <div className="ds-inline-summary-row">
          {metrics.map((item) => (
            <span key={item.key} className="ds-metric-pill" data-tone={item.tone}>
              <span className="ds-metric-value">{item.value}</span>
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}


