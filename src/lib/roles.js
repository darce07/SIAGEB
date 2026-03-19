export const ROLE_ADMIN = 'admin';
export const ROLE_SPECIALIST = 'specialist';

export const resolveUserRole = (rawRole) =>
  String(rawRole || '').toLowerCase() === ROLE_ADMIN ? ROLE_ADMIN : ROLE_SPECIALIST;

export const isAdminRole = (rawRole) => resolveUserRole(rawRole) === ROLE_ADMIN;
