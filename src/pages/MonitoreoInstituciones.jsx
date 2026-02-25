import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Pencil,
  Power,
  Search,
  Trash2,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Input from '../components/ui/Input.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import Select from '../components/ui/Select.jsx';
import { supabase } from '../lib/supabase.js';

const EMPTY_FORM = {
  id: null,
  nombreIe: '',
  codLocal: '',
  codModular: '',
  nivel: 'inicial_cuna_jardin',
  modalidad: 'EBR',
  distrito: '',
  rei: '',
  nombreDirector: '',
  estado: 'active',
};

const PAGE_SIZE = 10;

const formatLevelLabel = (value) => {
  if (value === 'inicial_cuna_jardin') return 'INICIAL CUNA JARDIN';
  if (value === 'inicial_jardin') return 'INICIAL JARDIN';
  if (value === 'inicial') return 'INICIAL JARDIN';
  if (value === 'primaria') return 'PRIMARIA';
  if (value === 'secundaria') return 'SECUNDARIA';
  return '-';
};

const formatStatusLabel = (value) => (value === 'inactive' ? 'Inactiva' : 'Activa');

const normalizeText = (value) => String(value || '').trim();
const normalizeCode = (value) => normalizeText(value).replace(/\s+/g, '');
const isNumericCode = (value) => /^\d+$/.test(normalizeCode(value));

