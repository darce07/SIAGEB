import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, Plus, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import Textarea from '../components/ui/Textarea.jsx';
import { LEVEL_INFO } from '../data/fichaEscritura.js';
import { supabase } from '../lib/supabase.js';

const defaultLevels = [
  { key: 'L1', label: 'Nivel 1', description: LEVEL_INFO[0]?.text || '' },
  { key: 'L2', label: 'Nivel 2', description: LEVEL_INFO[1]?.text || '' },
  { key: 'L3', label: 'Nivel 3', description: LEVEL_INFO[2]?.text || '' },
];

const insertIntermediate = (levels, key, label) => {
  if (levels.some((level) => level.key === key)) return levels;
  const next = [...levels];
  const insertIndex = key === 'L1_2' ? 1 : 3;
  next.splice(insertIndex, 0, { key, label, description: '' });
  return next;
};

const removeIntermediate = (levels, key) => levels.filter((level) => level.key !== key);

const buildQuestion = () => ({
  id: crypto.randomUUID(),
  text: '',
  order: 0,
  responseType: 'scale_1_3',
  allowObservation: true,
});

const buildSection = () => ({
  id: crypto.randomUUID(),
  title: 'Nueva seccion',
  order: 0,
  questions: [buildQuestion()],
});

const hydrateOrders = (sections) =>
  sections.map((section, sectionIndex) => ({
    ...section,
    order: sectionIndex,
    questions: (section.questions || []).map((question, index) => ({
      ...question,
      order: index,
    })),
  }));

const mapAvailabilityToEventStatus = (status) => {
  if (status === 'closed') return 'closed';
  if (status === 'hidden') return 'hidden';
  return 'active';
};

const MONITOR_ROLE_SET = new Set(['user', 'especialista', 'jefe_area']);

const sanitizeAssignedMonitorIds = (values) => {
  const safeValues = Array.isArray(values) ? values : [];
  return [...new Set(safeValues.map((value) => String(value || '').trim()).filter(Boolean))];
};

const mapMonitorProfile = (row) => {
  const fullName = String(row?.full_name || '').trim();
  const composed = [row?.first_name, row?.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    id: String(row?.id || '').trim(),
    name: fullName || composed || String(row?.email || '').trim() || 'Monitor sin nombre',
    email: String(row?.email || '').trim(),
  };
};

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

