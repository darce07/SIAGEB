import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  Download,
  Eye,
  Filter,
  FileText,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import { supabase } from '../lib/supabase.js';

const AUTH_KEY = 'monitoreoAuth';

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

const truncateLabel = (value, maxChars = 70) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
};

const formatFileName = (template, instance) => {
  const title = template?.title || 'Monitoreo';
  const docente = instance?.data?.header?.docente || 'Docente';
  const date = new Date(instance?.updated_at || instance?.created_at || Date.now())
    .toISOString()
    .slice(0, 10);
  const safe = (value) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_');
  return `Monitoreo_${safe(title)}_${safe(docente)}_${date}`;
};

const getReportStatusLabel = (template) => {
  const availabilityStatus = String(template?.availability?.status || '').toLowerCase();
  if (availabilityStatus === 'hidden') return 'Oculto';
  if (availabilityStatus === 'closed') return 'Cerrado';

  const timelineStatus = getTemplateStatus(template);
  if (timelineStatus === 'closed') return 'Vencido';
  if (timelineStatus === 'scheduled') return 'Programado';
  return 'Activo';
};

const formatDateCompact = (value) => {
  if (!value) return 'No registrado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No registrado';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
};

const formatDateTimeCompact = (value) => {
  if (!value) return 'No registrado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No registrado';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

const formatTemplateRangeCompact = (template) => {
  const startAt = template?.availability?.startAt || '';
  const endAt = template?.availability?.endAt || '';
  const startLabel = formatDateCompact(startAt);
  const endLabel = formatDateCompact(endAt);
  if (startLabel === 'No registrado' && endLabel === 'No registrado') return 'Sin rango definido';
  if (startLabel === endLabel) return startLabel;
  return `${startLabel} - ${endLabel}`;
};

const getReportRowState = (template, instance) => {
  if (!template) return 'active';
  if (template.status !== 'published') return 'draft';
  const templateStatus = getTemplateStatus(template);
  if (templateStatus === 'closed') return 'expired';
  if (templateStatus === 'scheduled') return 'scheduled';
  return 'active';
};

const getTemplateOnlyState = (template) => {
  if (!template) return 'active';
  if (template.status !== 'published') return 'draft';
  const templateStatus = getTemplateStatus(template);
  if (templateStatus === 'closed') return 'expired';
  if (templateStatus === 'scheduled') return 'scheduled';
  return 'active';
};

const REPORT_STATE_META = {
  active: {
    label: 'Activo',
    className: 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-300/70 dark:bg-emerald-300 dark:text-emerald-950',
  },
  in_progress: {
    label: 'Activo',
    className: 'border-cyan-300 bg-cyan-100 text-cyan-900 dark:border-cyan-300/70 dark:bg-cyan-300 dark:text-cyan-950',
  },
  completed: {
    label: 'Activo',
    className: 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-300/70 dark:bg-emerald-300 dark:text-emerald-950',
  },
  scheduled: {
    label: 'Programado',
    className: 'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-200/80 dark:bg-amber-300 dark:text-amber-950',
  },
  expired: {
    label: 'Vencido',
    className: 'border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-300/80 dark:bg-rose-300 dark:text-rose-950',
  },
  draft: {
    label: 'Borrador',
    className: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-300/60 dark:bg-slate-300 dark:text-slate-950',
  },
};

const pluralize = (count, singular, plural) => (count === 1 ? singular : plural);

const getInitials = (value = '') => {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'SR';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
};

const getProfileDisplayName = (profile) => {
  if (!profile) return '';
  const fullName = String(profile.full_name || '').trim();
  if (fullName) return fullName;
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
};

const getTemplateScope = (template) =>
  template?.levelsConfig?.scope || template?.levels_config?.scope || {};

const isCddTemplate = (template) =>
  String(getTemplateScope(template)?.cdd || '').trim().toLowerCase() === 'si';

const getCddArea = (template) => String(getTemplateScope(template)?.cddArea || '').trim();

const hasContent = (value) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((item) => hasContent(item));
  if (typeof value === 'object') return Object.values(value).some((item) => hasContent(item));
  if (typeof value === 'string') return value.trim() !== '';
  return true;
};

const formatAnswerValue = (value) => {
  if (!hasContent(value)) return '';
  if (Array.isArray(value)) {
    return value.map((item) => formatAnswerValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if (typeof value.label === 'string' && value.label.trim()) return value.label.trim();
    if (typeof value.value === 'string' && value.value.trim()) return value.value.trim();
    return Object.values(value).map((item) => formatAnswerValue(item)).filter(Boolean).join(', ');
  }
  return String(value).trim();
};

const normalizeAnswerToken = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isBinaryAnswer = (value) => {
  const token = normalizeAnswerToken(value);
  return token === 'SI' || token === 'NO';
};

const isEmailLike = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const looksLikeInstitutionValue = (value) => {
  const text = String(value || '').trim();
  if (!text || isBinaryAnswer(text) || isEmailLike(text)) return false;
  const hasLetterOrNumber = /[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]/.test(text);
  return hasLetterOrNumber && text.length >= 4;
};

const normalizeFieldKey = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isInstitutionFieldKey = (key) => {
  const normalized = normalizeFieldKey(key);
  return (
    normalized.includes('institucion') ||
    normalized.includes('institution') ||
    normalized.includes('nombre_ie') ||
    normalized.includes('nombreie') ||
    normalized === 'ie'
  );
};

const firstValidInstitutionValue = (...values) =>
  values.find((value) => looksLikeInstitutionValue(value)) || '';

const findInstitutionValueInObject = (source) => {
  if (!source || typeof source !== 'object') return '';
  for (const [key, value] of Object.entries(source)) {
    if (isInstitutionFieldKey(key) && looksLikeInstitutionValue(value)) {
      return String(value).trim();
    }
    if (value && typeof value === 'object') {
      const nested = findInstitutionValueInObject(value);
      if (nested) return nested;
    }
  }
  return '';
};

const parseNumericValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object') {
    const direct = value.value ?? value.answer ?? value.valor ?? value.score ?? value.level ?? value.meta ?? value.avance;
    return parseNumericValue(direct);
  }
  const normalized = String(value)
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const isMetaMetricKey = (value) => {
  const normalized = normalizeFieldKey(value);
  return normalized.includes('meta') || normalized.includes('objetivo');
};

const isProgressMetricKey = (value) => {
  const normalized = normalizeFieldKey(value);
  return (
    normalized.includes('avance') ||
    normalized.includes('logrado') ||
    normalized.includes('real') ||
    normalized.includes('cumplimiento')
  );
};

const findMetricValueInObject = (source, matcher) => {
  if (!source || typeof source !== 'object') return null;
  for (const [key, value] of Object.entries(source)) {
    if (matcher(key)) {
      const parsed = parseNumericValue(value);
      if (parsed !== null) return parsed;
    }
    if (value && typeof value === 'object') {
      const nested = findMetricValueInObject(value, matcher);
      if (nested !== null) return nested;
    }
  }
  return null;
};

const extractCddMetrics = (row) => {
  const template = row?.template || {};
  const data = row?.instance?.data || {};
  const questionState = data.questions && typeof data.questions === 'object' ? data.questions : {};
  const questionLabelById = new Map();
  (template?.sections || []).forEach((section) => {
    (section?.questions || []).forEach((question) => {
      if (!question?.id) return;
      questionLabelById.set(question.id, String(question.text || '').trim());
    });
  });

  let meta = findMetricValueInObject(data, isMetaMetricKey);
  let advance = findMetricValueInObject(data, isProgressMetricKey);

  Object.entries(questionState).forEach(([questionId, answer]) => {
    const label = questionLabelById.get(questionId) || questionId;
    if (meta === null && isMetaMetricKey(label)) meta = parseNumericValue(answer);
    if (advance === null && isProgressMetricKey(label)) advance = parseNumericValue(answer);
  });

  const normalizedMeta = meta !== null && meta > 0 ? meta : 100;
  const normalizedAdvance = advance !== null && advance >= 0 ? advance : 0;
  const progress = Math.max(0, Math.min(100, (normalizedAdvance / normalizedMeta) * 100));
  return {
    meta: normalizedMeta,
    advance: normalizedAdvance,
    progress,
  };
};

