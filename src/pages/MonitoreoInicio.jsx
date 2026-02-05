import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import { supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';

const getTemplateStatus = (template) => {
  const status = template?.availability ? template.availability.status || 'scheduled' : 'active';
  const startAt = template?.availability?.startAt ? new Date(template.availability.startAt) : null;
  const endAt = template?.availability?.endAt ? new Date(template.availability.endAt) : null;
  const now = new Date();
  if (status === 'closed') return 'closed';
  if (status === 'scheduled') return 'scheduled';
  if (startAt && now < startAt) return 'scheduled';
  if (endAt && now > endAt) return 'closed';
  if (status === 'active') return 'active';
  return startAt || endAt ? 'scheduled' : 'active';
};

export default function MonitoreoInicio() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY));
    } catch {
      return null;
    }
  }, []);
  const isAdmin = auth?.role === 'admin';
  const userId = auth?.email || auth?.docNumber || '';

  const [templates, setTemplates] = useState([]);
  const [instances, setInstances] = useState([]);
  const [showDenied, setShowDenied] = useState(Boolean(location.state?.denied));

  useEffect(() => {
    if (!location.state?.denied) return;
    const timeoutId = setTimeout(() => setShowDenied(false), 3200);
    navigate('/monitoreo/inicio', { replace: true, state: null });
    return () => clearTimeout(timeoutId);
  }, [location.state, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: templatesData, error: templatesError } = await supabase
        .from('monitoring_templates')
        .select('*');
      if (!templatesError) {
        setTemplates(
          (templatesData || []).map((row) => ({
            ...row,
            levelsConfig: row.levels_config,
            availability: row.availability,
          })),
        );
      }

      const query = supabase.from('monitoring_instances').select('*');
      const { data: instancesData, error: instancesError } = isAdmin
        ? await query
        : await query.eq('created_by', userId);
      if (!instancesError) {
        setInstances(instancesData || []);
      }
    };
    fetchData();
  }, [isAdmin, userId]);

  const publishedTemplates = templates.filter((item) => item.status === 'published');
  const activeTemplates = publishedTemplates.filter((item) => getTemplateStatus(item) === 'active');
  const reportCount = instances.length;

  return (
    <div className="flex flex-col gap-8">
      {showDenied ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No tienes permisos para acceder.
        </div>
      ) : null}
      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Inicio"
          title="Panel general"
          description="Acceso rápido a los módulos de monitoreo y resumen de tu actividad."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Monitoreos habilitados
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {activeTemplates.length}
            </p>
            <p className="text-xs text-slate-500">
              {isAdmin ? 'Plantillas disponibles para especialistas' : 'Disponibles para realizar'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Reportes</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{reportCount}</p>
            <p className="text-xs text-slate-500">
              {isAdmin ? 'Totales del sistema' : 'Generados por ti'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Estado</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">Listo</p>
            <p className="text-xs text-slate-500">Sin alertas</p>
          </div>
        </div>
      </Card>
      <Card>
        <SectionHeader
          eyebrow="Sugerencias"
          title="Próximos pasos"
          description="Selecciona un monitoreo existente o crea uno nuevo si tienes permiso de administrador."
        />
      </Card>
    </div>
  );
}
