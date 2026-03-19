import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

const normalizeDocType = (value: unknown) => String(value || '').trim().toUpperCase();
const normalizeDocNumber = (value: unknown) => String(value || '').trim();
const normalizeStatus = (value: unknown) => String(value || '').trim().toLowerCase();
const isActiveStatus = (value: unknown) => {
  const status = normalizeStatus(value);
  return status === 'active' || status === 'activo';
};

const pickSingleActiveEmail = (rows: Array<Record<string, unknown>>) => {
  const activeRows = (rows || []).filter((row) => isActiveStatus(row?.status));
  if (!activeRows.length) return { email: null, reason: 'inactive' as const };

  const uniqueEmails = Array.from(
    new Set(
      activeRows
        .map((row) => String(row?.email || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (uniqueEmails.length === 1) {
    return { email: uniqueEmails[0], reason: 'ok' as const };
  }

  // Ambiguous: same DNI linked to multiple active emails.
  return { email: null, reason: 'ambiguous' as const };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
  if (!url || !serviceKey) {
    return jsonResponse(500, { error: 'Service role no configurado.' });
  }

  const adminClient = createClient(url, serviceKey);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const docType = normalizeDocType(payload.doc_type);
  const docNumber = normalizeDocNumber(payload.doc_number);
  if (!docNumber) return jsonResponse(400, { error: 'Documento requerido.' });

  const { data, error } = await adminClient
    .from('profiles')
    .select('email,status,updated_at,created_at')
    .ilike('doc_type', docType)
    .eq('doc_number', docNumber)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) {
    return jsonResponse(500, { error: error.message || 'No se pudo consultar perfiles.' });
  }

  const rows = Array.isArray(data) ? data : [];
  let resolved = pickSingleActiveEmail(rows);

  // Fallback: if doc_type is inconsistent in data, try by doc_number only.
  if (!resolved.email && rows.length === 0) {
    const fallback = await adminClient
      .from('profiles')
      .select('email,status,updated_at,created_at')
      .eq('doc_number', docNumber)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!fallback.error) {
      const fallbackRows = Array.isArray(fallback.data) ? fallback.data : [];
      resolved = pickSingleActiveEmail(fallbackRows);
    }
  }

  if (!resolved.email) {
    if (resolved.reason === 'ambiguous') {
      return jsonResponse(200, {
        email: null,
        error: 'Documento asociado a más de un usuario activo. Contacta a un administrador.',
      });
    }
    return jsonResponse(200, { email: null });
  }

  return jsonResponse(200, { email: resolved.email });
});
