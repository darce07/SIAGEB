import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Loader2,
  PanelLeftOpen,
  Send,
  Settings,
  X,
} from 'lucide-react';
import chatbotIcon from '../assets/chatbot-icon.png';
import { SIDEBAR_SECTIONS } from '../data/fichaEscritura.js';
import { supabase } from '../lib/supabase.js';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const MAX_VISIBLE_ASSISTANT_CARDS = 3;
const ASSISTANT_HISTORY_MAX_MESSAGES = 50;
const ASSISTANT_RETENTION_DAYS = 30;
const ASSISTANT_STORAGE_PREFIX = 'monitoreoAssistantHistory';
const ASSISTANT_SESSION_STORAGE_PREFIX = 'monitoreoAssistantSessionHistory';
const ASSISTANT_MODE_PREFIX = 'monitoreoAssistantMode';
const ASSISTANT_MODE_PERSISTENT = 'persistent';
const ASSISTANT_MODE_TEMPORARY = 'temporary';
const ASSISTANT_QUICK_ACTIONS_KEY = 'monitoreoAssistantQuickActions';
const ASSISTANT_AUTO_CLOSE_KEY = 'monitoreoAssistantAutoClose';
const ASSISTANT_CLEAR_ON_LOGOUT_KEY = 'monitoreoAssistantClearOnLogout';
const DENSITY_STORAGE_KEY = 'monitoreoDensity';
const DENSITY_COMFORT = 'comfort';
const DENSITY_COMPACT = 'compact';
const HIGH_CONTRAST_STORAGE_KEY = 'monitoreoHighContrast';
const REDUCE_MOTION_STORAGE_KEY = 'monitoreoReduceMotion';
const SETTINGS_EVENT_NAME = 'monitoreo-settings-updated';
const SESSION_ACTIVITY_PREFIX = 'monitoreoSessionLastActivity';
const SESSION_LOGOUT_REASON_KEY = 'monitoreoSessionLogoutReason';
const SESSION_LOGOUT_REASON_INACTIVITY = 'inactivity';
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ACTIVITY_WRITE_THROTTLE_MS = 10 * 1000;
const ASSISTANT_WIZARD_BASE_STEPS = 7;
const ASSISTANT_SPECIALIST_ROLES = ['user', 'especialista', 'specialist', 'admin'];
const ASSISTANT_OBJECTIVE_TEXT_CANDIDATES = ['objective_text', 'text', 'description', 'label', 'objective'];
const ASSISTANT_OBJECTIVE_ORDER_CANDIDATES = ['order_index', 'order', 'position', null];
const WIZARD_LEVEL_OPTIONS = [
  { value: 'initial', label: 'Inicial' },
  { value: 'primary', label: 'Primaria' },
  { value: 'secondary', label: 'Secundaria' },
];
const WIZARD_MODALITY_OPTIONS = [
  { value: 'ebr', label: 'EBR' },
  { value: 'ebe', label: 'EBE' },
];
const WIZARD_EMPTY_RESPONSIBLE = {
  userId: '',
  name: '',
  email: '',
  level: '',
  modality: '',
  course: '',
};
const WIZARD_EMPTY_DRAFT = {
  title: '',
  startAt: '',
  endAt: '',
  description: '',
  objectives: [],
  responsibles: [],
  eventId: '',
  templateId: '',
};
const WIZARD_FIELD_ALIASES = {
  titulo: 'title',
  título: 'title',
  title: 'title',
  'fecha inicio': 'startAt',
  inicio: 'startAt',
  'fecha fin': 'endAt',
  fin: 'endAt',
  vencimiento: 'endAt',
  responsables: 'responsibles',
  responsable: 'responsibles',
  descripcion: 'description',
  descripción: 'description',
  objetivos: 'objectives',
  objetivo: 'objectives',
};
const ASSISTANT_WIZARD_EDIT_FIELDS = [
  { id: 'title', label: 'Título', command: 'editar titulo' },
  { id: 'startAt', label: 'Fecha inicio', command: 'editar fecha inicio' },
  { id: 'endAt', label: 'Fecha fin', command: 'editar fecha fin' },
  { id: 'responsibles', label: 'Responsables', command: 'editar responsables' },
  { id: 'description', label: 'Descripción', command: 'editar descripcion' },
  { id: 'objectives', label: 'Objetivos', command: 'editar objetivos' },
];
const ASSISTANT_QUICK_ACTIONS = [
  { id: 'active', label: 'Activos', prompt: 'Que monitoreos estan activos', type: 'prompt' },
  { id: 'upcoming', label: 'Vencen pronto', prompt: 'Que monitoreos estan por vencer', type: 'prompt' },
  { id: 'today', label: 'Hoy', prompt: 'Que monitoreos tengo hoy', type: 'prompt' },
  { id: 'create-monitoring', label: '+ Crear monitoreo', type: 'wizard' },
];
const ASSISTANT_GREETING_REGEX =
  /^(hola|buen(?:os|as)\s+d[ií]as|buen(?:as)\s+tardes|buen(?:as)\s+noches|saludos|que tal|gracias)\b/i;
const ASSISTANT_DOMAIN_QUERY_REGEX =
  /\b(monitoreo|monitoreos|reporte|reportes|calendario|seguimiento|documento|documentos|borrador|crear|activo|activos|vencen|vencer|hoy)\b/i;

const getDesktopDensityDefault = () => {
  if (typeof window !== 'undefined') {
    try {
      if (window.matchMedia('(min-width: 1024px)').matches) return DENSITY_COMPACT;
    } catch {
      // noop
    }
  }
  return DENSITY_COMFORT;
};

const resolveDensityPreference = () => {
  try {
    const storedDensity = localStorage.getItem(DENSITY_STORAGE_KEY);
    if ([DENSITY_COMFORT, DENSITY_COMPACT].includes(storedDensity)) {
      return storedDensity;
    }
  } catch {
    // noop
  }
  return getDesktopDensityDefault();
};

const resolveThemePreference = () => {
  try {
    const storedTheme = localStorage.getItem('monitoreoTheme');
    if (['dark', 'light', 'system'].includes(storedTheme)) {
      return storedTheme;
    }
  } catch {
    // noop
  }
  return 'dark';
};

const resolveEffectiveTheme = (themePreference) => {
  if (themePreference !== 'system') return themePreference;
  if (typeof window !== 'undefined') {
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      // noop
    }
  }
  return 'dark';
};

const readBooleanSetting = (key, fallback = false) => {
  try {
    const value = localStorage.getItem(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
  } catch {
    // noop
  }
  return fallback;
};

const normalizeAssistantUserKey = (value) =>
  String(value || 'anon')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');

const buildStorageKey = (prefix, userKey) => `${prefix}:${normalizeAssistantUserKey(userKey)}`;

const getAssistantGreetingText = (name = '') =>
  name
    ? `Hola ${name}, soy Yoryi, tu asistente virtual de AGEBRE. Puedo ayudarte con monitoreos, reportes y documentos.`
    : 'Hola, soy Yoryi, tu asistente virtual de AGEBRE. Puedo ayudarte con monitoreos, reportes y documentos.';

const isSameDayText = (left, right) => String(left || '').trim() === String(right || '').trim();

const asDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
};

const pruneAssistantMessages = (messages = []) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ASSISTANT_RETENTION_DAYS);

  const filtered = messages.filter((message) => {
    const createdAt = asDate(message?.createdAt);
    if (!createdAt) return true;
    return createdAt >= cutoff;
  });

  return filtered.slice(-ASSISTANT_HISTORY_MAX_MESSAGES);
};

const buildChatMessage = (role, text, extra = {}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  text,
  createdAt: extra.createdAt || new Date().toISOString(),
  kind: extra.kind || 'message',
});

const buildGreetingMessage = (name = '') =>
  buildChatMessage('assistant', getAssistantGreetingText(name), { kind: 'greeting' });

const parseAssistantListItem = (rawItem) => {
  const content = String(rawItem || '').trim();
  const contentMatch = content.match(/^(.*?)(?:\s*\(([^)]*)\))?$/);
  const title = (contentMatch?.[1] || content).trim();
  const metaText = (contentMatch?.[2] || '').trim();
  const statusMatch = content.match(/\b(Activo|Vencido|Programado|Cerrado)\b/i);
  const dateRangeMatch = content.match(/(\d{2}\/\d{2}\/\d{4})(?:\s*a\s*(\d{2}\/\d{2}\/\d{4}))?/);

  const status = statusMatch?.[1]
    ? statusMatch[1].charAt(0).toUpperCase() + statusMatch[1].slice(1).toLowerCase()
    : '';
  const dateLabel = dateRangeMatch?.[2]
    ? `${dateRangeMatch[1]} a ${dateRangeMatch[2]}`
    : dateRangeMatch?.[1] || '';

  let extraMeta = metaText;
  if (status) extraMeta = extraMeta.replace(statusMatch[0], '');
  if (dateLabel) extraMeta = extraMeta.replace(dateRangeMatch[0], '');
  extraMeta = extraMeta.replace(/^,\s*/, '').trim();

  return {
    title: title || content,
    status,
    dateLabel,
    extraMeta,
  };
};

const parseAssistantListMessage = (rawText) => {
  const lines = String(rawText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const title = lines[0].replace(/:$/, '').trim();
  const bulletLines = lines.slice(1).filter((line) => line.startsWith('-'));
  if (!bulletLines.length) return null;

  const items = [];
  let summarizedCount = 0;

  bulletLines.forEach((line) => {
    const content = line.replace(/^-+\s*/, '').trim();
    if (!content) return;

    const summaryMatch = content.match(/^\.{3}\s*y\s+(\d+)\s+m[aá]s\.?$/i);
    if (summaryMatch) {
      summarizedCount = Number(summaryMatch[1]) || 0;
      return;
    }

    items.push(parseAssistantListItem(content));
  });

  if (!items.length) return null;

  const hasInternalFlags = items.some((item) => /^\[(OK|!)]/i.test(item.title));
  const isNoResultsOnly = items.length === 1 && /no se encontraron resultados/i.test(items[0].title);
  if (hasInternalFlags || isNoResultsOnly) return null;

  return { title, items, summarizedCount };
};

const parseSimpleBulletMessage = (rawText) => {
  const lines = String(rawText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const intro = [];
  const bullets = [];

  lines.forEach((line) => {
    if (line.startsWith('-')) {
      const bullet = line.replace(/^-+\s*/, '').trim();
      if (bullet) bullets.push(bullet);
      return;
    }
    intro.push(line);
  });

  if (!bullets.length) return null;
  return { intro, bullets };
};

const shouldRenderAssistantItemActions = (listTitle, item) => {
  const title = String(listTitle || '');
  const hasMonitoringContext =
    /\b(monitoreo|monitoreos|seguimiento|calendario|reporte|reportes|evento|eventos)\b/i.test(title);
  const hasStatusOrDate = Boolean(item?.status || item?.dateLabel);
  return hasMonitoringContext || hasStatusOrDate;
};

const normalizeWizardCommandText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeChoiceTokens = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseNumericChoiceInput = (input, { mode = 'single', optionCount = 0 } = {}) => {
  const raw = String(input || '').trim();
  if (!raw) {
    return {
      isNumericAnswer: false,
      validIndices: [],
      invalidTokens: [],
      duplicateIndices: [],
    };
  }

  const tokens = normalizeChoiceTokens(raw);
  const hasComma = raw.includes(',');
  const hasDigitToken = tokens.some((token) => /^\d+$/.test(token));
  const isFullyNumeric = /^\s*\d+\s*(,\s*\d+\s*)*$/.test(raw);
  const isNumericAnswer = isFullyNumeric || (hasComma && hasDigitToken);

  if (!isNumericAnswer) {
    return {
      isNumericAnswer: false,
      validIndices: [],
      invalidTokens: [],
      duplicateIndices: [],
    };
  }

  let validIndices = [];
  const invalidTokens = [];
  const duplicateIndices = [];

  tokens.forEach((token) => {
    if (!/^\d+$/.test(token)) {
      invalidTokens.push(token);
      return;
    }

    const index = Number(token);
    if (!Number.isInteger(index) || index < 1 || index > optionCount) {
      invalidTokens.push(token);
      return;
    }

    if (validIndices.includes(index)) {
      duplicateIndices.push(index);
      return;
    }

    validIndices.push(index);
  });

  if (mode === 'single' && validIndices.length > 1) {
    duplicateIndices.push(...validIndices.slice(1));
    validIndices = validIndices.slice(0, 1);
  }

  return {
    isNumericAnswer: true,
    validIndices,
    invalidTokens,
    duplicateIndices: Array.from(new Set(duplicateIndices)),
  };
};

const resolveChoiceFromContext = (input, context) => {
  if (!context?.options?.length) return null;
  const parsed = parseNumericChoiceInput(input, {
    mode: context.mode || 'single',
    optionCount: context.options.length,
  });
  if (!parsed.isNumericAnswer) return parsed;
  const selectedOptions = parsed.validIndices
    .map((index) => context.options[index - 1])
    .filter(Boolean);
  return {
    ...parsed,
    selectedOptions,
  };
};

const buildChoiceParseFeedback = (parsed) => {
  if (!parsed?.isNumericAnswer) return '';
  const picked = parsed.validIndices || [];
  const invalidTokens = Array.from(new Set(parsed.invalidTokens || []));
  const duplicateIndices = Array.from(new Set(parsed.duplicateIndices || []));
  if (!invalidTokens.length && !duplicateIndices.length) return '';

  const ignored = [];
  if (invalidTokens.length) {
    ignored.push(`${invalidTokens.join(',')} (fuera de rango/no válido)`);
  }
  if (duplicateIndices.length) {
    ignored.push(`${duplicateIndices.join(',')} (duplicado)`);
  }

  if (picked.length) {
    return `Tomé: ${picked.join(',')}. Ignoré: ${ignored.join(' ; ')}.`;
  }
  return `No se encontraron opciones válidas. Ignoré: ${ignored.join(' ; ')}.`;
};

const extractNumberedOptionsFromText = (text) => {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines
    .map((line) => {
      const match = line.match(/^(\d+)[)\.\-]\s+(.+)$/);
      if (!match) return null;
      return {
        index: Number(match[1]),
        label: match[2].trim(),
      };
    })
    .filter(Boolean);

  if (parsed.length < 2) return [];
  if (parsed[0].index !== 1) return [];

  const deduped = [];
  const seen = new Set();
  parsed.forEach((item) => {
    if (!Number.isInteger(item.index) || item.index < 1 || seen.has(item.index)) return;
    seen.add(item.index);
    deduped.push(item);
  });

  deduped.sort((a, b) => a.index - b.index);
  if (!deduped.length) return [];

  return deduped.map((item) => ({
    label: item.label,
    value: item.label,
  }));
};

const buildQuickActionOptionContext = () => ({
  source: 'quick-actions',
  mode: 'single',
  options: ASSISTANT_QUICK_ACTIONS.map((action) => ({
    label: action.label,
    value: action.id,
  })),
});

const isAssistantGreetingOnly = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  if (!ASSISTANT_GREETING_REGEX.test(text)) return false;
  if (ASSISTANT_DOMAIN_QUERY_REGEX.test(text)) return false;
  return text.split(/\s+/).length <= 6;
};

