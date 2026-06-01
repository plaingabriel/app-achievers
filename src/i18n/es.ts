// UI copy is Spanish; code/identifiers are English (plan §5).
// Casing follows the Achievers design system: sentence case for labels/buttons,
// [UPPERCASE] for decorative eyebrows. No emoji.
export const es = {
  app: { name: 'Achievers' },
  nav: {
    workspace: 'Espacio de trabajo',
    setup: 'Configuración',
    dashboard: 'Panel',
    members: 'Miembros',
    personas: 'Personas',
    closers: 'Closers',
    calendarios: 'Calendarios',
    logs: 'Registro de errores',
    audit: 'Registro de auditoría',
    roles: 'Roles',
    invitations: 'Invitaciones',
    settings: 'Ajustes',
  },
  login: {
    title: 'Inicia sesión en tu espacio',
    subtitle: 'Usa tu correo de trabajo.',
    email: 'Correo electrónico',
    password: 'Contraseña',
    continue: 'Continuar',
    forgot: 'Olvidé mi contraseña',
    twoFactor: 'Código de verificación',
  },
  common: {
    save: 'Guardar cambios',
    add: 'Añadir',
    edit: 'Editar',
    delete: 'Eliminar',
    cancel: 'Cancelar',
    search: 'Buscar…',
    loading: 'Cargando…',
    empty: 'Sin datos. Añade el primero.',
    active: 'Activo',
    inactive: 'Inactivo',
  },
  // Errors: state what broke + what to do. No apologies, no "con éxito".
  errors: {
    connRefused: 'Conexión rechazada. Verifica que la base de datos sea accesible.',
    unauthorized: 'No tienes permiso para ver esta página.',
    generic: 'Algo falló al procesar la solicitud. Intenta de nuevo.',
  },
  notFound: {
    eyebrow: 'ERROR 404',
    title: 'Página no encontrada',
    body: 'La ruta solicitada no existe o fue movida. Revisa la dirección o vuelve al panel.',
    back: 'Volver al panel',
  },
} as const;

export type Messages = typeof es;
