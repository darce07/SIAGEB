import { useMemo, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';

export default function MonitoreoPerfil() {
  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoAuth'));
    } catch {
      return null;
    }
  }, []);
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoProfile')) || {};
    } catch {
      return {};
    }
  });
  const [photoError, setPhotoError] = useState('');
  const [photoSuccess, setPhotoSuccess] = useState('');

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (form.newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSuccess('Contraseña actualizada correctamente.');
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const persistProfile = (nextProfile) => {
    localStorage.setItem('monitoreoProfile', JSON.stringify(nextProfile));
    setProfile(nextProfile);
    window.dispatchEvent(new Event('monitoreo-profile-updated'));
  };

  const handlePhotoChange = (event) => {
    setPhotoError('');
    setPhotoSuccess('');
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setPhotoError('Formato no permitido. Sube una imagen JPG, PNG o WEBP.');
      return;
    }
    const maxSizeMb = 3;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setPhotoError(`La imagen supera ${maxSizeMb}MB. Usa una foto más ligera.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextProfile = { ...profile, avatarUrl: reader.result };
      persistProfile(nextProfile);
      setPhotoSuccess('Foto de perfil actualizada.');
    };
    reader.onerror = () => {
      setPhotoError('No se pudo cargar la imagen. Intenta con otra foto.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    const nextProfile = { ...profile };
    delete nextProfile.avatarUrl;
    persistProfile(nextProfile);
    setPhotoSuccess('Foto eliminada.');
    setPhotoError('');
  };

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Cuenta"
          title="Mi perfil"
          description="Actualiza tus datos y seguridad."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            id="correo"
            label="Correo institucional"
            value={auth?.email || auth?.docNumber || 'usuario@ugel.gob.pe'}
            disabled
          />
          <Input id="rol" label="Rol" value={auth?.role || 'usuario'} disabled />
        </div>
      </Card>

      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Perfil"
          title="Foto de perfil"
          description="Actualiza la imagen que verás en el panel lateral."
        />
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 text-lg font-semibold text-slate-200">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              <span>{(auth?.email || auth?.docNumber || 'U').slice(0, 2).toUpperCase()}</span>
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
              {profile?.avatarUrl ? (
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
            {photoError ? <p className="text-sm text-rose-400">{photoError}</p> : null}
            {photoSuccess ? <p className="text-sm text-emerald-300">{photoSuccess}</p> : null}
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Seguridad"
          title="Cambiar contraseña"
          description="Solo el propietario de la cuenta puede actualizarla."
        />
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="currentPassword"
            label="Contraseña actual"
            type="password"
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
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white md:w-auto md:px-6"
          >
            Actualizar contraseña
          </button>
        </form>
      </Card>
    </div>
  );
}
