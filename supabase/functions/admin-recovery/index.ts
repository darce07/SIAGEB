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

const getEnv = () => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
  const recoveryCode = Deno.env.get('ADMIN_RECOVERY_CODE') || '';
  return { url, serviceRoleKey, recoveryCode };
};

const isLoginCapableAuthUser = (user: unknown) => {
  const bannedUntilRaw = (user as { banned_until?: string | null } | null)?.banned_until || null;
  if (!bannedUntilRaw) return true;

  const parsed = new Date(String(bannedUntilRaw));
  if (Number.isNaN(parsed.valueOf())) return true;
  return parsed.valueOf() <= Date.now();
};

const getAdminAccessCounts = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('status', 'active');

  if (error) return { profileCount: 0, loginCapableCount: 0, error };

  const rows = data || [];
  let loginCapableCount = 0;

  for (const row of rows) {
    const userId = String((row as { id?: string | null } | null)?.id || '').trim();
    if (!userId) continue;

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
    if (userError || !userData?.user) continue;
    if (!isLoginCapableAuthUser(userData.user)) continue;
    loginCapableCount += 1;
  }

  return { profileCount: rows.length, loginCapableCount, error: null };
};

const findAuthUserByEmail = async (adminClient: ReturnType<typeof createClient>, email: string) => {
  let page = 1;
  while (page <= 100) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { user: null, error };
    const users = data?.users || [];
    const found = users.find((item) => String(item.email || '').toLowerCase() === email.toLowerCase()) || null;
    if (found) return { user: found, error: null };
    if (users.length < 200) break;
    page += 1;
  }
  return { user: null, error: null };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Metodo no permitido.' });
  }

  const { url, serviceRoleKey, recoveryCode } = getEnv();
  if (!url || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const adminClient = createClient(url, serviceRoleKey);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Body invalido.' });
  }

  const action = String(payload.action || '').trim().toLowerCase();

  if (action === 'status') {
    const { profileCount, loginCapableCount, error } = await getAdminAccessCounts(adminClient);
    if (error) return jsonResponse(500, { error: error.message });
    return jsonResponse(200, {
      activeAdmins: profileCount,
      loginCapableAdmins: loginCapableCount,
      recoverable: loginCapableCount === 0,
    });
  }

  if (action === 'recover') {
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const code = String(payload.code || '').trim();

    if (!recoveryCode) {
      return jsonResponse(500, { error: 'ADMIN_RECOVERY_CODE no configurado.' });
    }
    if (!email || !email.includes('@')) {
      return jsonResponse(400, { error: 'Correo invalido.' });
    }
    if (!password || password.length < 6) {
      return jsonResponse(400, { error: 'Contrasena invalida. Minimo 6 caracteres.' });
    }
    if (code !== recoveryCode) {
      return jsonResponse(403, { error: 'Codigo de recuperacion invalido.' });
    }

    const { loginCapableCount, error: adminCountError } = await getAdminAccessCounts(adminClient);
    if (adminCountError) return jsonResponse(500, { error: adminCountError.message });
    if (loginCapableCount > 0) {
      return jsonResponse(409, {
        error: 'Ya existe al menos un administrador con acceso. Usa el modulo de Equipo para gestionar roles.',
      });
    }

    const { data: profileMatch, error: profileLookupError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileLookupError) return jsonResponse(500, { error: profileLookupError.message });

    let userId = '';
    let existingUser = null;

    if (profileMatch?.id) {
      const { data: authById, error: authByIdError } = await adminClient.auth.admin.getUserById(profileMatch.id);
      if (!authByIdError && authById?.user) existingUser = authById.user;

      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(profileMatch.id, {
        password,
        email_confirm: true,
        app_metadata: { ...(existingUser?.app_metadata || {}), role: 'admin' },
        user_metadata: {
          ...(existingUser?.user_metadata || {}),
          first_name: existingUser?.user_metadata?.first_name || 'Admin',
          last_name: existingUser?.user_metadata?.last_name || 'Recuperado',
          full_name: existingUser?.user_metadata?.full_name || 'Admin Recuperado',
        },
      });

      if (!updateAuthError) {
        userId = profileMatch.id;
      }
    }

    if (!userId) {
      const lookup = await findAuthUserByEmail(adminClient, email);
      if (lookup.error) return jsonResponse(500, { error: lookup.error.message });
      existingUser = lookup.user;

      if (!existingUser) {
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { role: 'admin' },
          user_metadata: {
            first_name: 'Admin',
            last_name: 'Recuperado',
            full_name: 'Admin Recuperado',
          },
        });
        if (createError || !created?.user?.id) {
          return jsonResponse(500, { error: createError?.message || 'No se pudo crear el usuario admin.' });
        }
        userId = created.user.id;
      } else {
        const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: true,
          app_metadata: { ...(existingUser.app_metadata || {}), role: 'admin' },
          user_metadata: {
            ...(existingUser.user_metadata || {}),
            first_name: existingUser.user_metadata?.first_name || 'Admin',
            last_name: existingUser.user_metadata?.last_name || 'Recuperado',
            full_name: existingUser.user_metadata?.full_name || 'Admin Recuperado',
          },
        });
        if (updateAuthError) return jsonResponse(500, { error: updateAuthError.message });
        userId = existingUser.id;
      }
    }

    const profilePayload = {
      id: userId,
      email,
      first_name: 'Admin',
      last_name: 'Recuperado',
      full_name: 'Admin Recuperado',
      role: 'admin',
      status: 'active',
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await adminClient.from('profiles').upsert(profilePayload, {
      onConflict: 'id',
    });
    if (profileError) return jsonResponse(500, { error: profileError.message });

    return jsonResponse(200, { success: true, email });
  }

  return jsonResponse(400, { error: 'Accion no soportada.' });
});
