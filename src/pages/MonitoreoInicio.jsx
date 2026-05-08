import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { Skeleton, SkeletonTable } from '../components/ui/Skeleton.jsx';
import { supabase } from '../lib/supabase.js';
import { getRoleLabel, hasCddDashboardAccessRole } from '../lib/roles.js';

const AUTH_KEY = 'monitoreoAuth';

const MONTH_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'expired', label: 'Vencidos' },
];

const WEEKDAY_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

const toSafeDate = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatDateTime = (value) => {
  const date = toSafeDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatDateHeader = (value) =>
  new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value);

const getTemplateScope = (template) => {
  const levelsConfig = template?.levels_config;
  if (!levelsConfig || typeof levelsConfig !== 'object') return {};
  const scope = levelsConfig.scope;
  if (!scope || typeof scope !== 'object') return {};
  return scope;
};

const getTemplateStatus = (template) => {
  const availability = template?.availability || {};
  const status = String(availability.status || 'active').toLowerCase();
  const startAt = toSafeDate(availability.startAt);
  const endAt = toSafeDate(availability.endAt);
  const now = new Date();

  if (status === 'hidden') return 'hidden';
  if (status === 'closed') return 'closed';
  if (startAt && now < startAt) return 'scheduled';
  if (endAt && now > endAt) return 'closed';
  return 'active';
};

const isCddPublishedTemplate = (template) => {
  if (template?.status !== 'published') return false;
  if (getTemplateStatus(template) === 'hidden') return false;
  const scope = getTemplateScope(template);
  return String(scope?.cdd || '').toLowerCase() === 'si';
};

const getTemplateFilterStatus = (template) => {
  const status = getTemplateStatus(template);
  if (status === 'closed') return 'expired';
  if (status === 'scheduled') return 'pending';
  return 'in_progress';
};

