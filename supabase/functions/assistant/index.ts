import { serve } from 'https://deno.land/std@0.204.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = 'llama-3.1-8b-instant';
const SYSTEM_PROMPT = [
  'Te llamas Yoryi, eres el asistente virtual de AGEBRE para un sistema de monitoreos educativos.',
  'Responde en espanol claro, formal y breve, pensado para personas mayores.',
  'Formato obligatorio:',
  '1) Titulo corto en la primera linea (ej: "Monitoreos por vencer").',
  '2) Lista con guiones y prefijo simple: "- Item".',
  '3) Cada item en una linea separada (siempre con salto de linea).',
  '4) Si hay fechas, usa dd/mm/yyyy.',
  '5) Evita parrafos largos.',
  '6) No uses emojis innecesarios.',
  '7) Si no hay datos: "No se encontraron resultados."',
  '8) Nunca inventes nombres de monitoreos, fechas o documentos; usa solo datos del contexto disponible.',
].join(' ');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');


const CREATE_MONITORING_REGEX = /(crear|registrar|agregar|nuevo)\s+(monitoreo|monitoring)\s*[:\-]?\s*(.+)?/i;
const MONITORING_INTENT_REGEX = /(crear|registrar|agregar|nuevo).*monitoreo|monitoreo.*(crear|registrar|agregar|nuevo)/i;
const MONITORING_QUERY_REGEX = /\b(monitoreo|monitoreos|seguimiento|plantilla|plantillas)\b/i;
const MONITORING_STATUS_REGEX =
  /\b(cual|cuales|cuantos|lista|listar|mostrar|muestr|activos?|vigentes?|disponibles?|hoy|semana|vencid|programad|por vencer)\b/i;
const DOCS_QUERY_REGEX =
  /\b(documento|documentos|politica|politicas|norma|lineamiento|manual|directiva|archivo|pdf)\b/i;
const SYSTEM_CONTEXT_QUERY_REGEX =
  /\b(monitoreo|monitoreos|seguimiento|plantilla|plantillas|reporte|reportes|actividad|calendario|hoy|semana|vencid|por vencer|activo|vigente|docente|especialista|usuario|equipo|documento|documentos|politica|manual|directiva)\b/i;
const GREETING_REGEX =
  /\b(hola|buenos dias|buenas tardes|buenas noches|que tal|saludos|gracias)\b/i;

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const fetchAuthUser = async (request) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader,
    },
  });
  if (!response.ok) return null;
  return response.json();
};

const isAdminUser = async (userId) => {
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !serviceKey || !userId) return false;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=role,status&id=eq.${userId}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!response.ok) return false;
  const data = await response.json();
  const profile = Array.isArray(data) ? data[0] : null;
  return profile?.role === 'admin' && profile?.status === 'active';
};

const createDraftMonitoring = async (userId, title) => {
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !serviceKey) {
    return { error: 'Falta SERVICE_ROLE_KEY.' };
  }

  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const eventPayload = {
    id: eventId,
    title,
    event_type: 'monitoring',
    description: null,
    start_at: now,
    end_at: now,
    status: 'active',
    created_by: userId,
  };

  const templatePayload = {
    id: eventId,
    title,
    description: null,
    status: 'draft',
    levels_config: { type: 'standard', levels: [] },
    sections: [],
    availability: { status: 'active', startAt: now, endAt: now },
    created_by: userId,
  };

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const eventResponse = await fetch(`${SUPABASE_URL}/rest/v1/monitoring_events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(eventPayload),
  });
  if (!eventResponse.ok) {
    const text = await eventResponse.text();
    return { error: text || 'No se pudo crear el evento.' };
  }

  const templateResponse = await fetch(`${SUPABASE_URL}/rest/v1/monitoring_templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(templatePayload),
  });
  if (!templateResponse.ok) {
    const text = await templateResponse.text();
    return { error: text || 'No se pudo crear el borrador.' };
  }

  return { id: eventId, created_at: now };
};

const logChatMessages = async (userId, entries) => {
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !serviceKey || !entries?.length) return;

  const payload = entries.map((entry) => ({
    user_id: userId || null,
    role: entry.role,
    message: entry.message,
    source: 'chat',
  }));

  await fetch(`${SUPABASE_URL}/rest/v1/assistant_logs`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
};

const parseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date) return null;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateRange = (item) => {
  const start = formatDate(item?.start_at || item?.availability?.startAt);
  const end = formatDate(item?.end_at || item?.availability?.endAt);
  if (start && end) return `${start} a ${end}`;
  if (start) return `desde ${start}`;
  if (end) return `hasta ${end}`;
  return null;
};

const isMonitoringDataQuery = (message) => {
  const text = String(message || '').toLowerCase();
  return MONITORING_QUERY_REGEX.test(text) && MONITORING_STATUS_REGEX.test(text);
};

const shouldIncludeDocsContext = (message) => {
  const text = String(message || '').toLowerCase();
  if (MONITORING_QUERY_REGEX.test(text) && !DOCS_QUERY_REGEX.test(text)) return false;
  return true;
};

const shouldIncludeSystemContext = (message) => {
  const text = String(message || '').toLowerCase();
  return SYSTEM_CONTEXT_QUERY_REGEX.test(text);
};

const isGreetingMessage = (message) => {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return false;
  if (MONITORING_QUERY_REGEX.test(text) || DOCS_QUERY_REGEX.test(text)) return false;
  const shortText = text.split(/\s+/).length <= 6;
  return GREETING_REGEX.test(text) && shortText;
};

