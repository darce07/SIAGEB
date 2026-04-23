import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpDown,
  Download,
  Eye,
  FileText,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Card from '../components/ui/Card.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
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
  if (getTemplateStatus(template) === 'closed') return 'expired';
  if (instance.status === 'completed') return 'completed';
  if (instance.status === 'in_progress') return 'in_progress';
  return 'active';
};

const getTemplateOnlyState = (template) => {
  if (!template) return 'active';
  if (template.status !== 'published') return 'draft';
  if (getTemplateStatus(template) === 'closed') return 'expired';
  return 'active';
};

const REPORT_STATE_META = {
  active: {
    label: 'Activo',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  },
  in_progress: {
    label: 'En progreso',
    className: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  },
  completed: {
    label: 'Completado',
    className: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
  },
  expired: {
    label: 'Vencido',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  },
  draft: {
    label: 'Borrador',
    className: 'border-slate-600/70 bg-slate-800/60 text-slate-200',
  },
};

const pluralize = (count, singular, plural) => (count === 1 ? singular : plural);

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

const looksLikeInstitutionValue = (value) => {
  const text = String(value || '').trim();
  if (!text || isBinaryAnswer(text)) return false;
  const hasLetterOrNumber = /[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]/.test(text);
  return hasLetterOrNumber && text.length >= 4;
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
  const header = instance?.data?.header || {};
  const institutionFromHeader =
    header.institucion || header.institution || header.institution_name || header.institucion_educativa || '';
  const institution = institutionFromHeader || insights.institutionAnswer || '';
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
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

      return {
        id: instance.id,
        templateId: instance.template_id,
        template,
        templateTitle,
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
        };
      });

    return [...instanceRows, ...templateOnlyRows];
  }, [instances, templatesById, templatesForReportListing]);

  const summary = useMemo(() => {
    const base = {
      total: 0,
      active: 0,
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
  }, [reportRows, searchTerm, sortBy, statusFilter]);

  const visibleReportCount = useMemo(
    () => filteredRows.filter((row) => row.hasReport).length,
    [filteredRows],
  );
  const isDetailView = Boolean(detailTemplateId);

  const groupedReports = useMemo(() => {
      const groupsMap = new Map();

    filteredRows.forEach((row) => {
      const groupKey = row.templateId || `sin-template-${row.id}`;
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          groupKey,
          templateId: row.templateId,
          templateTitle: row.templateTitle,
          rangeLabel: row.rangeLabel,
          latestUpdatedTs: row.updatedAtTs,
          nearestDueTs: row.dueAtTs,
          reports: [],
          reportCount: 0,
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
      if (stateCount.in_progress > 0) groupState = 'in_progress';
      else if (stateCount.active > 0) groupState = 'active';
      else if (stateCount.completed > 0) groupState = 'completed';
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

  const detailGroup = useMemo(
    () => groupedReports.find((group) => String(group.templateId || '') === String(detailTemplateId || '')) || null,
    [groupedReports, detailTemplateId],
  );
  const detailRows = useMemo(
    () => (detailGroup ? detailGroup.sheetGroups.flatMap((sheetGroup) => sheetGroup.reports).filter((row) => row.hasReport) : []),
    [detailGroup],
  );

  const stateFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'in_progress', label: 'En progreso' },
    { value: 'completed', label: 'Completados' },
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
      <Card className="flex flex-col gap-5">
        <SectionHeader title="Reportes" size="page" />
        <p className="text-sm text-slate-400">
          Consulta y gestiona los resultados de monitoreos institucionales.
        </p>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-900/45 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Filtros</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 text-[11px] text-cyan-100">
              <span className="font-semibold">{summary.total}</span>
              <span>Total</span>
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-100">
              <span className="font-semibold">{summary.in_progress}</span>
              <span>En progreso</span>
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 text-[11px] text-indigo-100">
              <span className="font-semibold">{summary.completed}</span>
              <span>Completados</span>
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 text-[11px] text-amber-100">
              <span className="font-semibold">{summary.expired}</span>
              <span>Vencidos</span>
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-600/70 bg-slate-800/60 px-2.5 text-[11px] text-slate-200">
              <span className="font-semibold">{summary.draft}</span>
              <span>Borradores</span>
            </span>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_220px_auto] lg:items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Buscar</span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <Search size={14} className="text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Monitoreo, IE o referencia..."
                  className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Estado</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-[38px] rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                {stateFilters.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Ordenar</span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/60 px-3">
                <ArrowUpDown size={13} className="text-slate-500" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="h-[38px] w-full bg-transparent text-sm text-slate-100 focus:outline-none"
                >
                  <option value="recent">Más recientes</option>
                  <option value="due">Próximo vencimiento</option>
                  <option value="name">Nombre (A-Z)</option>
                </select>
              </div>
            </label>

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 px-3 py-2 text-xs text-slate-300">
              Mostrando: <span className="font-semibold text-slate-100">{visibleReportCount}</span>{' '}
              {pluralize(visibleReportCount, 'reporte', 'reportes')} en{' '}
              <span className="font-semibold text-slate-100">{groupedReports.length}</span>{' '}
              {pluralize(groupedReports.length, 'monitoreo', 'monitoreos')}
            </div>
          </div>
        </div>

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
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
            No hay resultados con esos filtros.
          </div>
        ) : !isDetailView ? (
          <div className="space-y-4">
            {groupedReports.map((group) => {
              const groupMeta = REPORT_STATE_META[group.groupState] || REPORT_STATE_META.active;
              return (
                <article key={group.groupKey} className="rounded-2xl border border-slate-800/70 bg-slate-900/45 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-100">{truncateLabel(group.templateTitle, 84)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {group.rangeLabel} · {group.reportCount} {pluralize(group.reportCount, 'reporte', 'reportes')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${groupMeta.className}`}>
                        {groupMeta.label}
                      </span>
                      {group.templateId ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/monitoreo/reportes/${group.templateId}`)}
                          className="inline-flex items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/65"
                        >
                          Ver reportes
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : !detailGroup ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
            No se encontró el monitoreo seleccionado.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800/70 bg-slate-900/45 px-4 py-4">
              <button
                type="button"
                onClick={() => navigate('/monitoreo/reportes')}
                className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
              >
                ? Volver a Reportes
              </button>
              <p className="text-base font-semibold text-slate-100">{detailGroup.templateTitle}</p>
              <p className="mt-1 text-xs text-slate-400">{detailGroup.rangeLabel}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">Total fichas: <span className="font-semibold text-slate-100">{detailGroup.reportCount}</span></div>
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">En progreso: <span className="font-semibold">{detailGroup.stateCount.in_progress}</span></div>
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">Completadas: <span className="font-semibold">{detailGroup.stateCount.completed}</span></div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Vencidas: <span className="font-semibold">{detailGroup.stateCount.expired}</span></div>
              </div>
            </div>

            {!detailRows.length ? (
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/45 px-4 py-4">
                <p className="text-sm text-slate-300">No quedan reportes en este monitoreo.</p>
                <p className="mt-1 text-xs text-slate-400">La vista se actualiza automáticamente después de eliminar.</p>
              </div>
            ) : detailRows.map((row) => {
              const stateMeta = REPORT_STATE_META[row.state] || REPORT_STATE_META.active;
              const canDeleteRow = isAdmin || row.state !== 'expired';
              return (
                <article key={row.id} className="rounded-2xl border border-slate-800/70 bg-slate-900/45 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-100">{truncateLabel(row.displayName || 'Reporte registrado', 84)}</p>
                      <p className="text-xs text-slate-400">Ficha: {row.sheetTitle || 'Ficha general'}</p>
                      <p className="text-xs text-slate-400">Actualizado: {row.updatedDateLabel}</p>
                      <p className="text-xs text-slate-300">IE: {row.institution || 'No registrada'}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateMeta.className}`}>
                      {stateMeta.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openReport(row)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60"
                    >
                      <Eye size={13} />
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => openReport(row)}
                      className="inline-flex items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/65"
                    >
                      <FileText size={13} />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => openPdf(row.template, row.instance)}
                      disabled={pdfLoadingId === row.id || !row.template}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-400/70 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pdfLoadingId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      {pdfLoadingId === row.id ? 'Generando...' : 'PDF'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRequestDelete({
                          instanceId: row.id,
                          isAdminAction: isAdmin,
                          details: `${row.templateTitle} - ${row.displayName || 'Reporte registrado'}`,
                        })
                      }
                      disabled={!canDeleteRow}
                      title={!canDeleteRow ? 'Monitoreo vencido: solo administrador puede eliminar.' : undefined}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        canDeleteRow
                          ? 'border-rose-500/30 text-rose-200 hover:border-rose-400/60'
                          : 'cursor-not-allowed border-slate-700/70 text-slate-500'
                      }`}
                    >
                      <Trash2 size={13} />
                      Eliminar
                    </button>
                  </div>
                </article>
              );
            })}
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


