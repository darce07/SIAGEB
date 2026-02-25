import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Input from '../components/ui/Input.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import Select from '../components/ui/Select.jsx';
import { supabase } from '../lib/supabase.js';

const getLocalJson = (key, fallback = {}) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const EVENT_EMPTY = {
  id: null,
  title: '',
  eventType: 'monitoring',
  description: '',
  startAt: '',
  endAt: '',
  status: 'active',
  responsibles: [],
  objectives: [{ text: '', completed: false }],
};

const SPECIALIST_ROLES = ['user', 'especialista'];
const OBJECTIVE_TEXT_CANDIDATES = ['objective_text', 'text', 'description', 'label', 'objective'];
const OBJECTIVE_ORDER_CANDIDATES = ['order_index', 'order', 'position', null];
const LEVEL_VARIANTS = {
  initial: ['initial', 'inicial'],
  primary: ['primary', 'primaria'],
  secondary: ['secondary', 'secundaria'],
};
const MODALITY_VARIANTS = {
  ebr: ['ebr', 'EBR'],
  ebe: ['ebe', 'EBE'],
};

const normalizeLevelValue = (value) => {
  const raw = String(value || '').toLowerCase();
  if (LEVEL_VARIANTS.initial.includes(raw)) return 'initial';
  if (LEVEL_VARIANTS.primary.includes(raw)) return 'primary';
  if (LEVEL_VARIANTS.secondary.includes(raw)) return 'secondary';
  return 'initial';
};

const normalizeModalityValue = (value) => {
  const raw = String(value || '').toLowerCase();
  if (MODALITY_VARIANTS.ebe.includes(raw) || raw === 'ebe') return 'ebe';
  return 'ebr';
};

const toLegacyLevelValue = (value) => {
  const normalized = normalizeLevelValue(value);
  if (normalized === 'primary') return 'primaria';
  if (normalized === 'secondary') return 'secundaria';
  return 'inicial';
};

const getObjectiveText = (item) => {
  if (!item || typeof item !== 'object') return '';
  for (const key of OBJECTIVE_TEXT_CANDIDATES) {
    if (typeof item[key] === 'string') return item[key];
  }
  return '';
};

const mapTemplateAvailabilityToEventStatus = (availability) => {
  const status = availability?.status || 'active';
  if (status === 'closed') return 'closed';
  if (status === 'hidden') return 'hidden';
  return 'active';
};

const mapEventStatusToTemplateAvailability = (status) => {
  if (status === 'closed') return 'closed';
  if (status === 'hidden') return 'hidden';
  return 'active';
};

const normalizeDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

const toIsoDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

const statusFromEvent = (event) => {
  const now = new Date();
  const end = new Date(event.end_at);
  if (event.status === 'hidden') return 'hidden';
  if (event.status === 'closed') return 'closed';
  if (end < now) return 'expired';
  return 'active';
};

const eventTypeLabel = (value) => {
  if (['ugel_date', 'fecha_ugel', 'celebration', 'commemorative'].includes(String(value || '').toLowerCase())) {
    return 'Fecha UGEL';
  }
  return value === 'activity' ? 'Actividad' : 'Monitoreo';
};
const levelLabel = (value) =>
  ({ initial: 'Inicial', primary: 'Primaria', secondary: 'Secundaria' }[normalizeLevelValue(value)] || '-');
const modalityLabel = (value) => ({ ebr: 'EBR', ebe: 'EBE' }[normalizeModalityValue(value)] || '-');
const statusLabel = (value) =>
  ({ active: 'Activo', hidden: 'Oculto', closed: 'Cerrado', expired: 'Vencido' }[value] || 'Activo');

const statusBadgeClass = (value) => {
  if (value === 'expired') return 'border-amber-500/50 bg-amber-500/10 text-amber-200';
  if (value === 'hidden') return 'border-slate-600/80 bg-slate-700/40 text-slate-300';
  if (value === 'closed') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
};

const eventColorClass = (event) => {
  const status = statusFromEvent(event);
  if (status === 'hidden') return 'border-slate-600/80 bg-slate-700/60 text-slate-200';
  if (status === 'expired' || status === 'closed') return 'border-amber-500/60 bg-amber-500/20 text-amber-100';
  if (['ugel_date', 'fecha_ugel', 'celebration', 'commemorative'].includes(String(event.event_type || '').toLowerCase())) {
    return 'border-amber-500/50 bg-amber-500/20 text-amber-100';
  }
  if (event.event_type === 'activity') return 'border-cyan-500/50 bg-cyan-500/20 text-cyan-100';
  return 'border-violet-500/50 bg-violet-500/20 text-violet-100';
};

const getEventCategory = (event) => {
  const rawType = String(event?.event_type || '').toLowerCase().trim();
  if (['activity', 'actividad'].includes(rawType)) return 'activity';
  if (['ugel_date', 'celebration', 'commemorative', 'fecha_ugel', 'efemeride'].includes(rawType))
    return 'ugel';
  return 'monitoring';
};

const CATEGORY_DOT_STYLES = {
  monitoring: { label: 'Monitoreo', className: 'bg-violet-400 ring-violet-200/60' },
  activity: { label: 'Actividad', className: 'bg-cyan-400 ring-cyan-200/60' },
  ugel: { label: 'Fecha UGEL', className: 'bg-amber-400 ring-amber-200/60' },
};
const CATEGORY_EVENT_CARD_STYLES = {
  monitoring: {
    selected:
      'border-violet-400/70 bg-violet-500/15 text-violet-100 shadow-[0_8px_24px_-16px_rgba(139,92,246,0.9)]',
    idle: 'border-violet-500/35 bg-violet-500/10 text-slate-200 hover:border-violet-400/60',
  },
  activity: {
    selected:
      'border-cyan-400/70 bg-cyan-500/15 text-cyan-100 shadow-[0_8px_24px_-16px_rgba(34,211,238,0.9)]',
    idle: 'border-cyan-500/35 bg-cyan-500/10 text-slate-200 hover:border-cyan-400/60',
  },
  ugel: {
    selected:
      'border-amber-400/70 bg-amber-500/15 text-amber-100 shadow-[0_8px_24px_-16px_rgba(250,204,21,0.9)]',
    idle: 'border-amber-500/35 bg-amber-500/10 text-slate-200 hover:border-amber-400/60',
  },
};

