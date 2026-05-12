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
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeStatus = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeDocComparable = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
const isActiveStatus = (value: unknown) => {
  const status = normalizeStatus(value);
  return status === 'active' || status === 'activo';
};
const isEmailConfirmedAuthUser = (user: Record<string, unknown> | null | undefined) => {
  const raw = String(user?.email_confirmed_at || '').trim();
  if (!raw) return false;
  const parsed = new Date(raw);
  return !Number.isNaN(parsed.valueOf());
};
const isLoginCapableAuthUser = (user: Record<string, unknown> | null | undefined) => {
  if (!isEmailConfirmedAuthUser(user)) return false;
  const bannedUntilRaw = String(user?.banned_until || '').trim();
  if (!bannedUntilRaw) return true;
  const parsed = new Date(bannedUntilRaw);
  if (Number.isNaN(parsed.valueOf())) return true;
  return parsed.valueOf() <= Date.now();
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

const findAuthEmailsByDocument = async (
  adminClient: ReturnType<typeof createClient>,
  docType: string,
  docNumber: string,
) => {
  const targetDoc = normalizeDocComparable(docNumber);
  if (!targetDoc) return [];

  const matches = new Set<string>();
  let page = 1;

  while (page <= 100) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;

    const users = data?.users || [];
    for (const user of users) {
      const meta = (user?.user_metadata || {}) as Record<string, unknown>;
      const metaDoc = normalizeDocComparable(meta?.doc_number);
      if (!metaDoc || metaDoc !== targetDoc) continue;

      const metaDocType = normalizeDocType(meta?.doc_type);
      if (docType && metaDocType && docType !== metaDocType) continue;
      if (!isLoginCapableAuthUser(user as unknown as Record<string, unknown>)) continue;

      const email = String(user?.email || '').trim().toLowerCase();
      if (email) matches.add(email);
    }

    if (users.length < 200) break;
    page += 1;
  }

  return Array.from(matches);
};

const findAuthUserByEmail = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
) => {
  const target = normalizeEmail(email);
  if (!target) return null;

  let page = 1;
  while (page <= 100) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;

    const users = data?.users || [];
    const found = users.find((user) => normalizeEmail(user?.email) === target) || null;
    if (found) return found as unknown as Record<string, unknown>;

    if (users.length < 200) break;
    page += 1;
  }

  return null;
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

  const email = normalizeEmail(payload.email);
  if (email) {
    const { data, error } = await adminClient
      .from('profiles')
      .select('email,status')
      .ilike('email', email)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) {
      return jsonResponse(500, { error: error.message || 'No se pudo consultar perfiles.' });
    }

    const rows = Array.isArray(data) ? data : [];
    const activeProfile = rows.find((row) => isActiveStatus(row?.status));
    if (!activeProfile) {
      return jsonResponse(200, {
        email: null,
        error: 'No existe un usuario activo con ese correo en el sistema.',
      });
    }

    const authUser = await findAuthUserByEmail(adminClient, email);
    if (!authUser) {
      return jsonResponse(200, {
        email: null,
        error: 'El correo existe en perfiles, pero no tiene cuenta de acceso. Contacta a un administrador.',
      });
    }

    const bannedUntilRaw = String(authUser?.banned_until || '').trim();
    if (bannedUntilRaw) {
      const bannedUntil = new Date(bannedUntilRaw);
      if (!Number.isNaN(bannedUntil.valueOf()) && bannedUntil.valueOf() > Date.now()) {
        return jsonResponse(200, {
          email: null,
          error: 'La cuenta esta bloqueada temporalmente. Contacta a un administrador.',
        });
      }
    }

    return jsonResponse(200, { email });
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
    const authMatches = await findAuthEmailsByDocument(adminClient, docType, docNumber);
    if (authMatches.length === 1) {
      resolved = { email: authMatches[0], reason: 'ok' as const };
    } else if (authMatches.length > 1) {
      resolved = { email: null, reason: 'ambiguous' as const };
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
