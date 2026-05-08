import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import { SkeletonTable } from '../components/ui/Skeleton.jsx';
import { supabase } from '../lib/supabase.js';
import { getRoleLabel } from '../lib/roles.js';

const emptyForm = {
  id: null,
  firstName: '',
  lastName: '',
  email: '',
  userArea: '',
  role: 'especialista',
  status: 'active',
  docType: 'DNI',
  docNumber: '',
  password: '',
};

const ROLE_OPTIONS = [
  { value: 'especialista', label: 'Especialista' },
  { value: 'user', label: 'Especialista (legacy)' },
  { value: 'jefe_area', label: 'Jefe de Area' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Administrador' },
];

const USER_AREA_OPTIONS = [
  { value: '', label: 'Sin area asignada' },
  { value: 'ASGESE', label: 'ASGESE' },
  { value: 'AGEBRE', label: 'AGEBRE' },
  { value: 'APP', label: 'APP' },
  { value: 'DIRECCION', label: 'DIRECCION' },
  { value: 'COPROA', label: 'COPROA' },
  { value: 'ADMINISTRACION', label: 'ADMINISTRACION' },
  { value: 'RECURSOS HUMANOS', label: 'RECURSOS HUMANOS' },
  { value: 'RRHH', label: 'RRHH' },
];

const getUserAreaLabel = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return USER_AREA_OPTIONS.find((option) => option.value === normalized)?.label || normalized || 'Sin área';
};

const PASSWORD_LENGTH = 9;
const USERS_CACHE_KEY = 'agebre:monitoreo:usuarios:v1';

const readSessionCache = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || 'null');
    return Array.isArray(parsed?.items) ? parsed.items : null;
  } catch {
    return null;
  }
};

const writeSessionCache = (key, items) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), items }));
  } catch {
    // Cache best-effort: quota/privacy limits must not block the admin screen.
  }
};