const getCddKpiStatus = (progress) => {
  if (progress >= 100) {
    return {
      label: 'Completado',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      barClassName: 'bg-emerald-500',
      barColor: '#10b981',
    };
  }
  if (progress > 0) {
    return {
      label: 'En proceso',
      className: 'bg-amber-50 text-amber-700 border-amber-100',
      barClassName: 'bg-cyan-500',
      barColor: '#06b6d4',
    };
  }
  return {
    label: 'Pendiente',
    className: 'bg-rose-50 text-rose-700 border-rose-100',
    barClassName: 'bg-rose-400',
    barColor: '#fb7185',
  };
};

const isInstitutionQuestion = (questionLabel) => {
  const normalized = String(questionLabel || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    normalized.includes('institucion educativa') ||
    normalized.includes('nombre de la ie') ||
    normalized.includes('nombre ie') ||
    normalized.includes('codigo modular') ||
    normalized.includes('codigo local') ||
    /\bie\b/.test(normalized)
  );
};

const getQuestionInsights = (instance, template) => {
  const questionState = instance?.data?.questions;
  if (!questionState || typeof questionState !== 'object') {
    return {
      institutionAnswer: '',
      primaryAnswer: '',
      primaryQuestion: '',
      primaryIsBinary: false,
    };
  }

  const questionLabelById = new Map();
  (template?.sections || []).forEach((section) => {
    (section?.questions || []).forEach((question) => {
      if (!question?.id) return;
      questionLabelById.set(question.id, String(question.text || '').trim());
    });
  });

  let institutionAnswer = '';
  let primaryAnswer = '';
  let primaryQuestion = '';
  let primaryIsBinary = false;

  const entries = Object.entries(questionState);
  for (const [questionId, value] of entries) {
    const answer = formatAnswerValue(value?.answer);
    if (!answer) continue;

    const questionLabel = questionLabelById.get(questionId) || '';
    if (!institutionAnswer && isInstitutionQuestion(questionLabel) && looksLikeInstitutionValue(answer)) {
      institutionAnswer = answer;
    }

    if (!primaryAnswer) {
      const level = value?.level;
      const answerUpper = String(answer).toUpperCase();
      primaryAnswer =
        answerUpper === 'SI' && hasContent(level)
          ? `${answer} (Nivel ${String(level).trim()})`
          : answer;
      primaryQuestion = questionLabel;
      primaryIsBinary = isBinaryAnswer(answer);
    }

    if (institutionAnswer && primaryAnswer) break;
  }

  if (!primaryAnswer) {
    for (const [questionId, value] of entries) {
      const observation = formatAnswerValue(value?.obs);
      if (!observation) continue;
      const questionLabel = questionLabelById.get(questionId) || '';
      if (!institutionAnswer && isInstitutionQuestion(questionLabel) && looksLikeInstitutionValue(observation)) {
        institutionAnswer = observation;
      }
      primaryAnswer = observation;
      primaryQuestion = questionLabel;
      primaryIsBinary = false;
      break;
    }
  }

  return {
    institutionAnswer,
    primaryAnswer,
    primaryQuestion,
    primaryIsBinary,
  };
};

const getInstanceReferenceData = (instance, insights = {}) => {
  const data = instance?.data || {};
  const header = instance?.data?.header || {};
  const institutionFromHeader = firstValidInstitutionValue(
    header.institucion,
    header.institution,
    header.institution_name,
    header.institucion_educativa,
    header.nombre_ie,
    header.ie,
  );
  const institution =
    institutionFromHeader ||
    findInstitutionValueInObject(data.headerExtras) ||
    findInstitutionValueInObject(data.dynamicFields) ||
    findInstitutionValueInObject(data.meta) ||
    insights.institutionAnswer ||
    '';
  const docente = header.docente || header.monitored_name || '';
  const monitor = header.director || header.monitor || header.monitor_name || '';
  const fallbackUser = typeof instance?.created_by === 'string' ? instance.created_by.trim() : '';

  if (docente) return { referenceType: 'Docente', referenceLabel: docente, institution };
  if (monitor) return { referenceType: 'Monitor', referenceLabel: monitor, institution };
  if (institution) return { referenceType: 'Institucion', referenceLabel: institution, institution };
  if (fallbackUser) return { referenceType: 'Usuario', referenceLabel: fallbackUser, institution };
  return { referenceType: 'Registro', referenceLabel: 'Reporte registrado', institution };
};

const getSheetMetadata = (template, instance) => {
  const selectedSheetIdRaw = instance?.data?.meta?.selectedSheetId;
  const selectedSheetId = typeof selectedSheetIdRaw === 'string' ? selectedSheetIdRaw : '';
  const sheetsRaw = template?.levelsConfig?.builder?.sheets;
  const sheets = Array.isArray(sheetsRaw) ? sheetsRaw.filter((sheet) => sheet?.id) : [];

  let resolvedSheet = sheets.find((sheet) => sheet.id === selectedSheetId) || null;
  if (!resolvedSheet && sheets.length === 1) {
    resolvedSheet = sheets[0];
  }

  if (resolvedSheet) {
    const title = String(resolvedSheet.title || '').trim() || `Ficha ${resolvedSheet.code || ''}`.trim();
    return {
      sheetId: resolvedSheet.id,
      sheetTitle: title || 'Ficha',
      sheetCode: String(resolvedSheet.code || '').trim(),
    };
  }

  if (selectedSheetId) {
    return {
      sheetId: selectedSheetId,
      sheetTitle: 'Ficha seleccionada',
      sheetCode: '',
    };
  }

  if (sheets.length > 1) {
    return {
      sheetId: '',
      sheetTitle: 'Sin ficha asignada',
      sheetCode: '',
    };
  }

  return {
    sheetId: '',
    sheetTitle: 'Ficha general',
    sheetCode: '',
  };
};

