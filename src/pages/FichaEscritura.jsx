import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  History,
  Info,
  RefreshCw,
  RotateCcw,
  Save,
  TrendingUp,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import Textarea from '../components/ui/Textarea.jsx';
import Toggle from '../components/ui/Toggle.jsx';
import LevelPills from '../components/ui/LevelPills.jsx';
import Badge from '../components/ui/Badge.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import SignaturePad from '../components/ui/SignaturePad.jsx';
import Toast from '../components/ui/Toast.jsx';
import { SidebarContext } from '../routes/MonitoreoLayout.jsx';
import { FORM_TITLE, LEVEL_INFO, QUESTION_SECTIONS } from '../data/fichaEscritura.js';
import { supabase } from '../lib/supabase.js';

const INSTANCE_ACTIVE_KEY = 'monitoreoInstanceActive';

const TEMPLATE_KEY = 'monitoreoTemplateSelected';
const TEMPLATE_SHEET_KEY = 'monitoreoTemplateSheetSelected';
const AUTOSAVE_ALERT_KEY = 'monitoreoAutosaveAlert';
const AUTOSAVE_ALERT_EVENT_NAME = 'monitoreo-autosave-alert-updated';
const loadSelectedTemplate = async (selectedId) => {
  try {
    if (!selectedId) return { template: null, error: null };
    const { data, error } = await supabase
      .from('monitoring_templates')
      .select('*')
      .eq('id', selectedId)
      .single();
    if (error) return { template: null, error };
    return {
      template: {
        ...data,
        levelsConfig: data.levels_config,
        availability: data.availability,
      },
      error: null,
    };
  } catch {
    return { template: null, error: new Error('No se pudo cargar la plantilla') };
  }
};

const getTemplateStatus = (template) => {
  const status = template?.availability ? template.availability.status || 'scheduled' : 'active';
  const startAt = template?.availability?.startAt ? new Date(template.availability.startAt) : null;
  const endAt = template?.availability?.endAt ? new Date(template.availability.endAt) : null;
  const now = new Date();
  if (status === 'closed') return 'closed';
  if (status === 'scheduled') return 'scheduled';
  if (startAt && now < startAt) return 'scheduled';
  if (endAt && now > endAt) return 'closed';
  if (status === 'active') return 'active';
  return startAt || endAt ? 'scheduled' : 'active';
};

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const normalizeInstitutionCodes = (codLocalRaw, codModularRaw) => {
  const codLocalDigits = onlyDigits(codLocalRaw);
  const codModularDigits = onlyDigits(codModularRaw);

  let codLocal = codLocalDigits.length === 6 ? codLocalDigits : '';
  let codModular = codModularDigits.length === 7 ? codModularDigits : '';

  // Handle swapped values: local=7 and modular=6.
  if (!codLocal && codModularDigits.length === 6) codLocal = codModularDigits;
  if (!codModular && codLocalDigits.length === 7) codModular = codLocalDigits;

  // Fallbacks when source quality is poor.
  if (!codLocal && codLocalDigits.length === 6) codLocal = codLocalDigits;
  if (!codModular && codModularDigits.length === 7) codModular = codModularDigits;
  if (!codLocal) codLocal = codLocalDigits || codModularDigits || '';
  if (!codModular) codModular = codModularDigits || codLocalDigits || '';

  return { cod_local: codLocal, cod_modular: codModular };
};

const normalizeInstitutionRecord = (record) => {
  const normalizedCodes = normalizeInstitutionCodes(record?.cod_local, record?.cod_modular);
  return {
    ...record,
    cod_local: normalizedCodes.cod_local,
    cod_modular: normalizedCodes.cod_modular,
  };
};

const dedupeInstitutionCatalog = (records) => {
  const byKey = new Map();
  (records || []).forEach((raw) => {
    const item = normalizeInstitutionRecord(raw);
    const key = [
      String(item?.nombre_ie || '').trim().toUpperCase(),
      String(item?.distrito || '').trim().toUpperCase(),
      String(item?.cod_local || '').trim(),
      String(item?.cod_modular || '').trim(),
    ].join('|');

    const score =
      (String(item?.cod_local || '').length === 6 ? 2 : 0) +
      (String(item?.cod_modular || '').length === 7 ? 2 : 0) +
      (item?.estado === 'active' ? 1 : 0) +
      (item?.nombre_director ? 1 : 0);

    const current = byKey.get(key);
    if (!current || score > current.score) {
      byKey.set(key, { score, item });
    }
  });

  return Array.from(byKey.values()).map((entry) => entry.item);
};

const BUILDER_HEADER_FIELD_LABELS = {
  institution_name: 'Institucion educativa',
  cod_modular: 'Codigo modular',
  cod_local: 'Codigo local',
  district: 'Distrito / Lugar',
  rei: 'REI',
  monitor_name: 'Monitor(a)',
  monitor_doc_type: 'Tipo doc. monitor',
  monitor_doc_number: 'Numero doc. monitor',
  monitored_name: 'Monitoreado(a)',
  monitored_doc_type: 'Tipo doc. monitoreado(a)',
  monitored_doc_number: 'Numero doc. monitoreado(a)',
  monitored_position: 'Cargo monitoreado(a)',
  monitored_phone: 'Telefono monitoreado(a)',
  monitored_email: 'Correo monitoreado(a)',
  monitored_condition: 'Condicion de monitoreado(a)',
  monitoring_area: 'Area que monitorea',
  visit_count: 'Numero de visitas a la IE',
  application_date: 'Fecha de aplicacion',
  start_time: 'Hora de inicio',
  end_time: 'Hora de fin',
};

const BUILDER_CLOSING_FIELD_LABELS = {
  progress_level: 'Nivel de avance',
  general_observation: 'Observacion general',
  general_commitment: 'Compromiso general',
  closing_place: 'Lugar',
  closing_date: 'Fecha',
  signature: 'Firma',
  dni_monitored: 'DNI monitoreado(a)',
  dni_monitor: 'DNI monitor(a)',
};

const BUILDER_HEADER_BINDINGS = {
  institution_name: { area: 'header', key: 'institucion' },
  district: { area: 'header', key: 'lugarIe' },
  monitor_name: { area: 'header', key: 'director' },
  monitored_name: { area: 'header', key: 'docente' },
  monitored_condition: { area: 'header', key: 'condicion' },
  monitoring_area: { area: 'header', key: 'area' },
};

const BUILDER_CLOSING_BINDINGS = {
  general_observation: { area: 'general', key: 'observacion' },
  general_commitment: { area: 'general', key: 'compromiso' },
  closing_place: { area: 'cierre', key: 'lugar' },
  closing_date: { area: 'cierre', key: 'fecha' },
};

const LEGACY_HEADER_FIELD_IDS = [
  'institution_name',
  'district',
  'monitor_name',
  'monitored_name',
  'monitored_condition',
  'monitoring_area',
];

const HEADER_GROUP_DEFINITIONS = [
  {
    id: 'institution',
    title: 'Datos de la institucion',
    description: 'Contexto institucional comun del monitoreo.',
    fieldIds: ['institution_name', 'district', 'rei', 'cod_local', 'cod_modular'],
  },
  {
    id: 'monitor',
    title: 'Datos del monitor',
    description: 'Persona responsable de realizar el monitoreo.',
    fieldIds: ['monitor_name', 'monitor_doc_type', 'monitor_doc_number'],
  },
  {
    id: 'monitored',
    title: 'Datos del docente monitoreado',
    description: 'Persona evaluada durante el monitoreo.',
    fieldIds: [
      'monitored_name',
      'monitoring_area',
      'monitored_condition',
      'monitored_doc_type',
      'monitored_doc_number',
      'monitored_position',
      'monitored_phone',
      'monitored_email',
    ],
  },
];

const DOC_TYPE_OPTIONS = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'CE' },
  { value: 'Pasaporte', label: 'Pasaporte' },
  { value: 'Otro', label: 'Otro' },
];

const CONDITION_OPTIONS = [
  { value: 'Nombrado', label: 'Nombrado' },
  { value: 'Contratado', label: 'Contratado' },
];

const MONITORING_AREA_OPTIONS = [
  { value: 'Comunicacion', label: 'Comunicacion' },
  { value: 'Quechua', label: 'Quechua' },
  { value: 'Ingles', label: 'Ingles' },
];

const resolveQuestionKind = (question) => {
  const sourceType = String(question?.sourceType || question?.type || '').trim().toLowerCase();
  if (sourceType) return sourceType;
  if (String(question?.responseType || '').toLowerCase() === 'scale_1_3') return 'yes_no_levels';
  return 'yes_no';
};

const buildQuestionsState = (sections) =>
  sections.flatMap((section) => section.questions || []).reduce((acc, question) => {
    acc[question.id] = { answer: null, level: null, obs: '' };
    return acc;
  }, {});

const generateSessionId = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `#MN-${year}-${random}`;
};

const createInitialState = (sections) => ({
  meta: {
    sessionId: generateSessionId(),
    saved: true,
    lastSavedAt: null,
  },
  header: {
    institucion: '',
    lugarIe: '',
    director: '',
    docente: '',
    condicion: '',
    area: '',
  },
  headerExtras: {},
  questions: buildQuestionsState(sections),
  general: {
    observacion: '',
    compromiso: '',
  },
  cierre: {
    lugar: '',
    fecha: new Date().toISOString().split('T')[0],
  },
  closingExtras: {},
  dynamicFields: {},
  firmas: {
    docente: {
      firma: '',
      nombre: '',
      dni: '',
    },
    monitor: {
      firma: '',
      nombre: '',
      dni: '',
    },
  },
  errors: {},
});

