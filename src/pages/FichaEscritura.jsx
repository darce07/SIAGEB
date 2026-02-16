import { useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import Textarea from '../components/ui/Textarea.jsx';
import Toggle from '../components/ui/Toggle.jsx';
import LevelPills from '../components/ui/LevelPills.jsx';
import Badge from '../components/ui/Badge.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import SignaturePad from '../components/ui/SignaturePad.jsx';
import Toast from '../components/ui/Toast.jsx';
import { SidebarContext } from '../routes/MonitoreoLayout.jsx';
import { FORM_TITLE, LEVEL_INFO, QUESTION_SECTIONS } from '../data/fichaEscritura.js';
import { supabase } from '../lib/supabase.js';

const INSTANCE_ACTIVE_KEY = 'monitoreoInstanceActive';

const TEMPLATE_KEY = 'monitoreoTemplateSelected';
const loadSelectedTemplate = async (selectedId) => {
  try {
    if (!selectedId) return { template: null, error: null };
    const { data, error } = await supabase
      .from('monitoring_templates')
      .select('*')
      .eq('id', selectedId)
      .single();
    if (error) return { template: null, error };
    return {
      template: {
        ...data,
        levelsConfig: data.levels_config,
        availability: data.availability,
      },
      error: null,
    };
  } catch {
    return { template: null, error: new Error('No se pudo cargar la plantilla') };
  }
};

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

const buildQuestionsState = (sections) =>
  sections.flatMap((section) => section.questions || []).reduce((acc, question) => {
    acc[question.id] = { answer: null, level: null, obs: '' };
    return acc;
  }, {});

const generateSessionId = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `#MN-${year}-${random}`;
};

const createInitialState = (sections) => ({
  meta: {
    sessionId: generateSessionId(),
    saved: true,
    lastSavedAt: null,
  },
  header: {
    institucion: '',
    lugarIe: '',
    director: '',
    docente: '',
    condicion: '',
    area: '',
  },
  questions: buildQuestionsState(sections),
  general: {
    observacion: '',
    compromiso: '',
  },
  cierre: {
    lugar: '',
    fecha: new Date().toISOString().split('T')[0],
  },
  firmas: {
    docente: {
      firma: '',
      nombre: '',
      dni: '',
    },
    monitor: {
      firma: '',
      nombre: '',
      dni: '',
    },
  },
  errors: {},
});

