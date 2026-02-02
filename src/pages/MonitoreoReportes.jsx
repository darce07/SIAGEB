import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, Loader2 } from 'lucide-react';
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

const formatRange = (template) => {
  const startAt = template?.availability?.startAt ? new Date(template.availability.startAt) : null;
  const endAt = template?.availability?.endAt ? new Date(template.availability.endAt) : null;
  if (!startAt && !endAt) return 'Sin rango definido';
  const startLabel = startAt ? startAt.toLocaleString() : 'Sin inicio';
  const endLabel = endAt ? endAt.toLocaleString() : 'Sin cierre';
  return `${startLabel} → ${endLabel}`;
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

const buildPdf = (template, instance, statusLabel) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const data = instance?.data || {};
  const header = data.header || {};
  const general = data.general || {};
  const cierre = data.cierre || {};
  const firmas = data.firmas || {};
  const questions = data.questions || {};
  const sections = template?.sections || [];
  const levels = template?.levelsConfig?.levels || [];

  const marginX = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(template?.title || 'Monitoreo', marginX, 18);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Ficha de monitoreo', marginX, 26);
  doc.setDrawColor(200);
  doc.line(marginX, 30, pageWidth - marginX, 30);

  const sessionId = data?.meta?.sessionId || instance?.id || '-';
  const createdAt = instance?.created_at ? new Date(instance.created_at).toLocaleString() : '-';
  const updatedAt = instance?.updated_at ? new Date(instance.updated_at).toLocaleString() : '-';
  const specialist = instance?.created_by || '-';

  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Código/ID: ${sessionId}`, marginX, 36);
  doc.text(`Estado: ${statusLabel || '-'}`, marginX, 41);
  doc.text(`Especialista: ${specialist}`, marginX, 46);
  doc.text(`Fecha de emisión: ${updatedAt}`, marginX, 51);
  doc.text(`Creado: ${createdAt}`, marginX, 56);
  doc.setTextColor(20);

  autoTable(doc, {
    startY: 64,
    head: [['Datos de identificación', '']],
    body: [
      ['Institución Educativa', header.institucion || '-'],
      ['Lugar', header.lugarIe || '-'],
      ['Director(a)/Monitor(a)', header.director || '-'],
      ['Docente monitoreado', header.docente || '-'],
      ['Condición', header.condicion || '-'],
      ['Área', header.area || '-'],
    ],
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: maxWidth - 60 } },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Nivel', 'Descripción']],
    body:
      levels.length > 0
        ? levels.map((level, index) => [
            level.label || `Nivel ${index + 1}`,
            level.description || '-',
          ])
        : [['-', 'Sin configuración de niveles.']],
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: maxWidth - 40 } },
  });

  sections.forEach((section) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(section.title, marginX, doc.lastAutoTable.finalY + 10);
    doc.setFont('helvetica', 'normal');

    const rows = (section.questions || []).map((question) => {
      const answer = questions[question.id];
      const isYes = answer?.answer === 'SI';
      return [
        question.text,
        answer?.answer || '-',
        isYes ? answer?.level || '-' : 'No aplica / No observado',
        isYes ? answer?.obs || '-' : 'No aplica / No observado',
      ];
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [['Pregunta', 'Sí/No', 'Nivel', 'Observación']],
      body: rows.length ? rows : [['-', '-', '-', '-']],
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 18 },
        2: { cellWidth: 30 },
        3: { cellWidth: maxWidth - 120 },
      },
    });
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Sección general', '']],
    body: [
      ['Observación general', general.observacion || '-'],
      ['Resumen del monitoreo', general.resumen || '-'],
      ['Compromiso', general.compromiso || '-'],
    ],
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: maxWidth - 60 } },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Firmas', '']],
    body: [
      ['Docente monitoreado', `${firmas?.docente?.nombre || '-'} (${firmas?.docente?.dni || '-'})`],
      ['Monitor', `${firmas?.monitor?.nombre || '-'} (${firmas?.monitor?.dni || '-'})`],
    ],
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: maxWidth - 60 } },
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${totalPages}`, marginX, pageHeight - 8);
    doc.text('Generado por EduMonitor', pageWidth - marginX, pageHeight - 8, { align: 'right' });
    doc.setTextColor(20);
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

  useEffect(() => {
    const fetchData = async () => {
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
    };
    fetchData();
  }, [isAdmin, userId]);

  const visibleReports = instances;

  const groupedByTemplate = visibleReports.reduce((acc, instance) => {
    const key = instance.template_id || 'sin-template';
    if (!acc[key]) acc[key] = [];
    acc[key].push(instance);
    return acc;
  }, {});

  const publishedTemplates = templates.filter((template) => template.status === 'published');
  const activeTemplates = publishedTemplates.filter((template) => getTemplateStatus(template) === 'active');
  const closedTemplates = publishedTemplates.filter((template) => getTemplateStatus(template) === 'closed');

  const openPdf = async (template, instance) => {
    if (!template) return;
    const status = getTemplateStatus(template) === 'closed' ? 'Vencido' : 'Activo';
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

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-6">
        <SectionHeader
          eyebrow="Reportes"
          title="Reportes y resultados"
          description={
            isAdmin
              ? 'Consulta los reportes generados por todo el sistema.'
              : 'Consulta los reportes generados por tus monitoreos.'
          }
        />
        {visibleReports.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-6 text-sm text-slate-400">
            Aún no hay reportes disponibles. Cuando finalices un monitoreo, aquí podrás ver los resultados.
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Monitoreos activos</p>
              {activeTemplates.length === 0 ? (
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4 text-sm text-slate-400">
                  No hay monitoreos activos en este momento.
                </div>
              ) : (
                activeTemplates.map((template) => {
                    const items = groupedByTemplate[template.id] || [];
                    return (
                    <div key={template.id} className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{template.title}</p>
                          <p className="text-xs text-slate-500">{formatRange(template)}</p>
                        </div>
                        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                          Activo
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {items.length === 0 ? (
                          <p className="text-xs text-slate-400">Sin formularios todavía.</p>
                        ) : (
                          items.map((instance) => {
                            const docente = instance.data?.header?.docente || 'Sin docente';
                            const updatedAt = instance.updated_at
                              ? new Date(instance.updated_at).toLocaleString()
                              : '';
                            const canDelete = true;
                            return (
                              <div
                                key={instance.id}
                                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-sm"
                              >
                                <div>
                                  <p className="text-sm text-slate-100">Docente: {docente}</p>
                                  <p className="text-xs text-slate-500">
                                    {updatedAt ? `Actualizado: ${updatedAt}` : 'En progreso'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {instance.status === 'completed' ? (
                                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                      Completado
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                      En progreso
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      localStorage.setItem('monitoreoInstanceActive', instance.id);
                                      localStorage.setItem('monitoreoTemplateSelected', instance.template_id);
                                      navigate('/monitoreo/ficha-escritura');
                                    }}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                                  >
                                    <Eye size={14} />
                                    Ver / Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPdf(template, instance)}
                                    disabled={pdfLoadingId === instance.id}
                                    className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:border-rose-400/70 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {pdfLoadingId === instance.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                    {pdfLoadingId === instance.id ? 'Generando...' : 'Descargar PDF'}
                                  </button>
                                  {canDelete ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDelete({ instanceId: instance.id, isAdminAction: isAdmin })
                                      }
                                      className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/60"
                                    >
                                      Eliminar
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Monitoreos vencidos</p>
              {closedTemplates.length === 0 ? (
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4 text-sm text-slate-400">
                  No hay monitoreos vencidos.
                </div>
              ) : (
                closedTemplates.map((template) => {
                  const items = groupedByTemplate[template.id] || [];
                  return (
                    <div key={template.id} className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{template.title}</p>
                          <p className="text-xs text-slate-500">{formatRange(template)}</p>
                          <p className="text-xs text-slate-400">Total realizados: {items.length}</p>
                        </div>
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                          Vencido
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {items.length === 0 ? (
                          <p className="text-xs text-slate-400">Sin formularios registrados.</p>
                        ) : (
                          items.map((instance) => {
                            const docente = instance.data?.header?.docente || 'Sin docente';
                            const updatedAt = instance.updated_at
                              ? new Date(instance.updated_at).toLocaleString()
                              : '';
                            const canDelete = isAdmin;
                            return (
                              <div
                                key={instance.id}
                                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-sm"
                              >
                                <div>
                                  <p className="text-sm text-slate-100">Docente: {docente}</p>
                                  <p className="text-xs text-slate-500">
                                    {updatedAt ? `Actualizado: ${updatedAt}` : 'En progreso'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      localStorage.setItem('monitoreoInstanceActive', instance.id);
                                      localStorage.setItem('monitoreoTemplateSelected', instance.template_id);
                                      navigate('/monitoreo/ficha-escritura');
                                    }}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
                                  >
                                    Ver
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPdf(template, instance)}
                                    disabled={pdfLoadingId === instance.id}
                                    className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:border-rose-400/70 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {pdfLoadingId === instance.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                    {pdfLoadingId === instance.id ? 'Generando...' : 'Descargar PDF'}
                                  </button>
                                  {canDelete ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDelete({ instanceId: instance.id, isAdminAction: true })
                                      }
                                      className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/60"
                                    >
                                      Eliminar
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled
                                      title="Monitoreo cerrado: no puedes eliminar formularios."
                                      className="inline-flex items-center gap-2 rounded-full border border-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-500"
                                    >
                                      Eliminar
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
