import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const buildFullName = (firstName?: string, lastName?: string) => `${firstName || ''} ${lastName || ''}`.trim();
const normalizeRole = (value: unknown) => String(value || 'user').trim().toLowerCase();
const normalizeStatus = (value: unknown) => String(value || 'active').trim().toLowerCase();
const normalizeDocType = (value: unknown) => String(value || '').trim().toUpperCase();
const normalizeDocNumber = (docType: string, value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (docType === 'DNI' || docType === 'CE') return raw.replace(/\D/g, '');
  return raw;
};
const normalizeComparableDoc = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const getEnv = () => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
  return { url, anonKey, serviceRoleKey };
};

const getBearerToken = (req: Request) => {
  const raw =
    req.headers.get('x-client-authorization') ||
    req.headers.get('X-Client-Authorization') ||
    req.headers.get('Authorization') ||
    req.headers.get('authorization') ||
    '';
  if (!raw) return '';

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const value of values) {
    if (!value.toLowerCase().startsWith('bearer ')) continue;
    const token = value.slice(7).trim().replace(/^"+|"+$/g, '');
    if (token.split('.').length === 3) return token;
  }

  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  const fallback = raw.slice(7).trim().replace(/^"+|"+$/g, '');
  return fallback.split(',')[0]?.trim() || '';
};

const getBodyToken = (payload: Record<string, unknown>) => {
  const raw = String(payload.access_token || '').trim().replace(/^"+|"+$/g, '');
  return raw.split('.').length === 3 ? raw : '';
};

const isActiveAdminProfile = (profile: { role?: string | null; status?: string | null } | null | undefined) =>
  profile?.role === 'admin' && profile?.status === 'active';

const countActiveAdmins = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('status', 'active');

  if (error) return { count: 0, error };
  return { count: (data || []).length, error: null };
};

const getProfileById = async (adminClient: ReturnType<typeof createClient>, id: string) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,role,status,doc_type,doc_number')
    .eq('id', id)
    .maybeSingle();

  return { data, error };
};

const hasConflictingActiveDocument = async (
  adminClient: ReturnType<typeof createClient>,
  params: { idToExclude?: string; docType: string; docNumber: string },
) => {
  const target = normalizeComparableDoc(params.docNumber);
  if (!target) return { exists: false, error: null };

  let query = adminClient
    .from('profiles')
    .select('id,doc_number,status')
    .eq('doc_type', params.docType)
    .eq('status', 'active')
    .limit(200);

  if (params.idToExclude) query = query.neq('id', params.idToExclude);

  const { data, error } = await query;
  if (error) return { exists: false, error };

  const exists = (data || []).some((row) => normalizeComparableDoc(row?.doc_number) === target);
  return { exists, error: null };
};

