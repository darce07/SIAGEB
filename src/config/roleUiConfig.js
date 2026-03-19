import { ROLE_ADMIN, ROLE_SPECIALIST } from '../lib/roles.js';

export const SIDEBAR_ITEM_DEFINITIONS = {
  inicio: { id: 'inicio', label: 'Inicio', path: '/monitoreo/inicio', iconKey: 'dashboard' },
  seguimiento: { id: 'seguimiento', label: 'Seguimiento', path: '/monitoreo/seguimiento', iconKey: 'calendar' },
  elegir: { id: 'elegir', label: 'Monitoreos', path: '/monitoreo', iconKey: 'clipboard' },
  reportes: { id: 'reportes', label: 'Reportes', path: '/monitoreo/reportes', iconKey: 'chart' },
  usuarios: {
    id: 'usuarios',
    label: 'Equipo',
    path: '/monitoreo/usuarios',
    iconKey: 'users',
    adminOnly: true,
  },
  instituciones: {
    id: 'instituciones',
    label: 'Instituciones Educativas',
    path: '/monitoreo/instituciones',
    iconKey: 'building',
    adminOnly: true,
  },
};

export const SIDEBAR_GROUPS_BY_ROLE = {
  [ROLE_SPECIALIST]: [
    { id: 'principal', label: 'Principal', itemIds: ['inicio', 'seguimiento'] },
    { id: 'gestion', label: 'Gestion', itemIds: ['elegir', 'reportes'] },
    { id: 'organizacion', label: 'Organizacion', itemIds: ['usuarios', 'instituciones'] },
  ],
  [ROLE_ADMIN]: [
    { id: 'principal', label: 'Principal', itemIds: ['inicio', 'reportes'] },
    { id: 'gestion', label: 'Gestion', itemIds: ['elegir', 'seguimiento'] },
    { id: 'organizacion', label: 'Organizacion', itemIds: ['usuarios', 'instituciones'] },
  ],
};

export const HOME_WIDGETS_BY_ROLE = {
  [ROLE_SPECIALIST]: ['specialist_priority_actions', 'specialist_agenda', 'quick_actions'],
  [ROLE_ADMIN]: ['admin_global_metrics', 'admin_global_alerts', 'quick_actions'],
};

export const HOME_QUICK_ACTIONS_BY_ROLE = {
  [ROLE_SPECIALIST]: [
    { id: 'quick-create-monitoring', label: 'Crear monitoreo', path: '/monitoreo', iconKey: 'clipboard' },
    {
      id: 'quick-go-tracking',
      label: 'Ir a seguimiento',
      path: '/monitoreo/seguimiento',
      iconKey: 'calendar',
    },
    {
      id: 'quick-continue-draft',
      label: 'Continuar borrador',
      path: '/monitoreo/reportes',
      iconKey: 'fileClock',
    },
    {
      id: 'quick-view-my-reports',
      label: 'Ver mis reportes',
      path: '/monitoreo/reportes',
      iconKey: 'chart',
    },
  ],
  [ROLE_ADMIN]: [
    { id: 'quick-view-reports', label: 'Ver reportes', path: '/monitoreo/reportes', iconKey: 'fileClock' },
    { id: 'quick-review-monitoring', label: 'Revisar monitoreos', path: '/monitoreo', iconKey: 'clipboard' },
    { id: 'quick-manage-team', label: 'Gestionar equipo', path: '/monitoreo/usuarios', iconKey: 'users' },
    {
      id: 'quick-settings',
      label: 'Configuracion',
      path: '/monitoreo/configuracion',
      iconKey: 'settings',
    },
  ],
};
