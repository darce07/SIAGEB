import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  CheckCheck,
  CircleDot,
  Filter,
  Clock3,
  ClipboardCheck,
  Plus,
  Search,
  Siren,
} from 'lucide-react';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import MonitoreoCard from '../components/monitoreos/MonitoreoCard.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';
const TEMPLATE_SHEET_KEY = 'monitoreoTemplateSheetSelected';
const SETTINGS_EVENT_NAME = 'monitoreo-settings-updated';

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
      sortRank: 3,
    };
  }

  const status = getTemplateStatus(template);
  if (status === 'active') {
    return { status, statusType: 'active', statusText: statusLabel(status), sortRank: 0 };
  }
  if (status === 'closed') {
    return { status, statusType: 'closed', statusText: statusLabel(status), sortRank: 2 };
  }
  return { status, statusType: 'scheduled', statusText: statusLabel(status), sortRank: 1 };
};

const compareTemplatesForDisplay = (left, right) => {
  const leftMeta = resolveTemplateDisplayStatus(left);
  const rightMeta = resolveTemplateDisplayStatus(right);

  if (leftMeta.sortRank !== rightMeta.sortRank) {
    return leftMeta.sortRank - rightMeta.sortRank;
  }

  // Keep visual order stable when minor edits happen (e.g., cover image upload).
  // Prefer creation date over updated date to avoid jumping cards.
  const leftCreated = new Date(left.created_at || left.createdAt || left.updated_at || 0).getTime();
  const rightCreated = new Date(right.created_at || right.createdAt || right.updated_at || 0).getTime();
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;

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

const DAY_MS = 24 * 60 * 60 * 1000;

const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

const calculateCalendarParts = (fromDate, toDate) => {
  const start = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  );
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonthIndex = (end.getMonth() + 11) % 12;
    const previousMonthYear = previousMonthIndex === 11 ? end.getFullYear() - 1 : end.getFullYear();
    days += daysInMonth(previousMonthYear, previousMonthIndex);
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
  };
};

const formatRelativeSpan = (totalDays, fromDate, toDate) => {
  if (totalDays <= 31) {
    return `${totalDays} ${totalDays === 1 ? 'dia' : 'dias'}`;
  }

  const parts = calculateCalendarParts(fromDate, toDate);

  if (parts.years >= 1) {
    const yearText = `${parts.years} ${parts.years === 1 ? 'año' : 'años'}`;
    if (parts.months > 0) {
      return `${yearText} y ${parts.months} ${parts.months === 1 ? 'mes' : 'meses'}`;
    }
    return yearText;
  }

  const monthText = `${parts.months} ${parts.months === 1 ? 'mes' : 'meses'}`;
  if (parts.days > 0) {
    return `${monthText} y ${parts.days} ${parts.days === 1 ? 'dia' : 'dias'}`;
  }
  return monthText;
};

const getDeadlineBadge = (endAt) => {
  if (!endAt) {
    return { label: 'Sin vencimiento', tone: 'neutral' };
  }

  const target = new Date(endAt);
  if (Number.isNaN(target.getTime())) {
    return { label: 'Sin vencimiento', tone: 'neutral' };
  }

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetMidnight = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  ).getTime();
  const diffDays = Math.round((targetMidnight - todayMidnight) / DAY_MS);

  if (diffDays > 0) {
    const spanLabel = formatRelativeSpan(diffDays, now, target);
    return {
      label: `Vence en ${spanLabel}`,
      tone: diffDays <= 3 ? 'warning' : 'neutral',
    };
  }

  if (diffDays === 0) {
    return { label: 'Vence hoy', tone: 'warning' };
  }

  const elapsed = Math.abs(diffDays);
  const spanLabel = formatRelativeSpan(elapsed, target, now);
  return {
    label: `Vencio hace ${spanLabel}`,
    tone: 'danger',
  };
};

const toPercent = (value, total) => {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
};

