import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') || '';
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

  const docType = String(payload.doc_type || '').toUpperCase();
  const docNumber = String(payload.doc_number || '').trim();
  if (!docNumber) return jsonResponse(400, { error: 'Documento requerido.' });

  const { data, error } = await adminClient
    .from('profiles')
    .select('email,status')
    .eq('doc_type', docType)
    .eq('doc_number', docNumber)
    .single();

  if (error || !data) {
    return jsonResponse(200, { email: null });
  }
  if (data.status !== 'active') {
    return jsonResponse(200, { email: null });
  }

  return jsonResponse(200, { email: data.email });
});
