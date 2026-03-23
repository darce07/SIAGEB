import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Input from '../components/ui/Input.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import Select from '../components/ui/Select.jsx';
import Textarea from '../components/ui/Textarea.jsx';
import { supabase } from '../lib/supabase.js';
import { ROLE_ADMIN, resolveUserRole } from '../lib/roles.js';

const STORAGE_KEY = 'monitoreoSolicitudBuilderV1';
const DB_TABLE = 'monitoring_requests';

const REQUEST_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'expired', label: 'Vencido' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'published', label: 'Publicado' },
];

const AUTH_KEY = 'monitoreoAuth';

const REQUEST_EDITABLE_KEYS = [
  'name',
  'detail',
  'startDate',
  'endDate',
  'cdd',
  'managementFilters',
  'modalityFilters',
  'typeFilters',
  'levelFilters',
  'restriction',
  'institutions',
  'sheets',
];

const MANAGEMENT_OPTIONS = [
  { value: 'publica', label: 'Publica' },
  { value: 'privada', label: 'Privada' },
];

const PUBLIC_MANAGEMENT_OPTIONS = [
  { value: 'publica_directa', label: 'Publica de gestion directa' },
  { value: 'publica_privada', label: 'Publica de gestion privada' },
];

const MODALITY_OPTIONS = [
  { value: 'EBR', label: 'EBR' },
  { value: 'EBE', label: 'EBE' },
  { value: 'EBA', label: 'EBA' },
  { value: 'PRONOEI', label: 'PRONOEI' },
];

const TYPE_OPTIONS = [
  { value: 'focalizado', label: 'Focalizado' },
  { value: 'no_focalizado', label: 'No focalizado' },
];

const LEVEL_OPTIONS_BY_MODALITY = {
  EBR: [
    { value: 'ebr_inicial', label: 'Inicial' },
    { value: 'ebr_primaria', label: 'Primaria' },
    { value: 'ebr_secundaria', label: 'Secundaria' },
  ],
  EBE: [
    { value: 'ebe_inicial', label: 'Educacion Basica Especial - Inicial' },
    { value: 'ebe_primaria', label: 'Educacion Basica Especial - Primaria' },
    { value: 'ebe_secundaria', label: 'Educacion Basica Especial - Secundaria' },
  ],
  EBA: [
    { value: 'eba_avanzado', label: 'Educacion Basica Alternativa - Avanzado' },
    { value: 'eba_inicial_intermedio', label: 'Educacion Basica Alternativa - Inicial e Intermedio' },
  ],
  PRONOEI: [{ value: 'pronoei_inicial', label: 'Programas No Escolarizados de Educacion Inicial' }],
};

const DEFAULT_TEMPLATE_LEVELS = [
  { key: 'L1', label: 'Nivel 1', description: '' },
  { key: 'L2', label: 'Nivel 2', description: '' },
  { key: 'L3', label: 'Nivel 3', description: '' },
];

const MANAGEMENT_OPTION_SET = new Set([
  ...MANAGEMENT_OPTIONS.map((item) => item.value),
  ...PUBLIC_MANAGEMENT_OPTIONS.map((item) => item.value),
]);
const PUBLIC_MANAGEMENT_OPTION_SET = new Set(PUBLIC_MANAGEMENT_OPTIONS.map((item) => item.value));
const MODALITY_OPTION_SET = new Set(MODALITY_OPTIONS.map((item) => item.value));
const TYPE_OPTION_SET = new Set(TYPE_OPTIONS.map((item) => item.value));

const sanitizeManagementFilters = (values) => {
  const safeValues = Array.isArray(values) ? values : [];
  const nextValues = [...new Set(safeValues.filter((value) => MANAGEMENT_OPTION_SET.has(value)))];
  const hasPublicDetail = nextValues.some((value) => PUBLIC_MANAGEMENT_OPTION_SET.has(value));
  if (hasPublicDetail && !nextValues.includes('publica')) {
    nextValues.unshift('publica');
  }
  if (!nextValues.includes('publica')) {
    return nextValues.filter((value) => !PUBLIC_MANAGEMENT_OPTION_SET.has(value));
  }
  return nextValues;
};

const sanitizeModalityFilters = (values) => {
  const safeValues = Array.isArray(values) ? values : [];
  return [...new Set(safeValues.filter((value) => MODALITY_OPTION_SET.has(value)))];
};

const getAvailableLevelOptions = (modalityFilters) => {
  const modalities = sanitizeModalityFilters(modalityFilters);
  const map = new Map();
  modalities.forEach((modality) => {
    (LEVEL_OPTIONS_BY_MODALITY[modality] || []).forEach((levelOption) => {
      if (!map.has(levelOption.value)) {
        map.set(levelOption.value, levelOption);
      }
    });
  });
  return Array.from(map.values());
};

const sanitizeLevelFilters = (values, modalityFilters) => {
  const safeValues = Array.isArray(values) ? values : [];
  const allowed = new Set(getAvailableLevelOptions(modalityFilters).map((item) => item.value));
  if (!allowed.size) return [];
  return [...new Set(safeValues.filter((value) => allowed.has(value)))];
};

const sanitizeTypeFilters = (values) => {
  const safeValues = Array.isArray(values) ? values : [];
  const valid = [...new Set(safeValues.filter((value) => TYPE_OPTION_SET.has(value)))];
  return valid.length ? [valid[0]] : [];
};

const normalizeRequestDraft = (draft) => {
  const modalityFilters = sanitizeModalityFilters(draft.modalityFilters);
  return {
    ...draft,
    managementFilters: sanitizeManagementFilters(draft.managementFilters),
    modalityFilters,
    typeFilters: sanitizeTypeFilters(draft.typeFilters),
    levelFilters: sanitizeLevelFilters(draft.levelFilters, modalityFilters),
  };
};

const buildRequestPayloadSnapshot = (requestLike) =>
  REQUEST_EDITABLE_KEYS.reduce((acc, key) => {
    acc[key] = requestLike?.[key];
    return acc;
  }, {});

const applyRequestPayloadSnapshot = (request, snapshot = {}) => {
  const next = { ...request };
  REQUEST_EDITABLE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
      next[key] = snapshot[key];
    }
  });
  return next;
};

const getWorkflowMeta = (request) =>
  request?.workflowMeta && typeof request.workflowMeta === 'object' ? request.workflowMeta : {};

const getEditableRequestView = (request) => {
  const meta = getWorkflowMeta(request);
  if (meta.pendingDraft && typeof meta.pendingDraft === 'object') {
    return applyRequestPayloadSnapshot(request, meta.pendingDraft);
  }
  return request;
};

const hasPendingChanges = (request) => {
  const meta = getWorkflowMeta(request);
  return Boolean(meta.hasPendingChanges || meta.pendingDraft);
};

const hasApprovedSnapshot = (request) => Boolean(getWorkflowMeta(request).approvedSnapshot);

const getWorkflowLabel = (request) => {
  const meta = getWorkflowMeta(request);
  if (meta.hasPendingChanges || meta.pendingDraft) return 'Cambios pendientes de revision';
  if (request.status === 'pending') return 'Pendiente de revision';
  if (request.status === 'approved') return 'Aprobado';
  if (request.status === 'rejected') return 'Requiere ajustes';
  return getStatusLabel(resolveDisplayStatus(request));
};

const normalizeComparisonText = (value) => String(value || '').trim();

const formatFilterList = (values) => {
  if (!Array.isArray(values) || !values.length) return '-';
  return values.map((item) => String(item)).sort().join(', ');
};

const countRequestStructure = (payload = {}) => {
  const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
  let sections = 0;
  let questions = 0;
  let dynamicFields = 0;
  sheets.forEach((sheet) => {
    const sectionRows = Array.isArray(sheet?.sections) ? sheet.sections : [];
    sections += sectionRows.length;
    dynamicFields += Array.isArray(sheet?.dynamicFields) ? sheet.dynamicFields.length : 0;
    sectionRows.forEach((section) => {
      questions += Array.isArray(section?.questions) ? section.questions.length : 0;
    });
  });
  return {
    sheets: sheets.length,
    sections,
    questions,
    dynamicFields,
  };
};

const buildPendingChangesSummary = (request) => {
  if (!request) return [];
  const meta = getWorkflowMeta(request);
  if (!meta.pendingDraft) return [];

  const base = meta.approvedSnapshot || buildRequestPayloadSnapshot(request);
  const next = meta.pendingDraft;
  const changes = [];

  const addSimpleChange = (label, beforeValue, afterValue) => {
    const beforeText = normalizeComparisonText(beforeValue);
    const afterText = normalizeComparisonText(afterValue);
    if (beforeText !== afterText) {
      changes.push(`${label}: ${beforeText || '-'} -> ${afterText || '-'}`);
    }
  };

  addSimpleChange('Nombre', base.name, next.name);
  if (normalizeComparisonText(base.detail) !== normalizeComparisonText(next.detail)) {
    changes.push('Detalle: actualizado');
  }
  addSimpleChange('Fecha de inicio', base.startDate, next.startDate);
  addSimpleChange('Fecha de cierre', base.endDate, next.endDate);
  addSimpleChange('CdD', base.cdd, next.cdd);
  addSimpleChange('Restriccion', base.restriction, next.restriction);

  const beforeManagement = formatFilterList(base.managementFilters);
  const afterManagement = formatFilterList(next.managementFilters);
  if (beforeManagement !== afterManagement) changes.push(`Gestion: ${beforeManagement} -> ${afterManagement}`);

  const beforeModality = formatFilterList(base.modalityFilters);
  const afterModality = formatFilterList(next.modalityFilters);
  if (beforeModality !== afterModality) changes.push(`Modalidad: ${beforeModality} -> ${afterModality}`);

  const beforeType = formatFilterList(base.typeFilters);
  const afterType = formatFilterList(next.typeFilters);
  if (beforeType !== afterType) changes.push(`Tipo: ${beforeType} -> ${afterType}`);

  const beforeLevel = formatFilterList(base.levelFilters);
  const afterLevel = formatFilterList(next.levelFilters);
  if (beforeLevel !== afterLevel) changes.push(`Nivel: ${beforeLevel} -> ${afterLevel}`);

  const beforeInstitutions = Array.isArray(base.institutions) ? base.institutions.length : 0;
  const afterInstitutions = Array.isArray(next.institutions) ? next.institutions.length : 0;
  if (beforeInstitutions !== afterInstitutions) {
    changes.push(`Instituciones focalizadas: ${beforeInstitutions} -> ${afterInstitutions}`);
  }

  const beforeStructure = countRequestStructure(base);
  const afterStructure = countRequestStructure(next);
  if (beforeStructure.sheets !== afterStructure.sheets) {
    changes.push(`Fichas: ${beforeStructure.sheets} -> ${afterStructure.sheets}`);
  }
  if (beforeStructure.sections !== afterStructure.sections) {
    changes.push(`Secciones: ${beforeStructure.sections} -> ${afterStructure.sections}`);
  }
  if (beforeStructure.questions !== afterStructure.questions) {
    changes.push(`Preguntas: ${beforeStructure.questions} -> ${afterStructure.questions}`);
  }
  if (beforeStructure.dynamicFields !== afterStructure.dynamicFields) {
    changes.push(`Campos dinamicos: ${beforeStructure.dynamicFields} -> ${afterStructure.dynamicFields}`);
  }

  return changes;
};

const RESTRICTION_OPTIONS = [
  { value: 'none', label: 'Sin restriccion' },
  { value: 'cod_local', label: 'No repetir por codigo local' },
  { value: 'cod_modular', label: 'No repetir por codigo modular' },
];

