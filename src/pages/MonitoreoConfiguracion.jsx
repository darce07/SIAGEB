import { useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Accessibility,
  Bell,
  Bot,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Toast from '../components/ui/Toast.jsx';
import { supabase } from '../lib/supabase.js';
import {
  applyVisualPreferences,
  ASSISTANT_AUTO_CLOSE_KEY,
  ASSISTANT_CLEAR_ON_LOGOUT_KEY,
  ASSISTANT_MODE_PREFIX,
  ASSISTANT_MODE_PERSISTENT,
  ASSISTANT_MODE_TEMPORARY,
  ASSISTANT_QUICK_ACTIONS_KEY,
  buildStorageKey,
  DENSITY_COMFORT,
  DENSITY_COMPACT,
  getDesktopDensityDefault,
  HIGH_CONTRAST_STORAGE_KEY,
  NOTIFICATIONS_STORAGE_KEY,
  readAssistantAutoCloseSetting,
  readAssistantClearOnLogoutSetting,
  readAssistantQuickActionsSetting,
  readBooleanSetting,
  readNotificationPreferences,
  REDUCE_MOTION_STORAGE_KEY,
  resolveDensityPreference,
  resolveFontSizePreference,
  resolveThemePreference,
  SETTINGS_EVENT_NAME,
  SETTINGS_LAST_SECTION_KEY,
  safeStorageWrite,
} from '../lib/settings.js';

const AVATAR_BUCKET = 'avatars';

const readLocalJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const getAvatarPath = (userId) => `profiles/${userId}/avatar`;

const toProfileDraft = (source = {}, auth = {}) => {
  const firstName = source.firstName || source.first_name || '';
  const lastName = source.lastName || source.last_name || '';
  const fullName = source.fullName || source.full_name || `${firstName} ${lastName}`.trim();

  return {
    id: source.id || auth.id || '',
    email: source.email || auth.email || '',
    firstName,
    lastName,
    fullName,
    avatarUrl: source.avatarUrl || source.avatar_url || '',
  };
};

const isSameProfile = (left, right) =>
  left.firstName === right.firstName &&
  left.lastName === right.lastName &&
  left.fullName === right.fullName &&
  left.avatarUrl === right.avatarUrl;

const isSamePlainObject = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const formatDateTime = (value) => {
  if (!value) return 'No disponible';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No disponible';
  return parsed.toLocaleString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const readVisualDraft = () => ({
  theme: resolveThemePreference(),
  fontSize: resolveFontSizePreference(),
  density: resolveDensityPreference(),
  highContrast: readBooleanSetting(HIGH_CONTRAST_STORAGE_KEY, false),
  reduceMotion: readBooleanSetting(REDUCE_MOTION_STORAGE_KEY, false),
});

const readAssistantDraft = (assistantModeKey) => {
  const rawMode = localStorage.getItem(assistantModeKey) || ASSISTANT_MODE_PERSISTENT;
  return {
    mode:
      rawMode === ASSISTANT_MODE_TEMPORARY
        ? ASSISTANT_MODE_TEMPORARY
        : ASSISTANT_MODE_PERSISTENT,
    showQuickSuggestions: readAssistantQuickActionsSetting(),
    closeOnOutside: readAssistantAutoCloseSetting(),
    clearOnLogout: readAssistantClearOnLogoutSetting(),
  };
};

const baseSections = [
  {
    id: 'general',
    label: 'General',
    description: 'Resumen y preferencias globales',
    icon: UserRound,
  },
  {
    id: 'apariencia',
    label: 'Apariencia',
    description: 'Tema, densidad y lectura',
    icon: Palette,
  },
  {
    id: 'accesibilidad',
    label: 'Accesibilidad',
    description: 'Contraste y animaciones',
    icon: Accessibility,
  },
  {
    id: 'notificaciones',
    label: 'Notificaciones',
    description: 'Alertas del sistema',
    icon: Bell,
  },
  {
    id: 'cuenta',
    label: 'Cuenta / Perfil',
    description: 'Datos personales y foto',
    icon: UserRound,
  },
  {
    id: 'seguridad',
    label: 'Seguridad',
    description: 'Contrasena y sesiones',
    icon: ShieldCheck,
  },
  {
    id: 'asistente',
    label: 'Asistente',
    description: 'Preferencias del chatbot',
    icon: Bot,
  },
];

function OptionButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-xs font-semibold transition ${
        active
          ? 'border-emerald-500/45 bg-emerald-500/20 text-emerald-100'
          : 'border-slate-700/70 bg-slate-900/60 text-slate-300 hover:border-slate-500'
      }`}
    >
      {label}
    </button>
  );
}

function ToggleRow({ title, description, value, onToggle }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex h-9 min-w-[104px] items-center justify-center rounded-xl border px-4 text-xs font-semibold transition ${
          value
            ? 'border-emerald-500/45 bg-emerald-500/20 text-emerald-100'
            : 'border-slate-700/70 bg-slate-900/65 text-slate-300 hover:border-slate-500'
        }`}
      >
        {value ? 'Activado' : 'Desactivado'}
      </button>
    </div>
  );
}