const normalizeWizardLevel = (value) => {
  const raw = String(value || '').toLowerCase().trim();
  if (['inicial', 'initial'].includes(raw)) return 'initial';
  if (['primaria', 'primary'].includes(raw)) return 'primary';
  if (['secundaria', 'secondary'].includes(raw)) return 'secondary';
  return '';
};

const normalizeWizardModality = (value) => {
  const raw = String(value || '').toLowerCase().trim();
  if (raw === 'ebe') return 'ebe';
  if (raw === 'ebr') return 'ebr';
  return '';
};

const wizardLevelLabel = (value) =>
  WIZARD_LEVEL_OPTIONS.find((item) => item.value === value)?.label || 'No registrado';

const wizardModalityLabel = (value) =>
  WIZARD_MODALITY_OPTIONS.find((item) => item.value === value)?.label || 'No registrado';

const parseWizardDateToIso = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const parsed = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  const latamMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (latamMatch) {
    const parsed = new Date(`${latamMatch[3]}-${latamMatch[2]}-${latamMatch[1]}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
};

const formatWizardDate = (value) => {
  if (!value) return 'No registrado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No registrado';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
};

const createEmptyWizardState = () => ({
  active: false,
  step: '',
  history: [],
  draft: { ...WIZARD_EMPTY_DRAFT, objectives: [], responsibles: [] },
  currentResponsible: { ...WIZARD_EMPTY_RESPONSIBLE },
  pendingResponsibleQueue: [],
  specialistOptions: [],
  specialistsLoaded: false,
  objectiveTextColumn: 'objective_text',
  minimumSaved: false,
  awaitingPostCreateAction: false,
  loading: false,
  saving: false,
});

const countWizardMissingRequired = (draft) => {
  let missing = 0;
  if (!String(draft?.title || '').trim()) missing += 1;
  if (!draft?.startAt) missing += 1;
  if (!draft?.endAt) missing += 1;
  if (!Array.isArray(draft?.responsibles) || !draft.responsibles.length) missing += 1;
  return missing;
};

const getWizardMissingLabel = (missing) => {
  if (missing === 0) return 'Datos obligatorios completos';
  return `Faltan ${missing} ${missing === 1 ? 'dato obligatorio' : 'datos obligatorios'}`;
};

const getWizardStepIndicator = (draft, step, currentResponsible = {}) => {
  const normalizedStep = String(step || 'title');
  const missing = countWizardMissingRequired(draft);

  if (normalizedStep === 'completed') {
    return 'Flujo completado.';
  }

  if (
    ['postCreateChoice', 'optionalDescription', 'optionalObjective', 'optionalObjectiveMore'].includes(
      normalizedStep,
    )
  ) {
    return missing === 0
      ? 'Datos obligatorios completos. Puedes agregar detalles opcionales.'
      : getWizardMissingLabel(missing);
  }

  const currentLevel = normalizeWizardLevel(currentResponsible?.level);
  const lastResponsibleLevel = normalizeWizardLevel(
    Array.isArray(draft?.responsibles) && draft.responsibles.length
      ? draft.responsibles[draft.responsibles.length - 1]?.level
      : '',
  );

  const requiresCourseStep =
    normalizedStep === 'responsibleCourse' ||
    currentLevel === 'primary' ||
    currentLevel === 'secondary' ||
    (normalizedStep === 'responsibleMore' &&
      (lastResponsibleLevel === 'primary' || lastResponsibleLevel === 'secondary'));

  const totalSteps = requiresCourseStep ? ASSISTANT_WIZARD_BASE_STEPS + 1 : ASSISTANT_WIZARD_BASE_STEPS;
  const stepMap = {
    title: 1,
    startAt: 2,
    endAt: 3,
    responsibleUser: 4,
    responsibleLevel: 5,
    responsibleModality: 6,
    responsibleCourse: 7,
    responsibleMore: requiresCourseStep ? 8 : 7,
  };
  const currentStep = stepMap[normalizedStep] || Math.max(1, Math.min(totalSteps, totalSteps - missing));

  return `Paso ${currentStep} de ${totalSteps} - ${getWizardMissingLabel(missing)}`;
};

const formatWizardResponsiblesSummary = (responsibles = []) => {
  if (!responsibles.length) return ['No registrado'];
  return responsibles.map((item) => {
    const name = item.name || item.email || 'Responsable';
    const level = wizardLevelLabel(item.level);
    const modality = wizardModalityLabel(item.modality);
    const course = item.level !== 'initial' && item.course ? ` | Curso: ${item.course}` : '';
    return `${name} (${level} | ${modality}${course})`;
  });
};

const statusChipClassName = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'activo') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200';
  if (normalized === 'vencido' || normalized === 'cerrado') return 'border-rose-500/40 bg-rose-500/15 text-rose-200';
  if (normalized === 'programado') return 'border-amber-500/40 bg-amber-500/15 text-amber-200';
  return 'border-slate-600/60 bg-slate-800/60 text-slate-200';
};

export const SidebarContext = createContext({
  activeSection: 'datos',
  setActiveSection: () => {},
});

export default function MonitoreoLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('datos');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem('monitoreoSidebarCollapsed') === 'true',
  );
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(
    () => localStorage.getItem('monitoreoAssistantOpen') === 'true',
  );
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([buildGreetingMessage()]);
  const [assistantMode, setAssistantMode] = useState(ASSISTANT_MODE_PERSISTENT);
  const [assistantStorageReady, setAssistantStorageReady] = useState(false);
  const [assistantWizard, setAssistantWizard] = useState(() => createEmptyWizardState());
  const [assistantOptionContext, setAssistantOptionContext] = useState(() =>
    buildQuickActionOptionContext(),
  );
  const [assistantWizardEditMenuOpen, setAssistantWizardEditMenuOpen] = useState(false);
  const [expandedAssistantCards, setExpandedAssistantCards] = useState({});
  const assistantPanelRef = useRef(null);
  const assistantMessagesRef = useRef(null);
  const assistantMessagesEndRef = useRef(null);
  const assistantInputRef = useRef(null);
  const assistantToggleButtonRef = useRef(null);
  const mobileSidebarRef = useRef(null);
  const mobileSidebarButtonRef = useRef(null);
  const sessionTimeoutRef = useRef(null);
  const sessionLastWriteRef = useRef(0);
  const sessionLogoutInProgressRef = useRef(false);
  const wasAssistantOpenRef = useRef(false);
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('monitoreoFontSize') || 'normal');
  const [theme, setTheme] = useState(() => resolveThemePreference());
  const [density, setDensity] = useState(() => resolveDensityPreference());
  const [highContrast, setHighContrast] = useState(() =>
    readBooleanSetting(HIGH_CONTRAST_STORAGE_KEY, false),
  );
  const [reduceMotion, setReduceMotion] = useState(() =>
    readBooleanSetting(REDUCE_MOTION_STORAGE_KEY, false),
  );
  const [assistantQuickSuggestions, setAssistantQuickSuggestions] = useState(() =>
    readBooleanSetting(ASSISTANT_QUICK_ACTIONS_KEY, true),
  );
  const [assistantCloseOnOutside, setAssistantCloseOnOutside] = useState(() =>
    readBooleanSetting(ASSISTANT_AUTO_CLOSE_KEY, true),
  );
  const [assistantClearOnLogout, setAssistantClearOnLogout] = useState(() =>
    readBooleanSetting(ASSISTANT_CLEAR_ON_LOGOUT_KEY, false),
  );
  const [selectedTemplateSections, setSelectedTemplateSections] = useState(null);
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoAuth'));
    } catch {
      return null;
    }
  });
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoProfile')) || {};
    } catch {
      return {};
    }
  });

  const isAdmin = auth?.role === 'admin';
  const avatarUrl = profile?.avatarUrl || profile?.avatar_url || '';
  const displayName = useMemo(() => {
    if (profile?.fullName) return profile.fullName;
    if (profile?.full_name) return profile.full_name;
    if (profile?.firstName || profile?.lastName) {
      return `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
    }
    if (profile?.first_name || profile?.last_name) {
      return `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
    }
    if (auth?.name) return auth.name;
    if (auth?.email) return auth.email.split('@')[0];
    if (auth?.docNumber) return auth.docNumber;
    return 'Cargando...';
  }, [auth, profile]);
  const roleLabel = auth?.role === 'admin' ? 'Administrador' : 'Especialista';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
  const greetingName = useMemo(() => {
    const name = displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .join(' ');
    return name || '';
  }, [displayName]);
  const assistantUserKey = useMemo(
    () => profile?.id || auth?.email || auth?.docNumber || auth?.name || 'anon',
    [auth, profile],
  );
  const assistantPersistentKey = useMemo(
    () => buildStorageKey(ASSISTANT_STORAGE_PREFIX, assistantUserKey),
    [assistantUserKey],
  );
  const assistantSessionKey = useMemo(
    () => buildStorageKey(ASSISTANT_SESSION_STORAGE_PREFIX, assistantUserKey),
    [assistantUserKey],
  );
  const assistantModeKey = useMemo(
    () => buildStorageKey(ASSISTANT_MODE_PREFIX, assistantUserKey),
    [assistantUserKey],
  );
  const sessionActivityKey = useMemo(
    () => buildStorageKey(SESSION_ACTIVITY_PREFIX, assistantUserKey),
    [assistantUserKey],
  );

  const isFicha = location.pathname.includes('/monitoreo/ficha-escritura');
  const applyPreferences = (
    nextThemePreference,
    nextFontSize,
    nextDensity,
    nextHighContrast,
    nextReduceMotion,
  ) => {
    const effectiveTheme = resolveEffectiveTheme(nextThemePreference);
    localStorage.setItem('monitoreoTheme', nextThemePreference);
    localStorage.setItem('monitoreoFontSize', nextFontSize);
    localStorage.setItem(DENSITY_STORAGE_KEY, nextDensity);
    localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(Boolean(nextHighContrast)));
    localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, String(Boolean(nextReduceMotion)));
    document.documentElement.dataset.themePreference = nextThemePreference;
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.fontSize = nextFontSize;
    document.documentElement.dataset.density = nextDensity;
    document.documentElement.dataset.highContrast = String(Boolean(nextHighContrast));
    document.documentElement.dataset.reduceMotion = String(Boolean(nextReduceMotion));
  };

  const syncSettingsFromStorage = useCallback(() => {
    try {
      const nextTheme = resolveThemePreference();
      const nextFontSize = localStorage.getItem('monitoreoFontSize') || 'normal';
      const nextDensity = resolveDensityPreference();
      const nextHighContrast = readBooleanSetting(HIGH_CONTRAST_STORAGE_KEY, false);
      const nextReduceMotion = readBooleanSetting(REDUCE_MOTION_STORAGE_KEY, false);
      const nextAssistantQuickSuggestions = readBooleanSetting(ASSISTANT_QUICK_ACTIONS_KEY, true);
      const nextAssistantCloseOnOutside = readBooleanSetting(ASSISTANT_AUTO_CLOSE_KEY, true);
      const nextAssistantClearOnLogout = readBooleanSetting(ASSISTANT_CLEAR_ON_LOGOUT_KEY, false);
      const nextAssistantMode = localStorage.getItem(assistantModeKey);

      setTheme(nextTheme);
      setFontSize(nextFontSize);
      setDensity(nextDensity);
      setHighContrast(nextHighContrast);
      setReduceMotion(nextReduceMotion);
      setAssistantQuickSuggestions(nextAssistantQuickSuggestions);
      setAssistantCloseOnOutside(nextAssistantCloseOnOutside);
      setAssistantClearOnLogout(nextAssistantClearOnLogout);
      if (
        nextAssistantMode === ASSISTANT_MODE_PERSISTENT ||
        nextAssistantMode === ASSISTANT_MODE_TEMPORARY
      ) {
        setAssistantMode(nextAssistantMode);
      }
    } catch {
      // noop
    }
  }, [assistantModeKey]);

  const openAdvancedSettings = () => {
    setIsSettingsOpen(false);
    navigate('/monitoreo/configuracion');
  };
  const normalizeMessages = (messages = []) => {
    const normalized = (Array.isArray(messages) ? messages : []).map((message) => ({
      ...message,
      id: message?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: message?.createdAt || new Date().toISOString(),
      kind: message?.kind || 'message',
    }));
    return pruneAssistantMessages(normalized);
  };

  const setAssistantMessagesSafely = (updater) => {
    setAssistantMessages((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      return normalizeMessages(next);
    });
  };

  const removeStoredConversation = (mode = assistantMode) => {
    const key =
      mode === ASSISTANT_MODE_TEMPORARY
        ? assistantSessionKey
        : assistantPersistentKey;
    const storage =
      mode === ASSISTANT_MODE_TEMPORARY ? window.sessionStorage : window.localStorage;
    try {
      storage.removeItem(key);
    } catch {
      // noop
    }
  };

  const clearAllTemporaryAssistantConversations = useCallback(() => {
    try {
      const prefix = `${ASSISTANT_SESSION_STORAGE_PREFIX}:`;
      const keys = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => window.sessionStorage.removeItem(key));
    } catch {
      // noop
    }
  }, []);

  const readStoredConversation = (mode = assistantMode) => {
    const key =
      mode === ASSISTANT_MODE_TEMPORARY
        ? assistantSessionKey
        : assistantPersistentKey;
    const storage =
      mode === ASSISTANT_MODE_TEMPORARY ? window.sessionStorage : window.localStorage;

    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const payload = JSON.parse(raw);
      const expiresAt = asDate(payload?.expiresAt);
      if (expiresAt && expiresAt < new Date()) {
        storage.removeItem(key);
        return [];
      }
      return normalizeMessages(payload?.messages || []);
    } catch {
      return [];
    }
  };

  const persistConversation = (messages, mode = assistantMode) => {
    const key =
      mode === ASSISTANT_MODE_TEMPORARY
        ? assistantSessionKey
        : assistantPersistentKey;
    const storage =
      mode === ASSISTANT_MODE_TEMPORARY ? window.sessionStorage : window.localStorage;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ASSISTANT_RETENTION_DAYS);

    try {
      storage.setItem(
        key,
        JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          messages: normalizeMessages(messages),
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  const pushAssistantWizardMessage = (text) => {
    setAssistantMessagesSafely((prev) => [...prev, buildChatMessage('assistant', text, { kind: 'wizard' })]);
  };

  const resolveWizardSpecialistSelection = (input, options) => {
    const text = String(input || '').trim();
    if (!text) return null;
    const visibleOptions = options.slice(0, 10);
    if (/^\d+$/.test(text)) {
      const index = Number(text) - 1;
      return visibleOptions[index] || null;
    }
    const normalized = text.toLowerCase();
    return (
      options.find((item) => String(item.label || '').toLowerCase() === normalized) ||
      options.find((item) => String(item.email || '').toLowerCase() === normalized) ||
      options.find((item) => String(item.label || '').toLowerCase().includes(normalized)) ||
      null
    );
  };

  const getWizardSpecialistPrompt = (wizard) => {
    const lines = wizard.specialistOptions.slice(0, 10).map(
      (item, index) => `${index + 1}) ${item.label}${item.email ? ` (${item.email})` : ''}`,
    );
    return [
      `${getWizardStepIndicator(wizard.draft, wizard.step, wizard.currentResponsible)}`,
      'Selecciona especialista responsable (escribe número o correo).',
      'Responde con número. Si son varias opciones, usa comas.',
      ...lines,
    ].join('\n');
  };

  const buildWizardOptionContext = (wizard) => {
    const step = wizard?.step || '';
    if (step === 'responsibleUser') {
      const options = wizard.specialistOptions.slice(0, 10).map((item) => ({
        label: item.label,
        value: item,
      }));
      return options.length
        ? {
            source: 'wizard',
            step,
            mode: 'multi',
            options,
          }
        : null;
    }

    if (step === 'responsibleLevel') {
      return {
        source: 'wizard',
        step,
        mode: 'single',
        options: [
          { label: 'Inicial', value: 'initial' },
          { label: 'Primaria', value: 'primary' },
          { label: 'Secundaria', value: 'secondary' },
        ],
      };
    }

    if (step === 'responsibleModality') {
      return {
        source: 'wizard',
        step,
        mode: 'single',
        options: [
          { label: 'EBR', value: 'ebr' },
          { label: 'EBE', value: 'ebe' },
        ],
      };
    }

    if (step === 'responsibleMore') {
      return {
        source: 'wizard',
        step,
        mode: 'single',
        options: [
          { label: 'Sí', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      };
    }

    if (step === 'postCreateChoice') {
      return {
        source: 'wizard',
        step,
        mode: 'single',
        options: [
          { label: 'Abrir borrador', value: 'openDraft' },
          { label: 'Añadir detalles', value: 'addDetails' },
        ],
      };
    }

    if (step === 'optionalObjectiveMore') {
      return {
        source: 'wizard',
        step,
        mode: 'single',
        options: [
          { label: 'Sí', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      };
    }

    return null;
  };

  const getWizardPromptForStep = (wizard) => {
    const progress = getWizardStepIndicator(wizard.draft, wizard.step, wizard.currentResponsible);
    const currentResponsibleName =
      wizard.currentResponsible?.name || wizard.currentResponsible?.email || '';
    const pendingCount = Array.isArray(wizard.pendingResponsibleQueue)
      ? wizard.pendingResponsibleQueue.length
      : 0;
    const responsibleContextLine = currentResponsibleName
      ? `Responsable actual: ${currentResponsibleName}${pendingCount ? ` (${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} después de este).` : '.'}`
      : '';
    if (wizard.step === 'title') {
      return `${progress}\nIndica el título del monitoreo.`;
    }
    if (wizard.step === 'startAt') {
      return `${progress}\nIngresa la fecha de inicio (dd/mm/yyyy o yyyy-mm-dd).`;
    }
    if (wizard.step === 'endAt') {
      return `${progress}\nIngresa la fecha fin/vencimiento (dd/mm/yyyy o yyyy-mm-dd).`;
    }
    if (wizard.step === 'responsibleUser') {
      return getWizardSpecialistPrompt(wizard);
    }
    if (wizard.step === 'responsibleLevel') {
      return `${progress}${responsibleContextLine ? `\n${responsibleContextLine}` : ''}\nSelecciona nivel del responsable.\n1) Inicial\n2) Primaria\n3) Secundaria\nResponde con número o texto.`;
    }
    if (wizard.step === 'responsibleModality') {
      return `${progress}${responsibleContextLine ? `\n${responsibleContextLine}` : ''}\nSelecciona modalidad.\n1) EBR\n2) EBE\nResponde con número o texto.`;
    }
    if (wizard.step === 'responsibleCourse') {
      return `${progress}${responsibleContextLine ? `\n${responsibleContextLine}` : ''}\nEscribe el curso del responsable (obligatorio para Primaria/Secundaria).`;
    }
    if (wizard.step === 'responsibleMore') {
      return `${progress}\n¿Deseas agregar otro responsable?\n1) Sí\n2) No\nResponde con número o texto.`;
    }
    if (wizard.step === 'postCreateChoice') {
      return 'Puedes continuar con:\n1) Abrir borrador\n2) Añadir detalles\nResponde con número o texto.';
    }
    if (wizard.step === 'optionalDescription') {
      return 'Descripción (opcional): escribe el texto o responde "omitir".';
    }
    if (wizard.step === 'optionalObjective') {
      return 'Objetivos/metas (opcional): escribe un objetivo o responde "omitir".';
    }
    if (wizard.step === 'optionalObjectiveMore') {
      return '¿Deseas agregar otro objetivo?\n1) Sí\n2) No\nResponde con número o texto.';
    }
    if (wizard.step === 'completed') {
      return 'Flujo completado. Puedes abrir el borrador o crear otro monitoreo.';
    }
    return 'Continuemos con la creación del monitoreo.';
  };

  const fetchWizardSpecialists = async () => {
    const mapProfiles = (items = []) =>
      items.map((item) => {
        const label =
          item.full_name ||
          `${item.first_name || ''} ${item.last_name || ''}`.trim() ||
          item.email ||
          'Especialista';
        return {
          id: item.id,
          email: item.email || '',
          label,
        };
      });

    const listByFilters = async ({ applyStatus = true, applyRoles = true } = {}) => {
      let query = supabase
        .from('profiles')
        .select('id,full_name,first_name,last_name,email,role,status')
        .order('full_name', { ascending: true });

      if (applyStatus) query = query.eq('status', 'active');
      if (applyRoles && ASSISTANT_SPECIALIST_ROLES.length) query = query.in('role', ASSISTANT_SPECIALIST_ROLES);

      const { data, error } = await query;
      if (error) return { data: [], error };
      return { data: data || [], error: null };
    };

    let response = await listByFilters({ applyStatus: true, applyRoles: true });
    if (response.error) {
      response = await listByFilters({ applyStatus: false, applyRoles: false });
    } else if (!response.data.length) {
      response = await listByFilters({ applyStatus: true, applyRoles: false });
      if (!response.data.length) {
        response = await listByFilters({ applyStatus: false, applyRoles: false });
      }
    }

    if (response.error) throw response.error;

    return mapProfiles(response.data);
  };

  const toLegacyWizardLevel = (value) => {
    const normalized = normalizeWizardLevel(value);
    if (normalized === 'primary') return 'primaria';
    if (normalized === 'secondary') return 'secundaria';
    return 'inicial';
  };

  const upsertWizardObjectives = async (eventId, objectives, objectiveTextColumn) => {
    const objectiveRows = objectives
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    const { error: clearError } = await supabase
      .from('monitoring_event_objectives')
      .delete()
      .eq('event_id', eventId);
    if (clearError) throw clearError;

    if (!objectiveRows.length) return objectiveTextColumn;

    const textColumnsToTry = [
      objectiveTextColumn,
      ...ASSISTANT_OBJECTIVE_TEXT_CANDIDATES.filter((column) => column !== objectiveTextColumn),
    ];

    for (const textColumn of textColumnsToTry) {
      for (const orderColumn of ASSISTANT_OBJECTIVE_ORDER_CANDIDATES) {
        const payload = objectiveRows.map((objective, index) => {
          const row = {
            event_id: eventId,
            [textColumn]: objective,
            completed: false,
          };
          if (orderColumn) row[orderColumn] = index;
          return row;
        });

        const { error } = await supabase.from('monitoring_event_objectives').insert(payload);
        if (!error) return textColumn;
      }
    }

    throw new Error('No se pudieron guardar los objetivos.');
  };

  const persistWizardDraft = async (wizardSnapshot) => {
    const draft = wizardSnapshot.draft;
    const createdBy = profile?.id || null;
    const now = new Date().toISOString();
    const eventId = draft.eventId || crypto.randomUUID();

    const baseEventPayload = {
      id: eventId,
      title: String(draft.title || '').trim(),
      event_type: 'monitoring',
      description: String(draft.description || '').trim() || null,
      start_at: draft.startAt,
      end_at: draft.endAt,
      status: 'draft',
      created_by: createdBy,
    };

    let { error: eventError } = await supabase
      .from('monitoring_events')
      .upsert(baseEventPayload, { onConflict: 'id' });

    if (
      eventError &&
      /status|check/i.test(String(eventError.message || ''))
    ) {
      const fallbackPayload = { ...baseEventPayload, status: 'active' };
      const retry = await supabase
        .from('monitoring_events')
        .upsert(fallbackPayload, { onConflict: 'id' });
      eventError = retry.error || null;
    }

    if (eventError) throw eventError;

    const templatePayload = {
      id: eventId,
      title: String(draft.title || '').trim(),
      description: String(draft.description || '').trim() || null,
      status: 'draft',
      levels_config: { type: 'standard', levels: [] },
      sections: [],
      availability: {
        status: 'active',
        startAt: draft.startAt,
        endAt: draft.endAt,
      },
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    };

    const { error: templateError } = await supabase
      .from('monitoring_templates')
      .upsert(templatePayload, { onConflict: 'id' });
    if (templateError) throw templateError;

    const { error: clearResponsiblesError } = await supabase
      .from('monitoring_event_responsibles')
      .delete()
      .eq('event_id', eventId);
    if (clearResponsiblesError) throw clearResponsiblesError;

    const buildResponsiblesPayload = (useLegacyLevel = false) =>
      draft.responsibles.map((item) => ({
        event_id: eventId,
        user_id: item.userId,
        level: useLegacyLevel ? toLegacyWizardLevel(item.level) : normalizeWizardLevel(item.level),
        modality: normalizeWizardModality(item.modality) || 'ebr',
        course: normalizeWizardLevel(item.level) === 'initial' ? null : String(item.course || '').trim(),
      }));

    let { error: insertResponsiblesError } = await supabase
      .from('monitoring_event_responsibles')
      .insert(buildResponsiblesPayload(false));

    if (
      insertResponsiblesError &&
      /monitoring_event_responsibles_level_check/i.test(String(insertResponsiblesError.message || ''))
    ) {
      const retry = await supabase
        .from('monitoring_event_responsibles')
        .insert(buildResponsiblesPayload(true));
      insertResponsiblesError = retry.error || null;
    }

    if (insertResponsiblesError) throw insertResponsiblesError;

    const objectiveTextColumn = await upsertWizardObjectives(
      eventId,
      draft.objectives,
      wizardSnapshot.objectiveTextColumn || 'objective_text',
    );

    return { eventId, templateId: eventId, objectiveTextColumn };
  };

  const isWizardYes = (value) => {
    const normalized = normalizeWizardCommandText(value);
    return ['si', 's', 'yes', 'ok', 'claro'].includes(normalized);
  };

  const isWizardNo = (value) => {
    const normalized = normalizeWizardCommandText(value);
    return ['no', 'n', 'omitir', 'skip'].includes(normalized);
  };

  const promptWizardStep = (wizardState) => {
    const prompt = getWizardPromptForStep(wizardState);
    setAssistantOptionContext(buildWizardOptionContext(wizardState));
    setAssistantMessagesSafely((prev) => {
      const lastMessage = prev[prev.length - 1];
      const isDuplicatePrompt =
        lastMessage?.role === 'assistant' &&
        lastMessage?.kind === 'wizard' &&
        String(lastMessage?.text || '').trim() === String(prompt).trim();
      if (isDuplicatePrompt) return prev;
      return [...prev, buildChatMessage('assistant', prompt, { kind: 'wizard' })];
    });
  };

  const startAssistantWizard = async () => {
    if (assistantWizard.active) {
      pushAssistantWizardMessage('Ya estás en modo asistido. Puedes continuar o usar "Cancelar".');
      return;
    }

    setAssistantWizard((prev) => ({ ...prev, loading: true }));
    try {
      const specialistOptions = await fetchWizardSpecialists();
      if (!specialistOptions.length) {
        setAssistantWizard(createEmptyWizardState());
        setAssistantOptionContext(buildQuickActionOptionContext());
        pushAssistantWizardMessage(
          'No hay especialistas disponibles para asignar responsables. Revisa usuarios activos e inténtalo de nuevo.',
        );
        return;
      }
      const nextWizard = {
        ...createEmptyWizardState(),
        active: true,
        step: 'title',
        specialistOptions,
        specialistsLoaded: true,
      };
      setAssistantWizard(nextWizard);
      pushAssistantWizardMessage(
        'Modo asistido activado.\nTe guiaré paso a paso. Responde una pregunta por vez.',
      );
      promptWizardStep(nextWizard);
    } catch (error) {
      setAssistantWizard(createEmptyWizardState());
      setAssistantOptionContext(buildQuickActionOptionContext());
      pushAssistantWizardMessage(`No se pudo iniciar el asistente de creación.\n- ${error.message}`);
    }
  };

  const cancelAssistantWizard = () => {
    setAssistantWizard(createEmptyWizardState());
    setAssistantOptionContext(buildQuickActionOptionContext());
    pushAssistantWizardMessage('Creacion cancelada. No se aplicaron cambios adicionales.');
  };

  const goBackAssistantWizardStep = () => {
    setAssistantWizard((prev) => {
      if (!prev.active) return prev;
      if (!prev.history.length) {
        pushAssistantWizardMessage('No hay un paso anterior. Usa "Editar campo" para cambiar datos.');
        return prev;
      }
      const history = [...prev.history];
      const previousStep = history.pop();
      const next = { ...prev, step: previousStep, history };
      promptWizardStep(next);
      return next;
    });
  };

  const jumpAssistantWizardToField = (fieldKey) => {
    const stepByField = {
      title: 'title',
      startAt: 'startAt',
      endAt: 'endAt',
      responsibles: 'responsibleUser',
      description: 'optionalDescription',
      objectives: 'optionalObjective',
    };
    const nextStep = stepByField[fieldKey];
    if (!nextStep) {
      pushAssistantWizardMessage('Campo no reconocido. Usa: título, fecha inicio, fecha fin, responsables, descripción u objetivos.');
      return;
    }

    setAssistantWizard((prev) => {
      if (!prev.active) return prev;
      const next = {
        ...prev,
        step: nextStep,
        awaitingPostCreateAction: false,
        history: prev.step ? [...prev.history, prev.step] : prev.history,
      };
      promptWizardStep(next);
      return next;
    });
  };

  const handleAssistantOpenDraft = () => {
    const templateId = assistantWizard.draft.templateId;
    if (!templateId) {
      pushAssistantWizardMessage('Aún no hay un borrador para abrir.');
      return;
    }
    localStorage.setItem('monitoreoTemplateSelected', templateId);
    setAssistantOptionContext(buildQuickActionOptionContext());
    setIsAssistantOpen(false);
    if (isAdmin) {
      navigate(`/monitoreo/plantillas/${templateId}`);
      return;
    }
    navigate('/monitoreo');
  };

  const handleAssistantAddDetails = () => {
    setAssistantWizard((prev) => {
      if (!prev.active) return prev;
      const next = {
        ...prev,
        awaitingPostCreateAction: false,
        step: 'optionalDescription',
        history: prev.step ? [...prev.history, prev.step] : prev.history,
      };
      promptWizardStep(next);
      return next;
    });
  };

  const handleAssistantWizardInput = async (rawInput) => {
    const input = String(rawInput || '').trim();
    if (!input) return;

    const normalized = normalizeWizardCommandText(input);
    if (normalized === 'cancelar') {
      cancelAssistantWizard();
      return;
    }
    if (normalized === 'atras') {
      goBackAssistantWizardStep();
      return;
    }
    if (normalized === 'abrir borrador') {
      handleAssistantOpenDraft();
      return;
    }
    if (normalized === 'Añadir detalles') {
      handleAssistantAddDetails();
      return;
    }

    const editMatch = normalized.match(/^(cambiar|editar)\s+(.+)$/);
    if (editMatch) {
      const target = Object.entries(WIZARD_FIELD_ALIASES).find(([alias]) =>
        editMatch[2].includes(alias),
      );
      jumpAssistantWizardToField(target?.[1] || '');
      return;
    }

    const wizard = {
      ...assistantWizard,
      draft: {
        ...assistantWizard.draft,
        responsibles: [...assistantWizard.draft.responsibles],
        objectives: [...assistantWizard.draft.objectives],
      },
      currentResponsible: { ...assistantWizard.currentResponsible },
      pendingResponsibleQueue: [...(assistantWizard.pendingResponsibleQueue || [])],
      history: [...assistantWizard.history],
      specialistOptions: [...assistantWizard.specialistOptions],
    };

    const setStep = (nextStep, push = true) => {
      if (push && wizard.step) wizard.history.push(wizard.step);
      wizard.step = nextStep;
    };

    const pushChoiceFeedback = (parsedChoice) => {
      const feedback = buildChoiceParseFeedback(parsedChoice);
      if (feedback) pushAssistantWizardMessage(feedback);
    };

    const moveToNextResponsibleIfAny = () => {
      const assignedIds = new Set(
        wizard.draft.responsibles
          .map((item) => String(item.userId || '').trim())
          .filter(Boolean),
      );
      const seenQueuedIds = new Set();
      wizard.pendingResponsibleQueue = wizard.pendingResponsibleQueue.filter((item) => {
        const userId = String(item?.userId || '').trim();
        if (!userId) return false;
        if (assignedIds.has(userId)) return false;
        if (seenQueuedIds.has(userId)) return false;
        seenQueuedIds.add(userId);
        return true;
      });

      if (!wizard.pendingResponsibleQueue.length) {
        setStep('responsibleMore');
        return;
      }
      const [nextResponsible, ...rest] = wizard.pendingResponsibleQueue;
      wizard.pendingResponsibleQueue = rest;
      wizard.currentResponsible = {
        ...WIZARD_EMPTY_RESPONSIBLE,
        ...nextResponsible,
      };
      const nextResponsibleName = nextResponsible?.name || nextResponsible?.email || '';
      if (nextResponsibleName) {
        pushAssistantWizardMessage(`Continuemos con el siguiente responsable: ${nextResponsibleName}.`);
      }
      setStep('responsibleLevel');
    };

    const attachResponsible = () => {
      const responsible = {
        ...wizard.currentResponsible,
        level: normalizeWizardLevel(wizard.currentResponsible.level),
        modality: normalizeWizardModality(wizard.currentResponsible.modality) || 'ebr',
        course: normalizeWizardLevel(wizard.currentResponsible.level) === 'initial'
          ? ''
          : String(wizard.currentResponsible.course || '').trim(),
      };
      if (!responsible.userId || !responsible.level || !responsible.modality) {
        return { ok: false, message: 'Responsable incompleto. Continua con los datos faltantes.' };
      }
      if (
        responsible.level !== 'initial' &&
        !responsible.course
      ) {
        return { ok: false, message: 'Para Primaria o Secundaria debes indicar curso.' };
      }
      if (wizard.draft.responsibles.some((item) => item.userId === responsible.userId)) {
        return { ok: false, message: 'No puedes repetir el mismo responsable en este monitoreo.' };
      }
      wizard.draft.responsibles.push(responsible);
      wizard.currentResponsible = { ...WIZARD_EMPTY_RESPONSIBLE };
      return { ok: true };
    };

    if (wizard.awaitingPostCreateAction) {
      const parsedChoice = resolveChoiceFromContext(input, buildWizardOptionContext(wizard));
      const selectedAction = parsedChoice?.selectedOptions?.[0]?.value || '';
      if (parsedChoice?.isNumericAnswer) {
        pushChoiceFeedback(parsedChoice);
        if (!selectedAction) {
          pushAssistantWizardMessage('Selecciona 1 o 2 para continuar.');
          return;
        }
      }

      const wantsAddDetails =
        selectedAction === 'addDetails' || (!selectedAction && (isWizardYes(input) || normalized.includes('anadir')));
      if (wantsAddDetails) {
        wizard.awaitingPostCreateAction = false;
        setStep('optionalDescription');
        setAssistantWizard(wizard);
        promptWizardStep(wizard);
        return;
      }

      const wantsOpenDraft =
        selectedAction === 'openDraft' || (!selectedAction && (isWizardNo(input) || normalized.includes('abrir')));
      if (wantsOpenDraft) {
        handleAssistantOpenDraft();
        return;
      }
      pushAssistantWizardMessage('Responde "1" (Abrir borrador) o "2" (Añadir detalles).');
      return;
    }

    if (wizard.step === 'title') {
      if (!input) {
        pushAssistantWizardMessage('El título es obligatorio.');
        promptWizardStep(wizard);
        return;
      }
      wizard.draft.title = input;
      setStep('startAt');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'startAt') {
      const isoDate = parseWizardDateToIso(input);
      if (!isoDate) {
        pushAssistantWizardMessage('Fecha inválida. Usa formato dd/mm/yyyy o yyyy-mm-dd.');
        promptWizardStep(wizard);
        return;
      }
      wizard.draft.startAt = isoDate;
      if (wizard.draft.endAt && new Date(wizard.draft.endAt) < new Date(wizard.draft.startAt)) {
        wizard.draft.endAt = '';
      }
      setStep('endAt');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'endAt') {
      const isoDate = parseWizardDateToIso(input);
      if (!isoDate) {
        pushAssistantWizardMessage('Fecha inválida. Usa formato dd/mm/yyyy o yyyy-mm-dd.');
        promptWizardStep(wizard);
        return;
      }
      if (wizard.draft.startAt && new Date(isoDate) < new Date(wizard.draft.startAt)) {
        pushAssistantWizardMessage('La fecha fin debe ser mayor o igual a la fecha inicio.');
        promptWizardStep(wizard);
        return;
      }
      wizard.draft.endAt = isoDate;
      setStep('responsibleUser');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'responsibleUser') {
      const parsedChoice = resolveChoiceFromContext(input, buildWizardOptionContext(wizard));
      let selectedSpecialists = [];

      if (parsedChoice?.isNumericAnswer) {
        pushChoiceFeedback(parsedChoice);
        selectedSpecialists = (parsedChoice.selectedOptions || [])
          .map((option) => option?.value)
          .filter(Boolean);
        if (!selectedSpecialists.length) {
          pushAssistantWizardMessage('No identifiqué especialistas válidos. Elige índices dentro de la lista.');
          promptWizardStep(wizard);
          return;
        }
      } else {
        const selected = resolveWizardSpecialistSelection(input, wizard.specialistOptions);
        if (!selected) {
          pushAssistantWizardMessage('No identifiqué al especialista. Elige un número o escribe correo/nombre.');
          promptWizardStep(wizard);
          return;
        }
        selectedSpecialists = [selected];
      }

      const alreadyAssigned = new Set([
        ...wizard.draft.responsibles.map((item) => String(item.userId || '')),
        ...wizard.pendingResponsibleQueue.map((item) => String(item.userId || '')),
      ]);
      if (wizard.currentResponsible?.userId) {
        alreadyAssigned.add(String(wizard.currentResponsible.userId));
      }

      const queueCandidates = [];
      const ignoredAlreadyAssigned = [];

      selectedSpecialists.forEach((selected) => {
        const userId = String(selected.id || '').trim();
        if (!userId) return;
        if (alreadyAssigned.has(userId)) {
          ignoredAlreadyAssigned.push(selected.label || selected.email || userId);
          return;
        }
        alreadyAssigned.add(userId);
        queueCandidates.push({
          ...WIZARD_EMPTY_RESPONSIBLE,
          userId,
          name: selected.label || selected.email || 'Especialista',
          email: selected.email || '',
        });
      });

      if (ignoredAlreadyAssigned.length) {
        pushAssistantWizardMessage(
          `Ignorados por duplicado: ${ignoredAlreadyAssigned.join(', ')}.`,
        );
      }

      if (!queueCandidates.length) {
        pushAssistantWizardMessage('Debes seleccionar al menos un especialista no repetido.');
        promptWizardStep(wizard);
        return;
      }

      const [firstResponsible, ...restQueue] = queueCandidates;
      wizard.currentResponsible = firstResponsible;
      wizard.pendingResponsibleQueue = [...wizard.pendingResponsibleQueue, ...restQueue];
      setStep('responsibleLevel');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'responsibleLevel') {
      const parsedChoice = resolveChoiceFromContext(input, buildWizardOptionContext(wizard));
      if (parsedChoice?.isNumericAnswer) {
        pushChoiceFeedback(parsedChoice);
      }
      const level =
        parsedChoice?.selectedOptions?.[0]?.value || normalizeWizardLevel(input);
      if (!level) {
        pushAssistantWizardMessage('Nivel inválido. Usa Inicial, Primaria o Secundaria.');
        promptWizardStep(wizard);
        return;
      }
      wizard.currentResponsible.level = level;
      setStep('responsibleModality');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'responsibleModality') {
      const parsedChoice = resolveChoiceFromContext(input, buildWizardOptionContext(wizard));
      if (parsedChoice?.isNumericAnswer) {
        pushChoiceFeedback(parsedChoice);
      }
      const modality =
        parsedChoice?.selectedOptions?.[0]?.value || normalizeWizardModality(input);
      if (!modality) {
        pushAssistantWizardMessage('Modalidad inválida. Usa EBR o EBE.');
        promptWizardStep(wizard);
        return;
      }
      wizard.currentResponsible.modality = modality;
      if (normalizeWizardLevel(wizard.currentResponsible.level) === 'initial') {
        wizard.currentResponsible.course = '';
        const attached = attachResponsible();
        if (!attached.ok) {
          pushAssistantWizardMessage(attached.message);
          setAssistantWizard(wizard);
          promptWizardStep(wizard);
          return;
        }
        moveToNextResponsibleIfAny();
        setAssistantWizard(wizard);
        promptWizardStep(wizard);
        return;
      }
      setStep('responsibleCourse');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'responsibleCourse') {
      const course = String(input || '').trim();
      if (!course) {
        pushAssistantWizardMessage('El curso es obligatorio para Primaria o Secundaria.');
        promptWizardStep(wizard);
        return;
      }
      wizard.currentResponsible.course = course;
      const attached = attachResponsible();
      if (!attached.ok) {
        pushAssistantWizardMessage(attached.message);
        setAssistantWizard(wizard);
        promptWizardStep(wizard);
        return;
      }
      moveToNextResponsibleIfAny();
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'responsibleMore') {
      const parsedChoice = resolveChoiceFromContext(input, buildWizardOptionContext(wizard));
      if (parsedChoice?.isNumericAnswer) {
        pushChoiceFeedback(parsedChoice);
      }

      const wantsMore =
        parsedChoice?.selectedOptions?.[0]?.value === 'yes' ||
        (!parsedChoice?.selectedOptions?.length && isWizardYes(input));
      if (wantsMore) {
        wizard.currentResponsible = { ...WIZARD_EMPTY_RESPONSIBLE };
        setStep('responsibleUser');
        setAssistantWizard(wizard);
        promptWizardStep(wizard);
        return;
      }

      const wantsContinue =
        parsedChoice?.selectedOptions?.[0]?.value === 'no' ||
        (!parsedChoice?.selectedOptions?.length && isWizardNo(input));
      if (!wantsContinue) {
        pushAssistantWizardMessage('Responde "si" para agregar otro responsable o "no" para continuar.');
        promptWizardStep(wizard);
        return;
      }

      if (!wizard.draft.responsibles.length) {
        pushAssistantWizardMessage('Debes registrar al menos un responsable.');
        setStep('responsibleUser');
        setAssistantWizard(wizard);
        promptWizardStep(wizard);
        return;
      }

      if (!wizard.minimumSaved) {
        setAssistantWizard((prev) => ({ ...prev, saving: true }));
        try {
          const saved = await persistWizardDraft(wizard);
          wizard.minimumSaved = true;
          wizard.awaitingPostCreateAction = true;
          wizard.step = 'postCreateChoice';
          wizard.draft.eventId = saved.eventId;
          wizard.draft.templateId = saved.templateId;
          wizard.objectiveTextColumn = saved.objectiveTextColumn || wizard.objectiveTextColumn;
          setAssistantWizard({ ...wizard, saving: false });
          pushAssistantWizardMessage(
            `Listo, creé el monitoreo en BORRADOR: ${wizard.draft.title}\n- Usa "Abrir borrador" o "Añadir detalles".`,
          );
          promptWizardStep(wizard);
        } catch (error) {
          setAssistantWizard({ ...wizard, saving: false });
          pushAssistantWizardMessage(`No pude crear el borrador.\n- ${error.message}`);
          promptWizardStep(wizard);
        }
        return;
      }

      setStep('optionalDescription');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'optionalDescription') {
      if (!isWizardNo(input)) {
        wizard.draft.description = input;
      }
      setStep('optionalObjective');
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'optionalObjective') {
      if (!isWizardNo(input)) {
        wizard.draft.objectives.push(input);
        setStep('optionalObjectiveMore');
      } else {
        wizard.step = 'completed';
      }

      if (wizard.step === 'completed') {
        try {
          const saved = await persistWizardDraft(wizard);
          wizard.draft.eventId = saved.eventId;
          wizard.draft.templateId = saved.templateId;
          wizard.objectiveTextColumn = saved.objectiveTextColumn || wizard.objectiveTextColumn;
        } catch (error) {
          pushAssistantWizardMessage(`No se pudieron guardar detalles opcionales.\n- ${error.message}`);
        }
      }

      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'optionalObjectiveMore') {
      const parsedChoice = resolveChoiceFromContext(input, buildWizardOptionContext(wizard));
      if (parsedChoice?.isNumericAnswer) {
        pushChoiceFeedback(parsedChoice);
      }

      const wantsMore =
        parsedChoice?.selectedOptions?.[0]?.value === 'yes' ||
        (!parsedChoice?.selectedOptions?.length && isWizardYes(input));
      if (wantsMore) {
        setStep('optionalObjective');
        setAssistantWizard(wizard);
        promptWizardStep(wizard);
        return;
      }

      const wantsFinish =
        parsedChoice?.selectedOptions?.[0]?.value === 'no' ||
        (!parsedChoice?.selectedOptions?.length && isWizardNo(input));
      if (!wantsFinish) {
        pushAssistantWizardMessage('Responde "si" para agregar otro objetivo o "no" para finalizar.');
        promptWizardStep(wizard);
        return;
      }

      wizard.step = 'completed';
      try {
        const saved = await persistWizardDraft(wizard);
        wizard.draft.eventId = saved.eventId;
        wizard.draft.templateId = saved.templateId;
        wizard.objectiveTextColumn = saved.objectiveTextColumn || wizard.objectiveTextColumn;
      } catch (error) {
        pushAssistantWizardMessage(`No se pudieron guardar detalles opcionales.\n- ${error.message}`);
      }
      setAssistantWizard(wizard);
      promptWizardStep(wizard);
      return;
    }

    if (wizard.step === 'completed') {
      pushAssistantWizardMessage('El borrador ya fue creado. Usa "Abrir borrador" o inicia uno nuevo.');
      return;
    }

    pushAssistantWizardMessage('No entendí la respuesta. Vamos con el siguiente paso.');
    promptWizardStep(wizard);
  };

  const scrollAssistantToBottom = useCallback(() => {
    const container = assistantMessagesRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
    assistantMessagesEndRef.current?.scrollIntoView({
      block: 'end',
      behavior: 'auto',
    });
  }, []);

  useEffect(() => {
    applyPreferences(theme, fontSize, density, highContrast, reduceMotion);
  }, [theme, fontSize, density, highContrast, reduceMotion]);

  useEffect(() => {
    if (theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const applyTheme = () => {
      applyPreferences(theme, fontSize, density, highContrast, reduceMotion);
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }
    media.addListener(applyTheme);
    return () => media.removeListener(applyTheme);
  }, [theme, fontSize, density, highContrast, reduceMotion]);

  useEffect(() => {
    localStorage.setItem(ASSISTANT_QUICK_ACTIONS_KEY, String(assistantQuickSuggestions));
  }, [assistantQuickSuggestions]);

  useEffect(() => {
    localStorage.setItem(ASSISTANT_AUTO_CLOSE_KEY, String(assistantCloseOnOutside));
  }, [assistantCloseOnOutside]);

  useEffect(() => {
    localStorage.setItem(ASSISTANT_CLEAR_ON_LOGOUT_KEY, String(assistantClearOnLogout));
  }, [assistantClearOnLogout]);

  useEffect(() => {
    window.addEventListener(SETTINGS_EVENT_NAME, syncSettingsFromStorage);
    window.addEventListener('storage', syncSettingsFromStorage);
    return () => {
      window.removeEventListener(SETTINGS_EVENT_NAME, syncSettingsFromStorage);
      window.removeEventListener('storage', syncSettingsFromStorage);
    };
  }, [syncSettingsFromStorage]);

  useEffect(() => {
    localStorage.setItem('monitoreoSidebarCollapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('monitoreoAssistantOpen', String(isAssistantOpen));
  }, [isAssistantOpen]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
        mobileSidebarButtonRef.current?.focus?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    if (!isAssistantOpen) return;

    const focusInput = () => {
      assistantInputRef.current?.focus();
    };
    const frameId = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(frameId);
  }, [isAssistantOpen]);

  useEffect(() => {
    if (!isAssistantOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      scrollAssistantToBottom();
      window.requestAnimationFrame(scrollAssistantToBottom);
    });
    const timeoutId = window.setTimeout(scrollAssistantToBottom, 120);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isAssistantOpen, assistantMessages, isAssistantLoading, assistantWizard, expandedAssistantCards, scrollAssistantToBottom]);

  useEffect(() => {
    if (!isAssistantOpen || !assistantMessagesRef.current) return undefined;

    const container = assistantMessagesRef.current;
    const observer = new MutationObserver(() => {
      scrollAssistantToBottom();
    });

    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [isAssistantOpen, scrollAssistantToBottom]);

  useEffect(() => {
    if (wasAssistantOpenRef.current && !isAssistantOpen) {
      assistantToggleButtonRef.current?.focus();
    }
    wasAssistantOpenRef.current = isAssistantOpen;
  }, [isAssistantOpen]);

  useEffect(() => {
    if (!isAssistantOpen) return;

    const handlePointerDown = (event) => {
      if (!assistantCloseOnOutside) return;
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (assistantPanelRef.current?.contains(target)) return;
      if (assistantToggleButtonRef.current?.contains(target)) return;

      setIsAssistantOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsAssistantOpen(false);
      }
    };

    if (assistantCloseOnOutside) {
      window.addEventListener('pointerdown', handlePointerDown);
    }
    window.addEventListener('keydown', handleEscape);

    return () => {
      if (assistantCloseOnOutside) {
        window.removeEventListener('pointerdown', handlePointerDown);
      }
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isAssistantOpen, assistantCloseOnOutside]);

  useEffect(() => {
    let resolvedMode = ASSISTANT_MODE_PERSISTENT;
    try {
      const storedMode = localStorage.getItem(assistantModeKey);
      if (storedMode === ASSISTANT_MODE_TEMPORARY) resolvedMode = ASSISTANT_MODE_TEMPORARY;
    } catch {
      resolvedMode = ASSISTANT_MODE_TEMPORARY;
    }

    setAssistantMode(resolvedMode);
    const restored = readStoredConversation(resolvedMode);
    if (restored.length) {
      setAssistantMessages(restored);
    } else {
      setAssistantMessages([buildGreetingMessage(greetingName)]);
    }
    setExpandedAssistantCards({});
    setAssistantStorageReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantModeKey, assistantPersistentKey, assistantSessionKey]);

  useEffect(() => {
    if (!assistantStorageReady) return;
    try {
      localStorage.setItem(assistantModeKey, assistantMode);
    } catch {
      // noop
    }
  }, [assistantMode, assistantModeKey, assistantStorageReady]);

  useEffect(() => {
    if (!assistantStorageReady) return;
    const normalized = normalizeMessages(assistantMessages);
    const persisted = persistConversation(normalized, assistantMode);
    if (!persisted && assistantMode === ASSISTANT_MODE_PERSISTENT) {
      setAssistantMode(ASSISTANT_MODE_TEMPORARY);
      try {
        localStorage.setItem(assistantModeKey, ASSISTANT_MODE_TEMPORARY);
      } catch {
        // noop
      }
      persistConversation(normalized, ASSISTANT_MODE_TEMPORARY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantMessages, assistantMode, assistantStorageReady, assistantModeKey]);

  useEffect(() => {
    if (!assistantStorageReady) return;
    const nextGreetingText = getAssistantGreetingText(greetingName);
    setAssistantMessagesSafely((prev) => {
      if (!prev.length) return [buildGreetingMessage(greetingName)];
      const first = prev[0];
      if (first.kind !== 'greeting') {
        return [buildGreetingMessage(greetingName), ...prev];
      }
      if (isSameDayText(first.text, nextGreetingText)) return prev;
      return [{ ...first, text: nextGreetingText }, ...prev.slice(1)];
    });
  }, [assistantStorageReady, greetingName]);

  const clearStoredSessionActivity = useCallback(() => {
    try {
      const prefix = `${SESSION_ACTIVITY_PREFIX}:`;
      const keys = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // noop
    }
  }, []);

  const executeSessionLogout = useCallback(
    async (reason = 'manual') => {
      if (sessionLogoutInProgressRef.current) return;
      sessionLogoutInProgressRef.current = true;

      try {
        if (sessionTimeoutRef.current) {
          window.clearTimeout(sessionTimeoutRef.current);
          sessionTimeoutRef.current = null;
        }

        if (reason === SESSION_LOGOUT_REASON_INACTIVITY) {
          localStorage.setItem(SESSION_LOGOUT_REASON_KEY, SESSION_LOGOUT_REASON_INACTIVITY);
        } else {
          localStorage.removeItem(SESSION_LOGOUT_REASON_KEY);
        }

        if (assistantClearOnLogout) {
          removeStoredConversation(ASSISTANT_MODE_PERSISTENT);
          removeStoredConversation(ASSISTANT_MODE_TEMPORARY);
        }
        clearAllTemporaryAssistantConversations();
        clearStoredSessionActivity();
        localStorage.removeItem('monitoreoAuth');
        localStorage.removeItem('monitoreoProfile');
        setAuth(null);
        setProfile({});

        await supabase.auth.signOut();
      } catch {
        // noop
      } finally {
        navigate('/login', { replace: true });
        sessionLogoutInProgressRef.current = false;
      }
    },
    [
      assistantClearOnLogout,
      clearAllTemporaryAssistantConversations,
      clearStoredSessionActivity,
      navigate,
      removeStoredConversation,
    ],
  );

  useEffect(() => {
    if (!auth?.role) return undefined;

    const readLastActivity = () => {
      const raw = localStorage.getItem(sessionActivityKey);
      const parsed = Number(raw || 0);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };

    const scheduleTimeoutFrom = (lastActivityAt) => {
      if (sessionTimeoutRef.current) {
        window.clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }

      const elapsed = Date.now() - lastActivityAt;
      const remaining = SESSION_IDLE_TIMEOUT_MS - elapsed;
      if (remaining <= 0) {
        executeSessionLogout(SESSION_LOGOUT_REASON_INACTIVITY);
        return;
      }

      sessionTimeoutRef.current = window.setTimeout(() => {
        executeSessionLogout(SESSION_LOGOUT_REASON_INACTIVITY);
      }, remaining);
    };

    const persistActivity = (force = false) => {
      const now = Date.now();
      if (!force && now - sessionLastWriteRef.current < SESSION_ACTIVITY_WRITE_THROTTLE_MS) {
        const knownActivity = readLastActivity();
        scheduleTimeoutFrom(knownActivity || now);
        return;
      }

      sessionLastWriteRef.current = now;
      localStorage.setItem(sessionActivityKey, String(now));
      scheduleTimeoutFrom(now);
    };

    const initialActivity = readLastActivity();
    if (initialActivity && Date.now() - initialActivity >= SESSION_IDLE_TIMEOUT_MS) {
      executeSessionLogout(SESSION_LOGOUT_REASON_INACTIVITY);
      return undefined;
    }

    if (initialActivity) {
      scheduleTimeoutFrom(initialActivity);
    } else {
      persistActivity(true);
    }

    const handleActivity = () => persistActivity(false);
    const handlePageHide = () => persistActivity(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        persistActivity(true);
        return;
      }

      const latest = readLastActivity();
      if (latest && Date.now() - latest >= SESSION_IDLE_TIMEOUT_MS) {
        executeSessionLogout(SESSION_LOGOUT_REASON_INACTIVITY);
        return;
      }
      persistActivity(true);
    };

    const handleStorage = (event) => {
      if (event.key !== sessionActivityKey) return;
      const nextValue = Number(event.newValue || 0);
      if (!nextValue) return;
      if (Date.now() - nextValue >= SESSION_IDLE_TIMEOUT_MS) {
        executeSessionLogout(SESSION_LOGOUT_REASON_INACTIVITY);
        return;
      }
      scheduleTimeoutFrom(nextValue);
    };

    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (sessionTimeoutRef.current) {
        window.clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [auth?.role, executeSessionLogout, sessionActivityKey]);

  useEffect(() => {
    let active = true;
    const ensureSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data?.session) {
        await executeSessionLogout('session');
      }
    };
    ensureSession();
    return () => {
      active = false;
    };
  }, [executeSessionLogout]);

  useEffect(() => {
    const handleProfileUpdate = () => {
      try {
        setProfile(JSON.parse(localStorage.getItem('monitoreoProfile')) || {});
        setAuth(JSON.parse(localStorage.getItem('monitoreoAuth')));
      } catch {
        setProfile({});
        setAuth(null);
      }
    };
    window.addEventListener('monitoreo-profile-updated', handleProfileUpdate);
    window.addEventListener('storage', handleProfileUpdate);
    return () => {
      window.removeEventListener('monitoreo-profile-updated', handleProfileUpdate);
      window.removeEventListener('storage', handleProfileUpdate);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      window.addEventListener('keydown', handleKey);
    }
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!assistantWizard.active) {
      setAssistantWizardEditMenuOpen(false);
    }
  }, [assistantWizard.active]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await executeSessionLogout('manual');
    } finally {
      setIsLoggingOut(false);
      setIsLogoutOpen(false);
    }
  };

  const handleResetSettings = () => {
    setTheme('dark');
    setFontSize('normal');
    setDensity(getDesktopDensityDefault());
    setHighContrast(false);
    setReduceMotion(false);
  };

  const sendAssistantMessage = async (rawMessage) => {
    const trimmed = String(rawMessage || '').trim();
    if (!trimmed || isAssistantLoading || assistantWizard.saving) return;

    const userMessage = buildChatMessage('user', trimmed);
    const preflightAssistantMessages = [];
    let effectiveMessage = trimmed;
    let shortCircuitMessage = '';
    let triggerQuickWizard = false;

    if (!assistantWizard.active && assistantOptionContext?.options?.length) {
      const parsedChoice = resolveChoiceFromContext(trimmed, assistantOptionContext);
      if (parsedChoice?.isNumericAnswer) {
        if (assistantOptionContext.source === 'quick-actions') {
          const isExactSingleIndex = /^\d+$/.test(trimmed);
          if (!isExactSingleIndex) {
            shortCircuitMessage =
              'Para atajos rápidos escribe un solo número: 1) Activos 2) Vencen pronto 3) Hoy 4) + Crear monitoreo.';
          } else {
            const feedback = buildChoiceParseFeedback(parsedChoice);
            if (feedback) {
              preflightAssistantMessages.push(buildChatMessage('assistant', feedback));
            }
            if (!parsedChoice.validIndices.length) {
              shortCircuitMessage =
                'Índice fuera de rango. Usa: 1) Activos 2) Vencen pronto 3) Hoy 4) + Crear monitoreo.';
            } else {
              const actionId = parsedChoice.selectedOptions?.[0]?.value;
              const quickAction = ASSISTANT_QUICK_ACTIONS.find((item) => item.id === actionId);
              if (!quickAction) {
                shortCircuitMessage = 'No pude resolver ese atajo. Intenta con un número del 1 al 4.';
              } else if (quickAction.type === 'wizard') {
                triggerQuickWizard = true;
              } else {
                effectiveMessage = quickAction.prompt || quickAction.label || trimmed;
              }
            }
          }
        } else {
          const feedback = buildChoiceParseFeedback(parsedChoice);
          if (feedback) {
            preflightAssistantMessages.push(buildChatMessage('assistant', feedback));
          }
          if (!parsedChoice.validIndices.length) {
            shortCircuitMessage = 'No se encontraron opciones válidas. Responde con un número de la lista.';
          } else {
            effectiveMessage = String(parsedChoice.selectedOptions?.[0]?.value || trimmed).trim() || trimmed;
          }
        }
      }
    }

    setAssistantMessagesSafely((prev) => [...prev, userMessage, ...preflightAssistantMessages]);
    setAssistantInput('');

    if (shortCircuitMessage) {
      setAssistantMessagesSafely((prev) => [
        ...prev,
        buildChatMessage('assistant', shortCircuitMessage),
      ]);
      return;
    }

    if (!assistantWizard.active && !triggerQuickWizard && isAssistantGreetingOnly(trimmed)) {
      setAssistantOptionContext(buildQuickActionOptionContext());
      setAssistantMessagesSafely((prev) => [
        ...prev,
        buildChatMessage(
          'assistant',
          'Asistente AGEBRE\nHola, estoy listo para ayudarte.\nPuedes pedirme: 1) Activos 2) Vencen pronto 3) Hoy 4) + Crear monitoreo.',
        ),
      ]);
      return;
    }

    if (assistantWizard.active || triggerQuickWizard) {
      setIsAssistantLoading(true);
      try {
        if (assistantWizard.active) {
          await handleAssistantWizardInput(trimmed);
        } else {
          await startAssistantWizard();
        }
      } finally {
        setIsAssistantLoading(false);
      }
      return;
    }

    const requestHistoryMessage =
      effectiveMessage === trimmed
        ? userMessage
        : { ...userMessage, text: effectiveMessage };
    const conversationSnapshot = normalizeMessages([...assistantMessages, requestHistoryMessage]);
    setIsAssistantLoading(true);

    try {
      const history = conversationSnapshot.map((message) => ({
        role: message.role,
        text: message.text,
      }));
      const body = { message: effectiveMessage, history };

      let accessToken = '';
      const { data: currentSessionData } = await supabase.auth.getSession();
      accessToken = currentSessionData?.session?.access_token || '';
      if (!accessToken) {
        const { data: refreshedSessionData } = await supabase.auth.refreshSession();
        accessToken = refreshedSessionData?.session?.access_token || '';
      }

      const invokeAssistant = async (authorizationHeader) =>
        supabase.functions.invoke('assistant', {
          body,
          headers: authorizationHeader ? { Authorization: authorizationHeader } : undefined,
        });

      const primaryAuthorization = accessToken
        ? `Bearer ${accessToken}`
        : SUPABASE_ANON_KEY
          ? `Bearer ${SUPABASE_ANON_KEY}`
          : '';

      let { data, error } = await invokeAssistant(primaryAuthorization || undefined);

      const unauthorized =
        !!error &&
        (error?.context?.status === 401 ||
          /401|unauthorized|authorization/i.test(String(error?.message || '')));

      // Session may expire in browser while local app state is still active.
      if (unauthorized && SUPABASE_ANON_KEY && primaryAuthorization !== `Bearer ${SUPABASE_ANON_KEY}`) {
        ({ data, error } = await invokeAssistant(`Bearer ${SUPABASE_ANON_KEY}`));
      }

      if (error) throw error;
      const replyText = data?.reply || 'No pude generar una respuesta.';
      const extractedOptions = extractNumberedOptionsFromText(replyText);
      setAssistantOptionContext(
        extractedOptions.length
          ? {
              source: 'assistant-reply',
              mode: 'single',
              options: extractedOptions,
            }
          : buildQuickActionOptionContext(),
      );
      setAssistantMessagesSafely((prev) => [
        ...prev,
        buildChatMessage('assistant', replyText),
      ]);
    } catch (error) {
      const unauthorized =
        error?.context?.status === 401 ||
        /401|unauthorized|authorization/i.test(String(error?.message || ''));
      setAssistantOptionContext(buildQuickActionOptionContext());
      setAssistantMessagesSafely((prev) => [
        ...prev,
        buildChatMessage(
          'assistant',
          unauthorized
            ? 'Tu sesión venció. Cierra sesión e ingresa nuevamente.'
            : 'No se pudo contactar al asistente. Intenta de nuevo.',
        ),
      ]);
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const handleAssistantSend = async () => {
    await sendAssistantMessage(assistantInput);
  };

  const handleAssistantQuickAction = async (action) => {
    if (!action) return;

    if (action.type === 'wizard') {
      await startAssistantWizard();
      return;
    }

    if (assistantWizard.active) {
      pushAssistantWizardMessage('Estás en modo asistido. Usa "Cancelar" o termina el flujo actual.');
      return;
    }

    await sendAssistantMessage(action.prompt || action.label || '');
  };

  const handleAssistantWizardControl = async (command) => {
    await sendAssistantMessage(command);
  };

  const handleAssistantWizardEditField = async (command) => {
    setAssistantWizardEditMenuOpen(false);
    await sendAssistantMessage(command);
  };

  const handleAssistantClearConversation = () => {
    setExpandedAssistantCards({});
    removeStoredConversation(ASSISTANT_MODE_PERSISTENT);
    removeStoredConversation(ASSISTANT_MODE_TEMPORARY);
    setAssistantOptionContext(buildQuickActionOptionContext());
    setAssistantMessagesSafely([buildGreetingMessage(greetingName)]);
  };

  const handleAssistantModeToggle = () => {
    const nextMode =
      assistantMode === ASSISTANT_MODE_PERSISTENT
        ? ASSISTANT_MODE_TEMPORARY
        : ASSISTANT_MODE_PERSISTENT;
    setAssistantMode(nextMode);

    if (nextMode === ASSISTANT_MODE_PERSISTENT) {
      const restored = readStoredConversation(ASSISTANT_MODE_PERSISTENT);
      if (restored.length) {
        setAssistantMessagesSafely(restored);
      } else {
        persistConversation(assistantMessages, ASSISTANT_MODE_PERSISTENT);
      }
    }

    if (nextMode === ASSISTANT_MODE_TEMPORARY) {
      persistConversation(assistantMessages, ASSISTANT_MODE_TEMPORARY);
    }
  };

  const handleAssistantCardToggle = (messageId) => {
    setExpandedAssistantCards((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const handleAssistantViewDetail = (item) => {
    if (item?.title) {
      localStorage.setItem('monitoreoAssistantFocusTitle', item.title);
    }
    setIsAssistantOpen(false);
    navigate('/monitoreo/reportes');
  };

  const handleAssistantGoCalendar = (item) => {
    if (item?.title) {
      localStorage.setItem('monitoreoAssistantFocusTitle', item.title);
    }
    setIsAssistantOpen(false);
    navigate('/monitoreo/seguimiento');
  };

  useEffect(() => {
    let active = true;
    const fetchTemplateSections = async () => {
      if (!isFicha) {
        if (active) setSelectedTemplateSections(null);
        return;
      }
      const selectedId = localStorage.getItem('monitoreoTemplateSelected');
      if (!selectedId) {
        if (active) setSelectedTemplateSections(null);
        return;
      }
      const { data, error } = await supabase
        .from('monitoring_templates')
        .select('sections')
        .eq('id', selectedId)
        .single();
      if (error) {
        console.error(error);
        if (active) setSelectedTemplateSections(null);
        return;
      }
      if (active) setSelectedTemplateSections(data?.sections || null);
    };
    fetchTemplateSections();
    return () => {
      active = false;
    };
  }, [isFicha]);

  const sidebarItems = useMemo(() => {
    if (!isFicha) {
      return [
        {
          id: 'inicio',
          label: 'Inicio',
          icon: LayoutDashboard,
          path: '/monitoreo/inicio',
          action: () => {
            setIsMobileSidebarOpen(false);
            navigate('/monitoreo/inicio');
          },
        },
        {
          id: 'elegir',
          label: 'Monitoreos',
          icon: ClipboardList,
          path: '/monitoreo',
          action: () => {
            setIsMobileSidebarOpen(false);
            navigate('/monitoreo');
          },
        },
        {
          id: 'reportes',
          label: 'Reportes',
          icon: BarChart3,
          path: '/monitoreo/reportes',
          action: () => {
            setIsMobileSidebarOpen(false);
            navigate('/monitoreo/reportes');
          },
        },
        {
          id: 'seguimiento',
          label: 'Seguimiento',
          icon: CalendarRange,
          path: '/monitoreo/seguimiento',
          action: () => {
            setIsMobileSidebarOpen(false);
            navigate('/monitoreo/seguimiento');
          },
        },
        ...(isAdmin
          ? [
              {
                id: 'usuarios',
                label: 'Equipo',
                icon: ClipboardList,
                path: '/monitoreo/usuarios',
                action: () => {
                  setIsMobileSidebarOpen(false);
                  navigate('/monitoreo/usuarios');
                },
              },
              {
                id: 'instituciones',
                label: 'Instituciones Educativas',
                icon: Building2,
                path: '/monitoreo/instituciones',
                action: () => {
                  setIsMobileSidebarOpen(false);
                  navigate('/monitoreo/instituciones');
                },
              },
            ]
          : []),
      ];
    }
    let templateSections = SIDEBAR_SECTIONS;
    if (selectedTemplateSections?.length) {
      templateSections = [
        { id: 'datos', label: 'Datos generales' },
        ...selectedTemplateSections.map((section) => ({
          id: section.id,
          label: section.title,
        })),
        { id: 'cierre', label: 'Cierre & Firmas' },
      ];
    }

    return templateSections.map((section) => ({
      id: section.id,
      label: section.label,
      icon: ClipboardList,
      action: () => {
        const element = document.getElementById(section.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setIsMobileSidebarOpen(false);
      },
    }));
  }, [isFicha, isAdmin, navigate, selectedTemplateSections]);

  const isCompactDensity = density === DENSITY_COMPACT;
  const sidebarDesktopRailClass = isSidebarCollapsed
    ? isCompactDensity
      ? 'w-[84px] px-2 py-2.5'
      : 'w-[92px] px-2.5 py-3'
    : isCompactDensity
      ? 'w-[214px] p-2.5'
      : 'w-[228px] p-3';

  const sidebarProfileCardClass = isSidebarCollapsed
    ? isCompactDensity
      ? 'min-h-[104px] px-1.5 py-2.5'
      : 'min-h-[116px] px-2 py-3'
    : isCompactDensity
      ? 'min-h-[76px] px-2.5 py-2.5'
      : 'min-h-[82px] px-3 py-2.5';

  const sidebarDesktopButtonSizeClass = isSidebarCollapsed
    ? isCompactDensity
      ? 'mx-auto h-10 w-10 justify-center px-0'
      : 'mx-auto h-12 w-12 justify-center px-0'
    : isCompactDensity
      ? 'h-10 w-full justify-start px-3'
      : 'h-11 w-full justify-start px-3.5';

  const sidebarDesktopLabelClass = `truncate transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
    isSidebarCollapsed
      ? 'pointer-events-none ml-0 max-w-0 translate-x-2 opacity-0'
      : `${isCompactDensity ? 'ml-2 max-w-[122px]' : 'ml-2.5 max-w-[132px]'} translate-x-0 opacity-100`
  }`;

  const sidebarHeaderTextClass = `min-w-0 overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
    isSidebarCollapsed
      ? 'pointer-events-none max-w-0 translate-x-2 opacity-0'
      : `${isCompactDensity ? 'max-w-[110px]' : 'max-w-[118px]'} translate-x-0 opacity-100`
  }`;

  const sidebarRailToggleButtonClass =
    `inline-flex ${isCompactDensity ? 'h-9 w-9' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/55 text-slate-300 transition-all duration-200 ease-out hover:-translate-y-[1px] hover:border-cyan-400/40 hover:bg-slate-800/80 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`;

  const sidebarDesktopNavClass = `mt-2 flex min-h-0 flex-1 flex-col scrollbar-thin ${
    isSidebarCollapsed
      ? `${isCompactDensity ? 'items-center gap-2.5' : 'items-center gap-3'} overflow-y-auto overflow-x-hidden pr-0.5`
      : `${isCompactDensity ? 'gap-1.5' : 'gap-2'} overflow-y-auto pr-1`
  }`;

  const sidebarDesktopFooterClass = `mt-5 border-t border-slate-700/45 pt-4 ${
    isSidebarCollapsed
      ? isCompactDensity
        ? 'space-y-2.5'
        : 'space-y-3'
      : isCompactDensity
        ? 'space-y-1.5'
        : 'space-y-2'
  }`;

  const contentContainerClass = isCompactDensity
    ? 'mx-auto w-full max-w-[1320px] px-3 py-3 md:px-4 md:py-4'
    : 'mx-auto w-full max-w-[1400px] px-4 py-4 md:px-6 md:py-5';

  const assistantPanelClass = isCompactDensity
    ? 'flex w-[min(90vw,408px)] max-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/70 font-sans text-[13px] leading-5 text-slate-200 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.75)] backdrop-blur'
    : 'flex w-[min(92vw,440px)] max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/70 font-sans text-sm leading-5 text-slate-200 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.75)] backdrop-blur';

  const assistantMessageListClass = isCompactDensity
    ? 'min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3.5'
    : 'min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4';

  const assistantComposerClass = isCompactDensity
    ? 'shrink-0 border-t border-slate-800/70 px-3 py-2.5'
    : 'shrink-0 border-t border-slate-800/70 px-3 py-3';

  const assistantInputClass = isCompactDensity
    ? 'flex-1 rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-1.5 text-sm leading-5 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30'
    : 'flex-1 rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-sm leading-5 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30';

  const assistantQuickActionClass = isCompactDensity
    ? 'rounded-full border border-slate-600/70 bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/70 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-full border border-slate-600/70 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/70 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60';

  const assistantToggleButtonClass = isCompactDensity
    ? 'inline-flex h-11 w-11 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/20 text-cyan-100 shadow-lg transition hover:border-cyan-400/70'
    : 'inline-flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/20 text-cyan-100 shadow-lg transition hover:border-cyan-400/70';

  const getSidebarDesktopButtonClass = ({ active = false, tone = 'neutral' } = {}) => {
    const base =
      `group relative inline-flex items-center rounded-2xl border text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${sidebarDesktopButtonSizeClass}`;

    if (tone === 'warning') {
      return `${base} border-amber-500/30 bg-slate-900/50 text-amber-200 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.08)] hover:-translate-y-[1px] hover:border-amber-400/55 hover:bg-amber-500/14 hover:text-amber-100 hover:shadow-[0_10px_22px_rgba(245,158,11,0.18)]`;
    }

    if (active) {
      return `${base} border-cyan-400/45 bg-gradient-to-r from-cyan-500/20 to-sky-500/12 text-slate-50 shadow-[0_8px_24px_rgba(14,165,233,0.2),inset_0_0_0_1px_rgba(186,230,253,0.2)]`;
    }

    return `${base} border-slate-700/70 bg-slate-900/45 text-slate-300 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.5)] hover:-translate-y-[1px] hover:border-cyan-400/35 hover:bg-slate-800/78 hover:text-slate-100 hover:shadow-[0_10px_24px_rgba(14,116,144,0.16)]`;
  };

  const getSidebarDesktopIconClass = ({ active = false, tone = 'neutral' } = {}) => {
    if (tone === 'warning') return 'shrink-0 text-amber-200 group-hover:text-amber-100';
    if (active) return 'shrink-0 text-cyan-100';
    return 'shrink-0 text-slate-300 group-hover:text-slate-100';
  };

  return (
    <SidebarContext.Provider value={{ activeSection, setActiveSection }}>
      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => {
              setIsMobileSidebarOpen(false);
              mobileSidebarButtonRef.current?.focus?.();
            }}
          />
          <aside
            ref={mobileSidebarRef}
            className="absolute inset-y-0 left-0 flex w-[272px] flex-col border-r border-slate-700/50 bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-slate-900/80 p-4 shadow-[22px_0_55px_rgba(2,6,23,0.55)] backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 text-sm font-semibold text-slate-200">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials || 'U'}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{displayName || 'Cargando...'}</p>
                  <p className="text-xs text-slate-500">{roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                  mobileSidebarButtonRef.current?.focus?.();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/55 text-slate-200 transition-all duration-200 ease-out hover:border-cyan-400/45 hover:bg-slate-800/80 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                aria-label="Cerrar menú"
              >
                <X size={16} />
              </button>
            </div>

            <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 scrollbar-thin">
              {sidebarItems.map((item) => {
                const isActive = isFicha ? activeSection === item.id : location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={`mobile-${item.id}`}
                    type="button"
                    onClick={item.action}
                    className={`group flex h-11 items-center gap-3 rounded-2xl border px-3 text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                      isActive
                        ? 'border-cyan-400/45 bg-gradient-to-r from-cyan-500/20 to-sky-500/12 text-slate-100 shadow-[0_8px_22px_rgba(14,165,233,0.18),inset_0_0_0_1px_rgba(186,230,253,0.18)]'
                        : 'border-slate-700/70 bg-slate-900/45 text-slate-300 hover:-translate-y-[1px] hover:border-cyan-400/35 hover:bg-slate-800/78 hover:text-slate-100 hover:shadow-[0_10px_22px_rgba(14,116,144,0.14)]'
                    }`}
                  >
                    <Icon size={17} className={isActive ? 'text-cyan-100' : 'text-slate-300 group-hover:text-slate-100'} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-700/40 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                  setIsSettingsOpen(true);
                }}
                className="inline-flex h-11 items-center gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/45 px-3 text-sm font-medium text-slate-200 transition-all duration-200 ease-out hover:-translate-y-[1px] hover:border-cyan-400/35 hover:bg-slate-800/78 hover:text-slate-100 hover:shadow-[0_10px_22px_rgba(14,116,144,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <Settings size={14} />
                Ajustes
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                  setIsLogoutOpen(true);
                }}
                className="inline-flex h-11 items-center gap-3 rounded-2xl border border-amber-500/35 bg-slate-900/50 px-3 text-sm font-medium text-amber-200 transition-all duration-200 ease-out hover:-translate-y-[1px] hover:border-amber-400/60 hover:bg-amber-500/14 hover:text-amber-100 hover:shadow-[0_10px_22px_rgba(245,158,11,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      ) : null}
      <div className="flex h-screen overflow-hidden bg-transparent">
        <aside
          className={`hidden flex-col border-r border-slate-700/45 bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-slate-900/82 shadow-[20px_0_50px_rgba(2,6,23,0.45)] backdrop-blur-xl transition-[width,padding,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-visible lg:overscroll-contain ${sidebarDesktopRailClass}`}
        >
          <div
            className={`mb-4 rounded-2xl border border-slate-700/45 bg-slate-900/42 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.35)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${sidebarProfileCardClass}`}
          >
            <div className={`flex h-full ${isSidebarCollapsed ? 'flex-col items-center justify-between' : 'items-center justify-between gap-3'}`}>
              <div
                className={`min-w-0 items-center ${isSidebarCollapsed ? 'order-2 flex w-full justify-center' : 'order-1 flex flex-1 gap-3'}`}
                title={isSidebarCollapsed ? `${displayName || 'Usuario'} · ${roleLabel}` : undefined}
              >
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800/80 text-sm font-semibold text-slate-200 shadow-[0_8px_20px_rgba(2,6,23,0.45)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials || 'U'}</span>
                  )}
                </div>
                <div className={sidebarHeaderTextClass}>
                  <p className="truncate text-sm font-semibold text-slate-100">{displayName || 'Cargando...'}</p>
                  <p className="truncate text-xs text-slate-400">{roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((current) => !current)}
                className={`${sidebarRailToggleButtonClass} ${isSidebarCollapsed ? 'order-1 mb-2' : 'order-2'}`}
                aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
                title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              >
                {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>
          </div>

          <div className="mt-1 flex min-h-0 flex-1 flex-col">
            {!isSidebarCollapsed ? (
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500/90">
                Navegación
              </p>
            ) : null}
            <nav className={sidebarDesktopNavClass}>
              {sidebarItems.map((item) => {
                const isActive = isFicha
                  ? activeSection === item.id
                  : location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    aria-label={item.label}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={getSidebarDesktopButtonClass({ active: isActive })}
                  >
                    <Icon size={18} className={getSidebarDesktopIconClass({ active: isActive })} />
                    <span className={sidebarDesktopLabelClass}>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className={sidebarDesktopFooterClass}>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Ajustes"
              title={isSidebarCollapsed ? 'Ajustes' : undefined}
              className={getSidebarDesktopButtonClass()}
            >
              <Settings size={18} className={getSidebarDesktopIconClass()} />
              <span className={sidebarDesktopLabelClass}>Ajustes</span>
            </button>
            <button
              type="button"
              onClick={() => setIsLogoutOpen(true)}
              aria-label="Cerrar sesión"
              title={isSidebarCollapsed ? 'Cerrar sesión' : undefined}
              className={getSidebarDesktopButtonClass({ tone: 'warning' })}
            >
              <LogOut size={18} className={getSidebarDesktopIconClass({ tone: 'warning' })} />
              <span className={sidebarDesktopLabelClass}>Cerrar sesión</span>
            </button>
          </div>

          {!isSidebarCollapsed ? (
            <div className="mt-3 rounded-2xl border border-slate-700/45 bg-slate-900/45 p-4 text-xs text-slate-400 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.35)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Sistema</p>
              <p className="mt-2 leading-5">Tus avances se guardan automáticamente.</p>
            </div>
          ) : null}
        </aside>
        <div className="login-glow flex flex-1 flex-col overflow-hidden">
          <div className="lg:hidden">
            <div className="glass-panel sticky top-0 z-40 flex items-center justify-between px-4 py-3">
              <button
                ref={mobileSidebarButtonRef}
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800/70 text-slate-200 transition hover:border-slate-600/70"
                aria-label="Abrir menú"
                title="Menú"
              >
                <PanelLeftOpen size={16} />
              </button>
              <span className="text-sm font-semibold text-slate-100">Monitoreo</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-300"
                >
                  Ajustes
                </button>
              </div>
            </div>
          </div>
          <main className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
            <ErrorBoundary>
              <div className={contentContainerClass}>
                <Outlet />
              </div>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      {isAssistantOpen ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 bg-slate-950/15 transition-opacity"
        />
      ) : null}
      <div className={`fixed right-6 z-40 flex flex-col items-end ${isCompactDensity ? 'bottom-5 gap-2.5' : 'bottom-6 gap-3'}`}>
        {isAssistantOpen ? (
          <div
            ref={assistantPanelRef}
            role="dialog"
            aria-label="Asistente"
            aria-modal="false"
            className={assistantPanelClass}
          >
            <div className={`shrink-0 flex items-center justify-between border-b border-slate-800/70 ${isCompactDensity ? 'px-3.5 py-2.5' : 'px-4 py-3'}`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Asistente
              </div>
              <button
                type="button"
                onClick={() => setIsAssistantOpen(false)}
                className="rounded-full border border-slate-700/60 p-1 text-slate-300 transition hover:border-slate-500"
                aria-label="Cerrar asistente"
              >
                <X size={14} />
              </button>
            </div>
            <div ref={assistantMessagesRef} className={assistantMessageListClass}>
              {assistantWizard.active ? (
                <section className={`rounded-2xl border border-cyan-500/35 bg-cyan-500/10 ${isCompactDensity ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
                  <p className="text-sm font-semibold text-cyan-100">Crear monitoreo (modo asistido)</p>
                  <p className="mt-1 text-xs leading-5 text-cyan-100/90">
                    {getWizardStepIndicator(
                      assistantWizard.draft,
                      assistantWizard.step || 'title',
                      assistantWizard.currentResponsible,
                    )}
                  </p>
                  <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-100">
                    <p>
                      <span className="text-slate-400">Título:</span>{' '}
                      {assistantWizard.draft.title || 'No registrado'}
                    </p>
                    <p>
                      <span className="text-slate-400">Fechas:</span>{' '}
                      {`${formatWizardDate(assistantWizard.draft.startAt)} - ${formatWizardDate(assistantWizard.draft.endAt)}`}
                    </p>
                    <div>
                      <span className="text-slate-400">Responsables:</span>
                      <div className="mt-1 space-y-1">
                        {formatWizardResponsiblesSummary(assistantWizard.draft.responsibles).map((line, index) => (
                          <p key={`wizard-summary-responsible-${index}`} className="flex items-start gap-2">
                            <span className="mt-2 inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300/90" />
                            <span>{line}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                    <p>
                      <span className="text-slate-400">Estado:</span> Borrador
                    </p>
                  </div>
                </section>
              ) : null}
              {assistantMessages.map((message) => {
                const parsedList = message.role === 'assistant' ? parseAssistantListMessage(message.text) : null;
                const parsedBullets = message.role === 'assistant' ? parseSimpleBulletMessage(message.text) : null;
                if (parsedList) {
                  const isExpanded = Boolean(expandedAssistantCards[message.id]);
                  const visibleItems = isExpanded
                    ? parsedList.items
                    : parsedList.items.slice(0, MAX_VISIBLE_ASSISTANT_CARDS);
                  const hiddenCount = Math.max(parsedList.items.length - visibleItems.length, 0);

                  return (
                    <div
                      key={message.id}
                      className={`max-w-full rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 ${
                        isCompactDensity ? 'px-2.5 py-2.5' : 'px-3 py-3'
                      }`}
                    >
                      <p className="text-sm font-semibold leading-5 text-slate-100">
                        {parsedList.title}
                      </p>
                      <div className="mt-2.5 space-y-2.5">
                        {visibleItems.map((item, itemIndex) => (
                          <article
                            key={`${message.id}-item-${itemIndex}`}
                            className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2.5"
                          >
                            <p className="text-sm font-medium leading-5 text-slate-100">
                              {item.title}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.status ? (
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusChipClassName(item.status)}`}
                                >
                                  {item.status}
                                </span>
                              ) : null}
                              {item.dateLabel ? (
                                <span className="inline-flex rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-100/90">
                                  {item.dateLabel}
                                </span>
                              ) : null}
                              {item.extraMeta ? (
                                <span className="inline-flex rounded-full border border-slate-600/60 bg-slate-800/70 px-2.5 py-1 text-xs font-medium text-slate-200/90">
                                  {item.extraMeta}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {shouldRenderAssistantItemActions(parsedList.title, item) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleAssistantViewDetail(item)}
                                    className="rounded-lg border border-slate-600/70 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
                                  >
                                    Ver detalle
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAssistantGoCalendar(item)}
                                    className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/70"
                                  >
                                    Ir al calendario
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>

                      {hiddenCount > 0 || parsedList.summarizedCount > 0 ? (
                        <div className="mt-2.5 rounded-xl border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-xs leading-5 text-slate-300/90">
                          <p className="text-xs leading-5 text-slate-300/85">
                            {hiddenCount > 0
                              ? `Resumen: mostrando ${visibleItems.length} de ${parsedList.items.length} elementos.`
                              : `Resumen: se muestran ${parsedList.items.length} elementos y hay ${parsedList.summarizedCount} adicionales.`}
                          </p>
                          {hiddenCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleAssistantCardToggle(message.id)}
                              className="mt-1.5 text-xs font-semibold text-cyan-200 underline decoration-cyan-400/70 underline-offset-4"
                            >
                              {isExpanded ? 'Ver menos' : `Ver más (${hiddenCount})`}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (parsedBullets) {
                  return (
                    <div
                      key={message.id}
                      className={`max-w-[92%] rounded-2xl px-3 py-2 ${
                        message.role === 'user'
                          ? 'ml-auto bg-cyan-500/15 text-cyan-100'
                          : 'bg-slate-800/70 text-slate-200'
                      }`}
                    >
                      {parsedBullets.intro.length ? (
                        <div className="space-y-1">
                          {parsedBullets.intro.map((line, idx) => (
                            <p key={`${message.id}-intro-${idx}`} className="text-sm leading-5 text-slate-200">
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className={`${parsedBullets.intro.length ? 'mt-2' : ''} space-y-1.5`}>
                        {parsedBullets.bullets.map((item, idx) => (
                          <div key={`${message.id}-bullet-${idx}`} className="flex items-start gap-2">
                            <span className="mt-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300/90" />
                            <p className="text-sm leading-5 text-slate-200">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={message.id}
                    className={`max-w-[92%] rounded-2xl px-3 py-2 ${
                      message.role === 'user'
                        ? 'ml-auto bg-cyan-500/15 text-cyan-100'
                        : 'bg-slate-800/70 text-slate-200'
                    }`}
                  >
                    <span className="block max-w-[52ch] whitespace-pre-line text-sm leading-5">{message.text}</span>
                  </div>
                );
              })}
              <div ref={assistantMessagesEndRef} aria-hidden="true" className="h-px w-full" />
            </div>
            <div className={assistantComposerClass}>
              <div className="flex items-center gap-2">
                <input
                  ref={assistantInputRef}
                  value={assistantInput}
                  onChange={(event) => setAssistantInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAssistantSend();
                  }}
                  placeholder="Escribe tu pregunta..."
                  className={assistantInputClass}
                  disabled={isAssistantLoading || assistantWizard.saving}
                />
                <button
                  type="button"
                  onClick={handleAssistantSend}
                  className={`inline-flex items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-100 transition hover:border-cyan-400/70 disabled:opacity-60 ${isCompactDensity ? 'h-9 w-9' : 'h-10 w-10'}`}
                  aria-label="Enviar"
                  disabled={isAssistantLoading || assistantWizard.saving}
                >
                  {isAssistantLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
              {assistantQuickSuggestions ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {ASSISTANT_QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleAssistantQuickAction(action)}
                      className={assistantQuickActionClass}
                      disabled={
                        isAssistantLoading ||
                        assistantWizard.saving ||
                        (assistantWizard.active && action.type !== 'wizard')
                      }
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {assistantWizard.active ? (
                <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleAssistantWizardControl('atras')}
                      className="rounded-lg border border-slate-600/70 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/70"
                      disabled={isAssistantLoading || assistantWizard.saving}
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssistantWizardEditMenuOpen((prev) => !prev)}
                      className="rounded-lg border border-slate-600/70 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/70"
                      disabled={isAssistantLoading || assistantWizard.saving}
                    >
                      Editar campo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssistantWizardControl('cancelar')}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-400/60 hover:text-rose-100"
                      disabled={isAssistantLoading || assistantWizard.saving}
                    >
                      Cancelar
                    </button>
                  </div>
                  {assistantWizardEditMenuOpen ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ASSISTANT_WIZARD_EDIT_FIELDS.map((field) => (
                        <button
                          key={field.id}
                          type="button"
                          onClick={() => handleAssistantWizardEditField(field.command)}
                          className="rounded-full border border-slate-600/70 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/70"
                          disabled={isAssistantLoading || assistantWizard.saving}
                        >
                          {field.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {assistantWizard.awaitingPostCreateAction ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAssistantWizardControl('abrir borrador')}
                    className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/70"
                    disabled={isAssistantLoading || assistantWizard.saving}
                  >
                    Abrir borrador
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAssistantWizardControl('Añadir detalles')}
                    className="rounded-lg border border-slate-600/70 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/70"
                    disabled={isAssistantLoading || assistantWizard.saving}
                  >
                    Añadir detalles
                  </button>
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleAssistantClearConversation}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-400/60 hover:text-rose-100"
                >
                  Borrar conversación
                </button>
                <button
                  type="button"
                  onClick={handleAssistantModeToggle}
                  className="rounded-lg border border-slate-600/70 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/70 hover:text-cyan-100"
                >
                  {assistantMode === ASSISTANT_MODE_PERSISTENT
                    ? 'Modo: Persistente'
                    : 'Modo: Temporal (sesión)'}
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500/90">
                Se conservan hasta {ASSISTANT_HISTORY_MAX_MESSAGES} mensajes y se eliminan automáticamente tras {ASSISTANT_RETENTION_DAYS} días.
              </p>
            </div>
          </div>
        ) : null}
        <button
          ref={assistantToggleButtonRef}
          type="button"
          onClick={() => setIsAssistantOpen((current) => !current)}
          className={assistantToggleButtonClass}
          aria-label="Abrir asistente"
        >
          <img src={chatbotIcon} alt="" className="h-7 w-7" />
        </button>
      </div>
      {isSettingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/60 backdrop-blur-sm"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="h-full w-full max-w-md border-l border-slate-800/70 bg-slate-950/90 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Ajustes rapidos</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Cambios inmediatos para lectura y apariencia.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-700/60 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
              >
                <X size={13} className="mr-1.5" />
                Cerrar
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Lectura</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">Tamano de texto</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: 'normal', label: 'Normal' },
                    { id: 'large', label: 'Grande' },
                    { id: 'xlarge', label: 'Muy grande' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFontSize(option.id)}
                      className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-xs font-semibold transition ${
                        fontSize === option.id
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                          : 'border-slate-700/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Apariencia</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">Tema</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: 'dark', label: 'Oscuro' },
                    { id: 'light', label: 'Claro' },
                    { id: 'system', label: 'Automatico' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTheme(option.id)}
                      className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-xs font-semibold transition ${
                        theme === option.id
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                          : 'border-slate-700/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Vista previa aplicada en tiempo real.</p>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Densidad</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">Distribucion</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: DENSITY_COMPACT, label: 'Compacta' },
                    { id: DENSITY_COMFORT, label: 'Cómoda' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDensity(option.id)}
                      className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-xs font-semibold transition ${
                        density === option.id
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                          : 'border-slate-700/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  En escritorio se usa Compacta por defecto para mejorar lectura rápida.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Acceso avanzado</p>
                <button
                  type="button"
                  onClick={openAdvancedSettings}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-4 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/70"
                >
                  Abrir configuracion completa
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-slate-700/60 px-4 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                >
                  Restablecer visual
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-slate-700/60 px-4 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                >
                  Cerrar panel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={isLogoutOpen}
        tone="warning"
        title="Cerrar sesión"
        description="¿Seguro que deseas cerrar sesión?"
        details="Tendrás que iniciar sesión nuevamente para continuar."
        confirmText={isLoggingOut ? 'Cerrando sesión...' : 'Sí, cerrar sesión'}
        cancelText="Cancelar"
        onCancel={() => setIsLogoutOpen(false)}
        onConfirm={handleLogout}
        loading={isLoggingOut}
      />
    </SidebarContext.Provider>
  );
}