const QUESTION_TYPE_OPTIONS = [
  { value: 'yes_no', label: 'Si / No' },
  { value: 'yes_no_levels', label: 'Si / No con niveles' },
  { value: 'options', label: 'Opciones' },
  { value: 'text', label: 'Respuesta abierta' },
  { value: 'number', label: 'Numero' },
  { value: 'pdf', label: 'Archivo PDF' },
];

const DYNAMIC_FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Numero' },
  { value: 'date', label: 'Fecha' },
  { value: 'select', label: 'Lista / Select' },
  { value: 'boolean', label: 'Si / No' },
];

const HEADER_FIELD_OPTIONS = [
  { id: 'institution_name', label: 'Institucion educativa' },
  { id: 'cod_modular', label: 'Codigo modular' },
  { id: 'cod_local', label: 'Codigo local' },
  { id: 'district', label: 'Distrito / Lugar' },
  { id: 'rei', label: 'REI' },
  { id: 'monitor_name', label: 'Monitor(a)' },
  { id: 'monitor_doc_type', label: 'Tipo doc. monitor' },
  { id: 'monitor_doc_number', label: 'Numero doc. monitor' },
  { id: 'monitored_name', label: 'Monitoreado(a)' },
  { id: 'monitored_doc_type', label: 'Tipo doc. monitoreado(a)' },
  { id: 'monitored_doc_number', label: 'Numero doc. monitoreado(a)' },
  { id: 'monitored_position', label: 'Cargo monitoreado(a)' },
  { id: 'monitored_phone', label: 'Telefono monitoreado(a)' },
  { id: 'monitored_email', label: 'Correo monitoreado(a)' },
  { id: 'monitored_condition', label: 'Condicion de monitoreado(a)' },
  { id: 'monitoring_area', label: 'Area que monitorea' },
  { id: 'visit_count', label: 'Numero de visitas a la IE' },
  { id: 'application_date', label: 'Fecha de aplicacion' },
  { id: 'start_time', label: 'Hora de inicio' },
  { id: 'end_time', label: 'Hora de fin' },
];

const CLOSING_FIELD_OPTIONS = [
  { id: 'progress_level', label: 'Nivel de avance' },
  { id: 'general_observation', label: 'Observacion general' },
  { id: 'general_commitment', label: 'Compromiso general' },
  { id: 'closing_place', label: 'Lugar' },
  { id: 'closing_date', label: 'Fecha' },
  { id: 'signature', label: 'Firma' },
  { id: 'dni_monitored', label: 'DNI monitoreado(a)' },
  { id: 'dni_monitor', label: 'DNI monitor(a)' },
];

const getStatusLabel = (status) => {
  const found = REQUEST_STATUSES.find((item) => item.value === status);
  return found ? found.label : 'Pendiente';
};

const getStatusBadgeClass = (status) => {
  if (status === 'approved' || status === 'published') return 'ds-badge ds-badge-success';
  if (status === 'rejected' || status === 'expired') return 'ds-badge ds-badge-danger';
  if (status === 'pending') return 'ds-badge ds-badge-warning';
  return 'ds-badge ds-badge-info';
};

const readStoredRequests = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredRequests = (requests) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  } catch {
    // noop
  }
};

