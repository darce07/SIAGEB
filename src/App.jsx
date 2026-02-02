import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import MonitoreoLayout from './routes/MonitoreoLayout.jsx';
import MonitoreoCrearMonitoreo from './pages/MonitoreoCrearMonitoreo.jsx';
import MonitoreoInicio from './pages/MonitoreoInicio.jsx';
import MonitoreoPerfil from './pages/MonitoreoPerfil.jsx';
import MonitoreoReportes from './pages/MonitoreoReportes.jsx';
import MonitoreoSelect from './pages/MonitoreoSelect.jsx';
import FichaEscritura from './pages/FichaEscritura.jsx';
import MonitoreoUsuarios from './pages/MonitoreoUsuarios.jsx';

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

export default function App() {
  useEffect(() => {
    const theme = localStorage.getItem('monitoreoTheme') || 'dark';
    const fontSize = localStorage.getItem('monitoreoFontSize') || 'normal';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.fontSize = fontSize;
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
        <Route path="plantillas/nueva" element={<MonitoreoCrearMonitoreo />} />
        <Route path="plantillas/:templateId" element={<MonitoreoCrearMonitoreo />} />
        <Route path="inicio" element={<MonitoreoInicio />} />
        <Route path="perfil" element={<MonitoreoPerfil />} />
        <Route path="reportes" element={<MonitoreoReportes />} />
        <Route path="usuarios" element={<MonitoreoUsuarios />} />
        <Route path="ficha-escritura" element={<FichaEscritura />} />
      </Route>
      <Route path="*" element={<Navigate to="/monitoreo" replace />} />
    </Routes>
  );
}
