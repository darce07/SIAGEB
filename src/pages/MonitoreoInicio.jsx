import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileClock,
  MoveRight,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import { supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';
const ALERT_WINDOW_DAYS = 7;
const AGENDA_ITEMS_LIMIT = 6;
const ACTIVITY_ITEMS_LIMIT = 6;
const STALE_REPORT_DAYS = 10;

const toSafeDate = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const isRangeOverlapping = (start, end, from, to) => {
  if (!start || !end || !from || !to) return false;
  return start <= to && end >= from;
};

const formatDateShort = (value) => {
  const date = toSafeDate(value);
  if (!date) return 'No registrado';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

const formatDateTimeShort = (value) => {
  const date = toSafeDate(value);
  if (!date) return 'No registrado';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const truncateLabel = (value, maxChars = 70) => {
  const source = String(value || '').trim();
  if (!source) return '';
  if (source.length <= maxChars) return source;
  return `${source.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
};

const getTemplateStatus = (template) => {
  const availability = template?.availability || {};
  const status = availability.status || 'scheduled';
  const startAt = toSafeDate(availability.startAt);
  const endAt = toSafeDate(availability.endAt);
  const now = new Date();

  if (status === 'hidden') return 'hidden';
  if (status === 'closed') return 'closed';
  if (startAt && now < startAt) return 'scheduled';
  if (endAt && now > endAt) return 'closed';
  if (status === 'active') return 'active';
  return startAt || endAt ? 'scheduled' : 'active';
};

const eventTypeLabel = (type) => (String(type || '').toLowerCase() === 'activity' ? 'Actividad' : 'Monitoreo');

const formatAgendaRange = (startAt, endAt) => {
  const startLabel = formatDateShort(startAt);
  const endLabel = formatDateShort(endAt);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

const normalizeTemplateEventStatus = (template) => {
  const status = getTemplateStatus(template);
  if (status === 'hidden') return 'hidden';
  if (status === 'closed') return 'closed';
  return 'active';
};

const pluralize = (count, singular, plural) => (count === 1 ? singular : plural);

const toneClassByAlert = {
  critical: 'border-rose-500/40 bg-rose-500/10 text-rose-100',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  info: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100',
};

const iconByAlert = {
  critical: AlertTriangle,
  warning: Clock3,
  info: ClipboardList,
};

export default function MonitoreoInicio() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY));
    } catch {
      return null;
    }
  }, []);

  const isAdmin = auth?.role === 'admin';
  const userId = auth?.email || auth?.docNumber || '';

  const [templates, setTemplates] = useState([]);
  const [instances, setInstances] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showDenied, setShowDenied] = useState(Boolean(location.state?.denied));

  useEffect(() => {
    if (!location.state?.denied) return;
    const timeoutId = setTimeout(() => setShowDenied(false), 3200);
    navigate('/monitoreo/inicio', { replace: true, state: null });
    return () => clearTimeout(timeoutId);
  }, [location.state, navigate]);

  useEffect(() => {
    let active = true;

    const loadDashboardData = async () => {
      setLoading(true);
      setLoadError('');

      const templatesPromise = supabase
        .from('monitoring_templates')
        .select('id,title,description,status,availability,created_at,updated_at')
        .order('updated_at', { ascending: false });

      const instancesBaseQuery = supabase
        .from('monitoring_instances')
        .select('id,template_id,status,created_by,data,created_at,updated_at')
        .order('updated_at', { ascending: false });
      const instancesPromise = isAdmin
        ? instancesBaseQuery
        : instancesBaseQuery.eq('created_by', userId);

      const eventsPromise = supabase
        .from('monitoring_events')
        .select('id,title,event_type,start_at,end_at,status,created_by,created_at,updated_at,monitoring_event_responsibles(id)')
        .order('start_at', { ascending: true });

      const [templatesResult, instancesResult, eventsResult] = await Promise.all([
        templatesPromise,
        instancesPromise,
        eventsPromise,
      ]);

      const errors = [];
      if (templatesResult.error) errors.push(`Monitoreos: ${templatesResult.error.message}`);
      if (instancesResult.error) errors.push(`Reportes: ${instancesResult.error.message}`);
      if (eventsResult.error) errors.push(`Seguimiento: ${eventsResult.error.message}`);

      if (!active) return;

      if (errors.length) {
        setLoadError(`No se pudo completar el resumen (${errors.join(' | ')}).`);
      }

      setTemplates(templatesResult.data || []);
      setInstances(instancesResult.data || []);
      setEvents(eventsResult.data || []);
      setLoading(false);
    };

    loadDashboardData();
    return () => {
      active = false;
    };
  }, [isAdmin, userId]);

  const publishedTemplates = useMemo(
    () => templates.filter((template) => template.status === 'published'),
    [templates],
  );

  const activeTemplates = useMemo(
    () => publishedTemplates.filter((template) => getTemplateStatus(template) === 'active'),
    [publishedTemplates],
  );

  const expiringSoonTemplates = useMemo(() => {
    const today = new Date();
    const limit = addDays(today, ALERT_WINDOW_DAYS);
    return publishedTemplates
      .filter((template) => {
        if (getTemplateStatus(template) !== 'active') return false;
        const endAt = toSafeDate(template?.availability?.endAt);
        return endAt && endAt >= today && endAt <= limit;
      })
      .sort((left, right) => {
        const leftEnd = toSafeDate(left?.availability?.endAt)?.getTime() || 0;
        const rightEnd = toSafeDate(right?.availability?.endAt)?.getTime() || 0;
        return leftEnd - rightEnd;
      });
  }, [publishedTemplates]);

  const draftTemplatesCount = useMemo(() => {
    if (!isAdmin) return 0;
    return templates.filter((template) => template.status !== 'published').length;
  }, [isAdmin, templates]);

  const eventsWithoutResponsible = useMemo(() => {
    if (!isAdmin) return [];
    return events.filter(
      (event) =>
        event.event_type === 'monitoring' &&
        event.status !== 'closed' &&
        (event.monitoring_event_responsibles?.length || 0) === 0,
    );
  }, [events, isAdmin]);

  const staleInProgressReports = useMemo(() => {
    const today = new Date();
    return instances.filter((instance) => {
      if (instance.status !== 'in_progress') return false;
      const updatedAt = toSafeDate(instance.updated_at || instance.created_at);
      if (!updatedAt) return false;
      const staleLimit = addDays(updatedAt, STALE_REPORT_DAYS);
      return staleLimit < today;
    });
  }, [instances]);

  const alerts = useMemo(() => {
    const items = [];

    if (expiringSoonTemplates.length) {
      const soonest = expiringSoonTemplates[0];
      items.push({
        id: 'expiring',
        tone: 'warning',
        title: `${expiringSoonTemplates.length} ${pluralize(
          expiringSoonTemplates.length,
          'monitoreo vence',
          'monitoreos vencen',
        )} en ${ALERT_WINDOW_DAYS} días`,
        description: `Próximo: ${truncateLabel(soonest.title, 56)} (${formatDateShort(
          soonest?.availability?.endAt,
        )}).`,
        actionLabel: 'Ver reportes',
        actionPath: '/monitoreo/reportes',
      });
    }

    if (draftTemplatesCount > 0) {
      items.push({
        id: 'drafts',
        tone: 'info',
        title: `${draftTemplatesCount} ${pluralize(draftTemplatesCount, 'borrador pendiente', 'borradores pendientes')}`,
        description: 'Revisa y publica los borradores para que sean visibles.',
        actionLabel: 'Ir a monitoreos',
        actionPath: '/monitoreo',
      });
    }

    if (eventsWithoutResponsible.length > 0) {
      items.push({
        id: 'responsibles',
        tone: 'critical',
        title: `${eventsWithoutResponsible.length} ${pluralize(
          eventsWithoutResponsible.length,
          'evento sin responsable',
          'eventos sin responsable',
        )}`,
        description: 'Asigna especialistas para evitar seguimientos incompletos.',
        actionLabel: 'Ir a seguimiento',
        actionPath: '/monitoreo/seguimiento',
      });
    }

    if (staleInProgressReports.length > 0) {
      items.push({
        id: 'stale-reports',
        tone: 'warning',
        title: `${staleInProgressReports.length} ${pluralize(
          staleInProgressReports.length,
          'reporte lleva tiempo sin actualizarse',
          'reportes llevan tiempo sin actualizarse',
        )}`,
        description: `Sin actualización en los últimos ${STALE_REPORT_DAYS} días.`,
        actionLabel: 'Revisar reportes',
        actionPath: '/monitoreo/reportes',
      });
    }

    return items;
  }, [
    draftTemplatesCount,
    eventsWithoutResponsible.length,
    expiringSoonTemplates,
    staleInProgressReports.length,
  ]);

  const agendaEvents = useMemo(() => {
    const templateEventsById = new Map(events.map((event) => [event.id, event]));
    const syntheticTemplateEvents = publishedTemplates
      .filter((template) => {
        const startAt = toSafeDate(template?.availability?.startAt);
        const endAt = toSafeDate(template?.availability?.endAt);
        return startAt && endAt && !templateEventsById.has(template.id);
      })
      .map((template) => ({
        id: template.id,
        title: template.title,
        event_type: 'monitoring',
        status: normalizeTemplateEventStatus(template),
        start_at: template.availability.startAt,
        end_at: template.availability.endAt,
        created_at: template.created_at,
        updated_at: template.updated_at,
        monitoring_event_responsibles: [],
      }));

    return [...events, ...syntheticTemplateEvents];
  }, [events, publishedTemplates]);

  const upcomingAgenda = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const weekLimit = addDays(startOfToday, ALERT_WINDOW_DAYS);

    return agendaEvents
      .filter((event) => {
        if (!isAdmin && event.status === 'hidden') return false;
        const startAt = toSafeDate(event.start_at);
        const endAt = toSafeDate(event.end_at);
        return isRangeOverlapping(startAt, endAt, startOfToday, weekLimit);
      })
      .sort((left, right) => {
        const leftStart = toSafeDate(left.start_at)?.getTime() || 0;
        const rightStart = toSafeDate(right.start_at)?.getTime() || 0;
        return leftStart - rightStart;
      })
      .slice(0, AGENDA_ITEMS_LIMIT);
  }, [agendaEvents, isAdmin]);

  const nextSteps = useMemo(() => {
    const steps = [];

    if (isAdmin) {
      if (draftTemplatesCount > 0) {
        steps.push({
          id: 'step-drafts',
          title: `Publicar ${draftTemplatesCount} ${pluralize(draftTemplatesCount, 'borrador', 'borradores')}`,
          detail: 'Valida título, fecha y estado antes de publicar.',
          path: '/monitoreo',
          cta: 'Revisar',
        });
      }
      if (eventsWithoutResponsible.length > 0) {
        steps.push({
          id: 'step-responsibles',
          title: 'Asignar responsables pendientes',
          detail: `${eventsWithoutResponsible.length} ${pluralize(
            eventsWithoutResponsible.length,
            'evento requiere responsable',
            'eventos requieren responsable',
          )}.`,
          path: '/monitoreo/seguimiento',
          cta: 'Asignar',
        });
      }
      if (expiringSoonTemplates.length > 0) {
        steps.push({
          id: 'step-expiring',
          title: 'Revisar monitoreos por vencer',
          detail: `Próximo vencimiento: ${formatDateShort(expiringSoonTemplates[0]?.availability?.endAt)}.`,
          path: '/monitoreo/reportes',
          cta: 'Revisar',
        });
      }
      if (staleInProgressReports.length > 0) {
        steps.push({
          id: 'step-reports',
          title: 'Actualizar reportes en progreso',
          detail: `${staleInProgressReports.length} ${pluralize(
            staleInProgressReports.length,
            'reporte necesita seguimiento',
            'reportes necesitan seguimiento',
          )}.`,
          path: '/monitoreo/reportes',
          cta: 'Ir',
        });
      }
    } else {
      const inProgress = instances.filter((item) => item.status === 'in_progress').length;
      if (inProgress > 0) {
        steps.push({
          id: 'step-continue',
          title: `Continuar ${inProgress} ${pluralize(inProgress, 'formulario', 'formularios')} en progreso`,
          detail: 'Completa y registra tus observaciones pendientes.',
          path: '/monitoreo/reportes',
          cta: 'Continuar',
        });
      }
      if (upcomingAgenda.length > 0) {
        steps.push({
          id: 'step-agenda',
          title: 'Revisar agenda de la semana',
          detail: `${upcomingAgenda.length} ${pluralize(
            upcomingAgenda.length,
            'actividad programada',
            'actividades programadas',
          )}.`,
          path: '/monitoreo/seguimiento',
          cta: 'Ver agenda',
        });
      }
      if (activeTemplates.length > 0) {
        steps.push({
          id: 'step-active',
          title: 'Iniciar un monitoreo activo',
          detail: `${activeTemplates.length} ${pluralize(activeTemplates.length, 'monitoreo disponible', 'monitoreos disponibles')}.`,
          path: '/monitoreo',
          cta: 'Ir',
        });
      }
    }

    if (!steps.length) {
      steps.push({
        id: 'step-default',
        title: 'No tienes pendientes críticos',
        detail: 'Puedes revisar reportes o planificar nuevos monitoreos.',
        path: '/monitoreo/reportes',
        cta: 'Abrir reportes',
      });
    }

    return steps.slice(0, 4);
  }, [
    activeTemplates.length,
    draftTemplatesCount,
    eventsWithoutResponsible.length,
    expiringSoonTemplates,
    instances,
    isAdmin,
    staleInProgressReports.length,
    upcomingAgenda.length,
  ]);

  const recentActivity = useMemo(() => {
    const templateActivity = templates.map((template) => ({
      id: `template-${template.id}`,
      when: template.updated_at || template.created_at,
      title: template.status === 'published' ? 'Monitoreo publicado' : 'Monitoreo actualizado',
      detail: truncateLabel(template.title || 'Monitoreo sin título', 72),
      path: '/monitoreo',
    }));

    const eventsActivity = events.map((event) => ({
      id: `event-${event.id}`,
      when: event.updated_at || event.created_at,
      title: event.event_type === 'activity' ? 'Actividad actualizada' : 'Seguimiento actualizado',
      detail: truncateLabel(event.title || 'Evento sin título', 72),
      path: '/monitoreo/seguimiento',
    }));

    const reportActivity = instances.map((instance) => ({
      id: `instance-${instance.id}`,
      when: instance.updated_at || instance.created_at,
      title: instance.status === 'completed' ? 'Reporte completado' : 'Reporte en progreso',
      detail: truncateLabel(instance?.data?.header?.docente || 'Formulario de monitoreo', 72),
      path: '/monitoreo/reportes',
    }));

    return [...templateActivity, ...eventsActivity, ...reportActivity]
      .filter((item) => Boolean(toSafeDate(item.when)))
      .sort((left, right) => {
        const leftTime = toSafeDate(left.when)?.getTime() || 0;
        const rightTime = toSafeDate(right.when)?.getTime() || 0;
        return rightTime - leftTime;
      })
      .slice(0, ACTIVITY_ITEMS_LIMIT);
  }, [events, instances, templates]);

  const reportCount = instances.length;
  const hasAlerts = alerts.length > 0;
  const healthText = hasAlerts ? 'Con alertas' : 'Listo';
  const healthHint = hasAlerts
    ? `${alerts.length} ${pluralize(alerts.length, 'alerta detectada', 'alertas detectadas')}`
    : 'Sin alertas';

  return (
    <div className="flex flex-col gap-6">
      {showDenied ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No tienes permisos para acceder.
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </div>
      ) : null}

      <Card className="flex flex-col gap-5">
        <SectionHeader
          eyebrow="Inicio"
          title="Inicio"
          description="Resumen operativo y accesos rápidos"
          size="page"
        />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-3.5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Monitoreos</p>
            <p className="mt-2 text-3xl font-semibold leading-none text-slate-100">{activeTemplates.length}</p>
            <p
              title={isAdmin ? 'Plantillas activas para especialistas' : 'Monitoreos activos para ti'}
              className="mt-2 truncate text-xs text-slate-500/90"
            >
              {isAdmin ? 'Activos para especialistas' : 'Activos para ti'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-3.5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Reportes</p>
            <p className="mt-2 text-3xl font-semibold leading-none text-slate-100">{reportCount}</p>
            <p
              title={isAdmin ? 'Formularios totales del sistema' : 'Formularios creados por ti'}
              className="mt-2 truncate text-xs text-slate-500/90"
            >
              {isAdmin ? 'Totales del sistema' : 'Generados por ti'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-3.5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Estado</p>
            <p className="mt-2 text-3xl font-semibold leading-none text-slate-100">{healthText}</p>
            <p className="mt-2 truncate text-xs text-slate-500/90">{healthHint}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Alertas"
            title="Alertas prioritarias"
            description="Elementos que requieren atención inmediata"
          />
          {loading ? (
            <p className="text-sm text-slate-400">Cargando alertas...</p>
          ) : alerts.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Todo en orden. No hay alertas prioritarias.
            </div>
          ) : (
            <div className="space-y-2.5">
              {alerts.map((alert) => {
                const Icon = iconByAlert[alert.tone] || AlertTriangle;
                return (
                  <article
                    key={alert.id}
                    className={`rounded-xl border px-3 py-2.5 ${toneClassByAlert[alert.tone] || toneClassByAlert.info}`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon size={16} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{alert.title}</p>
                        <p className="mt-1 text-xs text-slate-200/90">{alert.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(alert.actionPath)}
                      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-600/60 bg-slate-900/35 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-400/70"
                    >
                      {alert.actionLabel}
                      <MoveRight size={13} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Agenda"
            title="Próximos 7 días"
            description="Eventos y monitoreos programados"
          />
          {loading ? (
            <p className="text-sm text-slate-400">Cargando agenda...</p>
          ) : upcomingAgenda.length === 0 ? (
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400">
              No hay actividades programadas para la próxima semana.
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingAgenda.map((event) => (
                <article
                  key={event.id}
                  className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p title={event.title} className="truncate text-sm font-semibold text-slate-100">
                      {truncateLabel(event.title, 72)}
                    </p>
                    <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-100">
                      {eventTypeLabel(event.event_type)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatAgendaRange(event.start_at, event.end_at)}
                  </p>
                </article>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate('/monitoreo/seguimiento')}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-100"
          >
            Ir a seguimiento
            <MoveRight size={13} />
          </button>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Sugerencias"
            title="Próximos pasos"
            description="Acciones recomendadas para hoy"
          />
          {loading ? (
            <p className="text-sm text-slate-400">Cargando pendientes...</p>
          ) : (
            <div className="space-y-2.5">
              {nextSteps.map((step) => (
                <article
                  key={step.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-100">{step.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{step.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(step.path)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60 hover:text-cyan-100"
                  >
                    {step.cta}
                    <MoveRight size={13} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Actividad"
            title="Actividad reciente"
            description="Últimos cambios registrados en el sistema"
          />
          {loading ? (
            <p className="text-sm text-slate-400">Cargando actividad...</p>
          ) : recentActivity.length === 0 ? (
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400">
              Aún no hay movimientos recientes para mostrar.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentActivity.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <FileClock size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">{item.detail}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatDateTimeShort(item.when)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60 hover:text-cyan-100"
                  >
                    Ver detalle
                    <MoveRight size={13} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
          {hasAlerts ? (
            <AlertTriangle size={16} className="text-amber-300" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-300" />
          )}
          <span className="truncate">
            {hasAlerts
              ? 'Revisa las alertas para mantener el monitoreo al día.'
              : 'Sistema estable. Puedes continuar con tus monitoreos.'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/monitoreo')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60"
          >
            <ClipboardList size={13} />
            Monitoreos
          </button>
          <button
            type="button"
            onClick={() => navigate('/monitoreo/reportes')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60"
          >
            <FileClock size={13} />
            Reportes
          </button>
          <button
            type="button"
            onClick={() => navigate('/monitoreo/seguimiento')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60"
          >
            <CalendarDays size={13} />
            Seguimiento
          </button>
        </div>
      </Card>
    </div>
  );
}
