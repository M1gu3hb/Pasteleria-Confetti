// Helper central para el sistema de paquetes de MH Astral Systems POS.
// No oculta módulos por sí mismo: solo provee constantes y funciones puras
// que serán consumidas en fases posteriores (Sidebar, rutas, vistas internas).

export const PACKAGE_KEYS = {
  ESENCIAL: 'esencial',
  OPERATIVO: 'operativo',
  RESTAURANTE_PRO: 'restaurante_pro',
};

export const PACKAGE_LABELS = {
  esencial: 'Esencial',
  operativo: 'Operativo',
  restaurante_pro: 'Restaurante Pro',
};

export const PACKAGE_TAGLINES = {
  esencial: 'POS básico para vender, cobrar e imprimir ticket.',
  operativo: 'POS con inventario, compras, gastos y costos básicos.',
  restaurante_pro: 'Sistema completo para restaurantes con mesas, mesero y cocina.',
};

export const PACKAGE_TARGET = {
  esencial: 'Negocios pequeños, mostradores y puestos rápidos.',
  operativo: 'Negocios que controlan inventario, compras y gastos.',
  restaurante_pro: 'Restaurantes, cafeterías, fondas y bares con operación completa.',
};

// Flujo operativo real de cada paquete (para Modo Presentación)
export const PACKAGE_FLOW = {
  esencial: {
    titulo: 'Caja directa / Punto de venta de mostrador',
    descripcion: 'No usa Mesero digital, Cocina digital ni Mesas. El negocio puede tomar pedidos en papel/libreta y capturarlos en Caja al cobrar.',
    pasos: ['Nueva venta', 'Seleccionar productos', 'Cobrar', 'Imprimir ticket', 'Corte de caja'],
  },
  operativo: {
    titulo: 'Caja directa con control operativo completo',
    descripcion: 'No usa Mesero digital, Cocina digital ni Mesas. Puede trabajar con pedidos físicos en papel/libreta. Suma inventario, compras, gastos, recetas, gramajes, costos y utilidad básica.',
    pasos: ['Nueva venta', 'Productos', 'Cobro', 'Ticket', 'Corte', 'Control operativo'],
  },
  restaurante_pro: {
    titulo: 'Sistema completo digital para restaurante',
    descripcion: 'Flujo completo con Mesero, Mesas, Cocina y Caja. Operación digital interna de extremo a extremo.',
    pasos: ['Mesero toma pedido', 'Cocina prepara', 'Caja cobra', 'Corte', 'Reportes'],
  },
};

// Módulos esenciales (incluidos en los 3 paquetes)
const MODULOS_ESENCIAL = [
  'dashboard_basico',
  'productos_basicos',
  'categorias',
  'caja_directa',
  'ventas',
  'detalle_ventas',
  'metodos_pago',
  'tickets',
  'cortes',
  'pdf_corte',
  'registros_basicos',
  'configuracion_basica',
  'integraciones_preparadas_admin',
];

// Módulos que añade Operativo (sobre Esencial)
const MODULOS_OPERATIVO_EXTRA = [
  'inventario',
  'compras',
  'gastos',
  'movimientos_inventario',
  'recetas',
  'gramajes',
  'ingredientes',
  'costos_basicos',
  'utilidad_basica',
  'margen_basico',
  'reportes_operativos',
  'exportaciones',
  'dashboard_operativo',
  // Portal QR está disponible en Operativo y Pro (NO en Esencial)
  'portal_qr',
];

// Módulos que añade Restaurante Pro (sobre Operativo)
const MODULOS_PRO_EXTRA = [
  'mesas',
  'mesero',
  'cocina',
  'barra',
  'pedidos_mesa',
  'estados_mesa',
  'mapa_mesas',
  'configuracion_mesas',
  'reportes_financieros_avanzados',
  'dashboard_completo',
  'integraciones_preparadas',
  'configuracion_completa',
];

export const PACKAGE_MODULES = {
  esencial: [...MODULOS_ESENCIAL],
  operativo: [...MODULOS_ESENCIAL, ...MODULOS_OPERATIVO_EXTRA],
  restaurante_pro: [...MODULOS_ESENCIAL, ...MODULOS_OPERATIVO_EXTRA, ...MODULOS_PRO_EXTRA],
};

// Resumen de funciones por paquete (para tabla comparativa en UI)
export const PACKAGE_FEATURES = {
  esencial: [
    'Dashboard básico',
    'Productos y categorías',
    'Punto de venta / Caja directa',
    'Tickets y cortes de caja',
    'PDF de corte',
    'Registros básicos',
    'Configuración del negocio',
  ],
  operativo: [
    'Todo lo de Esencial',
    'Inventario y movimientos',
    'Compras y gastos',
    'Recetas y gramajes',
    'Costos, utilidad y margen básicos',
    'Reportes operativos y exportaciones',
  ],
  restaurante_pro: [
    'Todo lo de Operativo',
    'Mesas, mesero y cocina',
    'Pedidos por mesa y estados',
    'Mapa avanzado de mesas',
    'Reportes financieros avanzados',
    'Integraciones Google Sheets/Drive preparadas',
  ],
};

