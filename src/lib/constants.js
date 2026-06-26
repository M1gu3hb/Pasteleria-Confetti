// Unit conversion factors to base units
export const UNIT_CONVERSIONS = {
  kg: { base: 'g', factor: 1000 },
  litro: { base: 'ml', factor: 1000 },
  g: { base: 'g', factor: 1 },
  ml: { base: 'ml', factor: 1 },
  pieza: { base: 'pieza', factor: 1 },
  paquete: { base: 'pieza', factor: 1 },
  caja: { base: 'pieza', factor: 1 },
  bolsa: { base: 'pieza', factor: 1 },
  unidad: { base: 'pieza', factor: 1 },
};

export const UNIT_LABELS = {
  g: 'gramos',
  ml: 'mililitros',
  pieza: 'piezas',
  kg: 'kilogramos',
  litro: 'litros',
  caja: 'cajas',
  paquete: 'paquetes',
  bolsa: 'bolsas',
  unidad: 'unidades',
};

export const STOCK_STATUS = {
  SUFFICIENT: 'suficiente',
  MEDIUM: 'medio',
  LOW: 'bajo',
  CRITICAL: 'critico',
  OUT: 'agotado',
};

export const STOCK_STATUS_CONFIG = {
  suficiente: { label: 'Suficiente', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  medio: { label: 'Medio', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  bajo: { label: 'Bajo', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  critico: { label: 'Crítico', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
  agotado: { label: 'Agotado', color: 'bg-red-200 text-red-900 border-red-300', dot: 'bg-red-800' },
};

// Estados completos del flujo de mesa — colores vivos pero elegantes (skeuomorphic)
export const MESA_STATUS_CONFIG = {
  libre:              { label: 'Libre',                fill: '#FFF8E8', stroke: '#D9C28A', text: '#5C4A1F' },
  esperando_orden:    { label: 'Esperando orden',      fill: '#A7E8B5', stroke: '#5BB573', text: '#1F4D2C' },
  pedido_enviado:     { label: 'Pedido enviado',       fill: '#3B82F6', stroke: '#1E5FCF', text: '#FFFFFF' },
  en_preparacion:     { label: 'En preparación',       fill: '#FB8C2A', stroke: '#C25E10', text: '#FFFFFF' },
  en_espera_entrega:  { label: 'Esperando entrega',    fill: '#16A34A', stroke: '#0E7A37', text: '#FFFFFF' },
  ocupada:            { label: 'Ocupada',              fill: '#E63946', stroke: '#A41E2A', text: '#FFFFFF' },
  cuenta_solicitada:  { label: 'Cuenta solicitada',    fill: '#9B5DE5', stroke: '#6A36B0', text: '#FFFFFF' },
  limpieza:           { label: 'Limpieza',             fill: '#A0744A', stroke: '#6E4C2C', text: '#FFFFFF' },
  pagada:             { label: 'Pagada',               fill: '#D4D4D4', stroke: '#909090', text: '#404040' },
  cancelada:          { label: 'Cancelada',            fill: '#7A1F28', stroke: '#4D131A', text: '#FFFFFF' },
};

export const PREP_STATUS_CONFIG = {
  nuevo: { label: 'Nuevo', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  en_preparacion: { label: 'En preparación', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  listo: { label: 'Listo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  entregado: { label: 'Entregado', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700 border-red-200' },
};

export const MARGIN_THRESHOLDS = {
  high: 60,
  medium: 40,
};

export const MARGIN_CONFIG = {
  high: { label: 'Margen alto', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  medium: { label: 'Margen aceptable', color: 'text-yellow-600', bg: 'bg-yellow-50' },
  low: { label: 'Margen bajo', color: 'text-red-600', bg: 'bg-red-50' },
};

export const ROLES = {
  OWNER: 'dueno',
  ADMIN: 'administrador',
  CASHIER: 'caja',
  WAITER: 'mesero',
  KITCHEN: 'cocina',
};

// Etiquetas completas — incluye roles legacy (`barra`) para que la UI
// de lectura siga mostrando correctamente usuarios que aún existan con
// rol legacy. NO usar para selectores de creación.
export const ROLE_LABELS = {
  dueno: 'Dueño',
  administrador: 'Administrador',
  caja: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
  barra: 'Barra',
};

// Roles visibles en el SELECTOR de Configuración → Usuarios para Confetti.
// Solo Dueño y Administrador pueden crearse desde el formulario de usuarios.
// Los demás roles (caja/mesero/cocina/barra) NO se muestran aquí, pero
// siguen existiendo en ROLES/ROLE_LABELS para compatibilidad de lectura.
export const ROLES_CONFETTI = [
  { value: 'dueno', label: 'Dueño' },
  { value: 'administrador', label: 'Administrador' },
];

// Etiquetas para el SELECTOR de rol al crear/editar usuarios.
// Barra deja de ser rol principal — ahora es una estación de la cocina.
// El usuario legacy con rol='barra' se sigue mostrando como "Barra" en
// listas (vía ROLE_LABELS) pero ya no es opción nueva.
export const ROLE_LABELS_SELECTABLE = {
  administrador: 'Administrador',
  caja: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
};

export const ROLE_HOME_ROUTES = {
  dueno: '/',
  administrador: '/',
  caja: '/caja',
  mesero: '/mesero',
  cocina: '/cocina',
};

export const PAYMENT_METHODS = {
  efectivo: { label: 'Efectivo', icon: 'banknote' },
  tarjeta: { label: 'Tarjeta', icon: 'credit-card' },
  transferencia: { label: 'Transferencia', icon: 'smartphone' },
  mixto: { label: 'Mixto', icon: 'layers' },
};

export const ZONAS_MESA = ['Interior', 'Exterior', 'Terraza', 'Barra', 'Otro'];

export const FORMAS_MESA = [
  { value: 'redonda', label: 'Redonda' },
  { value: 'cuadrada', label: 'Cuadrada' },
  { value: 'rectangular', label: 'Rectangular' },
];

export const TAMANOS_MESA = {
  chica:    { label: 'Chica',    redonda: { w: 60,  h: 60  }, cuadrada: { w: 60,  h: 60  }, rectangular: { w: 90,  h: 55  } },
  mediana:  { label: 'Mediana',  redonda: { w: 80,  h: 80  }, cuadrada: { w: 80,  h: 80  }, rectangular: { w: 120, h: 70  } },
  grande:   { label: 'Grande',   redonda: { w: 110, h: 110 }, cuadrada: { w: 110, h: 110 }, rectangular: { w: 160, h: 90  } },
};