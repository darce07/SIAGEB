import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import { supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';

const getStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
};

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('usuario');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '',
    password: '',
    docType: 'DNI',
    docNumber: '',
  });

  const isAdmin = role === 'admin';

  const subtitle = useMemo(() => {
    return isAdmin ? 'Ingreso de Administrador' : 'Ingreso de Usuario';
  }, [isAdmin]);

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored?.role) {
      navigate('/monitoreo/inicio', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    let email = form.email.trim();
    if (isAdmin) {
      const adminInput = form.docType === 'CORREO' ? form.email.trim() : form.docNumber.trim();
      if (adminInput.includes('@')) {
        email = adminInput;
      } else {
        const { data: lookupData, error: lookupError } = await supabase.functions.invoke('auth-lookup', {
          body: { doc_type: form.docType, doc_number: adminInput },
        });
        if (lookupError) {
          setError('No se pudo validar el documento. Intenta nuevamente.');
          return;
        }
        if (lookupData?.email) {
          email = lookupData.email;
        } else {
          email = `${adminInput}@admin.local`;
        }
      }
    }

    if (!email || !form.password.trim()) {
      setError('Completa los datos para iniciar sesión.');
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

    const payload = {
      role: profile?.role || 'user',
      email: profile?.email || data.user.email,
      docNumber: profile?.doc_number || form.docNumber.trim(),
      name: profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
    localStorage.setItem('monitoreoProfile', JSON.stringify(profile || {}));
    navigate('/monitoreo/inicio', { replace: true });
  };

  return (
    <div className="login-glow h-full overflow-y-auto overscroll-contain px-4 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl items-center justify-center">
        <Card className="w-full max-w-md border border-slate-800/70 bg-slate-950/80">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-slate-100">AGEBRE Monitoreo</p>
              <p className="text-sm text-slate-400">{subtitle}</p>
            </div>
            <div className="flex rounded-full border border-slate-800/70 bg-slate-900/80 p-1">
              <button
                type="button"
                onClick={() => setRole('usuario')}
                className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                  role === 'usuario' ? 'bg-slate-100 text-slate-900' : 'text-slate-300'
                }`}
              >
                Usuario
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                  role === 'admin' ? 'bg-slate-100 text-slate-900' : 'text-slate-300'
                }`}
              >
                Admin
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            {isAdmin ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    id="docType"
                    label="Tipo"
                    value={form.docType}
                    onChange={(event) => setForm((prev) => ({ ...prev, docType: event.target.value }))}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CE">CE</option>
                    <option value="CORREO">CORREO</option>
                  </Select>
                  {form.docType === 'CORREO' ? (
                    <Input
                      id="adminEmail"
                      label="Correo institucional"
                      placeholder="admin@ugel.gob.pe"
                      value={form.email}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, email: event.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      id="docNumber"
                      label="Número de documento"
                      placeholder="11111111"
                      value={form.docNumber}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, docNumber: event.target.value }))
                      }
                    />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Puedes ingresar con DNI/CE (8 dígitos) o con correo.
                </p>
              </>
            ) : (
              <Input
                id="email"
                label="Correo institucional"
                type="email"
                placeholder="usuario@ugel.gob.pe"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            )}

            <label className="flex flex-col gap-2 text-sm text-slate-200" htmlFor="password">
              <span className="text-xs uppercase tracking-wide text-slate-400">Contrasena</span>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 pr-12 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  placeholder="********"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 transition hover:text-slate-200"
                >
                  {showPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </label>

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white"
            >
              Entrar
            </button>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </form>
        </Card>
      </div>
    </div>
  );
}
