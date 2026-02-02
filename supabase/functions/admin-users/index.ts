import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const buildFullName = (firstName?: string, lastName?: string) => `${firstName || ''} ${lastName || ''}`.trim();

const getEnv = () => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
  return { url, anonKey, serviceRoleKey };
};

const getBearerToken = (req: Request) => {
  const raw = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  return raw.slice(7).trim();
};

const ensureAdmin = async (
  req: Request,
  adminClient: ReturnType<typeof createClient>,
) => {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Falta token de sesion.' };

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return { ok: false, status: 401, error: 'Token invalido o vencido.' };
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role,status')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, error: profileError.message };
  }

  if (!profile || profile.status !== 'active' || profile.role !== 'admin') {
    return { ok: false, status: 403, error: 'Solo administradores pueden usar este modulo.' };
  }

  return { ok: true, userId: userData.user.id };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Metodo no permitido.' });
  }

  const { url, serviceRoleKey } = getEnv();
  if (!url || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const adminClient = createClient(url, serviceRoleKey);

  const adminCheck = await ensureAdmin(req, adminClient);
  if (!adminCheck.ok) {
    return jsonResponse(adminCheck.status, { error: adminCheck.error });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Body invalido.' });
  }

  const action = String(payload.action || '');

  if (action === 'list') {
    const { data, error } = await adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return jsonResponse(500, { error: error.message });
    return jsonResponse(200, { data });
  }

  if (action === 'create') {
    const firstName = String(payload.first_name || '').trim();
    const lastName = String(payload.last_name || '').trim();
    const role = String(payload.role || 'user').trim();
    const status = String(payload.status || 'active').trim();
    const docType = String(payload.doc_type || '').trim();
    const docNumber = String(payload.doc_number || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');

    if (!firstName || !lastName || !email || !password) {
      return jsonResponse(400, { error: 'Nombres, apellidos, correo y contrasena son obligatorios.' });
    }

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        full_name: buildFullName(firstName, lastName),
        doc_type: docType,
        doc_number: docNumber,
      },
    });

    if (createError || !createData?.user?.id) {
      return jsonResponse(500, { error: createError?.message || 'No se pudo crear el usuario en Auth.' });
    }

    const profilePayload = {
      id: createData.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: buildFullName(firstName, lastName),
      role,
      status,
      doc_type: docType || null,
      doc_number: docNumber || null,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await adminClient.from('profiles').upsert(profilePayload, {
      onConflict: 'id',
    });

    if (profileError) {
      return jsonResponse(500, { error: profileError.message });
    }

    return jsonResponse(200, { data: profilePayload });
  }

  if (action === 'update') {
    const id = String(payload.id || '').trim();
    if (!id) return jsonResponse(400, { error: 'ID requerido.' });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.first_name !== undefined) updates.first_name = String(payload.first_name || '');
    if (payload.last_name !== undefined) updates.last_name = String(payload.last_name || '');
    if (payload.full_name !== undefined) updates.full_name = String(payload.full_name || '');
    if (payload.role !== undefined) updates.role = String(payload.role || 'user');
    if (payload.status !== undefined) updates.status = String(payload.status || 'active');
    if (payload.doc_type !== undefined) updates.doc_type = String(payload.doc_type || '');
    if (payload.doc_number !== undefined) updates.doc_number = String(payload.doc_number || '');
    const nextPassword = payload.password !== undefined ? String(payload.password || '') : '';

    const { error } = await adminClient.from('profiles').update(updates).eq('id', id);
    if (error) return jsonResponse(500, { error: error.message });

    if (payload.role !== undefined) {
      await adminClient.auth.admin.updateUserById(id, {
        app_metadata: { role: updates.role },
      });
    }

    if (nextPassword) {
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(id, {
        password: nextPassword,
      });
      if (passwordError) return jsonResponse(500, { error: passwordError.message });
    }

    if (payload.status !== undefined) {
      if (updates.status === 'disabled') {
        await adminClient.auth.admin.updateUserById(id, { ban_duration: '87600h' });
      } else {
        await adminClient.auth.admin.updateUserById(id, { ban_duration: 'none' });
      }
    }

    return jsonResponse(200, { success: true });
  }

  if (action === 'disable') {
    const id = String(payload.id || '').trim();
    if (!id) return jsonResponse(400, { error: 'ID requerido.' });

    const { error } = await adminClient
      .from('profiles')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return jsonResponse(500, { error: error.message });

    await adminClient.auth.admin.updateUserById(id, { ban_duration: '87600h' });
    return jsonResponse(200, { success: true });
  }

  return jsonResponse(400, { error: 'Accion no soportada.' });
});