const toDateTimeLocalValue = (value) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)) return text.replace(' ', 'T').slice(0, 16);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const yyyy = parsed.getFullYear();
  const mm = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const dd = `${parsed.getDate()}`.padStart(2, '0');
  const hh = `${parsed.getHours()}`.padStart(2, '0');
  const mi = `${parsed.getMinutes()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const mapRequestFromDbRow = (row) => ({
  id: row.id,
  code: row.code || '',
  name: row.name || '',
  detail: row.detail || '',
  startDate: toDateTimeLocalValue(row.start_date),
  endDate: toDateTimeLocalValue(row.end_date),
  cdd: row.cdd || 'no',
  managementFilters: Array.isArray(row.management_filters) ? row.management_filters : [],
  modalityFilters: Array.isArray(row.modality_filters) ? row.modality_filters : [],
  typeFilters: Array.isArray(row.type_filters) ? row.type_filters : [],
  levelFilters: Array.isArray(row.level_filters) ? row.level_filters : [],
  restriction: row.restriction || 'none',
  institutions: Array.isArray(row.institutions) ? row.institutions : [],
  sheets: Array.isArray(row.sheets) ? row.sheets : [],
  status: row.status || 'pending',
  createdBy: row.created_by || '',
  createdById: row.created_by_id || '',
  workflowMeta: row.workflow_meta && typeof row.workflow_meta === 'object' ? row.workflow_meta : {},
  createdAt: row.created_at || new Date().toISOString(),
  updatedAt: row.updated_at || new Date().toISOString(),
});

const mapRequestToDbRow = (request) => {
  const normalized = normalizeRequestDraft({
    ...createEmptyRequestDraft(),
    ...request,
  });
  return {
    id: request.id,
    code: request.code || '',
    name: request.name || '',
    detail: request.detail || '',
    start_date: request.startDate || null,
    end_date: request.endDate || null,
    cdd: request.cdd || 'no',
    management_filters: normalized.managementFilters,
    modality_filters: normalized.modalityFilters,
    type_filters: normalized.typeFilters,
    level_filters: normalized.levelFilters,
    restriction: request.restriction || 'none',
    institutions: Array.isArray(request.institutions) ? request.institutions : [],
    sheets: Array.isArray(request.sheets) ? request.sheets : [],
    status: request.status || 'pending',
    created_by: request.createdBy || null,
    created_by_id: request.createdById || null,
    workflow_meta:
      request.workflowMeta && typeof request.workflowMeta === 'object' ? request.workflowMeta : {},
    created_at: request.createdAt || new Date().toISOString(),
    updated_at: request.updatedAt || new Date().toISOString(),
  };
};

const asDate = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const resolveDisplayStatus = (request) => {
  const endDate = asDate(request.endDate);
  if (endDate && endDate < new Date() && request.status !== 'published' && request.status !== 'rejected') {
    return 'expired';
  }
  return request.status || 'pending';
};

const formatDateRange = (startDate, endDate) => {
  const start = asDate(startDate);
  const end = asDate(endDate);
  if (!start && !end) return 'Sin rango';
  const formatter = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  if (start && end) {
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  }
  if (start) return `Desde ${formatter.format(start)}`;
  return `Hasta ${formatter.format(end)}`;
};

const formatDateFromParam = (dateParam) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateParam || ''))) return '';
  const [yyyy, mm, dd] = String(dateParam).split('-').map((value) => Number(value));
  const date = new Date(yyyy, mm - 1, dd);
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const buildRequestCode = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const random = `${Math.floor(1000 + Math.random() * 9000)}`;
  return `SOL-${yyyy}${mm}-${random}`;
};

const createEmptyRequestDraft = () => ({
  name: '',
  detail: '',
  startDate: '',
  endDate: '',
  cdd: 'no',
  managementFilters: [],
  modalityFilters: [],
  typeFilters: [],
  levelFilters: [],
  restriction: 'none',
  institutions: [],
});

const createEmptySheetDraft = () => ({
  title: '',
  code: '',
  subtitle: '',
});

const createEmptyDynamicFieldDraft = () => ({
  name: '',
  type: 'text',
  required: false,
  options: [],
});

const createEmptyQuestionDraft = () => ({
  text: '',
  type: 'yes_no',
  required: true,
  allowObservation: true,
  options: [],
  minValue: '',
  maxValue: '',
  extraFields: [],
});

const mapRequestToDraft = (request) =>
  normalizeRequestDraft({
    name: request.name || '',
    detail: request.detail || '',
    startDate: toDateTimeLocalValue(request.startDate),
    endDate: toDateTimeLocalValue(request.endDate),
    cdd: request.cdd || 'no',
    managementFilters: Array.isArray(request.managementFilters) ? request.managementFilters : [],
    modalityFilters: Array.isArray(request.modalityFilters) ? request.modalityFilters : [],
    typeFilters: Array.isArray(request.typeFilters) ? request.typeFilters : [],
    levelFilters: Array.isArray(request.levelFilters) ? request.levelFilters : [],
    restriction: request.restriction || 'none',
    institutions: Array.isArray(request.institutions) ? request.institutions : [],
  });

const toggleArrayValue = (values, value) => {
  if (values.includes(value)) return values.filter((item) => item !== value);
  return [...values, value];
};

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

const mapInstitution = (row) => ({
  id: row.id,
  name: row.nombre_ie || 'IE sin nombre',
  codLocal: row.cod_local || '',
  codModular: row.cod_modular || '',
  district: row.distrito || '',
  level: row.nivel || '',
  modality: row.modalidad || '',
});

const createSection = (name) => ({
  id: crypto.randomUUID(),
  name,
  questions: [],
  createdAt: new Date().toISOString(),
});

const createQuestion = (draft) => ({
  id: crypto.randomUUID(),
  text: draft.text.trim(),
  type: draft.type,
  required: Boolean(draft.required),
  allowObservation: Boolean(draft.allowObservation),
  options: Array.isArray(draft.options) ? draft.options : [],
  minValue: draft.minValue,
  maxValue: draft.maxValue,
  extraFields: Array.isArray(draft.extraFields) ? draft.extraFields : [],
  createdAt: new Date().toISOString(),
});

const createDynamicField = (draft) => ({
  id: crypto.randomUUID(),
  name: draft.name.trim(),
  type: draft.type,
  required: Boolean(draft.required),
  options: Array.isArray(draft.options) ? draft.options : [],
  createdAt: new Date().toISOString(),
});

const createSheet = (draft) => ({
  id: crypto.randomUUID(),
  title: draft.title.trim(),
  code: draft.code.trim(),
  subtitle: draft.subtitle.trim(),
  headerFields: {},
  closingFields: {},
  dynamicFields: [],
  sections: [],
  createdAt: new Date().toISOString(),
});

const toIsoDateValue = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const resolveAvailabilityStatus = (startDate, endDate) => {
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (end && !Number.isNaN(end.getTime()) && now > end) return 'closed';
  if (start && !Number.isNaN(start.getTime()) && now < start) return 'scheduled';
  return 'active';
};

const mapAvailabilityToEventStatus = (status) => {
  if (status === 'closed') return 'closed';
  if (status === 'hidden') return 'hidden';
  return 'active';
};

const buildTemplateSectionsFromSheets = (sheets = []) => {
  const sheetRows = Array.isArray(sheets) ? sheets : [];
  const hasMultipleSheets = sheetRows.length > 1;
  const sections = [];

  sheetRows.forEach((sheet, sheetIndex) => {
    const sectionRows = Array.isArray(sheet?.sections) ? sheet.sections : [];
    const sheetLabel = String(sheet?.title || '').trim() || `Ficha ${sheetIndex + 1}`;
    sectionRows.forEach((section, sectionIndex) => {
      const questionRows = Array.isArray(section?.questions) ? section.questions : [];
      const sectionLabel = String(section?.name || section?.title || '').trim() || `Seccion ${sectionIndex + 1}`;
      const title = hasMultipleSheets ? `${sheetLabel} - ${sectionLabel}` : sectionLabel;
      const questions = questionRows
        .map((question, questionIndex) => ({
          id: question?.id || crypto.randomUUID(),
          text: String(question?.text || '').trim(),
          order: questionIndex,
          responseType: 'scale_1_3',
          allowObservation: question?.allowObservation !== false,
          sourceType: question?.type || 'yes_no',
          sourceOptions: Array.isArray(question?.options) ? question.options : [],
          sourceMinValue: question?.minValue ?? '',
          sourceMaxValue: question?.maxValue ?? '',
          sourceExtraFields: Array.isArray(question?.extraFields) ? question.extraFields : [],
        }))
        .filter((question) => question.text.length > 0);

      if (!questions.length) return;

      sections.push({
        id: section?.id || crypto.randomUUID(),
        title,
        order: sections.length,
        sheetId: sheet?.id || null,
        sheetCode: sheet?.code || '',
        sheetTitle: sheetLabel,
        questions,
      });
    });
  });

  return sections;
};

const buildTemplateLevelsConfig = (request) => ({
  ...(() => {
    const sheets = Array.isArray(request?.sheets) ? request.sheets : [];
    const sheetFlags = sheets.reduce(
      (acc, sheet) => {
        const closing = sheet?.closingFields && typeof sheet.closingFields === 'object' ? sheet.closingFields : {};
        if (closing.progress_level) acc.includeLevels = true;
        if (closing.closing_date) acc.includeDate = true;
        if (closing.closing_place) acc.includeLocation = true;
        if (closing.signature || closing.dni_monitored || closing.dni_monitor) acc.includeSignatures = true;
        return acc;
      },
      { includeLevels: false, includeDate: false, includeLocation: false, includeSignatures: false },
    );

    return {
      metadata: {
        include_levels: sheetFlags.includeLevels,
        include_date: sheetFlags.includeDate,
        include_location: sheetFlags.includeLocation,
        include_signatures: sheetFlags.includeSignatures,
      },
    };
  })(),
  type: 'request_builder',
  levels: DEFAULT_TEMPLATE_LEVELS,
  scope: {
    requestCode: request?.code || '',
    cdd: request?.cdd || 'no',
    managementFilters: Array.isArray(request?.managementFilters) ? request.managementFilters : [],
    modalityFilters: Array.isArray(request?.modalityFilters) ? request.modalityFilters : [],
    typeFilters: Array.isArray(request?.typeFilters) ? request.typeFilters : [],
    levelFilters: Array.isArray(request?.levelFilters) ? request.levelFilters : [],
    restriction: request?.restriction || 'none',
    institutions: Array.isArray(request?.institutions) ? request.institutions : [],
  },
  builder: {
    sheets: Array.isArray(request?.sheets)
      ? request.sheets.map((sheet) => ({
          id: sheet?.id || crypto.randomUUID(),
          title: sheet?.title || '',
          code: sheet?.code || '',
          subtitle: sheet?.subtitle || '',
          headerFields: sheet?.headerFields && typeof sheet.headerFields === 'object' ? sheet.headerFields : {},
          closingFields: sheet?.closingFields && typeof sheet.closingFields === 'object' ? sheet.closingFields : {},
          dynamicFields: Array.isArray(sheet?.dynamicFields) ? sheet.dynamicFields : [],
        }))
      : [],
  },
});

const getRestrictionHelp = (restriction, draft) => {
  const isFocalized = draft.typeFilters?.includes('focalizado') || (draft.institutions?.length || 0) > 0;
  const hasLevelScope = (draft.modalityFilters?.length || 0) > 0 || (draft.levelFilters?.length || 0) > 0;
  if (restriction === 'cod_local') {
    return 'Usa codigo local cuando el monitoreo se aplique por IE.';
  }
  if (restriction === 'cod_modular') {
    return 'Usa codigo modular cuando el monitoreo se aplique por nivel o servicio.';
  }
  if (isFocalized) return 'Se recomienda codigo local cuando el monitoreo se aplique por IE focalizada.';
  if (hasLevelScope) return 'Se recomienda codigo modular cuando el alcance se defina por modalidad o nivel.';
  return 'Sin restriccion de guardado por codigo.';
};

const StatusIcon = ({ status }) => {
  if (status === 'approved' || status === 'published') return <CheckCircle2 size={13} />;
  if (status === 'rejected' || status === 'expired') return <XCircle size={13} />;
  if (status === 'pending') return <AlertTriangle size={13} />;
  return <CircleSlash size={13} />;
};

function MultiSelectPills({ label, options, selectedValues, onChange }) {
  return (
    <div className="space-y-2">
      <p className="ds-field-label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(toggleArrayValue(selectedValues, option.value))}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                  : 'border-slate-700/70 bg-slate-900/50 text-slate-300 hover:border-slate-500'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SingleSelectPills({ label, options, selectedValue, onChange }) {
  return (
    <div className="space-y-2">
      <p className="ds-field-label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(selected ? '' : option.value)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                  : 'border-slate-700/70 bg-slate-900/50 text-slate-300 hover:border-slate-500'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StageDisabled({ title, description }) {
  return (
    <Card className="border-dashed border-slate-700/70 bg-slate-900/35 p-5">
      <p className="text-h3">{title}</p>
      <p className="text-small mt-1.5">{description}</p>
    </Card>
  );
}

export default function MonitoreoGestionMonitoreos({ embedded = false, initialCreationDate = '' } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    } catch {
      return {};
    }
  }, []);
  const userRole = resolveUserRole(auth?.role);
  const isAdmin = userRole === ROLE_ADMIN;
  const actorLabel = auth?.name || auth?.email || auth?.docNumber || 'Usuario';

  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [requestDraft, setRequestDraft] = useState(createEmptyRequestDraft());
  const [requestErrors, setRequestErrors] = useState({});
  const [listSearch, setListSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageSize, setPageSize] = useState('8');
  const [currentPage, setCurrentPage] = useState(1);

  const [institutionCatalog, setInstitutionCatalog] = useState([]);
  const [isInstitutionsLoading, setIsInstitutionsLoading] = useState(false);
  const [institutionSearch, setInstitutionSearch] = useState('');

  const [sheetDraft, setSheetDraft] = useState(createEmptySheetDraft());
  const [selectedSheetId, setSelectedSheetId] = useState('');

  const [dynamicFieldDraft, setDynamicFieldDraft] = useState(createEmptyDynamicFieldDraft());
  const [dynamicOptionInput, setDynamicOptionInput] = useState('');

  const [sectionName, setSectionName] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');

  const [questionDraft, setQuestionDraft] = useState(createEmptyQuestionDraft());
  const [questionOptionInput, setQuestionOptionInput] = useState('');
  const [extraFieldInput, setExtraFieldInput] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState({ tone: 'neutral', message: '' });
  const [filterInfo, setFilterInfo] = useState('');
  const [showNonFocalizedInstitutions, setShowNonFocalizedInstitutions] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [hasLoadedInitialRequests, setHasLoadedInitialRequests] = useState(false);
  const [dbMode, setDbMode] = useState('loading');
  const [authUserId, setAuthUserId] = useState('');
  const [creationContextDate, setCreationContextDate] = useState('');
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1280 : false,
  );
  const [mobilePanel, setMobilePanel] = useState('requests');
  const [mobileStage, setMobileStage] = useState('stage1');

  const selectedRequest = useMemo(
    () => requests.find((item) => item.id === selectedRequestId) || null,
    [requests, selectedRequestId],
  );

  const editableRequest = useMemo(
    () => (selectedRequest ? getEditableRequestView(selectedRequest) : null),
    [selectedRequest],
  );

  const selectedSheet = useMemo(
    () => editableRequest?.sheets?.find((item) => item.id === selectedSheetId) || null,
    [editableRequest, selectedSheetId],
  );

  const selectedSection = useMemo(
    () => selectedSheet?.sections?.find((item) => item.id === selectedSectionId) || null,
    [selectedSheet, selectedSectionId],
  );

  const availableLevelOptions = useMemo(
    () => getAvailableLevelOptions(requestDraft.modalityFilters),
    [requestDraft.modalityFilters],
  );
  const pendingChangesSummary = useMemo(
    () => buildPendingChangesSummary(selectedRequest),
    [selectedRequest],
  );
  const selectedType = requestDraft.typeFilters[0] || '';
  const isFocalizedType = selectedType === 'focalizado';
  const showInstitutionsBlock = isFocalizedType || showNonFocalizedInstitutions;
  const selectedRequestQuestionCount = useMemo(() => {
    if (!selectedRequest) return 0;
    return countRequestStructure(selectedRequest).questions;
  }, [selectedRequest]);
  const publishBlockedReason = useMemo(() => {
    if (!selectedRequest) return 'Selecciona una solicitud para publicar.';
    if (!isAdmin) return 'Solo un administrador puede publicar monitoreos.';
    if (hasPendingChanges(selectedRequest)) {
      return 'Hay cambios pendientes de revision. Aprueba o rechaza esos cambios antes de publicar.';
    }
    if (selectedRequest.status !== 'approved' && selectedRequest.status !== 'published') {
      return 'La solicitud debe estar aprobada antes de publicar.';
    }
    if (!selectedRequestQuestionCount) {
      return 'Agrega al menos una pregunta antes de publicar el monitoreo.';
    }
    return '';
  }, [isAdmin, selectedRequest, selectedRequestQuestionCount]);
  const canPublishRequest = publishBlockedReason.length === 0;
  const creationContextLabel = useMemo(() => formatDateFromParam(creationContextDate), [creationContextDate]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setIsMobileLayout(window.innerWidth < 1280);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobileLayout) return;
    if (selectedRequestId) {
      setMobilePanel('editor');
    }
  }, [isMobileLayout, selectedRequestId]);

  useEffect(() => {
    let active = true;
    const loadRequests = async () => {
      setIsRequestsLoading(true);
      const { data, error } = await supabase
        .from(DB_TABLE)
        .select('*')
        .order('updated_at', { ascending: false });

      if (!active) return;

      if (!error) {
        setRequests((data || []).map(mapRequestFromDbRow));
        setDbMode('available');
      } else {
        console.error(error);
        setRequests(readStoredRequests());
        setDbMode('unavailable');
        setNotice({
          tone: 'warning',
          message: 'Modo local activo: aplica la migracion de monitoring_requests para persistencia en base de datos.',
        });
      }

      setHasLoadedInitialRequests(true);
      setIsRequestsLoading(false);
    };

    loadRequests();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const resolveAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setAuthUserId(data?.user?.id || '');
    };
    resolveAuthUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedInitialRequests) return;
    writeStoredRequests(requests);
  }, [requests, hasLoadedInitialRequests]);

  useEffect(() => {
    if (!hasLoadedInitialRequests || dbMode !== 'available') return;
    const timeoutId = setTimeout(async () => {
      if (!requests.length) return;
      const payload = requests.map(mapRequestToDbRow);
      const { error } = await supabase.from(DB_TABLE).upsert(payload, { onConflict: 'id' });
      if (error) {
        console.error(error);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [requests, hasLoadedInitialRequests, dbMode]);

  useEffect(() => {
    const fetchInstitutions = async () => {
      setIsInstitutionsLoading(true);
      const { data, error } = await supabase
        .from('educational_institutions')
        .select('id,nombre_ie,cod_local,cod_modular,distrito,nivel,modalidad,estado')
        .eq('estado', 'active')
        .order('nombre_ie', { ascending: true });

      if (error) {
        console.error(error);
        setInstitutionCatalog([]);
      } else {
        setInstitutionCatalog((data || []).map(mapInstitution));
      }
      setIsInstitutionsLoading(false);
    };

    fetchInstitutions();
  }, []);

  useEffect(() => {
    if (!editableRequest) return;
    setRequestDraft(mapRequestToDraft(editableRequest));
    setFilterInfo('');
    setShowNonFocalizedInstitutions(false);
    setReviewComment('');
  }, [editableRequest]);

  useEffect(() => {
    if (!editableRequest?.sheets?.length) {
      setSelectedSheetId('');
      return;
    }
    if (!selectedSheetId || !editableRequest.sheets.some((item) => item.id === selectedSheetId)) {
      setSelectedSheetId(editableRequest.sheets[0].id);
    }
  }, [editableRequest, selectedSheetId]);

  useEffect(() => {
    if (!selectedSheet?.sections?.length) {
      setSelectedSectionId('');
      return;
    }
    if (!selectedSectionId || !selectedSheet.sections.some((item) => item.id === selectedSectionId)) {
      setSelectedSectionId(selectedSheet.sections[0].id);
    }
  }, [selectedSheet, selectedSectionId]);

  const filteredRequests = useMemo(() => {
    const term = normalizeText(listSearch);
    return requests
      .filter((item) => {
        const displayStatus = resolveDisplayStatus(item);
        const itemIsPendingQueue = displayStatus === 'pending' || hasPendingChanges(item);
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'pending' ? itemIsPendingQueue : displayStatus === statusFilter);
        if (!matchesStatus) return false;

        if (!term) return true;
        const searchable = [item.name, item.code, item.detail, getStatusLabel(displayStatus)]
          .map((value) => normalizeText(value))
          .join(' ');
        return searchable.includes(term);
      })
      .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
  }, [requests, listSearch, statusFilter]);

  const pageSizeNumber = Number(pageSize) || 8;
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSizeNumber));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSizeNumber;
  const visibleRequests = filteredRequests.slice(pageStart, pageStart + pageSizeNumber);

  useEffect(() => {
    setCurrentPage(1);
  }, [listSearch, statusFilter, pageSize]);

  const suggestionRows = useMemo(() => {
    const term = normalizeText(institutionSearch);
    if (!term) return [];

    return institutionCatalog
      .filter((item) => {
        if (requestDraft.institutions.some((current) => current.id === item.id)) return false;
        const rowText = `${item.name} ${item.codLocal} ${item.codModular} ${item.district}`;
        return normalizeText(rowText).includes(term);
      })
      .slice(0, 8);
  }, [institutionCatalog, institutionSearch, requestDraft.institutions]);

  const updateSelectedRequest = (updater, options = {}) => {
    const { markPendingForSpecialist = true } = options;
    if (!selectedRequestId) return;
    setRequests((prev) =>
      prev.map((item) => {
        if (item.id !== selectedRequestId) return item;
        const now = new Date().toISOString();
        const baseMeta = getWorkflowMeta(item);

        const specialistEditingApprovedFlow =
          !isAdmin &&
          markPendingForSpecialist &&
          (item.status === 'approved' || item.status === 'published' || Boolean(baseMeta.pendingDraft));

        if (specialistEditingApprovedFlow) {
          const editableBase = getEditableRequestView(item);
          const edited = updater(editableBase);
          const pendingDraft = buildRequestPayloadSnapshot(edited);
          return {
            ...item,
            workflowMeta: {
              ...baseMeta,
              hasPendingChanges: true,
              pendingDraft,
              pendingChangeAt: now,
              pendingChangeBy: actorLabel,
              lastSavedAt: now,
              lastSavedBy: actorLabel,
            },
            updatedAt: now,
          };
        }

        const nextRaw = updater(item);
        const nextMeta = {
          ...baseMeta,
          ...getWorkflowMeta(nextRaw),
          lastSavedAt: now,
          lastSavedBy: actorLabel,
        };
        let nextStatus = nextRaw.status;
        if (!isAdmin && markPendingForSpecialist) {
          if (item.status === 'approved' || item.status === 'published') {
            nextMeta.hasPendingChanges = true;
            nextMeta.pendingChangeAt = now;
            nextMeta.pendingChangeBy = actorLabel;
          }
          if (item.status === 'rejected' && nextStatus === 'rejected') {
            nextStatus = 'pending';
          }
        }
        return {
          ...nextRaw,
          status: nextStatus,
          workflowMeta: nextMeta,
          updatedAt: now,
        };
      }),
    );
  };

  const resetToCreateMode = ({ contextDate = '' } = {}) => {
    setSelectedRequestId('');
    setRequestDraft(createEmptyRequestDraft());
    setRequestErrors({});
    setFilterInfo('');
    setShowNonFocalizedInstitutions(false);
    setSheetDraft(createEmptySheetDraft());
    setSelectedSheetId('');
    setDynamicFieldDraft(createEmptyDynamicFieldDraft());
    setSectionName('');
    setSelectedSectionId('');
    setQuestionDraft(createEmptyQuestionDraft());
    setNotice({ tone: 'neutral', message: '' });
    setCreationContextDate(contextDate);
    if (isMobileLayout) {
      setMobilePanel('editor');
      setMobileStage('stage1');
    }
  };

  useEffect(() => {
    if (embedded) return;
    const shouldCreate = searchParams.get('nueva') === 'true';
    if (!shouldCreate) return;

    const rawDate = searchParams.get('fecha') || '';
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';

    resetToCreateMode({ contextDate: safeDate });
    setRequestDraft((prev) => ({
      ...prev,
      startDate: safeDate ? `${safeDate}T08:00` : '',
    }));
    setNotice({
      tone: 'neutral',
      message: safeDate
        ? 'Solicitud nueva iniciada desde Seguimiento.'
        : 'Solicitud nueva iniciada.',
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('nueva');
    nextParams.delete('fecha');
    setSearchParams(nextParams, { replace: true });
  }, [embedded, searchParams, setSearchParams]);

  useEffect(() => {
    if (!embedded) return;
    if (!initialCreationDate) return;

    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(initialCreationDate) ? initialCreationDate : '';
    if (!safeDate) return;

    resetToCreateMode({ contextDate: safeDate });
    setRequestDraft((prev) => ({
      ...prev,
      startDate: `${safeDate}T08:00`,
    }));
    setNotice({
      tone: 'neutral',
      message: 'Solicitud nueva iniciada desde Seguimiento.',
    });
  }, [embedded, initialCreationDate]);

  const updateRequestDraftFilters = (updater) => {
    setRequestDraft((prev) => normalizeRequestDraft(updater(prev)));
  };

  const handleManagementParentToggle = (value) => {
    updateRequestDraftFilters((prev) => {
      const hasValue = prev.managementFilters.includes(value);
      let nextManagement = hasValue
        ? prev.managementFilters.filter((item) => item !== value)
        : [...prev.managementFilters, value];

      if (value === 'publica' && hasValue) {
        nextManagement = nextManagement.filter((item) => !PUBLIC_MANAGEMENT_OPTION_SET.has(item));
      }

      return { ...prev, managementFilters: nextManagement };
    });
  };

  const handlePublicManagementToggle = (value) => {
    updateRequestDraftFilters((prev) => {
      let nextManagement = [...prev.managementFilters];
      if (!nextManagement.includes('publica')) {
        nextManagement.push('publica');
      }
      if (nextManagement.includes(value)) {
        nextManagement = nextManagement.filter((item) => item !== value);
      } else {
        nextManagement.push(value);
      }
      return { ...prev, managementFilters: nextManagement };
    });
  };

  const handleModalityFiltersChange = (nextValues) => {
    const normalizedModalities = sanitizeModalityFilters(nextValues);
    const allowedLevelSet = new Set(getAvailableLevelOptions(normalizedModalities).map((item) => item.value));
    const cleanedLevels = requestDraft.levelFilters.filter((level) => allowedLevelSet.has(level));
    const removedCount = requestDraft.levelFilters.length - cleanedLevels.length;
    updateRequestDraftFilters((prev) => {
      return {
        ...prev,
        modalityFilters: normalizedModalities,
        levelFilters: cleanedLevels,
      };
    });
    if (removedCount > 0) {
      setFilterInfo('Se limpiaron niveles no compatibles con la modalidad seleccionada.');
    } else {
      setFilterInfo('');
    }
    setRequestErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors.modalityFilters;
      delete nextErrors.levelFilters;
      if (!normalizedModalities.length) {
        nextErrors.modalityFilters = 'Selecciona al menos una modalidad.';
      } else if (!cleanedLevels.length) {
        nextErrors.levelFilters = 'Selecciona al menos un nivel compatible con la modalidad elegida.';
      }
      return nextErrors;
    });
  };

  const handleTypeFilterChange = (value) => {
    const nextValue = selectedType === value ? '' : value;
    updateRequestDraftFilters((prev) => ({
      ...prev,
      typeFilters: nextValue ? [nextValue] : [],
    }));
    if (nextValue !== 'focalizado') {
      setShowNonFocalizedInstitutions(false);
    }
  };

  const handleLevelFiltersChange = (nextValues) => {
    updateRequestDraftFilters((prev) => ({
      ...prev,
      levelFilters: nextValues,
    }));
    setRequestErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors.levelFilters;
      if (requestDraft.modalityFilters.length > 0 && (!nextValues || nextValues.length === 0)) {
        nextErrors.levelFilters = 'Selecciona al menos un nivel compatible con la modalidad elegida.';
      }
      return nextErrors;
    });
  };

  const validateRequestDraft = (draft) => {
    const currentDraft = normalizeRequestDraft(draft);
    const nextErrors = {};

    if (!currentDraft.name.trim()) nextErrors.name = 'Ingresa el nombre del monitoreo.';
    if (!currentDraft.detail.trim()) nextErrors.detail = 'Ingresa el detalle de la solicitud.';
    if (!currentDraft.startDate) nextErrors.startDate = 'Define la fecha de inicio.';
    if (!currentDraft.endDate) nextErrors.endDate = 'Define la fecha de cierre.';
    if (
      currentDraft.startDate &&
      currentDraft.endDate &&
      new Date(currentDraft.startDate).getTime() > new Date(currentDraft.endDate).getTime()
    ) {
      nextErrors.endDate = 'La fecha de cierre debe ser posterior al inicio.';
    }

    if (!currentDraft.managementFilters.some((value) => MANAGEMENT_OPTIONS.some((item) => item.value === value))) {
      nextErrors.managementFilters = 'Selecciona al menos una opcion de gestion.';
    }
    if (
      currentDraft.managementFilters.includes('publica') &&
      !currentDraft.managementFilters.some((value) => PUBLIC_MANAGEMENT_OPTION_SET.has(value))
    ) {
      nextErrors.managementPublicFilters = 'Selecciona al menos una opcion de gestion publica.';
    }
    if (!currentDraft.modalityFilters.length) {
      nextErrors.modalityFilters = 'Selecciona al menos una modalidad.';
    }
    if (!currentDraft.typeFilters.length) {
      nextErrors.typeFilters = 'Selecciona el tipo de monitoreo.';
    }
    const availableLevelSet = new Set(getAvailableLevelOptions(currentDraft.modalityFilters).map((item) => item.value));
    if (currentDraft.modalityFilters.length > 0 && !currentDraft.levelFilters.length) {
      nextErrors.levelFilters = 'Selecciona al menos un nivel compatible con la modalidad elegida.';
    } else if (currentDraft.levelFilters.some((value) => !availableLevelSet.has(value))) {
      nextErrors.levelFilters = 'Hay niveles no compatibles con la modalidad seleccionada.';
    }

    setRequestErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCreateRequest = () => {
    if (!isAdmin && !authUserId) {
      setNotice({ tone: 'warning', message: 'Espera unos segundos: estamos validando tu sesion para crear la solicitud.' });
      return;
    }
    const normalizedDraft = normalizeRequestDraft(requestDraft);
    setRequestDraft(normalizedDraft);
    if (!validateRequestDraft(normalizedDraft)) return;

    const now = new Date().toISOString();
    const created = {
      id: crypto.randomUUID(),
      code: buildRequestCode(),
      status: 'pending',
      sheets: [],
      createdBy: actorLabel,
      createdById: authUserId || null,
      workflowMeta: {
        hasPendingChanges: false,
        approvedSnapshot: null,
        reviewNote: '',
        lastSavedAt: now,
        lastSavedBy: actorLabel,
      },
      createdAt: now,
      updatedAt: now,
      ...normalizedDraft,
    };

    setRequests((prev) => [created, ...prev]);
    setSelectedRequestId(created.id);
    setNotice({ tone: 'success', message: 'Solicitud creada correctamente.' });
  };

  const handleSaveRequest = () => {
    if (!selectedRequestId) return;
    const normalizedDraft = normalizeRequestDraft(requestDraft);
    setRequestDraft(normalizedDraft);
    if (!validateRequestDraft(normalizedDraft)) return;
    updateSelectedRequest((current) => ({
      ...current,
      ...normalizedDraft,
      ...(current.status === 'rejected' && !isAdmin ? { status: 'pending' } : {}),
    }));
    setNotice({
      tone: 'success',
      message: !isAdmin
        ? 'Guardado automatico: continua desde donde lo dejaste.'
        : 'Cambios de solicitud guardados.',
    });
  };

  const handleApproveRequest = () => {
    if (!isAdmin) return;
    const normalizedDraft = normalizeRequestDraft(requestDraft);
    setRequestDraft(normalizedDraft);
    if (!validateRequestDraft(normalizedDraft)) {
      setNotice({ tone: 'warning', message: 'Completa filtros obligatorios antes de aprobar la solicitud.' });
      return;
    }
    const now = new Date().toISOString();
    updateSelectedRequest((current) => ({
      ...(() => {
        const meta = getWorkflowMeta(current);
        const approvedPayload = meta.pendingDraft
          ? {
              ...meta.pendingDraft,
              ...normalizedDraft,
            }
          : buildRequestPayloadSnapshot({
              ...current,
              ...normalizedDraft,
            });
        return applyRequestPayloadSnapshot(current, approvedPayload);
      })(),
      status: 'approved',
      workflowMeta: {
        ...getWorkflowMeta(current),
        hasPendingChanges: false,
        pendingDraft: null,
        approvedSnapshot: (() => {
          const meta = getWorkflowMeta(current);
          return meta.pendingDraft
            ? {
                ...meta.pendingDraft,
                ...normalizedDraft,
              }
            : buildRequestPayloadSnapshot({
                ...current,
                ...normalizedDraft,
              });
        })(),
        reviewNote: '',
        pendingChangeAt: null,
        pendingChangeBy: '',
        lastDecision: 'approved',
        lastDecisionAt: now,
        lastDecisionBy: actorLabel,
      },
    }), { markPendingForSpecialist: false });
    setNotice({ tone: 'success', message: 'Solicitud aprobada.' });
    setReviewComment('');
  };

  const handleRejectRequest = () => {
    if (!isAdmin) return;
    if (!reviewComment.trim()) {
      setNotice({ tone: 'warning', message: 'Ingresa una observacion antes de rechazar.' });
      return;
    }
    const now = new Date().toISOString();
    const rejectingPendingUpdate = Boolean(getWorkflowMeta(selectedRequest).pendingDraft || hasPendingChanges(selectedRequest));
    updateSelectedRequest((current) => {
      const meta = getWorkflowMeta(current);
      const isChangeReject = Boolean(meta.pendingDraft || (meta.hasPendingChanges && meta.approvedSnapshot));
      if (isChangeReject) {
        const reverted = applyRequestPayloadSnapshot(current, meta.approvedSnapshot);
        return {
          ...reverted,
          status: 'approved',
          workflowMeta: {
            ...meta,
            hasPendingChanges: false,
            pendingDraft: null,
            reviewNote: reviewComment.trim(),
            pendingChangeAt: null,
            pendingChangeBy: '',
            lastDecision: 'changes_rejected',
            lastDecisionAt: now,
            lastDecisionBy: actorLabel,
          },
        };
      }
      return {
        ...current,
        status: 'rejected',
        workflowMeta: {
          ...meta,
          hasPendingChanges: false,
          pendingDraft: null,
          reviewNote: reviewComment.trim(),
          lastDecision: 'rejected',
          lastDecisionAt: now,
          lastDecisionBy: actorLabel,
        },
      };
    }, { markPendingForSpecialist: false });
    setNotice({
      tone: 'warning',
      message: rejectingPendingUpdate
        ? 'Cambios rechazados. Se mantiene la version aprobada vigente.'
        : 'Solicitud rechazada con observaciones.',
    });
    setReviewComment('');
  };

  const handlePublishRequest = async () => {
    if (!selectedRequest || !isAdmin) return;
    if (!canPublishRequest) {
      setNotice({ tone: 'warning', message: publishBlockedReason });
      return;
    }

    const templateSections = buildTemplateSectionsFromSheets(selectedRequest.sheets || []);
    if (!templateSections.length) {
      setNotice({ tone: 'warning', message: 'Agrega preguntas validas antes de publicar el monitoreo.' });
      return;
    }

    const now = new Date().toISOString();
    const availabilityStatus = resolveAvailabilityStatus(selectedRequest.startDate, selectedRequest.endDate);
    const templatePayload = {
      id: selectedRequest.id,
      title: selectedRequest.name || 'Monitoreo sin titulo',
      description: selectedRequest.detail || null,
      status: 'published',
      sections: templateSections,
      levels_config: buildTemplateLevelsConfig(selectedRequest),
      availability: {
        status: availabilityStatus,
        startAt: selectedRequest.startDate || null,
        endAt: selectedRequest.endDate || null,
      },
      created_by: selectedRequest.createdById || authUserId || selectedRequest.createdBy || null,
      created_at: selectedRequest.createdAt || now,
      updated_at: now,
    };

    const { error: templateError } = await supabase
      .from('monitoring_templates')
      .upsert(templatePayload, { onConflict: 'id' });

    if (templateError) {
      console.error(templateError);
      setNotice({
        tone: 'warning',
        message: 'No se pudo publicar en Monitoreos. Revisa permisos o estructura de la solicitud.',
      });
      return;
    }

    let eventSyncWarning = '';
    const startAtIso = toIsoDateValue(selectedRequest.startDate);
    const endAtIso = toIsoDateValue(selectedRequest.endDate);
    if (startAtIso && endAtIso) {
      const eventPayload = {
        id: selectedRequest.id,
        title: selectedRequest.name || 'Monitoreo sin titulo',
        description: selectedRequest.detail || null,
        event_type: 'monitoring',
        start_at: startAtIso,
        end_at: endAtIso,
        status: mapAvailabilityToEventStatus(availabilityStatus),
        created_by: authUserId || null,
        updated_at: now,
      };

      const { error: eventError } = await supabase
        .from('monitoring_events')
        .upsert(eventPayload, { onConflict: 'id' });
      if (eventError) {
        console.error(eventError);
        eventSyncWarning = ' Publicacion completada, pero no se sincronizo con Seguimiento.';
      }
    }

    updateSelectedRequest((current) => ({
      ...current,
      status: 'published',
      workflowMeta: {
        ...getWorkflowMeta(current),
        hasPendingChanges: false,
        pendingDraft: null,
        reviewNote: '',
        lastDecision: 'published',
        lastDecisionAt: now,
        lastDecisionBy: actorLabel,
        publishedTemplateId: selectedRequest.id,
        publishedAt: now,
      },
    }), { markPendingForSpecialist: false });

    setNotice({
      tone: eventSyncWarning ? 'warning' : 'success',
      message: `Monitoreo publicado y disponible en la seccion Monitoreos.${eventSyncWarning}`,
    });
  };

  const handleReapplyInstitutions = () => {
    setRequestDraft((prev) => ({
      ...prev,
      institutions: [],
    }));
    setInstitutionSearch('');
    setNotice({ tone: 'neutral', message: 'Lista de instituciones reiniciada.' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const deletingId = deleteTarget.id;

    if (dbMode === 'available') {
      const { error } = await supabase.from(DB_TABLE).delete().eq('id', deletingId);
      if (error) {
        console.error(error);
        setNotice({ tone: 'warning', message: 'No se pudo eliminar en base de datos.' });
      }
    }

    setRequests((prev) => prev.filter((item) => item.id !== deletingId));
    if (selectedRequestId === deleteTarget.id) {
      resetToCreateMode();
    }
    setDeleteTarget(null);
    setNotice({ tone: 'warning', message: 'Solicitud eliminada.' });
  };

  const handleAddInstitution = (institution) => {
    setRequestDraft((prev) => ({
      ...prev,
      institutions: [...prev.institutions, institution],
    }));
    setInstitutionSearch('');
  };

  const handleRemoveInstitution = (institutionId) => {
    setRequestDraft((prev) => ({
      ...prev,
      institutions: prev.institutions.filter((item) => item.id !== institutionId),
    }));
  };

  const handleAddSheet = () => {
    if (!selectedRequestId) return;
    if (!sheetDraft.title.trim() || !sheetDraft.code.trim()) {
      setNotice({ tone: 'warning', message: 'Completa titulo y codigo de la ficha.' });
      return;
    }

    const nextSheet = createSheet(sheetDraft);
    updateSelectedRequest((current) => ({
      ...current,
      sheets: [...(current.sheets || []), nextSheet],
    }));
    setSelectedSheetId(nextSheet.id);
    setSheetDraft(createEmptySheetDraft());
    setNotice({ tone: 'success', message: 'Ficha agregada.' });
  };

  const handleDeleteSheet = (sheetId) => {
    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).filter((item) => item.id !== sheetId),
    }));
    if (selectedSheetId === sheetId) {
      setSelectedSheetId('');
      setSelectedSectionId('');
    }
  };

  const handleToggleSheetField = (group, fieldId) => {
    if (!selectedSheetId) return;

    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).map((sheet) => {
        if (sheet.id !== selectedSheetId) return sheet;
        const currentGroup = group === 'header' ? sheet.headerFields || {} : sheet.closingFields || {};
        const nextGroup = {
          ...currentGroup,
          [fieldId]: !currentGroup[fieldId],
        };
        if (group === 'header') {
          return { ...sheet, headerFields: nextGroup };
        }
        return { ...sheet, closingFields: nextGroup };
      }),
    }));
  };

  const handleAddDynamicOption = () => {
    const value = dynamicOptionInput.trim();
    if (!value) return;
    if (dynamicFieldDraft.options.includes(value)) return;

    setDynamicFieldDraft((prev) => ({
      ...prev,
      options: [...prev.options, value],
    }));
    setDynamicOptionInput('');
  };

  const handleRemoveDynamicOption = (optionValue) => {
    setDynamicFieldDraft((prev) => ({
      ...prev,
      options: prev.options.filter((item) => item !== optionValue),
    }));
  };

  const handleAddDynamicField = () => {
    if (!selectedSheetId) return;
    if (!dynamicFieldDraft.name.trim()) {
      setNotice({ tone: 'warning', message: 'Ingresa el nombre del campo personalizado.' });
      return;
    }
    if (dynamicFieldDraft.type === 'select' && !dynamicFieldDraft.options.length) {
      setNotice({ tone: 'warning', message: 'Agrega al menos una opcion para lista/select.' });
      return;
    }

    const nextField = createDynamicField(dynamicFieldDraft);
    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).map((sheet) =>
        sheet.id === selectedSheetId
          ? { ...sheet, dynamicFields: [...(sheet.dynamicFields || []), nextField] }
          : sheet,
      ),
    }));
    setDynamicFieldDraft(createEmptyDynamicFieldDraft());
    setDynamicOptionInput('');
    setNotice({ tone: 'success', message: 'Campo personalizado agregado.' });
  };

  const handleDeleteDynamicField = (fieldId) => {
    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).map((sheet) =>
        sheet.id === selectedSheetId
          ? {
              ...sheet,
              dynamicFields: (sheet.dynamicFields || []).filter((item) => item.id !== fieldId),
            }
          : sheet,
      ),
    }));
  };

  const handleAddSection = () => {
    if (!selectedSheetId) return;
    if (!sectionName.trim()) {
      setNotice({ tone: 'warning', message: 'Ingresa el nombre de la seccion.' });
      return;
    }

    const nextSection = createSection(sectionName.trim());
    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).map((sheet) =>
        sheet.id === selectedSheetId
          ? { ...sheet, sections: [...(sheet.sections || []), nextSection] }
          : sheet,
      ),
    }));
    setSectionName('');
    setSelectedSectionId(nextSection.id);
    setNotice({ tone: 'success', message: 'Seccion agregada.' });
  };

  const handleDeleteSection = (sectionId) => {
    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).map((sheet) => {
        if (sheet.id !== selectedSheetId) return sheet;
        return {
          ...sheet,
          sections: (sheet.sections || []).filter((item) => item.id !== sectionId),
        };
      }),
    }));
    if (selectedSectionId === sectionId) setSelectedSectionId('');
  };

  const handleQuestionTypeChange = (type) => {
    if (type === 'yes_no_levels' && !questionDraft.options.length) {
      setQuestionDraft((prev) => ({
        ...prev,
        type,
        options: ['No cumple', 'Cumple parcialmente', 'Cumple'],
      }));
      return;
    }

    if (type !== 'options' && type !== 'yes_no_levels') {
      setQuestionDraft((prev) => ({
        ...prev,
        type,
        options: [],
      }));
      return;
    }

    setQuestionDraft((prev) => ({ ...prev, type }));
  };

  const handleAddQuestionOption = () => {
    const value = questionOptionInput.trim();
    if (!value) return;
    if (questionDraft.options.includes(value)) return;

    setQuestionDraft((prev) => ({
      ...prev,
      options: [...prev.options, value],
    }));
    setQuestionOptionInput('');
  };

  const handleRemoveQuestionOption = (optionValue) => {
    setQuestionDraft((prev) => ({
      ...prev,
      options: prev.options.filter((item) => item !== optionValue),
    }));
  };

  const handleAddExtraField = () => {
    const value = extraFieldInput.trim();
    if (!value) return;
    if (questionDraft.extraFields.includes(value)) return;

    setQuestionDraft((prev) => ({
      ...prev,
      extraFields: [...prev.extraFields, value],
    }));
    setExtraFieldInput('');
  };

  const handleRemoveExtraField = (field) => {
    setQuestionDraft((prev) => ({
      ...prev,
      extraFields: prev.extraFields.filter((item) => item !== field),
    }));
  };

  const saveQuestion = (keepOpen) => {
    if (!selectedSheetId || !selectedSectionId) return;

    if (!questionDraft.text.trim()) {
      setNotice({ tone: 'warning', message: 'Ingresa el enunciado de la pregunta.' });
      return;
    }

    if (
      (questionDraft.type === 'options' || questionDraft.type === 'yes_no_levels') &&
      !questionDraft.options.length
    ) {
      setNotice({ tone: 'warning', message: 'Agrega opciones para esta pregunta.' });
      return;
    }

    const nextQuestion = createQuestion(questionDraft);
    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).map((sheet) => {
        if (sheet.id !== selectedSheetId) return sheet;
        return {
          ...sheet,
          sections: (sheet.sections || []).map((section) =>
            section.id === selectedSectionId
              ? {
                  ...section,
                  questions: [...(section.questions || []), nextQuestion],
                }
              : section,
          ),
        };
      }),
    }));

    if (keepOpen) {
      setQuestionDraft((prev) => ({
        ...createEmptyQuestionDraft(),
        type: prev.type,
      }));
    } else {
      setQuestionDraft(createEmptyQuestionDraft());
    }

    setQuestionOptionInput('');
    setExtraFieldInput('');
    setNotice({ tone: 'success', message: 'Pregunta guardada.' });
  };

  const handleDeleteQuestion = (questionId) => {
    if (!selectedSheetId || !selectedSectionId) return;

    updateSelectedRequest((current) => ({
      ...current,
      sheets: (current.sheets || []).map((sheet) => {
        if (sheet.id !== selectedSheetId) return sheet;
        return {
          ...sheet,
          sections: (sheet.sections || []).map((section) =>
            section.id === selectedSectionId
              ? {
                  ...section,
                  questions: (section.questions || []).filter((item) => item.id !== questionId),
                }
              : section,
          ),
        };
      }),
    }));
  };

  const renderNotice = () => {
    if (!notice.message) return null;
    const className =
      notice.tone === 'success'
        ? 'text-emerald-200'
        : notice.tone === 'warning'
          ? 'text-amber-200'
          : 'text-slate-300';
    return <p className={`text-small ${className}`}>{notice.message}</p>;
  };

  const showStage = (stageId) => !isMobileLayout || mobileStage === stageId;
  const mobileStageOptions = [
    { value: 'stage1', label: 'Etapa 1: Solicitud' },
    { value: 'stage2', label: 'Etapa 2: Revision' },
    { value: 'stage3', label: 'Etapa 3: Fichas' },
    { value: 'stage4', label: 'Etapa 4: Encabezado y cierre' },
    { value: 'stage5', label: 'Etapa 5: Campos personalizados' },
    { value: 'stage6', label: 'Etapa 6: Secciones' },
    { value: 'stage7', label: 'Etapa 7: Preguntas' },
  ];

  return (
    <div className="flex w-full min-w-0 max-w-full touch-pan-y flex-col gap-4 overflow-x-hidden">
      <div className="border-b border-slate-800/70 pb-4">
        <SectionHeader
          eyebrow="Gestion"
          title="Gestion de monitoreos"
          description="Constructor por etapas para solicitudes, fichas, secciones y preguntas."
          size="page"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="ds-badge ds-badge-info">
            Rol: {isAdmin ? 'Administrador' : 'Especialista'}
          </span>
          {!isAdmin ? (
            <span className="text-small">
              Puedes crear y editar. La aprobacion y rechazo quedan reservados al administrador.
            </span>
          ) : null}
        </div>
      </div>

      {isMobileLayout ? (
        <div className="inline-flex w-full rounded-xl border border-slate-800/80 bg-slate-900/45 p-1">
          <button
            type="button"
            onClick={() => setMobilePanel('requests')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
              mobilePanel === 'requests'
                ? 'border border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            Solicitudes
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel('editor')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
              mobilePanel === 'editor'
                ? 'border border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            Edicion
          </button>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={`flex min-w-0 h-full max-w-full flex-col gap-3 overflow-hidden p-3.5 ${isMobileLayout && mobilePanel !== 'requests' ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-h3">Solicitudes</p>
            <button type="button" onClick={resetToCreateMode} className="ds-btn ds-btn-primary h-8 px-3">
              <Plus size={13} />
              Nueva
            </button>
          </div>
          <p className="text-small">
            {dbMode === 'available' ? 'Persistencia: base de datos' : dbMode === 'unavailable' ? 'Persistencia: local' : 'Cargando datos...'}
          </p>

          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={listSearch}
              onChange={(event) => setListSearch(event.target.value)}
              placeholder="Buscar solicitud"
              className="ds-input h-9 pl-9 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Select
              id="requestStatusFilter"
              label="Estado"
              compact
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {REQUEST_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
            <Select
              id="requestPageSize"
              label="Por pagina"
              compact
              value={pageSize}
              onChange={(event) => setPageSize(event.target.value)}
            >
              <option value="5">5</option>
              <option value="8">8</option>
              <option value="12">12</option>
            </Select>
          </div>

          <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {isRequestsLoading ? (
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/55 px-3 py-4">
                <p className="text-small">Cargando solicitudes...</p>
              </div>
            ) : visibleRequests.length ? (
              visibleRequests.map((request) => {
                const displayStatus = resolveDisplayStatus(request);
                const selected = request.id === selectedRequestId;
                const meta = getWorkflowMeta(request);
                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => {
                      setSelectedRequestId(request.id);
                      setNotice({ tone: 'neutral', message: '' });
                      if (isMobileLayout) {
                        setMobilePanel('editor');
                        setMobileStage('stage1');
                      }
                    }}
                    className={`w-full min-w-0 max-w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition ${
                      selected
                        ? 'border-cyan-400/60 bg-cyan-500/12'
                        : 'border-slate-800/80 bg-slate-900/55 hover:border-slate-600/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{request.name}</p>
                      <span className={`${getStatusBadgeClass(displayStatus)} shrink-0`}>
                        <StatusIcon status={displayStatus} />
                        {getStatusLabel(displayStatus)}
                      </span>
                    </div>
                    {meta.hasPendingChanges ? (
                      <p className="text-small mt-1 text-amber-200">Actualizacion pendiente de revision</p>
                    ) : null}
                    {request.status === 'pending' && !meta.hasPendingChanges ? (
                      <p className="text-small mt-1 text-cyan-200">Solicitud nueva pendiente</p>
                    ) : null}
                    <p className="text-small mt-1 text-slate-400">{formatDateRange(request.startDate, request.endDate)}</p>
                    <p className="text-small text-slate-500">{request.code}</p>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-900/40 px-3 py-4 text-center">
                <p className="text-small">No se encontraron solicitudes.</p>
              </div>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-800/70 pt-3">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage <= 1}
              className="ds-btn ds-btn-secondary h-8 px-2"
            >
              <ChevronLeft size={13} />
            </button>
            <p className="text-small">
              Pagina {safePage} de {totalPages}
            </p>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
              className="ds-btn ds-btn-secondary h-8 px-2"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </Card>

        <div className={`min-w-0 space-y-4 ${isMobileLayout && mobilePanel !== 'editor' ? 'hidden' : ''}`}>
          {isMobileLayout ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 p-2.5">
              <Select
                id="mobileStageSelector"
                label="Paso"
                compact
                value={mobileStage}
                onChange={(event) => setMobileStage(event.target.value)}
              >
                {mobileStageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {showStage('stage1') ? (
          <Card className="min-w-0 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader
                eyebrow="Etapa 1"
                title={selectedRequest ? 'Solicitud seleccionada' : 'Nueva solicitud'}
                description="Define nombre, alcance, filtros y restriccion por codigo."
              />
              {!selectedRequest ? <span className="ds-badge ds-badge-info">Borrador nuevo</span> : null}
            </div>
            {!selectedRequest && creationContextLabel ? (
              <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-2">
                <p className="text-small text-cyan-100">
                  Creando monitoreo para: <span className="font-semibold">{creationContextLabel}</span>
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                id="requestName"
                label="Nombre del monitoreo"
                value={requestDraft.name}
                onChange={(event) => setRequestDraft((prev) => ({ ...prev, name: event.target.value }))}
                error={requestErrors.name}
              />
              <Select
                id="requestCdd"
                label="Compromiso de desempeno (CdD)"
                value={requestDraft.cdd}
                onChange={(event) => setRequestDraft((prev) => ({ ...prev, cdd: event.target.value }))}
              >
                <option value="no">No aplica</option>
                <option value="si">Si aplica</option>
              </Select>
            </div>

            <Textarea
              id="requestDetail"
              label="Detalle"
              value={requestDraft.detail}
              onChange={(event) => setRequestDraft((prev) => ({ ...prev, detail: event.target.value }))}
              error={requestErrors.detail}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                id="requestStartDate"
                label="Fecha de inicio"
                type="datetime-local"
                value={requestDraft.startDate}
                onChange={(event) => setRequestDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                error={requestErrors.startDate}
              />
              <Input
                id="requestEndDate"
                label="Fecha de cierre"
                type="datetime-local"
                value={requestDraft.endDate}
                onChange={(event) => setRequestDraft((prev) => ({ ...prev, endDate: event.target.value }))}
                error={requestErrors.endDate}
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 p-3">
                <p className="ds-field-label">Filtros de gestion</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MANAGEMENT_OPTIONS.map((option) => {
                    const selected = requestDraft.managementFilters.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleManagementParentToggle(option.value)}
                        className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                          selected
                            ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                            : 'border-slate-700/70 bg-slate-900/50 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {requestDraft.managementFilters.includes('publica') ? (
                  <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-900/50 p-2.5">
                    <p className="text-small">Gestion publica: selecciona una o ambas opciones.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PUBLIC_MANAGEMENT_OPTIONS.map((option) => {
                        const selected = requestDraft.managementFilters.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handlePublicManagementToggle(option.value)}
                            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                              selected
                                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                                : 'border-slate-700/70 bg-slate-900/50 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {requestErrors.managementPublicFilters ? (
                      <p className="text-small mt-2 text-rose-300">{requestErrors.managementPublicFilters}</p>
                    ) : null}
                  </div>
                ) : null}
                {requestErrors.managementFilters ? (
                  <p className="text-small mt-2 text-rose-300">{requestErrors.managementFilters}</p>
                ) : null}
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div>
                  <MultiSelectPills
                    label="Filtros de modalidad"
                    options={MODALITY_OPTIONS}
                    selectedValues={requestDraft.modalityFilters}
                    onChange={handleModalityFiltersChange}
                  />
                  {requestErrors.modalityFilters ? (
                    <p className="text-small mt-2 text-rose-300">{requestErrors.modalityFilters}</p>
                  ) : null}
                </div>
                <div>
                  <SingleSelectPills
                    label="Tipo"
                    options={TYPE_OPTIONS}
                    selectedValue={selectedType}
                    onChange={handleTypeFilterChange}
                  />
                  {requestErrors.typeFilters ? (
                    <p className="text-small mt-2 text-rose-300">{requestErrors.typeFilters}</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 p-3">
                <p className="ds-field-label">Filtros de nivel</p>
                <p className="text-small mt-1">Los niveles disponibles dependen de la modalidad seleccionada.</p>
                {requestDraft.modalityFilters.length ? (
                  <div className="mt-2">
                    <MultiSelectPills
                      label="Niveles compatibles"
                      options={availableLevelOptions}
                      selectedValues={requestDraft.levelFilters}
                      onChange={handleLevelFiltersChange}
                    />
                  </div>
                ) : (
                  <p className="text-small mt-2">Selecciona al menos una modalidad para habilitar niveles.</p>
                )}
                {requestDraft.modalityFilters.length > 0 &&
                requestDraft.levelFilters.length === 0 &&
                !requestErrors.levelFilters ? (
                  <p className="text-small mt-2 text-amber-200">Selecciona al menos un nivel para continuar.</p>
                ) : null}
                {filterInfo ? <p className="text-small mt-2 text-amber-200">{filterInfo}</p> : null}
                {requestErrors.levelFilters ? (
                  <p className="text-small mt-2 text-rose-300">{requestErrors.levelFilters}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Select
                id="requestRestriction"
                label="Restriccion de guardado por codigo"
                value={requestDraft.restriction}
                onChange={(event) => setRequestDraft((prev) => ({ ...prev, restriction: event.target.value }))}
              >
                {RESTRICTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/55 px-3 py-2.5">
                <p className="text-small">{getRestrictionHelp(requestDraft.restriction, requestDraft)}</p>
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 ${
                isFocalizedType
                  ? 'border-cyan-500/40 bg-cyan-500/5'
                  : 'border-slate-800/80 bg-slate-900/45'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="ds-field-label">Instituciones (seleccion manual)</p>
                {!isFocalizedType ? (
                  <button
                    type="button"
                    onClick={() => setShowNonFocalizedInstitutions((prev) => !prev)}
                    className="ds-btn ds-btn-secondary h-8 px-3 text-xs"
                  >
                    {showInstitutionsBlock ? 'Ocultar bloque IE' : 'Mostrar bloque IE'}
                  </button>
                ) : (
                  <span className="ds-badge ds-badge-info">Tipo focalizado</span>
                )}
              </div>
              <p className="text-small mt-1">
                {isFocalizedType
                  ? 'Tipo focalizado activo: selecciona IE por nombre, codigo local o codigo modular.'
                  : 'Opcional para tipo no focalizado.'}
              </p>

              {showInstitutionsBlock ? (
                <>
                  <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      id="institutionSearch"
                      label="Buscar IE por nombre o codigo"
                      value={institutionSearch}
                      onChange={(event) => setInstitutionSearch(event.target.value)}
                      placeholder="Nombre IE, cod local o cod modular"
                    />
                    <button
                      type="button"
                      onClick={() => setInstitutionSearch('')}
                      className="ds-btn ds-btn-secondary h-10 self-end"
                    >
                      Limpiar
                    </button>
                  </div>

                  {isInstitutionsLoading ? <p className="text-small mt-2">Cargando instituciones...</p> : null}

                  {suggestionRows.length ? (
                    <div className="mt-2 space-y-1 rounded-xl border border-slate-800/80 bg-slate-900/60 p-2">
                      {suggestionRows.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAddInstitution(item)}
                          className="w-full rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-slate-700/70 hover:bg-slate-800/55"
                        >
                          <p className="text-sm font-medium text-slate-100">{item.name}</p>
                          <p className="text-small">
                            Cod. local: {item.codLocal || '-'} | Cod. modular: {item.codModular || '-'} |{' '}
                            {item.district || '-'}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {requestDraft.institutions.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {requestDraft.institutions.map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100"
                        >
                          {item.name}
                          <button
                            type="button"
                            onClick={() => handleRemoveInstitution(item.id)}
                            className="text-cyan-200/80 transition hover:text-cyan-100"
                            aria-label="Quitar institucion"
                          >
                            <XCircle size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-small mt-2">Sin instituciones focalizadas.</p>
                  )}
                </>
              ) : (
                <p className="text-small mt-2">Bloque de instituciones oculto para tipo no focalizado.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!selectedRequest ? (
                <button type="button" onClick={handleCreateRequest} className="ds-btn ds-btn-primary">
                  <Plus size={14} />
                  Crear solicitud
                </button>
              ) : (
                <span className="ds-badge ds-badge-neutral">Codigo: {selectedRequest.code}</span>
              )}
              {renderNotice()}
            </div>
          </Card>
          ) : null}

          {showStage('stage2') ? (
          <Card className="min-w-0 space-y-3">
            <SectionHeader
              eyebrow="Etapa 2"
              title={isAdmin ? 'Edicion y aprobacion de solicitud' : 'Estado de revision de la solicitud'}
              description={
                isAdmin
                  ? 'Aprobar, rechazar, guardar cambios o eliminar solicitud.'
                  : 'El administrador valida aprobaciones y observaciones. Puedes seguir editando y guardando avances.'
              }
            />

            {selectedRequest ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={getStatusBadgeClass(resolveDisplayStatus(selectedRequest))}>
                    <StatusIcon status={resolveDisplayStatus(selectedRequest)} />
                    {getStatusLabel(resolveDisplayStatus(selectedRequest))}
                  </span>
                  {hasPendingChanges(selectedRequest) ? (
                    <span className="ds-badge ds-badge-warning">Cambios pendientes</span>
                  ) : null}
                  {selectedRequest.workflowMeta?.reviewNote ? (
                    <span className="ds-badge ds-badge-danger">Requiere ajustes</span>
                  ) : null}
                  <span className="text-small">{selectedRequest.code}</span>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 px-3 py-2.5">
                  <p className="text-small">
                    Estado: <span className="text-slate-100">{getWorkflowLabel(selectedRequest)}</span>
                  </p>
                  <p className="text-small mt-1">
                    Ultimo guardado:{' '}
                    {selectedRequest.workflowMeta?.lastSavedAt
                      ? new Intl.DateTimeFormat('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(selectedRequest.workflowMeta.lastSavedAt))
                      : 'Sin registro'}
                  </p>
                  {selectedRequest.workflowMeta?.reviewNote ? (
                    <p className="text-small mt-1 text-amber-200">
                      Observacion admin: {selectedRequest.workflowMeta.reviewNote}
                    </p>
                  ) : null}
                </div>
                {isAdmin && hasPendingChanges(selectedRequest) ? (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 px-3 py-2.5">
                    <p className="text-sm font-semibold text-amber-100">Comparacion de cambios pendientes</p>
                    <p className="text-small mt-1">
                      {hasApprovedSnapshot(selectedRequest)
                        ? 'Actualizacion pendiente sobre una solicitud ya aprobada.'
                        : 'Solicitud nueva pendiente de revision.'}
                    </p>
                    {pendingChangesSummary.length ? (
                      <ul className="mt-2 space-y-1">
                        {pendingChangesSummary.map((item) => (
                          <li key={item} className="text-small text-amber-100/95">
                            - {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-small mt-2">No se detectaron diferencias resumidas en el cambio pendiente.</p>
                    )}
                    <p className="text-small mt-2">
                      Editor: {selectedRequest.workflowMeta?.pendingChangeBy || selectedRequest.workflowMeta?.lastSavedBy || '-'}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleSaveRequest} className="ds-btn ds-btn-secondary">
                    <Save size={13} />
                    Guardar cambios
                  </button>
                  <button type="button" onClick={handleReapplyInstitutions} className="ds-btn ds-btn-secondary">
                    Reaplicar filtros IE
                  </button>
                  {isAdmin ? (
                    <>
                      <button type="button" onClick={handleApproveRequest} className="ds-btn ds-btn-primary">
                        <ShieldCheck size={13} />
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={handlePublishRequest}
                        className="ds-btn ds-btn-primary"
                        disabled={!canPublishRequest}
                        title={canPublishRequest ? 'Publicar en Monitoreos' : publishBlockedReason}
                      >
                        <CheckCircle2 size={13} />
                        {selectedRequest.status === 'published' ? 'Actualizar publicacion' : 'Publicar en Monitoreos'}
                      </button>
                      <button type="button" onClick={handleRejectRequest} className="ds-btn ds-btn-secondary">
                        <XCircle size={13} />
                        Rechazar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(selectedRequest)}
                        className="ds-btn ds-btn-danger"
                      >
                        <Trash2 size={13} />
                        Eliminar
                      </button>
                    </>
                  ) : null}
                </div>
                {isAdmin && !canPublishRequest ? (
                  <p className="text-small text-amber-200">{publishBlockedReason}</p>
                ) : null}
                {isAdmin ? (
                  <Textarea
                    id="reviewComment"
                    label="Observacion administrativa (obligatoria para rechazar)"
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                    placeholder="Indica el ajuste solicitado al especialista."
                  />
                ) : null}
              </>
            ) : (
              <p className="text-small">Crea o selecciona una solicitud para habilitar esta etapa.</p>
            )}
          </Card>
          ) : null}

          {showStage('stage3') ? (selectedRequest ? (
            <Card className="min-w-0 space-y-4">
              <SectionHeader
                eyebrow="Etapa 3"
                title="Fichas"
                description="Agrega una o mas fichas para la solicitud seleccionada."
              />

              <div className="space-y-2">
                {editableRequest?.sheets?.length ? (
                  editableRequest.sheets.map((sheet) => (
                    <div key={sheet.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/55 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSheetId(sheet.id)}
                        className={`min-w-0 text-left ${sheet.id === selectedSheetId ? 'text-cyan-100' : 'text-slate-200'}`}
                      >
                        <p className="truncate text-sm font-medium">{sheet.title}</p>
                        <p className="text-small">{sheet.code}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSheet(sheet.id)}
                        className="ds-btn ds-btn-danger h-8 px-2"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-small">Aun no hay fichas creadas.</p>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  id="sheetTitle"
                  label="Titulo de ficha"
                  value={sheetDraft.title}
                  onChange={(event) => setSheetDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
                <Input
                  id="sheetCode"
                  label="Codigo"
                  value={sheetDraft.code}
                  onChange={(event) => setSheetDraft((prev) => ({ ...prev, code: event.target.value }))}
                />
                <Input
                  id="sheetSubtitle"
                  label="Subtitulo"
                  value={sheetDraft.subtitle}
                  onChange={(event) => setSheetDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                />
              </div>

              <button type="button" onClick={handleAddSheet} className="ds-btn ds-btn-primary">
                <Plus size={13} />
                Agregar ficha
              </button>
            </Card>
          ) : (
            <StageDisabled
              title="Etapa 3 - Fichas"
              description="Primero crea o selecciona una solicitud valida para habilitar fichas."
            />
          )) : null}

          {showStage('stage4') ? (selectedSheet ? (
            <Card className="min-w-0 space-y-4">
              <SectionHeader
                eyebrow="Etapa 4"
                title="Encabezado y cierre"
                description="Activa o desactiva campos predefinidos para la ficha activa."
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-900/55 p-3">
                  <p className="text-sm font-semibold text-slate-100">Campos de encabezado</p>
                  <div className="grid gap-1">
                    {HEADER_FIELD_OPTIONS.map((field) => (
                      <label key={field.id} className="inline-flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedSheet.headerFields?.[field.id])}
                          onChange={() => handleToggleSheetField('header', field.id)}
                        />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-900/55 p-3">
                  <p className="text-sm font-semibold text-slate-100">Campos de cierre</p>
                  <div className="grid gap-1">
                    {CLOSING_FIELD_OPTIONS.map((field) => (
                      <label key={field.id} className="inline-flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedSheet.closingFields?.[field.id])}
                          onChange={() => handleToggleSheetField('closing', field.id)}
                        />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <StageDisabled
              title="Etapa 4 - Encabezado y cierre"
              description="Selecciona una ficha para configurar los campos predefinidos."
            />
          )) : null}

          {showStage('stage5') ? (selectedSheet ? (
            <Card className="min-w-0 space-y-4">
              <SectionHeader
                eyebrow="Etapa 5"
                title="Campos personalizados"
                description="Agrega campos dinamicos para adaptar la ficha sin tocar codigo."
              />

              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  id="dynamicFieldName"
                  label="Nombre del campo"
                  value={dynamicFieldDraft.name}
                  onChange={(event) =>
                    setDynamicFieldDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
                <Select
                  id="dynamicFieldType"
                  label="Tipo"
                  value={dynamicFieldDraft.type}
                  onChange={(event) =>
                    setDynamicFieldDraft((prev) => ({ ...prev, type: event.target.value, options: [] }))
                  }
                >
                  {DYNAMIC_FIELD_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <label className="ds-input-label justify-end">
                  <span className="ds-field-label">Obligatorio</span>
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/55 px-3">
                    <input
                      type="checkbox"
                      checked={dynamicFieldDraft.required}
                      onChange={(event) =>
                        setDynamicFieldDraft((prev) => ({ ...prev, required: event.target.checked }))
                      }
                    />
                    <span className="text-sm text-slate-200">Si</span>
                  </div>
                </label>
                <button type="button" onClick={handleAddDynamicField} className="ds-btn ds-btn-primary self-end">
                  <Plus size={13} />
                  Agregar campo
                </button>
              </div>

              {dynamicFieldDraft.type === 'select' ? (
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/55 p-3">
                  <p className="ds-field-label">Opciones de lista</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={dynamicOptionInput}
                      onChange={(event) => setDynamicOptionInput(event.target.value)}
                      placeholder="Nueva opcion"
                      className="ds-input h-9 max-w-sm"
                    />
                    <button type="button" onClick={handleAddDynamicOption} className="ds-btn ds-btn-secondary h-9">
                      Agregar opcion
                    </button>
                  </div>
                  {dynamicFieldDraft.options.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dynamicFieldDraft.options.map((option) => (
                        <span key={option} className="ds-badge ds-badge-info">
                          {option}
                          <button
                            type="button"
                            onClick={() => handleRemoveDynamicOption(option)}
                            className="text-cyan-100/90"
                          >
                            <XCircle size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                {(selectedSheet.dynamicFields || []).length ? (
                  selectedSheet.dynamicFields.map((field) => (
                    <div key={field.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/55 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{field.name}</p>
                        <p className="text-small">
                          {DYNAMIC_FIELD_TYPES.find((item) => item.value === field.type)?.label || field.type}
                          {field.required ? ' | Obligatorio' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDynamicField(field.id)}
                        className="ds-btn ds-btn-danger h-8 px-2"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-small">No hay campos personalizados en esta ficha.</p>
                )}
              </div>
            </Card>
          ) : (
            <StageDisabled
              title="Etapa 5 - Campos personalizados"
              description="Selecciona una ficha para agregar campos dinamicos del encabezado."
            />
          )) : null}

          {showStage('stage6') ? (selectedSheet ? (
            <Card className="min-w-0 space-y-4">
              <SectionHeader
                eyebrow="Etapa 6"
                title="Secciones"
                description="Crea secciones y marca una activa para agregar preguntas."
              />

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  id="sectionName"
                  label="Nombre de seccion"
                  value={sectionName}
                  onChange={(event) => setSectionName(event.target.value)}
                />
                <button type="button" onClick={handleAddSection} className="ds-btn ds-btn-primary self-end">
                  <Plus size={13} />
                  Agregar seccion
                </button>
              </div>

              <div className="space-y-2">
                {(selectedSheet.sections || []).length ? (
                  selectedSheet.sections.map((section) => (
                    <div key={section.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/55 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSectionId(section.id)}
                        className={`min-w-0 text-left ${
                          selectedSectionId === section.id ? 'text-cyan-100' : 'text-slate-200'
                        }`}
                      >
                        <p className="truncate text-sm font-medium">{section.name}</p>
                        <p className="text-small">{(section.questions || []).length} preguntas</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSection(section.id)}
                        className="ds-btn ds-btn-danger h-8 px-2"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-small">No hay secciones creadas.</p>
                )}
              </div>
            </Card>
          ) : (
            <StageDisabled
              title="Etapa 6 - Secciones"
              description="Selecciona una ficha para crear secciones de preguntas."
            />
          )) : null}

          {showStage('stage7') ? (selectedSection ? (
            <Card className="min-w-0 space-y-4">
              <SectionHeader
                eyebrow="Etapa 7"
                title="Preguntas"
                description="Cada pregunta pertenece a la seccion seleccionada y adapta su tipo de respuesta."
              />

              <Textarea
                id="questionText"
                label="Enunciado de la pregunta"
                value={questionDraft.text}
                onChange={(event) => setQuestionDraft((prev) => ({ ...prev, text: event.target.value }))}
              />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Select
                  id="questionType"
                  label="Tipo de respuesta"
                  value={questionDraft.type}
                  onChange={(event) => handleQuestionTypeChange(event.target.value)}
                >
                  {QUESTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                <label className="ds-input-label justify-end">
                  <span className="ds-field-label">Obligatoria</span>
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/55 px-3">
                    <input
                      type="checkbox"
                      checked={questionDraft.required}
                      onChange={(event) =>
                        setQuestionDraft((prev) => ({ ...prev, required: event.target.checked }))
                      }
                    />
                    <span className="text-sm text-slate-200">Si</span>
                  </div>
                </label>

                <label className="ds-input-label justify-end">
                  <span className="ds-field-label">Observaciones</span>
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/55 px-3">
                    <input
                      type="checkbox"
                      checked={questionDraft.allowObservation}
                      onChange={(event) =>
                        setQuestionDraft((prev) => ({ ...prev, allowObservation: event.target.checked }))
                      }
                    />
                    <span className="text-sm text-slate-200">Permitir</span>
                  </div>
                </label>

                {questionDraft.type === 'number' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="questionMin"
                      label="Min"
                      type="number"
                      value={questionDraft.minValue}
                      onChange={(event) =>
                        setQuestionDraft((prev) => ({ ...prev, minValue: event.target.value }))
                      }
                    />
                    <Input
                      id="questionMax"
                      label="Max"
                      type="number"
                      value={questionDraft.maxValue}
                      onChange={(event) =>
                        setQuestionDraft((prev) => ({ ...prev, maxValue: event.target.value }))
                      }
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/55 px-3 py-2.5">
                    <p className="text-small">
                      {questionDraft.type === 'pdf'
                        ? 'Esta pregunta pedira carga de archivo PDF.'
                        : 'Configura opciones y campos adicionales segun corresponda.'}
                    </p>
                  </div>
                )}
              </div>

              {questionDraft.type === 'options' || questionDraft.type === 'yes_no_levels' ? (
                <div className="rounded-xl border border-slate-800/80 bg-slate-900/55 p-3">
                  <p className="ds-field-label">Opciones de respuesta</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={questionOptionInput}
                      onChange={(event) => setQuestionOptionInput(event.target.value)}
                      placeholder="Nueva opcion"
                      className="ds-input h-9 max-w-sm"
                    />
                    <button type="button" onClick={handleAddQuestionOption} className="ds-btn ds-btn-secondary h-9">
                      Agregar opcion
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {questionDraft.options.map((option) => (
                      <span key={option} className="ds-badge ds-badge-neutral">
                        {option}
                        <button type="button" onClick={() => handleRemoveQuestionOption(option)}>
                          <XCircle size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-800/80 bg-slate-900/55 p-3">
                <p className="ds-field-label">Campos adicionales por pregunta</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={extraFieldInput}
                    onChange={(event) => setExtraFieldInput(event.target.value)}
                    placeholder="Ej. Evidencia o Recomendacion"
                    className="ds-input h-9 max-w-sm"
                  />
                  <button type="button" onClick={handleAddExtraField} className="ds-btn ds-btn-secondary h-9">
                    Agregar campo extra
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {questionDraft.extraFields.map((field) => (
                    <span key={field} className="ds-badge ds-badge-info">
                      {field}
                      <button type="button" onClick={() => handleRemoveExtraField(field)}>
                        <XCircle size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => saveQuestion(false)} className="ds-btn ds-btn-primary">
                  Guardar pregunta
                </button>
                <button type="button" onClick={() => saveQuestion(true)} className="ds-btn ds-btn-secondary">
                  Guardar y agregar otra
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestionDraft(createEmptyQuestionDraft());
                    setQuestionOptionInput('');
                    setExtraFieldInput('');
                  }}
                  className="ds-btn ds-btn-secondary"
                >
                  Cancelar
                </button>
              </div>

              <div className="space-y-2">
                {(selectedSection.questions || []).length ? (
                  selectedSection.questions.map((question, index) => (
                    <div key={question.id} className="rounded-xl border border-slate-800/80 bg-slate-900/55 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-100">
                            {index + 1}. {question.text}
                          </p>
                          <p className="text-small mt-1">
                            {QUESTION_TYPE_OPTIONS.find((option) => option.value === question.type)?.label ||
                              question.type}
                            {question.required ? ' | Obligatoria' : ''}
                            {question.allowObservation ? ' | Con observaciones' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(question.id)}
                          className="ds-btn ds-btn-danger h-8 px-2"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-small">No hay preguntas en la seccion activa.</p>
                )}
              </div>
            </Card>
          ) : (
            <StageDisabled
              title="Etapa 7 - Preguntas"
              description="Selecciona una seccion para registrar preguntas con tipos de respuesta."
            />
          )) : null}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        tone="danger"
        title="Eliminar solicitud"
        description="Esta accion eliminara la solicitud y todas sus fichas, secciones y preguntas."
        details={deleteTarget?.name || ''}
        confirmText="Si, eliminar"
        cancelText="Cancelar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
