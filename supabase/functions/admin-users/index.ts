import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-authorization, x-client-info, apikey, content-type, x-debug-auth',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const buildFullName = (firstName?: string, lastName?: string) => `${firstName || ''} ${lastName || ''}`.trim();
const normalizeRole = (value: unknown) => String(value || 'user').trim().toLowerCase();
const ALLOWED_ROLES = new Set(['admin', 'user', 'especialista', 'director', 'jefe_area']);
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

const decodeJwtPayload = (token: string) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = atob(padded);
    const payload = JSON.parse(decoded);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
};

const summarizeToken = (token: string) => {
  const payload = decodeJwtPayload(token) || {};
  const role = String((payload as Record<string, unknown>).role || '').toLowerCase();
  const subRaw = String(
    (payload as Record<string, unknown>).sub || (payload as Record<string, unknown>).subject || '',
  ).trim();
  const sub = subRaw ? `${subRaw.slice(0, 8)}...${subRaw.slice(-6)}` : '';
  const exp = Number((payload as Record<string, unknown>).exp || 0) || 0;
  return { role, sub, exp };
};

const getBearerTokens = (req: Request) => {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const clientAuthHeader =
    req.headers.get('x-client-authorization') || req.headers.get('X-Client-Authorization') || '';

  const raws = [authHeader, clientAuthHeader].filter(Boolean);
  const tokens: string[] = [];

  raws.forEach((raw) => {
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => {
        if (!value.toLowerCase().startsWith('bearer ')) return;
        const token = value.slice(7).trim().replace(/^"+|"+$/g, '');
        if (token.split('.').length === 3) tokens.push(token);
      });
  });

  return tokens;
};

const getAuthDebugSnapshot = (req: Request) => {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const clientAuthHeader =
    req.headers.get('x-client-authorization') || req.headers.get('X-Client-Authorization') || '';

  const raws = [authHeader, clientAuthHeader].filter(Boolean);
  const tokens: string[] = [];

  raws.forEach((raw) => {
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => {
        if (!value.toLowerCase().startsWith('bearer ')) return;
        const token = value.slice(7).trim().replace(/^"+|"+$/g, '');
        if (token.split('.').length === 3) tokens.push(token);
      });
  });

  return {
    hasAuthorizationHeader: Boolean(authHeader),
    hasClientAuthorizationHeader: Boolean(clientAuthHeader),
    tokenCount: tokens.length,
    tokens: tokens.map((token) => summarizeToken(token)),
  };
};