export default function MonitoreoCrearMonitoreo() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const isCreatingTemplate = !templateId;
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(!!templateId);
  const isAdmin = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('monitoreoAuth'));
      return stored?.role === 'admin';
    } catch {
      return false;
    }
  }, []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState(hydrateOrders([buildSection()]));
  const [levels, setLevels] = useState(defaultLevels);
  const [startAt, setStartAt] = useState(
    '',
  );
  const [endAt, setEndAt] = useState(
    '',
  );
  const [cddEnabled, setCddEnabled] = useState(false);
  const [cddArea, setCddArea] = useState('');
  const [availabilityStatus, setAvailabilityStatus] = useState(
    'active',
  );
  const [monitorCatalog, setMonitorCatalog] = useState([]);
  const [assignedMonitorIds, setAssignedMonitorIds] = useState([]);
  const [monitorSearch, setMonitorSearch] = useState('');
  const [isMonitorsLoading, setIsMonitorsLoading] = useState(false);
  const [deleteSectionTarget, setDeleteSectionTarget] = useState(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);
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

  useEffect(() => {
    let active = true;
    const fetchTemplate = async () => {
      if (!templateId) {
        setEditingTemplate(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const { data, error } = await supabase
        .from('monitoring_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      if (error) {
        console.error(error);
        if (active) setEditingTemplate(null);
      } else if (active) {
        setEditingTemplate({
          ...data,
          levelsConfig: data.levels_config,
          availability: data.availability,
        });
      }
      if (active) setIsLoading(false);
    };
    fetchTemplate();
    return () => {
      active = false;
    };
  }, [templateId]);

  useEffect(() => {
    let active = true;
    const fetchMonitors = async () => {
      if (!isAdmin) {
        if (active) setMonitorCatalog([]);
        return;
      }

      setIsMonitorsLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id,first_name,last_name,full_name,email,role,status')
        .eq('status', 'active');
      if (!active) return;

      if (error) {
        console.error(error);
        setMonitorCatalog([]);
      } else {
        const mapped = (data || [])
          .filter((row) => MONITOR_ROLE_SET.has(String(row?.role || '').toLowerCase()))
          .map(mapMonitorProfile)
          .filter((item) => item.id)
          .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' }));
        setMonitorCatalog(mapped);
      }
      setIsMonitorsLoading(false);
    };

    fetchMonitors();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    let active = true;
    const fetchAssignments = async () => {
      if (!templateId || !isAdmin) {
        if (active) setAssignedMonitorIds([]);
        return;
      }
      const { data, error } = await supabase
        .from('monitoring_template_monitors')
        .select('user_id')
        .eq('template_id', templateId);
      if (!active) return;
      if (error) {
        console.error(error);
        setAssignedMonitorIds([]);
      } else {
        setAssignedMonitorIds(sanitizeAssignedMonitorIds((data || []).map((item) => item.user_id)));
      }
    };
    fetchAssignments();
    return () => {
      active = false;
    };
  }, [templateId, isAdmin]);

  useEffect(() => {
    if (!editingTemplate) {
      setTitle('');
      setDescription('');
      setSections(hydrateOrders([buildSection()]));
      setLevels(defaultLevels);
      setStartAt('');
      setEndAt('');
      setCddEnabled(false);
      setCddArea('');
      setAvailabilityStatus('active');
      if (!templateId) {
        setAssignedMonitorIds([]);
      }
      setMonitorSearch('');
      return;
    }
    setTitle(editingTemplate.title || '');
    setDescription(editingTemplate.description || '');
    setSections(hydrateOrders(editingTemplate.sections || [buildSection()]));
    setLevels(
      editingTemplate.levelsConfig?.levels?.length
        ? editingTemplate.levelsConfig.levels
        : defaultLevels,
    );
    setStartAt(
      editingTemplate.availability?.startAt
        ? editingTemplate.availability.startAt.slice(0, 16)
        : '',
    );
    setEndAt(
      editingTemplate.availability?.endAt
        ? editingTemplate.availability.endAt.slice(0, 16)
        : '',
    );
    setCddEnabled(
      String(editingTemplate.levelsConfig?.scope?.cdd || '').toLowerCase() === 'si',
    );
    setCddArea(String(editingTemplate.levelsConfig?.scope?.cddArea || '').trim());
    setAvailabilityStatus(editingTemplate.availability?.status || 'active');
    setMonitorSearch('');
  }, [editingTemplate, templateId]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/monitoreo');
    }
  }, [isAdmin, navigate]);

  const updateSections = (next) => setSections(hydrateOrders(next));

  const handleAddSection = () => {
    updateSections([...sections, buildSection()]);
  };

  const handleRemoveSection = (sectionId) => {
    setDeleteSectionTarget(sectionId);
  };

  const handleConfirmRemoveSection = () => {
    if (!deleteSectionTarget) return;
    updateSections(sections.filter((section) => section.id !== deleteSectionTarget));
    setDeleteSectionTarget(null);
  };

  const handleSectionTitle = (sectionId, value) => {
    updateSections(
      sections.map((section) =>
        section.id === sectionId ? { ...section, title: value } : section,
      ),
    );
  };

  const handleAddQuestion = (sectionId) => {
    updateSections(
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, questions: [...section.questions, buildQuestion()] }
          : section,
      ),
    );
  };

  const handleQuestionText = (sectionId, questionId, value) => {
    updateSections(
      sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.map((question) =>
                question.id === questionId ? { ...question, text: value } : question,
              ),
            }
          : section,
      ),
    );
  };

  const handleToggleObservation = (sectionId, questionId) => {
    updateSections(
      sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.map((question) =>
                question.id === questionId
                  ? { ...question, allowObservation: !question.allowObservation }
                  : question,
              ),
            }
          : section,
      ),
    );
  };

  const handleDeleteQuestion = (sectionId, questionId) => {
    setDeleteQuestionTarget({ sectionId, questionId });
  };

  const handleConfirmDeleteQuestion = () => {
    if (!deleteQuestionTarget?.sectionId || !deleteQuestionTarget?.questionId) return;
    updateSections(
      sections.map((section) =>
        section.id === deleteQuestionTarget.sectionId
          ? {
              ...section,
              questions: section.questions.filter(
                (question) => question.id !== deleteQuestionTarget.questionId,
              ),
            }
          : section,
      ),
    );
    setDeleteQuestionTarget(null);
  };

  const handleDuplicateQuestion = (sectionId, question) => {
    const clone = {
      ...question,
      id: crypto.randomUUID(),
    };
    updateSections(
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, questions: [...section.questions, clone] }
          : section,
      ),
    );
  };

  const moveQuestion = (sectionId, questionId, direction) => {
    updateSections(
      sections.map((section) => {
        if (section.id !== sectionId) return section;
        const index = section.questions.findIndex((question) => question.id === questionId);
        if (index === -1) return section;
        const nextIndex = direction === 'up' ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= section.questions.length) return section;
        const nextQuestions = [...section.questions];
        const [moved] = nextQuestions.splice(index, 1);
        nextQuestions.splice(nextIndex, 0, moved);
        return { ...section, questions: nextQuestions };
      }),
    );
  };

  const handleLevelDescription = (key, value) => {
    setLevels((prev) =>
      prev.map((level) => (level.key === key ? { ...level, description: value } : level)),
    );
  };

  const handleAddIntermediate = (key) => {
    if (key === 'L1_2') {
      setLevels((prev) => insertIntermediate(prev, 'L1_2', 'Intermedio 1-2'));
    }
    if (key === 'L2_3') {
      setLevels((prev) => insertIntermediate(prev, 'L2_3', 'Intermedio 2-3'));
    }
  };

  const handleRemoveIntermediate = (key) => {
    setLevels((prev) => removeIntermediate(prev, key));
  };

  const selectedMonitorIdSet = useMemo(
    () => new Set(sanitizeAssignedMonitorIds(assignedMonitorIds)),
    [assignedMonitorIds],
  );

  const selectedMonitors = useMemo(() => {
    if (!monitorCatalog.length || !selectedMonitorIdSet.size) return [];
    const byId = new Map(monitorCatalog.map((item) => [item.id, item]));
    return Array.from(selectedMonitorIdSet).map((id) => byId.get(id)).filter(Boolean);
  }, [monitorCatalog, selectedMonitorIdSet]);

  const filteredMonitors = useMemo(() => {
    const term = normalizeText(monitorSearch);
    const rows = monitorCatalog.filter((item) => {
      if (!term) return true;
      return normalizeText(`${item.name} ${item.email}`).includes(term);
    });
    return rows.sort((left, right) => {
      const leftSelected = selectedMonitorIdSet.has(left.id);
      const rightSelected = selectedMonitorIdSet.has(right.id);
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
      return String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' });
    });
  }, [monitorCatalog, monitorSearch, selectedMonitorIdSet]);

  const toggleMonitorAssignment = (monitorId) => {
    if (!monitorId) return;
    setAssignedMonitorIds((prev) => {
      const current = sanitizeAssignedMonitorIds(prev);
      if (current.includes(monitorId)) return current.filter((id) => id !== monitorId);
      return [...current, monitorId];
    });
  };

  const persistTemplate = async (status) => {
    const now = new Date().toISOString();
    const auth = JSON.parse(localStorage.getItem('monitoreoAuth') || '{}');
    const profile = JSON.parse(localStorage.getItem('monitoreoProfile') || '{}');
    if (cddEnabled && !String(cddArea || '').trim()) {
      openNoticeModal(
        'Falta area CdD',
        'Define el area antes de guardar un monitoreo marcado como Compromiso de Desempeño.',
        'warning',
      );
      return;
    }
    const nextAssignedMonitors = sanitizeAssignedMonitorIds(assignedMonitorIds);
    if (status === 'published' && !nextAssignedMonitors.length) {
      openNoticeModal(
        'Falta asignar monitores',
        'Selecciona al menos un monitor del Equipo antes de publicar.',
        'warning',
      );
      return;
    }

    const payload = {
      id: editingTemplate?.id || crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      status,
      sections: hydrateOrders(sections),
      levels_config: {
        type: levels.length > 3 ? 'custom' : 'standard',
        levels,
        scope: {
          ...(editingTemplate?.levelsConfig?.scope && typeof editingTemplate.levelsConfig.scope === 'object'
            ? editingTemplate.levelsConfig.scope
            : {}),
          cdd: cddEnabled ? 'si' : 'no',
          cddArea: cddEnabled ? String(cddArea || '').trim() : '',
        },
      },
      availability: {
        status: availabilityStatus,
        startAt,
        endAt,
      },
      created_by: auth?.email || auth?.docNumber || null,
      created_at: editingTemplate?.created_at || now,
      updated_at: now,
    };

    const { error } = await supabase
      .from('monitoring_templates')
      .upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error(error);
      openNoticeModal('No se pudo guardar', 'No se pudo guardar la plantilla.', 'danger');
      return;
    }

    const { error: clearAssignmentsError } = await supabase
      .from('monitoring_template_monitors')
      .delete()
      .eq('template_id', payload.id);
    if (clearAssignmentsError) {
      console.error(clearAssignmentsError);
      openNoticeModal(
        'No se pudo guardar',
        'La plantilla se guardo, pero no se pudo actualizar la asignacion de monitores.',
        'warning',
      );
      return;
    }

    if (nextAssignedMonitors.length) {
      const assignmentRows = nextAssignedMonitors.map((userId) => ({
        template_id: payload.id,
        user_id: userId,
      }));
      const { error: insertAssignmentsError } = await supabase
        .from('monitoring_template_monitors')
        .insert(assignmentRows);
      if (insertAssignmentsError) {
        console.error(insertAssignmentsError);
        openNoticeModal(
          'No se pudo guardar',
          'La plantilla se guardo, pero no se pudo registrar la lista de monitores.',
          'warning',
        );
        return;
      }
    }

    if (startAt && endAt) {
      const eventPayload = {
        id: payload.id,
        title: payload.title,
        description: payload.description || null,
        event_type: 'monitoring',
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        status: mapAvailabilityToEventStatus(availabilityStatus),
        created_by: profile?.id || null,
        updated_at: now,
      };
      const { error: eventError } = await supabase
        .from('monitoring_events')
        .upsert(eventPayload, { onConflict: 'id' });
      if (eventError) {
        console.error(eventError);
        openNoticeModal(
          'Sincronizacion pendiente',
          'Plantilla guardada, pero no se pudo sincronizar con Seguimiento.',
          'warning',
        );
      }
    }

    navigate('/monitoreo');
  };

  const isTitleValid = title.trim().length > 0;
  const canPublishTemplate = isTitleValid && sanitizeAssignedMonitorIds(assignedMonitorIds).length > 0;

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Monitoreo"
          title={editingTemplate ? 'Editar plantilla' : 'Crear plantilla de monitoreo'}
          description="Define el título y la estructura del monitoreo."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            id="tituloMonitoreo"
            label="Título del monitoreo"
            placeholder="Ej. Lengua Materna"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Input
            id="descripcionMonitoreo"
            label="Descripción (opcional)"
            placeholder="Resumen corto del proposito"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            id="inicioMonitoreo"
            label="Inicio"
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
          />
          <Input
            id="cierreMonitoreo"
            label="Cierre"
            type="datetime-local"
            value={endAt}
            onChange={(event) => setEndAt(event.target.value)}
          />
          <Input id="estadoMonitoreo" label="Estado actual" value={availabilityStatus} disabled />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            id="cddFlag"
            label="Compromiso de Desempeño (CdD)"
            value={cddEnabled ? 'si' : 'no'}
            onChange={(event) => setCddEnabled(event.target.value === 'si')}
          >
            <option value="no">No aplica</option>
            <option value="si">Si aplica</option>
          </Select>
          <Input
            id="cddArea"
            label="Area (CdD)"
            value={cddArea}
            onChange={(event) => setCddArea(event.target.value)}
            placeholder={cddEnabled ? 'Ej. Matematica' : 'Opcional'}
            disabled={!cddEnabled}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setAvailabilityStatus('active');
              if (!startAt) setStartAt(new Date().toISOString().slice(0, 16));
            }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70"
          >
            Activar ahora
          </button>
          <button
            type="button"
            onClick={() => setAvailabilityStatus('closed')}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/70"
          >
            Cerrar monitoreo
          </button>
          <button
            type="button"
            onClick={() => setAvailabilityStatus('scheduled')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
          >
            Programar
          </button>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100">Monitores con acceso</p>
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
              {selectedMonitors.length} seleccionado{selectedMonitors.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            Solo los monitores seleccionados en Equipo podran ver este monitoreo.
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              id="monitorAccessSearch"
              label="Buscar monitor"
              value={monitorSearch}
              onChange={(event) => setMonitorSearch(event.target.value)}
              placeholder="Nombre o correo"
            />
            <button
              type="button"
              onClick={() => setMonitorSearch('')}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700/60 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500 self-end"
            >
              Limpiar
            </button>
          </div>
          {isMonitorsLoading ? <p className="mt-2 text-xs text-slate-300">Cargando equipo...</p> : null}
          {!isMonitorsLoading ? (
            <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-xl border border-slate-800/80 bg-slate-900/60 p-2">
              {filteredMonitors.length ? (
                filteredMonitors.map((monitor) => {
                  const checked = selectedMonitorIdSet.has(monitor.id);
                  return (
                    <button
                      key={monitor.id}
                      type="button"
                      onClick={() => toggleMonitorAssignment(monitor.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                        checked
                          ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                          : 'border-slate-700/70 bg-slate-900/45 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <span className="truncate pr-2">{monitor.name}</span>
                      <span className="truncate text-[11px] opacity-80">{monitor.email || 'Sin correo'}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-1 py-2 text-xs text-slate-300">No hay monitores activos para mostrar.</p>
              )}
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-100">Niveles</p>
            <p className="text-xs text-slate-400">
              Configurable (maximo 5). Los niveles base no se eliminan.
            </p>
          </div>
          <span className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-300">
            {levels.length === 3 ? 'Estandar (3)' : `Personalizado (${levels.length})`}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {levels.map((level) => (
            <div
              key={level.key}
              className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4 text-xs text-slate-400"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-200">{level.label}</p>
                {level.key === 'L1_2' || level.key === 'L2_3' ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveIntermediate(level.key)}
                    className="rounded-full border border-rose-500/40 px-2 py-1 text-[10px] font-semibold text-rose-200 transition hover:border-rose-400/70"
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
              <Textarea
                id={`level-${level.key}`}
                label="Descripción"
                value={level.description}
                onChange={(event) => handleLevelDescription(level.key, event.target.value)}
                className="min-h-[96px]"
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {!levels.some((level) => level.key === 'L1_2') ? (
            <button
              type="button"
              onClick={() => handleAddIntermediate('L1_2')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
            >
              + Agregar nivel intermedio (entre 1 y 2)
            </button>
          ) : null}
          {!levels.some((level) => level.key === 'L2_3') ? (
            <button
              type="button"
              onClick={() => handleAddIntermediate('L2_3')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
            >
              + Agregar nivel intermedio (entre 2 y 3)
            </button>
          ) : null}
        </div>
      </Card>

      <Card className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <SectionHeader
            eyebrow="Secciones"
            title="Secciones y preguntas"
            description="Agrega secciones y define las preguntas con escala 1-3."
          />
          <button
            type="button"
            onClick={handleAddSection}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70"
          >
            <Plus size={14} />
            Agregar seccion
          </button>
        </div>

        <div className="space-y-6">
          {sections.map((section, sectionIndex) => (
            <div key={section.id} className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                  id={`section-${section.id}`}
                  label={`Título de sección ${sectionIndex + 1}`}
                  value={section.title}
                  onChange={(event) => handleSectionTitle(section.id, event.target.value)}
                />
                {sections.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveSection(section.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-400/70"
                  >
                    <Trash2 size={12} />
                    Eliminar seccion
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-4">
                {section.questions.map((question, questionIndex) => (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <Input
                          id={`question-${question.id}`}
                          label={`Pregunta ${questionIndex + 1}`}
                          placeholder="Escribe la pregunta..."
                          value={question.text}
                          onChange={(event) =>
                            handleQuestionText(section.id, question.id, event.target.value)
                          }
                        />
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                          <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1">
                            Si / No
                          </span>
                          {[1, 2, 3].map((level) => (
                            <label key={level} className="flex items-center gap-2">
                              <input type="radio" disabled />
                              <span>
                                {level === 1
                                  ? 'Cumple incipiente'
                                  : level === 2
                                  ? 'Cumple parcialmente'
                                  : 'Cumple con lo previsto'}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                          <input
                            type="checkbox"
                            checked={question.allowObservation}
                            onChange={() => handleToggleObservation(section.id, question.id)}
                          />
                          <span>Permitir observacion</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => moveQuestion(section.id, question.id, 'up')}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                        >
                          <ArrowUp size={12} />
                          Subir
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(section.id, question.id, 'down')}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                        >
                          <ArrowDown size={12} />
                          Bajar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateQuestion(section.id, question)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                        >
                          <Copy size={12} />
                          Duplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(section.id, question.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-400/70"
                        >
                          <Trash2 size={12} />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleAddQuestion(section.id)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
              >
                <Plus size={14} />
                Agregar pregunta
              </button>
            </div>
          ))}
        </div>
      </Card>

      {!isCreatingTemplate ? (
        <>
          <Card className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                eyebrow="Estandar"
                title="Observacion general y compromiso"
                description="Seccion bloqueada para todos los monitoreos."
              />
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-400">
                <Lock size={12} />
                Bloqueado
              </span>
            </div>
            <Textarea id="observacionGeneral" label="Observacion general" disabled />
            <Textarea id="resumen" label="Resumen del monitoreo" disabled />
            <Textarea id="compromiso" label="Compromiso" disabled />
          </Card>

          <Card className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                eyebrow="Estandar"
                title="Firmas"
                description="Firma del docente monitoreado y del monitor (bloqueado)."
              />
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-400">
                <Lock size={12} />
                Bloqueado
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input id="docenteNombre" label="Docente monitoreado" placeholder="Nombre" disabled />
              <Input id="docenteDocumento" label="Documento del docente" placeholder="DNI / CE" disabled />
              <Input id="monitorNombre" label="Monitor" placeholder="Nombre" disabled />
              <Input id="monitorDocumento" label="Documento del monitor" placeholder="DNI / CE" disabled />
            </div>
          </Card>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => persistTemplate('draft')}
          disabled={!isTitleValid}
          className={`inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 ${
            isTitleValid ? '' : 'cursor-not-allowed opacity-50'
          }`}
        >
          Guardar como borrador
        </button>
        <button
          type="button"
          onClick={() => persistTemplate('published')}
          disabled={!canPublishTemplate}
          title={canPublishTemplate ? 'Publicar' : 'Debes completar titulo y asignar al menos un monitor.'}
          className={`inline-flex items-center justify-center rounded-xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white ${
            canPublishTemplate ? '' : 'cursor-not-allowed opacity-50'
          }`}
        >
          Publicar
        </button>
        <button
          type="button"
          onClick={() => navigate('/monitoreo')}
          className="inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500"
        >
          Cancelar
        </button>
      </div>

      <ConfirmModal
        open={Boolean(deleteSectionTarget)}
        tone="warning"
        title="Eliminar seccion"
        description="Esta seccion y sus preguntas se eliminaran de la plantilla."
        confirmText="Si, eliminar"
        cancelText="Cancelar"
        onCancel={() => setDeleteSectionTarget(null)}
        onConfirm={handleConfirmRemoveSection}
      />

      <ConfirmModal
        open={Boolean(deleteQuestionTarget)}
        tone="warning"
        title="Eliminar pregunta"
        description="Esta pregunta se eliminara de la seccion actual."
        confirmText="Si, eliminar"
        cancelText="Cancelar"
        onCancel={() => setDeleteQuestionTarget(null)}
        onConfirm={handleConfirmDeleteQuestion}
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
