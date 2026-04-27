import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileDown,
  Filter,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
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
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

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
const DB_FETCH_BATCH_SIZE = 1000;
const STATIC_MAP_POINT_FALLBACK = { lat: -12.0464, lon: -77.0428, label: 'LIMA', zoom: 15 };
const DISTRICT_STATIC_POINTS = {
  ATE: { lat: -12.0406, lon: -76.9237, label: 'ATE', zoom: 16 },
  CHACLACAYO: { lat: -11.9836, lon: -76.7672, label: 'CHACLACAYO', zoom: 16 },
  CIENEGUILLA: { lat: -12.1065, lon: -76.8114, label: 'CIENEGUILLA', zoom: 16 },
  'LA MOLINA': { lat: -12.0767, lon: -76.9492, label: 'LA MOLINA', zoom: 16 },
  LURIGANCHO: { lat: -11.9364, lon: -76.7094, label: 'LURIGANCHO', zoom: 16 },
  'SANTA ANITA': { lat: -12.0461, lon: -76.9668, label: 'SANTA ANITA', zoom: 16 },
};

const formatLevelLabel = (value) => {
  if (value === 'inicial_cuna_jardin') return 'INICIAL CUNA JARDIN';
  if (value === 'inicial_jardin') return 'INICIAL JARDIN';
  if (value === 'inicial') return 'INICIAL JARDIN';
  if (value === 'primaria') return 'PRIMARIA';
  if (value === 'secundaria') return 'SECUNDARIA';
  if (value === 'tecnico_productiva') return 'TECNICO PRODUCTIVA';
  return '-';
};

const formatStatusLabel = (value) => (value === 'inactive' ? 'Inactiva' : 'Activa');

const normalizeText = (value) => String(value || '').trim();
const normalizeCode = (value) => normalizeText(value).replace(/\s+/g, '');
const isNumericCode = (value) => /^\d+$/.test(normalizeCode(value));
const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const normalizeDistrictKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const normalizeInstitutionCodes = (codLocalRaw, codModularRaw) => {
  const codLocalDigits = onlyDigits(codLocalRaw);
  const codModularDigits = onlyDigits(codModularRaw);

  let codLocal = codLocalDigits.length === 6 ? codLocalDigits : '';
  let codModular = codModularDigits.length === 7 ? codModularDigits : '';

  if (!codLocal && codModularDigits.length === 6) codLocal = codModularDigits;
  if (!codModular && codLocalDigits.length === 7) codModular = codLocalDigits;
  if (!codLocal) codLocal = codLocalDigits || codModularDigits || '';
  if (!codModular) codModular = codModularDigits || codLocalDigits || '';

  return { cod_local: codLocal, cod_modular: codModular };
};

const normalizeInstitutionRecord = (record) => {
  const normalizedCodes = normalizeInstitutionCodes(record?.cod_local, record?.cod_modular);
  return {
    ...record,
    cod_local: normalizedCodes.cod_local,
    cod_modular: normalizedCodes.cod_modular,
  };
};

