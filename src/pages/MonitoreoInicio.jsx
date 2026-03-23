import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileClock,
  MoveRight,
  Settings,
  Users,
  BarChart3,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import { supabase } from '../lib/supabase.js';
import { HOME_QUICK_ACTIONS_BY_ROLE, HOME_WIDGETS_BY_ROLE } from '../config/roleUiConfig.js';
import { ROLE_ADMIN, ROLE_SPECIALIST, resolveUserRole } from '../lib/roles.js';

const AUTH_KEY = 'monitoreoAuth';
const ALERT_WINDOW_DAYS = 7;
const AGENDA_ITEMS_LIMIT = 3;

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

const isSameDay = (left, right) => {
  if (!left || !right) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
};

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

const quickActionIconByKey = {
  clipboard: ClipboardList,
  calendar: CalendarDays,
  fileClock: FileClock,
  chart: BarChart3,
  users: Users,
  settings: Settings,
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

  const userRole = resolveUserRole(auth?.role);
  const isAdmin = userRole === ROLE_ADMIN;
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

  const draftTemplatesCount = useMemo(
    () => templates.filter((template) => template.status !== 'published').length,
    [templates],
  );

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const overdueTemplatesCount = useMemo(
    () =>
      publishedTemplates.filter((template) => {
        const endAt = toSafeDate(template?.availability?.endAt);
        if (!endAt) return false;
        if (getTemplateStatus(template) === 'hidden') return false;
        return endAt < todayStart;
      }).length,
    [publishedTemplates, todayStart],
  );

  const dueTodayTemplatesCount = useMemo(
    () =>
      publishedTemplates.filter((template) => {
        const endAt = toSafeDate(template?.availability?.endAt);
        if (!endAt) return false;
        if (getTemplateStatus(template) === 'hidden') return false;
        return isSameDay(endAt, todayStart);
      }).length,
    [publishedTemplates, todayStart],
  );

  const dueSoonTemplatesCount = useMemo(() => {
    const soonLimit = addDays(todayStart, 2);
    return publishedTemplates.filter((template) => {
      const endAt = toSafeDate(template?.availability?.endAt);
      if (!endAt) return false;
      if (getTemplateStatus(template) === 'hidden') return false;
      if (isSameDay(endAt, todayStart)) return false;
      return endAt > todayStart && endAt <= soonLimit;
    }).length;
  }, [publishedTemplates, todayStart]);

  const eventsWithoutResponsibleCount = useMemo(() => {
    if (!isAdmin) return 0;
    return events.filter(
      (event) =>
        event.event_type === 'monitoring' &&
        event.status !== 'closed' &&
        (event.monitoring_event_responsibles?.length || 0) === 0,
    ).length;
  }, [events, isAdmin]);

  const pendingReportsCount = useMemo(
    () => instances.filter((instance) => instance.status !== 'completed').length,
    [instances],
  );

  const priorityActions = useMemo(() => {
    const items = [];

    if (overdueTemplatesCount > 0) {
      items.push({
        id: 'overdue-templates',
        priority: 1,
        tone: 'critical',
        title: `${overdueTemplatesCount} ${pluralize(overdueTemplatesCount, 'monitoreo vencido', 'monitoreos vencidos')}`,
        description: 'Requiere revision inmediata.',
        actionLabel: 'Revisar',
        actionPath: '/monitoreo/reportes',
      });
    }

    if (dueTodayTemplatesCount > 0) {
      items.push({
        id: 'due-today-templates',
        priority: 2,
        tone: 'warning',
        title: `${dueTodayTemplatesCount} ${pluralize(
          dueTodayTemplatesCount,
          'monitoreo vence hoy',
          'monitoreos vencen hoy',
        )}`,
        description: 'Prioriza la ejecucion antes del cierre.',
        actionLabel: 'Atender',
        actionPath: '/monitoreo/reportes',
      });
    }

    if (pendingReportsCount > 0) {
      items.push({
        id: 'pending-reports',
        priority: 3,
        tone: 'info',
        title: `${pendingReportsCount} ${pluralize(pendingReportsCount, 'reporte pendiente', 'reportes pendientes')}`,
        description: 'Continua formularios en progreso.',
        actionLabel: 'Continuar',
        actionPath: '/monitoreo/reportes',
      });
    }

    if (draftTemplatesCount > 0) {
      items.push({
        id: 'draft-templates',
        priority: 4,
        tone: 'info',
        title: `${draftTemplatesCount} ${pluralize(
          draftTemplatesCount,
          'borrador requiere completarse',
          'borradores requieren completarse',
        )}`,
        description: 'Publica o completa los borradores.',
        actionLabel: 'Completar',
        actionPath: '/monitoreo',
      });
    }

    if (dueSoonTemplatesCount > 0) {
      items.push({
        id: 'due-soon-templates',
        priority: 5,
        tone: 'warning',
        title: `${dueSoonTemplatesCount} ${pluralize(
          dueSoonTemplatesCount,
          'monitoreo vence pronto',
          'monitoreos vencen pronto',
        )}`,
        description: 'Revisa vencimientos de los proximos 2 dias.',
        actionLabel: 'Priorizar',
        actionPath: '/monitoreo/reportes',
      });
    }

    if (eventsWithoutResponsibleCount > 0) {
      items.push({
        id: 'events-without-responsible',
        priority: 6,
        tone: 'critical',
        title: `${eventsWithoutResponsibleCount} ${pluralize(
          eventsWithoutResponsibleCount,
          'evento sin responsable',
          'eventos sin responsable',
        )}`,
        description: 'Asigna responsables para no frenar seguimiento.',
        actionLabel: 'Asignar',
        actionPath: '/monitoreo/seguimiento',
      });
    }

    return items.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [
    draftTemplatesCount,
    dueSoonTemplatesCount,
    dueTodayTemplatesCount,
    eventsWithoutResponsibleCount,
    overdueTemplatesCount,
    pendingReportsCount,
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

  const adminAlerts = useMemo(() => {
    const items = [];

    if (overdueTemplatesCount > 0) {
      items.push({
        id: 'admin-overdue',
        priority: 1,
        tone: 'critical',
        title: `${overdueTemplatesCount} ${pluralize(
          overdueTemplatesCount,
          'monitoreo vencido en el sistema',
          'monitoreos vencidos en el sistema',
        )}`,
        description: 'Requiere supervision y cierre.',
        actionLabel: 'Ver reportes',
        actionPath: '/monitoreo/reportes',
      });
    }

    if (eventsWithoutResponsibleCount > 0) {
      items.push({
        id: 'admin-no-responsible',
        priority: 2,
        tone: 'critical',
        title: `${eventsWithoutResponsibleCount} ${pluralize(
          eventsWithoutResponsibleCount,
          'evento sin responsable',
          'eventos sin responsable',
        )}`,
        description: 'Asigna especialista para mantener continuidad operativa.',
        actionLabel: 'Ir a seguimiento',
        actionPath: '/monitoreo/seguimiento',
      });
    }

    if (dueTodayTemplatesCount > 0) {
      items.push({
        id: 'admin-due-today',
        priority: 3,
        tone: 'warning',
        title: `${dueTodayTemplatesCount} ${pluralize(
          dueTodayTemplatesCount,
          'monitoreo vence hoy',
          'monitoreos vencen hoy',
        )}`,
        description: 'Prioriza el seguimiento de cierre.',
        actionLabel: 'Revisar',
        actionPath: '/monitoreo/seguimiento',
      });
    }

    if (pendingReportsCount > 0) {
      items.push({
        id: 'admin-pending-reports',
        priority: 4,
        tone: 'info',
        title: `${pendingReportsCount} ${pluralize(pendingReportsCount, 'reporte pendiente', 'reportes pendientes')}`,
        description: 'Hay reportes en curso pendientes de finalizar.',
        actionLabel: 'Abrir reportes',
        actionPath: '/monitoreo/reportes',
      });
    }

    if (draftTemplatesCount > 0) {
      items.push({
        id: 'admin-drafts',
        priority: 5,
        tone: 'warning',
        title: `${draftTemplatesCount} ${pluralize(
          draftTemplatesCount,
          'borrador sin publicar',
          'borradores sin publicar',
        )}`,
        description: 'Completa y publica las plantillas pendientes.',
        actionLabel: 'Ir a monitoreos',
        actionPath: '/monitoreo',
      });
    }

    return items.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [
    draftTemplatesCount,
    dueTodayTemplatesCount,
    eventsWithoutResponsibleCount,
    overdueTemplatesCount,
    pendingReportsCount,
  ]);

  const adminMetrics = useMemo(
    () => [
      {
        id: 'active-templates',
        label: 'Monitoreos activos',
        value: activeTemplates.length,
        className: 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100',
      },
      {
        id: 'pending-reports',
        label: 'Reportes pendientes',
        value: pendingReportsCount,
        className: 'border-indigo-500/35 bg-indigo-500/10 text-indigo-100',
      },
      {
        id: 'overdue-templates',
        label: 'Monitoreos vencidos',
        value: overdueTemplatesCount,
        className: 'border-rose-500/35 bg-rose-500/10 text-rose-100',
      },
      {
        id: 'events-without-responsible',
        label: 'Sin responsable',
        value: eventsWithoutResponsibleCount,
        className: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
      },
    ],
    [activeTemplates.length, eventsWithoutResponsibleCount, overdueTemplatesCount, pendingReportsCount],
  );

  const hasSpecialistPriorityActions = priorityActions.length > 0;
  const hasAdminAlerts = adminAlerts.length > 0;
  const activeHomeWidgets =
    HOME_WIDGETS_BY_ROLE[userRole] || HOME_WIDGETS_BY_ROLE[ROLE_SPECIALIST] || [];
  const hasWidget = (widgetKey) => activeHomeWidgets.includes(widgetKey);
  const recommendedAction = useMemo(() => {
    if (isAdmin) return adminAlerts[0] || null;
    return priorityActions[0] || null;
  }, [adminAlerts, isAdmin, priorityActions]);

  const quickActions = useMemo(() => {
    const definition = HOME_QUICK_ACTIONS_BY_ROLE[userRole] || HOME_QUICK_ACTIONS_BY_ROLE[ROLE_SPECIALIST] || [];
    return definition.map((item) => ({
      ...item,
      icon: quickActionIconByKey[item.iconKey] || ClipboardList,
    }));
  }, [userRole]);

  const showUnifiedEmptyState = useMemo(() => {
    if (loading) return false;
    const hasAnyOperationalWidget =
      hasWidget('admin_global_alerts') ||
      hasWidget('specialist_priority_actions') ||
      hasWidget('specialist_agenda');
    if (!hasAnyOperationalWidget) return false;
    return !recommendedAction && !hasAdminAlerts && !hasSpecialistPriorityActions && upcomingAgenda.length === 0;
  }, [
    hasAdminAlerts,
    hasSpecialistPriorityActions,
    loading,
    recommendedAction,
    upcomingAgenda.length,
    hasWidget,
  ]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {showDenied ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200 md:px-4 md:py-3 md:text-sm">
          No tienes permisos para acceder.
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200 md:px-4 md:py-3 md:text-sm">
          {loadError}
        </div>
      ) : null}

      <Card className="flex items-center justify-between gap-2 px-3 py-2.5 md:gap-3 md:px-4 md:py-3">
        <SectionHeader
          title="Inicio"
          size="page"
        />
      </Card>

      {hasWidget('admin_global_metrics') ? (
        <Card className="w-full rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 shadow-[0_8px_24px_-20px_rgba(0,0,0,0.6)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex h-7 items-center rounded-lg border border-slate-700/60 bg-slate-900/50 px-2.5 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              Estado actual
            </p>
            {loading ? (
              <span className="text-sm text-slate-400">Cargando metricas...</span>
            ) : (
              adminMetrics.map((metric) => (
                <span
                  key={metric.id}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] ${metric.className}`}
                >
                  <span className="font-semibold">{metric.value}</span>
                  <span>{metric.label}</span>
                </span>
              ))
            )}
          </div>
        </Card>
      ) : null}

      {(hasWidget('admin_global_alerts') || hasWidget('specialist_priority_actions')) ? (
        <Card className="flex flex-col gap-2.5 px-3 py-3 md:gap-3 md:px-4 md:py-4">
          <SectionHeader
            eyebrow="Prioridad"
            title="Que revisar ahora"
            description={loading ? 'Cargando prioridad...' : recommendedAction ? recommendedAction.title : 'Todo en orden'}
          />
          {!loading && recommendedAction && !showUnifiedEmptyState ? (
            <p className="text-sm text-slate-300 md:text-[15px]">{recommendedAction.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {loading ? (
              <span className="text-xs text-slate-400 md:text-sm">Preparando accion sugerida...</span>
            ) : recommendedAction && !showUnifiedEmptyState ? (
              <button
                type="button"
                onClick={() => navigate(recommendedAction.actionPath)}
                className="ds-btn ds-btn-primary h-9 px-3.5 md:h-10 md:px-4"
              >
                {recommendedAction.actionLabel}
                <MoveRight size={14} />
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-100">
                <span className="text-sm leading-none">✔</span>
                Todo en orden
              </span>
            )}
          </div>
        </Card>
      ) : null}

      {hasWidget('admin_global_alerts') && !showUnifiedEmptyState ? (
        <Card className="flex flex-col gap-2.5 px-3 py-3 md:gap-3 md:px-4 md:py-4">
          <SectionHeader eyebrow="Atencion" title="Lo pendiente" />
          {loading ? (
            <p className="text-xs text-slate-400 md:text-sm">Cargando alertas...</p>
          ) : !hasAdminAlerts ? (
            <p className="text-xs text-emerald-200 md:text-sm">No hay alertas globales activas.</p>
          ) : (
            <div className="space-y-1.5">
              {adminAlerts.map((alert) => {
                const Icon = iconByAlert[alert.tone] || AlertTriangle;
                return (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => navigate(alert.actionPath)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/45 px-3 py-2 text-left transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-600/70 hover:bg-slate-900/72"
                  >
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                      toneClassByAlert[alert.tone] || toneClassByAlert.info
                    }`}>
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-100">{alert.title}</p>
                      <p className="text-[11px] text-slate-400">{alert.description}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                      {alert.actionLabel}
                      <MoveRight size={13} className="shrink-0 text-slate-400" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {hasWidget('specialist_priority_actions') && !showUnifiedEmptyState ? (
        <Card className="flex flex-col gap-2.5 px-3 py-3 md:gap-3 md:px-4 md:py-4">
          <SectionHeader eyebrow="Atencion" title="Lo pendiente" />
          {loading ? (
            <p className="text-xs text-slate-400 md:text-sm">Cargando acciones...</p>
          ) : !hasSpecialistPriorityActions ? (
            <p className="text-xs text-emerald-200 md:text-sm">No tienes acciones urgentes.</p>
          ) : (
            <div className="space-y-1.5">
              {priorityActions.map((action) => {
                const Icon = iconByAlert[action.tone] || AlertTriangle;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => navigate(action.actionPath)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/45 px-3 py-2 text-left transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-600/70 hover:bg-slate-900/72"
                  >
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                      toneClassByAlert[action.tone] || toneClassByAlert.info
                    }`}>
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-100">{action.title}</p>
                      <p className="text-[11px] text-slate-400">{action.description}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                      {action.actionLabel}
                      <MoveRight size={13} className="shrink-0 text-slate-400" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {hasWidget('specialist_agenda') && !showUnifiedEmptyState ? (
        <Card className="flex flex-col gap-2.5 px-3 py-3 md:gap-3 md:px-4 md:py-4">
          <SectionHeader eyebrow="Agenda" title="Actividades proximas" />
          {loading ? (
            <p className="text-xs text-slate-400 md:text-sm">Cargando agenda...</p>
          ) : upcomingAgenda.length === 0 ? (
            <p className="text-xs text-slate-400 md:text-sm">No hay eventos proximos.</p>
          ) : (
            <ul className="divide-y divide-slate-800/70 rounded-lg border border-slate-800/70 bg-slate-900/35">
              {upcomingAgenda.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 md:py-2">
                  <p title={event.title} className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {truncateLabel(event.title, 62)}
                  </p>
                  <span className="text-[11px] text-slate-400">{formatAgendaRange(event.start_at, event.end_at)}</span>
                  <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100">
                    {eventTypeLabel(event.event_type)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {showUnifiedEmptyState ? (
        <Card className="flex flex-col gap-2.5 px-3 py-3 md:gap-3 md:px-4 md:py-4">
          <p className="text-sm font-medium text-slate-200 md:text-base">No hay monitoreos ni actividades pendientes.</p>
          <p className="text-xs text-slate-400 md:text-sm">Todo en orden para el periodo actual.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/monitoreo/seguimiento')}
              className="ds-btn ds-btn-secondary h-8 px-3 text-xs md:h-9"
            >
              Ir a seguimiento
            </button>
            <button
              type="button"
              onClick={() => navigate('/monitoreo/gestion')}
              className="ds-btn ds-btn-primary h-8 px-3 text-xs md:h-9"
            >
              Crear monitoreo
            </button>
          </div>
        </Card>
      ) : null}

      {hasWidget('quick_actions') ? (
        <Card className="flex flex-col gap-2.5 px-3 py-3 md:gap-3 md:px-4 md:py-4">
          <SectionHeader eyebrow="Acciones" title="Acciones rapidas" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="ds-btn ds-btn-secondary h-9 text-xs md:h-10 md:text-sm"
                >
                  <Icon size={14} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
