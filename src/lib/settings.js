export const THEME_STORAGE_KEY = 'monitoreoTheme';
export const FONT_SIZE_STORAGE_KEY = 'monitoreoFontSize';
export const DENSITY_STORAGE_KEY = 'monitoreoDensity';
export const HIGH_CONTRAST_STORAGE_KEY = 'monitoreoHighContrast';
export const REDUCE_MOTION_STORAGE_KEY = 'monitoreoReduceMotion';
export const NOTIFICATIONS_STORAGE_KEY = 'monitoreoNotifications';
export const SETTINGS_LAST_SECTION_KEY = 'monitoreoSettingsLastSection';
export const SETTINGS_EVENT_NAME = 'monitoreo-settings-updated';

export const DENSITY_COMPACT = 'compact';
export const DENSITY_COMFORT = 'comfort';

export const ASSISTANT_MODE_PREFIX = 'monitoreoAssistantMode';
export const ASSISTANT_MODE_PERSISTENT = 'persistent';
export const ASSISTANT_MODE_TEMPORARY = 'temporary';
export const ASSISTANT_QUICK_ACTIONS_KEY = 'monitoreoAssistantQuickActions';
export const ASSISTANT_AUTO_CLOSE_KEY = 'monitoreoAssistantAutoClose';
export const ASSISTANT_CLEAR_ON_LOGOUT_KEY = 'monitoreoAssistantClearOnLogout';

const DEFAULT_NOTIFICATIONS = {
  monitoringDue: true,
  systemAlerts: true,
  agendaReminders: true,
  channel: 'system',
};

const THEME_OPTIONS = ['dark', 'light', 'system'];
const FONT_OPTIONS = ['normal', 'large', 'xlarge'];
const DENSITY_OPTIONS = [DENSITY_COMPACT, DENSITY_COMFORT];

const safeStorageRead = (key) => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

export const safeStorageWrite = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // noop
  }
};

export const safeStorageRemove = (key) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // noop
  }
};

export const readBooleanSetting = (key, fallback = false) => {
  const raw = safeStorageRead(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
};

export const getDesktopDensityDefault = () => {
  if (typeof window !== 'undefined') {
    try {
      if (window.matchMedia('(min-width: 1024px)').matches) return DENSITY_COMPACT;
    } catch {
      // noop
    }
  }
  return DENSITY_COMFORT;
};

export const resolveDensityPreference = () => {
  const storedDensity = safeStorageRead(DENSITY_STORAGE_KEY);
  if (DENSITY_OPTIONS.includes(storedDensity)) return storedDensity;
  return getDesktopDensityDefault();
};

export const resolveThemePreference = () => {
  const storedTheme = safeStorageRead(THEME_STORAGE_KEY);
  if (THEME_OPTIONS.includes(storedTheme)) return storedTheme;
  return 'dark';
};

export const resolveFontSizePreference = () => {
  const storedFontSize = safeStorageRead(FONT_SIZE_STORAGE_KEY);
  if (FONT_OPTIONS.includes(storedFontSize)) return storedFontSize;
  return 'normal';
};

export const resolveEffectiveTheme = (themePreference = 'dark') => {
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

export const applyVisualPreferences = ({
  themePreference,
  fontSize,
  density,
  highContrast,
  reduceMotion,
} = {}) => {
  if (typeof document === 'undefined') return;
  const resolvedThemePreference = THEME_OPTIONS.includes(themePreference)
    ? themePreference
    : resolveThemePreference();
  const resolvedTheme = resolveEffectiveTheme(resolvedThemePreference);
  const resolvedFont = FONT_OPTIONS.includes(fontSize) ? fontSize : resolveFontSizePreference();
  const resolvedDensity = DENSITY_OPTIONS.includes(density) ? density : resolveDensityPreference();
  const resolvedContrast = Boolean(highContrast);
  const resolvedReduceMotion = Boolean(reduceMotion);

  safeStorageWrite(THEME_STORAGE_KEY, resolvedThemePreference);
  safeStorageWrite(FONT_SIZE_STORAGE_KEY, resolvedFont);
  safeStorageWrite(DENSITY_STORAGE_KEY, resolvedDensity);
  safeStorageWrite(HIGH_CONTRAST_STORAGE_KEY, String(resolvedContrast));
  safeStorageWrite(REDUCE_MOTION_STORAGE_KEY, String(resolvedReduceMotion));

  document.documentElement.dataset.themePreference = resolvedThemePreference;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.fontSize = resolvedFont;
  document.documentElement.dataset.density = resolvedDensity;
  document.documentElement.dataset.highContrast = String(resolvedContrast);
  document.documentElement.dataset.reduceMotion = String(resolvedReduceMotion);
};

export const readNotificationPreferences = () => {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFICATIONS };
  try {
    const raw = JSON.parse(window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || '{}');
    return {
      monitoringDue:
        typeof raw.monitoringDue === 'boolean' ? raw.monitoringDue : DEFAULT_NOTIFICATIONS.monitoringDue,
      systemAlerts:
        typeof raw.systemAlerts === 'boolean' ? raw.systemAlerts : DEFAULT_NOTIFICATIONS.systemAlerts,
      agendaReminders:
        typeof raw.agendaReminders === 'boolean'
          ? raw.agendaReminders
          : DEFAULT_NOTIFICATIONS.agendaReminders,
      channel: ['system', 'email'].includes(raw.channel) ? raw.channel : DEFAULT_NOTIFICATIONS.channel,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATIONS };
  }
};

export const normalizeAssistantUserKey = (value) =>
  String(value || 'anon')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');

export const buildStorageKey = (prefix, userKey) =>
  `${prefix}:${normalizeAssistantUserKey(userKey)}`;

export const readAssistantQuickActionsSetting = () =>
  readBooleanSetting(ASSISTANT_QUICK_ACTIONS_KEY, true);

export const readAssistantAutoCloseSetting = () =>
  readBooleanSetting(ASSISTANT_AUTO_CLOSE_KEY, true);

export const readAssistantClearOnLogoutSetting = () =>
  readBooleanSetting(ASSISTANT_CLEAR_ON_LOGOUT_KEY, false);
