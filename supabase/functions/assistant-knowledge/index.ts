import { serve } from 'https://deno.land/std@0.204.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');

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
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !userId) return false;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=role,status&id=eq.${userId}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok) return false;
  const data = await response.json();
  const profile = Array.isArray(data) ? data[0] : null;
  return profile?.role === 'admin' && profile?.status === 'active';
};

const fetchLog = async (logId) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/assistant_logs?select=id,message,role&` +
      `id=eq.${logId}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data) ? data[0] : null;
};

const markApproved = async (logId) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/assistant_logs?id=eq.${logId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ approved: true }),
  });
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const rawBody = await request.text();
    if (!rawBody) return jsonResponse({ error: 'Payload requerido.' }, 400);
    const payload = JSON.parse(rawBody);

    const authUser = await fetchAuthUser(request);
    if (!authUser?.id) return jsonResponse({ error: 'Debes iniciar sesion.' }, 401);
    const isAdmin = await isAdminUser(authUser.id);
    if (!isAdmin) return jsonResponse({ error: 'Solo admin.' }, 403);

    const logId = payload?.log_id;
    const title = (payload?.title || 'Conocimiento aprobado').trim();
    if (!logId) return jsonResponse({ error: 'log_id requerido.' }, 400);

    const log = await fetchLog(logId);
    if (!log) return jsonResponse({ error: 'Registro no encontrado.' }, 404);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/assistant-docs`, {
      method: 'POST',
      headers: {
        apikey: request.headers.get('apikey') || SUPABASE_ANON_KEY || '',
        Authorization: request.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'ingest',
        title,
        text: log.message,
      }),
    });

    if (!response.ok) {
      const textError = await response.text();
      return jsonResponse({ error: textError || 'No se pudo convertir.' }, 500);
    }

    await markApproved(logId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
