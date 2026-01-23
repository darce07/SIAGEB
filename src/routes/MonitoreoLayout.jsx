import { createContext, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, FileText, LayoutDashboard } from 'lucide-react';
import { SIDEBAR_SECTIONS } from '../data/fichaEscritura.js';

export const SidebarContext = createContext({
  activeSection: 'datos',
  setActiveSection: () => {},
});

export default function MonitoreoLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('datos');

  const isFicha = location.pathname.includes('/monitoreo/ficha-escritura');

  const sidebarItems = useMemo(() => {
    if (!isFicha) {
      return [
        {
          id: 'monitoreo',
          label: 'Monitoreo',
          icon: LayoutDashboard,
          action: () => navigate('/monitoreo'),
        },
        {
          id: 'ficha-escritura',
          label: 'Formulario 1',
          icon: FileText,
          action: () => navigate('/monitoreo/ficha-escritura'),
        },
      ];
    }
    return SIDEBAR_SECTIONS.map((section) => ({
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
  }, [isFicha, navigate]);

  return (
    <SidebarContext.Provider value={{ activeSection, setActiveSection }}>
      <div className="flex min-h-screen bg-transparent">
        <aside className="hidden w-72 flex-col border-r border-slate-800/70 bg-slate-950/80 p-6 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300">
              <ClipboardList size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">EduMonitor</p>
              <p className="text-xs text-slate-500">Panel de monitoreo</p>
            </div>
          </div>
          <nav className="mt-10 flex flex-1 flex-col gap-2">
            {sidebarItems.map((item) => {
              const isActive = isFicha ? activeSection === item.id : location.pathname.includes(item.id);
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
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-4 text-xs text-slate-400">
            Sistema de monitoreo con formularios locales y estado persistente.
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          <div className="lg:hidden">
            <div className="glass-panel sticky top-0 z-40 flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-slate-100">Monitoreo</span>
              <NavLink
                to="/monitoreo"
                className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-300"
              >
                Inicio
              </NavLink>
            </div>
          </div>
          <main className="flex-1 px-4 pb-16 pt-6 lg:px-10">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