const reducer = (state, action) => {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        ...action.payload,
        errors: {},
      };
    case 'UPDATE_HEADER':
      return {
        ...state,
        header: { ...state.header, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_GENERAL':
      return {
        ...state,
        general: { ...state.general, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_CIERRE':
      return {
        ...state,
        cierre: { ...state.cierre, [action.field]: action.value },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_FIRMA':
      return {
        ...state,
        firmas: {
          ...state.firmas,
          [action.role]: {
            ...state.firmas[action.role],
            [action.field]: action.value,
          },
        },
        meta: { ...state.meta, saved: false },
      };
    case 'UPDATE_QUESTION':
      return {
        ...state,
        questions: {
          ...state.questions,
          [action.id]: {
            ...state.questions[action.id],
            ...action.payload,
          },
        },
        meta: { ...state.meta, saved: false },
      };
    case 'SET_ERRORS':
      return {
        ...state,
        errors: action.payload,
      };
    case 'MARK_SAVED':
      return {
        ...state,
        meta: { ...state.meta, saved: action.value, lastSavedAt: action.lastSavedAt },
      };
    case 'RESET':
      return createInitialState(action.sections || QUESTION_SECTIONS);
    default:
      return state;
  }
};

const serializeState = (state) => {
  const { errors, ...rest } = state;
  return rest;
};

const mergeLoadedState = (loaded, sections) => {
  const base = createInitialState(sections);
  const mergedQuestions = {
    ...base.questions,
    ...(loaded?.questions || {}),
  };
  return {
    ...base,
    ...loaded,
    questions: mergedQuestions,
    errors: {},
  };
};

const getCurrentUserId = () => {
  try {
    const auth = JSON.parse(localStorage.getItem('monitoreoAuth'));
    return auth?.email || auth?.docNumber || '';
  } catch {
    return '';
  }
};

const findInProgressInstance = async (templateId) => {
  const userId = getCurrentUserId();
  if (!templateId || !userId) return null;
  const { data, error } = await supabase
    .from('monitoring_instances')
    .select('*')
    .eq('template_id', templateId)
    .eq('created_by', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0] || null;
};

const getActiveInstance = async () => {
  const activeId = localStorage.getItem(INSTANCE_ACTIVE_KEY);
  if (!activeId) return null;
  const { data, error } = await supabase
    .from('monitoring_instances')
    .select('*')
    .eq('id', activeId)
    .single();
  if (error) return null;
  return data;
};

const upsertInstance = async (instance) => {
  await supabase.from('monitoring_instances').upsert(instance, { onConflict: 'id' });
};

const createInstance = async (templateId, templateStatus) => {
  try {
    if (templateStatus !== 'active') return null;
    const userId = getCurrentUserId();
    if (!userId) return null;
    const now = new Date().toISOString();
    const instance = {
      id: crypto.randomUUID(),
      template_id: templateId || null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      status: 'in_progress',
      data: null,
    };
    await upsertInstance(instance);
    localStorage.setItem(INSTANCE_ACTIVE_KEY, instance.id);
    return instance;
  } catch {
    return null;
  }
};

export default function FichaEscritura() {
  const { setActiveSection } = useContext(SidebarContext);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateError, setTemplateError] = useState('');
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);
  const [templateId, setTemplateId] = useState(() => localStorage.getItem(TEMPLATE_KEY) || '');
  const [activeInstance, setActiveInstance] = useState(null);
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    createInitialState(QUESTION_SECTIONS),
  );
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setIsTemplateLoading(true);
      // 1) Recuperar instancia activa si existe
      const existing = await getActiveInstance();
      if (!active) return;
      if (existing) {
        setActiveInstance(existing);
        if (existing.template_id && existing.template_id !== templateId) {
          localStorage.setItem(TEMPLATE_KEY, existing.template_id);
          setTemplateId(existing.template_id);
        }
      }

      let reusedInstance = null;
      if (!existing && templateId) {
        reusedInstance = await findInProgressInstance(templateId);
        if (!active) return;
        if (reusedInstance) {
          setActiveInstance(reusedInstance);
          localStorage.setItem(INSTANCE_ACTIVE_KEY, reusedInstance.id);
          if (reusedInstance.template_id && reusedInstance.template_id !== templateId) {
            localStorage.setItem(TEMPLATE_KEY, reusedInstance.template_id);
            setTemplateId(reusedInstance.template_id);
          }
        }
      }

      // 2) Cargar plantilla por templateId
      const idToLoad = existing?.template_id || reusedInstance?.template_id || templateId;
      if (!idToLoad) {
        setTemplateError('No se encontró la plantilla seleccionada.');
        setSelectedTemplate(null);
        setIsTemplateLoading(false);
        return;
      }
      const result = await loadSelectedTemplate(idToLoad);
      if (!active) return;
      if (result.error) {
        console.error(result.error);
        setTemplateError('No se pudo cargar la plantilla.');
        setSelectedTemplate(null);
      } else {
        setSelectedTemplate(result.template);
        setTemplateError('');
      }
      setIsTemplateLoading(false);
    };
    hydrate();
    return () => {
      active = false;
    };
  }, [templateId]);
  const templateStatus = useMemo(() => getTemplateStatus(selectedTemplate), [selectedTemplate]);
  const templateSections = useMemo(
    () => selectedTemplate?.sections || QUESTION_SECTIONS,
    [selectedTemplate],
  );
  const formTitle = selectedTemplate?.title || FORM_TITLE;
  const defaultLevels = useMemo(
    () =>
      LEVEL_INFO.map((level, index) => ({
        key: `L${index + 1}`,
        label: `Nivel ${index + 1}`,
        description: level.text,
      })),
    [],
  );
  const templateLevels = useMemo(() => {
    const levels = selectedTemplate?.levelsConfig?.levels;
    if (Array.isArray(levels) && levels.length >= 3) {
      return levels;
    }
    return defaultLevels;
  }, [defaultLevels, selectedTemplate]);
  const isReadOnly = templateStatus !== 'active';
  const [toast, setToast] = useState('');
  const prevDocenteRef = useRef('');
  const prevMonitorRef = useRef('');

  const allQuestions = useMemo(
    () => templateSections.flatMap((section) => section.questions || []),
    [templateSections],
  );

  useEffect(() => {
    let active = true;
    const hydrateInstance = async () => {
      if (!activeInstance) return;
      if (activeInstance?.data) {
        dispatch({
          type: 'LOAD',
          payload: mergeLoadedState(activeInstance.data, templateSections),
        });
      }
    };
    hydrateInstance();
    return () => {
      active = false;
    };
  }, [activeInstance, templateSections]);

  useEffect(() => {
    if (!activeInstance || !activeInstance.data) {
      dispatch({ type: 'RESET', sections: templateSections });
    }
  }, [activeInstance, templateSections]);

  useEffect(() => {
    if (!activeInstance || isReadOnly) return;
    const now = new Date().toISOString();
    const payload = {
      ...activeInstance,
      updated_at: now,
      status: activeInstance.status || 'in_progress',
      data: serializeState(state),
    };
    upsertInstance(payload);
  }, [activeInstance, isReadOnly, state]);

  useEffect(() => {
    if (
      state.header.docente &&
      (state.firmas.docente.nombre === '' || state.firmas.docente.nombre === prevDocenteRef.current)
    ) {
      dispatch({
        type: 'UPDATE_FIRMA',
        role: 'docente',
        field: 'nombre',
        value: state.header.docente,
      });
    }
    prevDocenteRef.current = state.header.docente;
  }, [state.header.docente, state.firmas.docente.nombre]);

  useEffect(() => {
    if (
      state.header.director &&
      (state.firmas.monitor.nombre === '' || state.firmas.monitor.nombre === prevMonitorRef.current)
    ) {
      dispatch({
        type: 'UPDATE_FIRMA',
        role: 'monitor',
        field: 'nombre',
        value: state.header.director,
      });
    }
    prevMonitorRef.current = state.header.director;
  }, [state.header.director, state.firmas.monitor.nombre]);

  useEffect(() => {
    const sections = ['datos', ...templateSections.map((section) => section.id), 'cierre'];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );

    sections.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [setActiveSection, templateSections]);

  const handleSave = async () => {
    const errors = {};
    const headerErrors = {};

    if (!state.header.institucion) headerErrors.institucion = 'Requerido';
    if (!state.header.lugarIe) headerErrors.lugarIe = 'Requerido';
    if (!state.header.director) headerErrors.director = 'Requerido';
    if (!state.header.docente) headerErrors.docente = 'Requerido';
    if (!state.header.condicion) headerErrors.condicion = 'Requerido';
    if (!state.header.area) headerErrors.area = 'Requerido';

    if (Object.keys(headerErrors).length > 0) errors.header = headerErrors;

    const questionErrors = {};
    allQuestions.forEach((question) => {
      if (!state.questions[question.id]?.answer) {
        questionErrors[question.id] = 'Seleccione Sí o No.';
      }
    });
    if (Object.keys(questionErrors).length > 0) errors.questions = questionErrors;

    const cierreErrors = {};
    if (!state.cierre.lugar) cierreErrors.lugar = 'Requerido';
    if (!state.cierre.fecha) cierreErrors.fecha = 'Requerido';
    if (Object.keys(cierreErrors).length > 0) errors.cierre = cierreErrors;

    const firmasErrors = {};
    if (!state.firmas.docente.dni) firmasErrors.docenteDni = 'Requerido';
    if (!state.firmas.monitor.dni) firmasErrors.monitorDni = 'Requerido';
    if (Object.keys(firmasErrors).length > 0) errors.firmas = firmasErrors;

    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'SET_ERRORS', payload: errors });
      return;
    }

    let instanceToSave = activeInstance;
    if (!instanceToSave && !isReadOnly) {
      const reused = await findInProgressInstance(selectedTemplate?.id);
      if (reused) {
        instanceToSave = reused;
        setActiveInstance(reused);
        localStorage.setItem(INSTANCE_ACTIVE_KEY, reused.id);
      } else {
        const created = await createInstance(selectedTemplate?.id, templateStatus);
        if (created) {
          instanceToSave = created;
          setActiveInstance(created);
        }
      }
    }

    dispatch({
      type: 'MARK_SAVED',
      value: true,
      lastSavedAt: new Date().toISOString(),
    });
    dispatch({ type: 'SET_ERRORS', payload: {} });
    setToast('Cambios guardados correctamente.');
    if (instanceToSave && !isReadOnly) {
      const now = new Date().toISOString();
      upsertInstance({
        ...instanceToSave,
        updated_at: now,
        status: instanceToSave.status || 'in_progress',
        data: serializeState(state),
      });
    }
  };

  const handleReset = () => {
    if (window.confirm('¿Seguro que deseas limpiar el formulario?')) {
      if (activeInstance) {
        upsertInstance({
          ...activeInstance,
          updated_at: new Date().toISOString(),
          status: 'in_progress',
          data: serializeState(createInitialState(templateSections)),
        });
      }
      dispatch({ type: 'RESET', sections: templateSections });
    }
  };

  if (isTemplateLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <SectionHeader eyebrow="Formulario" title="Cargando formulario..." />
        </Card>
      </div>
    );
  }

  if (templateError) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-3">
          <SectionHeader eyebrow="Error" title="No se pudo cargar el formulario" />
          <p className="text-sm text-slate-400">{templateError}</p>
          <Link
            to="/monitoreo"
            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
          >
            Volver a monitoreos
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="glass-panel sticky top-6 z-30 rounded-2xl px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Sesión</p>
            <h1 className="text-lg font-semibold text-slate-100">{state.meta.sessionId}</h1>
            {state.meta.lastSavedAt ? (
              <p className="text-xs text-slate-400">
                Último guardado: {new Date(state.meta.lastSavedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/monitoreo"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
            >
              Volver
            </Link>
            <Badge
              label={state.meta.saved ? 'Guardado' : 'Pendiente'}
              tone={state.meta.saved ? 'success' : 'warning'}
            />
            {!isReadOnly ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70"
                >
                  <Save size={14} />
                  Guardar cambios
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                >
                  <RefreshCw size={14} />
                  Reset
                </button>
              </>
            ) : (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                Monitoreo no disponible. Solo lectura.
              </span>
            )}
          </div>
        </div>
      </div>

      <fieldset disabled={isReadOnly} className={isReadOnly ? 'opacity-90' : ''}>
        <Card>
          <SectionHeader eyebrow="Formulario" title={formTitle} />
        </Card>

      <section id="datos" className="scroll-mt-28">
        <Card className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Encabezado"
            title="Datos de identificación"
            description="Registra la información base de la institución y del docente monitoreado."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              id="institucion"
              label="Institución Educativa"
              value={state.header.institucion}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_HEADER', field: 'institucion', value: event.target.value })
              }
              error={state.errors?.header?.institucion}
              placeholder="Nombre de la I.E."
              disabled={isReadOnly}
            />
            <Input
              id="lugarIe"
              label="Lugar donde se encuentra la IE"
              value={state.header.lugarIe}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_HEADER', field: 'lugarIe', value: event.target.value })
              }
              error={state.errors?.header?.lugarIe}
              placeholder="Distrito / Provincia"
              disabled={isReadOnly}
            />
            <Input
              id="director"
              label="Director(a) o Monitor(a)"
              value={state.header.director}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_HEADER', field: 'director', value: event.target.value })
              }
              error={state.errors?.header?.director}
              placeholder="Nombre completo"
            />
            <Input
              id="docente"
              label="Apellidos y nombres del(a) docente"
              value={state.header.docente}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_HEADER', field: 'docente', value: event.target.value })
              }
              error={state.errors?.header?.docente}
              placeholder="Nombre completo"
            />
            <Select
              id="condicion"
              label="Condición"
              value={state.header.condicion}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_HEADER', field: 'condicion', value: event.target.value })
              }
              error={state.errors?.header?.condicion}
            >
              <option value="">Seleccionar</option>
              <option value="Nombrado">Nombrado</option>
              <option value="Contratado">Contratado</option>
            </Select>
            <Select
              id="area"
              label="Área que monitorea"
              value={state.header.area}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_HEADER', field: 'area', value: event.target.value })
              }
              error={state.errors?.header?.area}
            >
              <option value="">Seleccionar</option>
              <option value="Comunicación">Comunicación</option>
              <option value="Quechua">Quechua</option>
              <option value="Inglés">Inglés</option>
            </Select>
          </div>
        </Card>
      </section>

      <Card>
        <SectionHeader
          eyebrow="Cuadro informativo"
          title="Nivel de avance"
          description="Estos niveles se mantienen visibles como referencia para cada ítem."
        />
        <div className="mt-4 flex flex-wrap gap-3">
          {templateLevels.map((item, index) => (
            <Badge
              key={item.key || item.label || index}
              label={`${item.label} - ${item.description}`}
              tone={index === 0 ? 'warning' : index === 1 ? 'blue' : index === 2 ? 'success' : 'info'}
            />
          ))}
        </div>
      </Card>

      {templateSections.map((section, index) => (
        <section key={section.id} id={section.id} className="scroll-mt-28">
          <Card className="flex flex-col gap-6">
            <SectionHeader eyebrow={`Sección ${section.id.toUpperCase()}`} title={section.title} />
            <div className="flex flex-col gap-4">
              {section.questions.map((question) => {
                const data = state.questions[question.id] || { answer: null, level: null, obs: '' };
                const isDisabled = data.answer !== 'SI';
                return (
                  <div key={question.id} className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-100">{question.text}</p>
                        {state.errors?.questions?.[question.id] ? (
                          <p className="text-xs text-rose-400">{state.errors.questions[question.id]}</p>
                        ) : null}
                      </div>
                      <Toggle
                        value={data.answer}
                        onChange={(value) =>
                          dispatch({
                            type: 'UPDATE_QUESTION',
                            id: question.id,
                            payload: {
                              answer: value,
                              level: value === 'NO' ? null : data.level,
                              obs: value === 'NO' ? '' : data.obs,
                            },
                          })
                        }
                      />
                    </div>
                    <div className={`mt-4 flex flex-col gap-4 ${isDisabled ? 'opacity-50' : ''}`}>
                      {data.answer === 'NO' ? (
                        <p className="text-xs text-slate-400">
                          Selecciona "Sí" para registrar nivel de logro y observación.
                        </p>
                      ) : null}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs uppercase tracking-wide text-slate-400">
                          Nivel de logro
                        </span>
                        <LevelPills
                          value={data.level}
                          onChange={(value) =>
                            dispatch({
                              type: 'UPDATE_QUESTION',
                              id: question.id,
                              payload: { level: value },
                            })
                          }
                          disabled={isDisabled}
                          levels={templateLevels}
                        />
                      </div>
                      <Textarea
                        id={`${question.id}-obs`}
                        label="Observación"
                        value={data.obs}
                        onChange={(event) =>
                          dispatch({
                            type: 'UPDATE_QUESTION',
                            id: question.id,
                            payload: { obs: event.target.value },
                          })
                        }
                        disabled={isDisabled}
                        placeholder="Registrar observaciones..."
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      ))}

      <section id="cierre" className="scroll-mt-28">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-6">
            <SectionHeader
              eyebrow="Sección general"
              title="Observación general y compromiso"
              description="Síntesis del monitoreo y acuerdos con el docente monitoreado."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Textarea
                id="observacion-general"
                label="Observación general"
                value={state.general.observacion}
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_GENERAL', field: 'observacion', value: event.target.value })
                }
                placeholder="Resumen del monitoreo"
              />
              <Textarea
                id="compromiso"
                label="Compromiso según resultados del monitoreo"
                value={state.general.compromiso}
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_GENERAL', field: 'compromiso', value: event.target.value })
                }
                placeholder="Compromisos establecidos"
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-6">
            <SectionHeader eyebrow="Lugar y fecha" title="Lugar y fecha" />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                id="lugar"
                label="Lugar (Distrito)"
                value={state.cierre.lugar}
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_CIERRE', field: 'lugar', value: event.target.value })
                }
                error={state.errors?.cierre?.lugar}
                placeholder="Distrito"
              />
              <Input
                id="fecha"
                type="date"
                label="Fecha"
                value={state.cierre.fecha}
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_CIERRE', field: 'fecha', value: event.target.value })
                }
                error={state.errors?.cierre?.fecha}
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-6">
            <SectionHeader eyebrow="Firmas" title="Firmas" description="Firma del docente monitoreado y del monitor." />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <SignaturePad
                  label="Docente monitoreado"
                  value={state.firmas.docente.firma}
                  onChange={(value) =>
                    dispatch({ type: 'UPDATE_FIRMA', role: 'docente', field: 'firma', value })
                  }
                  disabled={isReadOnly}
                />
                <Input
                  id="docente-nombre"
                  label="Nombre"
                  value={state.firmas.docente.nombre}
                  onChange={(event) =>
                    dispatch({
                      type: 'UPDATE_FIRMA',
                      role: 'docente',
                      field: 'nombre',
                      value: event.target.value,
                    })
                  }
                />
                <Input
                  id="docente-dni"
                  label="DNI"
                  value={state.firmas.docente.dni}
                  onChange={(event) =>
                    dispatch({
                      type: 'UPDATE_FIRMA',
                      role: 'docente',
                      field: 'dni',
                      value: event.target.value,
                    })
                  }
                  error={state.errors?.firmas?.docenteDni}
                  placeholder="Documento"
                />
              </div>
              <div className="flex flex-col gap-4">
                <SignaturePad
                  label="Monitor"
                  value={state.firmas.monitor.firma}
                  onChange={(value) =>
                    dispatch({ type: 'UPDATE_FIRMA', role: 'monitor', field: 'firma', value })
                  }
                  disabled={isReadOnly}
                />
                <Input
                  id="monitor-nombre"
                  label="Nombre del monitor"
                  value={state.firmas.monitor.nombre}
                  onChange={(event) =>
                    dispatch({
                      type: 'UPDATE_FIRMA',
                      role: 'monitor',
                      field: 'nombre',
                      value: event.target.value,
                    })
                  }
                />
                <Input
                  id="monitor-dni"
                  label="DNI del monitor"
                  value={state.firmas.monitor.dni}
                  onChange={(event) =>
                    dispatch({
                      type: 'UPDATE_FIRMA',
                      role: 'monitor',
                      field: 'dni',
                      value: event.target.value,
                    })
                  }
                  error={state.errors?.firmas?.monitorDni}
                  placeholder="Documento"
                />
              </div>
            </div>
          </Card>
        </div>
      </section>

      </fieldset>

      <div className="glass-panel flex items-center justify-between rounded-2xl px-6 py-4 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <span>Auto guardado activo en Supabase.</span>
        </div>
        <span className="text-xs text-slate-500">Listo para conectarse a API.</span>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
}







