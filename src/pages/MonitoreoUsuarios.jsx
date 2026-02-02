import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import { supabase } from '../lib/supabase.js';

const emptyForm = {
  id: null,
  firstName: '',
  lastName: '',
  email: '',
  role: 'user',
  status: 'active',
  docType: 'DNI',
  docNumber: '',
  password: '',
};

const PASSWORD_LENGTH = 9;

const buildFullName = (firstName, lastName) => `${firstName || ''} ${lastName || ''}`.trim();

const pickRandom = (chars) => chars[Math.floor(Math.random() * chars.length)];

const buildTempPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$%*!?';
  const all = `${upper}${lower}${digits}${special}`;

  const chars = [pickRandom(upper), pickRandom(lower), pickRandom(digits), pickRandom(special)];
  while (chars.length < PASSWORD_LENGTH) chars.push(pickRandom(all));

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};

const isStrongTempPassword = (value) =>
  Boolean(value)
  && value.length === PASSWORD_LENGTH
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value);

export default function MonitoreoUsuarios() {
  const isAdmin = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('monitoreoAuth'));
      return stored?.role === 'admin';
    } catch {
      return false;
    }
  }, []);

  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordActionId, setPasswordActionId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    visible: false,
    message: '',
    tone: 'success',
  });
  const toastTimersRef = useRef({ hide: null, remove: null });

  const readFunctionError = async (fnError) => {
    try {
      const body = await fnError?.context?.json();
      return body?.error || null;
    } catch {
      try {
        const text = await fnError?.context?.text();
        return text || null;
      } catch {
        return null;
      }
    }
  };

  const getAuthHeaders = async () => {
    const refreshed = await supabase.auth.refreshSession();
    let session = refreshed.data?.session;
    if (!session) {
      const { data } = await supabase.auth.getSession();
      session = data?.session || null;
    }

    const token = session?.access_token;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!token) {
      console.error('Admin-users: sesion sin token.');
      return null;
    }
    if (!anonKey) {
      console.error('Admin-users: falta VITE_SUPABASE_ANON_KEY.');
      return null;
    }

    return {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    };
  };

  const showToast = (message, tone = 'success') => {
    if (toastTimersRef.current.hide) clearTimeout(toastTimersRef.current.hide);
    if (toastTimersRef.current.remove) clearTimeout(toastTimersRef.current.remove);

    setToast({ show: true, visible: true, message, tone });

    toastTimersRef.current.hide = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2300);

    toastTimersRef.current.remove = setTimeout(() => {
      setToast({ show: false, visible: false, message: '', tone: 'success' });
    }, 2800);
  };

  const loadUsers = async () => {
    setLoading(true);
    setError('');

    const headers = await getAuthHeaders();
    if (!headers) {
      setError('Sesion invalida. Vuelve a iniciar sesion.');
      setUsers([]);
      setLoading(false);
      return;
    }

    const { data, error: fnError } = await supabase.functions.invoke('admin-users', {
      body: { action: 'list' },
      headers,
    });

    if (fnError) {
      const details = await readFunctionError(fnError);
      console.error('Usuarios list error', fnError, details);
      const message = details || fnError.message || 'No se pudieron cargar los usuarios.';
      setError(message);
      showToast(message, 'error');
      setUsers([]);
    } else {
      setUsers(data?.data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    } else {
      setLoading(false);
      setError('No tienes permisos para acceder a este modulo.');
    }
  }, [isAdmin]);

  useEffect(
    () => () => {
      if (toastTimersRef.current.hide) clearTimeout(toastTimersRef.current.hide);
      if (toastTimersRef.current.remove) clearTimeout(toastTimersRef.current.remove);
    },
    [],
  );

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      const email = (user.email || '').toLowerCase();
      const matchesSearch =
        !search || fullName.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const resetForm = () => {
    setForm(emptyForm);
    setTempPassword('');
    setCopied(false);
  };

  const handleGeneratePassword = () => {
    setForm((prev) => ({ ...prev, password: buildTempPassword() }));
    setCopied(false);
  };

  const handleCopyPassword = async () => {
    if (!form.password) return;

    try {
      await navigator.clipboard.writeText(form.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setSuccess('');

    const payload = {
      action: form.id ? 'update' : 'create',
      id: form.id,
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      full_name: buildFullName(form.firstName.trim(), form.lastName.trim()),
      role: form.role,
      status: form.status,
      doc_type: form.role === 'admin' ? form.docType : null,
      doc_number: form.role === 'admin' ? form.docNumber.trim() : null,
      email: form.email.trim(),
      password: form.password.trim() || undefined,
    };

    if (!payload.first_name || !payload.last_name) {
      setError('Nombres y apellidos son obligatorios.');
      return;
    }

    if (!form.id) {
      if (!payload.email) {
        setError('El correo institucional es obligatorio.');
        return;
      }

      if (form.role === 'admin' && !payload.doc_number) {
        setError('El DNI o CE es obligatorio para administradores.');
        return;
      }

      if (form.role === 'admin' && form.docType === 'DNI' && !/^\d{8}$/.test(String(payload.doc_number))) {
        setError('El DNI debe tener 8 digitos.');
        return;
      }

      if (!payload.password) {
        setError('La contrasena temporal es obligatoria.');
        return;
      }

      if (!isStrongTempPassword(payload.password)) {
        setError('La contrasena temporal debe tener 9 caracteres e incluir mayuscula, minuscula, numero y simbolo.');
        return;
      }
    } else if (payload.password && !isStrongTempPassword(payload.password)) {
      setError('La nueva contrasena debe tener 9 caracteres e incluir mayuscula, minuscula, numero y simbolo.');
      return;
    }

    const headers = await getAuthHeaders();
    if (!headers) {
      setError('Sesion invalida. Vuelve a iniciar sesion.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-users', {
        body: payload,
        headers,
      });

      if (fnError) {
        const details = await readFunctionError(fnError);
        console.error('Usuarios create/update error', fnError, details, data);
        const message = details || data?.error || fnError.message || 'No se pudo guardar el usuario.';
        setError(message);
        showToast(message, 'error');
        return;
      }

      const successMessage = form.id ? 'Usuario actualizado con exito' : 'Usuario creado con exito';
      setSuccess(form.id ? 'Usuario actualizado.' : 'Usuario creado correctamente.');
      if (!form.id) {
        setTempPassword(form.password.trim());
      }
      showToast(successMessage, 'success');

      resetForm();
      await loadUsers();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (user) => {
    setForm({
      id: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      email: user.email || '',
      role: user.role || 'user',
      status: user.status || 'active',
      docType: user.doc_type || 'DNI',
      docNumber: user.doc_number || '',
      password: '',
    });
    setTempPassword('');
    setCopied(false);
  };

  const handleDisable = async (user) => {
    if (!window.confirm('Seguro que deseas desactivar este usuario?')) return;

    const headers = await getAuthHeaders();
    if (!headers) {
      setError('Sesion invalida. Vuelve a iniciar sesion.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: fnError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'disable', id: user.id },
        headers,
      });

      if (fnError) {
        const details = await readFunctionError(fnError);
        const message = details || 'No se pudo desactivar el usuario.';
        setError(message);
        showToast(message, 'error');
        return;
      }

      showToast('Usuario desactivado con exito', 'success');
      await loadUsers();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndCopyPassword = async (user) => {
    const headers = await getAuthHeaders();
    if (!headers) {
      setError('Sesion invalida. Vuelve a iniciar sesion.');
      return;
    }

    const newPassword = buildTempPassword();
    setPasswordActionId(user.id);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'update', id: user.id, password: newPassword },
        headers,
      });

      if (fnError) {
        const details = await readFunctionError(fnError);
        const message = details || data?.error || 'No se pudo generar la nueva contrasena.';
        setError(message);
        showToast(message, 'error');
        return;
      }

      await navigator.clipboard.writeText(newPassword);
      showToast('Nueva contrasena copiada. Compartela con el usuario.', 'success');
    } catch {
      showToast('No se pudo copiar la contrasena al portapapeles.', 'error');
    } finally {
      setPasswordActionId('');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {toast.show ? (
        <div
          className={`pointer-events-none fixed right-5 top-5 z-50 transition-all duration-300 ${
            toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
        >
          <div
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-xl ${
              toast.tone === 'success'
                ? 'border border-emerald-300/30 bg-emerald-500/15 text-emerald-100 shadow-[0_16px_44px_rgba(16,185,129,0.24)]'
                : 'border border-rose-300/30 bg-rose-500/15 text-rose-100 shadow-[0_16px_44px_rgba(244,63,94,0.24)]'
            }`}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-200" />
            ) : (
              <AlertTriangle size={18} className="text-rose-200" />
            )}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      ) : null}

      {!isAdmin ? (
        <Card className="flex flex-col gap-3">
          <SectionHeader eyebrow="Acceso restringido" title="No autorizado" />
          <p className="text-sm text-slate-400">Este modulo esta disponible solo para administradores.</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-6">
            <SectionHeader
              eyebrow="Administracion"
              title="Usuarios"
              description="Crea y administra cuentas del sistema."
            />
            {isSubmitting ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/60">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400/70" />
              </div>
            ) : null}
            <form onSubmit={handleSubmit}>
              <fieldset disabled={isSubmitting} className="grid gap-4 md:grid-cols-2 disabled:opacity-80">
                <Input
                  id="firstName"
                  label="Nombres"
                  value={form.firstName}
                  onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  placeholder="Nombres"
                />
                <Input
                  id="lastName"
                  label="Apellidos"
                  value={form.lastName}
                  onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  placeholder="Apellidos"
                />
                <Select
                  id="role"
                  label="Rol"
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <option value="user">Usuario</option>
                  <option value="admin">Administrador</option>
                </Select>
                <Input
                  id="email"
                  label="Correo institucional"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="usuario@ugel.gob.pe"
                />

                {form.role === 'admin' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      id="docType"
                      label="Tipo documento"
                      value={form.docType}
                      onChange={(event) => setForm((prev) => ({ ...prev, docType: event.target.value }))}
                    >
                      <option value="DNI">DNI</option>
                      <option value="CE">CE</option>
                    </Select>
                    <Input
                      id="docNumber"
                      label="Documento"
                      value={form.docNumber}
                      onChange={(event) => setForm((prev) => ({ ...prev, docNumber: event.target.value }))}
                      placeholder={form.docType === 'DNI' ? '8 digitos' : 'Documento'}
                    />
                  </div>
                ) : null}

                <label className="flex flex-col gap-2 text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {form.id ? 'Nueva contrasena (opcional)' : 'Contrasena temporal'}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      id="tempPassword"
                      value={form.password}
                      onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                      placeholder="9 caracteres"
                      className="w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    />
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-200"
                      title="Generar contrasena"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      disabled={!form.password}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Copiar contrasena"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <span className="text-xs text-slate-400">
                    Debe incluir mayuscula, minuscula, numero y simbolo (9 caracteres).
                  </span>
                </label>

                <Select
                  id="status"
                  label="Estado"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="active">Activo</option>
                  <option value="disabled">Desactivado</option>
                </Select>

                <div className="flex flex-wrap items-end gap-3">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {isSubmitting
                      ? form.id
                        ? 'Actualizando...'
                        : 'Guardando...'
                      : form.id
                        ? 'Actualizar usuario'
                        : 'Crear usuario'}
                  </button>
                  {form.id ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-6 py-3 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSubmitting}
                    >
                      Cancelar edicion
                    </button>
                  ) : null}
                </div>
              </fieldset>
            </form>

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
            {tempPassword ? (
              <p className="text-xs text-amber-200">
                Contrasena temporal asignada: <span className="font-semibold">{tempPassword}</span>
                {copied ? <span className="ml-2 text-emerald-300">Copiada</span> : null}
              </p>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-6">
            <SectionHeader eyebrow="Listado" title="Usuarios registrados" />
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                id="search"
                label="Buscar"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nombre o correo"
              />
              <Select id="roleFilter" label="Rol" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </Select>
              <Select
                id="statusFilter"
                label="Estado"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Activo</option>
                <option value="disabled">Desactivado</option>
              </Select>
            </div>

            {loading ? (
              <p className="text-sm text-slate-400">Cargando usuarios...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-slate-400">No se encontraron usuarios.</p>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 text-sm"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-100">
                        {user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()}
                      </p>
                      <p className="text-xs text-slate-400">{user.email || 'Sin correo'}</p>
                      <p className="text-xs text-slate-500">
                        Creado: {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
                        {user.role === 'admin' ? 'Administrador' : 'Usuario'}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          user.status === 'active'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        }`}
                      >
                        {user.status === 'active' ? 'Activo' : 'Desactivado'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEdit(user)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetAndCopyPassword(user)}
                        disabled={passwordActionId === user.id}
                        className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {passwordActionId === user.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <KeyRound size={14} />
                        )}
                        Copiar contrasena
                      </button>
                      {user.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => handleDisable(user)}
                          className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/60"
                        >
                          Desactivar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
