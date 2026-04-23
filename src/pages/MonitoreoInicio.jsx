import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
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
    area: 'all',
    status: 'all',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    year: String(now.getFullYear()),
    month: 'all',
    day: 'all',
    area: 'all',
    status: 'all',
  });

  useEffect(() => {
    if (!hasDashboardAccess) {
      setIsLoading(false);
      return;
    }

    let active = true;

    const loadDashboard = async () => {
      setIsLoading(true);
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
      setIsLoading(false);
    };

    loadDashboard();

    const channel = supabase
      .channel('home-cdd-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_templates' }, loadDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_instances' }, loadDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_template_monitors' }, loadDashboard)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [hasDashboardAccess]);

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
      return ['all'];
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
        grouped.set(key, { name: key, completed: 0, goal: 0, monitorings: 0 });
      }
      const item = grouped.get(key);
      item.completed += row.completed;
      item.goal += row.goal;
      item.monitorings += 1;
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        goal: Math.max(row.goal, 0),
        efficiency: row.goal > 0 ? clampPercent((row.completed / row.goal) * 100) : 0,
      }))
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 5);
  }, [templateStats]);

  const detailedRows = useMemo(
    () => [...templateStats].sort((a, b) => new Date(b.lastUpdate || 0).getTime() - new Date(a.lastUpdate || 0).getTime()).slice(0, 10),
    [templateStats],
  );

  const highPriorityRows = useMemo(() => {
    const nowDate = new Date();
    const sevenDays = new Date(nowDate);
    sevenDays.setDate(sevenDays.getDate() + 7);

    return templateStats
      .filter((row) => {
        const endAt = toSafeDate(row.endAt);
        if (!endAt) return false;
        return row.progress < 70 && endAt >= nowDate && endAt <= sevenDays;
      })
      .sort((a, b) => a.progress - b.progress)
      .slice(0, 3);
  }, [templateStats]);

  const pendingTasks = useMemo(() => {
    const rows = templateStats
      .filter((row) => row.progress < 100)
      .sort((a, b) => a.progress - b.progress)
      .slice(0, 4)
      .map((row) => ({
        id: row.id,
        text: `Validar avances de ${row.title}`,
        detail: `${row.area} · ${formatPercent(row.progress)}`,
      }));

    if (!rows.length) {
      return [{ id: 'none', text: 'No hay tareas pendientes de CdD.', detail: 'Todo en orden.' }];
    }

    return rows;
  }, [templateStats]);

  const hasData = templateStats.length > 0;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Card className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5 md:gap-3 md:px-4 md:py-3">
        <SectionHeader title="Inicio" size="page" description="Resumen operativo de Compromiso de Desempeño" />
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/55 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Hoy</p>
          <p className="text-xs font-semibold text-slate-200">{formatDateHeader(new Date())}</p>
          <p className="text-[11px] text-slate-400">{userLabel}</p>
        </div>
      </Card>

      {!hasDashboardAccess ? (
        <Card className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
          Esta vista está habilitada solo para los roles Director, Jefe de Area y Administrador. Tu rol actual: {roleLabel}.
        </Card>
      ) : null}

      {error ? (
        <Card className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">{error}</Card>
      ) : null}

      {hasDashboardAccess ? (
        <>
          <section className="grid grid-cols-1 gap-4">
            <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/55 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Filtros CdD</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-6">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Año</span>
                  <select
                    value={pendingFilters.year}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, year: event.target.value }))}
                    className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Mes</span>
                  <select
                    value={pendingFilters.month}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, month: event.target.value }))}
                    className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  >
                    {MONTH_OPTIONS.map((month) => (
                      <option key={month.value} value={month.value}>{month.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Día</span>
                  <select
                    value={pendingFilters.day}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, day: event.target.value }))}
                    className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  >
                    {dayOptions.map((day) => (
                      <option key={day} value={day}>{day === 'all' ? 'Todos' : day}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Area</span>
                  <select
                    value={pendingFilters.area}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, area: event.target.value }))}
                    className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  >
                    {areaOptions.map((area) => (
                      <option key={area} value={area}>{area === 'all' ? 'Todas' : area}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Estado</span>
                  <select
                    value={pendingFilters.status}
                    onChange={(event) => setPendingFilters((prev) => ({ ...prev, status: event.target.value }))}
                    className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  >
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setAppliedFilters({ ...pendingFilters })}
                  className="col-span-2 inline-flex h-10 items-center justify-center gap-2 self-end rounded-xl border border-cyan-400/50 bg-cyan-500/15 px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/70 md:col-span-1"
                >
                  <CalendarDays size={14} />
                  Aplicar
                </button>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              <Card className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">Total Progress (Mejor indicador)</p>
                {bestIndicator ? (
                  <>
                    <p className="mt-3 text-3xl font-extrabold text-emerald-100">{formatPercent(bestIndicator.progress)}</p>
                    <p className="mt-1 truncate text-xs text-emerald-100/80">{bestIndicator.indicator}</p>
                    <p className="mt-2 text-[11px] text-emerald-100/80">
                      Real/Meta: {Math.round(bestIndicator.completed)}/{Math.round(bestIndicator.goal)}
                    </p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-emerald-100/80">Sin datos</p>
                )}
              </Card>

              <Card className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-100/80">Total Progress (Peor indicador)</p>
                {worstIndicator ? (
                  <>
                    <p className="mt-3 text-3xl font-extrabold text-rose-100">{formatPercent(worstIndicator.progress)}</p>
                    <p className="mt-1 truncate text-xs text-rose-100/80">{worstIndicator.indicator}</p>
                    <p className="mt-2 text-[11px] text-rose-100/80">
                      Real/Meta: {Math.round(worstIndicator.completed)}/{Math.round(worstIndicator.goal)}
                    </p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-rose-100/80">Sin datos</p>
                )}
              </Card>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4">
            <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/55 p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-100">Meta vs Avance por Indicador</h3>
                  <p className="text-xs text-slate-400">Comparativo por indicador: meta vs avance real de CdD</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400/70" />
                    Meta
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-300" />
                    Avance
                  </span>
                  <span className="rounded-full border border-slate-700/60 px-2.5 py-1 text-[11px] text-slate-300">
                    Global: {formatPercent(globalProgress.progress)}
                  </span>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={14} className="animate-spin" /> Cargando metricas...</div>
              ) : !hasData ? (
                <p className="text-sm text-slate-400">No hay monitoreos con Compromiso de Desempeño para el filtro aplicado.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-800/70 bg-slate-950/40">
                  <div className="scrollbar-thin overflow-x-auto pb-1">
                    <div className="flex w-max min-w-full snap-x snap-mandatory items-end gap-5 px-4 pb-2 pt-6 sm:gap-6 sm:px-5 sm:pb-3 sm:pt-7">
                      {indicatorStats.map((row) => {
                        const maxHeight = 156;
                        const goalHeight = Math.max(4, Math.round((clampPercent(row.goalBarPercent) / 100) * maxHeight));
                        const realHeight = Math.max(4, Math.round((clampPercent(row.realBarPercent) / 100) * maxHeight));
                        return (
                          <div key={row.id} className="flex w-[136px] shrink-0 snap-start flex-col items-center gap-2 sm:w-[156px]">
                            <div className="flex h-[176px] items-end gap-2 pt-3 sm:h-[204px] sm:pt-4">
                              <div className="flex w-9 flex-col items-center gap-1 sm:w-10">
                                <span className="text-[10px] font-semibold text-slate-300">{Math.round(row.goal)}</span>
                                <div
                                  className="w-full rounded-t-md bg-slate-500/40"
                                  style={{ height: `${goalHeight}px`, maxHeight: 'clamp(120px,22vw,156px)' }}
                                />
                                <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Meta</span>
                              </div>
                              <div className="flex w-9 flex-col items-center gap-1 sm:w-10">
                                <span className="text-[10px] font-semibold text-cyan-200">{formatPercentPrecise(row.realBarPercent)}</span>
                                <div
                                  className="w-full rounded-t-md bg-cyan-400/80"
                                  style={{ height: `${realHeight}px`, maxHeight: 'clamp(120px,22vw,156px)' }}
                                />
                                <span className="text-[10px] uppercase tracking-[0.12em] text-cyan-200">Real</span>
                              </div>
                            </div>
                            <div className="h-8 w-full px-1">
                              <p
                                title={row.indicator}
                                className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-slate-200"
                              >
                                {row.indicator}
                              </p>
                            </div>
                            <div className="h-4 w-full px-1">
                              <p
                                title={row.area}
                                className="truncate text-center text-[10px] uppercase tracking-[0.08em] text-slate-400"
                              >
                                {row.area}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-4 rounded-2xl border border-slate-800/80 bg-slate-900/55 p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-100">Top Eficiencia Jefes</h3>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">Este periodo</span>
              </div>

              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={14} className="animate-spin" /> Cargando...</div>
              ) : !topChiefs.length ? (
                <p className="text-sm text-slate-400">No hay jefes con datos suficientes.</p>
              ) : (
                <div className="space-y-3">
                  {topChiefs.map((chief) => (
                    <div key={chief.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <p className="truncate font-semibold text-slate-100">{chief.name}</p>
                        <span className="text-cyan-200">{formatPercent(chief.efficiency)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800/70">
                        <div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${clampPercent(chief.efficiency)}%` }} />
                      </div>
                      <p className="text-[11px] text-slate-400">{Math.round(chief.completed)}/{Math.round(chief.goal)} · {pluralize(chief.monitorings, 'monitoreo', 'monitoreos')}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="xl:col-span-8 rounded-2xl border border-slate-800/80 bg-slate-900/55 p-0">
              <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-4 md:px-5">
                <h3 className="text-sm font-semibold text-slate-100">Actividad de Monitoreo Detallada</h3>
                <span className="text-[11px] text-slate-400">{pluralize(detailedRows.length, 'registro', 'registros')}</span>
              </div>
              {isLoading ? (
                <div className="px-4 py-4 text-sm text-slate-300"><Loader2 size={14} className="mr-2 inline animate-spin" />Cargando actividad...</div>
              ) : !detailedRows.length ? (
                <p className="px-4 py-4 text-sm text-slate-400">Sin actividad para el filtro aplicado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        <th className="px-4 py-3">Nombre del monitoreo</th>
                        <th className="px-4 py-3">Monitor responsable</th>
                        <th className="px-4 py-3">Area</th>
                        <th className="px-4 py-3">Ultima actualización</th>
                        <th className="px-4 py-3">Progreso/Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailedRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-800/60 hover:bg-slate-900/60">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-100">{row.title}</p>
                            <p className="text-[11px] text-slate-400">Ref: #{String(row.id).slice(0, 8).toUpperCase()}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-200">{row.responsibleName}</td>
                          <td className="px-4 py-3 text-slate-200">{row.area}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDateTime(row.lastUpdate)}</td>
                          <td className="px-4 py-3">
                            <div className="w-36">
                              <div className="mb-1 flex justify-between text-[11px] text-slate-300">
                                <span>{formatPercent(row.progress)}</span>
                                <span>{row.completed}/{row.goal}</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                                <div className={`h-full rounded-full ${row.progress >= 80 ? 'bg-emerald-400/80' : row.progress >= 50 ? 'bg-cyan-400/80' : 'bg-amber-400/80'}`} style={{ width: `${clampPercent(row.progress)}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/55 p-4 md:p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-100">
                <AlertTriangle size={14} className="text-amber-300" /> Alta Prioridad
              </h3>
              {!highPriorityRows.length ? (
                <p className="text-sm text-slate-400">No hay alertas críticas en este momento.</p>
              ) : (
                <div className="space-y-3">
                  {highPriorityRows.map((row) => (
                    <div key={`priority-${row.id}`} className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-rose-100">{row.title}</p>
                        <span className="rounded-full border border-rose-400/40 px-2 py-0.5 text-[10px] text-rose-100">{formatPercent(row.progress)}</span>
                      </div>
                      <p className="mt-1 text-xs text-rose-100/80">{row.area} · Vence: {formatDateTime(row.endAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="rounded-2xl border border-slate-800/80 bg-slate-900/55 p-4 md:p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-100">
                <ClipboardList size={14} className="text-cyan-300" /> Tareas Pendientes
              </h3>
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-2 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2.5">
                    {task.id === 'none' ? (
                      <CheckCircle2 size={14} className="mt-0.5 text-emerald-300" />
                    ) : (
                      <TrendingDown size={14} className="mt-0.5 text-amber-300" />
                    )}
                    <div>
                      <p className="text-sm text-slate-100">{task.text}</p>
                      <p className="text-xs text-slate-400">{task.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2 text-xs text-slate-400">
                <TrendingUp size={13} className="text-cyan-300" />
                Seguimiento continuo en tiempo real
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
