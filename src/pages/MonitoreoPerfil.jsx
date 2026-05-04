import { useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload } from 'react-router-dom';
import { Camera, Info, Loader2, Lock, Save, ShieldCheck, User } from 'lucide-react';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import { supabase } from '../lib/supabase.js';
import { getRoleLabel } from '../lib/roles.js';

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
    documentType: source.documentType || source.document_type || 'DNI',
    documentNumber: source.documentNumber || source.document_number || '',
    phone: source.phone || source.phone_number || source.telefono || '',
    alternateEmail: source.alternateEmail || source.alternate_email || '',
  };
};

const isSameProfile = (left, right) =>
  left.firstName === right.firstName &&
  left.lastName === right.lastName &&
  left.fullName === right.fullName &&
  left.avatarUrl === right.avatarUrl &&
  left.documentType === right.documentType &&
  left.documentNumber === right.documentNumber &&
  left.phone === right.phone &&
  left.alternateEmail === right.alternateEmail;

export default function MonitoreoPerfil() {
  const auth = useMemo(() => readLocalJson('monitoreoAuth', {}), []);
  const storedProfile = useMemo(() => readLocalJson('monitoreoProfile', {}), []);
  const [profile, setProfile] = useState(() => toProfileDraft(storedProfile, auth));
  const [initialProfile, setInitialProfile] = useState(() => toProfileDraft(storedProfile, auth));
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarAction, setAvatarAction] = useState('keep');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const nextLocationRef = useRef('');

  const roleLabel = getRoleLabel(auth?.role);

  useEffect(() => {
    const hydrateProfile = async () => {
      const { data: authUser } = await supabase.auth.getUser();
      const user = authUser?.user;
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

    hydrateProfile();
  }, [auth]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const hasUnsavedChanges = !isSameProfile(profile, initialProfile) || avatarAction !== 'keep' || Boolean(avatarFile);

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
      const target = event.target.closest('a[href]');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href === window.location.pathname) return;
      event.preventDefault();
      nextLocationRef.current = href;
      setShowUnsavedModal(true);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [hasUnsavedChanges]);

  const persistProfile = (nextProfile) => {
    const existing = readLocalJson('monitoreoProfile', {});
    const serialized = {
      ...existing,
      id: nextProfile.id,
      email: nextProfile.email,
      first_name: nextProfile.firstName,
      last_name: nextProfile.lastName,
      full_name: nextProfile.fullName,
      avatar_url: nextProfile.avatarUrl || null,
      document_type: nextProfile.documentType || 'DNI',
      document_number: nextProfile.documentNumber || '',
      phone_number: nextProfile.phone || '',
      alternate_email: nextProfile.alternateEmail || '',
      firstName: nextProfile.firstName,
      lastName: nextProfile.lastName,
      fullName: nextProfile.fullName,
      avatarUrl: nextProfile.avatarUrl || '',
      documentType: nextProfile.documentType || 'DNI',
      documentNumber: nextProfile.documentNumber || '',
      phone: nextProfile.phone || '',
      alternateEmail: nextProfile.alternateEmail || '',
    };
    localStorage.setItem('monitoreoProfile', JSON.stringify(serialized));

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
        next.fullName = `${field === 'firstName' ? value : next.firstName} ${field === 'lastName' ? value : next.lastName}`.trim();
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

  const handleSaveProfile = async () => {
    setProfileError('');
    setProfileSuccess('');

    if (!profile.id) {
      setProfileError('No se pudo identificar el usuario de perfil.');
      return;
    }

    setIsSavingProfile(true);
    try {
      let avatarUrl = initialProfile.avatarUrl || null;
      const avatarPath = getAvatarPath(profile.id);

      if (avatarAction === 'replace' && avatarFile) {
        const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath, avatarFile, {
          upsert: true,
          contentType: avatarFile.type,
          cacheControl: '3600',
        });

        if (uploadError) {
          setProfileError(`No se pudo subir la foto: ${uploadError.message}`);
          return;
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
        document_type: profile.documentType || 'DNI',
        document_number: profile.documentNumber?.trim() || '',
        phone: profile.phone?.trim() || '',
        alternate_email: profile.alternateEmail?.trim() || '',
        updated_at: new Date().toISOString(),
      };

      let { error: updateError } = await supabase.from('profiles').update(payload).eq('id', profile.id);
      if (updateError) {
        const fallbackPayload = {
          first_name: payload.first_name,
          last_name: payload.last_name,
          full_name: payload.full_name,
          avatar_url: payload.avatar_url,
          updated_at: payload.updated_at,
        };
        const fallback = await supabase.from('profiles').update(fallbackPayload).eq('id', profile.id);
        if (fallback.error) {
          setProfileError(`No se pudieron guardar los cambios: ${updateError.message}`);
          return;
        }
        updateError = null;
      }

      const nextProfile = {
        ...profile,
        firstName: payload.first_name,
        lastName: payload.last_name,
        fullName: payload.full_name,
        avatarUrl: payload.avatar_url || '',
        documentType: payload.document_type || 'DNI',
        documentNumber: payload.document_number || '',
        phone: payload.phone || '',
        alternateEmail: payload.alternate_email || '',
      };
      setProfile(nextProfile);
      setInitialProfile(nextProfile);
      setAvatarAction('keep');
      setAvatarFile(null);
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
        setAvatarPreview('');
      }
      persistProfile(nextProfile);
      setProfileSuccess('Cambios guardados correctamente.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const avatarInitials = (profile.fullName || profile.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const statusChip = auth?.active === false ? 'Inactivo' : 'Activo';
  const profileChecks = useMemo(() => {
    const checks = [
      { key: 'photo', label: 'Foto de perfil', done: Boolean(profile.avatarUrl) },
      { key: 'doc', label: 'Documento', done: Boolean(profile.documentType && profile.documentNumber) },
      { key: 'phone', label: 'Telefono de contacto', done: Boolean(profile.phone?.trim()) },
      { key: 'mail1', label: 'Correo institucional', done: Boolean((profile.email || auth?.email || '').trim()) },
      { key: 'mail2', label: 'Correo alternativo', done: Boolean(profile.alternateEmail?.trim()) },
      { key: 'name', label: 'Nombre completo', done: Boolean(profile.firstName?.trim() && profile.lastName?.trim()) },
    ];
    const doneCount = checks.filter((item) => item.done).length;
    const percent = Math.round((doneCount / checks.length) * 100);
    return { checks, percent };
  }, [profile, auth]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-2 md:p-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-slate-200 shadow-[0_12px_12px_-4px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-cyan-300" />
            <p className="text-sm">{hasUnsavedChanges ? 'Cambios sin guardar en la seccion de datos personales.' : 'Perfil sincronizado correctamente.'}</p>
          </div>
          {hasUnsavedChanges ? (
            <button
              type="button"
              onClick={() => {
                setProfile(initialProfile);
                setAvatarAction('keep');
                setAvatarFile(null);
                setProfileError('');
                setProfileSuccess('Cambios descartados.');
              }}
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 hover:text-white"
            >
              DESCARTAR
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-[0_12px_12px_-4px_rgba(15,23,42,0.24)]">
        <div className="flex flex-col items-center gap-5 md:flex-row">
          <div className="relative">
            <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-slate-700 bg-slate-800 text-slate-100">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold">{avatarInitials || 'U'}</div>
              )}
            </div>
            <label className="absolute bottom-1 right-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-cyan-600 text-white shadow-lg hover:bg-cyan-500">
              <Camera size={16} />
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoChange} />
            </label>
          </div>
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-slate-100">{profile.fullName || 'Usuario'}</h2>
            <p className="text-slate-400">{roleLabel}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">{statusChip}</span>
              <span className="rounded-full bg-slate-700/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-200">Admin</span>
              {profile.avatarUrl ? (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="rounded-full border border-amber-400/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200 hover:border-amber-300"
                >
                  Quitar foto
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-[0_12px_12px_-4px_rgba(15,23,42,0.24)]">
            <div className="mb-5 flex items-center gap-2 text-slate-100">
              <User size={16} className="text-cyan-300" />
              <h3 className="text-lg font-semibold">Datos Personales</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nombres</label>
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(event) => handleFieldChange('firstName', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Apellidos</label>
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(event) => handleFieldChange('lastName', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tipo de documento</label>
                <select
                  value={profile.documentType || 'DNI'}
                  onChange={(event) => handleFieldChange('documentType', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                  <option value="Pasaporte">Pasaporte</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Numero de documento</label>
                <input
                  type="text"
                  value={profile.documentNumber || ''}
                  onChange={(event) => handleFieldChange('documentNumber', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Telefono de contacto</label>
                <input
                  type="text"
                  value={profile.phone || ''}
                  onChange={(event) => handleFieldChange('phone', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Correo institucional</label>
                <input
                  type="email"
                  value={profile.email || auth?.email || ''}
                  disabled
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Correo alternativo</label>
                <input
                  type="email"
                  value={profile.alternateEmail || ''}
                  onChange={(event) => handleFieldChange('alternateEmail', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            {profileError ? <p className="mt-4 text-sm text-rose-300">{profileError}</p> : null}
            {profileSuccess ? <p className="mt-4 text-sm text-emerald-300">{profileSuccess}</p> : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!hasUnsavedChanges || isSavingProfile}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {isSavingProfile ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-[0_12px_12px_-4px_rgba(15,23,42,0.24)]">
            <div className="mb-3 flex items-center gap-2 text-slate-100">
              <ShieldCheck size={16} className="text-emerald-300" />
              <h4 className="font-semibold">Estado de cuenta</h4>
            </div>
            <p className="mb-4 text-sm text-slate-300">Tu identidad fue validada y la cuenta se encuentra habilitada.</p>
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-300" /> VERIFICADO
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-700 to-cyan-900 p-5 shadow-xl">
            <div className="mb-2 flex items-center gap-2 text-white">
              <Lock size={16} />
              <h4 className="font-semibold">Seguridad</h4>
            </div>
            <p className="text-sm text-cyan-50/90">Actualiza tu contrasena periodicamente para mejorar la proteccion de tu cuenta.</p>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-[0_12px_12px_-4px_rgba(15,23,42,0.24)]">
            <div className="mb-2 flex items-end justify-between">
              <span className="text-sm font-semibold text-slate-100">Perfil completado</span>
              <span className="text-xl font-bold text-cyan-300">{profileChecks.percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/70">
              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${profileChecks.percent}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {profileChecks.checks.map((item) => (
                <li key={item.key} className={`text-xs ${item.done ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {item.done ? '✓' : '○'} {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showUnsavedModal}
        tone="warning"
        title="Cambios sin guardar"
        description="Tienes cambios sin guardar en tu perfil."
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
    </div>
  );
}
