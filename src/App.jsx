import { Navigate, Route, Routes } from 'react-router-dom';
import MonitoreoLayout from './routes/MonitoreoLayout.jsx';
import MonitoreoSelect from './pages/MonitoreoSelect.jsx';
import FichaEscritura from './pages/FichaEscritura.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/monitoreo" replace />} />
      <Route path="/monitoreo" element={<MonitoreoLayout />}>
        <Route index element={<MonitoreoSelect />} />
        <Route path="ficha-escritura" element={<FichaEscritura />} />
      </Route>
      <Route path="*" element={<Navigate to="/monitoreo" replace />} />
    </Routes>
  );
}
