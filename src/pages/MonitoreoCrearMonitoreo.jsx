import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, Plus, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
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

export default function MonitoreoCrearMonitoreo() {
  const navigate = useNavigate();
  const { templateId } = useParams();
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
  const [availabilityStatus, setAvailabilityStatus] = useState(
    'active',
  );

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
    if (!editingTemplate) {
      setTitle('');
      setDescription('');
      setSections(hydrateOrders([buildSection()]));
      setLevels(defaultLevels);
      setStartAt('');
      setEndAt('');
      setAvailabilityStatus('active');
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
    setAvailabilityStatus(editingTemplate.availability?.status || 'active');
  }, [editingTemplate]);

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
    if (!window.confirm('Eliminar esta seccion?')) return;
    updateSections(sections.filter((section) => section.id !== sectionId));
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
    if (!window.confirm('Eliminar esta pregunta?')) return;
    updateSections(
      sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              questions: section.questions.filter((question) => question.id !== questionId),
            }
          : section,
      ),
    );
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

  const persistTemplate = async (status) => {
    const now = new Date().toISOString();
    const auth = JSON.parse(localStorage.getItem('monitoreoAuth') || '{}');
    const profile = JSON.parse(localStorage.getItem('monitoreoProfile') || '{}');
    const payload = {
      id: editingTemplate?.id || crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      status,
      sections: hydrateOrders(sections),
      levels_config: {
        type: levels.length > 3 ? 'custom' : 'standard',
        levels,
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
      alert('No se pudo guardar la plantilla.');
      return;
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
        alert('Plantilla guardada, pero no se pudo sincronizar con Seguimiento.');
      }
    }

    navigate('/monitoreo');
  };

  const isTitleValid = title.trim().length > 0;

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
      </Card>

      <Card className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            eyebrow="Estandar"
            title="Encabezado estandar"
            description="Se muestra en todos los monitoreos (no editable)."
          />
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-400">
            <Lock size={12} />
            Bloqueado
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input id="ie" label="Institucion Educativa" placeholder="Nombre de la I.E." disabled />
          <Input id="lugar" label="Lugar" placeholder="Distrito / Provincia" disabled />
          <Input id="director" label="Director(a) / Monitor(a)" placeholder="Nombre completo" disabled />
          <Input id="docente" label="Docente" placeholder="Apellidos y nombres" disabled />
          <Input id="condicion" label="Nombrado / Contratado" placeholder="Seleccionar" disabled />
          <Input id="area" label="Area" placeholder="Comunicacion / Quechua / Ingles" disabled />
        </div>
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
          disabled={!isTitleValid}
          className={`inline-flex items-center justify-center rounded-xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white ${
            isTitleValid ? '' : 'cursor-not-allowed opacity-50'
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
    </div>
  );
}