export default function MonitoreoSelect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMode, setSortMode] = useState('updated');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const coverInputRefs = useRef({});
  const [effectiveTheme, setEffectiveTheme] = useState(
    () => document?.documentElement?.dataset?.theme || 'dark',
  );

  const isLightTheme = effectiveTheme === 'light' || effectiveTheme === 'pink';

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

  useEffect(() => {
    const syncTheme = () => {
      const nextTheme = document?.documentElement?.dataset?.theme || 'dark';
      setEffectiveTheme(nextTheme);
    };

    syncTheme();
    const root = document?.documentElement;
    const observer =
      root && typeof MutationObserver !== 'undefined'
        ? new MutationObserver((mutations) => {
            const changed = mutations.some(
              (mutation) =>
                mutation.type === 'attributes' &&
                (mutation.attributeName === 'data-theme' ||
                  mutation.attributeName === 'data-theme-preference' ||
                  mutation.attributeName === 'data-themePreference'),
            );
            if (changed) syncTheme();
          })
        : null;

    if (observer && root) {
      observer.observe(root, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-theme-preference', 'data-themePreference'],
      });
    }

    window.addEventListener(SETTINGS_EVENT_NAME, syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      observer?.disconnect();
      window.removeEventListener(SETTINGS_EVENT_NAME, syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  const visibleTemplates = useMemo(() => {
    const published = templates.filter((item) => item.status === 'published');
    const source = isAdmin ? templates : published;
    return source.slice().sort(compareTemplatesForDisplay);
  }, [isAdmin, templates]);

  const dashboardMetrics = useMemo(() => {
    const metrics = {
      total: visibleTemplates.length,
      active: 0,
      scheduled: 0,
      closed: 0,
      drafts: 0,
      alerts: 0,
    };

    for (const template of visibleTemplates) {
      const display = resolveTemplateDisplayStatus(template);
      if (display.statusType === 'draft') metrics.drafts += 1;
      if (display.status === 'active') metrics.active += 1;
      if (display.status === 'scheduled') metrics.scheduled += 1;
      if (display.status === 'closed') metrics.closed += 1;
      if ((template.sections || []).length === 0 || countQuestions(template.sections) === 0) {
        metrics.alerts += 1;
      }
    }

    return metrics;
  }, [visibleTemplates]);

  const metricPercentages = useMemo(() => {
    const total = dashboardMetrics.total || 0;
    return {
      active: toPercent(dashboardMetrics.active, total),
      scheduled: toPercent(dashboardMetrics.scheduled, total),
      closed: toPercent(dashboardMetrics.closed, total),
      alerts: toPercent(dashboardMetrics.alerts, total),
    };
  }, [dashboardMetrics]);

  const statusTabs = useMemo(() => {
    const tabs = [
      { id: 'all', label: 'Total', count: dashboardMetrics.total },
      { id: 'active', label: 'Activos', count: dashboardMetrics.active },
      { id: 'scheduled', label: 'Programados', count: dashboardMetrics.scheduled },
      { id: 'closed', label: 'Vencidos', count: dashboardMetrics.closed },
    ];
    if (isAdmin) tabs.push({ id: 'draft', label: 'Borradores', count: dashboardMetrics.drafts });
    return tabs;
  }, [dashboardMetrics, isAdmin]);

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return visibleTemplates
      .filter((template) => {
        const display = resolveTemplateDisplayStatus(template);
        if (statusFilter !== 'all' && display.statusType !== statusFilter && display.status !== statusFilter) {
          return false;
        }
        if (!normalizedSearch) return true;
        const haystack = `${template.title || ''} ${template.description || ''}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => {
        if (sortMode === 'title') {
          return String(left.title || '').localeCompare(String(right.title || ''), 'es', {
            sensitivity: 'base',
          });
        }
        if (sortMode === 'questions') {
          return countQuestions(right.sections) - countQuestions(left.sections);
        }
        return compareTemplatesForDisplay(left, right);
      });
  }, [searchTerm, sortMode, statusFilter, visibleTemplates]);

  const prepareInstanceForTemplate = async (template, selectedSheetId = '') => {
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
    // Reutiliza una instancia en progreso para retomar la ficha si ya existe.
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
    // No crear instancia automaticamente: se crea al presionar "Guardar cambios" en la ficha.
    localStorage.removeItem('monitoreoInstanceActive');
    return true;
  };

  const launchTemplate = async (template, sheetId = '') => {
    setIsOpeningTemplate(true);
    selectTemplate(template.id);
    selectTemplateSheet(sheetId);
    const created = await prepareInstanceForTemplate(template, sheetId);
    setIsOpeningTemplate(false);
    if (created) {
      setSheetSelection({
        open: false,
        template: null,
        sheets: [],
        selectedSheetId: '',
      });
      const returnTo = `${location.pathname}${location.search || ''}`;
      const params = new URLSearchParams({
        from: 'monitoreos',
        returnTo,
      });
      navigate(`/monitoreo/ficha-escritura?${params.toString()}`);
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

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.readAsDataURL(file);
    });

  const optimizeCoverImage = (file) =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 900;
        const ratio = Math.min(MAX_WIDTH / image.width, MAX_HEIGHT / image.height, 1);
        const targetWidth = Math.max(1, Math.round(image.width * ratio));
        const targetHeight = Math.max(1, Math.round(image.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error('No se pudo optimizar la portada.'));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('No se pudo convertir la portada optimizada.'));
            reader.readAsDataURL(blob);
          },
          'image/webp',
          0.82,
        );
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo cargar la imagen seleccionada.'));
      };
      image.src = objectUrl;
    });

  const validateCoverImage = (file) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return 'Formato no permitido. Usa JPG, PNG o WEBP.';
    }
    if (file.size > 2 * 1024 * 1024) {
      return 'La portada supera 2MB. Sube una imagen mas ligera.';
    }
    return '';
  };

  const handleUploadCover = async (template, file) => {
    if (!file) return;
    const validationError = validateCoverImage(file);
    if (validationError) {
      openNoticeModal('Imagen no valida', validationError, 'warning');
      return;
    }

    try {
      const coverImageUrl = await optimizeCoverImage(file).catch(() => readFileAsDataUrl(file));
      const nextLevelsConfig = {
        ...(template.levelsConfig || {}),
        coverImageUrl,
      };

      const { data, error } = await supabase
        .from('monitoring_templates')
        .update({ levels_config: nextLevelsConfig })
        .eq('id', template.id)
        .select('*')
        .single();

      if (error) throw error;

      setTemplates((prev) =>
        prev.map((item) =>
          item.id === template.id
            ? { ...data, levelsConfig: data.levels_config, availability: data.availability }
            : item,
        ),
      );
    } catch (error) {
      console.error(error);
      openNoticeModal(
        'No se pudo subir la portada',
        'Ocurrio un error al guardar la portada del monitoreo.',
        'danger',
      );
    }
  };

  const handleRemoveCover = async (template) => {
    try {
      const nextLevelsConfig = { ...(template.levelsConfig || {}) };
      delete nextLevelsConfig.coverImageUrl;

      const { data, error } = await supabase
        .from('monitoring_templates')
        .update({ levels_config: nextLevelsConfig })
        .eq('id', template.id)
        .select('*')
        .single();

      if (error) throw error;

      setTemplates((prev) =>
        prev.map((item) =>
          item.id === template.id
            ? { ...data, levelsConfig: data.levels_config, availability: data.availability }
            : item,
        ),
      );
    } catch (error) {
      console.error(error);
      openNoticeModal(
        'No se pudo quitar la portada',
        'Ocurrio un error al quitar la portada del monitoreo.',
        'danger',
      );
    }
  };

  return (
    <div
      className={`flex min-w-0 flex-col gap-4 rounded-3xl p-3.5 sm:p-5 ${
        isLightTheme
          ? 'border border-slate-200 bg-white text-slate-900 shadow-sm'
          : 'border border-slate-800/70 bg-slate-950/55 text-slate-100'
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1
            title="Monitoreos"
            className={`max-w-[70ch] truncate text-[2rem] font-semibold leading-tight ${
              isLightTheme ? 'text-slate-900' : 'text-slate-100'
            }`}
          >
            Explorar Monitoreos
          </h1>
          <p className={`text-sm ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>
            Gestiona y crea nuevas plantillas de observacion para tus instituciones.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFilterMenuOpen((prev) => !prev)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                isLightTheme
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-slate-700/70 bg-slate-900/60 text-slate-200 hover:bg-slate-800/70'
              }`}
            >
              <Filter size={14} />
              Filtrar
            </button>
            {isFilterMenuOpen ? (
              <div
                className={`absolute right-0 top-12 z-20 min-w-[220px] rounded-xl border p-2 shadow-lg ${
                  isLightTheme
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-700/70 bg-slate-900'
                }`}
              >
                {statusTabs.map((tab) => {
                  const isActive = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(tab.id);
                        setIsFilterMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? isLightTheme
                            ? 'bg-cyan-50 text-cyan-800'
                            : 'bg-cyan-500/15 text-cyan-200'
                          : isLightTheme
                            ? 'text-slate-700 hover:bg-slate-50'
                            : 'text-slate-200 hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {tab.id === 'all' ? <CircleDot size={14} /> : null}
                        {tab.id === 'active' ? <ClipboardCheck size={14} /> : null}
                        {tab.id === 'scheduled' ? <Clock3 size={14} /> : null}
                        {tab.id === 'closed' ? <CheckCheck size={14} /> : null}
                        {tab.id === 'draft' ? <CalendarClock size={14} /> : null}
                        {tab.label}
                      </span>
                      <span className="text-xs font-semibold">{tab.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <Link
            to="/monitoreo/gestion"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-700 bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-800"
          >
            <Plus size={14} />
            Nuevo Monitoreo
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card
          className={`p-3 shadow-sm ${
            isLightTheme
              ? 'border border-slate-200 bg-white'
              : 'border border-slate-700/70 bg-slate-900/55'
          }`}
        >
          <div className="mb-2 flex items-start justify-between">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                isLightTheme
                  ? 'bg-cyan-50 text-cyan-700'
                  : 'bg-cyan-500/15 text-cyan-300'
              }`}
            >
              <ClipboardCheck size={16} />
            </span>
            <span className={`text-xs font-semibold ${isLightTheme ? 'text-emerald-600' : 'text-emerald-300'}`}>
              +{metricPercentages.active}
            </span>
          </div>
          <p className={`text-[11px] uppercase tracking-[0.14em] ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>
            Activos
          </p>
          <p className={`mt-1 text-[1.65rem] font-semibold leading-none ${isLightTheme ? 'text-slate-900' : 'text-slate-100'}`}>
            {dashboardMetrics.active}
          </p>
        </Card>
        <Card
          className={`p-3 shadow-sm ${
            isLightTheme
              ? 'border border-slate-200 bg-white'
              : 'border border-slate-700/70 bg-slate-900/55'
          }`}
        >
          <div className="mb-2 flex items-start justify-between">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                isLightTheme
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              <Clock3 size={16} />
            </span>
            <span className={`text-xs font-semibold ${isLightTheme ? 'text-slate-500' : 'text-slate-300'}`}>
              {metricPercentages.scheduled}
            </span>
          </div>
          <p className={`text-[11px] uppercase tracking-[0.14em] ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>
            Programados
          </p>
          <p className={`mt-1 text-[1.65rem] font-semibold leading-none ${isLightTheme ? 'text-slate-900' : 'text-slate-100'}`}>
            {dashboardMetrics.scheduled}
          </p>
        </Card>
        <Card
          className={`p-3 shadow-sm ${
            isLightTheme
              ? 'border border-slate-200 bg-white'
              : 'border border-slate-700/70 bg-slate-900/55'
          }`}
        >
          <div className="mb-2 flex items-start justify-between">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                isLightTheme
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              <CheckCheck size={16} />
            </span>
            <span className={`text-xs font-semibold ${isLightTheme ? 'text-emerald-600' : 'text-emerald-300'}`}>
              +{metricPercentages.closed}
            </span>
          </div>
          <p className={`text-[11px] uppercase tracking-[0.14em] ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>
            Vencidos
          </p>
          <p className={`mt-1 text-[1.65rem] font-semibold leading-none ${isLightTheme ? 'text-slate-900' : 'text-slate-100'}`}>
            {dashboardMetrics.closed}
          </p>
        </Card>
        <Card
          className={`p-3 shadow-sm ${
            isLightTheme
              ? 'border border-slate-200 bg-white'
              : 'border border-slate-700/70 bg-slate-900/55'
          }`}
        >
          <div className="mb-2 flex items-start justify-between">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                isLightTheme
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              <Siren size={16} />
            </span>
            <span className={`text-xs font-semibold ${isLightTheme ? 'text-rose-600' : 'text-rose-300'}`}>
              -{metricPercentages.alerts}
            </span>
          </div>
          <p className={`text-[11px] uppercase tracking-[0.14em] ${isLightTheme ? 'text-slate-500' : 'text-slate-400'}`}>
            Alertas
          </p>
          <p className={`mt-1 text-[1.65rem] font-semibold leading-none ${isLightTheme ? 'text-slate-900' : 'text-slate-100'}`}>
            {dashboardMetrics.alerts}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.2fr_auto]">
        <label className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar monitoreos..."
            className={`h-9 w-full rounded-xl border pl-9 pr-3 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-700 ${
              isLightTheme
                ? 'border-slate-300 bg-white text-slate-900'
                : 'border-slate-700/70 bg-slate-900/60 text-slate-100'
            }`}
          />
        </label>
        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value)}
          className={`h-9 rounded-xl border px-3 text-sm outline-none focus:border-cyan-700 ${
            isLightTheme
              ? 'border-slate-300 bg-white text-slate-700'
              : 'border-slate-700/70 bg-slate-900/60 text-slate-200'
          }`}
        >
          <option value="updated">Mas recientes</option>
          <option value="title">Titulo A-Z</option>
          <option value="questions">Mas preguntas</option>
        </select>
      </div>

      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5"
          role="status"
          aria-label="Cargando monitoreos"
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`monitoreo-card-skeleton-${index}`}
              className={`overflow-hidden rounded-xl border shadow-sm ${
                isLightTheme
                  ? 'border-slate-200 bg-white'
                  : 'border-slate-700/70 bg-slate-900/55'
              }`}
            >
              <Skeleton className="h-24 rounded-none" tone={index % 2 === 0 ? 'block' : 'soft'} />
              <div className="space-y-2.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/5" tone="soft" />
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Skeleton className="h-7 w-7 rounded-lg" />
                    <Skeleton className="h-7 w-7 rounded-lg" tone="soft" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-full" tone="soft" />
                  <Skeleton className="h-3 w-2/3" tone="soft" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-28 rounded-full" tone="soft" />
                </div>
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card
          className={`flex flex-col gap-3 p-4 shadow-sm ${
            isLightTheme
              ? 'border border-slate-200 bg-white'
              : 'border border-slate-700/70 bg-slate-900/55'
          }`}
        >
          <p className={`text-sm ${isLightTheme ? 'text-slate-600' : 'text-slate-300'}`}>
            No se encontraron monitoreos con los filtros aplicados.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
          {filteredTemplates.map((template, index) => {
            const { status, statusType, statusText } = resolveTemplateDisplayStatus(template);
            const isActive = status === 'active';
            const templateTitle = String(template.title || 'Monitoreo').trim();
            const templateDescription = String(template.description || '').trim();
            const deadline = getDeadlineBadge(template?.availability?.endAt);

            const primaryActionLabel = isActive
              ? 'Registrar ficha'
              : status === 'closed'
                ? 'Vencido'
                : 'Programado';
            const primaryActionVariant = isActive
              ? 'primary'
              : status === 'closed'
                ? 'blocked'
                : 'muted';
            const primaryActionDisabled = !isActive;
            const onPrimaryAction = isActive ? () => handleUseTemplate(template) : undefined;

            const onEdit = isAdmin ? () => navigate(`/monitoreo/plantillas/${template.id}`) : undefined;
            const onDuplicate = isAdmin ? () => handleDuplicate(template) : undefined;
            const onDelete = isAdmin ? () => setDeleteTarget(template) : undefined;
            const coverImageUrl = String(template?.levelsConfig?.coverImageUrl || '').trim();

            return (
              <div key={template.id}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  ref={(node) => {
                    coverInputRefs.current[template.id] = node;
                  }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleUploadCover(template, file);
                    event.target.value = '';
                  }}
                />
                <MonitoreoCard
                  isLightTheme={isLightTheme}
                  templateId={template.id}
                  title={templateTitle}
                  description={templateDescription}
                  status={statusType}
                  statusLabel={statusText}
                  questions={countQuestions(template.sections)}
                  deadlineLabel={deadline.label}
                  deadlineTone={deadline.tone}
                  primaryActionLabel={primaryActionLabel}
                  primaryActionVariant={primaryActionVariant}
                  primaryActionDisabled={primaryActionDisabled}
                  onPrimaryAction={onPrimaryAction}
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  coverImageUrl={coverImageUrl}
                  imageLoading={index < 6 ? 'eager' : 'lazy'}
                  imageFetchPriority={index < 3 ? 'high' : 'auto'}
                  onUploadCover={
                    isAdmin ? () => coverInputRefs.current[template.id]?.click() : undefined
                  }
                  onRemoveCover={
                    isAdmin && coverImageUrl ? () => handleRemoveCover(template) : undefined
                  }
                />
              </div>
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
            className="m-4 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Seleccion de ficha</p>
              <h2 className="text-lg font-semibold text-slate-900">
                {sheetSelection.template?.title || 'Monitoreo'}
              </h2>
              <p className="text-sm text-slate-600">
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
                        ? 'border-cyan-700 bg-cyan-50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">{sheet.title}</p>
                    {sheet.code ? <p className="text-xs text-slate-500">Codigo: {sheet.code}</p> : null}
                    <p className={`text-xs ${isEmpty ? 'text-amber-700' : 'text-slate-600'}`}>
                      {sheet.questionCount} preguntas configuradas
                    </p>
                    {sheet.subtitle ? <p className="mt-1 text-xs text-slate-500">{sheet.subtitle}</p> : null}
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
                <p className="mt-3 text-sm text-amber-700">
                  La ficha seleccionada no tiene preguntas. Debes configurarla en Gestion de monitoreos (Etapa 6 y 7).
                </p>
              );
            })()}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeSheetSelection}
                className="inline-flex h-10 min-w-[110px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={isOpeningTemplate}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSheetSelection}
                className="inline-flex h-10 min-w-[180px] items-center justify-center rounded-lg border border-cyan-700 bg-cyan-700 px-3 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
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
