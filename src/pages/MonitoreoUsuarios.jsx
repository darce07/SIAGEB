import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
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
const SUPABASE_FUNCTIONS_BASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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

const hasMinPasswordLength = (value) => Boolean(value) && value.length >= 6;
const sanitizeJwt = (token) =>
  String(token || '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .split(',')[0]
    .trim();
const isJwtLike = (token) => sanitizeJwt(token).split('.').length === 3;

export default function MonitoreoUsuarios() {
  const isAdmin = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('monitoreoAuth'));
      return stored?.role === 'admin';
    } catch {
      return false;
    }
  }, []);

  const currentProfile = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoProfile') || '{}');
    } catch {
      return {};
    }
  }, []);
  const currentAuth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoAuth') || '{}');
    } catch {
      return {};
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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [disableTarget, setDisableTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [verifyContext, setVerifyContext] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
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
  const revealTimerRef = useRef(null);

  const readFunctionError = async (fnError) => {
    try {
      const context = fnError?.context;
      const status = typeof context?.status === 'number' ? context.status : null;
      const statusText = context?.statusText ? String(context.statusText) : '';

      // Supabase gateway errors often look like: { code, message }
      // Our edge functions return: { error }
      if (context && typeof context?.clone === 'function') {
        const cloned = context.clone();
        try {
          const body = await cloned.json();
          const message = body?.error || body?.message || null;
          if (message) return status ? `[${status}] ${message}` : message;
          return null;
        } catch {
          // Fall through to text parsing below.
        }
      }

      const body = await context?.json?.();
      const message = body?.error || body?.message || null;
      if (message) return status ? `[${status}] ${message}` : message;

      if (status) return `[${status}] ${statusText || 'Error en Edge Function.'}`.trim();
      return null;
    } catch {
      try {
        const context = fnError?.context;
        const status = typeof context?.status === 'number' ? context.status : null;

        if (context && typeof context?.clone === 'function') {
          const cloned = context.clone();
          const text = await cloned.text();
          return text ? (status ? `[${status}] ${text}` : text) : null;
        }

        const text = await context?.text?.();
        return text ? (status ? `[${status}] ${text}` : text) : null;
      } catch {
        return null;
      }
    }
  };

  const getValidAccessToken = async ({ forceRefresh = false } = {}) => {
    const readSessionToken = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Admin-users: getSession error', error);
        return '';
      }
      return sanitizeJwt(data?.session?.access_token);
    };

    const refreshToken = async () => {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) {
        console.error('Admin-users: refreshSession error', refreshed.error);
        return '';
      }
      return sanitizeJwt(refreshed.data?.session?.access_token);
    };

    const verifyTokenUser = async (token) => {
      if (!token || !isJwtLike(token)) return false;
      const { data, error } = await supabase.auth.getUser(token);
      return !error && Boolean(data?.user?.id);
    };

    let token = forceRefresh ? await refreshToken() : await readSessionToken();
    if (!isJwtLike(token)) token = await refreshToken();
    if (!isJwtLike(token)) return '';

    let isValid = await verifyTokenUser(token);
    if (!isValid) {
      token = await refreshToken();
      if (!isJwtLike(token)) return '';
      isValid = await verifyTokenUser(token);
    }

    return isValid ? token : '';
  };

  const ensureAuthSession = async () => {
    const token = await getValidAccessToken();
    if (!token) {
      console.error('Admin-users: no se pudo obtener un JWT válido.');
      return false;
    }
    return true;
  };

  const isFunctionsUnauthorizedError = (fnError) =>
    fnError?.context?.status === 401 ||
    /401|invalid jwt|jwt|unauthorized|authorization/i.test(String(fnError?.message || ''));

  const invokeAdminUsers = async (body) => {
    const token = await getValidAccessToken();
    if (!token) {
      return {
        data: null,
        error: {
          message: 'No hay una sesión válida para invocar la función.',
          context: { status: 401, statusText: 'Invalid JWT' },
        },
      };
    }

    if (!SUPABASE_FUNCTIONS_BASE_URL || !SUPABASE_ANON_KEY) {
      return {
        data: null,
        error: {
          message: 'Falta configurar VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.',
          context: { status: 500, statusText: 'Env missing' },
        },
      };
    }

    const invokeWithToken = async (accessToken) => {
      try {
        const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/functions/v1/admin-users`, {
          method: 'POST',
          headers: {
            'x-client-authorization': `Bearer ${sanitizeJwt(accessToken)}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body || {}),
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          return {
            data: payload,
            error: {
              message: payload?.error || payload?.message || response.statusText || 'Error en Edge Function.',
              context: {
                status: response.status,
                statusText: response.statusText,
                body: payload,
              },
            },
          };
        }

        return { data: payload, error: null };
      } catch (networkError) {
        return {
          data: null,
          error: {
            message: networkError?.message || 'No se pudo conectar con Edge Function.',
            context: { status: 0, statusText: 'Network error' },
          },
        };
      }
    };

    let response = await invokeWithToken(token);
    if (!response.error || !isFunctionsUnauthorizedError(response.error)) {
      return response;
    }

    const refreshedToken = await getValidAccessToken({ forceRefresh: true });
    if (!refreshedToken) {
      return response;
    }

    response = await invokeWithToken(refreshedToken);
    return response;
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

    const sessionReady = await ensureAuthSession();
    if (!sessionReady) {
      const message = 'Sesión inválida. Vuelve a iniciar sesión.';
      setError(message);
      showToast(message, 'error');
      setUsers([]);
      setLoading(false);
      return;
    }

    const { data, error: fnError } = await invokeAdminUsers({ action: 'list' });

    if (fnError) {
      if (isFunctionsUnauthorizedError(fnError)) {
        const message = 'No se pudo validar tu sesión para cargar Equipo. Vuelve a intentar o cierra sesión manualmente.';
        console.error('Usuarios list unauthorized', fnError);
        setError(message);
        showToast(message, 'error');
        setUsers([]);
        setLoading(false);
        return;
      }
      const details = await readFunctionError(fnError);
      const message =
        details ||
        data?.error ||
        data?.message ||
        fnError.message ||
        'No se pudieron cargar los usuarios.';
      console.error('Usuarios list error', fnError, details);
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
      setError('No tienes permisos para acceder a este módulo.');
    }
  }, [isAdmin]);

  useEffect(
    () => () => {
      if (toastTimersRef.current.hide) clearTimeout(toastTimersRef.current.hide);
      if (toastTimersRef.current.remove) clearTimeout(toastTimersRef.current.remove);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!detailsTarget) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailsTarget]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      const email = (user.email || '').toLowerCase();
      const matchesSearch = !search || fullName.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const activeAdminCount = useMemo(
    () => users.filter((user) => user.role === 'admin' && user.status === 'active').length,
    [users],
  );

  const isUserProtectedLastAdmin = (user) =>
    Boolean(user?.role === 'admin' && user?.status === 'active' && activeAdminCount <= 1);

  const editingUser = useMemo(
    () => users.find((user) => (user.id || user.user_id) === form.id) || null,
    [users, form.id],
  );

  const isEditingLastActiveAdmin = Boolean(editingUser && isUserProtectedLastAdmin(editingUser));

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
      doc_type: form.docType,
      doc_number: form.docNumber.trim(),
      email: form.email.trim(),
      password: form.password.trim() || undefined,
    };

    if (form.id && isEditingLastActiveAdmin) {
      const nextRole = String(payload.role || 'user');
      const nextStatus = String(payload.status || 'disabled');
      if (nextRole !== 'admin' || nextStatus !== 'active') {
        setError('No puedes quitar o desactivar al último administrador activo.');
        return;
      }
    }

    if (!payload.first_name || !payload.last_name) {
      setError('Nombres y apellidos son obligatorios.');
      return;
    }
    if (!payload.email) {
      setError('El correo institucional es obligatorio.');
      return;
    }
    if (!payload.doc_number) {
      setError('El documento es obligatorio.');
      return;
    }
    if (form.docType === 'DNI' && !/^\d{8}$/.test(String(payload.doc_number))) {
      setError('El DNI debe tener 8 dígitos.');
      return;
    }
    if (!form.id && !payload.password) {
      setError('La contraseña temporal es obligatoria.');
      return;
    }
    if (payload.password && !hasMinPasswordLength(payload.password)) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const sessionReady = await ensureAuthSession();
    if (!sessionReady) {
      setError('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: fnError } = await invokeAdminUsers(payload);

      if (fnError) {
        const details = await readFunctionError(fnError);
        const message = details || data?.error || fnError.message || 'No se pudo guardar el usuario.';
        console.error('Usuarios create/update error', fnError, details, data);
        setError(message);
        showToast(message, 'error');
        return;
      }

      const successMessage = form.id ? 'Usuario actualizado con éxito' : 'Usuario creado con éxito';
      setSuccess(form.id ? 'Usuario actualizado.' : 'Usuario creado correctamente.');
      if (!form.id) setTempPassword(form.password.trim());
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
    const userId = user?.id || user?.user_id;
    if (!userId) {
      showToast('No se encontró el identificador del usuario.', 'error');
      return;
    }
    if (isUserProtectedLastAdmin(user)) {
      showToast('No puedes desactivar al último administrador activo.', 'error');
      return;
    }

    const sessionReady = await ensureAuthSession();
    if (!sessionReady) {
      setError('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: fnError } = await invokeAdminUsers({ action: 'disable', id: userId });

      if (fnError) {
        const details = await readFunctionError(fnError);
        const message = details || 'No se pudo desactivar el usuario.';
        setError(message);
        showToast(message, 'error');
        return;
      }

      showToast('Usuario desactivado con éxito', 'success');
      await loadUsers();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async (user) => {
    const userId = user?.id || user?.user_id;
    if (!userId) {
      showToast('No se encontró el identificador del usuario.', 'error');
      return;
    }
    const sessionReady = await ensureAuthSession();
    if (!sessionReady) {
      setError('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: fnError } = await invokeAdminUsers({ action: 'activate', id: userId });

      if (fnError) {
        const details = await readFunctionError(fnError);
        const message = details || 'No se pudo activar el usuario.';
        setError(message);
        showToast(message, 'error');
        return;
      }

      showToast('Usuario activado con éxito', 'success');
      await loadUsers();
    } finally {
      setIsSubmitting(false);
    }
  };

  const openVerifyForCopy = (credential) => {
    if (!credential) {
      showToast("No disponible. Usa 'Restablecer contraseña' para generar una nueva.", 'error');
      return;
    }
    setVerifyContext({ mode: 'copy', credential });
    setIsVerifyOpen(true);
    setVerifyError('');
  };

  const openVerifyForReveal = (credential) => {
    if (!credential) {
      showToast("No disponible. Usa 'Restablecer contraseña' para generar una nueva.", 'error');
      return;
    }
    setVerifyContext({ mode: 'reveal', credential });
    setIsVerifyOpen(true);
    setVerifyError('');
  };

  const handleResetPassword = async (user) => {
    const userId = user?.id || user?.user_id;
    if (!userId) {
      showToast('No se encontró el identificador del usuario.', 'error');
      return;
    }

    const sessionReady = await ensureAuthSession();
    if (!sessionReady) {
      setError('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    const newPassword = buildTempPassword();
    setPasswordActionId(userId);
    try {
      const { data, error: fnError } = await invokeAdminUsers({
        action: 'update',
        id: userId,
        password: newPassword,
      });

      if (fnError) {
        const details = await readFunctionError(fnError);
        const message = details || data?.error || 'No se pudo generar la nueva contraseña.';
        setError(message);
        showToast(message, 'error');
        return;
      }

      setDetailsTarget((prev) => (prev?.id === userId ? { ...prev, temp_credential: newPassword } : prev));
      setUsers((prev) =>
        prev.map((item) =>
          item.id === userId || item.user_id === userId ? { ...item, temp_credential: newPassword } : item,
        ),
      );
      setRevealedSecret(newPassword);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => setRevealedSecret(''), 15000);
      showToast('Contraseña temporal generada', 'success');
      await loadUsers();
    } catch {
      showToast('No se pudo restablecer la contraseña.', 'error');
    } finally {
      setPasswordActionId('');
    }
  };

  const openDeleteModal = (user) => {
    const userId = user?.id || user?.user_id;
    if (currentProfile?.id === userId) {
      showToast('No puedes eliminar tu propia cuenta.', 'error');
      return;
    }
    if (isUserProtectedLastAdmin(user)) {
      showToast('No puedes eliminar al último administrador activo.', 'error');
      return;
    }
    setDeleteTarget({ ...user, id: userId });
  };

  const openDetailsModal = (user) => {
    const userId = user?.id || user?.user_id;
    setDetailsTarget({ ...user, id: userId });
    setRevealedSecret('');
  };

  const closeDetailsModal = () => {
    setDetailsTarget(null);
    setIsVerifyOpen(false);
    setVerifyContext(null);
    setAdminPassword('');
    setVerifyError('');
    setRevealedSecret('');
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
  };

  const copyField = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      showToast(`${label} copiado`, 'success');
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  };

  const handleCopyAllDetails = async () => {
    if (!detailsTarget) return;
    const payload = [
      `Nombres: ${detailsTarget.first_name || ''}`,
      `Apellidos: ${detailsTarget.last_name || ''}`,
      `Correo: ${detailsTarget.email || ''}`,
      `Tipo documento: ${detailsTarget.doc_type || ''}`,
      `Documento: ${detailsTarget.doc_number || ''}`,
      `Rol: ${detailsTarget.role === 'admin' ? 'Administrador' : 'Especialista'}`,
      `Estado: ${detailsTarget.status === 'active' ? 'Activo' : 'Desactivado'}`,
      `Creado: ${detailsTarget.created_at ? new Date(detailsTarget.created_at).toLocaleString() : '-'}`,
      `Actualizado: ${detailsTarget.updated_at ? new Date(detailsTarget.updated_at).toLocaleString() : '-'}`,
      `UID: ${detailsTarget.id || ''}`,
    ].join('\n');
    await copyField(payload, 'Ficha');
  };

  const handleRevealCredential = async () => {
    if (!verifyContext?.credential) return;
    const adminEmail = currentProfile?.email || currentAuth?.email;
    if (!adminEmail) {
      setVerifyError('No se encontró correo del administrador actual.');
      return;
    }
    if (!adminPassword.trim()) {
      setVerifyError('Ingresa tu contraseña para confirmar.');
      return;
    }

    setIsVerifying(true);
    setVerifyError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword.trim(),
      });
      if (authError) {
        setVerifyError('Contraseña de administrador incorrecta.');
        showToast('Contraseña incorrecta', 'error');
        return;
      }

      if (verifyContext.mode === 'copy') {
        await navigator.clipboard.writeText(verifyContext.credential);
        showToast('Contraseña copiada', 'success');
      } else {
        setRevealedSecret(verifyContext.credential);
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => setRevealedSecret(''), 15000);
        showToast('Credencial visible por 15s', 'success');
      }

      setIsVerifyOpen(false);
      setVerifyContext(null);
      setAdminPassword('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget?.id) return;

    const sessionReady = await ensureAuthSession();
    if (!sessionReady) {
      setError('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    setIsDeleting(true);
    try {
      const { data, error: fnError } = await invokeAdminUsers({
        action: 'delete',
        id: deleteTarget.id,
      });

      if (fnError) {
        const details = await readFunctionError(fnError);
        const message = details || data?.error || 'No se pudo eliminar el usuario.';
        setError(message);
        showToast(message, 'error');
        return;
      }

      setDeleteTarget(null);
      showToast('Usuario eliminado con éxito', 'success');
      await loadUsers();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {toast.show ? (
        <div className={`pointer-events-none fixed right-5 top-5 z-50 transition-all duration-300 ${toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`}>
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-xl ${toast.tone === 'success' ? 'border border-emerald-300/30 bg-emerald-500/15 text-emerald-100 shadow-[0_16px_44px_rgba(16,185,129,0.24)]' : 'border border-rose-300/30 bg-rose-500/15 text-rose-100 shadow-[0_16px_44px_rgba(244,63,94,0.24)]'}`}>
            {toast.tone === 'success' ? <CheckCircle2 size={18} className="text-emerald-200" /> : <AlertTriangle size={18} className="text-rose-200" />}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      ) : null}

      {!isAdmin ? (
        <Card className="flex flex-col gap-3">
          <SectionHeader eyebrow="Acceso restringido" title="No autorizado" />
          <p className="text-sm text-slate-400">Este módulo está disponible solo para administradores.</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-6">
            <SectionHeader eyebrow="Equipo" title="Equipo" description="Administra especialistas y roles." size="page" />
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                activeAdminCount <= 1
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              <p className="font-semibold">Admins activos: {activeAdminCount}</p>
              <p className="mt-1 text-xs">
                {activeAdminCount <= 1
                  ? 'Protección activa: no se puede eliminar, desactivar o degradar al último admin.'
                  : 'Estado saludable: hay más de un administrador activo.'}
              </p>
            </div>
            {isSubmitting ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/60">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400/70" />
              </div>
            ) : null}

            <form onSubmit={handleSubmit}>
              <fieldset disabled={isSubmitting} className="grid gap-4 md:grid-cols-2 disabled:opacity-80">
                <Input id="firstName" label="Nombres" value={form.firstName} onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))} placeholder="Nombres" />
                <Input id="lastName" label="Apellidos" value={form.lastName} onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))} placeholder="Apellidos" />
                <Select
                  id="role"
                  label="Rol"
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                  disabled={isEditingLastActiveAdmin}
                >
                  <option value="user">Especialista</option>
                  <option value="admin">Administrador</option>
                </Select>
                <Input id="email" label="Correo institucional" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="usuario@ugel.gob.pe" />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Select id="docType" label="Tipo documento" value={form.docType} onChange={(event) => setForm((prev) => ({ ...prev, docType: event.target.value }))}>
                    <option value="DNI">DNI</option>
                    <option value="CE">CE</option>
                  </Select>
                  <Input id="docNumber" label="Documento" value={form.docNumber} onChange={(event) => setForm((prev) => ({ ...prev, docNumber: event.target.value }))} placeholder={form.docType === 'DNI' ? '8 dígitos' : 'Documento'} />
                </div>

                <label className="flex flex-col gap-2 text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-wide text-slate-400">{form.id ? 'Nueva contraseña (opcional)' : 'Contraseña temporal'}</span>
                  <div className="flex items-center gap-2">
                    <input id="tempPassword" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} placeholder="Min. 6 caracteres" className="w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
                    <button type="button" onClick={handleGeneratePassword} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-200" title="Generar contraseña">
                      <RefreshCw size={16} />
                    </button>
                    <button type="button" onClick={handleCopyPassword} disabled={!form.password} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40" title="Copiar contraseña">
                      <Copy size={16} />
                    </button>
                  </div>
                  <span className="text-xs text-slate-400">Minimo 6 caracteres. El boton generar crea una clave robusta de 9 caracteres.</span>
                </label>

                <Select
                  id="status"
                  label="Estado"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                  disabled={isEditingLastActiveAdmin}
                >
                  <option value="active">Activo</option>
                  <option value="disabled">Desactivado</option>
                </Select>

                {isEditingLastActiveAdmin ? (
                  <p className="text-xs text-amber-300">
                    Este usuario es el último administrador activo. El rol y estado están protegidos.
                  </p>
                ) : null}

                <div className="flex flex-wrap items-end gap-3">
                  <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {isSubmitting ? (form.id ? 'Actualizando...' : 'Guardando...') : form.id ? 'Actualizar usuario' : 'Crear usuario'}
                  </button>
                  {form.id ? (
                    <button type="button" onClick={resetForm} className="inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-6 py-3 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting}>
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
                Contraseña temporal asignada: <span className="font-semibold">{tempPassword}</span>
                {copied ? <span className="ml-2 text-emerald-300">Copiada</span> : null}
              </p>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-6">
            <SectionHeader eyebrow="Listado" title="Miembros" description="Gestión de usuarios activos y roles." />
            <div className="grid gap-3 md:grid-cols-3">
              <Input id="search" label="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o correo" />
              <Select id="roleFilter" label="Rol" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="user">Especialista</option>
                <option value="admin">Administrador</option>
              </Select>
              <Select id="statusFilter" label="Estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="active">Activo</option>
                <option value="disabled">Desactivado</option>
              </Select>
            </div>

            {loading ? (
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-cyan-200">
                  <Loader2 size={16} className="animate-spin" />
                  <p>Cargando usuarios...</p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-slate-700/60 bg-slate-900/70">
                  <span className="block h-full w-1/3 animate-pulse rounded-full bg-cyan-400/70" />
                </div>
                <div className="mt-3 space-y-2" aria-hidden="true">
                  <div className="h-3 w-2/3 animate-pulse rounded-lg bg-slate-800/80" />
                  <div className="h-3 w-1/2 animate-pulse rounded-lg bg-slate-800/65" />
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-slate-400">No se encontraron usuarios.</p>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => {
                  const rowId = user.id || user.user_id;
                  const isProtectedAdmin = isUserProtectedLastAdmin(user);
                  const isOwnAccount = currentProfile?.id === rowId;
                  return (
                    <div key={rowId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 text-sm">
                      <div className="space-y-1">
                        <p
                          title={user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()}
                          className="max-w-[48ch] truncate text-sm font-semibold text-slate-100"
                        >
                          {user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()}
                        </p>
                        <p title={user.email || 'Sin correo'} className="max-w-[48ch] truncate text-xs text-slate-400">
                          {user.email || 'Sin correo'}
                        </p>
                        <p className="text-xs text-slate-500">Creado: {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">{user.role === 'admin' ? 'Administrador' : 'Especialista'}</span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${user.status === 'active' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>{user.status === 'active' ? 'Activo' : 'Desactivado'}</span>
                        <button type="button" onClick={() => handleEdit(user)} className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500" title="Editar usuario"><Pencil size={14} />Editar</button>
                        <button type="button" onClick={() => openDetailsModal(user)} className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500" title="Ver detalles"><Eye size={14} />Ver</button>
                        {user.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => setDisableTarget({ ...user, id: rowId })}
                            disabled={isProtectedAdmin}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                            title={isProtectedAdmin ? 'No puedes desactivar al último administrador activo' : 'Desactivar usuario'}
                          >
                            <UserX size={14} />
                            Desactivar
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleActivate(user)} className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400/60" title="Activar usuario"><UserCheck size={14} />Activar</button>
                        )}
                        <button
                          type="button"
                          onClick={() => openDeleteModal(user)}
                          disabled={isOwnAccount || isProtectedAdmin}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-500/35 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            isOwnAccount
                              ? 'No puedes eliminar tu propia cuenta'
                              : isProtectedAdmin
                                ? 'No puedes eliminar al último administrador activo'
                                : 'Eliminar usuario'
                          }
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <ConfirmModal
            open={Boolean(deleteTarget)}
            tone="danger"
            title="Eliminar usuario"
            description="Esta acción es irreversible. Se eliminará el acceso y podría afectar el historial."
            details={deleteTarget ? deleteTarget.full_name || `${deleteTarget.first_name || ''} ${deleteTarget.last_name || ''}`.trim() : ''}
            confirmText="Sí, eliminar"
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleDeleteUser}
            loading={isDeleting}
          />

          <ConfirmModal
            open={Boolean(disableTarget)}
            tone="warning"
            title="Desactivar usuario"
            description="El usuario no podrá iniciar sesión hasta volver a activarlo."
            details={disableTarget ? disableTarget.full_name || `${disableTarget.first_name || ''} ${disableTarget.last_name || ''}`.trim() : ''}
            confirmText="Sí, desactivar"
            onCancel={() => setDisableTarget(null)}
            onConfirm={async () => {
              await handleDisable(disableTarget);
              setDisableTarget(null);
            }}
            loading={isSubmitting}
          />

          {detailsTarget ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md md:p-6" onClick={closeDetailsModal}>
              <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-600/80 bg-slate-900 p-7 shadow-[0_30px_80px_rgba(2,6,23,0.85)] md:p-8" onClick={(event) => event.stopPropagation()}>
                <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center justify-between gap-3 border-b border-slate-800/70 bg-slate-900/95 px-1 pb-4 backdrop-blur">
                  <p className="text-xl font-semibold text-slate-100">Detalles del usuario</p>
                  <button type="button" onClick={closeDetailsModal} className="rounded-full border border-slate-700/60 px-3 py-1.5 text-xs text-slate-300">Cerrar</button>
                </div>

                <div className="mt-6 grid gap-5">
                  <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Datos personales</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        ['Nombres', detailsTarget.first_name],
                        ['Apellidos', detailsTarget.last_name],
                        ['Correo', detailsTarget.email],
                        ['Tipo documento', detailsTarget.doc_type],
                        ['Documento', detailsTarget.doc_number],
                      ].map(([label, value]) => (
                        <button key={label} type="button" onClick={() => copyField(value, label)} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/60 px-4 py-3 text-left transition hover:border-slate-600/70">
                          <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
                          <span className="ml-4 truncate text-base text-slate-100">{value || '-'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Acceso y estado</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        ['Rol', detailsTarget.role === 'admin' ? 'Administrador' : 'Especialista'],
                        ['Estado', detailsTarget.status === 'active' ? 'Activo' : 'Desactivado'],
                      ].map(([label, value]) => (
                        <button key={label} type="button" onClick={() => copyField(value, label)} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/60 px-4 py-3 text-left transition hover:border-slate-600/70">
                          <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
                          <span className="ml-4 truncate text-base text-slate-100">{value || '-'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Auditoria</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        ['Creado', detailsTarget.created_at ? new Date(detailsTarget.created_at).toLocaleString() : '-'],
                        ['Actualizado', detailsTarget.updated_at ? new Date(detailsTarget.updated_at).toLocaleString() : '-'],
                        ['UID', detailsTarget.id],
                      ].map(([label, value]) => (
                        <button key={label} type="button" onClick={() => copyField(value, label)} className="flex min-h-12 items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/60 px-4 py-2.5 text-left transition hover:border-slate-600/70">
                          <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
                          <span className="ml-4 truncate text-sm text-slate-300">{value || '-'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Contraseña</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-200">
                      {detailsTarget?.temp_credential ? (revealedSecret || '•••••••••') : 'No disponible'}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (revealedSecret) {
                            setRevealedSecret('');
                            return;
                          }
                          openVerifyForReveal(detailsTarget?.temp_credential);
                        }}
                        disabled={!detailsTarget?.temp_credential}
                        title={!detailsTarget?.temp_credential ? 'No disponible. Usa Restablecer contraseña.' : 'Ver contraseña temporal'}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700/60 px-3 py-2 text-xs text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {revealedSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                        {revealedSecret ? 'Ocultar' : 'Ver'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openVerifyForCopy(detailsTarget?.temp_credential)}
                        disabled={!detailsTarget?.temp_credential}
                        title={!detailsTarget?.temp_credential ? 'No disponible. Usa Restablecer contraseña.' : 'Copiar contraseña temporal'}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/35 px-3 py-2 text-xs text-cyan-200 transition hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Copy size={13} />
                        Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetPassword(detailsTarget)}
                        disabled={passwordActionId === detailsTarget?.id}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-fuchsia-500/35 px-3 py-2 text-xs font-semibold text-fuchsia-200 transition hover:border-fuchsia-400/60 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {passwordActionId === detailsTarget?.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RefreshCw size={13} />
                        )}
                        Restablecer
                      </button>
                    </div>
                  </div>
                  {!detailsTarget?.temp_credential ? (
                    <p className="mt-2 text-xs text-slate-400">
                      No disponible. Usa "Restablecer" para generar una nueva contraseña temporal.
                    </p>
                  ) : null}
                </div>

                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={handleCopyAllDetails} className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500">
                    <Copy size={14} />
                    Copiar todo
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <ConfirmModal
            open={isVerifyOpen}
            tone="neutral"
            title="Confirmar identidad de administrador"
            description={
              verifyContext?.mode === 'copy'
                ? 'Ingresa tu contraseña de administrador para copiar la credencial temporal.'
                : 'Ingresa tu contraseña de administrador para ver la credencial temporal.'
            }
            confirmText={isVerifying ? 'Verificando...' : 'Confirmar'}
            onCancel={() => {
              setIsVerifyOpen(false);
              setVerifyContext(null);
              setAdminPassword('');
              setVerifyError('');
            }}
            onConfirm={handleRevealCredential}
            loading={isVerifying}
            details={
              <div className="mt-3">
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Contraseña de administrador"
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
                />
                {verifyError ? <p className="mt-2 text-xs text-rose-300">{verifyError}</p> : null}
              </div>
            }
          />
        </>
      )}
    </div>
  );
}