const removeSessionCache = (key) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Cache cleanup must not block user management.
  }
};

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
const sanitizeDocumentByType = (docType, value) => {
  const raw = String(value || '');
  if (docType === 'DNI') return raw.replace(/\D/g, '').slice(0, 8);
  if (docType === 'CE') return raw.replace(/\D/g, '').slice(0, 9);
  return raw.trim();
};
export default function MonitoreoUsuarios() {
  const navigate = useNavigate();
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
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    visible: false,
    message: '',
    tone: 'success',
  });
  const toastTimersRef = useRef({ hide: null, remove: null });
  const revealTimerRef = useRef(null);
  const registerSectionRef = useRef(null);

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
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiryLeewaySeconds = 60;
    const readSession = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();

    if (readSession.error) {
      console.error(`Admin-users: ${forceRefresh ? 'refreshSession' : 'getSession'} error`, readSession.error);
      return '';
    }

    let session = readSession.data?.session || null;
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) {
        console.error('Admin-users: refreshSession error', refreshed.error);
        return '';
      }
      session = refreshed.data?.session || null;
    }

    const expiresAt = Number(session?.expires_at || 0);
    if (!forceRefresh && session?.access_token && expiresAt && expiresAt <= nowSeconds + expiryLeewaySeconds) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) {
        console.error('Admin-users: refreshSession error', refreshed.error);
        return '';
      }
      session = refreshed.data?.session || null;
    }

    return session?.access_token || '';
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
    const initialToken = await getValidAccessToken();
    if (!initialToken) {
      return {
        data: null,
        error: {
          message: 'No hay una sesión válida para invocar la función.',
          context: { status: 401, statusText: 'Invalid JWT' },
        },
      };
    }

    const invokeWithCurrentSession = async (accessToken) => {
      try {
        const debugAuth =
          typeof window !== 'undefined' &&
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        const requesterId = currentAuth?.id || currentProfile?.id || '';
        const requesterEmail = currentAuth?.email || currentProfile?.email || '';
        let authUserId = '';
        let authUserEmail = '';

        if (!requesterId || !requesterEmail) {
          const { data: authUserData } = await supabase.auth.getUser();
          authUserId = authUserData?.user?.id || '';
          authUserEmail = authUserData?.user?.email || '';
        }

        const { data, error } = await supabase.functions.invoke('admin-users', {
          body: {
            ...(body || {}),
            access_token: accessToken,
            requester_id: requesterId || authUserId || '',
            requester_email: requesterEmail || authUserEmail || '',
            requester_doc_number: currentAuth?.docNumber || currentProfile?.doc_number || '',
            ...(debugAuth ? { debug_auth: true } : {}),
          },
          headers: accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
                'x-client-authorization': `Bearer ${accessToken}`,
              }
            : undefined,
        });

        if (error) {
          return { data, error };
        }

        return { data, error: null };
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

    let response = await invokeWithCurrentSession(initialToken);
    if (!response.error || !isFunctionsUnauthorizedError(response.error)) {
      return response;
    }

    const refreshedToken = await getValidAccessToken({ forceRefresh: true });
    if (!refreshedToken) {
      return response;
    }

    response = await invokeWithCurrentSession(refreshedToken);
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

  const loadUsers = async ({ useCache = true } = {}) => {
    const cacheKey = `${USERS_CACHE_KEY}:${currentAuth?.id || currentAuth?.email || currentProfile?.id || 'default'}`;
    if (!useCache) removeSessionCache(cacheKey);
    const cachedUsers = useCache ? readSessionCache(cacheKey) : null;
    if (cachedUsers) {
      setUsers(cachedUsers);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');

    const sessionReady = await ensureAuthSession();
    if (!sessionReady) {
      localStorage.removeItem('monitoreoAuth');
      localStorage.removeItem('monitoreoProfile');
      const message = 'Sesion invalida. Vuelve a iniciar sesion.';
      setError(message);
      showToast(message, 'error');
      if (!cachedUsers) setUsers([]);
      setLoading(false);
      navigate('/login', { replace: true });
      return;
    }

    const { data, error: fnError } = await invokeAdminUsers({ action: 'list' });

    if (fnError) {
      if (isFunctionsUnauthorizedError(fnError)) {
        const details = await readFunctionError(fnError);
        const message =
          details ||
          data?.error ||
          data?.message ||
          'No se pudo validar tu sesion para cargar Equipo. Revisa la configuracion de Edge Function.';
        console.error('Usuarios list unauthorized', fnError);
        setError(message);
        showToast(message, 'error');
        if (!cachedUsers) setUsers([]);
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
      if (!cachedUsers) setUsers([]);
    } else {
      const nextUsers = data?.data || [];
      setUsers(nextUsers);
      writeSessionCache(cacheKey, nextUsers);
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

  useEffect(() => {
    if (form.id) setIsFormExpanded(true);
  }, [form.id]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      const email = (user.email || '').toLowerCase();
      const area = String(user.user_area || '').toLowerCase();
      const term = search.toLowerCase();
      const matchesSearch = !search || fullName.includes(term) || email.includes(term) || area.includes(term);
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
  const totalUsers = users.length;
  const activeUsers = useMemo(() => users.filter((user) => user.status === 'active').length, [users]);
  const pendingUsers = useMemo(() => users.filter((user) => user.status === 'pending').length, [users]);
  const inactiveUsers = useMemo(
    () => users.filter((user) => user.status !== 'active' && user.status !== 'pending').length,
    [users],
  );

  const handleExportCsv = () => {
    const rows = filteredUsers.map((user) => ({
      nombres: user.first_name || '',
      apellidos: user.last_name || '',
      correo: user.email || '',
      area: getUserAreaLabel(user.user_area),
      rol: getRoleLabel(user.role),
      estado:
        user.status === 'active' ? 'Activo' : user.status === 'pending' ? 'Pendiente' : 'Desactivado',
      documento: `${user.doc_type || ''} ${user.doc_number || ''}`.trim(),
      creado: user.created_at ? new Date(user.created_at).toLocaleString() : '',
      actualizado: user.updated_at ? new Date(user.updated_at).toLocaleString() : '',
    }));

    const headers = Object.keys(
      rows[0] || {
        nombres: '',
        apellidos: '',
        correo: '',
        area: '',
        rol: '',
        estado: '',
        documento: '',
        creado: '',
        actualizado: '',
      },
    );

    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `equipo_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const toggleRegisterSection = () => {
    setIsFormExpanded((current) => {
      const next = !current;
      if (next && !form.id) resetForm();
      if (!next && form.id) resetForm();
      return next;
    });

    window.requestAnimationFrame(() => {
      registerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const getStatusMeta = (status) => {
    if (status === 'active') {
      return {
        label: 'Activo',
        className:
          'inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
      };
    }
    if (status === 'pending') {
      return {
        label: 'Pendiente',
        className:
          'inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
      };
    }
    return {
      label: 'Desactivado',
      className:
        'inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
    };
  };

  const getLastConnectionLabel = (user) => {
    if (user.last_sign_in_at) return new Date(user.last_sign_in_at).toLocaleString();
    if (user.updated_at) return new Date(user.updated_at).toLocaleString();
    return 'Sin registros';
  };

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
      user_area: form.userArea,
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
      let updatedUser = data?.data;

      if (form.id) {
        const normalizedArea = String(payload.user_area || '').trim().toUpperCase();
        const { data: verifiedProfile, error: verifyError } = await supabase
          .from('profiles')
          .update({
            user_area: normalizedArea || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', form.id)
          .select('*')
          .maybeSingle();

        if (verifyError) {
          const message =
            verifyError.message ||
            'La función respondió correctamente, pero no se pudo guardar el área del usuario.';
          setError(message);
          showToast(message, 'error');
          return;
        }

        if (!verifiedProfile || String(verifiedProfile.user_area || '') !== normalizedArea) {
          const message = 'No se pudo confirmar la asignación de área del usuario.';
          setError(message);
          showToast(message, 'error');
          return;
        }

        updatedUser = verifiedProfile;
      }

      setSuccess(form.id ? 'Usuario actualizado.' : 'Usuario creado correctamente.');
      if (!form.id) setTempPassword(form.password.trim());
      showToast(successMessage, 'success');
      if (form.id && updatedUser?.id) {
        setUsers((currentUsers) =>
          currentUsers.map((user) =>
            user.id === updatedUser.id || user.user_id === updatedUser.id
              ? { ...user, ...updatedUser }
              : user,
          ),
        );
      }
      resetForm();
      await loadUsers({ useCache: false });
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
      userArea: String(user.user_area || ''),
      role: user.role || 'user',
      status: user.status || 'active',
      docType: user.doc_type || 'DNI',
      docNumber: sanitizeDocumentByType(user.doc_type || 'DNI', user.doc_number || ''),
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

  const handleCopyAllDetails = () => {
    if (!detailsTarget) return;
    const payload = [
      `Nombres: ${detailsTarget.first_name || ''}`,
      `Apellidos: ${detailsTarget.last_name || ''}`,
      `Correo: ${detailsTarget.email || ''}`,
      `Área: ${getUserAreaLabel(detailsTarget.user_area)}`,
      `Tipo documento: ${detailsTarget.doc_type || ''}`,
      `Documento: ${detailsTarget.doc_number || ''}`,
      `Rol: ${getRoleLabel(detailsTarget.role)}`,
      `Estado: ${detailsTarget.status === 'active' ? 'Activo' : 'Desactivado'}`,
      `Creado: ${detailsTarget.created_at ? new Date(detailsTarget.created_at).toLocaleString() : '-'}`,
      `Actualizado: ${detailsTarget.updated_at ? new Date(detailsTarget.updated_at).toLocaleString() : '-'}`,
      `UID: ${detailsTarget.id || ''}`,
    ].join('\n');
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = `${detailsTarget.first_name || 'usuario'}-${detailsTarget.last_name || 'detalle'}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    link.href = url;
    link.download = `ficha-${safeName || 'usuario'}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Ficha descargada', 'success');
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
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 shadow-[0_8px_26px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                    Gestión de Equipo
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Administra los usuarios del sistema, sus permisos y estados de cuenta.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download size={16} />
                    Exportar CSV
                  </button>
                  <button
                    type="button"
                    onClick={toggleRegisterSection}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800"
                  >
                    <UserPlus size={16} />
                    {isFormExpanded ? 'Ocultar Registro' : 'Crear Nuevo Usuario'}
                    {isFormExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <div className="flex min-h-[80px] items-center gap-4 rounded-xl border border-slate-200/70 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="rounded-lg bg-cyan-100 p-3 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                    <Shield size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total usuarios</p>
                    <p className="text-2xl font-bold leading-none text-slate-900 dark:text-slate-100">{totalUsers}</p>
                  </div>
                </div>
                <div className="flex min-h-[80px] items-center gap-4 rounded-xl border border-slate-200/70 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="rounded-lg bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <UserCheck size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Activos</p>
                    <p className="text-2xl font-bold leading-none text-slate-900 dark:text-slate-100">{activeUsers}</p>
                  </div>
                </div>
                <div className="flex min-h-[80px] items-center gap-4 rounded-xl border border-slate-200/70 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="rounded-lg bg-amber-100 p-3 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <AlertTriangle size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pendientes</p>
                    <p className="text-2xl font-bold leading-none text-slate-900 dark:text-slate-100">{pendingUsers}</p>
                  </div>
                </div>
                <div className="flex min-h-[80px] items-center gap-4 rounded-xl border border-slate-200/70 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="rounded-lg bg-rose-100 p-3 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                    <UserX size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Inactivos</p>
                    <p className="text-2xl font-bold leading-none text-slate-900 dark:text-slate-100">{inactiveUsers}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRoleFilter('all')}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        roleFilter === 'all'
                          ? 'border border-cyan-300 bg-cyan-100 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200'
                          : 'border border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      Todos
                    </button>
                    {ROLE_OPTIONS.map((option) => (
                      <button
                        key={`role-chip-${option.value}`}
                        type="button"
                        onClick={() => setRoleFilter(option.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          roleFilter === option.value
                            ? 'border border-cyan-300 bg-cyan-100 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200'
                            : 'border border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Filtrar por nombre o email..."
                        className="h-9 w-[310px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                    </div>
                    <Select id="statusFilter" label="" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">Todos los estados</option>
                      <option value="active">Activo</option>
                      <option value="pending">Pendiente</option>
                      <option value="disabled">Desactivado</option>
                    </Select>
                  </div>
                </div>
              </div>

              <button
                ref={registerSectionRef}
                type="button"
                onClick={() => {
                  setIsFormExpanded((current) => {
                    const next = !current;
                    if (!next && form.id) resetForm();
                    return next;
                  });
                }}
                className={`inline-flex h-10 w-full items-center justify-between rounded-xl border px-4 text-sm font-semibold transition ${
                  isFormExpanded
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-700 dark:border-cyan-500/50 dark:bg-cyan-500/15 dark:text-cyan-200'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <span>{isFormExpanded ? (form.id ? 'Edición de usuario' : 'Registro de usuario') : '+ Registrar usuario'}</span>
                {isFormExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {isFormExpanded ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div
                    className={`rounded-xl border px-4 py-2.5 text-xs ${
                      activeAdminCount <= 1
                        ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                    }`}
                  >
                    <p className="font-semibold">Protección administrativa</p>
                    <p className="mt-1">
                      {activeAdminCount <= 1
                        ? 'No se puede eliminar, desactivar o degradar al último admin activo.'
                        : 'Hay más de un administrador activo en el sistema.'}
                    </p>
                  </div>

                  {isSubmitting ? (
                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800/60">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-500/80" />
                    </div>
                  ) : null}

                  <form onSubmit={handleSubmit} className="mt-4">
                    <fieldset disabled={isSubmitting} className="grid gap-4 md:grid-cols-2 disabled:opacity-80">
                      <Input id="firstName" label="Nombres" value={form.firstName} onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))} placeholder="Nombres" />
                      <Input id="lastName" label="Apellidos" value={form.lastName} onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))} placeholder="Apellidos" />
                      <Select
                        id="userArea"
                        label="Área usuaria"
                        value={form.userArea}
                        onChange={(event) => setForm((prev) => ({ ...prev, userArea: event.target.value }))}
                      >
                        {USER_AREA_OPTIONS.map((option) => (
                          <option key={option.value || 'empty-area'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        id="role"
                        label="Rol"
                        value={form.role}
                        onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                        disabled={isEditingLastActiveAdmin}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Input id="email" label="Correo institucional" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="usuario@ugel.gob.pe" />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select
                          id="docType"
                          label="Tipo documento"
                          value={form.docType}
                          onChange={(event) =>
                            setForm((prev) => {
                              const nextDocType = event.target.value;
                              return {
                                ...prev,
                                docType: nextDocType,
                                docNumber: sanitizeDocumentByType(nextDocType, prev.docNumber),
                              };
                            })
                          }
                        >
                          <option value="DNI">DNI</option>
                          <option value="CE">CE</option>
                        </Select>
                        <Input
                          id="docNumber"
                          label="Documento"
                          value={form.docNumber}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              docNumber: sanitizeDocumentByType(prev.docType, event.target.value),
                            }))
                          }
                          inputMode="numeric"
                          maxLength={form.docType === 'DNI' ? 8 : 9}
                          placeholder={form.docType === 'DNI' ? '8 dígitos' : '9 dígitos'}
                        />
                      </div>

                      <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {form.id ? 'Nueva contraseña (opcional)' : 'Contraseña temporal'}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            id="tempPassword"
                            value={form.password}
                            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                            placeholder="Min. 6 caracteres"
                            className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <button type="button" onClick={handleGeneratePassword} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-400 dark:hover:text-cyan-200" title="Generar contraseña">
                            <RefreshCw size={16} />
                          </button>
                          <button type="button" onClick={handleCopyPassword} disabled={!form.password} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-400 dark:hover:text-cyan-200" title="Copiar contraseña">
                            <Copy size={16} />
                          </button>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Mínimo 6 caracteres. El botón generar crea una clave robusta de 9 caracteres.</span>
                      </label>

                      <Select
                        id="status"
                        label="Estado"
                        value={form.status}
                        onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                        disabled={isEditingLastActiveAdmin}
                      >
                        <option value="active">Activo</option>
                        <option value="pending">Pendiente</option>
                        <option value="disabled">Desactivado</option>
                      </Select>

                      {isEditingLastActiveAdmin ? (
                        <p className="text-xs text-amber-600 dark:text-amber-300">
                          Este usuario es el último administrador activo. El rol y estado están protegidos.
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-end gap-3">
                        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-70" disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                          {isSubmitting ? (form.id ? 'Actualizando...' : 'Guardando...') : form.id ? 'Actualizar usuario' : 'Crear usuario'}
                        </button>
                        {form.id ? (
                          <button type="button" onClick={resetForm} className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200" disabled={isSubmitting}>
                            Cancelar edición
                          </button>
                        ) : null}
                      </div>
                    </fieldset>
                  </form>

                  {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
                  {success ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</p> : null}
                  {tempPassword ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                      Contraseña temporal asignada: <span className="font-semibold">{tempPassword}</span>
                      {copied ? <span className="ml-2 text-emerald-600 dark:text-emerald-300">Copiada</span> : null}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                {loading ? (
                  <div className="p-3">
                    <SkeletonTable rows={8} columns={5} />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">No se encontraron usuarios.</p>
                ) : (
                  <div className="w-full overflow-hidden">
                    <table className="w-full table-fixed border-collapse">
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[14%]" />
                        <col className="w-[13%]" />
                        <col className="w-[16%]" />
                        <col className="w-[10%]" />
                        <col className="w-[17%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80">
                          <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Usuario</th>
                          <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Área</th>
                          <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Rol</th>
                          <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Última conexión</th>
                          <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Estado</th>
                          <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredUsers.map((user) => {
                          const rowId = user.id || user.user_id;
                          const isProtectedAdmin = isUserProtectedLastAdmin(user);
                          const isOwnAccount = currentProfile?.id === rowId;
                          const statusMeta = getStatusMeta(user.status);
                          const fullName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
                          const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'U';
                          return (
                            <tr key={rowId} className="transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/30">
                              <td className="min-w-0 px-4 py-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700 dark:bg-slate-700 dark:text-slate-200">
                                    {initials}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{fullName || 'Sin nombre'}</p>
                                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{user.email || 'Sin correo'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className="block truncate text-[12px] font-semibold uppercase text-slate-700 dark:text-slate-200">
                                  {getUserAreaLabel(user.user_area)}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  <span className="truncate">
                                  {getRoleLabel(user.role)}
                                  </span>
                                </span>
                              </td>
                              <td className="truncate px-3 py-3 text-[12px] text-slate-600 dark:text-slate-300">{getLastConnectionLabel(user)}</td>
                              <td className="px-3 py-3">
                                <span className={statusMeta.className}>{statusMeta.label}</span>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openDetailsModal(user)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-200"
                                    title="Ver detalles"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(user)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                                    title="Editar usuario"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  {user.status === 'active' ? (
                                    <button
                                      type="button"
                                      onClick={() => setDisableTarget({ ...user, id: rowId })}
                                      disabled={isProtectedAdmin}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-600 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-300 dark:hover:bg-amber-500/10"
                                      title={isProtectedAdmin ? 'No puedes desactivar al último administrador activo' : 'Desactivar usuario'}
                                    >
                                      <UserX size={13} />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleActivate(user)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                                      title="Activar usuario"
                                    >
                                      <UserCheck size={13} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openDeleteModal(user)}
                                    disabled={isOwnAccount || isProtectedAdmin}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                    title={
                                      isOwnAccount
                                        ? 'No puedes eliminar tu propia cuenta'
                                        : isProtectedAdmin
                                          ? 'No puedes eliminar al último administrador activo'
                                          : 'Eliminar usuario'
                                    }
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
                  <p>
                    Mostrando {filteredUsers.length} de {totalUsers} usuarios
                  </p>
                  <p>Admins activos: {activeAdminCount}</p>
                </div>
              </div>
            </div>
          </div>

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

          {detailsTarget ? (() => {
            const fullName = `${detailsTarget.first_name || ''} ${detailsTarget.last_name || ''}`.trim() || 'Usuario sin nombre';
            const initials = `${detailsTarget.first_name?.[0] || ''}${detailsTarget.last_name?.[0] || ''}`.toUpperCase() || 'US';
            const isActive = detailsTarget.status === 'active';
            const fields = [
              ['Nombres', detailsTarget.first_name],
              ['Apellidos', detailsTarget.last_name],
              ['Correo Electrónico', detailsTarget.email, true],
              ['Área', getUserAreaLabel(detailsTarget.user_area)],
              ['Rol', getRoleLabel(detailsTarget.role)],
              ['Tipo documento', detailsTarget.doc_type],
              ['Documento', detailsTarget.doc_number],
              ['Última conexión', getLastConnectionLabel(detailsTarget)],
              ['Actualizado', detailsTarget.updated_at ? new Date(detailsTarget.updated_at).toLocaleString() : '-'],
            ];

            return (
              <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-16 backdrop-blur-md md:items-center md:py-6" onClick={closeDetailsModal}>
                <div
                  className="w-full max-w-4xl overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] dark:border-[#a9927d]/45 dark:bg-[#171d23]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 dark:border-[#a9927d]/35 dark:bg-[#151c23]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-200">
                        <Shield size={17} />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-100">Detalle de Usuario</h2>
                    </div>
                    <button
                      type="button"
                      onClick={closeDetailsModal}
                      aria-label="Cerrar detalle de usuario"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      ×
                    </button>
                  </div>

                  <div className="grid gap-5 px-5 py-5 md:grid-cols-[220px_1fr]">
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-[#a9927d]/35 dark:bg-[#22333b]/60 md:flex-col md:items-start">
                      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-white bg-cyan-100 text-lg font-bold text-cyan-800 dark:border-[#171d23] dark:bg-[#22333b] dark:text-cyan-100">
                        {initials}
                        <span className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white dark:border-[#171d23] ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-slate-950 dark:text-slate-50">{fullName}</h3>
                        <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' : 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200'}`}>
                          {isActive ? 'Activo' : 'Desactivado'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <UserCheck size={14} className="text-slate-500 dark:text-[#a9927d]" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-[#d8c4b2]">Datos personales</span>
                        <div className="h-px flex-1 bg-slate-200 dark:bg-[#a9927d]/35" />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {fields.map(([label, value, full]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => copyField(value, label)}
                            className={`${full ? 'sm:col-span-2 lg:col-span-3' : ''} min-w-0 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-left transition hover:border-cyan-500 hover:bg-white dark:border-[#a9927d]/35 dark:bg-[#22333b]/80 dark:hover:border-[#bfa58d] dark:hover:bg-[#22333b]`}
                          >
                            <span className="block text-[11px] font-semibold text-slate-500 dark:text-[#d8c4b2]">{label}</span>
                            <span className="mt-1 block truncate text-sm font-medium text-slate-950 dark:text-slate-100">{value || '-'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-[#a9927d]/35 dark:bg-[#151c23]">
                    <button
                      type="button"
                      onClick={handleCopyAllDetails}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-white dark:border-[#a9927d]/45 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                      <Download size={16} />
                      Descargar Ficha
                    </button>
                    <button
                      type="button"
                      onClick={closeDetailsModal}
                      className="rounded-lg bg-cyan-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600 dark:bg-[#426b69] dark:hover:bg-[#4f7d7a]"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : null}

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