const getDateWindowFromFilter = (filter) => {
  const year = Number(filter?.year || 0);
  if (!year) return null;

  const month = Number(filter?.month || 0);
  const day = Number(filter?.day || 0);

  if (month && day) {
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    const end = new Date(year, month - 1, day, 23, 59, 59, 999);
    return { start, end };
  }

  if (month) {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
};

const doesTemplateMatchDateFilter = (template, filter) => {
  const window = getDateWindowFromFilter(filter);
  if (!window) return true;

  const startAt = toSafeDate(template?.availability?.startAt) || toSafeDate(template?.created_at);
  const endAt = toSafeDate(template?.availability?.endAt) || toSafeDate(template?.updated_at);

  if (!startAt && !endAt) return false;
  const safeStart = startAt || endAt;
  const safeEnd = endAt || startAt;
  return safeStart <= window.end && safeEnd >= window.start;
};

const doesTemplateMatchWeekdayFilter = (template, filter) => {
  const selectedWeekday = String(filter?.weekday || 'all');
  if (selectedWeekday === 'all') return true;

  const expectedDay = Number(selectedWeekday);
  if (Number.isNaN(expectedDay)) return true;

  const window = getDateWindowFromFilter(filter);
  const startAt = toSafeDate(template?.availability?.startAt) || toSafeDate(template?.created_at);
  const endAt = toSafeDate(template?.availability?.endAt) || toSafeDate(template?.updated_at);
  if (!startAt && !endAt) return false;

  const baseStart = startAt || endAt;
  const baseEnd = endAt || startAt;
  let scanStart = new Date(baseStart);
  let scanEnd = new Date(baseEnd);

  if (window) {
    scanStart = new Date(Math.max(scanStart.getTime(), window.start.getTime()));
    scanEnd = new Date(Math.min(scanEnd.getTime(), window.end.getTime()));
  }

  if (scanStart > scanEnd) return false;

  const cursor = new Date(scanStart.getFullYear(), scanStart.getMonth(), scanStart.getDate());
  const limit = new Date(scanEnd.getFullYear(), scanEnd.getMonth(), scanEnd.getDate());
  while (cursor <= limit) {
    if (cursor.getDay() === expectedDay) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
};

const normalizeText = (value) => String(value || '').trim();

const formatPercent = (value) => `${Math.round(Number(value) || 0)}%`;
const formatPercentPrecise = (value) => {
  const numeric = Number(value) || 0;
  const fixed = numeric.toFixed(1);
  return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}%`;
};

const clampPercent = (value) => {
  const numeric = Number(value) || 0;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return numeric;
};

const clampNonNegative = (value) => {
  const numeric = Number(value) || 0;
  if (numeric < 0) return 0;
  return numeric;
};

const parseNumericValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const normalizeForMatch = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const isNumericQuestion = (question) => {
  const sourceType = String(question?.sourceType || question?.type || '').trim().toLowerCase();
  return ['number', 'numeric', 'numero', 'number_input'].includes(sourceType);
};

const getQuestionLabel = (question) =>
  String(
    question?.label ||
      question?.title ||
      question?.question ||
      question?.prompt ||
      question?.text ||
      question?.name ||
      '',
  );

const isGoalQuestionLabel = (label) => {
  const text = normalizeForMatch(label);
  if (!text) return false;
  if (text.includes('cual es la meta de re')) return true;
  if (text.includes('meta de re')) return true;
  return text.includes('meta');
};

const isRealProgressQuestionLabel = (label) => {
  const text = normalizeForMatch(label);
  if (!text) return false;
  if (text.includes('cuanto tienen de avance real')) return true;
  if (text.includes('avance real')) return true;
  if (text.includes('avance')) return true;
  if (text.includes('progreso')) return true;
  return text.includes('real');
};

const extractNumericAnswer = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const candidates = [value.answer, value.value, value.numeric, value.number, value.result, value.respuesta];
    for (const candidate of candidates) {
      const parsed = parseNumericValue(candidate);
      if (parsed !== null) return parsed;
    }
    return null;
  }
  return parseNumericValue(value);
};

const isGoalOrRealLabel = (label) => isGoalQuestionLabel(label) || isRealProgressQuestionLabel(label);

const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

const getDaysInMonth = (year, month) => {
  const safeYear = Number(year) || new Date().getFullYear();
  const safeMonth = Number(month) || 1;
  return new Date(safeYear, safeMonth, 0).getDate();
};

export default function MonitoreoInicio() {
  const readTheme = () => {
    if (typeof document === 'undefined') return 'dark';
    const root = document.documentElement;
    const dataTheme = String(root.dataset.theme || '').toLowerCase();
    if (dataTheme === 'light' || dataTheme === 'dark') return dataTheme;
    return root.classList.contains('dark') ? 'dark' : 'light';
  };

  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    } catch {
      return {};
    }
  }, []);

  const hasDashboardAccess = hasCddDashboardAccessRole(auth?.role);
  const roleLabel = getRoleLabel(auth?.role);
  const userLabel =
    normalizeText(auth?.fullName) ||
    normalizeText(auth?.email) ||
    normalizeText(auth?.docNumber) ||
    'Usuario';

  const [templates, setTemplates] = useState([]);
  const [instances, setInstances] = useState([]);
  const [templateMonitors, setTemplateMonitors] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const now = useMemo(() => new Date(), []);
  const [pendingFilters, setPendingFilters] = useState({
    year: String(now.getFullYear()),
    month: 'all',
    day: 'all',
    weekday: 'all',
    area: 'all',
    status: 'all',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    year: String(now.getFullYear()),
    month: 'all',
    day: 'all',
    weekday: 'all',
    area: 'all',
    status: 'all',
  });
  const [activeTheme, setActiveTheme] = useState(() => readTheme());

  useEffect(() => {
    if (!hasDashboardAccess) {
      setIsLoading(false);
      return;
    }

    let active = true;

    const loadDashboard = async (options = {}) => {
      const { silent = false } = options;
      if (!silent) {
        setIsLoading(true);
      }
      setError('');

      const sourceRes = await supabase.rpc('get_cdd_dashboard_source');

      if (!active) return;

      if (sourceRes.error) {
        setError(`No se pudo cargar el dashboard (${sourceRes.error.message}).`);
        setTemplates([]);
        setInstances([]);
        setTemplateMonitors([]);
        setProfiles([]);
        setIsLoading(false);
        return;
      }

      const payload = sourceRes.data && typeof sourceRes.data === 'object' ? sourceRes.data : {};
      setTemplates(Array.isArray(payload.templates) ? payload.templates : []);
      setInstances(Array.isArray(payload.instances) ? payload.instances : []);
      setTemplateMonitors(Array.isArray(payload.template_monitors) ? payload.template_monitors : []);
      setProfiles(Array.isArray(payload.profiles) ? payload.profiles : []);
      if (!silent) {
        setIsLoading(false);
      }
    };

    loadDashboard();

    const channel = supabase
      .channel('home-cdd-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_templates' }, () =>
        loadDashboard({ silent: true }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_instances' }, () =>
        loadDashboard({ silent: true }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_template_monitors' }, () =>
        loadDashboard({ silent: true }),
      )
      .subscribe();

    const refreshTimer = window.setInterval(() => {
      loadDashboard({ silent: true });
    }, 12000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [hasDashboardAccess]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const syncTheme = () => setActiveTheme(readTheme());
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => observer.disconnect();
  }, []);

  const yearOptions = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    templates.forEach((template) => {
      const dates = [template?.availability?.startAt, template?.availability?.endAt, template?.created_at];
      dates.forEach((value) => {
        const parsed = toSafeDate(value);
        if (parsed) years.add(parsed.getFullYear());
      });
    });
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => String(year));
  }, [templates]);

  const dayOptions = useMemo(() => {
    const month = Number(pendingFilters.month || 0);
    if (!month) {
      return ['all', ...Array.from({ length: 31 }, (_, index) => String(index + 1))];
    }
    const days = getDaysInMonth(pendingFilters.year, month);
    return ['all', ...Array.from({ length: days }, (_, index) => String(index + 1))];
  }, [pendingFilters.month, pendingFilters.year]);

  useEffect(() => {
    if (!dayOptions.includes(pendingFilters.day)) {
      setPendingFilters((prev) => ({ ...prev, day: 'all' }));
    }
  }, [dayOptions, pendingFilters.day]);

  const cddTemplates = useMemo(
    () => templates.filter((template) => isCddPublishedTemplate(template)),
    [templates],
  );

  const areaOptions = useMemo(() => {
    const areas = new Set();
    cddTemplates.forEach((template) => {
      const area = normalizeText(getTemplateScope(template)?.cddArea);
      if (area) areas.add(area);
    });
    return ['all', ...Array.from(areas).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))];
  }, [cddTemplates]);

  const profileById = useMemo(() => {
    const map = new Map();
    profiles.forEach((profile) => {
      const id = normalizeText(profile?.id).toLowerCase();
      if (!id) return;
      const name =
        normalizeText(profile?.full_name) ||
        `${normalizeText(profile?.first_name)} ${normalizeText(profile?.last_name)}`.trim() ||
        normalizeText(profile?.email) ||
        'Sin nombre';
      map.set(id, {
        id,
        name,
        role: normalizeText(profile?.role).toLowerCase(),
      });
    });
    return map;
  }, [profiles]);

  const templateMonitorIdsMap = useMemo(() => {
    const map = new Map();
    templateMonitors.forEach((row) => {
      const templateId = normalizeText(row?.template_id);
      const userId = normalizeText(row?.user_id);
      if (!templateId || !userId) return;
      if (!map.has(templateId)) map.set(templateId, []);
      map.get(templateId).push(userId.toLowerCase());
    });
    return map;
  }, [templateMonitors]);

  const filteredTemplates = useMemo(() => {
    const selectedArea = appliedFilters.area;
    const selectedStatus = appliedFilters.status || 'all';
    return cddTemplates.filter((template) => {
      if (!doesTemplateMatchDateFilter(template, appliedFilters)) return false;
      if (!doesTemplateMatchWeekdayFilter(template, appliedFilters)) return false;
      const filterStatus = getTemplateFilterStatus(template);
      if (selectedStatus !== 'all' && selectedStatus !== filterStatus) return false;
      const area = normalizeText(getTemplateScope(template)?.cddArea);
      if (selectedArea !== 'all' && area !== selectedArea) return false;
      return true;
    });
  }, [appliedFilters, cddTemplates]);

  const templateStats = useMemo(() => {
    return filteredTemplates.map((template) => {
      const scope = getTemplateScope(template);
      const instancesForTemplate = instances.filter((item) => item.template_id === template.id);
      const area = normalizeText(scope?.cddArea) || 'Sin area';

      const latestInstance = [...instancesForTemplate]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0];

      const questionMap = new Map();
      (Array.isArray(template?.sections) ? template.sections : []).forEach((section) => {
        (Array.isArray(section?.questions) ? section.questions : []).forEach((question) => {
          if (!question?.id) return;
          questionMap.set(String(question.id), question);
        });
      });

      const latestQuestions = latestInstance?.data?.questions;
      const numericRows = [];
      if (latestQuestions && typeof latestQuestions === 'object') {
        Object.entries(latestQuestions).forEach(([questionId, value]) => {
          const question = questionMap.get(String(questionId));
          const parsed = extractNumericAnswer(value);
          if (parsed === null) return;
          const rawLabelFromAnswer =
            typeof value === 'object' && value
              ? value.label || value.question || value.question_text || value.prompt || value.title || ''
              : '';
          const normalizedLabel = normalizeForMatch(getQuestionLabel(question) || rawLabelFromAnswer);
          const canUseValue = !question || isNumericQuestion(question) || isGoalOrRealLabel(normalizedLabel);
          if (!canUseValue) return;
          numericRows.push({
            value: parsed,
            label: normalizedLabel,
          });
        });
      }

      let goal = null;
      let completed = null;

      numericRows.forEach((row) => {
        if (goal === null && isGoalQuestionLabel(row.label)) {
          goal = row.value;
          return;
        }
        if (completed === null && isRealProgressQuestionLabel(row.label)) {
          completed = row.value;
        }
      });

      if (goal === null && numericRows.length > 0) {
        goal = numericRows[0].value;
      }
      if (completed === null && numericRows.length > 1) {
        completed = numericRows[1].value;
      }
      if (completed === null && numericRows.length > 0) {
        completed = numericRows[0].value;
      }

      const safeGoal = clampNonNegative(goal ?? 0);
      const safeCompleted = clampNonNegative(completed ?? 0);
      const progress = safeGoal > 0 ? clampPercent((safeCompleted / safeGoal) * 100) : 0;

      const assignedMonitorIds = templateMonitorIdsMap.get(template.id) || [];
      const assignedProfiles = assignedMonitorIds
        .map((monitorId) => profileById.get(monitorId))
        .filter(Boolean);
      const assignedChief =
        assignedProfiles.find((profile) => profile.role === 'jefe_area') ||
        assignedProfiles[0] ||
        null;
      const chiefName = assignedChief?.name || 'Sin jefe asignado';
      const chiefRole = assignedChief?.role || '';

      return {
        id: template.id,
        title: template.title || 'Monitoreo sin titulo',
        area,
        completed: Math.round(safeCompleted),
        goal: Math.round(safeGoal),
        goalBarPercent: safeGoal > 0 ? 100 : 0,
        realBarPercent: progress,
        progress,
        responsibleName: chiefName,
        chiefName,
        chiefRole,
        endAt: template?.availability?.endAt || null,
        lastUpdate: latestInstance?.updated_at || template?.updated_at || template?.created_at,
      };
    });
  }, [filteredTemplates, instances, profileById, templateMonitorIdsMap]);

  const indicatorStats = useMemo(
    () =>
      [...templateStats]
        .map((row) => ({
          ...row,
          indicator: row.title,
          goalBarPercent: row.goal > 0 ? 100 : 0,
          realBarPercent: row.progress,
        }))
        .sort((a, b) => b.progress - a.progress),
    [templateStats],
  );

  const bestIndicator = indicatorStats[0] || null;
  const worstIndicator = indicatorStats[indicatorStats.length - 1] || null;

  const globalProgress = useMemo(() => {
    if (!templateStats.length) return { completed: 0, goal: 0, progress: 0 };
    const completed = templateStats.reduce((acc, row) => acc + row.completed, 0);
    const goal = templateStats.reduce((acc, row) => acc + row.goal, 0);
    return {
      completed,
      goal,
      progress: goal > 0 ? clampPercent((completed / goal) * 100) : 0,
    };
  }, [templateStats]);

  const topChiefs = useMemo(() => {
    const validRoles = new Set(['jefe_area']);
    const grouped = new Map();

    templateStats.forEach((row) => {
      if (!validRoles.has(String(row.chiefRole || '').toLowerCase())) return;
      const key = row.chiefName || 'Sin jefe';
      if (!grouped.has(key)) {
        grouped.set(key, { name: key, completed: 0, goal: 0, totalProgress: 0, monitorings: 0 });
      }
      const item = grouped.get(key);
      item.completed += row.completed;
      item.goal += row.goal;
      item.totalProgress += clampPercent(row.progress);
      item.monitorings += 1;
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        goal: Math.max(row.goal, 0),
        efficiency: row.monitorings > 0 ? clampPercent(row.totalProgress / row.monitorings) : 0,
      }))
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 5);
  }, [templateStats]);

  const detailedRows = useMemo(
    () => [...templateStats].sort((a, b) => new Date(b.lastUpdate || 0).getTime() - new Date(a.lastUpdate || 0).getTime()).slice(0, 10),
    [templateStats],
  );

  const hasData = templateStats.length > 0;
  const isLightTheme = activeTheme === 'light';
  const chartRows = indicatorStats;
  const bestDelta = bestIndicator ? clampPercent(bestIndicator.progress - globalProgress.progress) : 0;
  const worstDelta = worstIndicator ? -clampPercent(globalProgress.progress - worstIndicator.progress) : 0;
  const monitoringStatusSummary = useMemo(() => {
    const summary = { total: 0, active: 0, scheduled: 0, closed: 0 };
    filteredTemplates.forEach((template) => {
      const status = getTemplateFilterStatus(template);
      summary.total += 1;
      if (status === 'in_progress') summary.active += 1;
      else if (status === 'pending') summary.scheduled += 1;
      else if (status === 'expired') summary.closed += 1;
    });
    return summary;
  }, [filteredTemplates]);

  const priorityAlerts = useMemo(
    () => [
      {
        id: 'closed',
        label: 'Monitoreos cerrados',
        value: monitoringStatusSummary.closed,
        detail: 'Revisar cierre y evidencias fuera de plazo.',
      },
      {
        id: 'scheduled',
        label: 'Programados',
        value: monitoringStatusSummary.scheduled,
        detail: 'Próximos monitoreos por iniciar.',
      },
      {
        id: 'risk',
        label: 'Riesgo por bajo avance',
        value: templateStats.filter((row) => row.progress < 30).length,
        detail: 'Monitoreos con avance menor al 30%.',
      },
    ],
    [monitoringStatusSummary.closed, monitoringStatusSummary.scheduled, templateStats],
  );

  return (
    <div className={`monitoreo-inicio-page space-y-6 ${isLightTheme ? 'text-slate-900' : 'text-[#e6edf5]'}`}>
      {!hasDashboardAccess ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-700">
          Esta vista está habilitada solo para Director, Jefe de Area y Administrador. Tu rol actual: {roleLabel}.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {hasDashboardAccess ? (
        <>
          <section className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className={`text-[1.65rem] font-extrabold tracking-tight leading-tight ${isLightTheme ? 'text-slate-900' : 'text-[#eef4fb]'}`}>Dashboard de Monitoreo</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAppliedFilters({ ...pendingFilters })}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0a8fb3] px-3.5 text-sm font-semibold text-white transition hover:bg-[#0b7f9e]"
              >
                Aplicar Filtros
              </button>
            </div>
          </section>

          <section className={`rounded-xl border p-3 shadow-[0_10px_20px_-8px_rgba(15,23,42,0.2)] ${
            isLightTheme ? 'border-slate-200 bg-white' : 'border-[#25435d] bg-[#151c23]'
          }`}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="lg:col-span-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                <label className={`flex flex-col gap-1 text-xs ${isLightTheme ? 'text-slate-600' : 'text-[#95a8bc]'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8da1b6]'}`}>Año</span>
                  <select
                    value={pendingFilters.year}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, year: event.target.value }))}
                    className={`h-9 rounded-lg border px-2.5 text-sm ${
                      isLightTheme
                        ? 'border-slate-200 bg-slate-50 text-slate-700'
                        : 'border-[#2b4962] bg-[#121922] text-[#e5edf6]'
                    }`}
                  >
                    {yearOptions.map((year) => (<option key={year} value={year}>{year}</option>))}
                  </select>
                </label>
                <label className={`flex flex-col gap-1 text-xs ${isLightTheme ? 'text-slate-600' : 'text-[#95a8bc]'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8da1b6]'}`}>Mes</span>
                  <select
                    value={pendingFilters.month}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, month: event.target.value }))}
                    className={`h-9 rounded-lg border px-2.5 text-sm ${
                      isLightTheme
                        ? 'border-slate-200 bg-slate-50 text-slate-700'
                        : 'border-[#2b4962] bg-[#121922] text-[#e5edf6]'
                    }`}
                  >
                    {MONTH_OPTIONS.map((month) => (<option key={month.value} value={month.value}>{month.label}</option>))}
                  </select>
                </label>
                <label className={`flex flex-col gap-1 text-xs ${isLightTheme ? 'text-slate-600' : 'text-[#95a8bc]'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8da1b6]'}`}>Día del mes</span>
                  <select
                    value={pendingFilters.day}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, day: event.target.value }))}
                    className={`h-9 rounded-lg border px-2.5 text-sm ${
                      isLightTheme
                        ? 'border-slate-200 bg-slate-50 text-slate-700'
                        : 'border-[#2b4962] bg-[#121922] text-[#e5edf6]'
                    }`}
                  >
                    {dayOptions.map((day) => (<option key={day} value={day}>{day === 'all' ? 'Todos' : day}</option>))}
                  </select>
                </label>
                <label className={`flex flex-col gap-1 text-xs ${isLightTheme ? 'text-slate-600' : 'text-[#95a8bc]'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8da1b6]'}`}>Día semana</span>
                  <select
                    value={pendingFilters.weekday}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, weekday: event.target.value }))}
                    className={`h-9 rounded-lg border px-2.5 text-sm ${
                      isLightTheme
                        ? 'border-slate-200 bg-slate-50 text-slate-700'
                        : 'border-[#2b4962] bg-[#121922] text-[#e5edf6]'
                    }`}
                  >
                    {WEEKDAY_OPTIONS.map((weekday) => (
                      <option key={weekday.value} value={weekday.value}>
                        {weekday.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`flex flex-col gap-1 text-xs ${isLightTheme ? 'text-slate-600' : 'text-[#95a8bc]'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8da1b6]'}`}>Área Académica</span>
                  <select
                    value={pendingFilters.area}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, area: event.target.value }))}
                    className={`h-9 rounded-lg border px-2.5 text-sm ${
                      isLightTheme
                        ? 'border-slate-200 bg-slate-50 text-slate-700'
                        : 'border-[#2b4962] bg-[#121922] text-[#e5edf6]'
                    }`}
                  >
                    {areaOptions.map((area) => (<option key={area} value={area}>{area === 'all' ? 'Todas las áreas' : area}</option>))}
                  </select>
                </label>
              </div>
              <div className={`border-t pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 ${isLightTheme ? 'border-slate-100' : 'border-[#25435d]'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8da1b6]'}`}>Estado del Monitoreo</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPendingFilters((prev) => ({ ...prev, status: option.value }))}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        pendingFilters.status === option.value
                          ? 'bg-cyan-100 text-cyan-700'
                          : isLightTheme
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            : 'bg-[#1d2936] text-[#bed0e0] hover:bg-[#253445]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <article className={`rounded-lg border p-3 ${isLightTheme ? 'border-slate-200 bg-white' : 'border-[#25435d] bg-[#151c23]'}`}>
              <p className={`text-[10px] uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#95a8bc]'}`}>Progreso Global</p>
              <p className={`mt-1 text-2xl font-black ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>{formatPercentPrecise(globalProgress.progress)}</p>
              <p className={`text-[11px] ${isLightTheme ? 'text-slate-500' : 'text-[#90a3b8]'}`}>Meta {globalProgress.goal} · Real {globalProgress.completed}</p>
            </article>
            <article className={`rounded-lg border p-3 ${isLightTheme ? 'border-slate-200 bg-white' : 'border-[#25435d] bg-[#151c23]'}`}>
              <p className={`text-[10px] uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#95a8bc]'}`}>Mejor Área</p>
              <p className={`mt-1 truncate text-base font-bold ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>{bestIndicator?.area || 'Sin área'}</p>
              <p className="text-[11px] text-emerald-500">{bestIndicator ? formatPercentPrecise(bestIndicator.progress) : '0%'}</p>
            </article>
            <article className={`rounded-lg border p-3 ${isLightTheme ? 'border-slate-200 bg-white' : 'border-[#25435d] bg-[#151c23]'}`}>
              <p className={`text-[10px] uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#95a8bc]'}`}>Peor Área</p>
              <p className={`mt-1 truncate text-base font-bold ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>{worstIndicator?.area || 'Sin área'}</p>
              <p className="text-[11px] text-rose-500">{worstIndicator ? formatPercentPrecise(worstIndicator.progress) : '0%'}</p>
            </article>
            <article className={`rounded-lg border p-3 ${isLightTheme ? 'border-slate-200 bg-white' : 'border-[#25435d] bg-[#151c23]'}`}>
              <p className={`text-[10px] uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#95a8bc]'}`}>Monitoreos Activos</p>
              <p className={`mt-1 text-2xl font-black ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>{monitoringStatusSummary.active}</p>
              <p className={`text-[11px] ${isLightTheme ? 'text-slate-500' : 'text-[#90a3b8]'}`}>Total {monitoringStatusSummary.total}</p>
            </article>
          </section>

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-12 space-y-3 lg:col-span-4 lg:order-2">
              <div className={`relative overflow-hidden rounded-xl border-l-4 border-emerald-500 p-4 shadow-[0_12px_24px_-4px_rgba(15,23,42,0.04)] ${
                isLightTheme ? 'bg-white' : 'bg-[#171d23]'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isLightTheme ? 'text-slate-500' : 'text-[#92a6ba]'}`}>Mejor indicador</p>
                    <h3
                      className={`mt-1 text-[0.98rem] font-bold leading-6 ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {bestIndicator?.indicator || 'Sin datos'}
                    </h3>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-500">
                    <TrendingUp size={18} />
                  </div>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <p className={`text-[2.2rem] leading-none font-black ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>
                    {bestIndicator ? formatPercentPrecise(bestIndicator.progress) : '0%'}
                  </p>
                  <span className="inline-flex items-center gap-0.5 text-sm font-bold text-emerald-500">
                    <ArrowUpRight size={13} />
                    {Math.round(bestDelta)}%
                  </span>
                </div>
                <p className={`mt-1 text-xs ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b7]'}`}>Area: {bestIndicator?.area || 'Sin área'}</p>
                <CheckCircle2
                  size={108}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={`pointer-events-none absolute -bottom-9 -right-9 ${
                    isLightTheme ? 'text-slate-400' : 'text-slate-100'
                  }`}
                  style={{ opacity: isLightTheme ? 0.05 : 0.028 }}
                />
              </div>

              <div className={`relative overflow-hidden rounded-xl border-l-4 border-rose-500 p-4 shadow-[0_12px_24px_-4px_rgba(15,23,42,0.04)] ${
                isLightTheme ? 'bg-white' : 'bg-[#171d23]'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isLightTheme ? 'text-slate-500' : 'text-[#92a6ba]'}`}>Peor indicador</p>
                    <h3
                      className={`mt-1 text-[0.98rem] font-bold leading-6 ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {worstIndicator?.indicator || 'Sin datos'}
                    </h3>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/12 text-rose-500">
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <p className={`text-[2.2rem] leading-none font-black ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>
                    {worstIndicator ? formatPercentPrecise(worstIndicator.progress) : '0%'}
                  </p>
                  <span className="inline-flex items-center gap-0.5 text-sm font-bold text-rose-500">
                    <ArrowDownRight size={13} />
                    {Math.round(worstDelta)}%
                  </span>
                </div>
                <p className={`mt-1 text-xs ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b7]'}`}>Area: {worstIndicator?.area || 'Sin área'}</p>
                <AlertTriangle
                  size={108}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={`pointer-events-none absolute -bottom-9 -right-9 ${
                    isLightTheme ? 'text-slate-400' : 'text-slate-100'
                  }`}
                  style={{ opacity: isLightTheme ? 0.05 : 0.028 }}
                />
              </div>

            </div>

            <div className={`inicio-panel col-span-12 rounded-xl p-4 shadow-[0_10px_20px_-8px_rgba(15,23,42,0.2)] lg:col-span-8 lg:order-1 ${isLightTheme ? 'bg-white' : 'bg-[#171d23]'}`}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className={`inicio-chart-title text-2xl font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>Meta vs Real por Desempeño</h3>
                  <p className={`text-xs ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>Comparativa trimestral de objetivos alcanzados.</p>
                </div>
                <div className={`flex items-center gap-4 text-xs ${isLightTheme ? 'text-slate-600' : 'text-[#a9bbcc]'}`}>
                  <span className="inline-flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${isLightTheme ? 'bg-slate-200' : 'bg-[#667788]'}`} /> Meta</span>
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-cyan-600" /> Real</span>
                </div>
              </div>

              {isLoading ? (
                <div className="flex h-[290px] items-end gap-5 px-2" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={`inicio-chart-skeleton-${index}`} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex h-52 items-end gap-2">
                        <Skeleton className="w-9 rounded-t-lg" style={{ height: `${120 + index * 12}px` }} />
                        <Skeleton className="w-9 rounded-t-lg" tone="soft" style={{ height: `${80 + index * 10}px` }} />
                      </div>
                      <Skeleton className="h-3 w-24" />
                    </div>
                  ))}
                </div>
              ) : !hasData ? (
                <p className="text-sm text-slate-500">No hay monitoreos con Compromiso de Desempeño para el filtro aplicado.</p>
              ) : (
                <div className="overflow-x-auto pb-1">
                  <div
                    className="flex items-end gap-4 px-1"
                    style={{ minWidth: `${Math.max(chartRows.length * 156, 780)}px` }}
                  >
                    {chartRows.map((row) => {
                      const maxHeight = 190;
                      const goalHeight = Math.max(4, Math.round((clampPercent(row.goalBarPercent) / 100) * maxHeight));
                      const realHeight = Math.max(8, Math.round((clampPercent(row.realBarPercent) / 100) * maxHeight));
                      return (
                        <div key={row.id} className="flex w-[140px] shrink-0 flex-col items-center gap-2">
                          <div className="inicio-chart-track flex h-[220px] items-end gap-2">
                            <div className="flex w-10 flex-col items-center gap-1">
                              <span
                                className={`text-[10px] font-bold leading-none ${
                                  isLightTheme ? 'text-slate-500' : 'text-[#9eb0c3]'
                                }`}
                              >
                                {formatPercentPrecise(row.goalBarPercent)}
                              </span>
                              <div className={`w-full rounded-t-lg ${isLightTheme ? 'bg-slate-200' : 'bg-[#667788]'}`} style={{ height: `${goalHeight}px` }} />
                            </div>
                            <div className="flex w-10 flex-col items-center gap-1">
                              <span className="text-[10px] font-bold leading-none text-cyan-400">
                                {formatPercentPrecise(row.realBarPercent)}
                              </span>
                              <div className="w-full rounded-t-lg bg-cyan-600" style={{ height: `${realHeight}px` }} />
                            </div>
                          </div>
                          <p
                            title={row.indicator}
                            className={`inicio-chart-label line-clamp-4 min-h-[4.5rem] text-center text-[11px] font-bold leading-[1.05rem] break-words ${isLightTheme ? 'text-slate-500' : 'text-[#9eb0c3]'}`}
                          >
                            {row.indicator}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`mt-5 grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4 ${isLightTheme ? 'border-slate-100' : 'border-[#2a3f53]'}`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>Promedio Real</p>
                  <p className={`text-xl font-bold ${isLightTheme ? 'text-slate-900' : 'text-[#eef4fb]'}`}>{formatPercentPrecise(globalProgress.progress)}</p>
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>Diferencia Meta</p>
                  <p className="text-xl font-bold text-rose-600">{formatPercentPrecise(globalProgress.progress - 100)}</p>
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>Eficiencia Global</p>
                  <div className={`mt-2 h-2 overflow-hidden rounded-full ${isLightTheme ? 'bg-slate-100' : 'bg-[#2a3541]'}`}>
                    <div className="h-full rounded-full bg-cyan-600" style={{ width: `${clampPercent(globalProgress.progress)}%` }} />
                  </div>
                </div>
                <div className="flex items-end justify-end">
                  <button type="button" className={`text-sm font-bold hover:underline ${isLightTheme ? 'text-cyan-700' : 'text-[#34d3ff]'}`}>Ver informe</button>
                </div>
              </div>
            </div>

            <div className="col-span-12 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className={`inicio-panel rounded-xl p-4 shadow-[0_10px_20px_-8px_rgba(15,23,42,0.2)] ${isLightTheme ? 'bg-white' : 'bg-[#171d23]'}`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={`text-base font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>Top jefes</h3>
                  <span className={`text-xs font-bold ${isLightTheme ? 'text-cyan-700' : 'text-[#34d3ff]'}`}>Este periodo</span>
                </div>
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`chief-skeleton-${index}`} className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <Skeleton className="h-3 w-4/5" />
                          <Skeleton className="h-2 w-1/2" tone="soft" />
                        </div>
                        <Skeleton className="h-2 w-14" />
                      </div>
                    ))}
                  </div>
                ) : !topChiefs.length ? (
                  <p className="text-sm text-slate-500">No hay jefes con datos suficientes.</p>
                ) : (
                  <div className="space-y-2">
                    {topChiefs.map((chief) => (
                      <div key={chief.name} className={`flex items-center gap-2.5 rounded-lg p-2 ${isLightTheme ? 'hover:bg-slate-50' : 'hover:bg-[#202a35]'}`}>
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${isLightTheme ? 'bg-cyan-100 text-cyan-700' : 'bg-[#083746] text-[#45ddff]'}`}>
                          {String(chief.name || 'J').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#e7f0f8]'}`}>{chief.name}</p>
                          <p className={`text-xs ${isLightTheme ? 'text-slate-500' : 'text-[#90a3b8]'}`}>{pluralize(chief.monitorings, 'monitoreo', 'monitoreos')}</p>
                        </div>
                        <div className="w-14 text-right">
                          <p className={`text-sm font-black ${isLightTheme ? 'text-cyan-700' : 'text-[#34d3ff]'}`}>{formatPercent(chief.efficiency)}</p>
                          <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${isLightTheme ? 'bg-slate-100' : 'bg-[#2a3541]'}`}>
                            <div className="h-full rounded-full bg-cyan-600" style={{ width: `${clampPercent(chief.efficiency)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`inicio-panel rounded-xl p-4 shadow-[0_10px_20px_-8px_rgba(15,23,42,0.2)] ${isLightTheme ? 'bg-white' : 'bg-[#171d23]'}`}>
                <h3 className={`mb-3 text-base font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>Alertas / Prioridades</h3>
                <div className="space-y-2">
                  {priorityAlerts.map((alert) => (
                    <div key={alert.id} className={`rounded-lg border p-2.5 ${alert.value > 0 ? 'border-rose-500/40 bg-rose-500/10' : 'border-slate-700/35 bg-slate-900/20'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[12px] font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#e7f0f8]'}`}>{alert.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${alert.value > 0 ? 'bg-rose-500/20 text-rose-400' : isLightTheme ? 'bg-slate-100 text-slate-600' : 'bg-slate-700/50 text-slate-300'}`}>{alert.value}</span>
                      </div>
                      <p className={`mt-1 text-[11px] ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>{alert.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`inicio-panel rounded-xl p-4 shadow-[0_10px_20px_-8px_rgba(15,23,42,0.2)] ${isLightTheme ? 'bg-white' : 'bg-[#171d23]'}`}>
                <h3 className={`mb-3 text-base font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#f0f6fc]'}`}>Tareas pendientes</h3>
                <div className="space-y-2">
                  <div className="rounded-lg border border-slate-700/35 bg-slate-900/20 p-2.5">
                    <p className={`text-[12px] font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#e7f0f8]'}`}>Aplicar filtros del periodo</p>
                    <p className={`mt-1 text-[11px] ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>Valida año, mes, día y estado para depurar el tablero.</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/35 bg-slate-900/20 p-2.5">
                    <p className={`text-[12px] font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#e7f0f8]'}`}>Revisar monitoreos cerrados</p>
                    <p className={`mt-1 text-[11px] ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>{monitoringStatusSummary.closed} registros requieren verificación de cierre.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={`overflow-hidden rounded-xl shadow-[0_12px_24px_-4px_rgba(15,23,42,0.04)] ${isLightTheme ? 'bg-white' : 'bg-[#171d23]'}`}>
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4 ${isLightTheme ? 'border-slate-100' : 'border-[#2a3f53]'}`}>
              <div>
                <h3 className={`text-lg font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#eef4fb]'}`}>Actividad de Monitoreo Detallada</h3>
                <p className={`text-xs ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>Listado de los últimos monitoreos en ejecución y su estado actual.</p>
              </div>
              <span className={`text-xs ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>{pluralize(detailedRows.length, 'registro', 'registros')}</span>
            </div>

            {isLoading ? (
              <div className="p-3">
                <SkeletonTable rows={7} columns={5} />
              </div>
            ) : !detailedRows.length ? (
              <p className="px-5 py-5 text-sm text-slate-500">Sin actividad para el filtro aplicado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b text-[10px] uppercase tracking-[0.12em] ${isLightTheme ? 'border-slate-100 bg-slate-50 text-slate-500' : 'border-[#2a3f53] bg-[#1a2129] text-[#8ea2b8]'}`}>
                      <th className="px-5 py-3">Monitoreo</th>
                      <th className="px-5 py-3">Responsable</th>
                      <th className="px-5 py-3">Área</th>
                      <th className="px-5 py-3">Vencimiento</th>
                      <th className="px-5 py-3">Progreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedRows.map((row) => (
                      <tr key={row.id} className={`${isLightTheme ? 'border-b border-slate-100 hover:bg-slate-50' : 'border-b border-[#23384e] hover:bg-[#1d2731]'}`}>
                        <td className="px-5 py-3">
                          <p className={`text-sm font-semibold ${isLightTheme ? 'text-slate-900' : 'text-[#e8f1f9]'}`}>{row.title}</p>
                          <p className={`text-[11px] ${isLightTheme ? 'text-slate-500' : 'text-[#8ea2b8]'}`}>Ref: #{String(row.id).slice(0, 8).toUpperCase()}</p>
                        </td>
                        <td className={`px-5 py-3 ${isLightTheme ? 'text-slate-700' : 'text-[#d3e0ed]'}`}>{row.responsibleName}</td>
                        <td className={`px-5 py-3 ${isLightTheme ? 'text-slate-700' : 'text-[#d3e0ed]'}`}>{row.area}</td>
                        <td className={`px-5 py-3 ${isLightTheme ? 'text-slate-700' : 'text-[#b3c4d5]'}`}>{formatDateTime(row.endAt || row.lastUpdate)}</td>
                        <td className="px-5 py-3">
                          <div className="w-36">
                            <div className={`mb-1 flex justify-between text-[11px] ${isLightTheme ? 'text-slate-600' : 'text-[#b3c4d5]'}`}>
                              <span>{formatPercent(row.progress)}</span>
                              <span>{row.completed}/{row.goal}</span>
                            </div>
                            <div className={`h-1.5 overflow-hidden rounded-full ${isLightTheme ? 'bg-slate-100' : 'bg-[#2a3541]'}`}>
                              <div className={`h-full rounded-full ${row.progress >= 80 ? 'bg-emerald-500' : row.progress >= 50 ? 'bg-cyan-600' : 'bg-amber-500'}`} style={{ width: `${clampPercent(row.progress)}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
