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
const JINA_API_KEY = Deno.env.get('JINA_API_KEY');
const EMBEDDING_MODEL = 'jina-embeddings-v2-base-en';

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

const splitText = (text, chunkSize = 900, overlap = 120) => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
};

const embedText = async (text) => {
  if (!JINA_API_KEY) {
    return { error: 'Falta JINA_API_KEY para embeddings.' };
  }
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: [text],
    }),
  });
  if (!response.ok) {
    const textError = await response.text();
    return { error: textError || 'No se pudo generar embedding.' };
  }
  const data = await response.json();
  return { embedding: data?.data?.[0]?.embedding || [] };
};

const createDocument = async (payload) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { error: 'Falta SERVICE_ROLE_KEY.' };
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/doc_documents`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const textError = await response.text();
    return { error: textError || 'No se pudo crear el documento.' };
  }
  const data = await response.json();
  const doc = Array.isArray(data) ? data[0] : data;
  return { doc };
};

const insertChunks = async (payloads) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { error: 'Falta SERVICE_ROLE_KEY.' };
  }
  if (!payloads.length) return { inserted: 0 };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/doc_chunks`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloads),
  });
  if (!response.ok) {
    const textError = await response.text();
    return { error: textError || 'No se pudieron guardar los chunks.' };
  }
  return { inserted: payloads.length };
};

const searchChunks = async (request, query, matchCount = 5) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { items: [] };
  const { embedding, error } = await embedText(query);
  if (error) return { error };

  const headers = {
    apikey: request.headers.get('apikey') || SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  const authHeader = request.headers.get('authorization');
  if (authHeader) headers.Authorization = authHeader;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_doc_chunks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: matchCount,
      min_similarity: 0.15,
    }),
  });

  if (!response.ok) {
    const textError = await response.text();
    return { error: textError };
  }
  const items = await response.json();
  return { items: Array.isArray(items) ? items : [] };
};

const buildSummary = async (items) => {
  if (!items.length || !SUPABASE_URL || !SERVICE_ROLE_KEY) return '';
  const docIds = Array.from(new Set(items.map((item) => item.doc_id))).filter(Boolean);
  if (!docIds.length) return '';

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/doc_documents?select=id,title,source_path&` +
      docIds.map((id) => `id=in.(${id})`).join('&'),
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  const docs = response.ok ? await response.json() : [];
  const docsById = new Map((docs || []).map((doc) => [doc.id, doc]));
  const lines = items.slice(0, 5).map((item) => {
    const doc = docsById.get(item.doc_id);
    const page = item?.metadata?.page ? ` p.${item.metadata.page}` : '';
    return `- ${doc?.title || 'Documento'}${page}: ${item.content.slice(0, 140)}...`;
  });
  return lines.join('\n');
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return jsonResponse({ error: 'Payload requerido.' }, 400);
    }
    const payload = JSON.parse(rawBody);
    const action = payload?.action || 'search';

    if (action === 'ingest') {
      const authUser = await fetchAuthUser(request);
      if (!authUser?.id) {
        return jsonResponse({ error: 'Debes iniciar sesion.' }, 401);
      }
      const admin = await isAdminUser(authUser.id);
      if (!admin) {
        return jsonResponse({ error: 'Solo administradores pueden cargar documentos.' }, 403);
      }

      const title = (payload?.title || '').trim();
      const text = (payload?.text || '').trim();
      if (!title || !text) {
        return jsonResponse({ error: 'Faltan campos: title y text.' }, 400);
      }

      const { doc, error: docError } = await createDocument({
        title,
        source_path: payload?.sourcePath || null,
        mime_type: payload?.mimeType || null,
        tags: payload?.tags || null,
        created_by: authUser.id,
      });
      if (docError) return jsonResponse({ error: docError }, 500);

      const chunks = splitText(text, payload?.chunkSize || 900, payload?.overlap || 120);
      if (!chunks.length) return jsonResponse({ error: 'No se encontraron contenidos.' }, 400);

      const chunkPayloads = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const content = chunks[index];
        const { embedding, error: embedError } = await embedText(content);
        if (embedError) return jsonResponse({ error: embedError }, 500);
        chunkPayloads.push({
          doc_id: doc.id,
          chunk_index: index,
          content,
          embedding,
          metadata: payload?.metadata || null,
        });
      }

      const { error: chunkError, inserted } = await insertChunks(chunkPayloads);
      if (chunkError) return jsonResponse({ error: chunkError }, 500);

      return jsonResponse({
        ok: true,
        doc_id: doc.id,
        chunks: inserted,
      });
    }

    const query = (payload?.query || '').trim();
    if (!query) return jsonResponse({ summary: '', items: [] });

    const { items, error: searchError } = await searchChunks(request, query, payload?.matchCount || 5);
    if (searchError) return jsonResponse({ error: searchError }, 500);
    const summary = await buildSummary(items);
    return jsonResponse({ summary, items });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});
