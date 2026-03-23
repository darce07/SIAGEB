import { useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
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

const findInProgressInstance = async (templateId) => {
  const userId = getCurrentUserId();
  if (!templateId || !userId) return null;
  const { data, error } = await supabase
    .from('monitoring_instances')
    .select('*')
    .eq('template_id', templateId)
    .eq('created_by', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0] || null;
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
  await supabase.from('monitoring_instances').upsert(instance, { onConflict: 'id' });
};

const createInstance = async (templateId, templateStatus) => {
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
      data: null,
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
  return '-';
};

export default function FichaEscritura() {
  const { setActiveSection } = useContext(SidebarContext);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateError, setTemplateError] = useState('');
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);
  const [templateId, setTemplateId] = useState(() => localStorage.getItem(TEMPLATE_KEY) || '');
  const [activeInstance, setActiveInstance] = useState(null);
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    createInitialState(QUESTION_SECTIONS),
  );
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setIsTemplateLoading(true);
      // 1) Recuperar instancia activa si existe
      const existing = await getActiveInstance();
      if (!active) return;
      if (existing) {
        setActiveInstance(existing);
        if (existing.template_id && existing.template_id !== templateId) {
          localStorage.setItem(TEMPLATE_KEY, existing.template_id);
          setTemplateId(existing.template_id);
        }
      }

      let reusedInstance = null;
      if (!existing && templateId) {
        reusedInstance = await findInProgressInstance(templateId);
        if (!active) return;
        if (reusedInstance) {
          setActiveInstance(reusedInstance);
          localStorage.setItem(INSTANCE_ACTIVE_KEY, reusedInstance.id);
          if (reusedInstance.template_id && reusedInstance.template_id !== templateId) {
            localStorage.setItem(TEMPLATE_KEY, reusedInstance.template_id);
            setTemplateId(reusedInstance.template_id);
          }
        }
      }

      // 2) Cargar plantilla por templateId
      const idToLoad = existing?.template_id || reusedInstance?.template_id || templateId;
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
  const templateSections = useMemo(
    () => selectedTemplate?.sections || QUESTION_SECTIONS,
    [selectedTemplate],
  );
  const isBuilderTemplate = selectedTemplate?.levelsConfig?.type === 'request_builder';
  const builderSheets = useMemo(() => {
    const sheets = selectedTemplate?.levelsConfig?.builder?.sheets;
    return Array.isArray(sheets) ? sheets : [];
  }, [selectedTemplate]);
  const activeBuilderSheet = useMemo(() => {
    if (!builderSheets.length) return null;
    const sheetIdFromSections = templateSections.find((section) => section?.sheetId)?.sheetId;
    return builderSheets.find((sheet) => sheet.id === sheetIdFromSections) || builderSheets[0];
  }, [builderSheets, templateSections]);
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
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [institutionCatalog, setInstitutionCatalog] = useState([]);
  const [isInstitutionCatalogLoading, setIsInstitutionCatalogLoading] = useState(true);
  const [institutionCatalogError, setInstitutionCatalogError] = useState('');
  const [isInstitutionAutocompleteOpen, setIsInstitutionAutocompleteOpen] = useState(false);
  const prevDocenteRef = useRef('');
  const prevMonitorRef = useRef('');
  const institutionAutocompleteRef = useRef(null);

  const allQuestions = useMemo(
    () => templateSections.flatMap((section) => section.questions || []),
    [templateSections],
  );

  const institutionSuggestions = useMemo(() => {
    const term = String(state.header.institucion || '')
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

    return scored.slice(0, 8).map((entry) => entry.item);
  }, [institutionCatalog, state.header.institucion]);

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

      setInstitutionCatalog(data || []);
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

  useEffect(() => {
    if (!activeInstance || isReadOnly) return;
    const now = new Date().toISOString();
    const payload = {
      ...activeInstance,
      updated_at: now,
      status: activeInstance.status || 'in_progress',
      data: serializeState(state),
    };
    upsertInstance(payload);
  }, [activeInstance, isReadOnly, state]);

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
      ...(showHeaderSection ? ['datos'] : []),
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
  }, [setActiveSection, showClosingContainer, showHeaderSection, templateSections]);

  const handleSave = async () => {
    const errors = {};
    const headerErrors = {};

    if (isBuilderTemplate) {
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

    if (Object.keys(headerErrors).length > 0) errors.header = headerErrors;

    const questionErrors = {};
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

    const cierreErrors = {};
    if (isBuilderTemplate) {
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
    if (Object.keys(cierreErrors).length > 0) errors.cierre = cierreErrors;

    const firmasErrors = {};
    if (!isBuilderTemplate || activeClosingFieldIds.includes('dni_monitored')) {
      if (!state.firmas.docente.dni) firmasErrors.docenteDni = 'Requerido';
    }
    if (!isBuilderTemplate || activeClosingFieldIds.includes('dni_monitor')) {
      if (!state.firmas.monitor.dni) firmasErrors.monitorDni = 'Requerido';
    }
    if (Object.keys(firmasErrors).length > 0) errors.firmas = firmasErrors;

    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'SET_ERRORS', payload: errors });
      return;
    }

    let instanceToSave = activeInstance;
    if (!instanceToSave && !isReadOnly) {
      const reused = await findInProgressInstance(selectedTemplate?.id);
      if (reused) {
        instanceToSave = reused;
        setActiveInstance(reused);
        localStorage.setItem(INSTANCE_ACTIVE_KEY, reused.id);
      } else {
        const created = await createInstance(selectedTemplate?.id, templateStatus);
        if (created) {
          instanceToSave = created;
          setActiveInstance(created);
        }
      }
    }

    dispatch({
      type: 'MARK_SAVED',
      value: true,
      lastSavedAt: new Date().toISOString(),
    });
    dispatch({ type: 'SET_ERRORS', payload: {} });
    setToast('Cambios guardados correctamente.');
    if (instanceToSave && !isReadOnly) {
      const now = new Date().toISOString();
      upsertInstance({
        ...instanceToSave,
        updated_at: now,
        status: instanceToSave.status || 'in_progress',
        data: serializeState(state),
      });
    }
  };

  const handleReset = () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = () => {
    if (activeInstance) {
      upsertInstance({
        ...activeInstance,
        updated_at: new Date().toISOString(),
        status: 'in_progress',
        data: serializeState(createInitialState(templateSections)),
      });
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
            to="/monitoreo"
            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
          >
            Volver a monitoreos
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="glass-panel sticky top-6 z-30 rounded-2xl px-6 py-4">
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
              to="/monitoreo"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
            >
              Volver
            </Link>
            <Badge
              label={state.meta.saved ? 'Guardado' : 'Pendiente'}
              tone={state.meta.saved ? 'success' : 'warning'}
            />
            {!isReadOnly ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70"
                >
                  <Save size={14} />
                  Guardar cambios
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                >
                  <RefreshCw size={14} />
                  Reset
                </button>
              </>
            ) : (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                Monitoreo no disponible. Solo lectura.
              </span>
            )}
          </div>
        </div>
      </div>

      <fieldset disabled={isReadOnly} className={isReadOnly ? 'opacity-90' : ''}>
        <Card>
          <SectionHeader eyebrow="Formulario" title={formTitle} />
        </Card>

      {showHeaderSection ? (
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

      <div className="glass-panel flex items-center justify-between rounded-2xl px-6 py-4 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <span>Auto guardado activo en Supabase.</span>
        </div>
        <span className="text-xs text-slate-500">Listo para conectarse a API.</span>
      </div>

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

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
}