const reducer = (state, action) => {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        ...action.payload,
        errors: {},
      };
    case 'UPDATE_HEADER':
      return {
        ...state,
        header: { ...state.header, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_GENERAL':
      return {
        ...state,
        general: { ...state.general, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_CIERRE':
      return {
        ...state,
        cierre: { ...state.cierre, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_FIRMA':
      return {
        ...state,
        firmas: {
          ...state.firmas,
          [action.role]: {
            ...state.firmas[action.role],
            [action.field]: action.value,
          },
        },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_QUESTION':
      return {
        ...state,
        questions: {
          ...state.questions,
          [action.id]: {
            ...state.questions[action.id],
            ...action.payload,
          },
        },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_HEADER_EXTRA':
      return {
        ...state,
        headerExtras: { ...state.headerExtras, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_CLOSING_EXTRA':
      return {
        ...state,
        closingExtras: { ...state.closingExtras, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_DYNAMIC_FIELD':
      return {
        ...state,
        dynamicFields: { ...state.dynamicFields, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'SET_ERRORS':
      return {
        ...state,
        errors: action.payload,
      };
    case 'MARK_SAVED':
      return {
        ...state,
        meta: { ...state.meta, saved: action.value, lastSavedAt: action.lastSavedAt },
      };
    case 'RESET':
      return createInitialState(action.sections || QUESTION_SECTIONS);
    default:
      return state;
  }
};

const serializeState = (state) => {
  const { errors, ...rest } = state;
  return rest;
};

const serializeStateWithSheet = (state, selectedSheetId = '') => {
  const serialized = serializeState(state);
  return {
    ...serialized,
    meta: {
      ...(serialized?.meta && typeof serialized.meta === 'object' ? serialized.meta : {}),
      selectedSheetId: selectedSheetId || null,
    },
  };
};

const getInstanceSheetId = (instance) => {
  const value = instance?.data?.meta?.selectedSheetId;
  return typeof value === 'string' ? value : '';
};

const mergeLoadedState = (loaded, sections) => {
  const base = createInitialState(sections);
  const mergedQuestions = {
    ...base.questions,
    ...(loaded?.questions || {}),
  };
  return {
    ...base,
    ...loaded,
    questions: mergedQuestions,
    errors: {},
  };
};

const getCurrentUserId = () => {
  try {
    const auth = JSON.parse(localStorage.getItem('monitoreoAuth'));
    return auth?.email || auth?.docNumber || '';
  } catch {
    return '';
  }
};

const getActiveInstance = async () => {
  const activeId = localStorage.getItem(INSTANCE_ACTIVE_KEY);
  if (!activeId) return null;
  const { data, error } = await supabase
    .from('monitoring_instances')
    .select('*')
    .eq('id', activeId)
    .single();
  if (error) return null;
  return data;
};

const upsertInstance = async (instance) => {
  const { error } = await supabase.from('monitoring_instances').upsert(instance, { onConflict: 'id' });
  if (error) throw error;
};

const pushAutosaveAlert = (message) => {
  try {
    localStorage.setItem(
      AUTOSAVE_ALERT_KEY,
      JSON.stringify({
        message: message || 'No se pudieron guardar los cambios en Supabase.',
        at: new Date().toISOString(),
      }),
    );
    window.dispatchEvent(new Event(AUTOSAVE_ALERT_EVENT_NAME));
  } catch {
    // noop
  }
};

const clearAutosaveAlert = () => {
  try {
    localStorage.removeItem(AUTOSAVE_ALERT_KEY);
    window.dispatchEvent(new Event(AUTOSAVE_ALERT_EVENT_NAME));
  } catch {
    // noop
  }
};

const createInstance = async (templateId, templateStatus, selectedSheetId = '') => {
  try {
    if (templateStatus !== 'active') return null;
    const userId = getCurrentUserId();
    if (!userId) return null;
    const now = new Date().toISOString();
    const instance = {
      id: crypto.randomUUID(),
      template_id: templateId || null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      status: 'in_progress',
      data: {
        meta: {
          selectedSheetId: selectedSheetId || null,
        },
      },
    };
    await upsertInstance(instance);
    localStorage.setItem(INSTANCE_ACTIVE_KEY, instance.id);
    return instance;
  } catch {
    return null;
  }
};

const formatInstitutionLevel = (value) => {
  if (value === 'inicial_cuna_jardin') return 'INICIAL CUNA JARDIN';
  if (value === 'inicial_jardin') return 'INICIAL JARDIN';
  if (value === 'inicial') return 'INICIAL JARDIN';
  if (value === 'primaria') return 'PRIMARIA';
  if (value === 'secundaria') return 'SECUNDARIA';
  if (value === 'tecnico_productiva') return 'TECNICO PRODUCTIVA';
  return '-';
};

const getTemplateScope = (template) =>
  template?.levelsConfig?.scope || template?.levels_config?.scope || {};

const isCddTemplate = (template) =>
  String(getTemplateScope(template)?.cdd || '').trim().toLowerCase() === 'si';

const getCddArea = (template) => String(getTemplateScope(template)?.cddArea || '').trim();

const normalizeMetricKey = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parseMetricNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object') {
    return parseMetricNumber(
      value.value ?? value.answer ?? value.valor ?? value.score ?? value.level ?? value.meta ?? value.avance,
    );
  }
  const normalized = String(value).replace(',', '.').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const isCddMetaKey = (value) => {
  const normalized = normalizeMetricKey(value);
  return normalized.includes('meta') || normalized.includes('objetivo');
};

const isCddAdvanceKey = (value) => {
  const normalized = normalizeMetricKey(value);
  return (
    normalized.includes('avance') ||
    normalized.includes('logrado') ||
    normalized.includes('real') ||
    normalized.includes('cumplimiento')
  );
};

const findMetricValueInObject = (source, matcher) => {
  if (!source || typeof source !== 'object') return null;
  for (const [key, value] of Object.entries(source)) {
    if (matcher(key)) {
      const parsed = parseMetricNumber(value);
      if (parsed !== null) return parsed;
    }
    if (value && typeof value === 'object') {
      const nested = findMetricValueInObject(value, matcher);
      if (nested !== null) return nested;
    }
  }
  return null;
};

const getCddMetricQuestionIds = (sections) => {
  const result = { meta: '', avance: '' };
  (sections || []).forEach((section) => {
    (section?.questions || []).forEach((question) => {
      const label = `${question?.id || ''} ${question?.text || ''}`;
      if (!result.meta && isCddMetaKey(label)) result.meta = question.id;
      if (!result.avance && isCddAdvanceKey(label)) result.avance = question.id;
    });
  });
  return result;
};

const getCddStatusMeta = (progress) => {
  if (progress >= 100) {
    return {
      key: 'completed',
      label: 'Completado',
      badgeClass: 'border-emerald-300 bg-emerald-100 text-emerald-900 shadow-sm dark:border-emerald-300/70 dark:bg-emerald-300 dark:text-emerald-950',
      dotClass: 'bg-emerald-600 dark:bg-emerald-900',
    };
  }
  if (progress > 0) {
    return {
      key: 'in_progress',
      label: 'En proceso',
      badgeClass: 'border-amber-300 bg-amber-100 text-amber-950 shadow-sm dark:border-amber-200/80 dark:bg-amber-300 dark:text-amber-950',
      dotClass: 'bg-amber-600 dark:bg-amber-900',
    };
  }
  return {
    key: 'pending',
    label: 'Pendiente',
    badgeClass: 'border-rose-300 bg-rose-100 text-rose-900 shadow-sm dark:border-rose-300/80 dark:bg-rose-300 dark:text-rose-950',
    dotClass: 'bg-rose-600 dark:bg-rose-900',
  };
};

const formatCddDateTime = (value) => {
  if (!value) return 'Sin registro';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

const formatCddDate = (value) => {
  if (!value) return 'Sin registro';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
};

export default function FichaEscritura() {
  const { activeSection, setActiveSection } = useContext(SidebarContext);
  const location = useLocation();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateError, setTemplateError] = useState('');
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);
  const [templateId, setTemplateId] = useState(() => localStorage.getItem(TEMPLATE_KEY) || '');
  const [selectedSheetId, setSelectedSheetId] = useState(
    () => localStorage.getItem(TEMPLATE_SHEET_KEY) || '',
  );
  const [activeInstance, setActiveInstance] = useState(null);
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    createInitialState(QUESTION_SECTIONS),
  );
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setIsTemplateLoading(true);
      const requestedSheetId = localStorage.getItem(TEMPLATE_SHEET_KEY) || '';
      // 1) Recuperar instancia activa si existe
      const existingInstance = await getActiveInstance();
      if (!active) return;
      let existing = existingInstance;
      if (existing && requestedSheetId && getInstanceSheetId(existing) !== requestedSheetId) {
        existing = null;
        localStorage.removeItem(INSTANCE_ACTIVE_KEY);
        setActiveInstance(null);
      }
      if (existing) {
        setActiveInstance(existing);
        const existingSheetId = getInstanceSheetId(existing);
        if (existingSheetId && existingSheetId !== requestedSheetId) {
          localStorage.setItem(TEMPLATE_SHEET_KEY, existingSheetId);
          setSelectedSheetId(existingSheetId);
        }
        if (existing.template_id && existing.template_id !== templateId) {
          localStorage.setItem(TEMPLATE_KEY, existing.template_id);
          setTemplateId(existing.template_id);
        }
      }

      // 2) Cargar plantilla por templateId
      const idToLoad = existing?.template_id || templateId;
      if (!idToLoad) {
        setTemplateError('No se encontro la plantilla seleccionada.');
        setSelectedTemplate(null);
        setIsTemplateLoading(false);
        return;
      }
      const result = await loadSelectedTemplate(idToLoad);
      if (!active) return;
      if (result.error) {
        console.error(result.error);
        setTemplateError('No se pudo cargar la plantilla.');
        setSelectedTemplate(null);
      } else {
        setSelectedTemplate(result.template);
        setTemplateError('');
      }
      setIsTemplateLoading(false);
    };
    hydrate();
    return () => {
      active = false;
    };
  }, [templateId]);
  const templateStatus = useMemo(() => getTemplateStatus(selectedTemplate), [selectedTemplate]);
  const allTemplateSections = useMemo(
    () => selectedTemplate?.sections || QUESTION_SECTIONS,
    [selectedTemplate],
  );
  const isBuilderTemplate = selectedTemplate?.levelsConfig?.type === 'request_builder';
  const builderSheets = useMemo(() => {
    const sheets = selectedTemplate?.levelsConfig?.builder?.sheets;
    return Array.isArray(sheets) ? sheets : [];
  }, [selectedTemplate]);
  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    if (!isBuilderTemplate || !builderSheets.length) {
      if (selectedSheetId) setSelectedSheetId('');
      localStorage.removeItem(TEMPLATE_SHEET_KEY);
      return;
    }
    const isValid = builderSheets.some((sheet) => sheet.id === selectedSheetId);
    const resolvedSheetId = isValid ? selectedSheetId : builderSheets[0]?.id || '';
    if (!resolvedSheetId) {
      localStorage.removeItem(TEMPLATE_SHEET_KEY);
      return;
    }
    localStorage.setItem(TEMPLATE_SHEET_KEY, resolvedSheetId);
    if (resolvedSheetId !== selectedSheetId) {
      setSelectedSheetId(resolvedSheetId);
    }
  }, [builderSheets, isBuilderTemplate, selectedSheetId]);
  const templateSections = useMemo(
    () => (isBuilderTemplate && selectedSheetId
      ? allTemplateSections.filter((section) => section?.sheetId === selectedSheetId)
      : allTemplateSections),
    [allTemplateSections, isBuilderTemplate, selectedSheetId],
  );
  const activeBuilderSheet = useMemo(() => {
    if (!builderSheets.length) return null;
    if (selectedSheetId) {
      return builderSheets.find((sheet) => sheet.id === selectedSheetId) || builderSheets[0];
    }
    const sheetIdFromSections = allTemplateSections.find((section) => section?.sheetId)?.sheetId;
    return builderSheets.find((sheet) => sheet.id === sheetIdFromSections) || builderSheets[0];
  }, [allTemplateSections, builderSheets, selectedSheetId]);
  const activeHeaderFieldIds = useMemo(() => {
    const fields = activeBuilderSheet?.headerFields;
    if (!fields || typeof fields !== 'object') return [];
    return Object.keys(fields).filter((fieldId) => Boolean(fields[fieldId]));
  }, [activeBuilderSheet]);
  const activeClosingFieldIds = useMemo(() => {
    const fields = activeBuilderSheet?.closingFields;
    if (!fields || typeof fields !== 'object') return [];
    return Object.keys(fields).filter((fieldId) => Boolean(fields[fieldId]));
  }, [activeBuilderSheet]);
  const activeDynamicFields = useMemo(() => {
    const dynamicFields = activeBuilderSheet?.dynamicFields;
    return Array.isArray(dynamicFields) ? dynamicFields : [];
  }, [activeBuilderSheet]);
  const effectiveHeaderFieldIds = useMemo(
    () => (isBuilderTemplate ? activeHeaderFieldIds : LEGACY_HEADER_FIELD_IDS),
    [isBuilderTemplate, activeHeaderFieldIds],
  );
  const groupedHeaderFields = useMemo(() => {
    const activeSet = new Set(effectiveHeaderFieldIds);
    const groups = HEADER_GROUP_DEFINITIONS.map((group) => ({
      ...group,
      fields: group.fieldIds.filter((fieldId) => activeSet.has(fieldId)),
    })).filter((group) => group.fields.length > 0);

    const assigned = new Set(groups.flatMap((group) => group.fields));
    const extras = effectiveHeaderFieldIds.filter((fieldId) => !assigned.has(fieldId));
    if (extras.length) {
      groups.push({
        id: 'extra',
        title: 'Datos complementarios',
        description: 'Campos adicionales del encabezado.',
        fields: extras,
      });
    }
    return groups;
  }, [effectiveHeaderFieldIds]);

  const showHeaderSection = groupedHeaderFields.length > 0 || activeDynamicFields.length > 0;
  const showExecutionHeaderSection = !isBuilderTemplate && showHeaderSection;
  const templateMetadata = useMemo(() => {
    const meta = selectedTemplate?.levelsConfig?.metadata;
    if (!meta || typeof meta !== 'object') {
      return {
        includeLevels: false,
        includeDate: false,
        includeLocation: false,
        includeSignatures: false,
      };
    }
    return {
      includeLevels: Boolean(meta.include_levels),
      includeDate: Boolean(meta.include_date),
      includeLocation: Boolean(meta.include_location),
      includeSignatures: Boolean(meta.include_signatures),
    };
  }, [selectedTemplate]);
  const showGeneralSection =
    !isBuilderTemplate ||
    activeClosingFieldIds.includes('general_observation') ||
    activeClosingFieldIds.includes('general_commitment');
  const showPlaceDateSection =
    (!isBuilderTemplate ||
    activeClosingFieldIds.includes('closing_place') ||
    activeClosingFieldIds.includes('closing_date')) &&
    (!isBuilderTemplate || templateMetadata.includeDate || templateMetadata.includeLocation);
  const showSignaturesSection =
    (!isBuilderTemplate ||
    activeClosingFieldIds.includes('signature') ||
    activeClosingFieldIds.includes('dni_monitored') ||
    activeClosingFieldIds.includes('dni_monitor')) &&
    (!isBuilderTemplate || templateMetadata.includeSignatures);
  const showSignaturePads = !isBuilderTemplate || activeClosingFieldIds.includes('signature');
  const showClosingContainer = showGeneralSection || showPlaceDateSection || showSignaturesSection;
  const extraClosingFieldIds = useMemo(
    () =>
      activeClosingFieldIds.filter(
        (fieldId) =>
          !BUILDER_CLOSING_BINDINGS[fieldId] &&
          fieldId !== 'signature' &&
          fieldId !== 'dni_monitored' &&
          fieldId !== 'dni_monitor',
      ),
    [activeClosingFieldIds],
  );
  const showGeneralObservation = !isBuilderTemplate || activeClosingFieldIds.includes('general_observation');
  const showGeneralCommitment = !isBuilderTemplate || activeClosingFieldIds.includes('general_commitment');
  const showClosingPlace = !isBuilderTemplate || activeClosingFieldIds.includes('closing_place');
  const showClosingDate = !isBuilderTemplate || activeClosingFieldIds.includes('closing_date');
  const showMonitoredDni = !isBuilderTemplate || activeClosingFieldIds.includes('dni_monitored');
  const showMonitorDni = !isBuilderTemplate || activeClosingFieldIds.includes('dni_monitor');
  const hasLevelScaleQuestions = useMemo(
    () => templateSections.some((section) =>
      (section.questions || []).some((question) => resolveQuestionKind(question) === 'yes_no_levels')),
    [templateSections],
  );
  const showLevelInfoCard = !isBuilderTemplate ? hasLevelScaleQuestions : templateMetadata.includeLevels;
  const formTitle = selectedTemplate?.title || FORM_TITLE;
  const selectedSheetLabel = isBuilderTemplate
    ? String(activeBuilderSheet?.title || '').trim()
    : '';
  const selectedSheetQuestionCount = useMemo(
    () => templateSections.reduce((total, section) => total + ((section.questions || []).length), 0),
    [templateSections],
  );
  const defaultLevels = useMemo(
    () =>
      LEVEL_INFO.map((level, index) => ({
        key: `L${index + 1}`,
        label: `Nivel ${index + 1}`,
        description: level.text,
      })),
    [],
  );
  const templateLevels = useMemo(() => {
    const levels = selectedTemplate?.levelsConfig?.levels;
    if (Array.isArray(levels) && levels.length >= 3) {
      return levels;
    }
    return defaultLevels;
  }, [defaultLevels, selectedTemplate]);
  const isReadOnly = templateStatus !== 'active';
  const [toast, setToast] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [institutionCatalog, setInstitutionCatalog] = useState([]);
  const [isInstitutionCatalogLoading, setIsInstitutionCatalogLoading] = useState(true);
  const [institutionCatalogError, setInstitutionCatalogError] = useState('');
  const [isInstitutionAutocompleteOpen, setIsInstitutionAutocompleteOpen] = useState(false);
  const [activeQuestionAutocompleteId, setActiveQuestionAutocompleteId] = useState('');
  const prevDocenteRef = useRef('');
  const prevMonitorRef = useRef('');
  const institutionAutocompleteRef = useRef(null);

  const allQuestions = useMemo(
    () => templateSections.flatMap((section) => section.questions || []),
    [templateSections],
  );

  const returnContext = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const from = String(params.get('from') || '').toLowerCase();
    const returnTo = String(params.get('returnTo') || '').trim();
    if (returnTo.startsWith('/monitoreo')) {
      return {
        path: returnTo,
        label: from === 'reportes' ? '← Volver a reportes' : '← Volver a monitoreos',
      };
    }
    if (from === 'reportes') {
      return { path: '/monitoreo/reportes', label: '← Volver a reportes' };
    }
    return { path: '/monitoreo', label: '← Volver a monitoreos' };
  }, [location.search]);

  const isAnsweredQuestion = useCallback((question) => {
    const data = state.questions?.[question.id] || {};
    const kind = resolveQuestionKind(question);
    const answer = data.answer;
    const hasAnswer = answer !== null && answer !== undefined && String(answer).trim() !== '';
    if (!hasAnswer) return false;
    if (kind === 'yes_no_levels' && String(answer).toUpperCase() === 'SI') {
      return data.level !== null && data.level !== undefined && String(data.level).trim() !== '';
    }
    return true;
  }, [state.questions]);

  const hasAnyQuestionAnswerInSection = useCallback((section) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    return questions.some((question) => {
      const answer = state.questions?.[question.id]?.answer;
      return answer !== null && answer !== undefined && String(answer).trim() !== '';
    });
  }, [state.questions]);

  const formNavItems = useMemo(() => {
    const items = [];
    if (showExecutionHeaderSection) {
      const requiredKeys = ['institucion', 'lugarIe', 'director', 'docente', 'condicion', 'area'];
      const filledCount = requiredKeys.reduce((acc, key) => {
        const value = state.header?.[key];
        return acc + (value !== null && value !== undefined && String(value).trim() !== '' ? 1 : 0);
      }, 0);
      items.push({
        id: 'datos',
        label: 'Datos generales',
        status: filledCount === 0 ? 'pending' : filledCount >= requiredKeys.length ? 'completed' : 'in_progress',
        detail: `${filledCount}/${requiredKeys.length}`,
      });
    }

    templateSections.forEach((section, index) => {
      const questions = Array.isArray(section?.questions) ? section.questions : [];
      const total = questions.length;
      const answered = questions.reduce((acc, question) => acc + (isAnsweredQuestion(question) ? 1 : 0), 0);
      const any = hasAnyQuestionAnswerInSection(section);
      items.push({
        id: section.id,
        label: section.title || `Seccion ${index + 1}`,
        status: answered >= total && total > 0 ? 'completed' : any ? 'in_progress' : 'pending',
        detail: total > 0 ? `${answered}/${total}` : '0/0',
      });
    });

    if (showClosingContainer) {
      const checks = [
        showGeneralObservation ? state.general?.observacion : 'ok',
        showGeneralCommitment ? state.general?.compromiso : 'ok',
        showClosingPlace ? state.cierre?.lugar : 'ok',
        showClosingDate ? state.cierre?.fecha : 'ok',
        showMonitoredDni ? state.firmas?.docente?.dni : 'ok',
        showMonitorDni ? state.firmas?.monitor?.dni : 'ok',
      ];
      const required = checks.filter((value) => value !== 'ok');
      const done = required.filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length;
      items.push({
        id: 'cierre',
        label: 'Cierre',
        status: required.length === 0 ? 'pending' : done === 0 ? 'pending' : done >= required.length ? 'completed' : 'in_progress',
        detail: required.length ? `${done}/${required.length}` : '0/0',
      });
    }

    return items;
  }, [
    hasAnyQuestionAnswerInSection,
    isAnsweredQuestion,
    showExecutionHeaderSection,
    showClosingContainer,
    showGeneralObservation,
    showGeneralCommitment,
    showClosingPlace,
    showClosingDate,
    showMonitoredDni,
    showMonitorDni,
    state.header,
    state.general,
    state.cierre,
    state.firmas,
    templateSections,
  ]);

  const formProgress = useMemo(() => {
    const total = formNavItems.length;
    if (!total) return 0;
    const completed = formNavItems.filter((item) => item.status === 'completed').length;
    return Math.round((completed / total) * 100);
  }, [formNavItems]);

  const isCddMonitoreo = useMemo(() => isCddTemplate(selectedTemplate), [selectedTemplate]);

  const cddMetricQuestionIds = useMemo(
    () => getCddMetricQuestionIds(templateSections),
    [templateSections],
  );

  const authDisplayName = useMemo(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('monitoreoAuth'));
      return String(auth?.name || auth?.fullName || auth?.email || auth?.docNumber || '').trim();
    } catch {
      return '';
    }
  }, []);

  const cddMetricFallbacks = useMemo(() => {
    const data = serializeState(state);
    let meta = findMetricValueInObject(data, isCddMetaKey);
    let avance = findMetricValueInObject(data, isCddAdvanceKey);
    if (meta === null && cddMetricQuestionIds.meta) {
      meta = parseMetricNumber(state.questions?.[cddMetricQuestionIds.meta]);
    }
    if (avance === null && cddMetricQuestionIds.avance) {
      avance = parseMetricNumber(state.questions?.[cddMetricQuestionIds.avance]);
    }
    return {
      meta: meta !== null && meta > 0 ? meta : 100,
      avance: avance !== null && avance >= 0 ? avance : 0,
    };
  }, [cddMetricQuestionIds, state]);

  const cddMetaValue = String(state.dynamicFields?.cddMeta ?? cddMetricFallbacks.meta ?? 100);
  const cddAvanceValue = String(state.dynamicFields?.cddAvance ?? cddMetricFallbacks.avance ?? 0);
  const cddMetaNumber = parseMetricNumber(cddMetaValue) || 0;
  const cddAvanceNumber = parseMetricNumber(cddAvanceValue) || 0;
  const cddProgress = cddMetaNumber > 0
    ? Math.max(0, Math.min(100, (cddAvanceNumber / cddMetaNumber) * 100))
    : 0;
  const cddProgressLabel = `${Number(cddProgress.toFixed(1)).toLocaleString('es-PE')}%`;
  const cddStatusMeta = getCddStatusMeta(cddProgress);
  const cddResponsableValue =
    state.dynamicFields?.cddResponsable ||
    state.header?.director ||
    state.header?.docente ||
    authDisplayName ||
    'Responsable no registrado';
  const cddFechaValue =
    state.dynamicFields?.cddFechaActualizacion ||
    state.cierre?.fecha ||
    new Date().toISOString().slice(0, 10);
  const cddObservacionValue = state.dynamicFields?.cddObservacion || state.general?.observacion || '';

  const updateCddMetric = useCallback((field, value) => {
    const dynamicField = field === 'meta' ? 'cddMeta' : 'cddAvance';
    dispatch({ type: 'UPDATE_DYNAMIC_FIELD', field: dynamicField, value });
    const questionId = cddMetricQuestionIds[field];
    if (questionId) {
      dispatch({
        type: 'UPDATE_QUESTION',
        id: questionId,
        payload: { answer: value },
      });
    }
  }, [cddMetricQuestionIds]);

  const scrollToSection = useCallback((sectionId) => {
    const element = document.getElementById(sectionId);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(sectionId);
  }, [setActiveSection]);

  const getInstitutionSuggestions = useCallback(
    (rawTerm, limit = 8) => {
      const term = String(rawTerm || '')
        .trim()
        .toLowerCase();
      if (!term) return [];

      const scored = institutionCatalog
        .map((item) => {
          const name = String(item.nombre_ie || '');
          const codLocal = String(item.cod_local || '');
          const codModular = String(item.cod_modular || '');
          const director = String(item.nombre_director || '');
          const haystack = `${name} ${codLocal} ${codModular} ${director}`.toLowerCase();
          if (!haystack.includes(term)) return null;

          const startsWith =
            name.toLowerCase().startsWith(term) ||
            codLocal.toLowerCase().startsWith(term) ||
            codModular.toLowerCase().startsWith(term)
              ? 0
              : 1;
          return { item, score: startsWith };
        })
        .filter(Boolean)
        .sort((left, right) => {
          if (left.score !== right.score) return left.score - right.score;
          return String(left.item.nombre_ie || '').localeCompare(String(right.item.nombre_ie || ''), 'es', {
            sensitivity: 'base',
          });
        });

      return scored.slice(0, limit).map((entry) => entry.item);
    },
    [institutionCatalog],
  );

  const institutionSuggestions = useMemo(
    () => getInstitutionSuggestions(state.header.institucion, 8),
    [getInstitutionSuggestions, state.header.institucion],
  );

  const applyAutocompleteSelection = (item, fieldId) => {
    if (!item || !fieldId) return;

    if (fieldId === 'institution_name') {
      const institutionDirector = String(item.nombre_director || '').trim();

      dispatch({
        type: 'UPDATE_HEADER',
        field: 'institucion',
        value: item.nombre_ie || '',
      });

      if (item.distrito) {
        dispatch({
          type: 'UPDATE_HEADER',
          field: 'lugarIe',
          value: item.distrito,
        });
      }

      if (effectiveHeaderFieldIds.includes('cod_local')) {
        dispatch({
          type: 'UPDATE_HEADER_EXTRA',
          field: 'cod_local',
          value: item.cod_local || '',
        });
      }

      if (effectiveHeaderFieldIds.includes('cod_modular')) {
        dispatch({
          type: 'UPDATE_HEADER_EXTRA',
          field: 'cod_modular',
          value: item.cod_modular || '',
        });
      }

      if (institutionDirector && effectiveHeaderFieldIds.includes('monitored_name')) {
        dispatch({
          type: 'UPDATE_HEADER',
          field: 'docente',
          value: institutionDirector,
        });
      }

      // Evita que el nombre del director institucional quede en el campo de monitor.
      if (institutionDirector && effectiveHeaderFieldIds.includes('monitor_name') && state.header.director === institutionDirector) {
        dispatch({
          type: 'UPDATE_HEADER',
          field: 'director',
          value: '',
        });
      }
    }

    setIsInstitutionAutocompleteOpen(false);
  };

  const handleInstitutionKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsInstitutionAutocompleteOpen(false);
      return;
    }

    if (event.key === 'Enter' && institutionSuggestions.length) {
      event.preventDefault();
      applyAutocompleteSelection(institutionSuggestions[0], 'institution_name');
    }
  };

  const applyQuestionAutocompleteSelection = (questionId, item) => {
    if (!questionId || !item) return;
    dispatch({
      type: 'UPDATE_QUESTION',
      id: questionId,
      payload: { answer: item.nombre_ie || '' },
    });
    setActiveQuestionAutocompleteId('');
  };

  const handleQuestionInstitutionKeyDown = (event, questionId, suggestions) => {
    if (event.key === 'Escape') {
      setActiveQuestionAutocompleteId((current) => (current === questionId ? '' : current));
      return;
    }

    if (event.key === 'Enter' && suggestions.length) {
      event.preventDefault();
      applyQuestionAutocompleteSelection(questionId, suggestions[0]);
    }
  };

  useEffect(() => {
    let active = true;

    const loadInstitutionCatalog = async () => {
      setIsInstitutionCatalogLoading(true);
      setInstitutionCatalogError('');

      const { data, error } = await supabase
        .from('educational_institutions')
        .select('id, nombre_ie, cod_local, cod_modular, distrito, nivel, modalidad, nombre_director, estado')
        .eq('estado', 'active')
        .order('nombre_ie', { ascending: true });

      if (!active) return;

      if (error) {
        setInstitutionCatalog([]);
        setInstitutionCatalogError('No se pudo cargar el catalogo de IE.');
        setIsInstitutionCatalogLoading(false);
        return;
      }

      setInstitutionCatalog(dedupeInstitutionCatalog(data || []));
      setIsInstitutionCatalogLoading(false);
    };

    loadInstitutionCatalog();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isInstitutionAutocompleteOpen) return undefined;

    const handleOutsidePointer = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (institutionAutocompleteRef.current?.contains(target)) return;
      setIsInstitutionAutocompleteOpen(false);
    };

    window.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [isInstitutionAutocompleteOpen]);

  useEffect(() => {
    if (!activeQuestionAutocompleteId) return undefined;

    const handleOutsidePointer = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const container = target.closest('[data-question-ie-autocomplete]');
      const containerQuestionId = container?.getAttribute('data-question-ie-autocomplete') || '';
      if (containerQuestionId === activeQuestionAutocompleteId) return;
      setActiveQuestionAutocompleteId('');
    };

    window.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [activeQuestionAutocompleteId]);

  useEffect(() => {
    let active = true;
    const hydrateInstance = async () => {
      if (!activeInstance) return;
      if (activeInstance?.data) {
        dispatch({
          type: 'LOAD',
          payload: mergeLoadedState(activeInstance.data, templateSections),
        });
      }
    };
    hydrateInstance();
    return () => {
      active = false;
    };
  }, [activeInstance, templateSections]);

  useEffect(() => {
    if (!activeInstance || !activeInstance.data) {
      dispatch({ type: 'RESET', sections: templateSections });
    }
  }, [activeInstance, templateSections]);

  // Guardado automatico desactivado para evitar crear/actualizar reportes vacios
  // cuando se entra por error y se sale sin confirmar.

  useEffect(() => {
    if (
      state.header.docente &&
      (state.firmas.docente.nombre === '' || state.firmas.docente.nombre === prevDocenteRef.current)
    ) {
      dispatch({
        type: 'UPDATE_FIRMA',
        role: 'docente',
        field: 'nombre',
        value: state.header.docente,
      });
    }
    prevDocenteRef.current = state.header.docente;
  }, [state.header.docente, state.firmas.docente.nombre]);

  useEffect(() => {
    if (
      state.header.director &&
      (state.firmas.monitor.nombre === '' || state.firmas.monitor.nombre === prevMonitorRef.current)
    ) {
      dispatch({
        type: 'UPDATE_FIRMA',
        role: 'monitor',
        field: 'nombre',
        value: state.header.director,
      });
    }
    prevMonitorRef.current = state.header.director;
  }, [state.header.director, state.firmas.monitor.nombre]);

  useEffect(() => {
    const sections = [
      ...(showExecutionHeaderSection ? ['datos'] : []),
      ...templateSections.map((section) => section.id),
      ...(showClosingContainer ? ['cierre'] : []),
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );

    sections.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [setActiveSection, showClosingContainer, showExecutionHeaderSection, templateSections]);

  const getFirstErrorSectionId = (errors) => {
    if (errors.header && showExecutionHeaderSection) return 'datos';

    if (errors.questions) {
      const firstQuestionId = Object.keys(errors.questions)[0];
      const sectionWithError = templateSections.find((section) =>
        (section.questions || []).some((question) => String(question.id) === String(firstQuestionId)),
      );
      if (sectionWithError?.id) return sectionWithError.id;
    }

    if ((errors.cierre || errors.firmas) && showClosingContainer) return 'cierre';
    return '';
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const errors = {};
    const headerErrors = {};

    if (isCddMonitoreo) {
      if (cddMetaNumber <= 0) {
        setToast('La meta debe ser mayor que 0.');
        setIsSaving(false);
        return;
      }
      if (cddAvanceNumber < 0) {
        setToast('El avance no puede ser negativo.');
        setIsSaving(false);
        return;
      }
    } else if (isBuilderTemplate) {
      activeHeaderFieldIds.forEach((fieldId) => {
        const binding = BUILDER_HEADER_BINDINGS[fieldId];
        if (binding?.area === 'header') {
          if (!state.header?.[binding.key]) {
            headerErrors[binding.key] = 'Requerido';
          }
          return;
        }
        if (!state.headerExtras?.[fieldId]) {
          headerErrors[fieldId] = 'Requerido';
        }
      });

      activeDynamicFields.forEach((field) => {
        if (!field?.required) return;
        const fieldKey = String(field.id || '');
        if (!fieldKey) return;
        const value = state.dynamicFields?.[fieldKey];
        const isEmpty = value === null || value === undefined || String(value).trim() === '';
        if (isEmpty) {
          headerErrors[`dynamic_${fieldKey}`] = 'Requerido';
        }
      });
    } else {
      if (!state.header.institucion) headerErrors.institucion = 'Requerido';
      if (!state.header.lugarIe) headerErrors.lugarIe = 'Requerido';
      if (!state.header.director) headerErrors.director = 'Requerido';
      if (!state.header.docente) headerErrors.docente = 'Requerido';
      if (!state.header.condicion) headerErrors.condicion = 'Requerido';
      if (!state.header.area) headerErrors.area = 'Requerido';
    }

    if (!isCddMonitoreo && Object.keys(headerErrors).length > 0) errors.header = headerErrors;

    const questionErrors = {};
    if (!isCddMonitoreo) {
      allQuestions.forEach((question) => {
        const data = state.questions[question.id] || {};
        const kind = resolveQuestionKind(question);
        const required = question.required !== false;
        if (!required) return;

        if (!data.answer && kind !== 'yes_no_levels') {
          questionErrors[question.id] = 'Respuesta requerida.';
          return;
        }

        if (!data.answer && kind === 'yes_no_levels') {
          questionErrors[question.id] = 'Selecciona Si o No.';
          return;
        }

        if (kind === 'yes_no_levels' && data.answer === 'SI' && (data.level === null || data.level === undefined || data.level === '')) {
          questionErrors[question.id] = 'Selecciona un nivel de logro.';
        }
      });
      if (Object.keys(questionErrors).length > 0) errors.questions = questionErrors;
    }

    const cierreErrors = {};
    if (isCddMonitoreo) {
      // Las fichas CdD se validan por KPI, no por el formulario operativo tradicional.
    } else if (isBuilderTemplate) {
      activeClosingFieldIds.forEach((fieldId) => {
        const binding = BUILDER_CLOSING_BINDINGS[fieldId];
        if (binding?.area === 'general') {
          if (!state.general?.[binding.key]) cierreErrors[binding.key] = 'Requerido';
          return;
        }
        if (binding?.area === 'cierre') {
          if (!state.cierre?.[binding.key]) cierreErrors[binding.key] = 'Requerido';
          return;
        }
        if (fieldId === 'dni_monitored' || fieldId === 'dni_monitor' || fieldId === 'signature') return;
        if (!BUILDER_CLOSING_BINDINGS[fieldId] && !state.closingExtras?.[fieldId]) {
          cierreErrors[fieldId] = 'Requerido';
        }
      });
    } else {
      if (!state.cierre.lugar) cierreErrors.lugar = 'Requerido';
      if (!state.cierre.fecha) cierreErrors.fecha = 'Requerido';
    }
    if (!isCddMonitoreo && Object.keys(cierreErrors).length > 0) errors.cierre = cierreErrors;

    const firmasErrors = {};
    if (!isCddMonitoreo) {
      if (!isBuilderTemplate || activeClosingFieldIds.includes('dni_monitored')) {
        if (!state.firmas.docente.dni) firmasErrors.docenteDni = 'Requerido';
      }
      if (!isBuilderTemplate || activeClosingFieldIds.includes('dni_monitor')) {
        if (!state.firmas.monitor.dni) firmasErrors.monitorDni = 'Requerido';
      }
      if (Object.keys(firmasErrors).length > 0) errors.firmas = firmasErrors;
    }

    const hasValidationErrors = Object.keys(errors).length > 0;
    dispatch({ type: 'SET_ERRORS', payload: errors });
    if (hasValidationErrors) {
      const firstErrorSectionId = getFirstErrorSectionId(errors);
      if (firstErrorSectionId) {
        const target = document.getElementById(firstErrorSectionId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveSection(firstErrorSectionId);
        }
      }
    }

    let instanceToSave = activeInstance;
    if (!instanceToSave && !isReadOnly) {
      const created = await createInstance(selectedTemplate?.id, templateStatus, selectedSheetId);
      if (created) {
        instanceToSave = created;
        setActiveInstance(created);
      }
    }

    if (!isReadOnly && !instanceToSave) {
      pushAutosaveAlert('No se pudo crear la ficha activa para guardar tus cambios.');
      setToast('No se pudo preparar el guardado. Intenta nuevamente.');
      setIsSaving(false);
      return;
    }

    if (instanceToSave && !isReadOnly) {
      try {
        const now = new Date().toISOString();
        await upsertInstance({
          ...instanceToSave,
          updated_at: now,
          status: isCddMonitoreo ? cddStatusMeta.key : instanceToSave.status || 'in_progress',
          data: serializeStateWithSheet(state, selectedSheetId),
        });
      } catch (error) {
        pushAutosaveAlert('No se pudieron guardar tus cambios en Supabase.');
        setToast(`Error de guardado. ${error?.message || 'Verifica tu conexion e intenta nuevamente.'}`);
        setIsSaving(false);
        return;
      }
    }

    dispatch({
      type: 'MARK_SAVED',
      value: true,
      lastSavedAt: new Date().toISOString(),
    });
    setToast(
      hasValidationErrors
        ? 'Cambios guardados. Aun faltan campos obligatorios por completar.'
        : 'Cambios guardados correctamente.',
    );
    clearAutosaveAlert();
    setIsSaving(false);
  };

  const handleReset = () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = async () => {
    if (activeInstance) {
      try {
        await upsertInstance({
          ...activeInstance,
          updated_at: new Date().toISOString(),
          status: 'in_progress',
          data: serializeStateWithSheet(createInitialState(templateSections), selectedSheetId),
        });
        clearAutosaveAlert();
      } catch {
        pushAutosaveAlert('No se pudo reiniciar la ficha en Supabase.');
      }
    }
    dispatch({ type: 'RESET', sections: templateSections });
    setIsResetConfirmOpen(false);
  };

  const resolveHeaderFieldInputType = (fieldId) => {
    if (fieldId === 'application_date') return 'date';
    if (fieldId === 'start_time' || fieldId === 'end_time') return 'time';
    if (fieldId === 'visit_count') return 'number';
    if (fieldId === 'monitored_phone') return 'tel';
    if (fieldId === 'monitored_email') return 'email';
    return 'text';
  };

  const resolveHeaderFieldSelectOptions = (fieldId) => {
    if (fieldId === 'monitor_doc_type' || fieldId === 'monitored_doc_type') return DOC_TYPE_OPTIONS;
    if (fieldId === 'monitored_condition') return CONDITION_OPTIONS;
    if (fieldId === 'monitoring_area') return MONITORING_AREA_OPTIONS;
    return null;
  };

  const renderHeaderField = (fieldId) => {
    if (fieldId === 'institution_name') {
      return (
        <div
          key={fieldId}
          ref={institutionAutocompleteRef}
          className="flex flex-col gap-1.5 text-[14px] leading-[1.5] text-slate-200"
        >
          <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
            {BUILDER_HEADER_FIELD_LABELS[fieldId] || 'Institucion educativa'}
          </span>
          <div className="relative">
            <input
              id="institucion"
              value={state.header.institucion}
              onChange={(event) => {
                dispatch({
                  type: 'UPDATE_HEADER',
                  field: 'institucion',
                  value: event.target.value,
                });
                if (!isReadOnly) setIsInstitutionAutocompleteOpen(true);
              }}
              onFocus={() => {
                if (!isReadOnly) setIsInstitutionAutocompleteOpen(true);
              }}
              onKeyDown={handleInstitutionKeyDown}
              placeholder="Nombre de la I.E."
              autoComplete="off"
              disabled={isReadOnly}
              className="h-9 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-[14px] leading-[1.5] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-70"
            />

            {isInstitutionAutocompleteOpen && !isReadOnly && state.header.institucion.trim() ? (
              <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/95 shadow-[0_12px_34px_rgba(2,6,23,0.45)]">
                {isInstitutionCatalogLoading ? (
                  <p className="px-3 py-2 text-sm text-slate-400">Cargando instituciones...</p>
                ) : institutionSuggestions.length ? (
                  <div className="max-h-72 overflow-y-auto">
                    {institutionSuggestions.map((item) => (
                      <button
                        key={`ie-suggestion-${item.id}`}
                        type="button"
                        onClick={() => applyAutocompleteSelection(item, 'institution_name')}
                        className="flex w-full flex-col gap-1 border-b border-slate-800/80 px-3 py-2 text-left last:border-b-0 hover:bg-slate-900/70"
                      >
                        <span className="truncate text-sm font-semibold text-slate-100">{item.nombre_ie}</span>
                        <span className="truncate text-xs text-slate-400">
                          Cod. modular: {item.cod_modular || '-'} | Cod. local: {item.cod_local || '-'} |{' '}
                          {item.distrito || '-'} | {formatInstitutionLevel(item.nivel)} |{' '}
                          {item.modalidad || '-'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-3 py-2 text-sm text-slate-400">No se encontraron IE.</p>
                )}
              </div>
            ) : null}
          </div>
          {state.errors?.header?.institucion ? (
            <span className="text-xs text-rose-400">{state.errors.header.institucion}</span>
          ) : null}
          {institutionCatalogError ? (
            <span className="text-xs text-amber-300">{institutionCatalogError}</span>
          ) : null}
        </div>
      );
    }

    const binding = BUILDER_HEADER_BINDINGS[fieldId];
    const selectOptions = resolveHeaderFieldSelectOptions(fieldId);
    const errorKey = binding?.area === 'header' ? binding.key : fieldId;
    const error = state.errors?.header?.[errorKey];

    if (binding?.area === 'header') {
      const value = state.header?.[binding.key] || '';
      const label = BUILDER_HEADER_FIELD_LABELS[fieldId] || fieldId;
      if (selectOptions) {
        return (
          <Select
            key={fieldId}
            id={`header-${fieldId}`}
            label={label}
            value={value}
            onChange={(event) =>
              dispatch({ type: 'UPDATE_HEADER', field: binding.key, value: event.target.value })
            }
            error={error}
          >
            <option value="">Seleccionar</option>
            {selectOptions.map((option) => (
              <option key={`${fieldId}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        );
      }

      return (
        <Input
          key={fieldId}
          id={`header-${fieldId}`}
          label={label}
          value={value}
          onChange={(event) =>
            dispatch({ type: 'UPDATE_HEADER', field: binding.key, value: event.target.value })
          }
          error={error}
          placeholder="Completar"
        />
      );
    }

    const label = BUILDER_HEADER_FIELD_LABELS[fieldId] || fieldId;
    const value = state.headerExtras?.[fieldId] || '';

    if (selectOptions) {
      return (
        <Select
          key={fieldId}
          id={`header-extra-${fieldId}`}
          label={label}
          value={value}
          onChange={(event) =>
            dispatch({ type: 'UPDATE_HEADER_EXTRA', field: fieldId, value: event.target.value })
          }
          error={error}
        >
          <option value="">Seleccionar</option>
          {selectOptions.map((option) => (
            <option key={`${fieldId}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    }

    return (
      <Input
        key={fieldId}
        id={`header-extra-${fieldId}`}
        label={label}
        type={resolveHeaderFieldInputType(fieldId)}
        value={value}
        onChange={(event) =>
          dispatch({ type: 'UPDATE_HEADER_EXTRA', field: fieldId, value: event.target.value })
        }
        error={error}
        placeholder="Completar"
      />
    );
  };

  if (isTemplateLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <SectionHeader eyebrow="Formulario" title="Cargando formulario..." />
        </Card>
      </div>
    );
  }

  if (templateError) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-3">
          <SectionHeader eyebrow="Error" title="No se pudo cargar el formulario" />
          <p className="text-sm text-slate-400">{templateError}</p>
          <Link
            to={returnContext.path}
            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
          >
            {returnContext.label}
          </Link>
        </Card>
      </div>
    );
  }

  if (isCddMonitoreo) {
    const detailItems = [
      ['Estado', cddStatusMeta.label],
      ['Responsable', cddResponsableValue],
      ['Area', getCddArea(selectedTemplate) || state.header?.area || 'No definida'],
      ['Codigo', state.meta?.sessionId || 'Sin codigo'],
      ['Ficha', selectedSheetLabel || 'Indicador CdD'],
    ];
    const auditItems = [
      ['Creado', formatCddDate(activeInstance?.created_at)],
      ['Guardado', formatCddDate(state.meta?.lastSavedAt || activeInstance?.updated_at)],
    ];
    const historyItems = [
      {
        title: `Avance actualizado a ${cddAvanceNumber || 0}`,
        detail: `${formatCddDate(cddFechaValue)} · ${cddResponsableValue}`,
        active: true,
      },
      {
        title: `Meta registrada en ${cddMetaNumber || 0}`,
        detail: formatCddDate(activeInstance?.created_at || cddFechaValue),
      },
      {
        title: 'Ficha creada',
        detail: `${formatCddDate(activeInstance?.created_at)} · Administracion Central`,
      },
    ];

    return (
      <div className="relative flex flex-col gap-6 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] text-slate-900 dark:text-slate-100">
        <section className="rounded-[28px] border border-slate-200/80 bg-[#f6fafe] p-5 shadow-sm dark:border-[#a9927d]/35 dark:bg-[#22333b] sm:p-6 lg:p-8">
          <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link
                to={returnContext.path}
                className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 transition hover:text-cyan-600 dark:text-cyan-200 dark:hover:text-cyan-100"
              >
                <ArrowLeft size={16} />
                Volver a fichas CdD
              </Link>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="max-w-4xl text-xl font-extrabold leading-snug tracking-tight text-slate-950 dark:text-slate-50 lg:text-3xl">
                  {formTitle}
                </h1>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${cddStatusMeta.badgeClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${cddStatusMeta.dotClass}`} />
                  {cddStatusMeta.label}
                </span>
              </div>
              <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
                {selectedSheetLabel || 'Indicador CdD'} · Compromiso de Desempeño
              </p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Clock size={15} />
                Última actualización: {formatCddDateTime(state.meta?.lastSavedAt || activeInstance?.updated_at || cddFechaValue)}
              </p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Card className="border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:border-[#a9927d]/35 dark:bg-[#151c23] sm:p-6">
                <div className="grid gap-5 sm:grid-cols-3">
                  {[
                    ['Meta', cddMetaNumber || 0, 'text-slate-950 dark:text-slate-50'],
                    ['Avance', cddAvanceNumber || 0, 'text-cyan-700 dark:text-cyan-200'],
                    ['Cumplimiento', cddProgressLabel, 'text-cyan-600 dark:text-cyan-200'],
                  ].map(([label, value, className]) => (
                    <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
                      <p className={`mt-2 text-3xl font-extrabold tracking-tight ${className}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Progreso actual del compromiso</span>
                    <span className="font-bold text-cyan-700 dark:text-cyan-200">{cddAvanceNumber || 0}/{cddMetaNumber || 0}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-500 shadow-[0_0_16px_rgba(6,182,212,0.25)]"
                      style={{ width: `${cddProgress}%` }}
                    />
                  </div>
                </div>
              </Card>

              <Card className="overflow-hidden border-slate-200/80 bg-white/95 p-0 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:border-[#a9927d]/35 dark:bg-[#151c23]">
                <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-white/10 dark:bg-white/5 sm:px-6">
                  <h2 className="text-lg font-extrabold text-slate-950 dark:text-slate-50">Actualizar avance</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Actualiza solo los valores ejecutivos del compromiso.</p>
                </div>
                <fieldset disabled={isReadOnly} className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Meta</span>
                    <input
                      type="number"
                      value={cddMetaValue}
                      onChange={(event) => updateCddMetric('meta', event.target.value)}
                      className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 text-xl font-extrabold text-slate-950 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:border-[#a9927d]/45 dark:bg-[#22333b] dark:text-slate-50 dark:focus:ring-cyan-400/15"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Avance actual</span>
                    <input
                      type="number"
                      value={cddAvanceValue}
                      onChange={(event) => updateCddMetric('avance', event.target.value)}
                      className="h-[52px] w-full rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 text-xl font-extrabold text-cyan-700 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100 dark:focus:ring-cyan-400/15"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Fecha de actualización</span>
                    <input
                      type="date"
                      value={cddFechaValue}
                      onChange={(event) => dispatch({ type: 'UPDATE_DYNAMIC_FIELD', field: 'cddFechaActualizacion', value: event.target.value })}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:border-[#a9927d]/45 dark:bg-[#22333b] dark:text-slate-100 dark:focus:ring-cyan-400/15"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Responsable</span>
                    <input
                      value={cddResponsableValue}
                      onChange={(event) => dispatch({ type: 'UPDATE_DYNAMIC_FIELD', field: 'cddResponsable', value: event.target.value })}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:border-[#a9927d]/45 dark:bg-[#22333b] dark:text-slate-100 dark:focus:ring-cyan-400/15"
                    />
                  </label>
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Observación</span>
                    <textarea
                      rows={4}
                      value={cddObservacionValue}
                      onChange={(event) => dispatch({ type: 'UPDATE_DYNAMIC_FIELD', field: 'cddObservacion', value: event.target.value })}
                      placeholder="Añada notas breves sobre el avance, evidencias o alertas relevantes..."
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:border-[#a9927d]/45 dark:bg-[#22333b] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-cyan-400/15"
                    />
                  </label>
                </fieldset>
              </Card>

              <Card className="border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:border-[#a9927d]/35 dark:bg-[#151c23] sm:p-6">
                <div className="mb-5 flex items-center gap-2">
                  <History size={20} className="text-cyan-600 dark:text-cyan-200" />
                  <h2 className="text-lg font-extrabold text-slate-950 dark:text-slate-50">Historial de avances</h2>
                </div>
                <div className="relative space-y-7 before:absolute before:left-[9px] before:top-2 before:h-[calc(100%-1rem)] before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-cyan-500 dark:before:bg-cyan-300">
                  {historyItems.map((item) => (
                    <div key={`${item.title}-${item.detail}`} className="relative grid grid-cols-[18px_minmax(0,1fr)] items-start gap-4">
                      <span className="z-10 mt-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-cyan-600 bg-cyan-600 shadow-sm dark:border-cyan-300 dark:bg-cyan-400">
                        {item.active ? (
                          <span className="h-[14px] w-[14px] animate-pulse rounded-full border-[3px] border-cyan-600 bg-white shadow-[0_0_8px_rgba(8,182,212,0.45)] dark:border-cyan-400 dark:bg-[#151c23]" />
                        ) : (
                          <Check size={12} strokeWidth={3} className="text-white dark:text-[#151c23]" />
                        )}
                      </span>
                      <div>
                        <p className={`font-bold ${item.active ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-700 dark:text-slate-200'}`}>{item.title}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <aside className="xl:sticky xl:top-24 xl:h-fit">
              <Card className="border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:border-[#a9927d]/35 dark:bg-[#151c23] sm:p-6">
                <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
                  <h2 className="text-lg font-extrabold text-slate-950 dark:text-slate-50">Detalles de la ficha</h2>
                  <Info size={20} className="text-slate-400 dark:text-slate-500" />
                </div>
                <div className="space-y-4">
                  {detailItems.map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/75 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</p>
                      {label === 'Estado' ? (
                        <span className={`mt-2 inline-flex w-fit items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${cddStatusMeta.badgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cddStatusMeta.dotClass}`} />
                          {value}
                        </span>
                      ) : (
                        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">{value}</p>
                      )}
                    </div>
                  ))}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {auditItems.map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/75 p-4 dark:border-white/10 dark:bg-white/5">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 dark:border-cyan-400/20 dark:bg-cyan-400/10">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-950 dark:text-slate-50">Seguimiento ejecutivo</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Meta, avance y cumplimiento en una sola ficha CdD.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </aside>
          </div>
        </section>

        {!isReadOnly ? (
          <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-1/2 z-50 w-[min(980px,calc(100vw-1.5rem))] -translate-x-1/2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/92 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-[#a9927d]/35 dark:bg-[#151c23]/92">
              <div className="flex items-center gap-3 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${state.meta.saved ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className="text-slate-700 dark:text-slate-200">
                  {state.meta.saved ? 'Guardado correctamente' : 'Cambios sin guardar'}
                </span>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  <RotateCcw size={16} />
                  Restablecer
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-black text-white shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  {isSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <ConfirmModal
          open={isResetConfirmOpen}
          tone="warning"
          title="Limpiar ficha CdD"
          description="Se limpiaran los valores editados de esta ficha CdD. Deseas continuar?"
          confirmText="Si, limpiar"
          cancelText="Cancelar"
          onCancel={() => setIsResetConfirmOpen(false)}
          onConfirm={handleConfirmReset}
        />

        <Toast
          message={toast}
          onClose={() => setToast('')}
          positionClass="bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] right-6"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-[calc(9rem+env(safe-area-inset-bottom,0px))] md:gap-8">
      <div className="glass-panel sticky top-[calc(0.5rem+env(safe-area-inset-top,0px))] z-30 rounded-2xl px-4 py-3 md:px-6 md:py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Sesion</p>
            <h1 className="text-lg font-semibold text-slate-100">{state.meta.sessionId}</h1>
            {state.meta.lastSavedAt ? (
              <p className="text-xs text-slate-400">
                Ultimo guardado: {new Date(state.meta.lastSavedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={returnContext.path}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
            >
              {returnContext.label}
            </Link>
              <Badge
                label={state.meta.saved ? 'Guardado' : 'Pendiente'}
                tone={state.meta.saved ? 'success' : 'warning'}
              />
              {isSaving ? (
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                  Guardando cambios...
                </span>
              ) : null}
              {isReadOnly ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                Monitoreo no disponible. Solo lectura.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-24 xl:h-fit">
          <Card className="space-y-3">
            <SectionHeader eyebrow="Navegacion" title="Secciones del formulario" />
            <p className="text-xs text-slate-400">{formProgress}% completado · {formNavItems.filter((item) => item.status === 'completed').length}/{formNavItems.length} secciones</p>
            <div className="space-y-2">
              {formNavItems.map((item) => {
                const isActive = activeSection === item.id;
                const toneClass = item.status === 'completed'
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'
                  : item.status === 'in_progress'
                    ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100'
                    : 'border-slate-700/70 bg-slate-900/45 text-slate-300';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${toneClass} ${isActive ? 'ring-1 ring-cyan-400/50' : 'hover:border-slate-500'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{item.label}</span>
                      <span className="text-[10px] opacity-80">{item.detail}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </aside>

      <fieldset disabled={isReadOnly} className={isReadOnly ? 'opacity-90' : ''}>
        {isBuilderTemplate && selectedSheetQuestionCount === 0 ? (
          <Card>
            <p className="text-sm text-amber-200">
              Esta ficha aun no tiene preguntas configuradas. Ve a Gestion de monitoreos (Etapa 6 y 7) y agrega secciones/preguntas para esta ficha.
            </p>
          </Card>
        ) : null}

        <Card>
          <SectionHeader
            eyebrow="Formulario"
            title={formTitle}
            description={selectedSheetLabel ? `Ficha seleccionada: ${selectedSheetLabel}` : undefined}
          />
        </Card>

      {showExecutionHeaderSection ? (
        <section id="datos" className="scroll-mt-28">
          <Card className="flex flex-col gap-6">
            <SectionHeader
              eyebrow="Encabezado"
              title="Datos de identificacion"
              description="Registra los campos activos definidos en la ficha publicada."
            />
            <div className="space-y-4">
              {groupedHeaderFields.map((group) => (
                <div key={group.id} className="rounded-xl border border-slate-800/80 bg-slate-900/45 p-4">
                  <p className="text-sm font-semibold text-slate-100">{group.title}</p>
                  <p className="text-small mt-1">{group.description}</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {group.fields.map((fieldId) => renderHeaderField(fieldId))}
                  </div>
                </div>
              ))}

              {activeDynamicFields.length ? (
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 p-4">
                  <p className="text-sm font-semibold text-slate-100">Campos personalizados</p>
                  <p className="text-small mt-1">Campos adicionales definidos en la ficha.</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {activeDynamicFields.map((field) => {
                      const fieldKey = String(field.id || '');
                      if (!fieldKey) return null;
                      const fieldType = String(field.type || 'text').toLowerCase();
                      const label = field.name || 'Campo personalizado';
                      if (fieldType === 'boolean') {
                        return (
                          <Select
                            key={fieldKey}
                            id={`dynamic-${fieldKey}`}
                            label={label}
                            value={state.dynamicFields?.[fieldKey] || ''}
                            onChange={(event) =>
                              dispatch({ type: 'UPDATE_DYNAMIC_FIELD', field: fieldKey, value: event.target.value })
                            }
                            error={state.errors?.header?.[`dynamic_${fieldKey}`]}
                          >
                            <option value="">Seleccionar</option>
                            <option value="SI">Si</option>
                            <option value="NO">No</option>
                          </Select>
                        );
                      }
                      if (fieldType === 'select') {
                        const options = Array.isArray(field.options) ? field.options : [];
                        return (
                          <Select
                            key={fieldKey}
                            id={`dynamic-${fieldKey}`}
                            label={label}
                            value={state.dynamicFields?.[fieldKey] || ''}
                            onChange={(event) =>
                              dispatch({ type: 'UPDATE_DYNAMIC_FIELD', field: fieldKey, value: event.target.value })
                            }
                            error={state.errors?.header?.[`dynamic_${fieldKey}`]}
                          >
                            <option value="">Seleccionar</option>
                            {options.map((option) => {
                              const optionValue = String(option || '').trim();
                              return (
                                <option key={`${fieldKey}-${optionValue}`} value={optionValue}>
                                  {optionValue}
                                </option>
                              );
                            })}
                          </Select>
                        );
                      }
                      return (
                        <Input
                          key={fieldKey}
                          id={`dynamic-${fieldKey}`}
                          label={label}
                          type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                          value={state.dynamicFields?.[fieldKey] || ''}
                          onChange={(event) =>
                            dispatch({ type: 'UPDATE_DYNAMIC_FIELD', field: fieldKey, value: event.target.value })
                          }
                          error={state.errors?.header?.[`dynamic_${fieldKey}`]}
                          placeholder="Completar"
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      ) : null}

      {showLevelInfoCard ? (
        <Card>
          <SectionHeader
            eyebrow="Cuadro informativo"
            title="Nivel de avance"
            description="Estos niveles se mantienen visibles como referencia para cada item."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            {templateLevels.map((item, index) => (
              <Badge
                key={item.key || item.label || index}
                label={`${item.label} - ${item.description}`}
                tone={index === 0 ? 'warning' : index === 1 ? 'blue' : index === 2 ? 'success' : 'info'}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {templateSections.map((section, index) => (
        <section key={section.id} id={section.id} className="scroll-mt-28">
          <Card className="flex flex-col gap-6">
            <SectionHeader eyebrow={`Seccion ${index + 1}`} title={section.title} />
            <div className="flex flex-col gap-4">
              {section.questions.map((question) => {
                const data = state.questions[question.id] || { answer: null, level: null, obs: '' };
                const questionKind = resolveQuestionKind(question);
                const optionValues = Array.isArray(question.sourceOptions) && question.sourceOptions.length
                  ? question.sourceOptions
                  : Array.isArray(question.options) && question.options.length
                    ? question.options
                    : [];
                const showObservation = question.allowObservation !== false;
                const isDisabled = data.answer !== 'SI';
                const useInstitutionPredictor =
                  questionKind === 'text' &&
                  (question.sourcePredictiveSearch === true || question.predictiveSearch === true);
                const questionInstitutionSuggestions = useInstitutionPredictor
                  ? getInstitutionSuggestions(data.answer || '', 8)
                  : [];
                const isQuestionAutocompleteOpen = activeQuestionAutocompleteId === question.id;
                return (
                  <div key={question.id} className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
                    <div className="flex flex-col gap-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-100">{question.text}</p>
                        {state.errors?.questions?.[question.id] ? (
                          <p className="text-xs text-rose-400">{state.errors.questions[question.id]}</p>
                        ) : null}
                      </div>
                    </div>

                    {questionKind === 'yes_no_levels' ? (
                      <div className={`mt-4 flex flex-col gap-4 ${isDisabled ? 'opacity-50' : ''}`}>
                        <Toggle
                          value={data.answer}
                          onChange={(value) =>
                            dispatch({
                              type: 'UPDATE_QUESTION',
                              id: question.id,
                              payload: {
                                answer: value,
                                level: value === 'NO' ? null : data.level,
                                obs: value === 'NO' ? '' : data.obs,
                              },
                            })
                          }
                        />
                        {data.answer === 'NO' ? (
                          <p className="text-xs text-slate-400">
                            Selecciona "Si" para registrar nivel de logro y observacion.
                          </p>
                        ) : null}
                        <div className="flex flex-col gap-2">
                          <span className="text-xs uppercase tracking-wide text-slate-400">
                            Nivel de logro
                          </span>
                          <LevelPills
                            value={data.level}
                            onChange={(value) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { level: value },
                              })
                            }
                            disabled={isDisabled}
                            levels={templateLevels}
                          />
                        </div>
                        {showObservation ? (
                          <Textarea
                            id={`${question.id}-obs`}
                            label="Observacion"
                            value={data.obs}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { obs: event.target.value },
                              })
                            }
                            disabled={isDisabled}
                            placeholder="Registrar observaciones..."
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {questionKind === 'yes_no' ? (
                      <div className="mt-4 flex flex-col gap-4">
                        <Toggle
                          value={data.answer}
                          onChange={(value) =>
                            dispatch({
                              type: 'UPDATE_QUESTION',
                              id: question.id,
                              payload: { answer: value },
                            })
                          }
                        />
                        {showObservation ? (
                          <Textarea
                            id={`${question.id}-obs`}
                            label="Observacion"
                            value={data.obs}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { obs: event.target.value },
                              })
                            }
                            placeholder="Registrar observaciones..."
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {questionKind === 'options' ? (
                      <div className="mt-4 flex flex-col gap-4">
                        <div className="flex flex-wrap gap-2">
                          {optionValues.map((option) => {
                            const optionValue = String(option || '').trim();
                            const selected = String(data.answer || '') === optionValue;
                            return (
                              <button
                                key={`${question.id}-${optionValue}`}
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'UPDATE_QUESTION',
                                    id: question.id,
                                    payload: { answer: optionValue },
                                  })
                                }
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  selected
                                    ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100'
                                    : 'border-slate-700/70 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                {optionValue}
                              </button>
                            );
                          })}
                        </div>
                        {showObservation ? (
                          <Textarea
                            id={`${question.id}-obs`}
                            label="Observacion"
                            value={data.obs}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { obs: event.target.value },
                              })
                            }
                            placeholder="Registrar observaciones..."
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {questionKind === 'text' ? (
                      <div className="mt-4 flex flex-col gap-4">
                        {useInstitutionPredictor ? (
                          <div
                            className="flex flex-col gap-1.5 text-[14px] leading-[1.5] text-slate-200"
                            data-question-ie-autocomplete={question.id}
                          >
                            <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                              Respuesta (buscador de IE)
                            </span>
                            <div className="relative">
                              <input
                                id={`${question.id}-text`}
                                value={data.answer || ''}
                                onChange={(event) => {
                                  dispatch({
                                    type: 'UPDATE_QUESTION',
                                    id: question.id,
                                    payload: { answer: event.target.value },
                                  });
                                  setActiveQuestionAutocompleteId(question.id);
                                }}
                                onFocus={() => setActiveQuestionAutocompleteId(question.id)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    setActiveQuestionAutocompleteId((current) =>
                                      current === question.id ? '' : current);
                                  }, 120);
                                }}
                                onKeyDown={(event) =>
                                  handleQuestionInstitutionKeyDown(
                                    event,
                                    question.id,
                                    questionInstitutionSuggestions,
                                  )
                                }
                                placeholder="Escribe el nombre de la I.E."
                                autoComplete="off"
                                className="h-9 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-[14px] leading-[1.5] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                              />
                              {isQuestionAutocompleteOpen && String(data.answer || '').trim() ? (
                                <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/95 shadow-[0_12px_34px_rgba(2,6,23,0.45)]">
                                  {isInstitutionCatalogLoading ? (
                                    <p className="px-3 py-2 text-sm text-slate-400">Cargando instituciones...</p>
                                  ) : questionInstitutionSuggestions.length ? (
                                    <div className="max-h-72 overflow-y-auto">
                                      {questionInstitutionSuggestions.map((item) => (
                                        <button
                                          key={`question-ie-suggestion-${question.id}-${item.id}`}
                                          type="button"
                                          onMouseDown={(event) => event.preventDefault()}
                                          onClick={() =>
                                            applyQuestionAutocompleteSelection(question.id, item)
                                          }
                                          className="flex w-full flex-col gap-1 border-b border-slate-800/80 px-3 py-2 text-left last:border-b-0 hover:bg-slate-900/70"
                                        >
                                          <span className="truncate text-sm font-semibold text-slate-100">
                                            {item.nombre_ie}
                                          </span>
                                          <span className="truncate text-xs text-slate-400">
                                            Cod. modular: {item.cod_modular || '-'} | Cod. local:{' '}
                                            {item.cod_local || '-'} | {item.distrito || '-'} |{' '}
                                            {formatInstitutionLevel(item.nivel)} | {item.modalidad || '-'}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="px-3 py-2 text-sm text-slate-400">No se encontraron IE.</p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            {institutionCatalogError ? (
                              <span className="text-xs text-amber-300">{institutionCatalogError}</span>
                            ) : null}
                          </div>
                        ) : (
                          <Textarea
                            id={`${question.id}-text`}
                            label="Respuesta"
                            value={data.answer || ''}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { answer: event.target.value },
                              })
                            }
                            placeholder="Escribe tu respuesta..."
                          />
                        )}
                        {showObservation ? (
                          <Textarea
                            id={`${question.id}-obs`}
                            label="Observacion"
                            value={data.obs}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { obs: event.target.value },
                              })
                            }
                            placeholder="Registrar observaciones..."
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {questionKind === 'number' ? (
                      <div className="mt-4 flex flex-col gap-4">
                        <Input
                          id={`${question.id}-number`}
                          type="number"
                          label="Respuesta numerica"
                          value={data.answer || ''}
                          onChange={(event) =>
                            dispatch({
                              type: 'UPDATE_QUESTION',
                              id: question.id,
                              payload: { answer: event.target.value },
                            })
                          }
                          placeholder="Ingresa un valor"
                        />
                        {showObservation ? (
                          <Textarea
                            id={`${question.id}-obs`}
                            label="Observacion"
                            value={data.obs}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { obs: event.target.value },
                              })
                            }
                            placeholder="Registrar observaciones..."
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {questionKind === 'pdf' ? (
                      <div className="mt-4 flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5 text-[14px] leading-[1.5] text-slate-200">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Archivo PDF</span>
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { answer: file ? file.name : '' },
                              });
                            }}
                            className="h-9 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-[13px] leading-[1.5] text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-xs file:text-slate-200"
                          />
                          {data.answer ? (
                            <span className="text-xs text-slate-400">Archivo seleccionado: {data.answer}</span>
                          ) : null}
                        </div>
                        {showObservation ? (
                          <Textarea
                            id={`${question.id}-obs`}
                            label="Observacion"
                            value={data.obs}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { obs: event.target.value },
                              })
                            }
                            placeholder="Registrar observaciones..."
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {!['yes_no_levels', 'yes_no', 'options', 'text', 'number', 'pdf'].includes(questionKind) ? (
                      <div className="mt-4 flex flex-col gap-4">
                        <Textarea
                          id={`${question.id}-fallback`}
                          label="Respuesta"
                          value={data.answer || ''}
                          onChange={(event) =>
                            dispatch({
                              type: 'UPDATE_QUESTION',
                              id: question.id,
                              payload: { answer: event.target.value },
                            })
                          }
                          placeholder="Escribe tu respuesta..."
                        />
                        {showObservation ? (
                          <Textarea
                            id={`${question.id}-obs`}
                            label="Observacion"
                            value={data.obs}
                            onChange={(event) =>
                              dispatch({
                                type: 'UPDATE_QUESTION',
                                id: question.id,
                                payload: { obs: event.target.value },
                              })
                            }
                            placeholder="Registrar observaciones..."
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      ))}

      {showClosingContainer ? (
        <section id="cierre" className="scroll-mt-28">
          <div className="flex flex-col gap-6">
            {showGeneralSection ? (
              <Card className="flex flex-col gap-6">
                <SectionHeader
                  eyebrow="Seccion general"
                  title="Observacion general y compromiso"
                  description="Sintesis del monitoreo y acuerdos con el docente monitoreado."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  {showGeneralObservation ? (
                    <Textarea
                      id="observacion-general"
                      label="Observacion general"
                      value={state.general.observacion}
                      onChange={(event) =>
                        dispatch({ type: 'UPDATE_GENERAL', field: 'observacion', value: event.target.value })
                      }
                      placeholder="Resumen del monitoreo"
                    />
                  ) : null}
                  {showGeneralCommitment ? (
                    <Textarea
                      id="compromiso"
                      label="Compromiso segun resultados del monitoreo"
                      value={state.general.compromiso}
                      onChange={(event) =>
                        dispatch({ type: 'UPDATE_GENERAL', field: 'compromiso', value: event.target.value })
                      }
                      placeholder="Compromisos establecidos"
                    />
                  ) : null}
                </div>
              </Card>
            ) : null}

            {showPlaceDateSection ? (
              <Card className="flex flex-col gap-6">
                <SectionHeader eyebrow="Lugar y fecha" title="Lugar y fecha" />
                <div className="grid gap-4 md:grid-cols-2">
                  {showClosingPlace ? (
                    <Input
                      id="lugar"
                      label="Lugar (Distrito)"
                      value={state.cierre.lugar}
                      onChange={(event) =>
                        dispatch({ type: 'UPDATE_CIERRE', field: 'lugar', value: event.target.value })
                      }
                      error={state.errors?.cierre?.lugar}
                      placeholder="Distrito"
                    />
                  ) : null}
                  {showClosingDate ? (
                    <Input
                      id="fecha"
                      type="date"
                      label="Fecha"
                      value={state.cierre.fecha}
                      onChange={(event) =>
                        dispatch({ type: 'UPDATE_CIERRE', field: 'fecha', value: event.target.value })
                      }
                      error={state.errors?.cierre?.fecha}
                    />
                  ) : null}
                </div>
              </Card>
            ) : null}

            {extraClosingFieldIds.length ? (
              <Card className="flex flex-col gap-6">
                <SectionHeader eyebrow="Cierre" title="Campos adicionales de cierre" />
                <div className="grid gap-4 md:grid-cols-2">
                  {extraClosingFieldIds.map((fieldId) => (
                    <Input
                      key={fieldId}
                      id={`closing-extra-${fieldId}`}
                      label={BUILDER_CLOSING_FIELD_LABELS[fieldId] || fieldId}
                      value={state.closingExtras?.[fieldId] || ''}
                      onChange={(event) =>
                        dispatch({ type: 'UPDATE_CLOSING_EXTRA', field: fieldId, value: event.target.value })
                      }
                      error={state.errors?.cierre?.[fieldId]}
                      placeholder="Completar"
                    />
                  ))}
                </div>
              </Card>
            ) : null}

            {showSignaturesSection ? (
              <Card className="flex flex-col gap-6">
                <SectionHeader eyebrow="Firmas" title="Firmas" description="Firma del docente monitoreado y del monitor." />
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    {showSignaturePads ? (
                      <SignaturePad
                        label="Docente monitoreado"
                        value={state.firmas.docente.firma}
                        onChange={(value) =>
                          dispatch({ type: 'UPDATE_FIRMA', role: 'docente', field: 'firma', value })
                        }
                        disabled={isReadOnly}
                      />
                    ) : null}
                    <Input
                      id="docente-nombre"
                      label="Nombre"
                      value={state.firmas.docente.nombre}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_FIRMA',
                          role: 'docente',
                          field: 'nombre',
                          value: event.target.value,
                        })
                      }
                    />
                    {showMonitoredDni ? (
                      <Input
                        id="docente-dni"
                        label="DNI"
                        value={state.firmas.docente.dni}
                        onChange={(event) =>
                          dispatch({
                            type: 'UPDATE_FIRMA',
                            role: 'docente',
                            field: 'dni',
                            value: event.target.value,
                          })
                        }
                        error={state.errors?.firmas?.docenteDni}
                        placeholder="Documento"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-4">
                    {showSignaturePads ? (
                      <SignaturePad
                        label="Monitor"
                        value={state.firmas.monitor.firma}
                        onChange={(value) =>
                          dispatch({ type: 'UPDATE_FIRMA', role: 'monitor', field: 'firma', value })
                        }
                        disabled={isReadOnly}
                      />
                    ) : null}
                    <Input
                      id="monitor-nombre"
                      label="Nombre del monitor"
                      value={state.firmas.monitor.nombre}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_FIRMA',
                          role: 'monitor',
                          field: 'nombre',
                          value: event.target.value,
                        })
                      }
                    />
                    {showMonitorDni ? (
                      <Input
                        id="monitor-dni"
                        label="DNI del monitor"
                        value={state.firmas.monitor.dni}
                        onChange={(event) =>
                          dispatch({
                            type: 'UPDATE_FIRMA',
                            role: 'monitor',
                            field: 'dni',
                            value: event.target.value,
                          })
                        }
                        error={state.errors?.firmas?.monitorDni}
                        placeholder="Documento"
                      />
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      </fieldset>
      </div>

      <div className="glass-panel flex items-center justify-between rounded-2xl px-6 py-4 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <span>Guardado manual activo. Usa "Guardar cambios" para confirmar.</span>
        </div>
        <span className="text-xs text-slate-500">Listo para conectarse a API.</span>
      </div>

      {!isReadOnly ? (
        <div className="fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-50 w-[min(920px,calc(100vw-1rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)))] -translate-x-1/2">
          <div className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/70 px-3 py-2 shadow-[0_10px_30px_rgba(2,6,23,0.45)]">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className={state.meta.saved ? 'text-emerald-200' : 'text-amber-200'}>
                {state.meta.saved ? '✔ Guardado correctamente' : '● Cambios sin guardar'}
              </span>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Badge
              label={state.meta.saved ? 'Guardado' : 'Pendiente'}
              tone={state.meta.saved ? 'success' : 'warning'}
            />
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
            >
              <RefreshCw size={14} />
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={isResetConfirmOpen}
        tone="warning"
        title="Limpiar formulario"
        description="Se limpiaran las respuestas del formulario actual. Deseas continuar?"
        confirmText="Si, limpiar"
        cancelText="Cancelar"
        onCancel={() => setIsResetConfirmOpen(false)}
        onConfirm={handleConfirmReset}
      />

      <Toast
        message={toast}
        onClose={() => setToast('')}
        positionClass="bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] right-6"
      />
    </div>
  );
}