const dedupeInstitutions = (records) => {
  const byKey = new Map();
  (records || []).forEach((raw) => {
    const item = normalizeInstitutionRecord(raw);
    const key = [
      String(item?.nombre_ie || '').trim().toUpperCase(),
      String(item?.distrito || '').trim().toUpperCase(),
      String(item?.cod_local || '').trim(),
      String(item?.cod_modular || '').trim(),
    ].join('|');

    const score =
      (String(item?.cod_local || '').length === 6 ? 2 : 0) +
      (String(item?.cod_modular || '').length === 7 ? 2 : 0) +
      (item?.estado === 'active' ? 1 : 0) +
      (item?.nombre_director ? 1 : 0) +
      (item?.updated_at ? 1 : 0);

    const current = byKey.get(key);
    if (!current || score >= current.score) {
      byKey.set(key, { score, item });
    }
  });

  return Array.from(byKey.values()).map((entry) => entry.item);
};

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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isDistrictComboOpen, setIsDistrictComboOpen] = useState(false);
  const [highlightedInstitutionId, setHighlightedInstitutionId] = useState('');
  const [toast, setToast] = useState({
    show: false,
    visible: false,
    message: '',
    tone: 'success',
  });

  const toastTimersRef = useRef({ hide: null, remove: null });
  const searchBoxRef = useRef(null);
  const districtComboRef = useRef(null);
  const rowRefs = useRef(new Map());
  const registerPanelRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

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

    try {
      let from = 0;
      const accumulatedInstitutions = [];

      while (true) {
        const to = from + DB_FETCH_BATCH_SIZE - 1;

        const { data, error: fetchError } = await supabase
          .from('educational_institutions')
          .select('*')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);

        if (fetchError) {
          throw new Error(fetchError.message || 'No se pudieron cargar las instituciones educativas.');
        }

        const chunk = data || [];
        if (!chunk.length) break;

        accumulatedInstitutions.push(...chunk);

        if (chunk.length < DB_FETCH_BATCH_SIZE) break;
        from += DB_FETCH_BATCH_SIZE;
      }

      setInstitutions(dedupeInstitutions(accumulatedInstitutions));
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar las instituciones educativas.';
      setError(message);
      showToast(message, 'error');
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
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

  const districtOptions = useMemo(() => {
    const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
    return Array.from(
      new Set(institutions.map((item) => normalizeText(item.distrito)).filter(Boolean)),
    ).sort((left, right) => collator.compare(left, right));
  }, [institutions]);

  const reiOptions = useMemo(() => {
    const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
    return Array.from(new Set(institutions.map((item) => normalizeText(item.rei)).filter(Boolean))).sort(
      (left, right) => {
        const leftIsSinRei = left.toUpperCase() === 'SIN REI';
        const rightIsSinRei = right.toUpperCase() === 'SIN REI';

        if (leftIsSinRei && !rightIsSinRei) return -1;
        if (!leftIsSinRei && rightIsSinRei) return 1;

        return collator.compare(left, right);
      },
    );
  }, [institutions]);

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

  const primaryCount = useMemo(
    () =>
      institutions.filter((item) => String(item.nivel || '').toLowerCase().includes('primaria')).length,
    [institutions],
  );

  const staleWithoutSupervision30d = useMemo(() => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    return institutions.filter((item) => {
      if (!item.updated_at) return true;
      const updated = new Date(item.updated_at).getTime();
      return Number.isFinite(updated) ? now - updated > THIRTY_DAYS : true;
    }).length;
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

  const totalPages = Math.max(1, Math.ceil(filteredInstitutions.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedInstitutions = useMemo(() => {
    const from = (currentPage - 1) * PAGE_SIZE;
    return filteredInstitutions.slice(from, from + PAGE_SIZE);
  }, [filteredInstitutions, currentPage]);

  const previewInstitution = useMemo(() => {
    if (isFormExpanded) {
      return {
        nombre_ie: form.nombreIe || '',
        distrito: form.distrito || '',
        rei: form.rei || '',
      };
    }
    return detailTarget || paginatedInstitutions[0] || institutions[0] || null;
  }, [isFormExpanded, form.nombreIe, form.distrito, form.rei, detailTarget, paginatedInstitutions, institutions]);

  const districtComboOptions = useMemo(() => {
    const term = String(form.distrito || '').trim().toLowerCase();
    if (!term) return districtOptions.slice(0, 12);

    return [...districtOptions]
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(term) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
      })
      .filter((item) => item.toLowerCase().includes(term))
      .slice(0, 12);
  }, [districtOptions, form.distrito]);

  const staticGeoPoint = useMemo(() => {
    const districtKey = normalizeDistrictKey(previewInstitution?.distrito);
    return DISTRICT_STATIC_POINTS[districtKey] || {
      ...STATIC_MAP_POINT_FALLBACK,
      label: districtKey || STATIC_MAP_POINT_FALLBACK.label,
    };
  }, [previewInstitution?.distrito]);

  const handleExportCsv = () => {
    const headers = [
      'codigo_modular',
      'nombre_institucion',
      'nivel',
      'modalidad',
      'distrito',
      'rei',
      'estado',
      'director',
    ];

    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filteredInstitutions.map((item) =>
      [
        item.cod_modular || '',
        item.nombre_ie || '',
        formatLevelLabel(item.nivel),
        item.modalidad || '',
        item.distrito || '',
        item.rei || '',
        formatStatusLabel(item.estado),
        item.nombre_director || '',
      ]
        .map(escapeCsv)
        .join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `instituciones_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const isEditing = Boolean(form.id);

  useEffect(() => {
    if (!isFormExpanded) return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [staticGeoPoint.lat, staticGeoPoint.lon],
      zoom: staticGeoPoint.zoom || 14,
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map);

    mapRef.current = map;
  }, [isFormExpanded, staticGeoPoint.lat, staticGeoPoint.lon, staticGeoPoint.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!isFormExpanded || !map) return;

    const frame = window.requestAnimationFrame(() => {
      map.invalidateSize();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isFormExpanded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setView([staticGeoPoint.lat, staticGeoPoint.lon], staticGeoPoint.zoom || 14, {
      animate: true,
      duration: 0.35,
    });

    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    markerRef.current = L.marker([staticGeoPoint.lat, staticGeoPoint.lon]).addTo(map);
  }, [staticGeoPoint.lat, staticGeoPoint.lon, staticGeoPoint.zoom]);

  useEffect(() => {
    if (isEditing) setIsFormExpanded(true);
  }, [isEditing]);

  useEffect(() => {
    if (!isSearchFocused && !isDistrictComboOpen) return undefined;

    const handleOutsidePointer = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (searchBoxRef.current?.contains(target)) return;
      if (districtComboRef.current?.contains(target)) return;
      setIsSearchFocused(false);
      setIsDistrictComboOpen(false);
    };

    window.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [isSearchFocused, isDistrictComboOpen]);

  useEffect(() => {
    if (!isFormExpanded) return;
    registerPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isFormExpanded]);

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

    const codModularNormalized = normalizeCode(form.codModular);

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
        const duplicateMessage = /cod_modular/i.test(saveError.message)
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

      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-[0_8px_26px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/70 md:p-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Catálogo de Instituciones</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Gestión y monitoreo del padrón nacional de centros educativos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileDown size={16} />
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={() => setIsFormExpanded((current) => !current)}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800"
              >
                <Plus size={16} />
                {isFormExpanded ? 'Ocultar Registro' : 'Registrar Institución'}
                {isFormExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          <div className="order-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Instituciones</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-3xl font-bold text-cyan-700 dark:text-cyan-300">{summary.total}</p>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                  +2.4%
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Activas</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{summary.active}</p>
                <span className="text-xs text-slate-400">
                  {summary.total ? `${((summary.active / summary.total) * 100).toFixed(1)}% del total` : '0.0% del total'}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Nivel Primaria</p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{primaryCount}</p>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-cyan-600"
                    style={{ width: `${summary.total ? Math.min(100, (primaryCount / summary.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Sin Supervisión (30D)</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-3xl font-bold text-rose-700 dark:text-rose-300">{staleWithoutSupervision30d}</p>
                <AlertTriangle size={17} className="text-rose-600 dark:text-rose-300" />
              </div>
            </div>
          </div>

          <div className="order-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Select id="filterNivel" label="Nivel Educativo" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
                <option value="all">Todos los niveles</option>
                <option value="inicial_cuna_jardin">INICIAL CUNA JARDIN</option>
                <option value="inicial_jardin">INICIAL JARDIN</option>
                <option value="primaria">PRIMARIA</option>
                <option value="secundaria">SECUNDARIA</option>
                <option value="tecnico_productiva">TECNICO PRODUCTIVA</option>
              </Select>
              <Select id="filterModalidad" label="Modalidad" value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)}>
                <option value="all">Todas las modalidades</option>
                <option value="EBR">EBR</option>
                <option value="EBE">EBE</option>
                <option value="EBA">EBA</option>
              </Select>
              <Select id="filterEstado" label="Estado Operativo" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Cualquier estado</option>
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </Select>
              <Select id="filterDistrito" label="Región / DRE" value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)}>
                <option value="all">Todas las regiones</option>
                {districtOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white transition hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                <Filter size={15} />
                Aplicar filtros
              </button>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div ref={searchBoxRef} className="relative">
                <label className="sr-only" htmlFor="searchIe">Buscar IE</label>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-900">
                  <Search size={14} className="text-slate-400" />
                  <input
                    id="searchIe"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setHighlightedInstitutionId('');
                    }}
                    onFocus={() => setIsSearchFocused(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar instituciones por nombre o código modular..."
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                  />
                </div>
                {isSearchFocused && search.trim() ? (
                  <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(2,6,23,0.18)] dark:border-slate-700 dark:bg-slate-900">
                    {predictiveSuggestions.length ? (
                      <div className="max-h-72 overflow-y-auto">
                        {predictiveSuggestions.map((item) => (
                          <button
                            key={`suggestion-${item.id}`}
                            type="button"
                            onClick={() => applySuggestionSearch(item)}
                            className="flex w-full flex-col gap-1 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/80"
                          >
                            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{item.nombre_ie}</span>
                            <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                              Cod. modular: {item.cod_modular || '-'} | Cod. local: {item.cod_local || '-'} | {item.distrito || '-'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No se encontraron IE.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="order-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900/70">
            {loading ? (
              <div className="px-6 py-5">
                <div className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-200">
                  <Loader2 size={16} className="animate-spin" />
                  <p>Cargando instituciones educativas...</p>
                </div>
              </div>
            ) : filteredInstitutions.length === 0 ? (
              <p className="px-6 py-5 text-sm text-slate-500 dark:text-slate-400">No se encontraron IE con los filtros actuales.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1160px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60">
                      <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Código Modular</th>
                      <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Nombre Institución</th>
                      <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Nivel / Modalidad</th>
                      <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Ubicación</th>
                      <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Estado</th>
                      <th className="px-6 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginatedInstitutions.map((item) => (
                      <tr
                        key={item.id}
                        ref={(node) => {
                          if (node) rowRefs.current.set(item.id, node);
                          else rowRefs.current.delete(item.id);
                        }}
                        className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                          item.id === highlightedInstitutionId ? 'bg-cyan-50 dark:bg-cyan-900/20' : ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {item.cod_modular || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200">
                              <Building2 size={14} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-slate-100">{item.nombre_ie || '-'}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{item.rei || 'Sin REI'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm text-slate-700 dark:text-slate-200">{formatLevelLabel(item.nivel)}</span>
                            <span className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{item.modalidad || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                            <MapPin size={13} />
                            {item.distrito || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                              item.estado === 'inactive'
                                ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${item.estado === 'inactive' ? 'bg-slate-500' : 'bg-emerald-500'}`} />
                            {formatStatusLabel(item.estado)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => setDetailTarget(item)} className="p-2 text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-200" title="Ver">
                              <Eye size={15} />
                            </button>
                            <button type="button" onClick={() => handleEdit(item)} className="p-2 text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-200" title="Editar">
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(item)}
                              disabled={isTogglingStatusId === item.id}
                              className="p-2 text-slate-400 hover:text-amber-600 disabled:opacity-50 dark:hover:text-amber-300"
                              title={item.estado === 'inactive' ? 'Activar' : 'Desactivar'}
                            >
                              {isTogglingStatusId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Power size={15} />}
                            </button>
                            <button type="button" onClick={() => setDeleteTarget(item)} className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-300" title="Inactivar">
                              <Trash2 size={15} />
                            </button>
                            <button type="button" className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="Más opciones">
                              <MoreVertical size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/80">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Mostrando <span className="font-bold text-slate-900 dark:text-slate-100">{rangeStart}-{rangeEnd}</span> de{' '}
                <span className="font-bold text-slate-900 dark:text-slate-100">{filteredInstitutions.length}</span> registros
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Anterior
                </button>
                <span className="rounded-lg border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white">
                  {currentPage}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>

          {isFormExpanded ? (
            <div ref={registerPanelRef} className="order-2 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Editor de Registro Maestro</h3>
                  <span className="rounded bg-cyan-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200">
                    Validación Activa
                  </span>
                </div>

                {isEditing ? (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
                    Editando institución educativa.
                  </div>
                ) : null}

                <form onSubmit={handleSubmit}>
                  <fieldset disabled={isSubmitting} className="grid gap-4 md:grid-cols-2 disabled:opacity-80">
                    <Input id="codModularIe" label="Código Modular" value={form.codModular} onChange={(event) => setForm((prev) => ({ ...prev, codModular: event.target.value }))} placeholder="Solo números" error={fieldErrors.codModular} />
                    <Input id="codLocalIe" label="Código Local" value={form.codLocal} onChange={(event) => setForm((prev) => ({ ...prev, codLocal: event.target.value }))} placeholder="Solo números" error={fieldErrors.codLocal} />
                    <Input id="nombreIe" label="Nombre de la Institución" value={form.nombreIe} onChange={(event) => setForm((prev) => ({ ...prev, nombreIe: event.target.value }))} className="md:col-span-2" error={fieldErrors.nombreIe} />
                    <div ref={districtComboRef} className="relative flex flex-col gap-1.5">
                      <label htmlFor="distritoIe" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Distrito
                      </label>
                      <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 focus-within:border-cyan-500/70 focus-within:ring-2 focus-within:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900">
                        <input
                          id="distritoIe"
                          value={form.distrito}
                          onFocus={() => setIsDistrictComboOpen(true)}
                          onChange={(event) => {
                            const value = event.target.value;
                            setForm((prev) => ({ ...prev, distrito: value }));
                            setIsDistrictComboOpen(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setIsDistrictComboOpen(false);
                            }
                            if (event.key === 'Enter' && districtComboOptions.length) {
                              event.preventDefault();
                              const first = districtComboOptions[0];
                              setForm((prev) => ({ ...prev, distrito: first }));
                              setIsDistrictComboOpen(false);
                            }
                          }}
                          placeholder="Selecciona o escribe distrito"
                          autoComplete="off"
                          className="h-10 w-full rounded-lg bg-transparent px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => setIsDistrictComboOpen((current) => !current)}
                          className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                          aria-label="Mostrar distritos"
                        >
                          <ChevronDown size={15} />
                        </button>
                      </div>
                      {fieldErrors.distrito ? (
                        <p className="text-xs text-rose-600 dark:text-rose-300">{fieldErrors.distrito}</p>
                      ) : null}
                      {isDistrictComboOpen ? (
                        <div className="absolute z-30 mt-[62px] max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-[0_16px_38px_rgba(2,6,23,0.22)] dark:border-slate-700 dark:bg-slate-900">
                          {districtComboOptions.length ? (
                            districtComboOptions.map((item) => (
                              <button
                                key={`district-${item}`}
                                type="button"
                                onClick={() => {
                                  setForm((prev) => ({ ...prev, distrito: item }));
                                  setIsDistrictComboOpen(false);
                                }}
                                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                                  item === form.distrito
                                    ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                }`}
                              >
                                {item}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                              Sin coincidencias para el distrito.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <Input id="directorIe" label="Director(a) a cargo" value={form.nombreDirector} onChange={(event) => setForm((prev) => ({ ...prev, nombreDirector: event.target.value }))} error={fieldErrors.nombreDirector} />
                    <Select id="nivelIe" label="Nivel" value={form.nivel} onChange={(event) => setForm((prev) => ({ ...prev, nivel: event.target.value }))} error={fieldErrors.nivel}>
                      <option value="inicial_cuna_jardin">INICIAL CUNA JARDIN</option>
                      <option value="inicial_jardin">INICIAL JARDIN</option>
                      <option value="primaria">PRIMARIA</option>
                      <option value="secundaria">SECUNDARIA</option>
                      <option value="tecnico_productiva">TECNICO PRODUCTIVA</option>
                    </Select>
                    <Select id="modalidadIe" label="Modalidad" value={form.modalidad} onChange={(event) => setForm((prev) => ({ ...prev, modalidad: event.target.value }))} error={fieldErrors.modalidad}>
                      <option value="EBR">EBR</option>
                      <option value="EBE">EBE</option>
                      <option value="EBA">EBA</option>
                    </Select>
                    <Select id="reiIe" label="REI" value={form.rei} onChange={(event) => setForm((prev) => ({ ...prev, rei: event.target.value }))} error={fieldErrors.rei}>
                      <option value="" disabled>Selecciona REI</option>
                      {reiOptions.map((item) => (<option key={item} value={item}>{item}</option>))}
                    </Select>
                    <Select id="estadoIe" label="Estado" value={form.estado} onChange={(event) => setForm((prev) => ({ ...prev, estado: event.target.value }))}>
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva</option>
                    </Select>
                    <div className="md:col-span-2 flex flex-wrap justify-end gap-3 pt-2">
                      <button type="button" onClick={() => { setError(''); setSuccess(''); setFieldErrors({}); setForm((prev) => ({ ...prev, ...EMPTY_FORM, id: prev.id })); }} className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                        Limpiar
                      </button>
                      {isEditing ? (
                        <button type="button" onClick={() => { setError(''); setSuccess(''); resetForm(); }} className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                          Cancelar edición
                        </button>
                      ) : null}
                      <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-70 dark:bg-cyan-700 dark:hover:bg-cyan-800">
                        {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : null}
                        {isSubmitting ? (isEditing ? 'Guardando cambios...' : 'Guardando...') : isEditing ? 'Guardar cambios' : 'Guardar IE'}
                      </button>
                    </div>
                  </fieldset>
                </form>
                {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
                {success ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{success}</p> : null}
              </div>

              <div className="space-y-6">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
                    <h4 className="text-sm font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">Geo-referencia</h4>
                    <MapPin size={15} className="text-slate-400" />
                  </div>
                  <div className="relative aspect-video overflow-hidden bg-slate-200 dark:bg-slate-800/70">
                    <div
                      ref={mapContainerRef}
                      className="h-full w-full"
                      role="img"
                      aria-label={`Mapa de referencia de ${staticGeoPoint.label}`}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/20 via-transparent to-slate-950/10" />
                  </div>
                  <div className="space-y-1 p-4 text-xs text-slate-500 dark:text-slate-400">
                    <p><strong>Distrito:</strong> {previewInstitution?.distrito || 'Pendiente de validación'}</p>
                    <p><strong>REI:</strong> {previewInstitution?.rei || 'Pendiente de validación'}</p>
                    <p><strong>Referencia:</strong> {staticGeoPoint.lat.toFixed(5)}, {staticGeoPoint.lon.toFixed(5)}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-xl">
                  <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Actividad Reciente</h4>
                  <div className="space-y-3 text-xs">
                    <div className="rounded-lg bg-white/5 p-3">
                      <p className="font-semibold">Actualización de institución</p>
                      <p className="mt-1 text-slate-400">{previewInstitution?.nombre_ie || 'Sin institución seleccionada'}</p>
                    </div>
                    <div className="rounded-lg bg-white/5 p-3">
                      <p className="font-semibold">Registros activos</p>
                      <p className="mt-1 text-slate-400">{summary.active} instituciones activas</p>
                    </div>
                    <div className="rounded-lg bg-white/5 p-3">
                      <p className="font-semibold">Sin supervisión 30 días</p>
                      <p className="mt-1 text-slate-400">{staleWithoutSupervision30d} instituciones</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {detailTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-md md:items-center md:p-6"
          onClick={() => setDetailTarget(null)}
        >
          <div
            className="max-h-[84vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700/80 bg-slate-900 p-4 pb-24 shadow-[0_30px_80px_rgba(2,6,23,0.85)] md:max-h-[90vh] md:max-w-3xl md:rounded-2xl md:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 -mx-1 mb-4 flex items-center justify-between gap-3 border-b border-slate-800/70 bg-slate-900/95 px-1 pb-4 pt-1 backdrop-blur">
              <p className="text-lg font-semibold text-slate-100">Detalle de IE</p>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="rounded-full border border-slate-700/60 px-3 py-1.5 text-xs text-slate-300"
              >
                Cerrar
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/55">
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
              ].map(([label, value], index, collection) => (
                <div
                  key={label}
                  className={`grid grid-cols-[120px_1fr] px-3 py-3 text-sm ${
                    index < collection.length - 1 ? 'border-b border-slate-800/70' : ''
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
                  <p className="truncate text-slate-100">{value || '-'}</p>
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