// Add-ons que se cotizan aparte (no son paquetes)
export const ADDONS = [
  { key: 'ia_analisis', nombre: 'IA para análisis y reportes' },
  { key: 'pagina_web', nombre: 'Página web del negocio' },
  { key: 'menu_digital', nombre: 'Menú digital público' },
  { key: 'google_real', nombre: 'Google Sheets/Drive conectado' },
  { key: 'app_escritorio', nombre: 'App de escritorio' },
  { key: 'impresoras', nombre: 'Impresoras térmicas / impresión' },
  { key: 'capacitacion', nombre: 'Capacitación' },
  { key: 'carga_masiva', nombre: 'Carga masiva de productos' },
  { key: 'visual_premium', nombre: 'Personalización visual premium' },
  { key: 'multi_sucursal', nombre: 'Multi-sucursal' },
  { key: 'modo_offline', nombre: 'Modo offline / local' },
  { key: 'soporte_prioritario', nombre: 'Soporte prioritario' },
  { key: 'reportes_ejecutivos', nombre: 'Reportes mensuales ejecutivos' },
];

// Comparador detallado fila por fila (para UI tipo tabla)
// valores: true = incluido, false = no incluido, 'addon' = solo como add-on
export const PACKAGE_COMPARISON = [
  { funcion: 'Dashboard',                       esencial: 'Básico',  operativo: 'Operativo', restaurante_pro: 'Completo' },
  { funcion: 'Productos y categorías',          esencial: true,      operativo: true,        restaurante_pro: true },
  { funcion: 'Caja / Punto de venta',           esencial: true,      operativo: true,        restaurante_pro: true },
  { funcion: 'Tickets',                         esencial: true,      operativo: true,        restaurante_pro: true },
  { funcion: 'Corte de caja y PDF',             esencial: true,      operativo: true,        restaurante_pro: true },
  { funcion: 'Registros',                       esencial: 'Básicos', operativo: 'Operativos', restaurante_pro: 'Completos' },
  { funcion: 'Inventario',                      esencial: false,     operativo: true,        restaurante_pro: true },
  { funcion: 'Compras',                         esencial: false,     operativo: true,        restaurante_pro: true },
  { funcion: 'Gastos',                          esencial: false,     operativo: true,        restaurante_pro: true },
  { funcion: 'Recetas / gramajes',              esencial: false,     operativo: true,        restaurante_pro: true },
  { funcion: 'Costos / utilidad / margen',      esencial: false,     operativo: 'Básico',    restaurante_pro: 'Avanzado' },
  { funcion: 'Mesas',                           esencial: false,     operativo: false,       restaurante_pro: true },
  { funcion: 'Mesero',                          esencial: false,     operativo: false,       restaurante_pro: true },
  { funcion: 'Cocina / Barra',                  esencial: false,     operativo: false,       restaurante_pro: true },
  { funcion: 'Reportes financieros avanzados',  esencial: false,     operativo: false,       restaurante_pro: true },
  { funcion: 'Integraciones preparadas',        esencial: 'Admin',   operativo: true,        restaurante_pro: true },
  { funcion: 'IA para análisis',                esencial: 'addon',   operativo: 'addon',     restaurante_pro: 'addon' },
];

// ---------- Funciones helper ----------

// FALLBACK SEGURO = 'esencial' (paquete MÍNIMO), nunca 'restaurante_pro'. Si la config no está
// hidratada o llega por la vista pública (config_publica) sin paquete_modo, Confetti NUNCA debe
// mostrar mesas/mesero/cocina ni perder el botón de venta de Caja.
const PAQUETE_FALLBACK = 'esencial';

export function getCurrentPackage(config) {
  const valor = config?.paquete_modo;
  if (valor === 'esencial' || valor === 'operativo' || valor === 'restaurante_pro') return valor;
  return PAQUETE_FALLBACK;
}

export function isPackage(config, packageName) {
  return getCurrentPackage(config) === packageName;
}

export function canAccessModule(moduleName, paqueteModo) {
  const paquete = (paqueteModo === 'esencial' || paqueteModo === 'operativo' || paqueteModo === 'restaurante_pro')
    ? paqueteModo
    : PAQUETE_FALLBACK;
  return PACKAGE_MODULES[paquete].includes(moduleName);
}

export function getPackageLabel(paqueteModo) {
  return PACKAGE_LABELS[paqueteModo] || PACKAGE_LABELS[PAQUETE_FALLBACK];
}

export function getPackageFeatures(paqueteModo) {
  return PACKAGE_FEATURES[paqueteModo] || PACKAGE_FEATURES[PAQUETE_FALLBACK];
}

export function getPackageTagline(paqueteModo) {
  return PACKAGE_TAGLINES[paqueteModo] || PACKAGE_TAGLINES[PAQUETE_FALLBACK];
}

export function getPackageTarget(paqueteModo) {
  return PACKAGE_TARGET[paqueteModo] || PACKAGE_TARGET[PAQUETE_FALLBACK];
}

// ---------- Mapa de rutas -> módulo requerido ----------
// Si una ruta no está aquí, se considera siempre accesible.
export const ROUTE_TO_MODULE = {
  '/': 'dashboard_basico',
  '/pos': 'caja_directa',
  '/caja': 'caja_directa',
  '/ventas': 'ventas',
  '/corte-caja': 'cortes',
  '/registros': 'registros_basicos',
  '/configuracion': 'configuracion_basica',
  '/productos': 'productos_basicos',
  // Operativo+
  '/inventario': 'inventario',
  '/compras': 'compras',
  '/recetas': 'recetas',
  // Operativo + Pro (no Esencial)
  '/portal-qr': 'portal_qr',
  // Restaurante Pro
  '/mesas': 'mesas',
  '/mesero': 'mesero',
  '/cocina': 'cocina',
  '/barra': 'barra',
};

export function isRouteAllowed(routePath, paqueteModo) {
  const moduleNeeded = ROUTE_TO_MODULE[routePath];
  if (!moduleNeeded) return true;
  return canAccessModule(moduleNeeded, paqueteModo);
}