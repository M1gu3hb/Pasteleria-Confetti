import { ROLES } from './constants';

// Feature -> roles that can access.
// ROLES.OWNER (dueño) tiene acceso a TODO lo de administrador + permisos
// exclusivos (gestionar_usuarios, ver_todas_sucursales). Se incluye en cada
// permiso que tiene el administrador.
export const PERMISSIONS = {
  ver_dashboard: [ROLES.OWNER, ROLES.ADMIN],
  ver_pos: [ROLES.OWNER, ROLES.ADMIN, ROLES.CASHIER],
  ver_mesero: [ROLES.OWNER, ROLES.ADMIN, ROLES.WAITER],
  ver_mesas: [ROLES.OWNER, ROLES.ADMIN, ROLES.WAITER, ROLES.CASHIER],
  ver_cocina: [ROLES.OWNER, ROLES.ADMIN, ROLES.KITCHEN],
  ver_inventario: [ROLES.OWNER, ROLES.ADMIN],
  ver_compras: [ROLES.OWNER, ROLES.ADMIN],
  ver_recetas: [ROLES.OWNER, ROLES.ADMIN],
  editar_recetas: [ROLES.OWNER, ROLES.ADMIN],
  ver_productos: [ROLES.OWNER, ROLES.ADMIN],
  ver_ventas: [ROLES.OWNER, ROLES.ADMIN, ROLES.CASHIER],
  ver_caja: [ROLES.OWNER, ROLES.ADMIN, ROLES.CASHIER],
  ver_corte: [ROLES.OWNER, ROLES.ADMIN, ROLES.CASHIER],
  ver_configuracion: [ROLES.OWNER],
  ver_registros: [ROLES.OWNER, ROLES.ADMIN],
  ver_portal_qr: [ROLES.OWNER, ROLES.ADMIN],
  ver_costos: [ROLES.OWNER, ROLES.ADMIN],
  hacer_descuentos: [ROLES.OWNER, ROLES.ADMIN],
  cancelar_ventas: [ROLES.OWNER, ROLES.ADMIN],
  limpiar_ventas: [ROLES.OWNER, ROLES.ADMIN],
  eliminar_mesas: [ROLES.OWNER, ROLES.ADMIN],
  // Permisos exclusivos del dueño.
  gestionar_usuarios: [ROLES.OWNER],
  ver_todas_sucursales: [ROLES.OWNER],
};

// Normaliza el rol legacy con tilde ('dueño') al valor de código ('dueno')
// para que hasPermission funcione con ambas grafías sin depender del dato.
function normalizeRole(role) {
  return role === 'dueño' ? 'dueno' : role;
}

export function hasPermission(role, permission) {
  const r = normalizeRole(role);
  if (!r || !PERMISSIONS[permission]) return false;
  return PERMISSIONS[permission].includes(r);
}

export const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard', permission: 'ver_dashboard' },
  { label: 'Mesero', path: '/mesero', icon: 'UtensilsCrossed', permission: 'ver_mesero' },
  { label: 'Cocina', path: '/cocina', icon: 'ChefHat', permission: 'ver_cocina' },
  { label: 'Caja', path: '/caja', icon: 'Landmark', permission: 'ver_caja' },
  { label: 'Ventas', path: '/ventas', icon: 'Receipt', permission: 'ver_ventas' },
  { label: 'Recetas', path: '/recetas', icon: 'BookOpen', permission: 'ver_recetas' },
  { label: 'Productos', path: '/productos', icon: 'Tag', permission: 'ver_productos' },
  { label: 'Inventario', path: '/inventario', icon: 'Package', permission: 'ver_inventario' },
  { label: 'Compras', path: '/compras', icon: 'ShoppingBag', permission: 'ver_compras' },
  { label: 'Registros', path: '/registros', icon: 'FileText', permission: 'ver_registros' },
  { label: 'Portal QR', path: '/portal-qr', icon: 'QrCode', permission: 'ver_portal_qr' },
  { label: 'Configuración', path: '/configuracion', icon: 'Settings', permission: 'ver_configuracion' },
];

export function getNavForRole(role) {
  return NAV_ITEMS.filter(item => hasPermission(role, item.permission));
}