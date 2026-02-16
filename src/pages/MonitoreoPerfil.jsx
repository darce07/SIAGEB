import { useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload } from 'react-router-dom';
import { Loader2, Save } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import { supabase } from '../lib/supabase.js';

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
  const fullName =
    source.fullName ||
    source.full_name ||
    `${firstName} ${lastName}`.trim();

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

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const roleLabel = auth?.role === 'admin' ? 'Administrador' : 'Especialista';

  useEffect(() => {
    const hydrateProfile = async () => {
      const { data: authUser } = await supabase.auth.getUser();
      const user = authUser?.user;
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

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

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const hasUnsavedChanges =
    !isSameProfile(profile, initialProfile) || avatarAction !== 'keep' || Boolean(avatarFile);

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
      firstName: nextProfile.firstName,
      lastName: nextProfile.lastName,
      fullName: nextProfile.fullName,
      avatarUrl: nextProfile.avatarUrl || '',
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
      setProfileError('La imagen supera 3MB. Sube una foto más ligera.');
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
        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(avatarPath, avatarFile, {
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
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase.from('profiles').update(payload).eq('id', profile.id);
      if (updateError) {
        setProfileError(`No se pudieron guardar los cambios: ${updateError.message}`);
        return;
      }

      const nextProfile = {
        ...profile,
        firstName: payload.first_name,
        lastName: payload.last_name,
        fullName: payload.full_name,
        avatarUrl: payload.avatar_url || '',
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

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (isSavingPassword) return;
    setPasswordError('');
    setPasswordSuccess('');

    if (!form.currentPassword.trim()) {
      setPasswordError('Ingresa tu contraseña actual.');
      return;
    }
    if (form.newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    const loginEmail = profile.email || auth?.email;
    if (!loginEmail) {
      setPasswordError('No se encontró el correo de la cuenta actual.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: form.currentPassword.trim(),
      });
      if (signInError) {
        setPasswordError('La contraseña actual es incorrecta.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: form.newPassword,
      });
      if (updateError) {
        setPasswordError(`No se pudo actualizar la contraseña: ${updateError.message}`);
        return;
      }

      setPasswordSuccess('Contraseña actualizada correctamente.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const avatarInitials = (profile.fullName || profile.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeader eyebrow="Cuenta" title="Mi perfil" description="Actualiza tus datos y seguridad." />
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={!hasUnsavedChanges || isSavingProfile}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSavingProfile ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
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
        {profileError ? <p className="text-sm text-rose-400">{profileError}</p> : null}
        {profileSuccess ? <p className="text-sm text-emerald-300">{profileSuccess}</p> : null}
      </Card>

      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Perfil"
          title="Foto de perfil"
          description="Se guarda de forma persistente y se muestra en el panel lateral."
        />
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 text-lg font-semibold text-slate-200">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              <span>{avatarInitials || 'U'}</span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-700/70 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500/80">
                Subir foto
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
                  className="inline-flex items-center justify-center rounded-xl border border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/60"
                >
                  Quitar foto
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">Formatos: JPG, PNG o WEBP. Máximo 3MB.</p>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Seguridad"
          title="Cambiar contraseña"
          description="Solo el propietario de la cuenta puede actualizarla."
        />
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <Input
            id="currentPassword"
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
            }
            placeholder="********"
          />
          <Input
            id="newPassword"
            label="Nueva contraseña"
            type="password"
            value={form.newPassword}
            onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
            placeholder="********"
          />
          <Input
            id="confirmPassword"
            label="Confirmar nueva contraseña"
            type="password"
            value={form.confirmPassword}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
            }
            placeholder="********"
          />
          {passwordError ? <p className="text-sm text-rose-400">{passwordError}</p> : null}
          {passwordSuccess ? <p className="text-sm text-emerald-300">{passwordSuccess}</p> : null}
          <button
            type="submit"
            disabled={isSavingPassword}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 md:w-auto md:px-6"
          >
            {isSavingPassword ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSavingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </Card>

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
