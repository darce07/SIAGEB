export const ROLE_ADMIN = 'admin';
export const ROLE_DIRECTOR = 'director';
export const ROLE_AREA_CHIEF = 'jefe_area';
export const ROLE_SPECIALIST = 'especialista';
export const ROLE_USER = 'user';

const ROLE_ALIASES = {
  admin: ROLE_ADMIN,
  administrador: ROLE_ADMIN,
  director: ROLE_DIRECTOR,
  jefe_area: ROLE_AREA_CHIEF,
  jefearea: ROLE_AREA_CHIEF,
  'jefe de area': ROLE_AREA_CHIEF,
  especialista: ROLE_SPECIALIST,
  specialist: ROLE_SPECIALIST,
  user: ROLE_USER,
};

export const resolveUserRole = (rawRole) => {
  const normalized = String(rawRole || '').trim().toLowerCase();
  return ROLE_ALIASES[normalized] || ROLE_SPECIALIST;
};

export const isAdminRole = (rawRole) => resolveUserRole(rawRole) === ROLE_ADMIN;

export const hasCddDashboardAccessRole = (rawRole) => {
  const role = resolveUserRole(rawRole);
  return role === ROLE_ADMIN || role === ROLE_DIRECTOR || role === ROLE_AREA_CHIEF;
};

export const getRoleLabel = (rawRole) => {
  const role = resolveUserRole(rawRole);
  if (role === ROLE_ADMIN) return 'Administrador';
  if (role === ROLE_DIRECTOR) return 'Director';
  if (role === ROLE_AREA_CHIEF) return 'Jefe de Area';
  if (role === ROLE_SPECIALIST || role === ROLE_USER) return 'Especialista';
  return 'Especialista';
};
