import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import MonitoreoCard from '../components/monitoreos/MonitoreoCard.jsx';
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

const resolveTemplateDisplayStatus = (template) => {
  if (template.status !== 'published') {
    const status = getTemplateStatus(template);
    return {
      status,
      statusType: 'draft',
      statusText: status === 'active' ? 'Borrador activo' : 'Borrador',
      sortRank: 1,
    };
  }

  const status = getTemplateStatus(template);
  if (status === 'active') {
    return { status, statusType: 'active', statusText: statusLabel(status), sortRank: 0 };
  }
  if (status === 'closed') {
    return { status, statusType: 'closed', statusText: statusLabel(status), sortRank: 3 };
  }
  return { status, statusType: 'scheduled', statusText: statusLabel(status), sortRank: 2 };
};

const compareTemplatesForDisplay = (left, right) => {
  const leftMeta = resolveTemplateDisplayStatus(left);
  const rightMeta = resolveTemplateDisplayStatus(right);

  if (leftMeta.sortRank !== rightMeta.sortRank) {
    return leftMeta.sortRank - rightMeta.sortRank;
  }

  const leftUpdated = new Date(left.updated_at || left.updatedAt || 0).getTime();
  const rightUpdated = new Date(right.updated_at || right.updatedAt || 0).getTime();
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

  return String(left.title || '').localeCompare(String(right.title || ''), 'es', {
    sensitivity: 'base',
  });
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

const formatDateLabel = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('es-PE');
};

export default function MonitoreoSelect() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDrafts, setShowDrafts] = useState(false);
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
    const source = !isAdmin ? published : showDrafts ? templates : published;
    return source.slice().sort(compareTemplatesForDisplay);
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

  const handleUseTemplate = async (template) => {
    selectTemplate(template.id);
    const created = await createInstanceForTemplate(template);
    if (created) navigate('/monitoreo/ficha-escritura');
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
    <div className="flex flex-col gap-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/70 pb-4">
          <div className="flex flex-col gap-1.5">
            <h1 title="Monitoreos" className="max-w-[70ch] truncate text-3xl font-semibold text-slate-100">
              Monitoreos
            </h1>
          </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/45 px-3 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={showDrafts}
                onChange={(event) => setShowDrafts(event.target.checked)}
                className="h-4 w-4 rounded border-slate-500 bg-slate-900"
              />
              Ver borradores
            </label>
          ) : null}
          <Link
            to="/monitoreo/gestion"
            className="ds-btn ds-btn-primary h-9 px-4"
          >
            <Plus size={14} />
            Crear nuevo monitoreo
          </Link>
        </div>
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
            Aun no existen plantillas de monitoreo. Puedes crear una nueva solicitud desde "Crear nuevo monitoreo".
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 [@media(min-width:1100px)]:grid-cols-2">
          {visibleTemplates.map((template) => {
            const { status, statusType, statusText } = resolveTemplateDisplayStatus(template);
            const isActive = status === 'active';
            const templateTitle = String(template.title || 'Monitoreo').trim();
            const templateDescription = String(template.description || '').trim();
            const deadlineLabel = formatDateLabel(template?.availability?.endAt);
            const updatedLabel = formatDateLabel(template.updated_at || template.updatedAt || Date.now());
            const note = status === 'closed'
              ? 'Sin edicion ni nuevos formularios.'
              : '';

            const primaryActionLabel = isActive
              ? 'Usar plantilla'
              : status === 'closed'
                ? 'Ver resultados'
                : 'Programado';
            const primaryActionVariant = isActive
              ? 'primary'
              : status === 'closed'
                ? 'neutral'
                : 'muted';
            const primaryActionDisabled = !isActive && status !== 'closed';
            const onPrimaryAction = isActive
              ? () => handleUseTemplate(template)
              : status === 'closed'
                ? () => navigate('/monitoreo/reportes')
                : undefined;

            const onEdit = isAdmin ? () => navigate(`/monitoreo/plantillas/${template.id}`) : undefined;
            const onDuplicate = isAdmin ? () => handleDuplicate(template) : undefined;
            const onShare = isAdmin ? () => handleTogglePublish(template) : undefined;
            const onDelete = isAdmin ? () => setDeleteTarget(template) : undefined;

            return (
              <MonitoreoCard
                key={template.id}
                title={templateTitle}
                description={templateDescription}
                status={statusType}
                statusLabel={statusText}
                sections={template.sections?.length || 0}
                questions={countQuestions(template.sections)}
                updatedAtLabel={updatedLabel}
                deadlineLabel={deadlineLabel}
                note={note}
                primaryActionLabel={primaryActionLabel}
                primaryActionVariant={primaryActionVariant}
                primaryActionDisabled={primaryActionDisabled}
                onPrimaryAction={onPrimaryAction}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onShare={onShare}
                shareLabel={template.status === 'published' ? 'Despublicar' : 'Publicar'}
                onDelete={onDelete}
              />
            );
          })}
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
