import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Loader2, MoveRight, Plus, Share2, Trash2 } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
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

const mapEventStatusToAvailabilityStatus = (status) => {
  if (status === 'closed') return 'closed';
  if (status === 'hidden') return 'hidden';
  return 'active';
};

const truncateLabel = (value, maxChars = 70) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
};

export default function MonitoreoSelect() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDrafts, setShowDrafts] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [noticeModal, setNoticeModal] = useState({
    open: false,
    title: '',
    description: '',
    tone: 'warning',
  });

  const openNoticeModal = (title, description, tone = 'warning') => {
    setNoticeModal({
      open: true,
      title,
      description,
      tone,
    });
  };

  const closeNoticeModal = () => {
    setNoticeModal({
      open: false,
      title: '',
      description: '',
      tone: 'warning',
    });
  };

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
        let mapped = (data || []).map((row) => ({
          ...row,
          levelsConfig: row.levels_config,
          availability: row.availability,
        }));

        // Ensure monitoring events created from Seguimiento also exist as draft templates.
        const { data: monitoringEvents, error: eventsError } = await supabase
          .from('monitoring_events')
          .select('id,title,description,start_at,end_at,status,created_by,created_at,updated_at,event_type')
          .eq('event_type', 'monitoring')
          .order('updated_at', { ascending: false });

        if (!eventsError) {
          const templateIds = new Set(mapped.map((item) => item.id));
          const missingTemplates = (monitoringEvents || [])
            .filter((event) => !templateIds.has(event.id))
            .map((event) => ({
              id: event.id,
              title: event.title || 'Monitoreo sin titulo',
              description: event.description || null,
              status: 'draft',
              levels_config: { type: 'standard', levels: [] },
              sections: [],
              availability: {
                status: mapEventStatusToAvailabilityStatus(event.status),
                startAt: event.start_at,
                endAt: event.end_at,
              },
              created_by: event.created_by || null,
              created_at: event.created_at || new Date().toISOString(),
              updated_at: event.updated_at || new Date().toISOString(),
            }));

          if (missingTemplates.length) {
            const { data: insertedTemplates, error: insertMissingError } = await supabase
              .from('monitoring_templates')
              .upsert(missingTemplates, { onConflict: 'id' })
              .select('*');

            if (!insertMissingError) {
              const insertedMapped = (insertedTemplates || []).map((row) => ({
                ...row,
                levelsConfig: row.levels_config,
                availability: row.availability,
              }));
              mapped = [...insertedMapped, ...mapped];
            }
          }
        }

        setTemplates(mapped);
      }
      if (active) setIsLoading(false);
    };
    fetchTemplates();
    return () => {
      active = false;
    };
  }, []);

  const visibleTemplates = useMemo(() => {
    const published = templates.filter((item) => item.status === 'published');
    if (!isAdmin) return published;
    return showDrafts ? templates : published;
  }, [isAdmin, showDrafts, templates]);

  const createInstanceForTemplate = async (template) => {
    if (template.status !== 'published') {
      openNoticeModal(
        'Monitoreo no disponible',
        'Este monitoreo aun es un borrador.',
        'warning',
      );
      return false;
    }
    const status = getTemplateStatus(template);
    if (status !== 'active') {
      openNoticeModal(
        'Monitoreo no activo',
        'Este monitoreo no esta activo. Solo puedes visualizar los resultados.',
        'warning',
      );
      return false;
    }
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    const userId = auth?.email || auth?.docNumber || '';
    if (!userId) {
      openNoticeModal(
        'Sesion no valida',
        'No se pudo identificar al usuario. Vuelve a iniciar sesion.',
        'danger',
      );
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
      openNoticeModal(
        'No se pudo crear',
        'No se pudo crear el monitoreo. Intentalo nuevamente.',
        'danger',
      );
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

  const handleDeleteTemplate = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const targetId = deleteTarget.id;

      // Remove event children first to avoid FK issues on schemas without cascade.
      const relationTables = ['monitoring_event_responsibles', 'monitoring_event_objectives'];
      for (const tableName of relationTables) {
        const { error: relationError } = await supabase
          .from(tableName)
          .delete()
          .eq('event_id', targetId);
        if (relationError) throw relationError;
      }

      const { error: deleteEventError } = await supabase
        .from('monitoring_events')
        .delete()
        .eq('id', targetId);
      if (deleteEventError) throw deleteEventError;

      const { error: deleteTemplateError } = await supabase
        .from('monitoring_templates')
        .delete()
        .eq('id', targetId);
      if (deleteTemplateError) throw deleteTemplateError;

      setTemplates((prev) => prev.filter((item) => item.id !== targetId));
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      openNoticeModal(
        'No se pudo eliminar',
        'No se pudo eliminar el monitoreo de forma permanente. Intentalo nuevamente.',
        'danger',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Monitoreos</p>
          <h1 title="Monitoreos" className="max-w-[70ch] truncate text-3xl font-semibold text-slate-100">
            Monitoreos
          </h1>
          <p
            title="Gestiona plantillas y monitoreos"
            className="max-w-[70ch] truncate text-sm text-slate-400/90"
          >
            Gestiona plantillas y monitoreos
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={showDrafts}
                onChange={(event) => setShowDrafts(event.target.checked)}
                className="h-4 w-4 rounded border-slate-500 bg-slate-900"
              />
              Ver borradores
            </label>
            <Link
              to="/monitoreo/plantillas/nueva"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70"
            >
              <Plus size={14} />
              Crear nuevo monitoreo
            </Link>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-cyan-200">
            <Loader2 size={16} className="animate-spin" />
            <p>Cargando monitoreos...</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full border border-slate-700/60 bg-slate-900/70">
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-cyan-400/70" />
          </div>
          <div className="space-y-2" aria-hidden="true">
            <div className="h-3 w-2/3 animate-pulse rounded-lg bg-slate-800/80" />
            <div className="h-3 w-1/2 animate-pulse rounded-lg bg-slate-800/65" />
          </div>
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
            const templateTitle = String(template.title || 'Monitoreo').trim();
            const titleDisplay = truncateLabel(templateTitle, 70);
            const templateDescription = String(template.description || '').trim();
            const isDescriptionExpanded = Boolean(expandedDescriptions[template.id]);
            const shouldShowDescriptionToggle = templateDescription.length > 150;
            return (
            <Card key={template.id} className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-[220px] flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p title={templateTitle} className="max-w-[70ch] truncate text-sm font-semibold text-slate-100">
                    {titleDisplay}
                  </p>
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
                    {template.status !== 'published'
                      ? status === 'active'
                        ? 'Borrador activo'
                        : 'Borrador'
                      : statusLabel(status)}
                  </span>
                </div>
                {templateDescription ? (
                  <div className="space-y-1">
                    <p
                      title={templateDescription}
                      className={`text-sm text-slate-400 ${isDescriptionExpanded ? '' : 'overflow-hidden'}`}
                      style={
                        isDescriptionExpanded
                          ? undefined
                          : {
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }
                      }
                    >
                      {templateDescription}
                    </p>
                    {shouldShowDescriptionToggle ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDescriptions((prev) => ({
                            ...prev,
                            [template.id]: !prev[template.id],
                          }))
                        }
                        className="text-xs font-semibold text-cyan-200 underline decoration-cyan-400/70 underline-offset-4"
                      >
                        {isDescriptionExpanded ? 'Ver menos' : 'Ver mas'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {status === 'closed' ? (
                  <p title="Monitoreo cerrado: no se pueden agregar ni editar formularios." className="truncate text-xs text-amber-200">
                    Monitoreo cerrado: sin edicion ni nuevos formularios.
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
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(template)}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/70"
                    >
                      <Trash2 size={14} />
                      Eliminar
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

      <ConfirmModal
        open={Boolean(deleteTarget)}
        tone="danger"
        title="Eliminar monitoreo"
        description="Esta accion es irreversible. Se eliminara el borrador o plantilla."
        details={deleteTarget?.title || ''}
        confirmText={isDeleting ? 'Eliminando...' : 'Si, eliminar'}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTemplate}
        loading={isDeleting}
      />

      <ConfirmModal
        open={noticeModal.open}
        tone={noticeModal.tone}
        title={noticeModal.title || 'Aviso'}
        description={noticeModal.description}
        confirmText="Entendido"
        cancelText="Cerrar"
        onCancel={closeNoticeModal}
        onConfirm={closeNoticeModal}
      />
    </div>
  );
}
