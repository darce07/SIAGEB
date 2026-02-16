import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Card from '../components/ui/Card.jsx';
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
  const [selectedReportId, setSelectedReportId] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setIsLoading(true);

      const { data: templatesData, error: templatesError } = await supabase
        .from('monitoring_templates')
        .select('*');

      if (!templatesError && active) {
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

      if (!instancesError && active) {
        setInstances(instancesData || []);
      }

      if (active) setIsLoading(false);
    };

    fetchData();
    return () => {
      active = false;
    };
  }, [isAdmin, userId]);

  const templatesById = useMemo(() => {
    const map = new Map();
    templates.forEach((template) => map.set(template.id, template));
    return map;
  }, [templates]);

  const reportRows = useMemo(() => {
    return instances.map((instance) => {
      const template = templatesById.get(instance.template_id);
      const templateTitle = template?.title || 'Monitoreo sin plantilla';
      const docente = instance?.data?.header?.docente || 'Sin docente';
      const state = getReportRowState(template, instance);
      const updatedAtTs = new Date(instance.updated_at || instance.created_at || 0).getTime() || 0;
      const dueAtTs =
        new Date(template?.availability?.endAt || 0).getTime() || Number.MAX_SAFE_INTEGER;

      return {
        id: instance.id,
        templateId: instance.template_id,
        template,
        templateTitle,
        docente,
        state,
        rangeLabel: template ? formatTemplateRangeCompact(template) : 'Sin rango definido',
        updatedLabel: formatDateTimeCompact(instance.updated_at || instance.created_at),
        updatedAtTs,
        dueAtTs,
        instance,
      };
    });
  }, [instances, templatesById]);

  const summary = useMemo(() => {
    const base = {
      total: reportRows.length,
      active: 0,
      in_progress: 0,
      completed: 0,
      expired: 0,
      draft: 0,
    };

    reportRows.forEach((row) => {
      if (base[row.state] !== undefined) base[row.state] += 1;
    });

    return base;
  }, [reportRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const rows = reportRows.filter((row) => {
      if (statusFilter !== 'all' && row.state !== statusFilter) return false;
      if (!normalizedSearch) return true;

      const haystack = `${row.templateTitle} ${row.docente}`.toLowerCase();
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
        });
      }

      const group = groupsMap.get(groupKey);
      group.reports.push(row);
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

  useEffect(() => {
    setExpandedGroups((prev) => {
      const validKeys = new Set(groupedReports.map((group) => group.groupKey));
      const next = {};

      Object.entries(prev).forEach(([key, value]) => {
        if (value && validKeys.has(key)) next[key] = true;
      });

      if (!Object.keys(next).length && groupedReports.length) {
        next[groupedReports[0].groupKey] = true;
      }

      return next;
    });
  }, [groupedReports]);

  useEffect(() => {
    if (!selectedReportId) return;
    const exists = filteredRows.some((row) => row.id === selectedReportId);
    if (!exists) setSelectedReportId('');
  }, [filteredRows, selectedReportId]);

  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.id === selectedReportId) || null,
    [filteredRows, selectedReportId],
  );

  const selectedGroup = useMemo(() => {
    if (!selectedReportId) return null;
    return groupedReports.find((group) =>
      group.reports.some((report) => report.id === selectedReportId),
    ) || null;
  }, [groupedReports, selectedReportId]);

  const canDeleteSelected = selectedRow ? isAdmin || selectedRow.state !== 'expired' : false;

  const stateFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'in_progress', label: 'En progreso' },
    { value: 'completed', label: 'Completados' },
    { value: 'expired', label: 'Vencidos' },
    { value: 'draft', label: 'Borradores' },
  ];

  const openPdf = async (template, instance) => {
    if (!template) return;
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

  const handleDelete = async ({ instanceId, isAdminAction }) => {
    if (!instanceId) return;
    const confirmMessage = isAdminAction
      ? 'Si eliminas este formulario, ya no se podrá recuperar. ¿Deseas continuar?'
      : '¿Deseas eliminar este formulario? Esta acción no se puede deshacer.';

    if (!window.confirm(confirmMessage)) return;

    const { error } = await supabase.from('monitoring_instances').delete().eq('id', instanceId);
    if (error) {
      console.error(error);
      alert('No se pudo eliminar el formulario. Inténtalo nuevamente.');
      return;
    }

    setInstances((prev) => prev.filter((item) => item.id !== instanceId));
  };

  const openReport = (row) => {
    if (!row) return;
    localStorage.setItem('monitoreoInstanceActive', row.id);
    localStorage.setItem('monitoreoTemplateSelected', row.templateId || '');
    navigate('/monitoreo/ficha-escritura');
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5">
        <SectionHeader
          eyebrow="Reportes"
          title="Reportes"
          description={
            isAdmin
              ? 'Consulta, revisa y exporta los reportes generados en el sistema.'
              : 'Consulta, revisa y exporta tus reportes.'
          }
          size="page"
        />

        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Total</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Activos</p>
            <p className="mt-1 text-xl font-semibold text-emerald-200">{summary.active}</p>
          </div>
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">En progreso</p>
            <p className="mt-1 text-xl font-semibold text-cyan-200">{summary.in_progress}</p>
          </div>
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Completados</p>
            <p className="mt-1 text-xl font-semibold text-indigo-200">{summary.completed}</p>
          </div>
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Vencidos</p>
            <p className="mt-1 text-xl font-semibold text-amber-200">{summary.expired}</p>
          </div>
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/45 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Borradores</p>
            <p className="mt-1 text-xl font-semibold text-slate-200">{summary.draft}</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_220px_auto] lg:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Buscar</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2">
              <Search size={14} className="text-slate-500" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Monitoreo o docente..."
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
            Mostrando: <span className="font-semibold text-slate-100">{filteredRows.length}</span>{' '}
            {pluralize(filteredRows.length, 'reporte', 'reportes')} en{' '}
            <span className="font-semibold text-slate-100">{groupedReports.length}</span>{' '}
            {pluralize(groupedReports.length, 'monitoreo', 'monitoreos')}
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
            Cargando reportes...
          </div>
        ) : reportRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
            Aún no hay reportes disponibles. Cuando finalices un monitoreo, aquí podrás ver los resultados.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
            No hay resultados con esos filtros.
          </div>
        ) : (
          <div className={`grid gap-4 ${selectedRow ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
            <div className="space-y-3">
              {groupedReports.map((group) => {
                const groupMeta = REPORT_STATE_META[group.groupState] || REPORT_STATE_META.active;
                const isExpanded = Boolean(expandedGroups[group.groupKey]);
                return (
                  <section key={group.groupKey} className="rounded-2xl border border-slate-800/70 bg-slate-900/45 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.groupKey)}
                      className="flex w-full items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <p title={group.templateTitle} className="max-w-[68ch] truncate text-sm font-semibold text-slate-100">
                          {truncateLabel(group.templateTitle, 74)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {group.rangeLabel} · {group.reports.length} {pluralize(group.reports.length, 'reporte', 'reportes')}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${groupMeta.className}`}>
                          {groupMeta.label}
                        </span>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/70 text-slate-300">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="mt-2.5 space-y-2.5">
                        {group.reports.map((row) => {
                          const stateMeta = REPORT_STATE_META[row.state] || REPORT_STATE_META.active;
                          const isSelected = row.id === selectedReportId;
                          return (
                            <article
                              key={row.id}
                              role="button"
                              tabIndex={0}
                              aria-pressed={isSelected}
                              onClick={() => setSelectedReportId(row.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedReportId(row.id);
                                }
                              }}
                              className={`cursor-pointer rounded-xl border px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                                isSelected
                                  ? 'border-cyan-400/50 bg-cyan-500/10'
                                  : 'border-slate-800/70 bg-slate-950/30 hover:border-cyan-400/35'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-slate-100">
                                  {truncateLabel(row.docente, 52)}
                                </p>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateMeta.className}`}>
                                  {stateMeta.label}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-400">
                                Actualizado: {row.updatedLabel}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                Haz clic para ver el detalle del reporte.
                              </p>

                              <div className="mt-2.5 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openReport(row);
                                  }}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60"
                                >
                                  <Eye size={13} />
                                  Ver
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openPdf(row.template, row.instance);
                                  }}
                                  disabled={pdfLoadingId === row.id || !row.template}
                                  className="inline-flex items-center gap-2 rounded-full border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-400/70 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {pdfLoadingId === row.id ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Download size={13} />
                                  )}
                                  {pdfLoadingId === row.id ? 'Generando...' : 'PDF'}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            {selectedRow ? (
              <aside className="rounded-2xl border border-slate-800/70 bg-slate-900/45 px-4 py-4 xl:sticky xl:top-4 xl:h-fit">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Detalle del reporte</p>
                      <p title={selectedRow.templateTitle} className="text-base font-semibold text-slate-100">
                        {truncateLabel(selectedRow.templateTitle, 74)}
                      </p>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${REPORT_STATE_META[selectedRow.state]?.className || REPORT_STATE_META.active.className}`}>
                        {REPORT_STATE_META[selectedRow.state]?.label || 'Activo'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedReportId('')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/70 text-slate-300 transition hover:border-slate-500"
                      aria-label="Cerrar detalle"
                      title="Cerrar detalle"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300">
                    <p className="flex items-center gap-2">
                      <UserRound size={13} className="text-slate-400" />
                      Docente: <span className="font-medium text-slate-100">{selectedRow.docente}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <CalendarDays size={13} className="text-slate-400" />
                      Rango: <span className="font-medium text-slate-100">{selectedRow.rangeLabel}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <FileText size={13} className="text-slate-400" />
                      Actualizado: <span className="font-medium text-slate-100">{selectedRow.updatedLabel}</span>
                    </p>
                    <p className="text-slate-400">
                      Este monitoreo tiene{' '}
                      <span className="font-medium text-slate-100">{selectedGroup?.reports?.length || 1}</span>{' '}
                      {pluralize(selectedGroup?.reports?.length || 1, 'reporte', 'reportes')}.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openReport(selectedRow)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60"
                    >
                      <Eye size={13} />
                      Ver / Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => openPdf(selectedRow.template, selectedRow.instance)}
                      disabled={pdfLoadingId === selectedRow.id || !selectedRow.template}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-400/70 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pdfLoadingId === selectedRow.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      Descargar PDF
                    </button>
                  </div>

                  <div className="border-t border-slate-800/70 pt-3">
                    <button
                      type="button"
                      onClick={() => handleDelete({ instanceId: selectedRow.id, isAdminAction: isAdmin })}
                      disabled={!canDeleteSelected}
                      title={!canDeleteSelected ? 'Monitoreo vencido: solo administrador puede eliminar.' : undefined}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        canDeleteSelected
                          ? 'border-rose-500/30 text-rose-200 hover:border-rose-400/60'
                          : 'cursor-not-allowed border-slate-700/70 text-slate-500'
                      }`}
                    >
                      <Trash2 size={13} />
                      Eliminar
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
