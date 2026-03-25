import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck, Loader2, Lock } from 'lucide-react';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';
const SESSION_LOGOUT_REASON_KEY = 'monitoreoSessionLogoutReason';
const SESSION_LOGOUT_REASON_INACTIVITY = 'inactivity';
const EMAIL_DOMAIN_OPTIONS = ['ugel.gob.pe', 'gmail.com', 'outlook.com', 'hotmail.com'];

const getStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
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

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('especialista');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    emailUser: '',
    emailDomain: 'ugel.gob.pe',
    emailDomainCustom: '',
    password: '',
    docType: 'DNI',
    docNumber: '',
  });
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isRecoveryStatusLoading, setIsRecoveryStatusLoading] = useState(false);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState({
    activeAdmins: null,
    loginCapableAdmins: null,
    recoverable: false,
  });
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');
  const [recoveryForm, setRecoveryForm] = useState({
    email: '',
    password: '',
    code: '',
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.theme;
    root.dataset.theme = 'dark';

    return () => {
      try {
        const storedThemePreference = localStorage.getItem('monitoreoTheme') || root.dataset.themePreference || 'dark';
        root.dataset.theme = resolveEffectiveTheme(storedThemePreference);
      } catch {
        root.dataset.theme = previousTheme || 'dark';
      }
    };
  }, []);

  const isAdmin = role === 'admin';

  const accessSummary = useMemo(
    () => ({
      roleLabel: isAdmin ? 'Administrador' : 'Especialista',
      identityPlaceholder: form.docType === 'CORREO' ? (isAdmin ? 'usuario.admin' : 'nombre.apellido') : '',
    }),
    [form.docType, isAdmin],
  );

  const documentMaxLength = form.docType === 'DNI' ? 8 : form.docType === 'CE' ? 9 : 0;
  const remainingDocDigits =
    documentMaxLength > 0 ? Math.max(documentMaxLength - String(form.docNumber || '').length, 0) : 0;
  const shouldShowRemainingDigits = documentMaxLength > 0 && String(form.docNumber || '').length > 0 && remainingDocDigits > 0;
  const accessTypeGuide = useMemo(() => {
    if (form.docType === 'DNI') {
      if (shouldShowRemainingDigits) {
        return `Faltan ${remainingDocDigits} digito${remainingDocDigits === 1 ? '' : 's'} para completar tu DNI.`;
      }
      return 'Ingresa los 8 digitos de tu DNI.';
    }
    if (form.docType === 'CE') {
      if (shouldShowRemainingDigits) {
        return `Faltan ${remainingDocDigits} digito${remainingDocDigits === 1 ? '' : 's'} para completar tu CE.`;
      }
      return 'Ingresa los 9 digitos de tu carne de extranjeria.';
    }
    return 'Ingresa tu usuario y selecciona tu dominio institucional.';
  }, [form.docType, remainingDocDigits, shouldShowRemainingDigits]);
  const documentPlaceholder = form.docType === 'DNI' ? 'Ej. 12345678' : form.docType === 'CE' ? 'Ej. 123456789' : '';

  const parseEmailForFormState = (rawEmail) => {
    const email = String(rawEmail || '').trim().toLowerCase();
    const [userPart = '', domainPart = ''] = email.split('@');
    if (!domainPart) {
      return {
        emailUser: userPart,
        emailDomain: 'ugel.gob.pe',
        emailDomainCustom: '',
      };
    }
    if (EMAIL_DOMAIN_OPTIONS.includes(domainPart)) {
      return {
        emailUser: userPart,
        emailDomain: domainPart,
        emailDomainCustom: '',
      };
    }
    return {
      emailUser: userPart,
      emailDomain: 'otro',
      emailDomainCustom: domainPart,
    };
  };

  const buildEmailFromForm = () => {
    const user = String(form.emailUser || '').trim().toLowerCase();
    const selectedDomain = String(form.emailDomain || '').trim().toLowerCase();
    const customDomain = String(form.emailDomainCustom || '').trim().toLowerCase();
    const domain = selectedDomain === 'otro' ? customDomain : selectedDomain;
    if (!user || !domain) {
      return '';
    }
    const normalizedDomain = domain.startsWith('@') ? domain.slice(1) : domain;
    return `${user}@${normalizedDomain}`;
  };

  const handleDocTypeChange = (nextDocType) => {
    setForm((prev) => {
      const nextMaxLength = nextDocType === 'DNI' ? 8 : nextDocType === 'CE' ? 9 : 0;
      const sanitizedDoc =
        nextDocType === 'CORREO'
          ? ''
          : String(prev.docNumber || '')
              .replace(/\D/g, '')
              .slice(0, nextMaxLength);
      return {
        ...prev,
        docType: nextDocType,
        docNumber: sanitizedDoc,
      };
    });
  };

  const handleDocNumberChange = (nextValue) => {
    const numeric = String(nextValue || '').replace(/\D/g, '');
    const maxLen = form.docType === 'DNI' ? 8 : form.docType === 'CE' ? 9 : 16;
    setForm((prev) => ({
      ...prev,
      docNumber: numeric.slice(0, maxLen),
    }));
  };

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored?.role) {
      navigate('/monitoreo/inicio', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const reason = localStorage.getItem(SESSION_LOGOUT_REASON_KEY);
    if (reason === SESSION_LOGOUT_REASON_INACTIVITY) {
      setSessionNotice('Tu sesion se cerro automaticamente tras 30 minutos de inactividad.');
    }
    localStorage.removeItem(SESSION_LOGOUT_REASON_KEY);
  }, []);

  const resolveLoginEmail = async () => {
    const loginInput = form.docType === 'CORREO' ? buildEmailFromForm() : form.docNumber.trim();

    if (!loginInput) {
      return { email: '', error: 'Completa el dato de acceso.' };
    }

    if (form.docType === 'CORREO') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginInput)) {
        return { email: '', error: 'Ingresa un correo valido.' };
      }
      return { email: loginInput.toLowerCase(), error: '' };
    }

    if (form.docType === 'DNI' && !/^\d{8}$/.test(loginInput)) {
      return { email: '', error: 'El DNI debe tener 8 digitos.' };
    }

    if (form.docType === 'CE' && !/^\d{9}$/.test(loginInput)) {
      return { email: '', error: 'El CE debe tener 9 digitos.' };
    }

    const { data: lookupData, error: lookupError } = await supabase.functions.invoke('auth-lookup', {
      body: { doc_type: form.docType, doc_number: loginInput },
    });

    if (lookupError) {
      return { email: '', error: 'No se pudo validar el documento. Intenta nuevamente.' };
    }

    if (lookupData?.error) {
      return { email: '', error: String(lookupData.error) };
    }

    if (!lookupData?.email) {
      return { email: '', error: 'No existe un usuario activo con ese documento.' };
    }

    return { email: lookupData.email, error: '' };
  };

  const loadRecoveryStatus = async () => {
    if (!isSupabaseConfigured) {
      setRecoveryError('Supabase no esta configurado en este entorno.');
      return;
    }

    setRecoveryError('');
    setRecoverySuccess('');
    setIsRecoveryStatusLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-recovery', {
        body: { action: 'status' },
      });
      if (fnError) {
        setRecoveryError('No se pudo validar el estado de recuperacion.');
        return;
      }
      const activeAdmins = Number(data?.activeAdmins || 0);
      const loginCapableAdmins = Number(
        data?.loginCapableAdmins !== undefined ? data?.loginCapableAdmins : data?.activeAdmins || 0,
      );
      setRecoveryStatus({
        activeAdmins,
        loginCapableAdmins,
        recoverable: Boolean(data?.recoverable),
      });
    } finally {
      setIsRecoveryStatusLoading(false);
    }
  };

  const openRecoveryModal = async () => {
    setIsRecoveryOpen(true);
    setRecoveryError('');
    setRecoverySuccess('');
    await loadRecoveryStatus();
  };

  const closeRecoveryModal = () => {
    setIsRecoveryOpen(false);
    setRecoveryError('');
    setRecoverySuccess('');
    setRecoveryForm({ email: '', password: '', code: '' });
  };

  const handleRecoverySubmit = async (event) => {
    event.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');

    if (!recoveryStatus.recoverable) {
      setRecoveryError('La recuperacion solo se habilita cuando no hay administradores con acceso.');
      return;
    }

    const email = recoveryForm.email.trim().toLowerCase();
    const password = recoveryForm.password;
    const code = recoveryForm.code.trim();

    if (!email || !email.includes('@')) {
      setRecoveryError('Ingresa un correo valido.');
      return;
    }
    if (!password || password.length < 6) {
      setRecoveryError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (!code) {
      setRecoveryError('Ingresa el codigo de recuperacion.');
      return;
    }

    setIsRecoverySubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-recovery', {
        body: {
          action: 'recover',
          email,
          password,
          code,
        },
      });

      if (fnError || !data?.success) {
        const message = data?.error || 'No se pudo recuperar el acceso admin.';
        setRecoveryError(message);
        await loadRecoveryStatus();
        return;
      }

      const requiresEmailVerification = Boolean(data?.requiresEmailVerification);
      setRecoverySuccess(
        requiresEmailVerification
          ? 'Cuenta admin creada/actualizada. Revisa tu correo y verifica la cuenta antes de iniciar sesion.'
          : 'Acceso admin recuperado. Ahora inicia sesion con el correo recuperado.',
      );
      setRole('admin');
      const parsedEmail = parseEmailForFormState(email);
      setForm((prev) => ({
        ...prev,
        docType: 'CORREO',
        emailUser: parsedEmail.emailUser,
        emailDomain: parsedEmail.emailDomain,
        emailDomainCustom: parsedEmail.emailDomainCustom,
        password,
        docNumber: '',
      }));
      await loadRecoveryStatus();
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    if (!isSupabaseConfigured) {
      setError('Falta configurar Supabase en este entorno. Revisa variables de Vercel.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { email, error: lookupMessage } = await resolveLoginEmail();
      if (lookupMessage) {
        setError(lookupMessage);
        return;
      }

      if (!email || !form.password.trim()) {
        setError('Completa los datos para iniciar sesion.');
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: form.password.trim(),
      });

      if (authError || !data?.user) {
        const authMessage = String(authError?.message || '').toLowerCase();
        if (authMessage.includes('email not confirmed') || authMessage.includes('email_not_confirmed')) {
          setError('Debes verificar tu correo antes de iniciar sesion.');
          return;
        }
        setError('Credenciales incorrectas o usuario no habilitado.');
        return;
      }

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        if (profileError) {
          // eslint-disable-next-line no-console
          console.error('Profile select error', profileError);
        }
        const fallbackProfile = {
          id: data.user.id,
          email: data.user.email,
          first_name: data.user.user_metadata?.first_name || '',
          last_name: data.user.user_metadata?.last_name || '',
          full_name:
            data.user.user_metadata?.full_name ||
            `${data.user.user_metadata?.first_name || ''} ${data.user.user_metadata?.last_name || ''}`.trim(),
          role: data.user.app_metadata?.role || 'user',
          status: 'active',
          doc_type: data.user.user_metadata?.doc_type || null,
          doc_number: data.user.user_metadata?.doc_number || null,
        };
        const { error: insertError } = await supabase.from('profiles').insert([fallbackProfile]);
        if (insertError) {
          // eslint-disable-next-line no-console
          console.error('Profile insert error', insertError);
          setError('No se pudo inicializar el perfil del usuario.');
          return;
        }
        const { data: retryProfile, error: retryError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();
        if (retryError) {
          setError('No se pudo cargar el perfil del usuario.');
          return;
        }
        profile = retryProfile;
      }

      const accountRole = String(profile?.role || data.user.app_metadata?.role || 'user').toLowerCase();
      const isAccountAdmin = accountRole === 'admin';
      const requestedAdminAccess = role === 'admin';

      if (requestedAdminAccess && !isAccountAdmin) {
        await supabase.auth.signOut();
        setError('Tu cuenta no tiene permisos de administrador. Ingresa por Especialista.');
        return;
      }

      const effectiveRole = requestedAdminAccess ? 'admin' : 'user';

      const payload = {
        role: effectiveRole,
        accountRole: isAccountAdmin ? 'admin' : 'user',
        accessMode: requestedAdminAccess ? 'admin' : 'especialista',
        email: profile?.email || data.user.email,
        docNumber: profile?.doc_number || form.docNumber.trim(),
        name: profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
      };
      localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
      localStorage.setItem('monitoreoProfile', JSON.stringify(profile || {}));
      navigate('/monitoreo/inicio', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-glow box-border min-h-dvh overflow-y-auto overscroll-contain px-4 py-2 md:py-3">
      <div className="login-viewport mx-auto flex min-h-[calc(100dvh-1rem)] max-w-[920px] justify-center md:min-h-[calc(100dvh-1.5rem)]">
        <div className="login-shell login-shell-enter w-full">
          <div className="login-shell-grid grid min-h-[430px] grid-cols-1 md:grid-cols-2 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="relative flex min-h-[210px] flex-col justify-center overflow-hidden bg-gradient-to-br from-slate-900/90 via-slate-950/80 to-slate-950/95 px-6 py-5 md:min-h-0 md:px-6 md:py-5">
              <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_45%_16%,rgba(56,189,248,0.22),transparent_54%),radial-gradient(circle_at_78%_82%,rgba(34,197,94,0.16),transparent_48%)]" />

              <div className="relative z-20 max-w-[27rem]">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">UGEL 06 - Lima</p>
                <p className="mt-1 text-xs text-slate-500">Sistema AGEBRE Monitoreo</p>
                <h1 className="mt-2 text-[24px] font-semibold leading-tight text-slate-100 md:text-[28px]">
                  Sistema de Monitoreo Educativo
                </h1>
                <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-300">
                  Gestion, seguimiento y control de monitoreos institucionales de forma centralizada y segura.
                </p>
              </div>

              <div className="relative z-20 mt-3 max-w-[25rem] space-y-1.5 text-[13px] text-slate-200 md:mt-3.5">
                {[
                  'Seguimiento de monitoreos en tiempo real',
                  'Control de reportes y cumplimiento',
                  'Gestion por especialistas y administradores',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <CircleCheck size={15} className="mt-0.5 text-emerald-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-slate-950/35 via-transparent to-slate-950/8" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-slate-950/75 via-slate-950/18 to-transparent" />
            </section>

            <section className="login-shell-section-right h-full px-6 py-5 md:px-6 md:py-5">
              <div className="space-y-1.5">
                <p className="text-[24px] font-semibold leading-tight text-slate-100">Inicio de sesion</p>
                <p className="text-sm text-slate-400">Accede con tus credenciales para ingresar al sistema.</p>
              </div>

              <div className="mt-4 space-y-1.5 rounded-xl border border-slate-800/60 bg-slate-900/50 p-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-slate-400">
                  Selecciona tu tipo de acceso
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setRole('especialista')}
                    disabled={isSubmitting}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                      role === 'especialista'
                        ? 'border-cyan-400/45 bg-cyan-500/10 text-cyan-100'
                        : 'border-slate-700/55 bg-slate-900/60 text-slate-300 hover:border-slate-600/80'
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${role === 'especialista' ? 'bg-cyan-300' : 'bg-slate-600'}`}
                    />
                    Especialista
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    disabled={isSubmitting}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                      role === 'admin'
                        ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100'
                        : 'border-slate-700/55 bg-slate-900/60 text-slate-300 hover:border-slate-600/80'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${role === 'admin' ? 'bg-emerald-300' : 'bg-slate-600'}`} />
                    Administrador
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
                <div
                  key={`access-${form.docType}`}
                  className="login-access-variant space-y-2.5"
                >
                  <div className={`grid gap-3 ${form.docType === 'CORREO' ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
                  <Select
                    id="docType"
                    label="Tipo de acceso"
                    className="h-10 text-[15px]"
                    value={form.docType}
                    disabled={isSubmitting}
                    onChange={(event) => handleDocTypeChange(event.target.value)}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CE">CE</option>
                    <option value="CORREO">Correo institucional</option>
                  </Select>
                  {form.docType === 'CORREO' ? (
                    <div className="grid gap-3 sm:grid-cols-[1fr_0.85fr]">
                      <Input
                        id="emailUser"
                        label="Usuario de correo"
                        type="text"
                        autoComplete="username"
                        className="h-10 text-[15px]"
                        placeholder={accessSummary.identityPlaceholder}
                        value={form.emailUser}
                        disabled={isSubmitting}
                        onChange={(event) => setForm((prev) => ({ ...prev, emailUser: event.target.value }))}
                      />
                      <Select
                        id="emailDomain"
                        label="Dominio"
                        className="h-10 text-[15px]"
                        value={form.emailDomain}
                        disabled={isSubmitting}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            emailDomain: event.target.value,
                            emailDomainCustom: event.target.value === 'otro' ? prev.emailDomainCustom : '',
                          }))
                        }
                      >
                        {EMAIL_DOMAIN_OPTIONS.map((domain) => (
                          <option key={domain} value={domain}>
                            @{domain}
                          </option>
                        ))}
                        <option value="otro">Otro dominio</option>
                      </Select>
                    </div>
                  ) : (
                    <Input
                      id="docNumber"
                      className="h-10 text-[15px]"
                      label="Numero de documento"
                      placeholder={documentPlaceholder}
                      value={form.docNumber}
                      inputMode="numeric"
                      maxLength={documentMaxLength || undefined}
                      disabled={isSubmitting}
                      onChange={(event) => handleDocNumberChange(event.target.value)}
                    />
                  )}
                  </div>
                  {form.docType === 'CORREO' && form.emailDomain === 'otro' ? (
                    <Input
                      id="emailDomainCustom"
                      label="Dominio personalizado"
                      type="text"
                      className="h-10 text-[15px]"
                      placeholder="dominio.org"
                      value={form.emailDomainCustom}
                      disabled={isSubmitting}
                      onChange={(event) => setForm((prev) => ({ ...prev, emailDomainCustom: event.target.value }))}
                    />
                  ) : null}
                  <p className={`text-xs leading-5 ${form.docType === 'CORREO' ? 'text-slate-400' : shouldShowRemainingDigits ? 'text-amber-200' : 'text-slate-400'}`}>
                    {accessTypeGuide}
                  </p>
                </div>

                <label className="flex flex-col gap-1.5 text-sm text-slate-200" htmlFor="password">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Contrasena</span>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={form.password}
                      disabled={isSubmitting}
                      onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                      className="h-10 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 pr-12 text-[15px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/65 focus:outline-none focus:ring-1 focus:ring-cyan-500/15"
                      placeholder="********"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={isSubmitting}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 transition hover:text-slate-300"
                    >
                      {showPassword ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={!isSupabaseConfigured || isSubmitting}
                  className="mt-0.5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 py-2 text-sm font-semibold text-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.2)] transition-all duration-200 hover:border-emerald-300 hover:bg-emerald-500/30 hover:shadow-[0_10px_24px_rgba(16,185,129,0.24)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Iniciando sesion...
                    </>
                  ) : (
                    'Iniciar sesion'
                  )}
                </button>
                <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Lock size={12} className="text-slate-500" />
                  <span>Acceso seguro. Solo personal autorizado.</span>
                </p>
                {isSubmitting ? (
                  <div className="space-y-1" aria-live="polite">
                    <div className="h-1.5 overflow-hidden rounded-full border border-cyan-500/35 bg-slate-900/80">
                      <span className="login-progress-sweep block h-full w-1/3 rounded-full bg-gradient-to-r from-cyan-300/70 via-sky-300/80 to-emerald-300/70" />
                    </div>
                    <p className="text-xs text-cyan-200/90">Validando credenciales y cargando tu panel...</p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={openRecoveryModal}
                  disabled={isSubmitting}
                  className="w-fit self-start text-xs font-medium text-slate-400 underline-offset-4 transition hover:text-cyan-200 hover:underline"
                >
                  Eres administrador? Recuperar acceso
                </button>
                <p className="text-xs text-slate-500">Problemas para acceder? Contacta al administrador.</p>
                {!isSupabaseConfigured ? (
                  <p className="text-xs text-amber-300">
                    Configura en Vercel: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
                  </p>
                ) : null}
                {sessionNotice ? <p className="text-sm text-amber-200">{sessionNotice}</p> : null}
                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              </form>
            </section>
          </div>
        </div>
      </div>

      {isRecoveryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={closeRecoveryModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-100">Recuperar acceso admin</p>
              <button
                type="button"
                onClick={closeRecoveryModal}
                className="rounded-lg border border-slate-700/60 px-2 py-1 text-xs text-slate-300"
              >
                Cerrar
              </button>
            </div>

            {isRecoveryStatusLoading ? (
              <p className="mt-4 text-sm text-slate-400">Validando estado...</p>
            ) : (
              <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/60 px-3 py-2">
                <p className="text-xs text-slate-300">
                  Admins en perfil (activos): {recoveryStatus.activeAdmins ?? 'No registrado'}
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Admins con acceso (login): {recoveryStatus.loginCapableAdmins ?? 'No registrado'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {recoveryStatus.recoverable
                    ? 'Recuperacion habilitada: no hay administradores con acceso.'
                    : 'Recuperacion bloqueada: existe al menos un administrador con acceso.'}
                </p>
              </div>
            )}

            <form onSubmit={handleRecoverySubmit} className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Correo admin
                <input
                  type="email"
                  value={recoveryForm.email}
                  onChange={(event) => setRecoveryForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="h-9 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  placeholder="admin@dominio.com"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Nueva contrasena
                <input
                  type="password"
                  value={recoveryForm.password}
                  onChange={(event) => setRecoveryForm((prev) => ({ ...prev, password: event.target.value }))}
                  className="h-9 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  placeholder="Min. 6 caracteres"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Codigo de recuperacion
                <input
                  type="password"
                  value={recoveryForm.code}
                  onChange={(event) => setRecoveryForm((prev) => ({ ...prev, code: event.target.value }))}
                  className="h-9 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  placeholder="Codigo secreto"
                />
              </label>

              <button
                type="submit"
                disabled={isRecoverySubmitting || isRecoveryStatusLoading || !recoveryStatus.recoverable}
                className="w-full rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRecoverySubmitting ? 'Recuperando...' : 'Recuperar admin'}
              </button>
            </form>

            {recoveryError ? <p className="mt-3 text-xs text-rose-400">{recoveryError}</p> : null}
            {recoverySuccess ? <p className="mt-3 text-xs text-emerald-300">{recoverySuccess}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