const ensureAdmin = async (
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  authClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) => {
  const token = getBearerToken(req) || getBodyToken(payload);
  if (!token) return { ok: false, status: 401, error: 'Falta token de sesion.' };

  let { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    // Fallback for environments where anon key validation path fails unexpectedly.
    const fallback = await adminClient.auth.getUser(token);
    userData = fallback.data;
    userError = fallback.error;
  }

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

  const { url, anonKey, serviceRoleKey } = getEnv();
  if (!url || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, {
      error: 'Faltan variables SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  const adminClient = createClient(url, serviceRoleKey);
  const authClient = createClient(url, anonKey);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Body invalido.' });
  }

  const adminCheck = await ensureAdmin(req, adminClient, authClient, payload);
  if (!adminCheck.ok) {
    return jsonResponse(adminCheck.status, { error: adminCheck.error });
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
    const role = normalizeRole(payload.role);
    const status = normalizeStatus(payload.status);
    const docType = normalizeDocType(payload.doc_type);
    const docNumber = normalizeDocNumber(docType, payload.doc_number);
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');

    if (!firstName || !lastName || !email || !password) {
      return jsonResponse(400, { error: 'Nombres, apellidos, correo y contrasena son obligatorios.' });
    }
    if (!docType || !docNumber) {
      return jsonResponse(400, { error: 'Tipo y numero de documento son obligatorios.' });
    }
    if (docType === 'DNI' && !/^\d{8}$/.test(docNumber)) {
      return jsonResponse(400, { error: 'El DNI debe tener 8 digitos.' });
    }
    if (docType === 'CE' && !/^\d{9}$/.test(docNumber)) {
      return jsonResponse(400, { error: 'El CE debe tener 9 digitos.' });
    }

    const conflictingDocument = await hasConflictingActiveDocument(adminClient, {
      docType,
      docNumber,
    });
    if (conflictingDocument.error) return jsonResponse(500, { error: conflictingDocument.error.message });
    if (conflictingDocument.exists) {
      return jsonResponse(400, { error: 'Ya existe un usuario activo con ese documento.' });
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

    if (status === 'disabled') {
      await adminClient.auth.admin.updateUserById(createData.user.id, { ban_duration: '87600h' });
    } else {
      await adminClient.auth.admin.updateUserById(createData.user.id, { ban_duration: 'none' });
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
      temp_credential: password,
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

    const { data: currentProfile, error: currentProfileError } = await getProfileById(adminClient, id);
    if (currentProfileError) return jsonResponse(500, { error: currentProfileError.message });
    if (!currentProfile) return jsonResponse(404, { error: 'Usuario no encontrado.' });

    const nextRole = payload.role !== undefined ? normalizeRole(payload.role) : normalizeRole(currentProfile.role);
    const nextStatus =
      payload.status !== undefined ? normalizeStatus(payload.status) : normalizeStatus(currentProfile.status);
    const nextDocType = payload.doc_type !== undefined ? normalizeDocType(payload.doc_type) : normalizeDocType(currentProfile.doc_type);
    const nextDocNumber =
      payload.doc_number !== undefined
        ? normalizeDocNumber(nextDocType, payload.doc_number)
        : normalizeDocNumber(nextDocType, currentProfile.doc_number);
    const willRemainActiveAdmin = nextRole === 'admin' && nextStatus === 'active';
    if (isActiveAdminProfile(currentProfile) && !willRemainActiveAdmin) {
      const { count, error: countError } = await countActiveAdmins(adminClient);
      if (countError) return jsonResponse(500, { error: countError.message });
      if (count <= 1) {
        return jsonResponse(400, { error: 'No puedes quitar o desactivar al ultimo administrador activo.' });
      }
    }

    if (!nextDocType || !nextDocNumber) {
      return jsonResponse(400, { error: 'Tipo y numero de documento son obligatorios.' });
    }
    if (nextDocType === 'DNI' && !/^\d{8}$/.test(nextDocNumber)) {
      return jsonResponse(400, { error: 'El DNI debe tener 8 digitos.' });
    }
    if (nextDocType === 'CE' && !/^\d{9}$/.test(nextDocNumber)) {
      return jsonResponse(400, { error: 'El CE debe tener 9 digitos.' });
    }

    if (nextStatus === 'active') {
      const conflictingDocument = await hasConflictingActiveDocument(adminClient, {
        idToExclude: id,
        docType: nextDocType,
        docNumber: nextDocNumber,
      });
      if (conflictingDocument.error) return jsonResponse(500, { error: conflictingDocument.error.message });
      if (conflictingDocument.exists) {
        return jsonResponse(400, { error: 'Ya existe un usuario activo con ese documento.' });
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.first_name !== undefined) updates.first_name = String(payload.first_name || '');
    if (payload.last_name !== undefined) updates.last_name = String(payload.last_name || '');
    if (payload.full_name !== undefined) updates.full_name = String(payload.full_name || '');
    if (payload.role !== undefined) updates.role = normalizeRole(payload.role);
    if (payload.status !== undefined) updates.status = normalizeStatus(payload.status);
    if (payload.doc_type !== undefined) updates.doc_type = normalizeDocType(payload.doc_type);
    if (payload.doc_number !== undefined) updates.doc_number = normalizeDocNumber(nextDocType, payload.doc_number);
    if (payload.email !== undefined) updates.email = String(payload.email || '').trim().toLowerCase();
    const nextPassword = payload.password !== undefined ? String(payload.password || '') : '';
    if (nextPassword) updates.temp_credential = nextPassword;

    const { error } = await adminClient.from('profiles').update(updates).eq('id', id);
    if (error) return jsonResponse(500, { error: error.message });

    if (payload.role !== undefined) {
      await adminClient.auth.admin.updateUserById(id, {
        app_metadata: { role: updates.role },
      });
    }

    if (payload.email !== undefined) {
      const nextEmail = String(payload.email || '').trim().toLowerCase();
      if (!nextEmail) return jsonResponse(400, { error: 'Correo invalido.' });
      const { error: emailError } = await adminClient.auth.admin.updateUserById(id, {
        email: nextEmail,
      });
      if (emailError) return jsonResponse(500, { error: emailError.message });
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

    const { data: currentProfile, error: currentProfileError } = await getProfileById(adminClient, id);
    if (currentProfileError) return jsonResponse(500, { error: currentProfileError.message });
    if (!currentProfile) return jsonResponse(404, { error: 'Usuario no encontrado.' });

    if (isActiveAdminProfile(currentProfile)) {
      const { count, error: countError } = await countActiveAdmins(adminClient);
      if (countError) return jsonResponse(500, { error: countError.message });
      if (count <= 1) {
        return jsonResponse(400, { error: 'No puedes desactivar al ultimo administrador activo.' });
      }
    }

    const { error } = await adminClient
      .from('profiles')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return jsonResponse(500, { error: error.message });

    await adminClient.auth.admin.updateUserById(id, { ban_duration: '87600h' });
    return jsonResponse(200, { success: true });
  }

  if (action === 'activate') {
    const id = String(payload.id || '').trim();
    if (!id) return jsonResponse(400, { error: 'ID requerido.' });

    const { error } = await adminClient
      .from('profiles')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return jsonResponse(500, { error: error.message });

    await adminClient.auth.admin.updateUserById(id, { ban_duration: 'none' });
    return jsonResponse(200, { success: true });
  }

  if (action === 'delete') {
    const id = String(payload.id || '').trim();
    if (!id) return jsonResponse(400, { error: 'ID requerido.' });
    if (id === adminCheck.userId) return jsonResponse(400, { error: 'No puedes eliminar tu propia cuenta.' });

    const { data: currentProfile, error: currentProfileError } = await getProfileById(adminClient, id);
    if (currentProfileError) return jsonResponse(500, { error: currentProfileError.message });
    if (!currentProfile) return jsonResponse(404, { error: 'Usuario no encontrado.' });

    if (isActiveAdminProfile(currentProfile)) {
      const { count, error: countError } = await countActiveAdmins(adminClient);
      if (countError) return jsonResponse(500, { error: countError.message });
      if (count <= 1) {
        return jsonResponse(400, { error: 'No puedes eliminar al ultimo administrador activo.' });
      }
    }

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(id);
    if (authDeleteError) return jsonResponse(500, { error: authDeleteError.message });

    // Fallback cleanup in case cascade did not run.
    await adminClient.from('profiles').delete().eq('id', id);
    return jsonResponse(200, { success: true });
  }

  return jsonResponse(400, { error: 'Accion no soportada.' });
});