export default function MonitoreoInstituciones() {
  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoAuth') || '{}');
    } catch {
      return {};
    }
  }, []);

  const profile = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('monitoreoProfile') || '{}');
    } catch {
      return {};
    }
  }, []);

  const isAdmin = auth?.role === 'admin';

  const [institutions, setInstitutions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [reiFilter, setReiFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingStatusId, setIsTogglingStatusId] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedInstitutionId, setHighlightedInstitutionId] = useState('');
  const [toast, setToast] = useState({
    show: false,
    visible: false,
    message: '',
    tone: 'success',
  });

  const toastTimersRef = useRef({ hide: null, remove: null });
  const searchBoxRef = useRef(null);
  const rowRefs = useRef(new Map());

  const showToast = (message, tone = 'success') => {
    if (toastTimersRef.current.hide) clearTimeout(toastTimersRef.current.hide);
    if (toastTimersRef.current.remove) clearTimeout(toastTimersRef.current.remove);

    setToast({ show: true, visible: true, message, tone });

    toastTimersRef.current.hide = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2300);

    toastTimersRef.current.remove = setTimeout(() => {
      setToast({ show: false, visible: false, message: '', tone: 'success' });
    }, 2800);
  };

  const loadInstitutions = async () => {
    setLoading(true);
    setError('');

    const { data, error: fetchError } = await supabase
      .from('educational_institutions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (fetchError) {
      const message = fetchError.message || 'No se pudieron cargar las instituciones educativas.';
      setError(message);
      showToast(message, 'error');
      setInstitutions([]);
      setLoading(false);
      return;
    }

    setInstitutions(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      loadInstitutions();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(
    () => () => {
      if (toastTimersRef.current.hide) clearTimeout(toastTimersRef.current.hide);
      if (toastTimersRef.current.remove) clearTimeout(toastTimersRef.current.remove);
    },
    [],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, levelFilter, modalityFilter, districtFilter, reiFilter, statusFilter]);

  useEffect(() => {
    if (search.trim()) return;
    setHighlightedInstitutionId('');
  }, [search]);

  const districtOptions = useMemo(
    () =>
      Array.from(
        new Set(institutions.map((item) => normalizeText(item.distrito)).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
    [institutions],
  );

  const reiOptions = useMemo(
    () =>
      Array.from(new Set(institutions.map((item) => normalizeText(item.rei)).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }),
      ),
    [institutions],
  );

  const summary = useMemo(() => {
    const base = {
      total: institutions.length,
      active: 0,
      inactive: 0,
    };

    institutions.forEach((item) => {
      if (item.estado === 'inactive') base.inactive += 1;
      else base.active += 1;
    });

    return base;
  }, [institutions]);

  const filteredInstitutions = useMemo(() => {
    const term = search.toLowerCase().trim();
    return institutions.filter((item) => {
      const searchable = [
        item.nombre_ie,
        item.cod_local,
        item.cod_modular,
        item.nombre_director,
        item.distrito,
        item.rei,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      const matchesSearch = !term || searchable.includes(term);
      const matchesLevel = levelFilter === 'all' || item.nivel === levelFilter;
      const matchesModality = modalityFilter === 'all' || item.modalidad === modalityFilter;
      const matchesDistrict = districtFilter === 'all' || item.distrito === districtFilter;
      const matchesRei = reiFilter === 'all' || item.rei === reiFilter;
      const matchesStatus = statusFilter === 'all' || item.estado === statusFilter;

      return (
        matchesSearch &&
        matchesLevel &&
        matchesModality &&
        matchesDistrict &&
        matchesRei &&
        matchesStatus
      );
    });
  }, [institutions, search, levelFilter, modalityFilter, districtFilter, reiFilter, statusFilter]);

  const predictiveSuggestions = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return [];

    const scored = institutions
      .map((item) => {
        const nombre = String(item.nombre_ie || '');
        const codLocal = String(item.cod_local || '');
        const codModular = String(item.cod_modular || '');
        const director = String(item.nombre_director || '');
        const haystack = `${nombre} ${codLocal} ${codModular} ${director}`.toLowerCase();
        if (!haystack.includes(term)) return null;

        const startsWithScore =
          nombre.toLowerCase().startsWith(term) ||
          codLocal.toLowerCase().startsWith(term) ||
          codModular.toLowerCase().startsWith(term)
            ? 0
            : 1;

        return { item, score: startsWithScore };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score;
        return String(left.item.nombre_ie || '').localeCompare(String(right.item.nombre_ie || ''), 'es', {
          sensitivity: 'base',
        });
      });

    return scored.slice(0, 8).map((entry) => entry.item);
  }, [institutions, search]);

  const hasAdvancedFilters =
    levelFilter !== 'all' ||
    modalityFilter !== 'all' ||
    districtFilter !== 'all' ||
    reiFilter !== 'all' ||
    statusFilter !== 'all';

  const totalPages = Math.max(1, Math.ceil(filteredInstitutions.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedInstitutions = useMemo(() => {
    const from = (currentPage - 1) * PAGE_SIZE;
    return filteredInstitutions.slice(from, from + PAGE_SIZE);
  }, [filteredInstitutions, currentPage]);

  const isEditing = Boolean(form.id);

  useEffect(() => {
    if (isEditing) setIsFormExpanded(true);
  }, [isEditing]);

  useEffect(() => {
    if (hasAdvancedFilters) setShowAdvancedFilters(true);
  }, [hasAdvancedFilters]);

  useEffect(() => {
    if (!isSearchFocused) return undefined;

    const handleOutsidePointer = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (searchBoxRef.current?.contains(target)) return;
      setIsSearchFocused(false);
    };

    window.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [isSearchFocused]);

  useEffect(() => {
    if (!highlightedInstitutionId) return;

    const index = filteredInstitutions.findIndex((item) => item.id === highlightedInstitutionId);
    if (index === -1) return;

    const targetPage = Math.floor(index / PAGE_SIZE) + 1;
    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
      return;
    }

    const rowElement = rowRefs.current.get(highlightedInstitutionId);
    if (!rowElement) return;
    rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedInstitutionId, filteredInstitutions, currentPage]);

  const applySuggestionSearch = (item) => {
    const query = String(item?.nombre_ie || item?.cod_modular || item?.cod_local || '').trim();
    if (!query) return;
    setSearch(query);
    setCurrentPage(1);
    setHighlightedInstitutionId(item.id || '');
    setIsSearchFocused(false);
  };

  const clearFilters = () => {
    setSearch('');
    setLevelFilter('all');
    setModalityFilter('all');
    setDistrictFilter('all');
    setReiFilter('all');
    setStatusFilter('all');
    setShowAdvancedFilters(false);
    setIsSearchFocused(false);
    setHighlightedInstitutionId('');
    setCurrentPage(1);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsSearchFocused(false);
      return;
    }

    if (event.key === 'Enter' && predictiveSuggestions.length) {
      event.preventDefault();
      applySuggestionSearch(predictiveSuggestions[0]);
    }
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!normalizeText(form.nombreIe)) nextErrors.nombreIe = 'El nombre de la IE es obligatorio.';
    if (!normalizeText(form.codLocal)) nextErrors.codLocal = 'El codigo local es obligatorio.';
    if (!normalizeText(form.codModular)) nextErrors.codModular = 'El codigo modular es obligatorio.';
    if (!form.nivel) nextErrors.nivel = 'Selecciona un nivel.';
    if (!form.modalidad) nextErrors.modalidad = 'Selecciona una modalidad.';
    if (!normalizeText(form.distrito)) nextErrors.distrito = 'El distrito es obligatorio.';
    if (!normalizeText(form.rei)) nextErrors.rei = 'La REI es obligatoria.';
    if (!normalizeText(form.nombreDirector)) {
      nextErrors.nombreDirector = 'El nombre del director(a) es obligatorio.';
    }

    if (form.codLocal && !isNumericCode(form.codLocal)) {
      nextErrors.codLocal = 'El codigo local debe ser numerico.';
    }

    if (form.codModular && !isNumericCode(form.codModular)) {
      nextErrors.codModular = 'El codigo modular debe ser numerico.';
    }

    const codLocalNormalized = normalizeCode(form.codLocal);
    const codModularNormalized = normalizeCode(form.codModular);

    const codLocalDuplicated = institutions.some(
      (item) =>
        normalizeCode(item.cod_local) === codLocalNormalized && String(item.id) !== String(form.id || ''),
    );

    if (codLocalNormalized && codLocalDuplicated) {
      nextErrors.codLocal = 'Este codigo local ya esta registrado.';
    }

    const codModularDuplicated = institutions.some(
      (item) =>
        normalizeCode(item.cod_modular) === codModularNormalized &&
        String(item.id) !== String(form.id || ''),
    );

    if (codModularNormalized && codModularDuplicated) {
      nextErrors.codModular = 'Este codigo modular ya esta registrado.';
    }

    return nextErrors;
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setSuccess('');

    const validations = validateForm();
    if (Object.keys(validations).length) {
      setFieldErrors(validations);
      setError('Revisa los campos obligatorios y corrige los errores marcados.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    const payload = {
      nombre_ie: normalizeText(form.nombreIe),
      cod_local: normalizeCode(form.codLocal),
      cod_modular: normalizeCode(form.codModular),
      nivel: form.nivel,
      modalidad: form.modalidad,
      distrito: normalizeText(form.distrito),
      rei: normalizeText(form.rei),
      nombre_director: normalizeText(form.nombreDirector),
      estado: form.estado || 'active',
      updated_at: new Date().toISOString(),
    };

    let saveError = null;

    if (form.id) {
      const { error: updateError } = await supabase
        .from('educational_institutions')
        .update(payload)
        .eq('id', form.id);
      saveError = updateError;
    } else {
      const { error: insertError } = await supabase.from('educational_institutions').insert([
        {
          ...payload,
          created_by: profile?.id || null,
        },
      ]);
      saveError = insertError;
    }

    if (saveError) {
      if (saveError.code === '23505') {
        const duplicateMessage = /cod_local/i.test(saveError.message)
          ? 'Ya existe una institucion con ese codigo local.'
          : /cod_modular/i.test(saveError.message)
            ? 'Ya existe una institucion con ese codigo modular.'
            : 'Ya existe un registro duplicado con esos datos.';
        setError(duplicateMessage);
        showToast(duplicateMessage, 'error');
      } else {
        const message = saveError.message || 'No se pudo guardar la institucion educativa.';
        setError(message);
        showToast(message, 'error');
      }
      setIsSubmitting(false);
      return;
    }

    const successMessage = form.id
      ? 'Institucion educativa actualizada correctamente.'
      : 'Institucion educativa registrada correctamente.';

    setSuccess(successMessage);
    showToast(successMessage, 'success');
    resetForm();
    await loadInstitutions();
    setIsSubmitting(false);
  };

  const handleEdit = (item) => {
    setError('');
    setSuccess('');
    setFieldErrors({});
    setIsFormExpanded(true);
    setForm({
      id: item.id,
      nombreIe: item.nombre_ie || '',
      codLocal: item.cod_local || '',
      codModular: item.cod_modular || '',
      nivel: item.nivel || 'inicial_cuna_jardin',
      modalidad: item.modalidad || 'EBR',
      distrito: item.distrito || '',
      rei: item.rei || '',
      nombreDirector: item.nombre_director || '',
      estado: item.estado || 'active',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleStatus = async (item) => {
    const nextStatus = item.estado === 'inactive' ? 'active' : 'inactive';
    setIsTogglingStatusId(item.id);

    const { error: updateError } = await supabase
      .from('educational_institutions')
      .update({ estado: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    if (updateError) {
      const message = updateError.message || 'No se pudo actualizar el estado.';
      setError(message);
      showToast(message, 'error');
      setIsTogglingStatusId('');
      return;
    }

    showToast(
      nextStatus === 'active' ? 'Institucion activada correctamente.' : 'Institucion desactivada correctamente.',
      'success',
    );
    await loadInstitutions();
    setIsTogglingStatusId('');
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);

    const { error: updateError } = await supabase
      .from('educational_institutions')
      .update({ estado: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', deleteTarget.id);

    if (updateError) {
      const message = updateError.message || 'No se pudo desactivar la institucion.';
      setError(message);
      showToast(message, 'error');
      setIsDeleting(false);
      return;
    }

    setDeleteTarget(null);
    setIsDeleting(false);
    showToast('Institucion marcada como inactiva para conservar historicos.', 'success');
    await loadInstitutions();
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <SectionHeader eyebrow="Acceso restringido" title="No autorizado" />
          <p className="text-sm text-slate-400">
            Solo administradores pueden gestionar el catalogo de instituciones educativas.
          </p>
        </Card>
      </div>
    );
  }

  const rangeStart = filteredInstitutions.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredInstitutions.length);

  return (
    <div className="flex flex-col gap-6">
      {toast.show ? (
        <div
          className={`pointer-events-none fixed right-5 top-5 z-50 transition-all duration-300 ${
            toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
        >
          <div
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-xl ${
              toast.tone === 'success'
                ? 'border border-emerald-300/30 bg-emerald-500/15 text-emerald-100 shadow-[0_16px_44px_rgba(16,185,129,0.24)]'
                : 'border border-rose-300/30 bg-rose-500/15 text-rose-100 shadow-[0_16px_44px_rgba(244,63,94,0.24)]'
            }`}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-200" />
            ) : (
              <AlertTriangle size={18} className="text-rose-200" />
            )}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      ) : null}

      <SectionHeader
        eyebrow="Catalogo"
        title="Instituciones Educativas"
        description="Busca y gestiona IE."
        size="page"
      />

      <Card className="flex flex-wrap items-center gap-2.5 py-3">
        <span className="rounded-full border border-slate-700/70 bg-slate-900/55 px-3 py-1 text-xs text-slate-200">
          IE: <span className="font-semibold text-slate-100">{summary.total}</span>
        </span>
        <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
          Activas: <span className="font-semibold">{summary.active}</span>
        </span>
        <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
          Inactivas: <span className="font-semibold">{summary.inactive}</span>
        </span>
      </Card>

      <datalist id="districts-catalog">
        {districtOptions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="rei-catalog">
        {reiOptions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      <Card className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => setIsFormExpanded((current) => !current)}
          className="inline-flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:border-slate-500"
        >
          <span>{isFormExpanded ? 'Registro de IE' : '+ Registrar institucion educativa'}</span>
          {isFormExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isFormExpanded ? (
          <>
            <SectionHeader
              eyebrow="Registro"
              title={isEditing ? 'Editando institucion educativa' : 'Registrar institucion educativa'}
              description="Registra o edita una IE."
            />

            {isEditing ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Editando institucion educativa.
              </div>
            ) : null}

            <form onSubmit={handleSubmit}>
              <fieldset disabled={isSubmitting} className="grid gap-4 disabled:opacity-80 md:grid-cols-3">
                <Input
                  id="nombreIe"
                  label="Nombre de la IE"
                  value={form.nombreIe}
                  onChange={(event) => setForm((prev) => ({ ...prev, nombreIe: event.target.value }))}
                  placeholder="Nombre de la institucion"
                  className="md:col-span-2"
                  error={fieldErrors.nombreIe}
                />
                <Input
                  id="distritoIe"
                  label="Distrito"
                  value={form.distrito}
                  onChange={(event) => setForm((prev) => ({ ...prev, distrito: event.target.value }))}
                  placeholder="Distrito / Provincia"
                  list="districts-catalog"
                  error={fieldErrors.distrito}
                />

                <Input
                  id="codLocalIe"
                  label="Codigo local"
                  value={form.codLocal}
                  onChange={(event) => setForm((prev) => ({ ...prev, codLocal: event.target.value }))}
                  placeholder="Solo numeros"
                  error={fieldErrors.codLocal}
                />
                <Input
                  id="codModularIe"
                  label="Codigo modular"
                  value={form.codModular}
                  onChange={(event) => setForm((prev) => ({ ...prev, codModular: event.target.value }))}
                  placeholder="Solo numeros"
                  error={fieldErrors.codModular}
                />
                <Input
                  id="reiIe"
                  label="REI"
                  value={form.rei}
                  onChange={(event) => setForm((prev) => ({ ...prev, rei: event.target.value }))}
                  placeholder="REI"
                  list="rei-catalog"
                  error={fieldErrors.rei}
                />

                <Select
                  id="nivelIe"
                  label="Nivel"
                  value={form.nivel}
                  onChange={(event) => setForm((prev) => ({ ...prev, nivel: event.target.value }))}
                  error={fieldErrors.nivel}
                >
                  <option value="inicial_cuna_jardin">INICIAL CUNA JARDIN</option>
                  <option value="inicial_jardin">INICIAL JARDIN</option>
                  <option value="primaria">PRIMARIA</option>
                  <option value="secundaria">SECUNDARIA</option>
                </Select>
                <Select
                  id="modalidadIe"
                  label="Modalidad"
                  value={form.modalidad}
                  onChange={(event) => setForm((prev) => ({ ...prev, modalidad: event.target.value }))}
                  error={fieldErrors.modalidad}
                >
                  <option value="EBR">EBR</option>
                  <option value="EBE">EBE</option>
                  <option value="EBA">EBA</option>
                </Select>
                <Select
                  id="estadoIe"
                  label="Estado"
                  value={form.estado}
                  onChange={(event) => setForm((prev) => ({ ...prev, estado: event.target.value }))}
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </Select>

                <Input
                  id="directorIe"
                  label="Nombre del director(a)"
                  value={form.nombreDirector}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      nombreDirector: event.target.value,
                    }))
                  }
                  placeholder="Nombres y apellidos"
                  className="md:col-span-3"
                  error={fieldErrors.nombreDirector}
                />

                <div className="md:col-span-3 flex flex-wrap items-end gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {isSubmitting
                      ? isEditing
                        ? 'Guardando cambios...'
                        : 'Guardando...'
                      : isEditing
                        ? 'Guardar cambios'
                        : 'Guardar IE'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setSuccess('');
                      setFieldErrors({});
                      setForm((prev) => ({ ...prev, ...EMPTY_FORM, id: prev.id }));
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Limpiar
                  </button>

                  {isEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setSuccess('');
                        resetForm();
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
                    >
                      Cancelar edicion
                    </button>
                  ) : null}
                </div>
              </fieldset>
            </form>

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
          </>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeader eyebrow="Listado" title="Listado de IE" description="Busca y gestiona IE." />
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 px-3 py-2 text-xs text-slate-300">
            Mostrando {rangeStart}-{rangeEnd} de {filteredInstitutions.length} IE
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-start">
          <div ref={searchBoxRef} className="relative">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Buscar IE</span>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3">
                <Search size={14} className="text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setHighlightedInstitutionId('');
                  }}
                  onFocus={() => setIsSearchFocused(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Nombre, codigo local, codigo modular o director"
                  className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </label>

            {isSearchFocused && search.trim() ? (
              <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/95 shadow-[0_12px_34px_rgba(2,6,23,0.45)]">
                {predictiveSuggestions.length ? (
                  <div className="max-h-72 overflow-y-auto">
                    {predictiveSuggestions.map((item) => (
                      <button
                        key={`suggestion-${item.id}`}
                        type="button"
                        onClick={() => applySuggestionSearch(item)}
                        className="flex w-full flex-col gap-1 border-b border-slate-800/80 px-3 py-2 text-left last:border-b-0 hover:bg-slate-900/70"
                      >
                        <span className="truncate text-sm font-semibold text-slate-100">{item.nombre_ie}</span>
                        <span className="truncate text-xs text-slate-400">
                          Cod. modular: {item.cod_modular || '-'} | Cod. local: {item.cod_local || '-'} |{' '}
                          {item.distrito || '-'} | {formatLevelLabel(item.nivel)} | {item.modalidad || '-'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-3 py-2 text-sm text-slate-400">No se encontraron IE.</p>
                )}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700/60 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
          >
            Limpiar filtros
          </button>

          <button
            type="button"
            onClick={() => setShowAdvancedFilters((current) => !current)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-700/60 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
          >
            {showAdvancedFilters ? 'Ocultar filtros' : 'Filtros avanzados'}
            {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showAdvancedFilters ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Select id="filterNivel" label="Nivel" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="inicial_cuna_jardin">INICIAL CUNA JARDIN</option>
              <option value="inicial_jardin">INICIAL JARDIN</option>
              <option value="primaria">PRIMARIA</option>
              <option value="secundaria">SECUNDARIA</option>
            </Select>
            <Select
              id="filterModalidad"
              label="Modalidad"
              value={modalityFilter}
              onChange={(event) => setModalityFilter(event.target.value)}
            >
              <option value="all">Todas</option>
              <option value="EBR">EBR</option>
              <option value="EBE">EBE</option>
              <option value="EBA">EBA</option>
            </Select>
            <Select
              id="filterDistrito"
              label="Distrito"
              value={districtFilter}
              onChange={(event) => setDistrictFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              {districtOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select id="filterRei" label="REI" value={reiFilter} onChange={(event) => setReiFilter(event.target.value)}>
              <option value="all">Todas</option>
              {reiOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              id="filterEstado"
              label="Estado"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </Select>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-cyan-200">
              <Loader2 size={16} className="animate-spin" />
              <p>Cargando instituciones educativas...</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-slate-700/60 bg-slate-900/70">
              <span className="block h-full w-1/3 animate-pulse rounded-full bg-cyan-400/70" />
            </div>
            <div className="mt-3 space-y-2" aria-hidden="true">
              <div className="h-3 w-2/3 animate-pulse rounded-lg bg-slate-800/80" />
              <div className="h-3 w-1/2 animate-pulse rounded-lg bg-slate-800/65" />
            </div>
          </div>
        ) : filteredInstitutions.length === 0 ? (
          <p className="text-sm text-slate-400">No se encontraron IE con los filtros actuales.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-800/70 bg-slate-950/35">
              <table className="min-w-[1180px] w-full text-left text-sm">
                <thead className="border-b border-slate-800/70 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Nombre IE</th>
                    <th className="px-3 py-3">Codigo modular</th>
                    <th className="px-3 py-3">Codigo local</th>
                    <th className="px-3 py-3">Nivel</th>
                    <th className="px-3 py-3">Modalidad</th>
                    <th className="px-3 py-3">Distrito</th>
                    <th className="px-3 py-3">REI</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInstitutions.map((item) => (
                    <tr
                      key={item.id}
                      ref={(node) => {
                        if (node) rowRefs.current.set(item.id, node);
                        else rowRefs.current.delete(item.id);
                      }}
                      className={`border-b border-slate-800/60 last:border-b-0 ${
                        item.id === highlightedInstitutionId ? 'bg-cyan-500/10' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-slate-100">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400" />
                          <span title={item.nombre_ie} className="max-w-[32ch] truncate">
                            {item.nombre_ie}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-200">{item.cod_modular}</td>
                      <td className="px-3 py-3 text-slate-200">{item.cod_local}</td>
                      <td className="px-3 py-3 text-slate-200">{formatLevelLabel(item.nivel)}</td>
                      <td className="px-3 py-3 text-slate-200">{item.modalidad || '-'}</td>
                      <td className="px-3 py-3 text-slate-200">{item.distrito || '-'}</td>
                      <td className="px-3 py-3 text-slate-200">{item.rei || '-'}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            item.estado === 'inactive'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                          }`}
                        >
                          {formatStatusLabel(item.estado)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailTarget(item)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                          >
                            <Eye size={13} />
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                          >
                            <Pencil size={13} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            disabled={isTogglingStatusId === item.id}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              item.estado === 'inactive'
                                ? 'border-emerald-500/35 text-emerald-200 hover:border-emerald-400/60'
                                : 'border-amber-500/35 text-amber-200 hover:border-amber-400/60'
                            } disabled:cursor-not-allowed disabled:opacity-70`}
                          >
                            {isTogglingStatusId === item.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Power size={13} />
                            )}
                            {item.estado === 'inactive' ? 'Activar' : 'Desactivar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-400/60"
                          >
                            <Trash2 size={13} />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Pagina {currentPage} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border border-slate-700/60 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-xl border border-slate-700/60 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {detailTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md md:p-6"
          onClick={() => setDetailTarget(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-slate-700/80 bg-slate-900 p-6 shadow-[0_30px_80px_rgba(2,6,23,0.85)] md:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800/70 pb-4">
              <p className="text-lg font-semibold text-slate-100">Detalle de institucion educativa</p>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="rounded-full border border-slate-700/60 px-3 py-1.5 text-xs text-slate-300"
              >
                Cerrar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                ['Nombre IE', detailTarget.nombre_ie],
                ['Codigo local', detailTarget.cod_local],
                ['Codigo modular', detailTarget.cod_modular],
                ['Nivel', formatLevelLabel(detailTarget.nivel)],
                ['Modalidad', detailTarget.modalidad],
                ['Distrito', detailTarget.distrito],
                ['REI', detailTarget.rei],
                ['Director(a)', detailTarget.nombre_director],
                ['Estado', formatStatusLabel(detailTarget.estado)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="min-h-14 rounded-xl border border-slate-800/70 bg-slate-900/60 px-4 py-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                  <p className="mt-1 text-sm text-slate-100">{value || '-'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        tone="warning"
        title="Desactivar institucion educativa"
        description="Para conservar historicos, esta accion la marcara como inactiva."
        details={deleteTarget ? deleteTarget.nombre_ie || '' : ''}
        confirmText={isDeleting ? 'Desactivando...' : 'Si, desactivar'}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleSoftDelete}
        loading={isDeleting}
      />
    </div>
  );
}