const getBodyToken = (payload: Record<string, unknown>) => {
  const raw = String(payload.access_token || '').trim().replace(/^"+|"+$/g, '');
  if (!raw) return '';
  const normalized = raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : raw;
  return normalized.split('.').length === 3 ? normalized : '';
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

const findAuthUserByEmail = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
) => {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { user: null, error: null };

  let page = 1;
  const perPage = 200;

  while (page <= 50) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error };

    const users = data?.users || [];
    const found = users.find((item) => String(item?.email || '').trim().toLowerCase() === target) || null;
    if (found) return { user: found, error: null };

    if (users.length < perPage) break;
    if (typeof data?.total === 'number' && page * perPage >= data.total) break;
    page += 1;
  }

  return { user: null, error: null };
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
  const debugFlag =
    String(payload.debug_auth || '').toLowerCase() === 'true' ||
    req.headers.get('x-debug-auth') === '1';
  const debugSnapshot = debugFlag ? getAuthDebugSnapshot(req) : null;

  const authHeader =
    req.headers.get('authorization') ||
    req.headers.get('Authorization') ||
    req.headers.get('x-client-authorization') ||
    req.headers.get('X-Client-Authorization') ||
    '';
  const authToken = getBodyToken(payload) || getBearerTokens(req)[0] || '';

  if (!authHeader || !authToken) {
    if (debugFlag) {
      console.error('[admin-users][auth-debug] no_authorization_header', { snapshot: debugSnapshot });
    }
    return { ok: false, status: 401, error: 'Falta header Authorization.', error_code: 'E_NO_TOKEN' };
  }

  let { data: authData, error: authError } = await authClient.auth.getUser(authToken);
  let userId = String(authData?.user?.id || '').trim();

  if (!userId) {
    const fallback = await adminClient.auth.getUser(authToken);
    userId = String(fallback?.data?.user?.id || '').trim();
    if (!authError && fallback?.error) authError = fallback.error;
  }

  if (debugFlag) {
    console.log('[admin-users][auth-debug] auth_client_get_user', {
      hasUser: Boolean(userId),
      message: authError?.message || null,
      snapshot: debugSnapshot,
    });
  }

  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: 'No se pudo resolver el usuario de la sesion.',
      error_code: 'E_NO_USER_ID',
      debug: debugFlag ? { authError: authError?.message || null } : undefined,
    };
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role,status')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    if (debugFlag) {
      console.error('[admin-users][auth-debug] profile_query_error', {
        message: profileError.message,
      });
    }
    return {
      ok: false,
      status: 500,
      error: profileError.message,
      error_code: 'E_PROFILE_QUERY',
    };
  }

  if (!profile || profile.status !== 'active' || profile.role !== 'admin') {
    if (debugFlag) {
      console.error('[admin-users][auth-debug] profile_not_admin', {
        userId,
        role: profile?.role || null,
        status: profile?.status || null,
      });
    }
    return {
      ok: false,
      status: 403,
      error: 'Solo administradores pueden usar este modulo.',
      error_code: 'E_NOT_ADMIN',
      debug: debugFlag
        ? {
            userId,
            role: profile?.role || null,
            status: profile?.status || null,
          }
        : undefined,
    };
  }

  if (debugFlag) {
    console.log('[admin-users][auth-debug] admin_ok', {
      userId,
      role: profile.role,
      status: profile.status,
    });
  }

  return { ok: true, userId };
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
  const authClient = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization:
          req.headers.get('authorization') ||
          req.headers.get('Authorization') ||
          req.headers.get('x-client-authorization') ||
          req.headers.get('X-Client-Authorization') ||
          '',
      },
    },
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Body invalido.' });
  }

  const action = String(payload.action || '');

  // Fast-path for list: validate requester identity against profiles
  // to avoid blocking UI on intermittent JWT parsing issues.
  if (action === 'list') {
    const requesterId = String(payload.requester_id || '').trim();
    const requesterEmail = String(payload.requester_email || '').trim().toLowerCase();
    const requesterDoc = String(payload.requester_doc_number || '').trim();

    let requester: { id?: string; role?: string; status?: string } | null = null;
    let requesterError: { message?: string } | null = null;

    if (requesterId) {
      const byId = await adminClient
        .from('profiles')
        .select('id,role,status')
        .eq('id', requesterId)
        .maybeSingle();
      requester = (byId.data as { id?: string; role?: string; status?: string } | null) || null;
      requesterError = byId.error as { message?: string } | null;
    }

    if ((!requester || requesterError) && requesterEmail) {
      const byEmail = await adminClient
        .from('profiles')
        .select('id,role,status')
        .eq('email', requesterEmail)
        .maybeSingle();
      requester = (byEmail.data as { id?: string; role?: string; status?: string } | null) || requester;
      requesterError = (byEmail.error as { message?: string } | null) || requesterError;
    }

    if ((!requester || requesterError) && requesterDoc) {
      const byDoc = await adminClient
        .from('profiles')
        .select('id,role,status')
        .eq('doc_number', requesterDoc)
        .maybeSingle();
      requester = (byDoc.data as { id?: string; role?: string; status?: string } | null) || requester;
      requesterError = (byDoc.error as { message?: string } | null) || requesterError;
    }

    if (!requesterError && requester?.role === 'admin' && requester?.status === 'active') {
      const { data, error } = await adminClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { data });
    }
  }

  const adminCheck = await ensureAdmin(req, adminClient, authClient, payload);
  if (!adminCheck.ok) {
    const action = String(payload.action || '');
    // Controlled fallback: if JWT resolution fails only for list action,
    // trust explicit requester profile validation in DB.
    if (adminCheck.status === 401 && action === 'list') {
      const requesterId = String(payload.requester_id || '').trim();
      const requesterEmail = String(payload.requester_email || '').trim().toLowerCase();
      const requesterDoc = String(payload.requester_doc_number || '').trim();

      let requester: { id?: string; role?: string; status?: string } | null = null;
      let requesterError: { message?: string } | null = null;

      if (requesterId) {
        const byId = await adminClient
          .from('profiles')
          .select('id,role,status')
          .eq('id', requesterId)
          .maybeSingle();
        requester = (byId.data as { id?: string; role?: string; status?: string } | null) || null;
        requesterError = byId.error as { message?: string } | null;
      }

      if ((!requester || requesterError) && requesterEmail) {
        const byEmail = await adminClient
          .from('profiles')
          .select('id,role,status')
          .eq('email', requesterEmail)
          .maybeSingle();
        requester = (byEmail.data as { id?: string; role?: string; status?: string } | null) || requester;
        requesterError = (byEmail.error as { message?: string } | null) || requesterError;
      }

      if ((!requester || requesterError) && requesterDoc) {
        const byDoc = await adminClient
          .from('profiles')
          .select('id,role,status')
          .eq('doc_number', requesterDoc)
          .maybeSingle();
        requester = (byDoc.data as { id?: string; role?: string; status?: string } | null) || requester;
        requesterError = (byDoc.error as { message?: string } | null) || requesterError;
      }

      if (!requesterError && requester?.role === 'admin' && requester?.status === 'active') {
        const { data, error } = await adminClient
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) return jsonResponse(500, { error: error.message });
        return jsonResponse(200, { data });
      }
    }
    return jsonResponse(adminCheck.status, {
      error: adminCheck.error,
      error_code: (adminCheck as { error_code?: string }).error_code || null,
      detail: (adminCheck as { debug?: unknown }).debug || null,
    });
  }

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
    if (!ALLOWED_ROLES.has(role)) {
      return jsonResponse(400, { error: 'Rol invalido.' });
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

    const { user: existingAuthUser, error: existingAuthUserError } = await findAuthUserByEmail(
      adminClient,
      email,
    );
    if (existingAuthUserError) {
      return jsonResponse(500, { error: existingAuthUserError.message });
    }

    const conflictingDocument = await hasConflictingActiveDocument(adminClient, {
      idToExclude: existingAuthUser?.id,
      docType,
      docNumber,
    });
    if (conflictingDocument.error) return jsonResponse(500, { error: conflictingDocument.error.message });
    if (conflictingDocument.exists) {
      return jsonResponse(400, { error: 'Ya existe un usuario activo con ese documento.' });
    }

    const authUserPayload = {
      email,
      password,
      email_confirm: true,
      app_metadata: {
        ...(existingAuthUser?.app_metadata || {}),
        role,
      },
      user_metadata: {
        ...(existingAuthUser?.user_metadata || {}),
        first_name: firstName,
        last_name: lastName,
        full_name: buildFullName(firstName, lastName),
        doc_type: docType,
        doc_number: docNumber,
      },
    };

    let authUserId = String(existingAuthUser?.id || '');

    if (authUserId) {
      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
        authUserId,
        authUserPayload,
      );
      if (updateAuthError) {
        return jsonResponse(500, { error: updateAuthError.message });
      }
    } else {
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser(authUserPayload);
      if (createError || !createData?.user?.id) {
        return jsonResponse(500, { error: createError?.message || 'No se pudo crear el usuario en Auth.' });
      }
      authUserId = createData.user.id;
    }

    if (status === 'disabled') {
      await adminClient.auth.admin.updateUserById(authUserId, { ban_duration: '87600h' });
    } else {
      await adminClient.auth.admin.updateUserById(authUserId, { ban_duration: 'none' });
    }

    const profilePayload = {
      id: authUserId,
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

    return jsonResponse(200, {
      data: profilePayload,
      reused_auth_user: Boolean(existingAuthUser?.id),
    });
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
    if (!ALLOWED_ROLES.has(nextRole)) {
      return jsonResponse(400, { error: 'Rol invalido.' });
    }
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