export default function MonitoreoConfiguracion() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useMemo(() => readLocalJson('monitoreoAuth', {}), []);
  const storedProfile = useMemo(() => readLocalJson('monitoreoProfile', {}), []);
  const assistantUserKey = useMemo(
    () => storedProfile?.id || auth?.email || auth?.docNumber || auth?.name || 'anon',
    [auth, storedProfile],
  );
  const assistantModeKey = useMemo(
    () => buildStorageKey(ASSISTANT_MODE_PREFIX, assistantUserKey),
    [assistantUserKey],
  );

  const roleLabel = auth?.role === 'admin' ? 'Administrador' : 'Especialista';
  const isAdmin = auth?.role === 'admin';
  const sections = useMemo(
    () =>
      isAdmin
        ? [
            ...baseSections,
            {
              id: 'sistema',
              label: 'Sistema / Administracion',
              description: 'Herramientas administrativas',
              icon: ServerCog,
            },
          ]
        : baseSections,
    [isAdmin],
  );

  const requestedSection = searchParams.get('seccion');
  const [activeSection, setActiveSection] = useState(() => {
    const fallback = localStorage.getItem(SETTINGS_LAST_SECTION_KEY) || 'general';
    return requestedSection || fallback;
  });

  const [profile, setProfile] = useState(() => toProfileDraft(storedProfile, auth));
  const [initialProfile, setInitialProfile] = useState(() => toProfileDraft(storedProfile, auth));
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarAction, setAvatarAction] = useState('keep');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [lastSignInAt, setLastSignInAt] = useState('');

  const [visualPrefs, setVisualPrefs] = useState(() => readVisualDraft());
  const [initialVisualPrefs, setInitialVisualPrefs] = useState(() => readVisualDraft());

  const [notificationPrefs, setNotificationPrefs] = useState(() => readNotificationPreferences());
  const [initialNotificationPrefs, setInitialNotificationPrefs] = useState(() =>
    readNotificationPreferences(),
  );

  const [assistantPrefs, setAssistantPrefs] = useState(() => readAssistantDraft(assistantModeKey));
  const [initialAssistantPrefs, setInitialAssistantPrefs] = useState(() =>
    readAssistantDraft(assistantModeKey),
  );

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isClosingOtherSessions, setIsClosingOtherSessions] = useState(false);
  const [otherSessionsMessage, setOtherSessionsMessage] = useState('');

  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const nextLocationRef = useRef('');

  useEffect(() => {
    const valid = sections.some((section) => section.id === activeSection);
    if (!valid) setActiveSection('general');
  }, [activeSection, sections]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_LAST_SECTION_KEY, activeSection);
    } catch {
      // noop
    }
  }, [activeSection]);

  useEffect(() => {
    const querySection = searchParams.get('seccion');
    if (!querySection) return;
    if (!sections.some((section) => section.id === querySection)) return;
    if (querySection !== activeSection) setActiveSection(querySection);
  }, [activeSection, searchParams, sections]);

  const updateActiveSection = (sectionId) => {
    setActiveSection(sectionId);
    try {
      localStorage.setItem(SETTINGS_LAST_SECTION_KEY, sectionId);
    } catch {
      // noop
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('seccion', sectionId);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: authUser } = await supabase.auth.getUser();
      const user = authUser?.user;
      setLastSignInAt(user?.last_sign_in_at || '');
      if (!user?.id) return;

      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error || !data) return;

      const next = toProfileDraft(data, auth);
      setProfile(next);
      setInitialProfile(next);
      localStorage.setItem(
        'monitoreoProfile',
        JSON.stringify({
          ...data,
          firstName: next.firstName,
          lastName: next.lastName,
          fullName: next.fullName,
          avatarUrl: next.avatarUrl,
        }),
      );
      window.dispatchEvent(new Event('monitoreo-profile-updated'));
    };

    fetchProfile();
  }, [auth]);

  useEffect(() => {
    const nextAssistant = readAssistantDraft(assistantModeKey);
    setAssistantPrefs(nextAssistant);
    setInitialAssistantPrefs(nextAssistant);
  }, [assistantModeKey]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const hasUnsavedChanges =
    !isSameProfile(profile, initialProfile) ||
    avatarAction !== 'keep' ||
    Boolean(avatarFile) ||
    !isSamePlainObject(visualPrefs, initialVisualPrefs) ||
    !isSamePlainObject(notificationPrefs, initialNotificationPrefs) ||
    !isSamePlainObject(assistantPrefs, initialAssistantPrefs);

  useBeforeUnload(
    useMemo(
      () => (event) => {
        if (!hasUnsavedChanges) return;
        event.preventDefault();
      },
      [hasUnsavedChanges],
    ),
  );

  useEffect(() => {
    const onClick = (event) => {
      if (!hasUnsavedChanges) return;
      const trigger = event.target;
      if (!(trigger instanceof Element)) return;
      const target = trigger.closest('a[href]');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (href === `${window.location.pathname}${window.location.search}`) return;
      event.preventDefault();
      nextLocationRef.current = href;
      setShowUnsavedModal(true);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [hasUnsavedChanges]);

  const persistProfileInStorage = (nextProfile) => {
    const existingProfile = readLocalJson('monitoreoProfile', {});
    const serializedProfile = {
      ...existingProfile,
      id: nextProfile.id,
      email: nextProfile.email,
      first_name: nextProfile.firstName,
      last_name: nextProfile.lastName,
      full_name: nextProfile.fullName,
      avatar_url: nextProfile.avatarUrl || null,
      firstName: nextProfile.firstName,
      lastName: nextProfile.lastName,
      fullName: nextProfile.fullName,
      avatarUrl: nextProfile.avatarUrl || '',
    };
    localStorage.setItem('monitoreoProfile', JSON.stringify(serializedProfile));

    const existingAuth = readLocalJson('monitoreoAuth', {});
    const authNext = {
      ...existingAuth,
      name: nextProfile.fullName || existingAuth?.name || '',
      email: nextProfile.email || existingAuth?.email || '',
    };
    localStorage.setItem('monitoreoAuth', JSON.stringify(authNext));
    window.dispatchEvent(new Event('monitoreo-profile-updated'));
  };

  const handleFieldChange = (field, value) => {
    setProfileError('');
    setProfileSuccess('');
    setProfile((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'firstName' || field === 'lastName') {
        next.fullName = `${field === 'firstName' ? value : next.firstName} ${
          field === 'lastName' ? value : next.lastName
        }`.trim();
      }
      if (field === 'fullName' && !value.trim()) {
        next.fullName = `${next.firstName} ${next.lastName}`.trim();
      }
      return next;
    });
  };

  const handlePhotoChange = (event) => {
    setProfileError('');
    setProfileSuccess('');
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setProfileError('Formato no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setProfileError('La imagen supera 3MB. Sube una foto mas ligera.');
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarFile(file);
    setAvatarAction('replace');
    setProfile((prev) => ({ ...prev, avatarUrl: previewUrl }));
  };

  const handleRemovePhoto = () => {
    setProfileError('');
    setProfileSuccess('');
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview('');
    setAvatarFile(null);
    setAvatarAction('remove');
    setProfile((prev) => ({ ...prev, avatarUrl: '' }));
  };

  const handleResetVisualDraft = () => {
    setVisualPrefs({
      theme: 'dark',
      fontSize: 'normal',
      density: getDesktopDensityDefault(),
      highContrast: false,
      reduceMotion: false,
    });
  };

  const handleCancelChanges = () => {
    setProfile(initialProfile);
    setVisualPrefs(initialVisualPrefs);
    setNotificationPrefs(initialNotificationPrefs);
    setAssistantPrefs(initialAssistantPrefs);
    setProfileError('');
    setProfileSuccess('');
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview('');
    setAvatarFile(null);
    setAvatarAction('keep');
  };

  const saveProfileIfNeeded = async () => {
    const profileDirty =
      !isSameProfile(profile, initialProfile) || avatarAction !== 'keep' || Boolean(avatarFile);
    if (!profileDirty) return initialProfile;

    if (!profile.id) {
      throw new Error('No se pudo identificar el usuario de perfil.');
    }

    let avatarUrl = initialProfile.avatarUrl || null;
    const avatarPath = getAvatarPath(profile.id);

    if (avatarAction === 'replace' && avatarFile) {
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath, avatarFile, {
        upsert: true,
        contentType: avatarFile.type,
        cacheControl: '3600',
      });

      if (uploadError) {
        throw new Error(`No se pudo subir la foto: ${uploadError.message}`);
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
      avatarUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
    }

    if (avatarAction === 'remove') {
      await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      avatarUrl = null;
    }

    const payload = {
      first_name: profile.firstName.trim(),
      last_name: profile.lastName.trim(),
      full_name: profile.fullName.trim() || `${profile.firstName} ${profile.lastName}`.trim(),
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase.from('profiles').update(payload).eq('id', profile.id);
    if (updateError) {
      throw new Error(`No se pudieron guardar los cambios de perfil: ${updateError.message}`);
    }

    return {
      ...profile,
      firstName: payload.first_name,
      lastName: payload.last_name,
      fullName: payload.full_name,
      avatarUrl: payload.avatar_url || '',
    };
  };

  const handleSaveAll = async () => {
    if (isSavingAll) return;
    setProfileError('');
    setProfileSuccess('');
    setToastMessage('');
    setIsSavingAll(true);

    try {
      const nextProfile = await saveProfileIfNeeded();
      setProfile(nextProfile);
      setInitialProfile(nextProfile);
      persistProfileInStorage(nextProfile);

      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
        setAvatarPreview('');
      }
      setAvatarFile(null);
      setAvatarAction('keep');

      applyVisualPreferences({
        themePreference: visualPrefs.theme,
        fontSize: visualPrefs.fontSize,
        density: visualPrefs.density,
        highContrast: visualPrefs.highContrast,
        reduceMotion: visualPrefs.reduceMotion,
      });
      setInitialVisualPrefs(visualPrefs);

      safeStorageWrite(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notificationPrefs));
      setInitialNotificationPrefs(notificationPrefs);

      safeStorageWrite(assistantModeKey, assistantPrefs.mode);
      safeStorageWrite(ASSISTANT_QUICK_ACTIONS_KEY, String(assistantPrefs.showQuickSuggestions));
      safeStorageWrite(ASSISTANT_AUTO_CLOSE_KEY, String(assistantPrefs.closeOnOutside));
      safeStorageWrite(ASSISTANT_CLEAR_ON_LOGOUT_KEY, String(assistantPrefs.clearOnLogout));
      setInitialAssistantPrefs(assistantPrefs);

      window.dispatchEvent(new Event(SETTINGS_EVENT_NAME));
      setProfileSuccess('Cambios guardados correctamente.');
      setToastMessage('Cambios guardados correctamente');
    } catch (error) {
      setProfileError(error.message || 'No se pudieron guardar los cambios.');
    } finally {
      setIsSavingAll(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (isSavingPassword) return;
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.currentPassword.trim()) {
      setPasswordError('Ingresa tu contrasena actual.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('La nueva contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Las contrasenas no coinciden.');
      return;
    }

    const loginEmail = profile.email || auth?.email;
    if (!loginEmail) {
      setPasswordError('No se encontro el correo de la cuenta actual.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: passwordForm.currentPassword.trim(),
      });
      if (signInError) {
        setPasswordError('La contrasena actual es incorrecta.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });
      if (updateError) {
        setPasswordError(`No se pudo actualizar la contrasena: ${updateError.message}`);
        return;
      }

      setPasswordSuccess('Contrasena actualizada correctamente.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleCloseOtherSessions = async () => {
    if (isClosingOtherSessions) return;
    setOtherSessionsMessage('');
    setIsClosingOtherSessions(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) {
        setOtherSessionsMessage(`No se pudo cerrar otras sesiones: ${error.message}`);
        return;
      }
      setOtherSessionsMessage('Se cerro la sesion de otros dispositivos.');
    } finally {
      setIsClosingOtherSessions(false);
    }
  };

  const avatarInitials = (profile.fullName || profile.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const selectedSection = sections.find((section) => section.id === activeSection) || sections[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-4">
          <SectionHeader
            eyebrow="Centro"
            title="Configuracion"
            description="Administra ajustes, cuenta y seguridad en un solo lugar."
          />
          <div className="mt-5 space-y-2">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => updateActiveSection(section.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    isActive
                      ? 'border-cyan-400/45 bg-cyan-500/15 text-slate-100'
                      : 'border-slate-700/70 bg-slate-900/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Icon size={16} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-5">{section.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-400">{section.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => navigate('/monitoreo/inicio')}
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-700/70 px-4 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
          >
            Volver al inicio
          </button>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-6">
            <SectionHeader
              eyebrow="Configuracion"
              title={selectedSection.label}
              description={selectedSection.description}
            />

            {activeSection === 'general' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cuenta activa</p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{profile.fullName || profile.email}</p>
                  <p className="mt-1 text-xs text-slate-400">{profile.email || auth?.email || 'No disponible'}</p>
                  <p className="mt-2 inline-flex rounded-full border border-slate-700/70 px-2.5 py-1 text-xs text-slate-300">
                    {roleLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Resumen rapido</p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
                    <li>Tema: {visualPrefs.theme === 'system' ? 'Automatico' : visualPrefs.theme}</li>
                    <li>Densidad: {visualPrefs.density === DENSITY_COMPACT ? 'Compacta' : 'Comoda'}</li>
                    <li>Texto: {visualPrefs.fontSize === 'xlarge' ? 'Muy grande' : visualPrefs.fontSize}</li>
                    <li>Ultimo acceso: {formatDateTime(lastSignInAt)}</li>
                  </ul>
                </div>
              </div>
            ) : null}

            {activeSection === 'apariencia' ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tema</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: 'dark', label: 'Oscuro' },
                      { id: 'light', label: 'Claro' },
                      { id: 'system', label: 'Automatico' },
                    ].map((option) => (
                      <OptionButton
                        key={option.id}
                        active={visualPrefs.theme === option.id}
                        onClick={() => setVisualPrefs((prev) => ({ ...prev, theme: option.id }))}
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Densidad</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: DENSITY_COMPACT, label: 'Compacta' },
                      { id: DENSITY_COMFORT, label: 'Comoda' },
                    ].map((option) => (
                      <OptionButton
                        key={option.id}
                        active={visualPrefs.density === option.id}
                        onClick={() => setVisualPrefs((prev) => ({ ...prev, density: option.id }))}
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tamano de texto</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: 'normal', label: 'Normal' },
                      { id: 'large', label: 'Grande' },
                      { id: 'xlarge', label: 'Muy grande' },
                    ].map((option) => (
                      <OptionButton
                        key={option.id}
                        active={visualPrefs.fontSize === option.id}
                        onClick={() => setVisualPrefs((prev) => ({ ...prev, fontSize: option.id }))}
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === 'accesibilidad' ? (
              <div className="space-y-4">
                <ToggleRow
                  title="Contraste alto"
                  description="Mejora separacion entre texto y fondos."
                  value={visualPrefs.highContrast}
                  onToggle={() =>
                    setVisualPrefs((prev) => ({ ...prev, highContrast: !prev.highContrast }))
                  }
                />
                <ToggleRow
                  title="Reducir animaciones"
                  description="Disminuye transiciones para una lectura mas estable."
                  value={visualPrefs.reduceMotion}
                  onToggle={() =>
                    setVisualPrefs((prev) => ({ ...prev, reduceMotion: !prev.reduceMotion }))
                  }
                />
              </div>
            ) : null}

            {activeSection === 'notificaciones' ? (
              <div className="space-y-4">
                <ToggleRow
                  title="Alertas de monitoreos por vencer"
                  description="Avisos para monitoreos con fechas proximas."
                  value={notificationPrefs.monitoringDue}
                  onToggle={() =>
                    setNotificationPrefs((prev) => ({
                      ...prev,
                      monitoringDue: !prev.monitoringDue,
                    }))
                  }
                />
                <ToggleRow
                  title="Alertas del sistema"
                  description="Mensajes relevantes de estado y operacion."
                  value={notificationPrefs.systemAlerts}
                  onToggle={() =>
                    setNotificationPrefs((prev) => ({
                      ...prev,
                      systemAlerts: !prev.systemAlerts,
                    }))
                  }
                />
                <ToggleRow
                  title="Recordatorios de agenda"
                  description="Recordatorios de eventos y seguimiento."
                  value={notificationPrefs.agendaReminders}
                  onToggle={() =>
                    setNotificationPrefs((prev) => ({
                      ...prev,
                      agendaReminders: !prev.agendaReminders,
                    }))
                  }
                />
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Canal preferido</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: 'system', label: 'En sistema' },
                      { id: 'email', label: 'Correo' },
                    ].map((option) => (
                      <OptionButton
                        key={option.id}
                        active={notificationPrefs.channel === option.id}
                        onClick={() =>
                          setNotificationPrefs((prev) => ({ ...prev, channel: option.id }))
                        }
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === 'cuenta' ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    id="firstName"
                    label="Nombres"
                    value={profile.firstName}
                    onChange={(event) => handleFieldChange('firstName', event.target.value)}
                    placeholder="Nombres"
                  />
                  <Input
                    id="lastName"
                    label="Apellidos"
                    value={profile.lastName}
                    onChange={(event) => handleFieldChange('lastName', event.target.value)}
                    placeholder="Apellidos"
                  />
                  <Input id="correo" label="Correo institucional" value={profile.email || auth?.email || ''} disabled />
                  <Input id="rol" label="Rol" value={roleLabel} disabled />
                </div>

                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Foto de perfil</p>
                  <div className="mt-4 flex flex-wrap items-center gap-5">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800 text-lg font-semibold text-slate-200">
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
                      ) : (
                        <span>{avatarInitials || 'U'}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl border border-slate-700/70 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500">
                          Subir o cambiar foto
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={handlePhotoChange}
                          />
                        </label>
                        {profile.avatarUrl ? (
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-500/35 px-4 text-xs font-semibold text-amber-200 transition hover:border-amber-400/70"
                          >
                            Eliminar foto
                          </button>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-400">
                        Recomendado: imagen cuadrada 512x512. Formatos JPG, PNG o WEBP (maximo 3MB).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === 'seguridad' ? (
              <div className="space-y-5">
                <form onSubmit={handlePasswordSubmit} className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Cambiar contrasena</p>
                  <Input
                    id="currentPassword"
                    label="Contrasena actual"
                    type="password"
                    autoComplete="current-password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                    }
                    placeholder="********"
                  />
                  <Input
                    id="newPassword"
                    label="Nueva contrasena"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
                    }
                    placeholder="********"
                  />
                  <Input
                    id="confirmPassword"
                    label="Confirmar nueva contrasena"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    placeholder="********"
                  />
                  {passwordError ? <p className="text-sm text-rose-400">{passwordError}</p> : null}
                  {passwordSuccess ? <p className="text-sm text-emerald-300">{passwordSuccess}</p> : null}
                  <button
                    type="submit"
                    disabled={isSavingPassword}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-100 px-5 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSavingPassword ? <Loader2 size={15} className="mr-2 animate-spin" /> : null}
                    {isSavingPassword ? 'Actualizando...' : 'Actualizar contrasena'}
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Sesiones activas</p>
                  <p className="mt-2 text-sm text-slate-300">Ultimo inicio de sesion: {formatDateTime(lastSignInAt)}</p>
                  <button
                    type="button"
                    onClick={handleCloseOtherSessions}
                    disabled={isClosingOtherSessions}
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-xl border border-slate-700/70 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isClosingOtherSessions ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
                    Cerrar sesion en otros dispositivos
                  </button>
                  {otherSessionsMessage ? <p className="mt-2 text-xs text-slate-300">{otherSessionsMessage}</p> : null}
                </div>
              </div>
            ) : null}

            {activeSection === 'asistente' ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Modo de conversacion</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: ASSISTANT_MODE_TEMPORARY, label: 'Temporal' },
                      { id: ASSISTANT_MODE_PERSISTENT, label: 'Persistente' },
                    ].map((option) => (
                      <OptionButton
                        key={option.id}
                        active={assistantPrefs.mode === option.id}
                        onClick={() => setAssistantPrefs((prev) => ({ ...prev, mode: option.id }))}
                        label={option.label}
                      />
                    ))}
                  </div>
                </div>
                <ToggleRow
                  title="Mostrar sugerencias rapidas"
                  description="Muestra chips de accion rapida en el composer del chatbot."
                  value={assistantPrefs.showQuickSuggestions}
                  onToggle={() =>
                    setAssistantPrefs((prev) => ({
                      ...prev,
                      showQuickSuggestions: !prev.showQuickSuggestions,
                    }))
                  }
                />
                <ToggleRow
                  title="Cerrar al hacer clic fuera"
                  description="Permite cierre automatico del panel del asistente al hacer clic fuera."
                  value={assistantPrefs.closeOnOutside}
                  onToggle={() =>
                    setAssistantPrefs((prev) => ({
                      ...prev,
                      closeOnOutside: !prev.closeOnOutside,
                    }))
                  }
                />
                <ToggleRow
                  title="Limpiar conversacion al cerrar sesion"
                  description="Borra el historial local al salir de la cuenta."
                  value={assistantPrefs.clearOnLogout}
                  onToggle={() =>
                    setAssistantPrefs((prev) => ({
                      ...prev,
                      clearOnLogout: !prev.clearOnLogout,
                    }))
                  }
                />
              </div>
            ) : null}

            {activeSection === 'sistema' && isAdmin ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Administracion</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Gestiona usuarios, roles y operacion del sistema desde el modulo administrativo.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/monitoreo/usuarios')}
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-xl border border-slate-700/70 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Ir a gestion de usuarios
                  </button>
                </div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/55 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Estado</p>
                  <p className="mt-2 text-sm text-slate-300">Rol actual: {roleLabel}</p>
                  <p className="mt-1 text-xs text-slate-400">ID usuario: {profile.id || 'No disponible'}</p>
                </div>
              </div>
            ) : null}

            {profileError ? <p className="text-sm text-rose-400">{profileError}</p> : null}
            {profileSuccess ? <p className="text-sm text-emerald-300">{profileSuccess}</p> : null}
          </Card>

          <div className="sticky bottom-3 z-20 rounded-2xl border border-slate-800/70 bg-slate-950/88 p-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={!hasUnsavedChanges || isSavingAll}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingAll ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Save size={15} className="mr-2" />}
                {isSavingAll ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={handleCancelChanges}
                disabled={!hasUnsavedChanges || isSavingAll}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700/70 px-4 text-sm font-semibold text-slate-300 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar cambios
              </button>
              <button
                type="button"
                onClick={handleResetVisualDraft}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700/70 px-4 text-sm font-semibold text-slate-300 transition hover:border-slate-500"
              >
                <RefreshCw size={15} className="mr-2" />
                Restablecer preferencias visuales
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showUnsavedModal}
        tone="warning"
        title="Cambios sin guardar"
        description="Tienes cambios sin guardar."
        details="Si sales ahora, se perderan."
        confirmText="Salir sin guardar"
        cancelText="Seguir editando"
        onCancel={() => {
          nextLocationRef.current = '';
          setShowUnsavedModal(false);
        }}
        onConfirm={() => {
          const target = nextLocationRef.current;
          setShowUnsavedModal(false);
          nextLocationRef.current = '';
          if (target) window.location.href = target;
        }}
      />
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </div>
  );
}
