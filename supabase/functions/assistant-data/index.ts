import { serve } from 'https://deno.land/std@0.204.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const ONE_WEEK_DAYS = 7;

const startOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (value) => {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
};

const addDays = (value, amount) => {
  const d = new Date(value);
  d.setDate(d.getDate() + amount);
  return d;
};

const sortByDateAsc = (items, getDate) =>
  [...items].sort((left, right) => {
    const leftDate = parseDate(getDate(left));
    const rightDate = parseDate(getDate(right));
    if (!leftDate && !rightDate) return 0;
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    return leftDate.getTime() - rightDate.getTime();
  });

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

const formatRange = (availability = {}) => {
  const start = formatDate(availability.startAt);
  const end = formatDate(availability.endAt);
  if (start && end) return `${start} a ${end}`;
  if (start) return `desde ${start}`;
  if (end) return `hasta ${end}`;
  return null;
};

const resolveTemplateStatus = (template, now = new Date()) => {
  const availability = template?.availability || {};
  const status = availability.status || 'active';
  const startAt = parseDate(availability.startAt);
  const endAt = parseDate(availability.endAt);

  if (status === 'closed') return 'closed';
  if (status === 'scheduled') return 'scheduled';
  if (startAt && now < startAt) return 'scheduled';
  if (endAt && now > endAt) return 'closed';
  if (status === 'active') return 'active';
  return startAt || endAt ? 'scheduled' : 'active';
};

const hasOverlap = (startAt, endAt, rangeStart, rangeEnd) => {
  const start = parseDate(startAt);
  const end = parseDate(endAt);
  if (!start && !end) return false;
  const normalizedStart = start || end;
  const normalizedEnd = end || start;
  return normalizedStart <= rangeEnd && normalizedEnd >= rangeStart;
};

const detectIntent = (query) => {
  const text = (query || '').toLowerCase();
  if (text.includes('hoy')) return 'today';
  if (text.includes('semana')) return 'week';
  if (text.includes('vencid')) return 'overdue';
  if (text.includes('por vencer') || text.includes('proximo')) return 'upcoming';
  if (text.includes('activ')) return 'active';
  return 'active';
};

const buildSummary = (intent, items) => {
  if (!items.length) return 'No se encontraron resultados.';
  const title = {
    today: 'Monitoreos de hoy',
    week: 'Monitoreos de la semana',
    overdue: 'Monitoreos vencidos',
    upcoming: 'Monitoreos por vencer',
    active: 'Monitoreos activos',
  }[intent];

  const statusLabel = {
    active: 'Activo',
    scheduled: 'Programado',
    closed: 'Vencido',
  };

  const lines = items.slice(0, 5).map((item) => {
    const range = formatRange(item.availability);
    const status = statusLabel[item.timeline_status] || 'Activo';
    if (range) return `- ${item.title} (${status}, ${range})`;
    return `- ${item.title} (${status})`;
  });
  const extra = items.length > 5 ? `\n... y ${items.length - 5} mas.` : '';
  return `${title}\n${lines.join('\n')}${extra}`;
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: 'Falta SUPABASE_URL o SUPABASE_ANON_KEY.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await request.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const query = payload.query || payload.message || '';
    const intent = detectIntent(query);

    const now = new Date();
    const params = new URLSearchParams();
    params.set('select', 'id,title,status,availability,created_by,updated_at');
    params.set('status', 'eq.published');
    params.set('order', 'updated_at.desc');

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
    const authHeader = request.headers.get('authorization');
    if (authHeader) headers.Authorization = authHeader;

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/monitoring_templates?${params.toString()}`,
      { headers },
    );

    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: text }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const templatesRaw = await response.json();
    const templates = Array.isArray(templatesRaw) ? templatesRaw : [];
    const normalized = templates.map((template) => {
      const timelineStatus = resolveTemplateStatus(template, now);
      const availability = template?.availability || {};
      return {
        id: template.id,
        title: template.title || 'Monitoreo sin titulo',
        status: template.status || 'published',
        timeline_status: timelineStatus,
        availability,
        start_at: availability.startAt || null,
        end_at: availability.endAt || null,
        created_by: template.created_by || null,
      };
    });

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekEnd = endOfDay(addDays(now, ONE_WEEK_DAYS - 1));

    const filtered = normalized.filter((item) => {
      if (intent === 'today') {
        return hasOverlap(item.start_at, item.end_at, todayStart, todayEnd);
      }
      if (intent === 'week') {
        return hasOverlap(item.start_at, item.end_at, todayStart, weekEnd);
      }
      if (intent === 'overdue') {
        const end = parseDate(item.end_at);
        return item.timeline_status === 'closed' || (!!end && end < now);
      }
      if (intent === 'upcoming') {
        const end = parseDate(item.end_at);
        return item.timeline_status === 'active' && !!end && end >= now;
      }
      return item.timeline_status === 'active';
    });

    let items = filtered;
    if (intent === 'upcoming') {
      items = sortByDateAsc(filtered, (item) => item.end_at);
    } else if (intent === 'overdue') {
      items = sortByDateAsc(filtered, (item) => item.end_at);
    } else if (intent === 'today' || intent === 'week') {
      items = sortByDateAsc(filtered, (item) => item.start_at || item.end_at);
    }

    const summary = buildSummary(intent, items);

    return new Response(JSON.stringify({ intent, summary, items }), {
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