const truncateLabel = (value, maxChars = 70) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
};

const normalizeTitle = (value) => String(value || '').trim().toLowerCase();

const startOfMonth = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfMonth = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfWeek = (date) => {
  const d = normalizeDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const addDays = (date, count) => {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
};

const isSameDay = (left, right) => normalizeDay(left).getTime() === normalizeDay(right).getTime();
const isInRange = (day, start, end) =>
  normalizeDay(day) >= normalizeDay(start) && normalizeDay(day) <= normalizeDay(end);

const buildCalendarDays = (anchorDate) => {
  const monthStart = startOfMonth(anchorDate);
  const monthEnd = endOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  const days = [];
  let cursor = gridStart;
  while (days.length < 42) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
    if (cursor > monthEnd && cursor.getDay() === 1 && days.length >= 35) break;
  }
  return days;
};

export default function MonitoreoSeguimiento() {
  const auth = useMemo(() => getLocalJson('monitoreoAuth', {}), []);
  const profile = useMemo(() => getLocalJson('monitoreoProfile', {}), []);
  const isAdmin = auth?.role === 'admin';
  const currentUserId = profile?.id || '';

  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [currentDate, setCurrentDate] = useState(() => normalizeDay(new Date()));
  const [scopeFilter, setScopeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDrafts, setShowDrafts] = useState(false);
  const [isCalendarHighContrast, setIsCalendarHighContrast] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState(() => normalizeDay(new Date()).toISOString());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [eventForm, setEventForm] = useState(EVENT_EMPTY);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [objectiveTextColumn, setObjectiveTextColumn] = useState('objective_text');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: templatesData, error: templatesError } = await supabase
        .from('monitoring_templates')
        .select('id,title,description,status,availability,created_by,created_at,updated_at')
        .order('updated_at', { ascending: false });
      if (templatesError) {
        setError(`No se pudieron cargar monitoreos base: ${templatesError.message}`);
      }

      const eventsQuery = supabase
        .from('monitoring_events')
        .select(
          `
          id,title,event_type,description,start_at,end_at,status,created_by,created_at,updated_at,
          monitoring_event_responsibles(
            id,user_id,level,modality,course
          ),
          monitoring_event_objectives(*)
        `,
        )
        .order('start_at', { ascending: true });

      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id,first_name,last_name,full_name,email,role,status')
        .eq('status', 'active')
        .in('role', SPECIALIST_ROLES)
        .order('full_name', { ascending: true });
      if (usersError) {
        setError(`No se pudo cargar especialistas: ${usersError.message}`);
      } else {
        setUsers(usersData || []);
      }

      const { data: eventsData, error: eventsError } = await eventsQuery;
      if (eventsError) {
        setError((prev) =>
          prev
            ? `${prev} | No se pudo cargar seguimiento: ${eventsError.message}`
            : `No se pudo cargar seguimiento: ${eventsError.message}`,
        );
      }

      const templateById = new Map((templatesData || []).map((item) => [item.id, item]));
      const publishedTemplateTitles = new Set(
        (templatesData || [])
          .filter((item) => item.status === 'published')
          .map((item) => normalizeTitle(item.title)),
      );
      const draftTemplateTitles = new Set(
        (templatesData || [])
          .filter((item) => item.status !== 'published')
          .map((item) => normalizeTitle(item.title)),
      );
      const normalizedEvents = (eventsData || []).filter((item) => {
        const sourceTemplate = templateById.get(item.id);
        if (sourceTemplate) {
          const isPublished = sourceTemplate.status === 'published';
          return isPublished || (isAdmin && showDrafts);
        }

        if (item.event_type !== 'monitoring') return true;
        if (isAdmin && showDrafts) return true;
        const titleKey = normalizeTitle(item.title);
        if (publishedTemplateTitles.has(titleKey)) return true;
        if (draftTemplateTitles.has(titleKey)) return false;
        // Standalone seguimiento events (without matching template title) stay visible.
        return true;
      });
      const existingIds = new Set(normalizedEvents.map((item) => item.id));
      const syntheticTemplateEvents = (templatesData || [])
        .filter((template) => {
          const startAt = template?.availability?.startAt;
          const endAt = template?.availability?.endAt;
          const isPublished = template.status === 'published';
          const canShow = isPublished || (isAdmin && showDrafts);
          return startAt && endAt && !existingIds.has(template.id) && canShow;
        })
        .map((template) => ({
          id: template.id,
          title: template.title,
          event_type: 'monitoring',
          description: template.description || '',
          start_at: template.availability.startAt,
          end_at: template.availability.endAt,
          status: mapTemplateAvailabilityToEventStatus(template.availability),
          created_by: template.created_by || null,
          created_at: template.created_at,
          updated_at: template.updated_at,
          monitoring_event_responsibles: [],
          monitoring_event_objectives: [],
        }));

      const mergedEvents = [...normalizedEvents, ...syntheticTemplateEvents].sort(
        (left, right) => new Date(left.start_at) - new Date(right.start_at),
      );

      const firstObjective = mergedEvents
        .flatMap((item) => item.monitoring_event_objectives || [])
        .find((item) => item && typeof item === 'object');
      if (firstObjective) {
        const foundColumn = OBJECTIVE_TEXT_CANDIDATES.find((key) =>
          Object.prototype.hasOwnProperty.call(firstObjective, key),
        );
        if (foundColumn) setObjectiveTextColumn(foundColumn);
      }

      setEvents(mergedEvents);
      if (!selectedEventId && mergedEvents.length) setSelectedEventId(mergedEvents[0].id);
    } catch (fetchError) {
      setError(`No se pudo cargar seguimiento: ${fetchError.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDrafts]);

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((user) => map.set(user.id, user));
    return map;
  }, [users]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      const eventStatus = statusFromEvent(event);
      if (!isAdmin && event.status === 'hidden') return false;

      if (scopeFilter === 'mine') {
        const isMine =
          event.created_by === currentUserId ||
          (event.monitoring_event_responsibles || []).some(
            (responsible) => responsible.user_id === currentUserId,
          );
        if (!isMine) return false;
      }

      if (levelFilter !== 'all') {
        const hasLevel = (event.monitoring_event_responsibles || []).some(
          (responsible) => normalizeLevelValue(responsible.level) === levelFilter,
        );
        if (!hasLevel) return false;
      }

      if (modalityFilter !== 'all') {
        const hasModality = (event.monitoring_event_responsibles || []).some(
          (responsible) => normalizeModalityValue(responsible.modality) === modalityFilter,
        );
        if (!hasModality) return false;
      }

      if (statusFilter !== 'all' && eventStatus !== statusFilter) return false;
      return true;
    });
  }, [events, scopeFilter, levelFilter, modalityFilter, statusFilter, isAdmin, currentUserId]);

  const miniCalendarDays = useMemo(() => buildCalendarDays(currentDate), [currentDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    miniCalendarDays.forEach((day) => {
      const key = normalizeDay(day).toISOString();
      map.set(
        key,
        visibleEvents.filter((event) =>
          isInRange(day, new Date(event.start_at), new Date(event.end_at)),
        ),
      );
    });
    return map;
  }, [miniCalendarDays, visibleEvents]);

  const selectedDay = useMemo(() => {
    if (selectedDayKey) return new Date(selectedDayKey);
    return normalizeDay(currentDate);
  }, [selectedDayKey, currentDate]);

  const selectedDayEvents = useMemo(() => {
    const key = normalizeDay(selectedDay).toISOString();
    const byMap = eventsByDay.get(key);
    if (byMap) return byMap;
    return visibleEvents.filter((event) =>
      isInRange(selectedDay, new Date(event.start_at), new Date(event.end_at)),
    );
  }, [selectedDay, eventsByDay, visibleEvents]);

  const selectedDayEvent = useMemo(() => {
    if (!selectedDayEvents.length) return null;
    const found = selectedDayEvents.find((item) => item.id === selectedEventId);
    return found || selectedDayEvents[0];
  }, [selectedDayEvents, selectedEventId]);

  const navigateCalendar = (direction) => {
    const base = new Date(currentDate);
    base.setMonth(base.getMonth() + direction);
    setCurrentDate(normalizeDay(base));
  };

  useEffect(() => {
    if (!selectedDayKey) {
      setSelectedDayKey(normalizeDay(currentDate).toISOString());
    }
  }, [currentDate, selectedDayKey]);

  useEffect(() => {
    const currentKey = selectedDayKey || normalizeDay(currentDate).toISOString();
    const currentDayEvents = eventsByDay.get(currentKey) || [];

    if (currentDayEvents.length > 0) {
      if (!currentDayEvents.some((event) => event.id === selectedEventId)) {
        setSelectedEventId(currentDayEvents[0].id);
      }
      return;
    }

    const firstCurrentMonthDay = miniCalendarDays.find((day) => {
      if (day.getMonth() !== currentDate.getMonth()) return false;
      const key = normalizeDay(day).toISOString();
      return (eventsByDay.get(key) || []).length > 0;
    });

    const fallbackDay =
      firstCurrentMonthDay ||
      miniCalendarDays.find((day) => {
        const key = normalizeDay(day).toISOString();
        return (eventsByDay.get(key) || []).length > 0;
      });

    if (!fallbackDay) {
      if (selectedEventId) setSelectedEventId('');
      return;
    }

    const fallbackKey = normalizeDay(fallbackDay).toISOString();
    const fallbackEvents = eventsByDay.get(fallbackKey) || [];
    setSelectedDayKey(fallbackKey);
    setSelectedEventId(fallbackEvents[0]?.id || '');
  }, [eventsByDay, miniCalendarDays, selectedDayKey, selectedEventId, currentDate]);

  const openCreateModal = () => {
    setError('');
    setSuccess('');
    setEventForm(EVENT_EMPTY);
    setIsModalOpen(true);
  };

  const openEditModal = (event) => {
    const responsibles = (event.monitoring_event_responsibles || []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      level: normalizeLevelValue(item.level),
      modality: normalizeModalityValue(item.modality),
      course: item.course || '',
    }));
    const objectives = (event.monitoring_event_objectives || [])
      .sort((a, b) => (a.order_index ?? a.order ?? 0) - (b.order_index ?? b.order ?? 0))
      .map((item) => ({ id: item.id, text: getObjectiveText(item), completed: !!item.completed }));

    setEventForm({
      id: event.id,
      title: event.title || '',
      eventType: event.event_type || 'monitoring',
      description: event.description || '',
      startAt: toDateInputValue(event.start_at),
      endAt: toDateInputValue(event.end_at),
      status: event.status || 'active',
      responsibles: responsibles.length ? responsibles : [],
      objectives: objectives.length ? objectives : [{ text: '', completed: false }],
    });
    setIsModalOpen(true);
  };

  const addResponsibleRow = () => {
    setEventForm((prev) => ({
      ...prev,
      responsibles: [
        ...prev.responsibles,
        { id: undefined, userId: '', level: 'initial', modality: 'ebr', course: '' },
      ],
    }));
  };

  const updateResponsible = (index, field, value) => {
    setEventForm((prev) => {
      const next = [...prev.responsibles];
      const row = { ...next[index], [field]: value };
      if (field === 'level' && value === 'initial') row.course = '';
      next[index] = row;
      return { ...prev, responsibles: next };
    });
  };

  const removeResponsible = (index) => {
    setEventForm((prev) => ({
      ...prev,
      responsibles: prev.responsibles.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addObjective = () => {
    setEventForm((prev) => ({
      ...prev,
      objectives: [...prev.objectives, { text: '', completed: false }],
    }));
  };

  const updateObjective = (index, field, value) => {
    setEventForm((prev) => {
      const next = [...prev.objectives];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, objectives: next };
    });
  };

  const removeObjective = (index) => {
    setEventForm((prev) => ({
      ...prev,
      objectives:
        prev.objectives.length <= 1
          ? [{ text: '', completed: false }]
          : prev.objectives.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const saveEvent = async () => {
    setError('');
    setSuccess('');
    if (!eventForm.title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    if (!eventForm.startAt || !eventForm.endAt) {
      setError('Debes definir fecha de inicio y vencimiento.');
      return;
    }
    const startAt = toIsoDate(eventForm.startAt);
    const endAt = toIsoDate(eventForm.endAt);
    if (!startAt || !endAt || new Date(endAt) < new Date(startAt)) {
      setError('Las fechas del evento no son válidas.');
      return;
    }
    if (!eventForm.responsibles.length) {
      setError('Agrega al menos un especialista responsable.');
      return;
    }
    if (
      eventForm.responsibles.some(
        (item) => !item.userId || !item.level || !item.modality || (item.level !== 'initial' && !item.course.trim()),
      )
    ) {
      setError('Completa todos los datos de responsables.');
      return;
    }
    const responsibleIds = eventForm.responsibles.map((item) => item.userId);
    if (new Set(responsibleIds).size !== responsibleIds.length) {
      setError('No puedes repetir el mismo especialista en un evento.');
      return;
    }

    setIsSaving(true);
    try {
      let eventId = eventForm.id;
      const basePayload = {
        title: eventForm.title.trim(),
        event_type: eventForm.eventType,
        description: eventForm.description.trim() || null,
        start_at: startAt,
        end_at: endAt,
        status: eventForm.status,
      };

      // Upsert prevents losing edits when the card comes from template-sync and has no row yet.
      const eventPayload = {
        ...basePayload,
        ...(eventId ? { id: eventId } : {}),
        created_by: currentUserId || null,
      };
      const { data: upsertedEvent, error: upsertEventError } = await supabase
        .from('monitoring_events')
        .upsert(eventPayload, { onConflict: 'id' })
        .select('id')
        .single();
      if (upsertEventError) throw upsertEventError;
      eventId = upsertedEvent.id;

      if (eventForm.eventType === 'monitoring') {
        const { data: existingTemplate, error: existingTemplateError } = await supabase
          .from('monitoring_templates')
          .select('id,status,description,levels_config,sections,availability,created_by,created_at')
          .eq('id', eventId)
          .maybeSingle();
        if (existingTemplateError) throw existingTemplateError;

        const templatePayload = {
          id: eventId,
          title: eventForm.title.trim(),
          description: eventForm.description.trim() || existingTemplate?.description || null,
          status: existingTemplate?.status || 'draft',
          levels_config: existingTemplate?.levels_config || { type: 'standard', levels: [] },
          sections: existingTemplate?.sections || [],
          availability: {
            ...(existingTemplate?.availability || {}),
            status: mapEventStatusToTemplateAvailability(eventForm.status),
            startAt,
            endAt,
          },
          created_by:
            existingTemplate?.created_by ||
            auth?.email ||
            auth?.docNumber ||
            null,
          created_at: existingTemplate?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: upsertTemplateError } = await supabase
          .from('monitoring_templates')
          .upsert(templatePayload, { onConflict: 'id' });
        if (upsertTemplateError) throw upsertTemplateError;
      }

      const { error: clearResponsiblesError } = await supabase
        .from('monitoring_event_responsibles')
        .delete()
        .eq('event_id', eventId);
      if (clearResponsiblesError) throw clearResponsiblesError;

      const buildResponsiblesPayload = (useLegacyLevel = false) =>
        eventForm.responsibles.map((item) => ({
          event_id: eventId,
          user_id: item.userId,
          level: useLegacyLevel ? toLegacyLevelValue(item.level) : normalizeLevelValue(item.level),
          modality: normalizeModalityValue(item.modality),
          course: normalizeLevelValue(item.level) === 'initial' ? null : item.course.trim(),
        }));

      let responsiblesPayload = buildResponsiblesPayload(false);
      let { error: insertResponsiblesError } = await supabase
        .from('monitoring_event_responsibles')
        .insert(responsiblesPayload);

      if (
        insertResponsiblesError &&
        /monitoring_event_responsibles_level_check/i.test(insertResponsiblesError.message || '')
      ) {
        responsiblesPayload = buildResponsiblesPayload(true);
        const retry = await supabase
          .from('monitoring_event_responsibles')
          .insert(responsiblesPayload);
        insertResponsiblesError = retry.error || null;
      }

      if (insertResponsiblesError) throw insertResponsiblesError;

      const { error: clearObjectivesError } = await supabase
        .from('monitoring_event_objectives')
        .delete()
        .eq('event_id', eventId);
      if (clearObjectivesError) throw clearObjectivesError;

      const objectiveRows = eventForm.objectives.filter((item) => item.text.trim());
      if (objectiveRows.length) {
        const objectiveColumnsToTry = [
          objectiveTextColumn,
          ...OBJECTIVE_TEXT_CANDIDATES.filter((column) => column !== objectiveTextColumn),
        ];

        let insertObjectivesError = null;
        let inserted = false;

        for (const column of objectiveColumnsToTry) {
          for (const orderColumn of OBJECTIVE_ORDER_CANDIDATES) {
            const payload = objectiveRows.map((item, index) => {
              const row = {
                event_id: eventId,
                [column]: item.text.trim(),
                completed: Boolean(item.completed),
              };
              if (orderColumn) {
                row[orderColumn] = index;
              }
              return row;
            });

            const tryInsert = await supabase
              .from('monitoring_event_objectives')
              .insert(payload);

            insertObjectivesError = tryInsert.error || null;
            if (!insertObjectivesError) {
              inserted = true;
              setObjectiveTextColumn(column);
              break;
            }
          }

          if (inserted) break;

          const fallbackWithoutOrderPayload = objectiveRows.map((item) => ({
            event_id: eventId,
            [column]: item.text.trim(),
            completed: Boolean(item.completed),
          }));
          const fallbackWithoutOrderInsert = await supabase
            .from('monitoring_event_objectives')
            .insert(fallbackWithoutOrderPayload);

          insertObjectivesError = fallbackWithoutOrderInsert.error || null;
          if (!insertObjectivesError) {
            inserted = true;
            setObjectiveTextColumn(column);
            break;
          }
        }

        if (!inserted && insertObjectivesError) {
          // Last fallback for legacy schemas where the text field is literally `text`
          const legacyPayload = objectiveRows.map((item) => ({
              event_id: eventId,
              text: item.text.trim(),
              completed: Boolean(item.completed),
          }));
          const legacyInsert = await supabase.from('monitoring_event_objectives').insert(legacyPayload);
          insertObjectivesError = legacyInsert.error || null;
          if (!insertObjectivesError) {
            inserted = true;
            setObjectiveTextColumn('text');
          }
        }

        if (!inserted && insertObjectivesError) {
          throw insertObjectivesError;
        }
      }

      setIsModalOpen(false);
      setSuccess(eventForm.id ? 'Evento actualizado correctamente.' : 'Evento creado correctamente.');
      await loadData();
      setSelectedEventId(eventId);
    } catch (saveError) {
      setError(`No se pudo guardar: ${saveError.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const targetId = deleteTarget.id;

      // Keep monitoring list and calendar in sync by removing linked rows.
      const relationTables = ['monitoring_event_responsibles', 'monitoring_event_objectives'];
      for (const tableName of relationTables) {
        const { error: relationError } = await supabase
          .from(tableName)
          .delete()
          .eq('event_id', targetId);
        if (relationError) throw relationError;
      }

      const { error: deleteError } = await supabase
        .from('monitoring_events')
        .delete()
        .eq('id', targetId);
      if (deleteError) throw deleteError;

      const { error: deleteTemplateError } = await supabase
        .from('monitoring_templates')
        .delete()
        .eq('id', targetId);
      if (deleteTemplateError) throw deleteTemplateError;

      setDeleteTarget(null);
      setSuccess('Evento eliminado correctamente.');
      if (selectedEventId === targetId) setSelectedEventId('');
      await loadData();
    } catch (deleteError) {
      setError(`No se pudo eliminar: ${deleteError.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleVisibility = async (event) => {
    const nextStatus = event.status === 'hidden' ? 'active' : 'hidden';
    const { error: updateError } = await supabase
      .from('monitoring_events')
      .update({ status: nextStatus })
      .eq('id', event.id);
    if (updateError) {
      setError(`No se pudo actualizar estado: ${updateError.message}`);
      return;
    }
    await loadData();
    setSelectedEventId(event.id);
  };

  const toggleObjective = async (objective) => {
    if (!isAdmin) return;
    const { error: updateError } = await supabase
      .from('monitoring_event_objectives')
      .update({ completed: !objective.completed })
      .eq('id', objective.id);
    if (updateError) {
      setError(`No se pudo actualizar objetivo: ${updateError.message}`);
      return;
    }
    await loadData();
    setSelectedEventId(selectedEventId);
  };

  const objectiveProgress = useMemo(() => {
    if (!selectedDayEvent?.monitoring_event_objectives?.length) return 0;
    const completed = selectedDayEvent.monitoring_event_objectives.filter((item) => item.completed).length;
    return Math.round((completed / selectedDayEvent.monitoring_event_objectives.length) * 100);
  }, [selectedDayEvent]);

  const selectedDayCategoryCounts = useMemo(() => {
    const counts = { monitoring: 0, activity: 0, ugel: 0 };
    selectedDayEvents.forEach((event) => {
      const category = getEventCategory(event);
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  }, [selectedDayEvents]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 rounded-[18px] border border-white/10 bg-white/5 p-4 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.65)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            eyebrow="Seguimiento"
            title="Seguimiento"
            description="Visualiza actividades y vencimientos."
            size="page"
          />
          {isAdmin ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 text-[14px] font-medium text-emerald-100 transition hover:border-emerald-400/70"
            >
              <Plus size={15} />
              Agregar monitoreo/actividad
            </button>
          ) : null}
        </div>

      </Card>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-300">{success}</p> : null}

      <Card className="w-full max-w-[980px] rounded-[18px] border border-white/10 bg-white/5 p-2.5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.65)]">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <Select compact hideLabel id="scopeFilterLeft" label="Vista" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="mine">Solo míos</option>
            </Select>
            <Select compact hideLabel id="statusFilterLeft" label="Estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="active">Activo</option>
              <option value="hidden">Oculto</option>
              <option value="expired">Vencido</option>
              <option value="closed">Cerrado</option>
            </Select>
            <Select compact hideLabel id="levelFilterLeft" label="Nivel" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="initial">Inicial</option>
              <option value="primary">Primaria</option>
              <option value="secondary">Secundaria</option>
            </Select>
            <Select compact hideLabel id="modalityFilterLeft" label="Modalidad" value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)}>
              <option value="all">Todas</option>
              <option value="ebr">EBR</option>
              <option value="ebe">EBE</option>
            </Select>
            {isAdmin ? (
              <label className="inline-flex h-9 items-center gap-2 self-end rounded-xl border border-slate-700/60 px-2.5 text-[12px] leading-[1.4] text-slate-300">
                <input
                  type="checkbox"
                  checked={showDrafts}
                  onChange={(event) => setShowDrafts(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-500 bg-slate-900"
                />
                Ver borradores
              </label>
            ) : null}
        </div>
      </Card>

      {loading ? (
        <Card className="flex flex-col gap-4 rounded-[18px] border border-white/10 bg-white/5 p-4 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.65)]">
          <div className="flex items-center gap-2 text-sm text-cyan-200">
            <Loader2 size={16} className="animate-spin" />
            <p>Cargando seguimiento...</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full border border-slate-700/60 bg-slate-900/70">
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-cyan-400/70" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-xl border border-slate-800/70 bg-slate-900/45" />
            <div className="h-24 animate-pulse rounded-xl border border-slate-800/70 bg-slate-900/45" />
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="order-1 min-w-0 flex h-fit flex-col gap-3 rounded-[22px] border border-white/10 bg-white/5 p-4 shadow-[0_14px_36px_-20px_rgba(0,0,0,0.72)] lg:order-1">
          <div
            className={`rounded-[24px] border p-4 transition-all duration-300 ${
              isCalendarHighContrast
                ? 'border-slate-500/80 bg-slate-950/95 shadow-[0_12px_30px_-18px_rgba(2,6,23,0.95)]'
                : 'border-slate-800/60 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(56,189,248,0.10),transparent_56%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.82))]'
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                    isCalendarHighContrast
                      ? 'border-slate-500/80 bg-slate-900 text-cyan-200'
                      : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                  }`}
                >
                  <CalendarDays size={14} />
                </span>
                <p className="truncate text-[13px] font-semibold capitalize text-slate-100">
                  {currentDate.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsCalendarHighContrast((prev) => !prev)}
                  title={isCalendarHighContrast ? 'Desactivar alto contraste' : 'Activar alto contraste'}
                  className={`inline-flex h-8 items-center justify-center rounded-full border px-2.5 text-[10px] font-semibold transition-all duration-200 ${
                    isCalendarHighContrast
                      ? 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100'
                      : 'border-slate-700/70 bg-slate-900/70 text-slate-200 hover:border-cyan-400/55 hover:text-cyan-100'
                  }`}
                >
                  {isCalendarHighContrast ? 'AA' : 'Aa'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = normalizeDay(new Date());
                    const todayKey = today.toISOString();
                    const todayEvents = eventsByDay.get(todayKey) || [];
                    setCurrentDate(today);
                    setSelectedDayKey(todayKey);
                    setSelectedEventId(todayEvents.length ? todayEvents[0].id : '');
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition-all duration-200 hover:-translate-y-[1px] hover:border-cyan-400/55 hover:bg-slate-800/90 hover:text-cyan-100"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => navigateCalendar(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 text-slate-200 transition-all duration-200 hover:-translate-y-[1px] hover:border-cyan-400/55 hover:bg-slate-800/90 hover:text-cyan-100"
                  title="Mes anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => navigateCalendar(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 text-slate-200 transition-all duration-200 hover:-translate-y-[1px] hover:border-cyan-400/55 hover:bg-slate-800/90 hover:text-cyan-100"
                  title="Mes siguiente"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3.5 grid grid-cols-7 gap-2">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label) => (
                <span
                  key={`mini-w-${label}`}
                  className={`text-center text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    isCalendarHighContrast ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {miniCalendarDays.map((day) => {
                const dayKey = normalizeDay(day).toISOString();
                const dayEvents = eventsByDay.get(dayKey) || [];
                const isMiniToday = isSameDay(day, new Date());
                const isMiniSelected = selectedDayKey === dayKey;
                const isMiniCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isMiniWeekend = day.getDay() === 0 || day.getDay() === 6;
                const dayCategories = Array.from(
                  new Set(dayEvents.map((event) => getEventCategory(event)).filter(Boolean)),
                ).slice(0, 3);
                const dayTooltip = dayCategories
                  .map((category) => CATEGORY_DOT_STYLES[category]?.label)
                  .filter(Boolean)
                  .join(' / ');
                const dayLabel = day.toLocaleDateString('es-PE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });

                return (
                  <button
                    key={`mini-${dayKey}`}
                    type="button"
                    onClick={() => {
                      if (!isMiniCurrentMonth) {
                        setCurrentDate(startOfMonth(day));
                      } else {
                        setCurrentDate(normalizeDay(day));
                      }
                      setSelectedDayKey(dayKey);
                      setSelectedEventId(dayEvents.length ? dayEvents[0].id : '');
                    }}
                    aria-label={`${dayLabel}. ${dayEvents.length} evento${dayEvents.length === 1 ? '' : 's'}.`}
                    title={dayTooltip || dayLabel}
                    className={`relative inline-flex h-11 items-center justify-center rounded-full border text-[12px] font-semibold transition-all duration-200 ease-out ${
                      isCalendarHighContrast
                        ? isMiniSelected
                          ? 'border-cyan-200 bg-cyan-300 text-slate-950 shadow-[0_10px_24px_-14px_rgba(56,189,248,0.9)]'
                          : isMiniToday
                            ? 'border-emerald-200 bg-emerald-300 text-slate-950'
                            : isMiniCurrentMonth
                              ? 'border-slate-500/80 bg-slate-950 text-slate-100 hover:-translate-y-[1px] hover:border-cyan-300'
                              : 'border-slate-800 bg-slate-950/70 text-slate-500'
                        : isMiniSelected
                          ? 'border-cyan-300/80 bg-gradient-to-r from-cyan-400/30 via-sky-400/20 to-indigo-500/25 text-slate-50 shadow-[0_12px_24px_-16px_rgba(56,189,248,0.95),inset_0_1px_0_rgba(186,230,253,0.45)]'
                          : isMiniToday
                            ? 'border-emerald-400/55 bg-emerald-500/15 text-emerald-100'
                            : isMiniCurrentMonth
                              ? `border-slate-800/80 ${
                                  isMiniWeekend
                                    ? 'bg-slate-900/70 text-slate-300'
                                    : 'bg-slate-900/48 text-slate-200'
                                } shadow-[inset_0_1px_0_rgba(148,163,184,0.10)] hover:-translate-y-[1px] hover:border-cyan-400/45 hover:bg-slate-800/85 hover:text-slate-100`
                              : 'border-slate-900/70 bg-slate-950/40 text-slate-500 hover:border-slate-700/70 hover:bg-slate-900/55'
                    }`}
                  >
                    {day.getDate()}
                    {dayCategories.length ? (
                      <span className="absolute bottom-[4px] left-1/2 flex -translate-x-1/2 items-center gap-1">
                        {dayCategories.map((category) => (
                          <span
                            key={`${dayKey}-${category}`}
                            className={`h-1.5 w-1.5 rounded-full ring-1 ${
                              isCalendarHighContrast ? 'ring-slate-900/90' : 'ring-slate-300/50'
                            } ${CATEGORY_DOT_STYLES[category]?.className || 'bg-slate-400'}`}
                          />
                        ))}
                      </span>
                    ) : null}
                    {dayEvents.length > 1 ? (
                      <span
                        className={`absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full border px-1 text-[9px] font-semibold leading-4 ${
                          isCalendarHighContrast
                            ? 'border-cyan-300/70 bg-cyan-200 text-slate-950'
                            : 'border-cyan-400/30 bg-slate-950/95 text-cyan-100 shadow-[0_0_0_1px_rgba(15,23,42,0.65)]'
                        }`}
                      >
                        {dayEvents.length > 9 ? '+9' : dayEvents.length}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-300">
              {Object.entries(CATEGORY_DOT_STYLES).map(([key, item]) => (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                    isCalendarHighContrast
                      ? 'border-slate-600/90 bg-slate-950 text-slate-100'
                      : 'border-slate-700/70 bg-slate-900/75 shadow-[inset_0_1px_0_rgba(148,163,184,0.12)]'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ring-1 ring-offset-1 ring-offset-slate-900 ${item.className}`}
                  />
                  {item.label}
                </span>
              ))}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                  isCalendarHighContrast
                    ? 'border-cyan-300/70 bg-cyan-500/25 text-cyan-100'
                    : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100/90'
                }`}
              >
                <span
                  className={`inline-flex min-w-[16px] items-center justify-center rounded-full border px-1 py-0.5 text-[9px] font-semibold leading-none ${
                    isCalendarHighContrast
                      ? 'border-cyan-300/70 bg-cyan-100 text-slate-950'
                      : 'border-cyan-400/30 bg-slate-950/95 text-cyan-100'
                  }`}
                >
                  {selectedDayEvents.length > 9 ? '+9' : selectedDayEvents.length}
                </span>
                Eventos del día
              </span>
            </div>
          </div>
        </Card>

        <Card className="order-2 min-w-0 flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto rounded-[18px] border border-white/10 bg-white/5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.65)] lg:order-2 lg:sticky lg:top-6">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-cyan-300" />
            <p className="text-sm font-semibold text-slate-100">Detalle del evento</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_DOT_STYLES).map(([key, item]) =>
              selectedDayCategoryCounts[key] > 0 ? (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-200"
                >
                  <span
                    className={`h-2 w-2 rounded-full ring-1 ring-offset-1 ring-offset-slate-900 ${item.className}`}
                  />
                  {item.label}: {selectedDayCategoryCounts[key]}
                </span>
              ) : null,
            )}
          </div>

          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-slate-400">Sin eventos para esta fecha.</p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Eventos del día ({selectedDayEvents.length})
                </p>
                <div className="mt-2 space-y-2">
                  {selectedDayEvents.map((event) => {
                    const category = getEventCategory(event);
                    const palette =
                      CATEGORY_EVENT_CARD_STYLES[category] || CATEGORY_EVENT_CARD_STYLES.monitoring;
                    const isSelectedEvent = selectedDayEvent?.id === event.id;
                    return (
                      <button
                        key={`detail-list-${event.id}`}
                        type="button"
                        onClick={() => setSelectedEventId(event.id)}
                        aria-pressed={isSelectedEvent}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-[13px] leading-[1.45] transition-all duration-200 ${
                          isSelectedEvent ? palette.selected : palette.idle
                        }`}
                      >
                        <p title={event.title} className="truncate font-semibold">
                          {truncateLabel(event.title, 70)}
                        </p>
                        <p className="mt-1 text-[11px] opacity-70">
                          {new Date(event.start_at).toLocaleDateString()} - {new Date(event.end_at).toLocaleDateString()}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!selectedDayEvent ? null : (
              <div className="border-t border-slate-800/80 pt-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Detalle seleccionado</p>
                <p className="mt-1 text-[12px] text-slate-500">Ficha de solo lectura del evento elegido.</p>
              </div>
              )}

              {!selectedDayEvent ? null : (
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-3">
                <div className="overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/35">
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-slate-800/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Título</p>
                    <p title={selectedDayEvent.title} className="truncate text-sm font-semibold text-slate-100">
                      {truncateLabel(selectedDayEvent.title, 70)}
                    </p>
                  </div>
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-slate-800/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Tipo</p>
                    <p className="text-sm text-slate-200">{eventTypeLabel(selectedDayEvent.event_type)}</p>
                  </div>
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-slate-800/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Inicio</p>
                    <p className="text-sm text-slate-200">{new Date(selectedDayEvent.start_at).toLocaleString()}</p>
                  </div>
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-slate-800/70 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Fin</p>
                    <p className="text-sm text-slate-200">{new Date(selectedDayEvent.end_at).toLocaleString()}</p>
                  </div>
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Estado</p>
                    <div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(statusFromEvent(selectedDayEvent))}`}>
                        {statusLabel(statusFromEvent(selectedDayEvent))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {!selectedDayEvent ? null : (
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Responsables</p>
                <div className="mt-2 space-y-2">
                  {(selectedDayEvent.monitoring_event_responsibles || []).map((responsible) => {
                    const responsibleProfile = usersById.get(responsible.user_id);
                    const fullName =
                      responsibleProfile?.full_name ||
                      `${responsibleProfile?.first_name || ''} ${responsibleProfile?.last_name || ''}`.trim();
                    return (
                      <div key={responsible.id} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2">
                        <p className="text-sm text-slate-100">{fullName || 'Sin nombre'}</p>
                        <p className="text-xs text-slate-400">
                          {levelLabel(responsible.level)} | {modalityLabel(responsible.modality)}
                          {responsible.level !== 'initial' && responsible.course ? ` | Curso: ${responsible.course}` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {!selectedDayEvent ? null : (
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Objetivos</p>
                  <span className="text-xs text-slate-300">Avance {objectiveProgress}%</span>
                </div>
                <div className="mt-2 space-y-2">
                  {(selectedDayEvent.monitoring_event_objectives || []).length === 0 ? (
                    <p className="text-xs text-slate-500">Sin objetivos registrados.</p>
                  ) : (
                    selectedDayEvent.monitoring_event_objectives
                      .sort((a, b) => (a.order_index ?? a.order ?? 0) - (b.order_index ?? b.order ?? 0))
                      .map((objective) => (
                        <label key={objective.id} className="flex items-center gap-2 rounded-lg border border-slate-800/70 px-2 py-2 text-sm text-slate-200">
                          <input
                            type="checkbox"
                            checked={objective.completed}
                            disabled={!isAdmin}
                            onChange={() => toggleObjective(objective)}
                            className="h-4 w-4 rounded border-slate-500 bg-slate-900"
                          />
                          <span className={objective.completed ? 'line-through text-slate-400' : ''}>{getObjectiveText(objective)}</span>
                        </label>
                      ))
                  )}
                </div>
              </div>
              )}

              {isAdmin && selectedDayEvent ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedDayEvent)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    <Pencil size={14} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleVisibility(selectedDayEvent)}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/70"
                  >
                    {selectedDayEvent.status === 'hidden' ? <Eye size={14} /> : <EyeOff size={14} />}
                    {selectedDayEvent.status === 'hidden' ? 'Mostrar' : 'Ocultar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(selectedDayEvent)}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/70"
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                </div>
              ) : null}
            </>
          )}
        </Card>
        </div>
      )}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="m-4 max-h-[85vh] w-full max-w-[820px] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-[0_20px_70px_-30px_rgba(0,0,0,0.75)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-semibold text-slate-100">{eventForm.id ? 'Editar evento' : 'Nuevo evento'}</p>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-700/70 px-3 py-1 text-xs text-slate-300">Cerrar</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input id="eventTitle" label="Título / nombre" value={eventForm.title} onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título del monitoreo o actividad" />
              <Select id="eventType" label="Tipo" value={eventForm.eventType} onChange={(event) => setEventForm((prev) => ({ ...prev, eventType: event.target.value }))}>
                <option value="monitoring">Monitoreo</option>
                <option value="activity">Actividad</option>
                <option value="ugel_date">Fecha UGEL</option>
              </Select>
              <Input id="eventStart" label="Fecha inicio" type="datetime-local" value={eventForm.startAt} onChange={(event) => setEventForm((prev) => ({ ...prev, startAt: event.target.value }))} />
              <Input id="eventEnd" label="Fecha vencimiento" type="datetime-local" value={eventForm.endAt} onChange={(event) => setEventForm((prev) => ({ ...prev, endAt: event.target.value }))} />
              <Select id="eventStatus" label="Estado" value={eventForm.status} onChange={(event) => setEventForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="active">Activo</option>
                <option value="hidden">Oculto</option>
                <option value="closed">Cerrado</option>
              </Select>
              <label className="flex flex-col gap-2 text-sm text-slate-200 md:col-span-2">
                <span className="text-xs uppercase tracking-wide text-slate-400">Descripción</span>
                <textarea
                  rows={3}
                  value={eventForm.description}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </label>
            </div>

            <div className="mt-6 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-100">Responsables</p>
                <button type="button" onClick={addResponsibleRow} className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 px-3 py-2 text-xs text-slate-200"><Plus size={13} />Agregar responsable</button>
              </div>
              <div className="space-y-3">
                {eventForm.responsibles.map((item, index) => (
                  <div key={`${item.id || 'new'}-${index}`} className="grid gap-3 rounded-xl border border-slate-800/70 bg-slate-900/50 p-3 md:grid-cols-5">
                    <Select id={`responsible-${index}`} label="Especialista" value={item.userId} onChange={(event) => updateResponsible(index, 'userId', event.target.value)}>
                      <option value="">Seleccionar</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()}
                        </option>
                      ))}
                    </Select>
                    <Select id={`level-${index}`} label="Nivel" value={item.level} onChange={(event) => updateResponsible(index, 'level', event.target.value)}>
                      <option value="initial">Inicial</option>
                      <option value="primary">Primaria</option>
                      <option value="secondary">Secundaria</option>
                    </Select>
                    <Select id={`modality-${index}`} label="Modalidad" value={item.modality} onChange={(event) => updateResponsible(index, 'modality', event.target.value)}>
                      <option value="ebr">EBR</option>
                      <option value="ebe">EBE</option>
                    </Select>
                    <Input
                      id={`course-${index}`}
                      label="Curso a cargo"
                      value={item.course}
                      onChange={(event) => updateResponsible(index, 'course', event.target.value)}
                      disabled={item.level === 'initial'}
                      placeholder={item.level === 'initial' ? 'No aplica en Inicial' : 'Curso'}
                    />
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeResponsible(index)}
                        className="inline-flex w-full items-center justify-center rounded-xl border border-rose-500/35 px-3 py-2 text-xs font-semibold text-rose-200"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
                {users.length === 0 ? (
                  <p className="text-xs text-amber-300">
                    No hay especialistas activos para seleccionar. Crea o activa usuarios con rol Especialista.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-6 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-100">Objetivos / metas</p>
                <button type="button" onClick={addObjective} className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 px-3 py-2 text-xs text-slate-200"><Plus size={13} />Agregar objetivo</button>
              </div>
              <div className="space-y-2">
                {eventForm.objectives.map((objective, index) => (
                  <div key={`${objective.id || 'new'}-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <Input
                      id={`objective-${index}`}
                      label={`Objetivo ${index + 1}`}
                      value={objective.text}
                      onChange={(event) => updateObjective(index, 'text', event.target.value)}
                      placeholder="Describe el objetivo"
                    />
                    <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={objective.completed}
                        onChange={(event) => updateObjective(index, 'completed', event.target.checked)}
                        className="h-4 w-4 rounded border-slate-500 bg-slate-900"
                      />
                      Cumplido
                    </label>
                    <button
                      type="button"
                      onClick={() => removeObjective(index)}
                      className="mb-2 inline-flex h-10 items-center justify-center rounded-xl border border-rose-500/35 px-3 text-xs font-semibold text-rose-200"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl border border-slate-700/70 px-4 py-2 text-sm font-semibold text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEvent}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                {eventForm.id ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        tone="danger"
        title="Eliminar evento"
        description="Esta acción es irreversible. Se eliminará el monitoreo o actividad."
        details={deleteTarget?.title || ''}
        confirmText={isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteEvent}
        loading={isDeleting}
      />
    </div>
  );
}
