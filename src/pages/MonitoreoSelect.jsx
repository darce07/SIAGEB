import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, MoveRight, Plus, Share2 } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import { supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';

const getTemplateStatus = (template) => {
  const status = template.availability ? template.availability.status || 'scheduled' : 'active';
  const startAt = template.availability?.startAt ? new Date(template.availability.startAt) : null;
  const endAt = template.availability?.endAt ? new Date(template.availability.endAt) : null;
  const now = new Date();
  if (status === 'closed') return 'closed';
  if (status === 'scheduled') return 'scheduled';
  if (startAt && now < startAt) return 'scheduled';
  if (endAt && now > endAt) return 'closed';
  if (status === 'active') return 'active';
  return startAt || endAt ? 'scheduled' : 'active';
};

const statusLabel = (status) => {
  if (status === 'active') return 'Activo';
  if (status === 'closed') return 'Vencido';
  return 'Programado';
};

const selectTemplate = (templateId) => {
  if (templateId) {
    localStorage.setItem('monitoreoTemplateSelected', templateId);
  } else {
    localStorage.removeItem('monitoreoTemplateSelected');
  }
};

const countQuestions = (sections = []) =>
  sections.reduce((total, section) => total + (section.questions?.length || 0), 0);

export default function MonitoreoSelect() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('monitoreoAuth'));
      return stored?.role === 'admin';
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchTemplates = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('monitoring_templates')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) {
        console.error(error);
        if (active) setTemplates([]);
      } else if (active) {
        const mapped = (data || []).map((row) => ({
          ...row,
          levelsConfig: row.levels_config,
          availability: row.availability,
        }));
        setTemplates(mapped);
      }
      if (active) setIsLoading(false);
    };
    fetchTemplates();
    return () => {
      active = false;
    };
  }, []);

  const visibleTemplates = useMemo(
    () => (isAdmin ? templates : templates.filter((item) => item.status === 'published')),
    [isAdmin, templates],
  );

  const createInstanceForTemplate = async (template) => {
    if (template.status !== 'published') {
      alert('Este monitoreo aún es un borrador.');
      return false;
    }
    const status = getTemplateStatus(template);
    if (status !== 'active') {
      alert('Este monitoreo no está activo. Solo puedes visualizar los resultados.');
      return false;
    }
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    const userId = auth?.email || auth?.docNumber || '';
    if (!userId) {
      alert('No se pudo identificar al usuario. Vuelve a iniciar sesión.');
      return false;
    }
    const { data: existing, error: existingError } = await supabase
      .from('monitoring_instances')
      .select('*')
      .eq('template_id', template.id)
      .eq('created_by', userId)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (!existingError && existing?.length) {
      localStorage.setItem('monitoreoInstanceActive', existing[0].id);
      return true;
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('monitoring_instances')
      .insert([
        {
          template_id: template.id,
          created_by: userId,
          status: 'in_progress',
          data: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .select('*')
      .single();
    if (error) {
      console.error(error);
      alert('No se pudo crear el monitoreo. Inténtalo nuevamente.');
      return false;
    }
    localStorage.setItem('monitoreoInstanceActive', data.id);
    return true;
  };

  const handleDuplicate = async (template) => {
    const now = new Date().toISOString();
    const clone = {
      ...template,
      id: crypto.randomUUID(),
      title: `${template.title} (copia)`,
      status: 'draft',
      created_at: now,
      updated_at: now,
      levels_config: template.levelsConfig,
    };
    const { data, error } = await supabase.from('monitoring_templates').insert([
      {
        id: clone.id,
        title: clone.title,
        description: clone.description,
        status: clone.status,
        levels_config: template.levelsConfig,
        sections: template.sections,
        availability: template.availability,
        created_by: null,
      },
    ]).select('*');
    if (error) {
      console.error(error);
      return;
    }
    const mapped = (data || []).map((row) => ({
      ...row,
      levelsConfig: row.levels_config,
      availability: row.availability,
    }));
    setTemplates((prev) => [...mapped, ...prev]);
  };

  const handleTogglePublish = async (template) => {
    const nextStatus = template.status === 'published' ? 'draft' : 'published';
    const { data, error } = await supabase
      .from('monitoring_templates')
      .update({ status: nextStatus })
      .eq('id', template.id)
      .select('*')
      .single();
    if (error) {
      console.error(error);
      return;
    }
    setTemplates((prev) =>
      prev.map((item) =>
        item.id === template.id
          ? { ...data, levelsConfig: data.levels_config, availability: data.availability }
          : item,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Monitoreos</p>
          <h1 className="text-3xl font-semibold text-slate-100">Elegir monitoreo</h1>
          <p className="text-sm text-slate-400">
            Revisa los monitoreos disponibles y gestiona las plantillas si tienes permisos.
          </p>
        </div>
        {isAdmin ? (
          <Link
            to="/monitoreo/plantillas/nueva"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70"
          >
            <Plus size={14} />
            Crear nuevo monitoreo
          </Link>
        ) : null}
      </div>

      {isLoading ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-slate-400">Cargando monitoreos...</p>
        </Card>
      ) : visibleTemplates.length === 0 ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-slate-400">
            Aun no existen plantillas de monitoreo. Contacta a un administrador.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6">
          {visibleTemplates.map((template) => {
            const status = getTemplateStatus(template);
            const isActive = status === 'active';
            return (
            <Card key={template.id} className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-[220px] flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-100">{template.title}</p>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      template.status !== 'published'
                        ? 'border-slate-700/60 bg-slate-900/60 text-slate-400'
                        : isActive
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        : status === 'closed'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-slate-700/60 bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    {template.status !== 'published' ? 'Borrador' : statusLabel(status)}
                  </span>
                </div>
                {template.description ? (
                  <p className="text-sm text-slate-400">{template.description}</p>
                ) : null}
                {status === 'closed' ? (
                  <p className="text-xs text-amber-200">
                    Monitoreo cerrado: no se pueden agregar ni editar formularios.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>{template.sections?.length || 0} secciones</span>
                  <span>{countQuestions(template.sections)} preguntas</span>
                  <span>Actualizado: {new Date(template.updated_at || template.updatedAt || Date.now()).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate(`/monitoreo/plantillas/${template.id}`)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(template)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                    >
                      <Copy size={14} />
                      Duplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePublish(template)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                    >
                      <Share2 size={14} />
                      {template.status === 'published' ? 'Despublicar' : 'Publicar'}
                    </button>
                  </>
                ) : null}
                {isActive ? (
                  <Link
                    to="/monitoreo/ficha-escritura"
                    onClick={async (event) => {
                      selectTemplate(template.id);
                      const created = await createInstanceForTemplate(template);
                      if (!created) {
                        event.preventDefault();
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:border-sky-400/60 hover:bg-sky-500/20"
                  >
                    Usar plantilla
                    <MoveRight size={14} />
                  </Link>
                ) : status === 'closed' ? (
                  <button
                    type="button"
                    onClick={() => navigate('/monitoreo/reportes')}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                  >
                    Ver resultados
                    <MoveRight size={14} />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-400">
                    Programado
                  </span>
                )}
              </div>
            </Card>
          )})}
        </div>
      )}

    </div>
  );
}
