import { createContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, ClipboardList, LayoutDashboard, LogOut, Plus, Settings, X } from 'lucide-react';
import { SIDEBAR_SECTIONS } from '../data/fichaEscritura.js';
import { supabase } from '../lib/supabase.js';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

export const SidebarContext = createContext({
  activeSection: 'datos',
  setActiveSection: () => {},
});

export default function MonitoreoLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('datos');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('monitoreoFontSize') || 'normal');
  const [theme, setTheme] = useState(() => localStorage.getItem('monitoreoTheme') || 'dark');
  const [selectedTemplateSections, setSelectedTemplateSections] = useState(null);
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoAuth'));
    } catch {
      return null;
    }
  });
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoProfile')) || {};
    } catch {
      return {};
    }
  });

  const isAdmin = auth?.role === 'admin';
  const displayName = useMemo(() => {
    if (profile?.fullName) return profile.fullName;
    if (profile?.firstName || profile?.lastName) {
      return `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
    }
    if (auth?.name) return auth.name;
    if (auth?.email) return auth.email.split('@')[0];
    if (auth?.docNumber) return auth.docNumber;
    return 'Cargando...';
  }, [auth, profile]);
  const roleLabel = auth?.role === 'admin' ? 'Administrador' : 'Usuario';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  const isFicha = location.pathname.includes('/monitoreo/ficha-escritura');
  const applyPreferences = (nextTheme, nextFontSize) => {
    localStorage.setItem('monitoreoTheme', nextTheme);
    localStorage.setItem('monitoreoFontSize', nextFontSize);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.fontSize = nextFontSize;
  };

  useEffect(() => {
    applyPreferences(theme, fontSize);
  }, [theme, fontSize]);

  useEffect(() => {
    let active = true;
    const ensureSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data?.session) {
        localStorage.removeItem('monitoreoAuth');
        localStorage.removeItem('monitoreoProfile');
        navigate('/login');
      }
    };
    ensureSession();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const handleProfileUpdate = () => {
      try {
        setProfile(JSON.parse(localStorage.getItem('monitoreoProfile')) || {});
        setAuth(JSON.parse(localStorage.getItem('monitoreoAuth')));
      } catch {
        setProfile({});
        setAuth(null);
      }
    };
    window.addEventListener('monitoreo-profile-updated', handleProfileUpdate);
    window.addEventListener('storage', handleProfileUpdate);
    return () => {
      window.removeEventListener('monitoreo-profile-updated', handleProfileUpdate);
      window.removeEventListener('storage', handleProfileUpdate);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      window.addEventListener('keydown', handleKey);
    }
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSettingsOpen]);

  const handleLogout = async () => {
    localStorage.removeItem('monitoreoAuth');
    localStorage.removeItem('monitoreoProfile');
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleResetSettings = () => {
    setTheme('dark');
    setFontSize('normal');
  };

  useEffect(() => {
    let active = true;
    const fetchTemplateSections = async () => {
      if (!isFicha) {
        if (active) setSelectedTemplateSections(null);
        return;
      }
      const selectedId = localStorage.getItem('monitoreoTemplateSelected');
      if (!selectedId) {
        if (active) setSelectedTemplateSections(null);
        return;
      }
      const { data, error } = await supabase
        .from('monitoring_templates')
        .select('sections')
        .eq('id', selectedId)
        .single();
      if (error) {
        console.error(error);
        if (active) setSelectedTemplateSections(null);
        return;
      }
      if (active) setSelectedTemplateSections(data?.sections || null);
    };
    fetchTemplateSections();
    return () => {
      active = false;
    };
  }, [isFicha]);

  const sidebarItems = useMemo(() => {
    if (!isFicha) {
      return [
        {
          id: 'inicio',
          label: 'Inicio',
          icon: LayoutDashboard,
          path: '/monitoreo/inicio',
          action: () => navigate('/monitoreo/inicio'),
        },
        {
          id: 'elegir',
          label: 'Elegir monitoreo',
          icon: ClipboardList,
          path: '/monitoreo',
          action: () => navigate('/monitoreo'),
        },
        {
          id: 'reportes',
          label: 'Reportes y resultados',
          icon: BarChart3,
          path: '/monitoreo/reportes',
          action: () => navigate('/monitoreo/reportes'),
        },
        ...(isAdmin
          ? [
              {
                id: 'usuarios',
                label: 'Usuarios',
                icon: ClipboardList,
                path: '/monitoreo/usuarios',
                action: () => navigate('/monitoreo/usuarios'),
              },
            ]
          : []),
      ];
    }
    let templateSections = SIDEBAR_SECTIONS;
    if (selectedTemplateSections?.length) {
      templateSections = [
        { id: 'datos', label: 'Datos generales' },
        ...selectedTemplateSections.map((section) => ({
          id: section.id,
          label: section.title,
        })),
        { id: 'cierre', label: 'Cierre & Firmas' },
      ];
    }

    return templateSections.map((section) => ({
      id: section.id,
      label: section.label,
      icon: ClipboardList,
      action: () => {
        const element = document.getElementById(section.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }));
  }, [isFicha, navigate, selectedTemplateSections]);

  return (
    <SidebarContext.Provider value={{ activeSection, setActiveSection }}>
      <div className="flex h-screen overflow-hidden bg-transparent">
        <aside className="hidden w-72 flex-col border-r border-slate-800/70 bg-slate-950/80 p-6 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto lg:overscroll-contain">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 text-sm font-semibold text-slate-200">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span>{initials || 'U'}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{displayName || 'Cargando...'}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => navigate('/monitoreo/plantillas/nueva')}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70"
            >
              <Plus size={14} />
              Crear nuevo monitoreo
            </button>
          ) : null}
          <nav className="mt-10 flex flex-1 flex-col gap-2">
            {sidebarItems.map((item) => {
              const isActive = isFicha
                ? activeSection === item.id
                : location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? 'bg-slate-800/70 text-slate-100'
                      : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-3 rounded-xl border border-slate-800/70 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-600/70 hover:text-slate-100"
            >
              <Settings size={14} />
              Ajustes
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('¿Seguro que deseas cerrar sesión?')) {
                  handleLogout();
                }
              }}
              className="inline-flex items-center gap-3 rounded-xl border border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/60 hover:text-amber-100"
            >
              <LogOut size={14} />
              Cerrar sesión
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-xs text-slate-400">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Sistema</p>
            <p className="mt-2">Tus avances se guardan automáticamente.</p>
          </div>
        </aside>
        <div className="login-glow flex flex-1 flex-col overflow-hidden">
          <div className="lg:hidden">
            <div className="glass-panel sticky top-0 z-40 flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-slate-100">Monitoreo</span>
              <div className="flex items-center gap-2">
                <NavLink
                  to="/monitoreo"
                  className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-300"
                >
                  Inicio
                </NavLink>
                {isAdmin ? (
                  <NavLink
                    to="/monitoreo/plantillas/nueva"
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100"
                  >
                    Crear
                  </NavLink>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-300"
                >
                  Ajustes
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-300"
                >
                  Salir
                </button>
              </div>
            </div>
          </div>
          <main className="flex-1 overflow-y-auto overscroll-contain px-4 pb-16 pt-6 scrollbar-thin lg:px-10">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
      {isSettingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/60 backdrop-blur-sm"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="h-full w-full max-w-md border-l border-slate-800/70 bg-slate-950/90 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Ajustes</h2>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-full border border-slate-700/60 p-2 text-slate-300 transition hover:border-slate-500"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Tamaño de texto</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: 'normal', label: 'Normal' },
                    { id: 'large', label: 'Grande' },
                    { id: 'xlarge', label: 'Muy grande' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFontSize(option.id)}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        fontSize === option.id
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                          : 'border-slate-700/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Apariencia</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: 'dark', label: 'Oscuro' },
                    { id: 'light', label: 'Claro' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTheme(option.id)}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        theme === option.id
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                          : 'border-slate-700/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Vista previa aplicada en tiempo real.</p>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Cuenta</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    navigate('/monitoreo/perfil');
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                >
                  Ir a mi perfil
                </button>
              </div>

              <button
                type="button"
                onClick={handleResetSettings}
                className="w-full rounded-xl border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
              >
                Restablecer ajustes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SidebarContext.Provider>
  );
}
