import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import MonitoreoLayout from './routes/MonitoreoLayout.jsx';
import MonitoreoCrearMonitoreo from './pages/MonitoreoCrearMonitoreo.jsx';
import MonitoreoInicio from './pages/MonitoreoInicio.jsx';
import MonitoreoPerfil from './pages/MonitoreoPerfil.jsx';
import MonitoreoReportes from './pages/MonitoreoReportes.jsx';
import MonitoreoSeguimiento from './pages/MonitoreoSeguimiento.jsx';
import MonitoreoSelect from './pages/MonitoreoSelect.jsx';
import FichaEscritura from './pages/FichaEscritura.jsx';
import MonitoreoUsuarios from './pages/MonitoreoUsuarios.jsx';

const AUTH_KEY = 'monitoreoAuth';
const DENSITY_KEY = 'monitoreoDensity';
const DENSITY_COMPACT = 'compact';
const DENSITY_COMFORT = 'comfort';

const hasAuth = () => {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY));
    return Boolean(value?.role);
  } catch {
    return false;
  }
};

const resolveInitialDensity = () => {
  try {
    const storedDensity = localStorage.getItem(DENSITY_KEY);
    if ([DENSITY_COMPACT, DENSITY_COMFORT].includes(storedDensity)) return storedDensity;
  } catch {
    // noop
  }
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
    return DENSITY_COMPACT;
  }
  return DENSITY_COMFORT;
};

function RequireAuth({ children }) {
  const location = useLocation();
  if (!hasAuth()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const location = useLocation();
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (auth?.role === 'admin') return children;
  } catch {
    // noop
  }
  return <Navigate to="/monitoreo/inicio" replace state={{ denied: true, from: location.pathname }} />;
}

export default function App() {
  useEffect(() => {
    const theme = localStorage.getItem('monitoreoTheme') || 'dark';
    const fontSize = localStorage.getItem('monitoreoFontSize') || 'normal';
    const density = resolveInitialDensity();
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.dataset.density = density;
    localStorage.setItem(DENSITY_KEY, density);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/monitoreo"
        element={
          <RequireAuth>
            <MonitoreoLayout />
          </RequireAuth>
        }
      >
        <Route index element={<MonitoreoSelect />} />
        <Route
          path="plantillas/nueva"
          element={(
            <RequireAdmin>
              <MonitoreoCrearMonitoreo />
            </RequireAdmin>
          )}
        />
        <Route
          path="plantillas/:templateId"
          element={(
            <RequireAdmin>
              <MonitoreoCrearMonitoreo />
            </RequireAdmin>
          )}
        />
        <Route path="inicio" element={<MonitoreoInicio />} />
        <Route path="seguimiento" element={<MonitoreoSeguimiento />} />
        <Route path="perfil" element={<MonitoreoPerfil />} />
        <Route path="reportes" element={<MonitoreoReportes />} />
        <Route
          path="usuarios"
          element={(
            <RequireAdmin>
              <MonitoreoUsuarios />
            </RequireAdmin>
          )}
        />
        <Route path="ficha-escritura" element={<FichaEscritura />} />
      </Route>
      <Route path="*" element={<Navigate to="/monitoreo" replace />} />
    </Routes>
  );
}
