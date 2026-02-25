import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import loginHeroIllustration from '../img/ilustration-hero-crop.png';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';
const SESSION_LOGOUT_REASON_KEY = 'monitoreoSessionLogoutReason';
const SESSION_LOGOUT_REASON_INACTIVITY = 'inactivity';

const getStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
};

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('especialista');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: '',
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

  const isAdmin = role === 'admin';

  const subtitle = useMemo(
    () => (isAdmin ? 'Acceso de administrador' : 'Acceso de especialista'),
    [isAdmin],
  );

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
    const loginInput = form.docType === 'CORREO' ? form.email.trim() : form.docNumber.trim();

    if (!loginInput) {
      return { email: '', error: 'Completa el dato de acceso.' };
    }

    if (form.docType === 'CORREO') {
      return { email: loginInput.toLowerCase(), error: '' };
    }

    if (form.docType === 'DNI' && !/^\d{8}$/.test(loginInput)) {
      return { email: '', error: 'El DNI debe tener 8 digitos.' };
    }

    const { data: lookupData, error: lookupError } = await supabase.functions.invoke('auth-lookup', {
      body: { doc_type: form.docType, doc_number: loginInput },
    });

    if (lookupError) {
      return { email: '', error: 'No se pudo validar el documento. Intenta nuevamente.' };
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

      setRecoverySuccess('Acceso admin recuperado. Ahora inicia sesion con el correo recuperado.');
      setRole('admin');
      setForm((prev) => ({
        ...prev,
        docType: 'CORREO',
        email,
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
        password: form.password,
      });

      if (authError || !data?.user) {
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
    <div className="login-glow h-full overflow-y-auto overscroll-contain px-4 py-6 md:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[920px] items-center justify-center md:min-h-[calc(100vh-4.5rem)]">
        <div className="login-shell w-full">
          <div className="login-shell-grid grid min-h-[500px] grid-cols-1 md:grid-cols-2 lg:grid-cols-[0.92fr_1.08fr]">
            <section className="relative min-h-[210px] overflow-hidden bg-gradient-to-br from-slate-900/90 via-slate-950/80 to-slate-950/95 px-6 py-6 md:min-h-[500px] md:px-6 md:py-6">
              <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_45%_16%,rgba(56,189,248,0.22),transparent_54%),radial-gradient(circle_at_78%_82%,rgba(34,197,94,0.16),transparent_48%)]" />
              <div className="relative z-20">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Plataforma UGEL</p>
                <h1 className="mt-2 text-[28px] font-semibold leading-tight text-slate-100 md:text-[32px]">
                  AGEBRE Monitoreo
                </h1>
                <p className="mt-2 max-w-sm truncate text-xs text-slate-400 md:text-sm">
                  Monitoreo y seguimiento institucional - UGEL
                </p>
              </div>

              <div className="relative z-20 mt-2 flex h-[210px] items-end justify-center md:mt-3 md:h-[240px] lg:h-[270px]">
                <img
                  src={loginHeroIllustration}
                  alt="Ilustracion de monitoreo educativo"
                  className="h-full w-full max-w-[520px] object-contain object-bottom"
                  loading="eager"
                  decoding="async"
                />
              </div>
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-slate-950/35 via-transparent to-slate-950/8" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-slate-950/75 via-slate-950/18 to-transparent" />
            </section>

            <section className="login-shell-section-right h-full px-6 py-6 md:px-6 md:py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Inicio de sesion</p>
                  <p className="mt-2 text-xl font-semibold text-slate-100">{subtitle}</p>
                </div>
                <div className="flex rounded-full border border-slate-800/70 bg-slate-900/80 p-1">
                  <button
                    type="button"
                    onClick={() => setRole('especialista')}
                    disabled={isSubmitting}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      role === 'especialista' ? 'bg-slate-100 text-slate-900' : 'text-slate-300'
                    }`}
                  >
                    Especialista
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    disabled={isSubmitting}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      role === 'admin' ? 'bg-slate-100 text-slate-900' : 'text-slate-300'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    id="docType"
                    label="Tipo de acceso"
                    className="h-10 text-[15px]"
                    value={form.docType}
                    disabled={isSubmitting}
                    onChange={(event) => setForm((prev) => ({ ...prev, docType: event.target.value }))}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CE">CE</option>
                    <option value="CORREO">Correo</option>
                  </Select>
                  {form.docType === 'CORREO' ? (
                    <Input
                      id="loginEmail"
                      label="Correo institucional"
                      type="email"
                      autoComplete="username"
                      className="h-10 text-[15px]"
                      placeholder="usuario@ugel.gob.pe"
                      value={form.email}
                      disabled={isSubmitting}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                  ) : (
                    <Input
                      id="docNumber"
                      className="h-10 text-[15px]"
                      label="Numero de documento"
                      placeholder="11111111"
                      value={form.docNumber}
                      disabled={isSubmitting}
                      onChange={(event) => setForm((prev) => ({ ...prev, docNumber: event.target.value }))}
                    />
                  )}
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  Puedes ingresar con DNI, CE o correo institucional.
                </p>

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
                      className="h-10 w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 pr-12 text-[15px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                      placeholder="********"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={isSubmitting}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 transition hover:text-slate-200"
                    >
                      {showPassword ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={!isSupabaseConfigured || isSubmitting}
                  className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Iniciando sesion...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </button>
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
                  className="w-full rounded-xl border border-amber-500/35 bg-amber-500/10 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/60"
                >
                  Recuperar acceso admin
                </button>
                {!isSupabaseConfigured ? (
                  <p className="text-xs text-amber-300">
                    Configura en Vercel: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
                  </p>
                ) : null}
                {sessionNotice ? <p className="text-sm text-amber-200">{sessionNotice}</p> : null}
                {error ? <p className="text-sm text-rose-400">{error}</p> : null}
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
                  onChange={(event) =>
                    setRecoveryForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  className="h-9 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  placeholder="admin@dominio.com"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Nueva contrasena
                <input
                  type="password"
                  value={recoveryForm.password}
                  onChange={(event) =>
                    setRecoveryForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  className="h-9 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  placeholder="Min. 6 caracteres"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-300">
                Codigo de recuperacion
                <input
                  type="password"
                  value={recoveryForm.code}
                  onChange={(event) =>
                    setRecoveryForm((prev) => ({ ...prev, code: event.target.value }))
                  }
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