const buildPdf = (template, instance, statusLabel) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const data = instance?.data || {};
  const header = data.header || {};
  const general = data.general || {};
  const cierre = data.cierre || {};
  const firmas = data.firmas || {};
  const questions = data.questions || {};
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const levels = Array.isArray(template?.levelsConfig?.levels) ? template.levelsConfig.levels : [];

  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  const missingText = 'No registrado';

  const palette = {
    text: [15, 23, 42],
    muted: [100, 116, 139],
    missing: [148, 163, 184],
    border: [203, 213, 225],
    labelBg: [248, 250, 252],
    tableHead: [15, 23, 42],
    sectionHead: [30, 41, 59],
  };

  const statusTheme = {
    Activo: { fill: [220, 252, 231], stroke: [16, 185, 129], text: [6, 95, 70] },
    Programado: { fill: [254, 243, 199], stroke: [217, 119, 6], text: [146, 64, 14] },
    Vencido: { fill: [254, 243, 199], stroke: [217, 119, 6], text: [146, 64, 14] },
    Oculto: { fill: [226, 232, 240], stroke: [100, 116, 139], text: [51, 65, 85] },
    Cerrado: { fill: [254, 226, 226], stroke: [239, 68, 68], text: [153, 27, 27] },
  };

  const currentStatus = statusTheme[statusLabel] ? statusLabel : 'Activo';

  const formatDateTime = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  };

  const normalizeText = (value, fallback = missingText) => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  };

  const normalizeLevel = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const number = text.match(/[123]/);
    return number ? number[0] : '';
  };

  const sanitizeObservation = (value) => {
    const text = normalizeText(value, 'Sin observación');
    if (/no aplica\s*\/\s*no observado/i.test(text)) return 'Sin observación';
    return text;
  };

  const valueCell = (value, fallback = missingText) => {
    const content = normalizeText(value, fallback);
    const isMissing = content === fallback;
    return {
      content,
      styles: {
        textColor: isMissing ? palette.missing : palette.text,
        fontStyle: isMissing ? 'italic' : 'normal',
      },
    };
  };

  const labelCell = (text) => ({
    content: text,
    styles: {
      fillColor: palette.labelBg,
      textColor: palette.text,
      fontStyle: 'bold',
    },
  });

  const tableMargin = { left: marginX, right: marginX, bottom: 14 };

  const reportId = data?.meta?.sessionId || instance?.id;
  const responsible = header?.docente || instance?.created_by || header?.director || header?.monitor;
  const createdAt = formatDateTime(instance?.created_at);
  const updatedAt = formatDateTime(instance?.updated_at);
  const emission = formatDateTime(instance?.updated_at || instance?.created_at);
  const createdUpdated =
    createdAt || updatedAt
      ? `Creado: ${createdAt || missingText} | Actualizado: ${updatedAt || missingText}`
      : missingText;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...palette.text);
  doc.text(`Monitoreo: ${normalizeText(template?.title, 'Monitoreo sin nombre')}`, marginX, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('Ficha de monitoreo', marginX, 24.5);

  const badgeStyles = statusTheme[currentStatus];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const badgePadding = 3.4;
  const badgeHeight = 8;
  const badgeWidth = doc.getTextWidth(currentStatus) + badgePadding * 2;
  const badgeX = pageWidth - marginX - badgeWidth;
  const badgeY = 12.5;
  doc.setFillColor(...badgeStyles.fill);
  doc.setDrawColor(...badgeStyles.stroke);
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 2, 2, 'FD');
  doc.setTextColor(...badgeStyles.text);
  doc.text(currentStatus, badgeX + badgeWidth / 2, badgeY + 5.4, { align: 'center' });
  doc.setTextColor(...palette.text);
  doc.setDrawColor(...palette.border);
  doc.line(marginX, 30.5, pageWidth - marginX, 30.5);

  const summaryLabelWidth = 30;
  const summaryValueWidth = (maxWidth - summaryLabelWidth * 2) / 2;

  autoTable(doc, {
    startY: 35,
    margin: tableMargin,
    theme: 'grid',
    body: [
      [labelCell('Código/ID'), valueCell(reportId), labelCell('Responsable'), valueCell(responsible)],
      [labelCell('Fecha de emisión'), valueCell(emission), labelCell('Creado / Actualizado'), valueCell(createdUpdated)],
    ],
    styles: {
      fontSize: 9.5,
      cellPadding: 2.8,
      overflow: 'linebreak',
      lineColor: palette.border,
      textColor: palette.text,
    },
    columnStyles: {
      0: { cellWidth: summaryLabelWidth },
      1: { cellWidth: summaryValueWidth },
      2: { cellWidth: summaryLabelWidth },
      3: { cellWidth: summaryValueWidth },
    },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: tableMargin,
    theme: 'grid',
    head: [['Campo', 'Valor']],
    body: [
      ['Institución Educativa', valueCell(header.institucion)],
      ['Lugar', valueCell(header.lugarIe)],
      ['Director/Monitor', valueCell(header.director || header.monitor)],
      ['Docente', valueCell(header.docente)],
      ['Condición', valueCell(header.condicion)],
      ['Area', valueCell(header.area)],
    ],
    styles: {
      fontSize: 10,
      cellPadding: 3,
      overflow: 'linebreak',
      lineColor: palette.border,
    },
    headStyles: {
      fillColor: palette.tableHead,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 50, fillColor: palette.labelBg, textColor: palette.text, fontStyle: 'bold' },
      1: { cellWidth: maxWidth - 50 },
    },
  });

  const scaleDefaults = {
    1: 'Cumple plenamente con el criterio observado.',
    2: 'Cumple parcialmente con el criterio observado.',
    3: 'Requiere mejora en el criterio observado.',
  };

  const scaleMap = new Map();
  levels.forEach((level, index) => {
    const label = String(level?.label || '').trim();
    const description = normalizeText(level?.description || level?.label, '');
    const numericMatch = label.match(/[123]/);
    if (numericMatch && description) {
      scaleMap.set(Number(numericMatch[0]), description);
      return;
    }
    if (description && !scaleMap.has(index + 1)) {
      scaleMap.set(index + 1, description);
    }
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: tableMargin,
    theme: 'grid',
    head: [['Nivel', 'Descripción']],
    body: [1, 2, 3].map((level) => [String(level), valueCell(scaleMap.get(level) || scaleDefaults[level])]),
    styles: {
      fontSize: 10,
      cellPadding: 3,
      overflow: 'linebreak',
      lineColor: palette.border,
    },
    headStyles: {
      fillColor: palette.tableHead,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center', fillColor: palette.labelBg, textColor: palette.text, fontStyle: 'bold' },
      1: { cellWidth: maxWidth - 24 },
    },
  });

  let sectionStartY = doc.lastAutoTable.finalY + 8;
  const questionWidth = maxWidth * 0.55;
  const answerWidth = maxWidth * 0.15;
  const levelWidth = maxWidth * 0.1;
  const observationWidth = maxWidth - questionWidth - answerWidth - levelWidth;

  sections.forEach((section, index) => {
    if (sectionStartY > pageHeight - 44) {
      doc.addPage();
      sectionStartY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...palette.text);
    doc.text(`Sección ${index + 1}: ${normalizeText(section?.title, 'Sin título')}`, marginX, sectionStartY);

    const rows = (section?.questions || []).map((question) => {
      const answer = questions[question.id] || {};
      const rawAnswer = String(answer?.answer || '').trim().toUpperCase();

      let responseLabel = 'No aplica';
      if (rawAnswer === 'SI' || rawAnswer === 'SÍ') responseLabel = 'Sí';
      else if (rawAnswer === 'NO') responseLabel = 'No';

      const levelValue = responseLabel === 'Sí' ? normalizeLevel(answer?.level) || missingText : 'No aplica';
      const observationValue = sanitizeObservation(answer?.obs);

      return [
        valueCell(question?.text),
        { content: responseLabel, styles: { halign: 'center' } },
        {
          content: levelValue,
          styles: {
            halign: 'center',
            textColor: levelValue === missingText ? palette.missing : palette.text,
            fontStyle: levelValue === missingText ? 'italic' : 'normal',
          },
        },
        {
          content: observationValue,
          styles: {
            textColor: observationValue === 'Sin observación' ? palette.muted : palette.text,
            fontStyle: observationValue === 'Sin observación' ? 'italic' : 'normal',
          },
        },
      ];
    });

    const safeRows = rows.length
      ? rows
      : [[valueCell(missingText), { content: 'No aplica', styles: { halign: 'center' } }, { content: 'No aplica', styles: { halign: 'center' } }, { content: 'Sin observación', styles: { textColor: palette.muted, fontStyle: 'italic' } }]];

    autoTable(doc, {
      startY: sectionStartY + 3,
      margin: tableMargin,
      theme: 'grid',
      head: [['Pregunta', 'Respuesta', 'Nivel', 'Observación']],
      body: safeRows,
      styles: {
        fontSize: 9.3,
        cellPadding: 2.6,
        overflow: 'linebreak',
        valign: 'middle',
        lineColor: palette.border,
      },
      headStyles: {
        fillColor: palette.sectionHead,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: questionWidth },
        1: { cellWidth: answerWidth, halign: 'center' },
        2: { cellWidth: levelWidth, halign: 'center' },
        3: { cellWidth: observationWidth },
      },
    });

    sectionStartY = doc.lastAutoTable.finalY + 8;
  });

  const closingBlocks = [
    ['Observación general', general?.observacion || cierre?.observacion],
    ['Conclusiones', general?.resumen || cierre?.conclusiones || cierre?.resumen],
    ['Compromisos', general?.compromiso || cierre?.compromisos || cierre?.compromiso],
  ];

  let closingStartY = sectionStartY;
  if (closingStartY > pageHeight - 52) {
    doc.addPage();
    closingStartY = 18;
  }

  closingBlocks.forEach(([title, value], index) => {
    autoTable(doc, {
      startY: index === 0 ? closingStartY : doc.lastAutoTable.finalY + 4,
      margin: tableMargin,
      theme: 'grid',
      head: [[title]],
      body: [[valueCell(value)]],
      styles: {
        fontSize: 10,
        cellPadding: 3.2,
        overflow: 'linebreak',
        lineColor: palette.border,
        minCellHeight: 14,
      },
      headStyles: {
        fillColor: palette.labelBg,
        textColor: palette.text,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: maxWidth },
      },
    });
  });

  const signatureCell = (name, dni) => {
    const nameText = normalizeText(name);
    const dniText = normalizeText(dni);
    const isMissing = nameText === missingText && dniText === missingText;
    return {
      content: `${nameText}\nDNI: ${dniText}\nFirma: ____________________`,
      styles: {
        textColor: isMissing ? palette.missing : palette.text,
        fontStyle: isMissing ? 'italic' : 'normal',
      },
    };
  };

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    margin: tableMargin,
    theme: 'grid',
    head: [['Docente', 'Monitor']],
    body: [[
      signatureCell(firmas?.docente?.nombre, firmas?.docente?.dni),
      signatureCell(firmas?.monitor?.nombre, firmas?.monitor?.dni),
    ]],
    styles: {
      fontSize: 10,
      cellPadding: 3,
      overflow: 'linebreak',
      lineColor: palette.border,
      minCellHeight: 25,
    },
    headStyles: {
      fillColor: palette.tableHead,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: maxWidth / 2 },
      1: { cellWidth: maxWidth / 2 },
    },
  });

  const generatedAtLabel = formatDateTime(new Date()) || new Date().toLocaleString('es-PE');
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...palette.muted);
    doc.text(`Página ${i} de ${totalPages}`, marginX, pageHeight - 8);
    doc.text('Generado por el sistema', pageWidth / 2, pageHeight - 8, { align: 'center' });
    doc.text(generatedAtLabel, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    doc.setTextColor(...palette.text);
  }

  return doc;
};

