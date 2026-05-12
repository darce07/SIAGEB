import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Loader2,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';
const PROFILE_KEY = 'monitoreoProfile';
const LOGIN_EVENT_AT_KEY = 'monitoreoLoginEventAt';
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
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false);
  const [isPasswordResetSubmitting, setIsPasswordResetSubmitting] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState('');
  const [passwordResetForm, setPasswordResetForm] = useState({
    password: '',
    confirmPassword: '',
  });
  const [loginTheme, setLoginTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const storedPreference = localStorage.getItem('monitoreoTheme') || 'light';
    return resolveEffectiveTheme(storedPreference);
  });
  const isDarkTheme = loginTheme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = loginTheme;
    document.documentElement.classList.toggle('dark', loginTheme === 'dark');
  }, [loginTheme]);

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
    let active = true;

    const validateStoredAccess = async () => {
      const stored = getStoredAuth();
      if (!stored?.role) return;

      const { data, error } = await supabase.auth.getSession();
      const session = data?.session || null;
      if (error || !session?.access_token) {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(PROFILE_KEY);
        return;
      }

      if (active) {
        navigate('/monitoreo/inicio', { replace: true });
      }
    };

    validateStoredAccess();

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const reason = localStorage.getItem(SESSION_LOGOUT_REASON_KEY);
    if (reason === SESSION_LOGOUT_REASON_INACTIVITY) {
      setSessionNotice('Tu sesion se cerro automaticamente tras 40 minutos de inactividad.');
    }
    localStorage.removeItem(SESSION_LOGOUT_REASON_KEY);
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryOpen(false);
        setIsPasswordResetOpen(true);
        setPasswordResetError('');
        setPasswordResetSuccess('');
      }
    });

    const openFromRecoveryLink = async () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('recovery') !== '1') return;
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        setIsRecoveryOpen(false);
        setIsPasswordResetOpen(true);
      }
    };

    openFromRecoveryLink();

    return () => {
      data?.subscription?.unsubscribe?.();
    };
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

  const openRecoveryModal = () => {
    const emailFromLogin = form.docType === 'CORREO' ? buildEmailFromForm() : '';
    setIsRecoveryOpen(true);
    setRecoveryError('');
    setRecoverySuccess('');
    setRecoveryEmail((current) => current || emailFromLogin);
  };

  const closeRecoveryModal = () => {
    setIsRecoveryOpen(false);
    setRecoveryError('');
    setRecoverySuccess('');
  };

  const handleRecoverySubmit = async (event) => {
    event.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');

    if (!isSupabaseConfigured) {
      setRecoveryError('Supabase no esta configurado en este entorno.');
      return;
    }

    const email = recoveryEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setRecoveryError('Ingresa un correo valido.');
      return;
    }

    setIsRecoverySubmitting(true);
    try {
      const { data: lookupData, error: lookupError } = await supabase.functions.invoke('auth-lookup', {
        body: { email },
      });

      if (lookupError) {
        setRecoveryError('No se pudo validar el correo. Intenta nuevamente.');
        return;
      }
      if (lookupData?.error || !lookupData?.email) {
        setRecoveryError(String(lookupData?.error || 'No existe un usuario activo con ese correo.'));
        return;
      }

      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/login?recovery=1` : undefined;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(lookupData.email, {
        redirectTo,
      });

      if (resetError) {
        setRecoveryError(
          resetError.message || 'No se pudo enviar el enlace de recuperacion. Verifica el correo e intenta nuevamente.',
        );
        return;
      }

      setRecoverySuccess(
        'Solicitud enviada. Si el correo no llega en unos minutos, revisa la configuracion SMTP de Supabase Auth.',
      );
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  const closePasswordResetModal = async () => {
    setIsPasswordResetOpen(false);
    setPasswordResetError('');
    setPasswordResetSuccess('');
    setPasswordResetForm({ password: '', confirmPassword: '' });
    await supabase.auth.signOut();
  };

  const handlePasswordResetSubmit = async (event) => {
    event.preventDefault();
    setPasswordResetError('');
    setPasswordResetSuccess('');

    if (passwordResetForm.password.length < 8) {
      setPasswordResetError('La nueva contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordResetForm.password !== passwordResetForm.confirmPassword) {
      setPasswordResetError('Las contrasenas no coinciden.');
      return;
    }

    setIsPasswordResetSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordResetForm.password,
      });
      if (updateError) {
        setPasswordResetError('No se pudo actualizar la contrasena. Solicita un nuevo enlace.');
        return;
      }
      setPasswordResetSuccess('Contrasena actualizada. Ya puedes iniciar sesion con tu nueva clave.');
      setForm((prev) => ({ ...prev, password: '' }));
      setTimeout(() => {
        closePasswordResetModal();
      }, 1800);
    } finally {
      setIsPasswordResetSubmitting(false);
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

      const effectiveRole = requestedAdminAccess ? 'admin' : accountRole || 'user';

      const payload = {
        role: effectiveRole,
        accountRole: accountRole || 'user',
        accessMode: requestedAdminAccess ? 'admin' : 'especialista',
        email: profile?.email || data.user.email,
        docNumber: profile?.doc_number || form.docNumber.trim(),
        id: profile?.id || data.user.id || '',
        name: profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
      };
      localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
      localStorage.setItem('monitoreoProfile', JSON.stringify(profile || {}));
      localStorage.setItem(LOGIN_EVENT_AT_KEY, String(Date.now()));
      navigate('/monitoreo/inicio', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTheme = () => {
    setLoginTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('monitoreoTheme', next);
      return next;
    });
  };

  return (
    <div
      className={`min-h-dvh px-4 py-6 text-slate-800 transition-colors duration-300 md:py-8 ${
        isDarkTheme ? 'bg-slate-900 text-slate-100' : 'bg-[#f1f5f9] text-slate-800'
      }`}
    >
      <button
        type="button"
        onClick={toggleTheme}
        className={`fixed right-6 top-6 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition hover:scale-105 ${
          isDarkTheme
            ? 'border-slate-600 bg-slate-800 text-amber-300'
            : 'border-slate-200 bg-white text-slate-600'
        }`}
        aria-label="Cambiar tema"
      >
        {loginTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[980px] items-center justify-center">
        <div
          className={`w-full overflow-hidden rounded-[22px] border shadow-[0_22px_55px_rgba(15,23,42,0.14)] transition-colors duration-300 ${
            isDarkTheme ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-2">
            <section className="relative hidden overflow-hidden bg-gradient-to-br from-teal-500 via-teal-600 to-teal-800 px-10 py-8 text-white md:flex md:flex-col md:justify-between">
              <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
              <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />

              <div className="relative z-10">
                <div className="mb-8 flex items-center gap-3">
                  <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-md">
                    <LayoutDashboard size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-50/90">UGEL 06 - LIMA</p>
                    <p className="text-sm text-teal-50/90">Sistema AGEBRE</p>
                  </div>
                </div>

                <h1 className="text-[46px] font-extrabold leading-[1.08] tracking-[-0.02em]">Sistema de Monitoreo Educativo</h1>
                <p className="mt-4 text-base leading-relaxed text-teal-50/90">
                  Gestión, seguimiento y control de monitoreos institucionales de forma centralizada y segura.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-white/20 p-2">
                      <CheckCircle2 size={16} />
                    </div>
                    <span className="text-sm font-medium">Seguimiento en tiempo real</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-white/20 p-2">
                      <LayoutDashboard size={16} />
                    </div>
                    <span className="text-sm font-medium">Control de reportes y cumplimiento</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-white/20 p-2">
                      <Users size={16} />
                    </div>
                    <span className="text-sm font-medium">Gestión por especialistas</span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 space-y-1 border-t border-white/20 pt-6 text-[11px] leading-5 text-teal-50/80">
                <div>
                  <p>Creadores:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>Ing. Diego Arce Muñoz</li>
                    <li>Ing. Alex Quispe Pillaca</li>
                  </ul>
                </div>
                <p>© 2026 Plataforma de Monitoreo Educativo - Dirección. Todos los derechos reservados.</p>
              </div>
            </section>

            <section
              className={`px-7 py-6 transition-colors duration-300 md:px-8 md:py-6 ${
                isDarkTheme ? 'bg-slate-800 text-slate-100' : 'bg-[#f8fafc] text-slate-800'
              }`}
            >
              <div className="mb-5">
                <h2 className={`text-[58px] font-extrabold leading-[0.95] tracking-[-0.025em] ${isDarkTheme ? 'text-slate-100' : 'text-slate-800'}`}>Bienvenido</h2>
                <p className={`mt-2 max-w-[320px] text-[16px] leading-6 ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>Ingresa tus credenciales para acceder al panel.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-3">
                  <p className={`text-sm font-semibold ${isDarkTheme ? 'text-slate-200' : 'text-slate-700'}`}>Tipo de Acceso</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('especialista')}
                      disabled={isSubmitting}
                      className={`rounded-2xl border-2 px-3 py-4 transition ${
                        role === 'especialista'
                          ? 'border-teal-600 bg-teal-50 text-teal-700'
                          : isDarkTheme
                            ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <BadgeCheck size={18} />
                        <span className="text-sm font-semibold">Especialista</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('admin')}
                      disabled={isSubmitting}
                      className={`rounded-2xl border-2 px-3 py-4 transition ${
                        role === 'admin'
                          ? 'border-teal-600 bg-teal-50 text-teal-700'
                          : isDarkTheme
                            ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Lock size={18} />
                        <span className="text-sm font-semibold">Administrador</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div key={`access-${form.docType}`} className="space-y-3">
                  <div className={`grid gap-3 ${form.docType === 'CORREO' ? 'grid-cols-1' : 'grid-cols-12'}`}>
                    <div className={form.docType === 'CORREO' ? '' : 'col-span-4'}>
                      <label htmlFor="docType" className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                        Documento
                      </label>
                      <select
                        id="docType"
                        className={`h-12 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                          isDarkTheme
                            ? 'border-slate-600 bg-slate-900 text-slate-100'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                        value={form.docType}
                        disabled={isSubmitting}
                        onChange={(event) => handleDocTypeChange(event.target.value)}
                      >
                        <option value="DNI">DNI</option>
                        <option value="CE">C.E.</option>
                        <option value="CORREO">Correo</option>
                      </select>
                    </div>

                    {form.docType === 'CORREO' ? (
                      <div className="grid gap-3 sm:grid-cols-[1fr_0.85fr]">
                        <div>
                          <label htmlFor="emailUser" className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                            Usuario
                          </label>
                          <input
                            id="emailUser"
                            type="text"
                            autoComplete="username"
                            className={`h-12 w-full rounded-xl border px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                              isDarkTheme
                                ? 'border-slate-600 bg-slate-900 text-slate-100'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                            placeholder={accessSummary.identityPlaceholder || 'nombre.apellido'}
                            value={form.emailUser}
                            disabled={isSubmitting}
                            onChange={(event) => setForm((prev) => ({ ...prev, emailUser: event.target.value }))}
                          />
                        </div>
                        <div>
                          <label htmlFor="emailDomain" className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                            Dominio
                          </label>
                          <select
                            id="emailDomain"
                            className={`h-12 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                              isDarkTheme
                                ? 'border-slate-600 bg-slate-900 text-slate-100'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
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
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-8">
                        <label htmlFor="docNumber" className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                          Número
                        </label>
                        <input
                          id="docNumber"
                          type="text"
                          className={`h-12 w-full rounded-xl border px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                            isDarkTheme
                              ? 'border-slate-600 bg-slate-900 text-slate-100'
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                          placeholder={documentPlaceholder || 'Ej. 12345678'}
                          value={form.docNumber}
                          inputMode="numeric"
                          maxLength={documentMaxLength || undefined}
                          disabled={isSubmitting}
                          onChange={(event) => handleDocNumberChange(event.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {form.docType === 'CORREO' && form.emailDomain === 'otro' ? (
                    <div>
                      <label htmlFor="emailDomainCustom" className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                        Dominio personalizado
                      </label>
                      <input
                        id="emailDomainCustom"
                        type="text"
                        className={`h-12 w-full rounded-xl border px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                          isDarkTheme
                            ? 'border-slate-600 bg-slate-900 text-slate-100'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                        placeholder="dominio.org"
                        value={form.emailDomainCustom}
                        disabled={isSubmitting}
                        onChange={(event) => setForm((prev) => ({ ...prev, emailDomainCustom: event.target.value }))}
                      />
                    </div>
                  ) : null}
                  <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{accessTypeGuide}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className={`text-[11px] font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={openRecoveryModal}
                      disabled={isSubmitting}
                      className={`text-xs font-semibold hover:underline ${isDarkTheme ? 'text-teal-300' : 'text-teal-700'}`}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={form.password}
                      disabled={isSubmitting}
                      onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                      className={`h-12 w-full rounded-xl border px-3 pr-11 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                        isDarkTheme
                          ? 'border-slate-600 bg-slate-900 text-slate-100'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={isSubmitting}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${isDarkTheme ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className={`inline-flex items-center gap-1 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Lock size={11} /> Usa una contraseña segura de al menos 8 caracteres.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!isSupabaseConfigured || isSubmitting}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition hover:-translate-y-0.5 hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Iniciando sesión...
                    </>
                  ) : (
                    <>
                      Iniciar Sesión
                      <LogIn size={16} />
                    </>
                  )}
                </button>

                <div className={`space-y-2 border-t pt-6 text-center ${isDarkTheme ? 'border-slate-700' : 'border-slate-200'}`}>
                  <p className={`mx-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${isDarkTheme ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'}`}>
                    <Lock size={12} className="text-emerald-600" /> Acceso seguro • Solo personal autorizado
                  </p>
                  <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    ¿Problemas para acceder?{' '}
                    <button
                      type="button"
                      onClick={openRecoveryModal}
                      disabled={isSubmitting}
                      className={`font-semibold hover:underline ${isDarkTheme ? 'text-teal-300' : 'text-teal-700'}`}
                    >
                      Contactar soporte
                    </button>
                  </p>
                </div>

                {!isSupabaseConfigured ? (
                  <p className="text-xs text-amber-700">
                    Configura en Vercel: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
                  </p>
                ) : null}
                {sessionNotice ? <p className="text-sm text-amber-700">{sessionNotice}</p> : null}
                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              </form>
            </section>
          </div>
        </div>
      </div>

      {isRecoveryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onClick={closeRecoveryModal}
        >
          <div
            className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${
              isDarkTheme ? 'border-[#5e503f]/70 bg-[#17242a] text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${isDarkTheme ? 'border-[#5e503f]/60' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${isDarkTheme ? 'bg-[#22333b] text-[#b5ca8d]' : 'bg-teal-50 text-teal-700'}`}>
                  <KeyRound size={20} />
                </span>
                <div>
                  <p className="text-base font-bold">Recuperar contraseña</p>
                  <p className={`text-xs ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>Enviaremos un enlace seguro a tu correo.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeRecoveryModal}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  isDarkTheme ? 'text-slate-300 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecoverySubmit} className="space-y-4 px-5 py-5">
              <div className={`rounded-xl border px-4 py-3 ${
                isDarkTheme ? 'border-[#5e503f]/60 bg-[#22333b]/70' : 'border-teal-100 bg-teal-50'
              }`}>
                <p className={`flex items-start gap-2 text-sm ${isDarkTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                  <ShieldCheck size={16} className={isDarkTheme ? 'mt-0.5 text-[#b5ca8d]' : 'mt-0.5 text-teal-700'} />
                  Por seguridad no mostramos si el correo existe. Si está registrado, recibirá el enlace de recuperación.
                </p>
              </div>

              <label className={`block text-xs font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                Correo institucional
              </label>
              <div className="relative">
                <Mail size={17} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  className={`h-11 w-full rounded-xl border pl-10 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                    isDarkTheme
                      ? 'border-[#5e503f]/80 bg-[#0a0908]/40 text-slate-100 placeholder:text-slate-500'
                      : 'border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400'
                  }`}
                  placeholder="usuario@ugel.gob.pe"
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={isRecoverySubmitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-bold text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isRecoverySubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando enlace...
                  </>
                ) : (
                  'Enviar enlace de recuperación'
                )}
              </button>

              {recoveryError ? <p className="text-sm text-rose-400">{recoveryError}</p> : null}
              {recoverySuccess ? <p className="text-sm text-emerald-300">{recoverySuccess}</p> : null}
            </form>
          </div>
        </div>
      ) : null}

      {isPasswordResetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${
              isDarkTheme ? 'border-[#5e503f]/70 bg-[#17242a] text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${isDarkTheme ? 'border-[#5e503f]/60' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${isDarkTheme ? 'bg-[#22333b] text-[#b5ca8d]' : 'bg-teal-50 text-teal-700'}`}>
                  <Lock size={20} />
                </span>
                <div>
                  <p className="text-base font-bold">Nueva contraseña</p>
                  <p className={`text-xs ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>Define una clave segura para continuar.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePasswordResetModal}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  isDarkTheme ? 'text-slate-300 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePasswordResetSubmit} className="space-y-4 px-5 py-5">
              <label className={`block text-xs font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                Nueva contraseña
              </label>
              <input
                type="password"
                value={passwordResetForm.password}
                onChange={(event) => setPasswordResetForm((prev) => ({ ...prev, password: event.target.value }))}
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                  isDarkTheme
                    ? 'border-[#5e503f]/80 bg-[#0a0908]/40 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400'
                }`}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />

              <label className={`block text-xs font-bold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={passwordResetForm.confirmPassword}
                onChange={(event) => setPasswordResetForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${
                  isDarkTheme
                    ? 'border-[#5e503f]/80 bg-[#0a0908]/40 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400'
                }`}
                placeholder="Repite la nueva contraseña"
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={isPasswordResetSubmitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-bold text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPasswordResetSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  'Actualizar contraseña'
                )}
              </button>

              {passwordResetError ? <p className="text-sm text-rose-400">{passwordResetError}</p> : null}
              {passwordResetSuccess ? <p className="text-sm text-emerald-300">{passwordResetSuccess}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
