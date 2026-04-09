import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import MonitoreoCard from '../components/monitoreos/MonitoreoCard.jsx';
import { supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';
const TEMPLATE_SHEET_KEY = 'monitoreoTemplateSheetSelected';

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

const selectTemplateSheet = (sheetId) => {
  if (sheetId) {
    localStorage.setItem(TEMPLATE_SHEET_KEY, sheetId);
  } else {
    localStorage.removeItem(TEMPLATE_SHEET_KEY);
  }
};

const getTemplateSheets = (template) => {
  const rows = Array.isArray(template?.levelsConfig?.builder?.sheets)
    ? template.levelsConfig.builder.sheets
    : [];
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  return rows
    .map((sheet, index) => {
      const id = String(sheet?.id || '').trim();
      const questionCount = sections
        .filter((section) => section?.sheetId === id)
        .reduce((total, section) => total + ((section.questions || []).length), 0);
      return {
        id,
        title: String(sheet?.title || '').trim() || `Ficha ${index + 1}`,
        code: String(sheet?.code || '').trim(),
        subtitle: String(sheet?.subtitle || '').trim(),
        questionCount,
      };
    })
    .filter((sheet) => sheet.id);
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
  const [sheetSelection, setSheetSelection] = useState({
    open: false,
    template: null,
    sheets: [],
    selectedSheetId: '',
  });
  const [isOpeningTemplate, setIsOpeningTemplate] = useState(false);

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

        // Safety filter: if a template is linked to an event that is not "monitoring",
        // it must not appear in Monitoreos.
        const mappedIds = mapped.map((item) => item.id).filter(Boolean);
        if (mappedIds.length) {
          const { data: linkedEvents, error: linkedEventsError } = await supabase
            .from('monitoring_events')
            .select('id,event_type')
            .in('id', mappedIds);

          if (!linkedEventsError) {
            const excludedIds = new Set(
              (linkedEvents || [])
                .filter((event) => event?.event_type && event.event_type !== 'monitoring')
                .map((event) => event.id),
            );
            if (excludedIds.size) {
              mapped = mapped.filter((item) => !excludedIds.has(item.id));
            }
          }
        }

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

  const createInstanceForTemplate = async (template, selectedSheetId = '') => {
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
    const now = new Date().toISOString();

    // Reutiliza una instancia en progreso para evitar duplicados al retomar la ficha.
    const { data: existingRows, error: existingError } = await supabase
      .from('monitoring_instances')
      .select('id,data,updated_at')
      .eq('template_id', template.id)
      .eq('created_by', userId)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (existingError) {
      console.error(existingError);
      openNoticeModal(
        'No se pudo continuar',
        'No se pudo validar si ya tienes una ficha en progreso.',
        'warning',
      );
      return false;
    }

    const rows = Array.isArray(existingRows) ? existingRows : [];
    const targetSheetId = String(selectedSheetId || '');
    const matched = rows.find((row) => {
      const rowSheetId = String(row?.data?.meta?.selectedSheetId || '');
      if (!targetSheetId) return true;
      return rowSheetId === targetSheetId;
    });

    if (matched?.id) {
      localStorage.setItem('monitoreoInstanceActive', matched.id);
      return true;
    }

    const { data, error } = await supabase
      .from('monitoring_instances')
      .insert([
        {
          template_id: template.id,
          created_by: userId,
          status: 'in_progress',
          data: {
            meta: {
              selectedSheetId: selectedSheetId || null,
            },
          },
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

  const launchTemplate = async (template, sheetId = '') => {
    setIsOpeningTemplate(true);
    selectTemplate(template.id);
    selectTemplateSheet(sheetId);
    const created = await createInstanceForTemplate(template, sheetId);
    setIsOpeningTemplate(false);
    if (created) {
      setSheetSelection({
        open: false,
        template: null,
        sheets: [],
        selectedSheetId: '',
      });
      navigate('/monitoreo/ficha-escritura');
    }
  };

  const handleUseTemplate = async (template) => {
    const sheets = getTemplateSheets(template);
    if (sheets.length > 1) {
      const storedSheetId = localStorage.getItem(TEMPLATE_SHEET_KEY) || '';
      const selectedSheetId = sheets.some((sheet) => sheet.id === storedSheetId)
        ? storedSheetId
        : sheets[0].id;
      setSheetSelection({
        open: true,
        template,
        sheets,
        selectedSheetId,
      });
      return;
    }

    await launchTemplate(template, sheets[0]?.id || '');
  };

  const closeSheetSelection = () => {
    if (isOpeningTemplate) return;
    setSheetSelection({
      open: false,
      template: null,
      sheets: [],
      selectedSheetId: '',
    });
  };

  const handleConfirmSheetSelection = async () => {
    if (!sheetSelection.template || !sheetSelection.selectedSheetId) return;
    const selectedSheet = sheetSelection.sheets.find((sheet) => sheet.id === sheetSelection.selectedSheetId);
    if (!selectedSheet || selectedSheet.questionCount <= 0) {
      openNoticeModal(
        'Ficha sin preguntas',
        'La ficha seleccionada aun no tiene preguntas. Configurala en Gestion (Etapa 6 y 7) antes de usarla.',
        'warning',
      );
      return;
    }
    await launchTemplate(sheetSelection.template, sheetSelection.selectedSheetId);
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
    <div className="flex min-w-0 flex-col gap-7">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-slate-800/70 pb-4">
          <div className="flex flex-col gap-1.5">
            <h1 title="Monitoreos" className="max-w-[70ch] truncate text-3xl font-semibold text-slate-100">
              Monitoreos
            </h1>
          </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
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
            className="ds-btn ds-btn-primary h-9 w-full px-4 sm:w-auto"
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

      {sheetSelection.open ? (
        <div
          className="ds-modal-backdrop z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Seleccionar ficha"
          onClick={closeSheetSelection}
        >
          <div
            className="ds-modal-surface m-4 w-full max-w-2xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Seleccion de ficha</p>
              <h2 className="text-lg font-semibold text-slate-100">
                {sheetSelection.template?.title || 'Monitoreo'}
              </h2>
              <p className="text-sm text-slate-300">
                Este monitoreo tiene varias fichas. Elige cual deseas completar ahora.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {sheetSelection.sheets.map((sheet) => {
                const isSelected = sheet.id === sheetSelection.selectedSheetId;
                const isEmpty = sheet.questionCount <= 0;
                return (
                  <button
                    key={sheet.id}
                    type="button"
                    onClick={() =>
                      setSheetSelection((prev) => ({ ...prev, selectedSheetId: sheet.id }))
                    }
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-50'
                        : 'border-slate-700/70 bg-slate-900/50 text-slate-200 hover:border-slate-500/80'
                    }`}
                  >
                    <p className="text-sm font-semibold">{sheet.title}</p>
                    {sheet.code ? <p className="text-xs text-slate-400">Codigo: {sheet.code}</p> : null}
                    <p className={`text-xs ${isEmpty ? 'text-amber-300' : 'text-slate-400'}`}>
                      {sheet.questionCount} preguntas configuradas
                    </p>
                    {sheet.subtitle ? <p className="mt-1 text-xs text-slate-400">{sheet.subtitle}</p> : null}
                  </button>
                );
              })}
            </div>

            {(() => {
              const selectedSheet = sheetSelection.sheets.find(
                (sheet) => sheet.id === sheetSelection.selectedSheetId,
              );
              if (!selectedSheet || selectedSheet.questionCount > 0) return null;
              return (
                <p className="mt-3 text-sm text-amber-200">
                  La ficha seleccionada no tiene preguntas. Debes configurarla en Gestion de monitoreos (Etapa 6 y 7).
                </p>
              );
            })()}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeSheetSelection}
                className="ds-btn ds-btn-ghost min-w-[110px]"
                disabled={isOpeningTemplate}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSheetSelection}
                className="ds-btn ds-btn-primary min-w-[180px]"
                disabled={
                  isOpeningTemplate ||
                  !sheetSelection.selectedSheetId ||
                  !sheetSelection.sheets.some(
                    (sheet) =>
                      sheet.id === sheetSelection.selectedSheetId && sheet.questionCount > 0,
                  )
                }
              >
                {isOpeningTemplate ? 'Abriendo ficha...' : 'Continuar con esta ficha'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