export default function MonitoreoReportes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { templateId: detailTemplateId = '' } = useParams();
  const auth = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY));
    } catch {
      return null;
    }
  }, []);

  const isAdmin = auth?.role === 'admin';
  const userId = auth?.email || auth?.docNumber || '';

  const [instances, setInstances] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailSearchTerm, setDetailSearchTerm] = useState('');
  const [detailStatusFilter, setDetailStatusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
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

  const fetchData = useCallback(async ({ withLoading = false } = {}) => {
    if (withLoading) setIsLoading(true);

    const { data: templatesData, error: templatesError } = await supabase
      .from('monitoring_templates')
      .select('*');

    if (!templatesError) {
      setTemplates(
        (templatesData || []).map((row) => ({
          ...row,
          levelsConfig: row.levels_config,
          availability: row.availability,
        })),
      );
    }

    const query = supabase.from('monitoring_instances').select('*');
    const { data: instancesData, error: instancesError } = isAdmin
      ? await query
      : await query.eq('created_by', userId);

    if (!instancesError) {
      setInstances(instancesData || []);
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id,full_name,first_name,last_name,email,doc_number');

    if (!profilesError) {
      setProfiles(profilesData || []);
    }

    if (withLoading) setIsLoading(false);
  }, [isAdmin, userId]);

  useEffect(() => {
    fetchData({ withLoading: true });

    const channel = supabase
      .channel(`reportes-live-${isAdmin ? 'admin' : userId || 'user'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_instances' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoring_templates' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, isAdmin, userId]);

  const templatesById = useMemo(() => {
    const map = new Map();
    templates.forEach((template) => map.set(template.id, template));
    return map;
  }, [templates]);

  const profilesById = useMemo(() => {
    const map = new Map();
    profiles.forEach((profile) => {
      if (profile.id) map.set(profile.id, profile);
      if (profile.email) map.set(profile.email, profile);
      if (profile.doc_number) map.set(profile.doc_number, profile);
    });
    return map;
  }, [profiles]);

  const templatesForReportListing = useMemo(() => {
    if (isAdmin) return templates;
    const instanceTemplateIds = new Set(instances.map((item) => item.template_id).filter(Boolean));
    return templates.filter(
      (template) => template?.created_by === userId || instanceTemplateIds.has(template.id),
    );
  }, [isAdmin, instances, templates, userId]);

  const reportRows = useMemo(() => {
    const instanceRows = instances.map((instance) => {
      const template = templatesById.get(instance.template_id);
      const templateTitle = template?.title || 'Monitoreo sin plantilla';
      const insights = getQuestionInsights(instance, template);
      const reference = getInstanceReferenceData(instance, insights);
      const sheetMetadata = getSheetMetadata(template, instance);
      const state = getReportRowState(template, instance);
      const updatedAtTs = new Date(instance.updated_at || instance.created_at || 0).getTime() || 0;
      const dueAtTs =
        new Date(template?.availability?.endAt || 0).getTime() || Number.MAX_SAFE_INTEGER;
      const isCdd = isCddTemplate(template);
      const registeredBy = getProfileDisplayName(profilesById.get(instance.created_by)) || 'Usuario registrador';

      return {
        id: instance.id,
        templateId: instance.template_id,
        template,
        templateTitle,
        registeredBy,
        docente: reference.referenceType === 'Docente' ? reference.referenceLabel : '',
        displayName: reference.institution || reference.referenceLabel,
        displayType: reference.institution ? 'IE' : reference.referenceType,
        referenceType: reference.referenceType,
        institution: reference.institution || '',
        sheetId: sheetMetadata.sheetId || '',
        sheetTitle: sheetMetadata.sheetTitle || 'Ficha',
        sheetCode: sheetMetadata.sheetCode || '',
        responsePreview: insights.primaryAnswer || 'Sin respuesta registrada',
        responseQuestion: insights.primaryQuestion || '',
        responseIsBinary: Boolean(insights.primaryIsBinary),
        state,
        rangeLabel: template ? formatTemplateRangeCompact(template) : 'Sin rango definido',
        updatedDateLabel: formatDateCompact(instance.updated_at || instance.created_at),
        updatedLabel: formatDateTimeCompact(instance.updated_at || instance.created_at),
        updatedAtTs,
        dueAtTs,
        instance,
        hasReport: true,
        isCdd,
        cddArea: getCddArea(template),
        year: new Date(template?.availability?.startAt || instance.created_at || instance.updated_at || Date.now()).getFullYear(),
      };
    });

    const templateIdsWithInstances = new Set(
      instanceRows.map((row) => row.templateId).filter(Boolean),
    );

    const templateOnlyRows = templatesForReportListing
      .filter((template) => template?.id && !templateIdsWithInstances.has(template.id))
      .map((template) => {
        const updatedAt = template.updated_at || template.created_at;
        const updatedAtTs = new Date(updatedAt || 0).getTime() || 0;
        const dueAtTs =
          new Date(template?.availability?.endAt || 0).getTime() || Number.MAX_SAFE_INTEGER;

        return {
          id: `template-only-${template.id}`,
          templateId: template.id,
          template,
          templateTitle: template?.title || 'Monitoreo sin título',
          docente: '',
          displayName: 'Sin reportes aún',
          displayType: 'Registro',
          referenceType: 'Registro',
          institution: '',
          sheetId: '',
          sheetTitle: 'Ficha general',
          sheetCode: '',
          responsePreview: '',
          state: getTemplateOnlyState(template),
          rangeLabel: formatTemplateRangeCompact(template),
          updatedDateLabel: formatDateCompact(updatedAt),
          updatedLabel: formatDateTimeCompact(updatedAt),
          updatedAtTs,
          dueAtTs,
          instance: null,
          hasReport: false,
          isCdd: isCddTemplate(template),
          cddArea: getCddArea(template),
          year: new Date(template?.availability?.startAt || updatedAt || Date.now()).getFullYear(),
        };
      });

    return [...instanceRows, ...templateOnlyRows];
  }, [instances, profilesById, templatesById, templatesForReportListing]);

  const summary = useMemo(() => {
    const base = {
      total: 0,
      active: 0,
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      expired: 0,
      draft: 0,
    };

    reportRows.forEach((row) => {
      if (!row.hasReport) return;
      base.total += 1;
      if (base[row.state] !== undefined) base[row.state] += 1;
    });

    return base;
  }, [reportRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const rows = reportRows.filter((row) => {
      if (statusFilter !== 'all' && row.state !== statusFilter) return false;
      if (typeFilter === 'cdd' && !row.isCdd) return false;
      if (typeFilter === 'standard' && row.isCdd) return false;
      if (yearFilter !== 'all' && String(row.year || '') !== String(yearFilter)) return false;
      if (!normalizedSearch) return true;

      const haystack = `${row.templateTitle} ${row.sheetTitle || ''} ${row.displayName || ''} ${row.institution || ''} ${row.responseQuestion || ''} ${row.responsePreview || ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    rows.sort((left, right) => {
      if (sortBy === 'name') {
        return left.templateTitle.localeCompare(right.templateTitle, 'es', {
          sensitivity: 'base',
        });
      }
      if (sortBy === 'due') return left.dueAtTs - right.dueAtTs;
      return right.updatedAtTs - left.updatedAtTs;
    });

    return rows;
  }, [reportRows, searchTerm, sortBy, statusFilter, typeFilter, yearFilter]);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(reportRows.map((row) => row.year).filter(Boolean)));
    return years.sort((left, right) => right - left);
  }, [reportRows]);
  const isDetailView = Boolean(detailTemplateId);

  const groupedReports = useMemo(() => {
      const groupsMap = new Map();

    filteredRows.forEach((row) => {
      const groupKey = row.templateId || `sin-template-${row.id}`;
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          groupKey,
          templateId: row.templateId,
          template: row.template,
          templateTitle: row.templateTitle,
          rangeLabel: row.rangeLabel,
          latestUpdatedTs: row.updatedAtTs,
          nearestDueTs: row.dueAtTs,
          reports: [],
          reportCount: 0,
          isCdd: row.isCdd,
          cddArea: row.cddArea,
          year: row.year,
        });
      }

      const group = groupsMap.get(groupKey);
      group.reports.push(row);
      if (row.hasReport) group.reportCount += 1;
      if (row.updatedAtTs > group.latestUpdatedTs) group.latestUpdatedTs = row.updatedAtTs;
      if (row.dueAtTs < group.nearestDueTs) group.nearestDueTs = row.dueAtTs;
    });

    const groups = Array.from(groupsMap.values()).map((group) => {
      const stateCount = {
        active: 0,
        scheduled: 0,
        in_progress: 0,
        completed: 0,
        expired: 0,
        draft: 0,
      };

      group.reports.forEach((report) => {
        if (stateCount[report.state] !== undefined) stateCount[report.state] += 1;
      });

      const sheetGroupsMap = new Map();
      group.reports.forEach((report) => {
        const sheetKey = report.sheetId || '__sheet_general__';
        if (!sheetGroupsMap.has(sheetKey)) {
          sheetGroupsMap.set(sheetKey, {
            sheetKey,
            sheetId: report.sheetId || '',
            sheetTitle: report.sheetTitle || 'Ficha general',
            sheetCode: report.sheetCode || '',
            reports: [],
            reportCount: 0,
            latestUpdatedTs: report.updatedAtTs,
          });
        }

        const sheetGroup = sheetGroupsMap.get(sheetKey);
        sheetGroup.reports.push(report);
        if (report.hasReport) sheetGroup.reportCount += 1;
        if (report.updatedAtTs > sheetGroup.latestUpdatedTs) {
          sheetGroup.latestUpdatedTs = report.updatedAtTs;
        }
      });

      const sheetGroups = Array.from(sheetGroupsMap.values()).sort((left, right) => {
        if (left.sheetTitle === right.sheetTitle) return right.latestUpdatedTs - left.latestUpdatedTs;
        return left.sheetTitle.localeCompare(right.sheetTitle, 'es', { sensitivity: 'base' });
      });

      let groupState = 'active';
      if (stateCount.active > 0) groupState = 'active';
      else if (stateCount.scheduled > 0) groupState = 'scheduled';
      else if (stateCount.expired > 0) groupState = 'expired';
      else if (stateCount.draft > 0) groupState = 'draft';

      return {
        ...group,
        stateCount,
        groupState,
        sheetGroups,
      };
    });

    groups.sort((left, right) => {
      if (sortBy === 'name') {
        return left.templateTitle.localeCompare(right.templateTitle, 'es', {
          sensitivity: 'base',
        });
      }
      if (sortBy === 'due') return left.nearestDueTs - right.nearestDueTs;
      return right.latestUpdatedTs - left.latestUpdatedTs;
    });

    return groups;
  }, [filteredRows, sortBy]);

  const detailGroup = useMemo(() => {
    if (!detailTemplateId) return null;
    const rows = reportRows.filter((row) => String(row.templateId || '') === String(detailTemplateId || ''));
    if (!rows.length) return null;

    const first = rows[0];
    const stateCount = {
      active: 0,
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      expired: 0,
      draft: 0,
    };

    const sheetGroupsMap = new Map();
    rows.forEach((report) => {
      if (stateCount[report.state] !== undefined) stateCount[report.state] += 1;
      const sheetKey = report.sheetId || '__sheet_general__';
      if (!sheetGroupsMap.has(sheetKey)) {
        sheetGroupsMap.set(sheetKey, {
          sheetKey,
          sheetId: report.sheetId || '',
          sheetTitle: report.sheetTitle || 'Ficha general',
          sheetCode: report.sheetCode || '',
          reports: [],
          reportCount: 0,
          latestUpdatedTs: report.updatedAtTs,
        });
      }

      const sheetGroup = sheetGroupsMap.get(sheetKey);
      sheetGroup.reports.push(report);
      if (report.hasReport) sheetGroup.reportCount += 1;
      if (report.updatedAtTs > sheetGroup.latestUpdatedTs) {
        sheetGroup.latestUpdatedTs = report.updatedAtTs;
      }
    });

    const sheetGroups = Array.from(sheetGroupsMap.values()).sort((left, right) => {
      if (left.sheetTitle === right.sheetTitle) return right.latestUpdatedTs - left.latestUpdatedTs;
      return left.sheetTitle.localeCompare(right.sheetTitle, 'es', { sensitivity: 'base' });
    });

    let groupState = 'active';
    if (stateCount.active > 0) groupState = 'active';
    else if (stateCount.scheduled > 0) groupState = 'scheduled';
    else if (stateCount.expired > 0) groupState = 'expired';
    else if (stateCount.draft > 0) groupState = 'draft';

    return {
      groupKey: first.templateId || first.id,
      templateId: first.templateId,
      template: first.template,
      templateTitle: first.templateTitle,
      rangeLabel: first.rangeLabel,
      reports: rows,
      reportCount: rows.filter((row) => row.hasReport).length,
      isCdd: first.isCdd,
      cddArea: first.cddArea,
      stateCount,
      sheetGroups,
      groupState,
    };
  }, [detailTemplateId, reportRows]);
  const detailRows = useMemo(
    () => (detailGroup ? detailGroup.sheetGroups.flatMap((sheetGroup) => sheetGroup.reports).filter((row) => row.hasReport) : []),
    [detailGroup],
  );
  const filteredDetailRows = useMemo(() => {
    const normalizedSearch = detailSearchTerm.trim().toLowerCase();
    return detailRows.filter((row) => {
      if (detailStatusFilter !== 'all' && row.state !== detailStatusFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = `${row.registeredBy || ''} ${row.displayName || ''} ${row.institution || ''} ${row.sheetTitle || ''} ${row.templateTitle || ''} ${row.docente || ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [detailRows, detailSearchTerm, detailStatusFilter]);
  const cddReportGroups = useMemo(() => groupedReports.filter((group) => group.isCdd), [groupedReports]);
  const standardReportGroups = useMemo(() => groupedReports.filter((group) => !group.isCdd), [groupedReports]);

  const stateFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'scheduled', label: 'Programados' },
    { value: 'expired', label: 'Vencidos' },
    { value: 'draft', label: 'Borradores' },
  ];

  const openPdf = async (template, instance) => {
    if (!template || !instance?.id) return;
    const status = getReportStatusLabel(template);
    setPdfLoadingId(instance.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const fileName = formatFileName(template, instance);
      const doc = buildPdf(template, instance, status);
      doc.save(`${fileName}.pdf`);
    } finally {
      setPdfLoadingId(null);
    }
  };

  const navigateToFicha = (templateId, instanceId = '', sheetId = '') => {
    const returnTo = `${location.pathname}${location.search || ''}`;
    const params = new URLSearchParams({
      from: 'reportes',
      returnTo,
    });
    if (instanceId) localStorage.setItem('monitoreoInstanceActive', instanceId);
    else localStorage.removeItem('monitoreoInstanceActive');
    localStorage.setItem('monitoreoTemplateSelected', templateId || '');
    if (sheetId) {
      localStorage.setItem('monitoreoTemplateSheetSelected', sheetId);
    }
    navigate(`/monitoreo/ficha-escritura?${params.toString()}`);
  };

  const handleCreateReport = async (template, { reuseExisting = true } = {}) => {
    if (!template?.id) return;

    if (reuseExisting) {
      const existingQuery = supabase
        .from('monitoring_instances')
        .select('*')
        .eq('template_id', template.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      const { data: existingData, error: existingError } = isAdmin
        ? await existingQuery
        : await existingQuery.eq('created_by', userId);

      if (existingError) {
        console.error(existingError);
        openNoticeModal(
          'No se pudo continuar',
          'No se pudieron validar los reportes existentes del monitoreo.',
          'warning',
        );
        return;
      }

      const existing = existingData?.[0];
      if (existing?.id) {
        navigateToFicha(template.id, existing.id);
        return;
      }
    }
    navigateToFicha(template.id);
  };

  const handleRequestDelete = ({ instanceId, isAdminAction, details }) => {
    if (!instanceId) return;
    setDeleteTarget({
      instanceId,
      isAdminAction: Boolean(isAdminAction),
      details: details || '',
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.instanceId || isDeleting) return;

    setIsDeleting(true);
    const targetInstanceId = deleteTarget.instanceId;
    const { error } = await supabase
      .from('monitoring_instances')
      .delete()
      .eq('id', targetInstanceId);

    if (error) {
      console.error(error);
      setIsDeleting(false);
      setDeleteTarget(null);
      openNoticeModal(
        'No se pudo eliminar',
        'No se pudo eliminar el formulario. Intentalo nuevamente.',
        'danger',
      );
      return;
    }

    const deletedInstance = instances.find((item) => item.id === targetInstanceId);
    const deletedTemplateId = deletedInstance?.template_id || '';
    const nextInstances = instances.filter((item) => item.id !== targetInstanceId);
    setInstances(nextInstances);
    if (
      detailTemplateId &&
      deletedTemplateId &&
      String(detailTemplateId) === String(deletedTemplateId) &&
      !nextInstances.some((item) => String(item.template_id) === String(deletedTemplateId))
    ) {
      navigate('/monitoreo/reportes', { replace: true });
    }
    setIsDeleting(false);
    setDeleteTarget(null);
    fetchData();
  };

  const openReport = (row) => {
    if (!row) return;
    if (!row.instance?.id) {
      handleCreateReport(row.template);
      return;
    }
    navigateToFicha(row.templateId || '', row.id, row.sheetId || '');
  };

  return (
    <div className="flex flex-col gap-6">
      <Card
        className={
          isDetailView
            ? '!border-0 !bg-transparent !p-0 !shadow-none !backdrop-blur-0'
            : 'flex flex-col gap-6'
        }
      >
        {!isDetailView ? (
          <>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Reportes</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              CdD usa una ficha única para meta y avance; otros monitoreos agrupan fichas por usuario.
            </p>
          </div>
          <label className="flex h-11 min-w-[280px] items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-4 dark:border-[#a9927d]/35 dark:bg-[#22333b]">
            <Search size={18} className="text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar monitoreos..."
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#a9927d]/35 dark:bg-[#171d23]">
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-[#d8c4b2]">Tipo de Monitoreo</span>
              <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-[#22333b]">
                {[
                  ['all', 'Todos'],
                  ['cdd', 'CdD'],
                  ['standard', 'Otros'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTypeFilter(value)}
                    className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${
                      typeFilter === value
                        ? 'bg-white text-cyan-700 shadow-sm dark:bg-[#5e503f] dark:text-white'
                        : 'text-slate-600 hover:text-cyan-700 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-[#d8c4b2]">Año Académico</span>
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none dark:border-[#a9927d]/35 dark:bg-[#22333b] dark:text-slate-100"
              >
                <option value="all">Todos</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-[#d8c4b2]">Estado</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none dark:border-[#a9927d]/35 dark:bg-[#22333b] dark:text-slate-100"
              >
                {stateFilters.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-[#d8c4b2]">Ordenar</span>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 dark:border-[#a9927d]/35 dark:bg-[#22333b]">
                <ArrowUpDown size={14} className="text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="h-full bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-100"
                >
                  <option value="recent">Más recientes</option>
                  <option value="due">Próximo vencimiento</option>
                  <option value="name">Nombre (A-Z)</option>
                </select>
              </div>
            </label>
          </div>

        </div>
          </>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5">
            <div className="flex items-center gap-2 text-sm text-cyan-200">
              <Loader2 size={16} className="animate-spin" />
              <p>Cargando reportes...</p>
            </div>
          </div>
        ) : reportRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
            Aún no hay reportes disponibles. Cuando finalices un monitoreo, aquí podrás ver los resultados.
          </div>
        ) : !isDetailView && filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
            No hay resultados con esos filtros.
          </div>
        ) : !isDetailView ? (
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Star size={20} className="text-cyan-600 dark:text-cyan-200" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Compromisos de Desempeño (CdD)</h2>
                <span className="rounded bg-cyan-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-100">
                  Dashboard Sync Active
                </span>
              </div>

              {cddReportGroups.length ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {cddReportGroups.map((group) => {
                    const primaryRow = group.reports.find((row) => row.hasReport) || group.reports[0];
                    const progressLabel =
                      group.groupState === 'expired'
                        ? 'Vencido'
                        : group.groupState === 'scheduled'
                          ? 'Programado'
                          : group.groupState === 'draft'
                            ? 'Borrador'
                            : 'Activo';
                    return (
                      <article key={group.groupKey} className="relative flex min-h-[250px] flex-col gap-4 overflow-hidden rounded-xl border border-cyan-300/70 bg-white p-5 shadow-[0_12px_28px_-14px_rgba(6,182,212,0.45)] transition hover:shadow-[0_18px_36px_-16px_rgba(6,182,212,0.5)] dark:border-cyan-400/35 dark:bg-[#171d23]">
                        <div className="absolute -right-12 -top-12 h-24 w-24 rounded-bl-full bg-cyan-100/80 dark:bg-cyan-400/10" />
                        <div className="relative flex items-start justify-between gap-3">
                          <div className="rounded-lg bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-100">
                            <BarChart3 size={22} />
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                            group.groupState === 'expired'
                              ? 'border border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-300/80 dark:bg-rose-300 dark:text-rose-950'
                              : group.groupState === 'scheduled'
                                ? 'border border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-200/80 dark:bg-amber-300 dark:text-amber-950'
                                : group.groupState === 'draft'
                                  ? 'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-300/60 dark:bg-slate-300 dark:text-slate-950'
                                  : 'border border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-300/70 dark:bg-emerald-300 dark:text-emerald-950'
                          }`}>
                            {progressLabel}
                          </span>
                        </div>
                        <div className="relative min-w-0">
                          <h3 className="line-clamp-2 text-lg font-bold text-slate-900 dark:text-slate-100">{group.templateTitle}</h3>
                          <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                            Área CdD: {group.cddArea || 'Sin área'} · ficha única para avance progresivo.
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 border-y border-slate-100 py-3 dark:border-[#a9927d]/20">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">Última carga</p>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{primaryRow?.updatedDateLabel || 'Sin registro'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">Ficha</p>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{group.reportCount ? '1 ficha CdD' : 'Pendiente'}</p>
                          </div>
                        </div>
                        <div className="mt-auto flex gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/monitoreo/reportes/${group.templateId}`)}
                            className="flex-1 rounded-lg bg-cyan-700 py-2 text-sm font-bold text-white transition hover:bg-cyan-800 dark:bg-[#426b69] dark:hover:bg-[#4f7d7a]"
                          >
                            Ver Reportes
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (primaryRow?.instance) openPdf(primaryRow.template, primaryRow.instance);
                            }}
                            disabled={!primaryRow?.instance}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-[#a9927d]/35 dark:text-slate-200 dark:hover:bg-white/10"
                            title={primaryRow?.instance ? 'Descargar PDF' : 'Sin ficha para descargar'}
                          >
                            <Download size={17} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-500 dark:border-[#a9927d]/35 dark:bg-[#171d23] dark:text-slate-400">
                  No hay monitoreos CdD con los filtros actuales.
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Package size={20} className="text-slate-400" />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Otros Monitoreos</h2>
                </div>
                <button type="button" className="text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-200">Ver Histórico</button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[#a9927d]/35 dark:bg-[#171d23]">
                <table className="w-full table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[42%]" />
                    <col className="w-[14%]" />
                    <col className="w-[18%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#a9927d]/25 dark:bg-[#151c23]">
                      <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#d8c4b2]">Programa de Monitoreo</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#d8c4b2]">Estado</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#d8c4b2]">Periodo</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#d8c4b2]">Archivos</th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#d8c4b2]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#a9927d]/20">
                    {standardReportGroups.length ? standardReportGroups.map((group) => {
                      const groupMeta = REPORT_STATE_META[group.groupState] || REPORT_STATE_META.active;
                      return (
                        <tr key={group.groupKey} className="transition hover:bg-slate-50 dark:hover:bg-[#22333b]/70">
                          <td className="px-5 py-4">
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{group.templateTitle}</p>
                            <p className="truncate text-xs text-slate-400">Código: {String(group.templateId || group.groupKey).slice(0, 13).toUpperCase()}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${groupMeta.className}`}>
                              {groupMeta.label}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">{group.rangeLabel}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
                            {group.reportCount} {pluralize(group.reportCount, 'ficha', 'fichas')}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button type="button" onClick={() => navigate(`/monitoreo/reportes/${group.templateId}`)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-cyan-700 transition hover:bg-cyan-50 dark:text-cyan-200 dark:hover:bg-cyan-500/10" title="Ver reportes">
                              <Eye size={16} />
                            </button>
                            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200" title="Más opciones">
                              <MoreVertical size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No hay otros monitoreos con los filtros actuales.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-[#a9927d]/25 dark:bg-[#151c23]">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Mostrando {standardReportGroups.length} de {groupedReports.length} monitoreos estándar
                  </span>
                  <div className="flex gap-2">
                    <button type="button" className="rounded border border-slate-300 px-3 py-1 text-xs font-bold text-slate-400 dark:border-[#a9927d]/35">Anterior</button>
                    <button type="button" className="rounded border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white dark:border-[#a9927d]/35 dark:text-slate-200 dark:hover:bg-white/10">Siguiente</button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : !detailGroup ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500 dark:border-[#a9927d]/35 dark:bg-[#171d23] dark:text-slate-400">
            No se encontró el monitoreo seleccionado.
          </div>
        ) : detailGroup.isCdd ? (
          <div
            className="cdd-kpi-surface rounded-[28px] bg-[#f6fafe] p-5 text-slate-900 shadow-sm ring-1 ring-slate-200/80 sm:p-7 lg:p-8"
          >
            <section className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => navigate('/monitoreo/reportes')}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-700 transition hover:text-cyan-900"
                >
                  <ArrowLeft size={15} />
                  Volver a Reportes
                </button>
                <nav className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Monitoreo</span>
                  <span>/</span>
                  <span className="font-semibold text-cyan-700">Compromiso de Desempeño</span>
                </nav>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                  Fichas de Monitoreo CdD
                </h1>
                <p className="mt-2 max-w-3xl text-base text-slate-600">
                  Visualización ejecutiva de meta, avance y cumplimiento del compromiso seleccionado.
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {detailGroup.templateTitle}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <div className="flex min-w-[180px] items-center gap-4 rounded-2xl !border !border-slate-100 bg-white p-4 shadow-sm">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                    <FileText size={22} />
                  </span>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Total fichas</p>
                    <p className="text-2xl font-extrabold text-slate-950">{detailRows.length}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-8 rounded-2xl !border !border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <label className="cdd-kpi-search-control flex min-h-12 flex-1 items-center gap-3 rounded-xl !border !border-slate-200 bg-slate-50 px-4 transition focus-within:!border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-100">
                  <Search size={22} className="shrink-0 text-slate-400" />
                  <input
                    value={detailSearchTerm}
                    onChange={(event) => setDetailSearchTerm(event.target.value)}
                    placeholder="Buscar por nombre de usuario, IE o código modular..."
                    className="cdd-kpi-input w-full border-0 bg-transparent p-0 text-base text-slate-800 shadow-none outline-none placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0"
                  />
                </label>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="cdd-kpi-filter-control inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                    <Filter size={18} />
                    <select
                      value={detailStatusFilter}
                      onChange={(event) => setDetailStatusFilter(event.target.value)}
                      className="cdd-kpi-select border-0 bg-transparent p-0 text-sm font-semibold text-slate-600 shadow-none focus:border-0 focus:ring-0"
                    >
                      {stateFilters.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.value === 'all' ? 'Filtros' : option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const firstReport = detailRows[0];
                      if (firstReport?.template && firstReport?.instance) openPdf(firstReport.template, firstReport.instance);
                    }}
                    disabled={!detailRows.length || pdfLoadingId === detailRows[0]?.id}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl !border !border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pdfLoadingId === detailRows[0]?.id ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    Exportar
                  </button>
                </div>
              </div>
            </section>

            {!detailRows.length ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
                <p className="text-base font-bold text-slate-900">Este CdD aún no tiene ficha registrada.</p>
                <p className="mt-1 text-sm text-slate-500">Crea la ficha única para iniciar el seguimiento de meta y avance.</p>
                <button
                  type="button"
                  onClick={() => handleCreateReport(detailGroup.template, { reuseExisting: true })}
                  className="mt-5 inline-flex h-10 items-center rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white transition hover:bg-cyan-800"
                >
                  Crear ficha CdD
                </button>
              </section>
            ) : !filteredDetailRows.length ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
                No hay fichas CdD que coincidan con la búsqueda o filtro seleccionado.
              </section>
            ) : (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredDetailRows.map((row) => {
                  const metrics = extractCddMetrics(row);
                  const kpiStatus = getCddKpiStatus(metrics.progress);
                  const registrantName = row.registeredBy || 'Usuario registrador';
                  const institutionName =
                    row.institution ||
                    (looksLikeInstitutionValue(row.displayName) ? row.displayName : 'Institución no registrada');
                  return (
                    <article
                      key={row.id}
                    className="group rounded-2xl !border !border-slate-100 bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)] transition hover:!border-cyan-200 hover:shadow-[0_14px_28px_rgba(15,23,42,0.07)] sm:p-5"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-sm font-extrabold text-cyan-800 ring-4 ring-slate-50">
                            {getInitials(registrantName)}
                          </span>
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 text-base font-extrabold text-slate-950 transition group-hover:text-cyan-700">
                              {registrantName}
                            </h3>
                            <p className="mt-0.5 flex items-start gap-1.5 text-xs text-slate-500">
                              <Building2 size={13} className="mt-0.5 shrink-0" />
                              <span className="line-clamp-1">{institutionName}</span>
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${kpiStatus.className}`}>
                          {kpiStatus.label}
                        </span>
                      </div>

                      <div className="mb-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl !border !border-slate-100 bg-slate-50 p-3">
                          <p className="mb-1 text-[11px] font-semibold text-slate-500">Meta Asignada</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-extrabold text-slate-950">{metrics.meta}</span>
                            <span className="text-xs text-slate-400">puntos</span>
                          </div>
                        </div>
                        <div className="rounded-xl !border !border-cyan-100 bg-cyan-50 p-3">
                          <p className="mb-1 text-[11px] font-semibold text-cyan-700">Avance Logrado</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-extrabold text-cyan-700">{metrics.advance}</span>
                            <span className="text-xs text-cyan-500">puntos</span>
                          </div>
                        </div>
                      </div>

                      <div className="mb-4 space-y-2">
                        <div className="flex justify-between text-[11px] font-extrabold text-slate-600">
                          <span>Progreso del Compromiso</span>
                          <span className="text-cyan-700">{metrics.progress.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${metrics.progress}%`, backgroundColor: kpiStatus.barColor }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays size={13} />
                            Registro: {formatDateCompact(row.instance?.created_at)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock size={13} />
                            Act: {row.updatedDateLabel}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openReport(row)}
                          className="inline-flex items-center justify-end gap-1.5 text-sm font-semibold text-cyan-700 transition hover:gap-2 hover:text-cyan-900"
                        >
                          Ver Detalle
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}

            <section className="mt-10 border-t border-slate-200 pt-7 text-center">
              <p className="text-sm text-slate-500">
                Mostrando {filteredDetailRows.length} de {detailRows.length} fichas de monitoreo CdD registradas.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" disabled className="inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 text-slate-300">
                  <ArrowLeft size={18} />
                </button>
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-600 font-bold text-white">1</button>
                <button type="button" disabled className="inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 text-slate-300">
                  <ArrowRight size={18} />
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <button
                    type="button"
                    onClick={() => navigate('/monitoreo/reportes')}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-700 transition hover:text-cyan-900 dark:text-cyan-200 dark:hover:text-cyan-100"
                  >
                    <ArrowLeft size={15} />
                    Volver a Reportes
                  </button>
                  <div>
                    <h1 className="max-w-5xl text-2xl font-extrabold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                      {detailGroup.templateTitle}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={14} />
                        {detailGroup.rangeLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 size={14} />
                        Unidad Responsable: {detailGroup.cddArea || 'No definida'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const firstReport = detailRows[0];
                    if (firstReport?.template && firstReport?.instance) openPdf(firstReport.template, firstReport.instance);
                  }}
                  disabled={!detailRows.length || pdfLoadingId === detailRows[0]?.id}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#a9927d]/35 dark:bg-[#151c23] dark:text-slate-200 dark:hover:bg-white/10"
                >
                  {pdfLoadingId === detailRows[0]?.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Descargar Resumen
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#a9927d]/35 dark:bg-[#171d23]">
                <label className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 dark:border-[#a9927d]/25 dark:bg-[#22333b]">
                  <Search size={18} className="text-slate-400" />
                  <input
                    value={detailSearchTerm}
                    onChange={(event) => setDetailSearchTerm(event.target.value)}
                    placeholder="Buscar por nombre de registrador, IE o ficha..."
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Fichas Registradas</h2>
                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                  Filtrar por estado:
                  <select
                    value={detailStatusFilter}
                    onChange={(event) => setDetailStatusFilter(event.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none dark:border-[#a9927d]/35 dark:bg-[#22333b] dark:text-slate-100"
                  >
                    {stateFilters.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value === 'all' ? 'Todos los estados' : option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!detailRows.length ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 dark:border-[#a9927d]/35 dark:bg-[#171d23]">
                  <p className="text-sm text-slate-700 dark:text-slate-300">No quedan reportes en este monitoreo.</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">La vista se actualiza automáticamente después de eliminar.</p>
                </div>
              ) : !filteredDetailRows.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-500 dark:border-[#a9927d]/35 dark:bg-[#171d23] dark:text-slate-400">
                  No hay fichas que coincidan con la búsqueda o el estado seleccionado.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                  {filteredDetailRows.map((row) => {
                    const stateMeta = REPORT_STATE_META[row.state] || REPORT_STATE_META.active;
                    const registrantName = row.registeredBy || 'Usuario registrador';
                    const institutionName =
                      row.institution ||
                      (looksLikeInstitutionValue(row.displayName) ? row.displayName : 'Institución no registrada');
                    return (
                      <article key={row.id} className="group flex min-h-[230px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-[#a9927d]/35 dark:bg-[#171d23]">
                        <div className="flex-1 p-6">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-sm font-bold text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-100">
                                {getInitials(registrantName)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{registrantName}</p>
                              </div>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${stateMeta.className}`}>
                              {stateMeta.label}
                            </span>
                          </div>

                          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 dark:border-[#a9927d]/20 dark:bg-[#22333b]">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Institución educativa</p>
                            <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-900 dark:text-slate-100">{institutionName}</p>
                          </div>

                          <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fecha registro</p>
                            <p className="mt-1 text-sm font-semibold text-cyan-700 dark:text-cyan-200">{row.updatedDateLabel}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50 p-4 dark:border-[#a9927d]/20 dark:bg-[#151c23]">
                          <button
                            type="button"
                            onClick={() => openReport(row)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-cyan-100"
                            title="Ver ficha"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openReport(row)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-cyan-100"
                            title="Editar ficha"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openPdf(row.template, row.instance)}
                            disabled={pdfLoadingId === row.id || !row.template}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-cyan-100"
                            title="Descargar PDF"
                          >
                            {pdfLoadingId === row.id ? <Loader2 size={15} className="animate-spin" /> : <FileText size={16} />}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        tone="danger"
        title="Eliminar reporte"
        description={
          deleteTarget?.isAdminAction
            ? 'Si eliminas este formulario, ya no se podra recuperar. Deseas continuar?'
            : 'Deseas eliminar este formulario? Esta accion no se puede deshacer.'
        }
        details={deleteTarget?.details ? `Reporte: ${deleteTarget.details}` : ''}
        confirmText={isDeleting ? 'Eliminando...' : 'Si, eliminar'}
        cancelText="Cancelar"
        loading={isDeleting}
        onCancel={() => {
          if (isDeleting) return;
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
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