const buildMonitoringReply = (systemData) => {
  const intent = systemData?.intent || 'active';
  const titleByIntent = {
    today: 'Monitoreos de hoy',
    week: 'Monitoreos de la semana',
    overdue: 'Monitoreos vencidos',
    upcoming: 'Monitoreos por vencer',
    active: 'Monitoreos activos',
  };
  const title = titleByIntent[intent] || 'Monitoreos';
  const items = Array.isArray(systemData?.items) ? systemData.items : [];
  if (!items.length) return `${title}\n- No se encontraron resultados.`;

  const statusByValue = {
    active: 'Activo',
    scheduled: 'Programado',
    closed: 'Vencido',
  };

  const lines = items.slice(0, 5).map((item) => {
    const status =
      statusByValue[item?.timeline_status] ||
      statusByValue[item?.status] ||
      'Activo';
    const range = formatDateRange(item);
    if (range) return `- ${item.title} (${status}, ${range})`;
    return `- ${item.title} (${status})`;
  });

  const extra =
    items.length > 5 ? `\n- ... y ${items.length - 5} mas.` : '';
  return `${title}\n${lines.join('\n')}${extra}`;
};

const fetchSystemData = async (request, message) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const headers = {
      apikey: request.headers.get('apikey') || SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
    const authHeader = request.headers.get('authorization');
    if (authHeader) headers.Authorization = authHeader;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/assistant-data`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: message }),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
};

const fetchSystemContext = async (request, message) => {
  const data = await fetchSystemData(request, message);
  return data?.summary ? `Contexto del sistema:\n${data.summary}` : '';
};

const fetchDocsContext = async (request, message) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return '';
  try {
    const headers = {
      apikey: request.headers.get('apikey') || SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
    const authHeader = request.headers.get('authorization');
    if (authHeader) headers.Authorization = authHeader;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/assistant-docs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'search', query: message, matchCount: 5 }),
    });
    if (!response.ok) return '';
    const data = await response.json();
    return data?.summary ? `Contexto de documentos:\n${data.summary}` : '';
  } catch {
    return '';
  }
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Mensaje requerido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { message: rawBody };
    }

    const { message, history } = payload;
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Mensaje requerido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authUser = await fetchAuthUser(request);
    const createMatch = message.match(CREATE_MONITORING_REGEX);
    if (createMatch) {
      const title = (createMatch[3] || '').trim();
      if (!title) {
        return jsonResponse({
          reply: 'Crear monitoreo\n- [!] Falta el titulo.\n- [OK] Ejemplo: "Crear monitoreo: Evaluacion de lectura"',
        });
      }

      if (!authUser?.id) {
        return jsonResponse({
          reply: 'Permisos\n- [!] Debes iniciar sesion como administrador para crear monitoreos.',
        });
      }

      const admin = await isAdminUser(authUser.id);
      if (!admin) {
        return jsonResponse({
          reply: 'Permisos\n- [!] Solo un administrador puede crear monitoreos.',
        });
      }

      const created = await createDraftMonitoring(authUser.id, title);
      if (created?.error) {
        return jsonResponse({ reply: `No se pudo crear el monitoreo\n- [!] ${created.error}` }, 500);
      }

      return jsonResponse({
        reply: `Monitoreo creado\n- [OK] Titulo: ${title}\n- [OK] Estado: Borrador\n- [OK] Ruta: Elegir monitoreo > Ver borradores`,
      });
    }

    if (MONITORING_INTENT_REGEX.test(message)) {
      return jsonResponse({
        reply:
          'No se creo ningun monitoreo.\n- [!] Usa el formato exacto: "Crear monitoreo: Nombre del monitoreo".\n- [OK] Ejemplo: "Crear monitoreo: Evaluacion de lectura".',
      });
    }

    if (isMonitoringDataQuery(message)) {
      const systemData = await fetchSystemData(request, message);
      const reply = buildMonitoringReply(systemData);
      await logChatMessages(authUser?.id, [
        { role: 'user', message },
        { role: 'assistant', message: reply },
      ]);
      return jsonResponse({ reply });
    }

    if (isGreetingMessage(message)) {
      const reply =
        'Asistente AGEBRE\nHola, estoy listo para ayudarte.\nPuedes pedirme: monitoreos activos, por vencer, hoy o crear monitoreo.';
      await logChatMessages(authUser?.id, [
        { role: 'user', message },
        { role: 'assistant', message: reply },
      ]);
      return jsonResponse({ reply });
    }

    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Falta GROQ_API_KEY.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemContext = shouldIncludeSystemContext(message)
      ? await fetchSystemContext(request, message)
      : '';
    const docsContext = shouldIncludeDocsContext(message)
      ? await fetchDocsContext(request, message)
      : '';
    const combinedContext = [systemContext, docsContext].filter(Boolean).join('\n\n');
    const messages = Array.isArray(history) ? history : [];
    const chatMessages = [
      {
        role: 'system',
        content: combinedContext ? `${SYSTEM_PROMPT}\n\n${combinedContext}` : SYSTEM_PROMPT,
      },
      ...messages.map((item) => ({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.text,
      })),
      { role: 'user', content: message },
    ];

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: chatMessages,
          temperature: 0.7,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: text }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const candidate = data?.choices?.[0]?.message?.content || '';

    await logChatMessages(authUser?.id, [
      { role: 'user', message },
      { role: 'assistant', message: candidate || 'Sin respuesta.' },
    ]);

    return new Response(JSON.stringify({ reply: candidate }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
