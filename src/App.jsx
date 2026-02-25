import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import MonitoreoLayout from './routes/MonitoreoLayout.jsx';
import MonitoreoCrearMonitoreo from './pages/MonitoreoCrearMonitoreo.jsx';
import MonitoreoInicio from './pages/MonitoreoInicio.jsx';
import MonitoreoConfiguracion from './pages/MonitoreoConfiguracion.jsx';
import MonitoreoReportes from './pages/MonitoreoReportes.jsx';
import MonitoreoSeguimiento from './pages/MonitoreoSeguimiento.jsx';
import MonitoreoSelect from './pages/MonitoreoSelect.jsx';
import FichaEscritura from './pages/FichaEscritura.jsx';
import MonitoreoUsuarios from './pages/MonitoreoUsuarios.jsx';
import MonitoreoInstituciones from './pages/MonitoreoInstituciones.jsx';
import {
  applyVisualPreferences,
  resolveDensityPreference,
  resolveFontSizePreference,
  resolveThemePreference,
  readBooleanSetting,
  HIGH_CONTRAST_STORAGE_KEY,
  REDUCE_MOTION_STORAGE_KEY,
} from './lib/settings.js';

const AUTH_KEY = 'monitoreoAuth';

const hasAuth = () => {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY));
    return Boolean(value?.role);
  } catch {
    return false;
  }
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
    const themePreference = resolveThemePreference();
    const fontSize = resolveFontSizePreference();
    const density = resolveDensityPreference();
    const highContrast = readBooleanSetting(HIGH_CONTRAST_STORAGE_KEY, false);
    const reduceMotion = readBooleanSetting(REDUCE_MOTION_STORAGE_KEY, false);
    applyVisualPreferences({
      themePreference,
      fontSize,
      density,
      highContrast,
      reduceMotion,
    });
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
        <Route path="configuracion" element={<MonitoreoConfiguracion />} />
        <Route path="perfil" element={<Navigate to="/monitoreo/configuracion?seccion=cuenta" replace />} />
        <Route path="reportes" element={<MonitoreoReportes />} />
        <Route
          path="instituciones"
          element={(
            <RequireAdmin>
              <MonitoreoInstituciones />
            </RequireAdmin>
          )}
        />
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
