// =====================================================
// posApiClient — Sincronización POS → Web pública Confetti
// =====================================================
// El POS y el sitio web público son dos apps Base44 SEPARADAS
// (bases de datos distintas). Cuando se edita un producto desde
// WebPublica en el POS, también queremos reflejar esos cambios
// públicos en el catálogo de la web.
//
// Estas funciones son "fire and forget": si fallan (red, CORS,
// key inválida) NO deben romper el flujo del POS. Por eso todos
// los errores se capturan y se silencian con console.warn.
//
// IMPORTANTE: solo se sincronizan campos PÚBLICOS del catálogo.
// Nunca costos, inventario, recetas, ni datos financieros.

import { SUCURSALES_CONFETTI } from '@/components/productos/SelectorSucursalesProducto';

const WEB_BASE_URL = 'https://confetti-pasteleria.base44.app/api';
// SECURITY: la api_key real fue redactada antes de subir a un repo público.
// Esta key de Base44 está EXPUESTA en el ZIP original y DEBE rotarse en Base44.
// En la migración (Opción A) este archivo completo se elimina (puente colapsa).
const POS_API_KEY = 'REDACTED_ROTATE_THIS_KEY_IN_BASE44';

// La web filtra por NOMBRE de sucursal (sus IDs internos no coinciden con
// los del POS). Traducimos cada ID del POS a su nombre. [] = global.
function nombresSucursalesParaWeb(sucursalIds) {
  return (Array.isArray(sucursalIds) ? sucursalIds : [])
    .map((id) => SUCURSALES_CONFETTI.find((s) => s.id === id)?.nombre)
    .filter(Boolean);
}

// ID del registro ConfiguracionNegocio en la app web (no en el POS).
const WEB_CONFIG_ID = '6a2afe197c5afcba28d4aa7e';

// ───────────────────────────────────────────────────────────────
// Matching de categoría POS↔Web por NOMBRE.
// Los IDs de CategoriaProducto del POS NO coinciden con los de la
// web (proyectos distintos). Antes de enviar un producto, resolvemos
// el categoria_id correcto del lado web buscando por nombre.
// Cacheamos las categorías web 60s para no pedirlas en cada sync.
// ───────────────────────────────────────────────────────────────
let _cacheCategorias = null;
let _cacheTs = 0;

// ───────────────────────────────────────────────────────────────
// PARTE E — fetch con retry + backoff exponencial (3 intentos: 0s, 2s, 5s).
// Solo se usa en las funciones que ESCRIBEN (crear/actualizar producto).
// NO reintenta errores de cliente (4xx): son fallos permanentes del payload.
// ───────────────────────────────────────────────────────────────
async function fetchConRetry(url, options, maxRetries = 3) {
  let ultimoError = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) {
        // No reintentar errores de cliente.
        return res;
      }
      ultimoError = `HTTP ${res.status}`;
    } catch (e) {
      ultimoError = e?.message || 'fetch error';
    }
    if (i < maxRetries - 1) {
      const delay = i === 0 ? 2000 : 5000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Falló después de ${maxRetries} intentos: ${ultimoError}`);
}

async function getCategoriasWeb() {
  const ahora = Date.now();
  if (_cacheCategorias && ahora - _cacheTs < 60000) {
    return _cacheCategorias;
  }
  try {
    const res = await fetch(`${WEB_BASE_URL}/entities/CategoriaProducto`, {
      headers: { 'Content-Type': 'application/json', api_key: POS_API_KEY },
    });
    if (!res.ok) {
      console.warn(`[posApiClient] categorias web: ${res.status}`);
      return _cacheCategorias || [];
    }
    const data = await res.json();
    _cacheCategorias = Array.isArray(data) ? data : [];
    _cacheTs = ahora;
    return _cacheCategorias;
  } catch (e) {
    console.warn('[posApiClient] categorias web error:', e);
    return _cacheCategorias || [];
  }
}

/**
 * Devuelve una copia del payload con categoria_id resuelto al ID de la
 * web (matching por categoria_nombre, case-insensitive + trim).
 * - Si no hay categoria_nombre: no toca nada.
 * - Si no se encuentra match: categoria_id = null + console.warn.
 */
async function resolverCategoriaWeb(datos) {
  if (!datos || !datos.categoria_nombre) return datos;
  const objetivo = String(datos.categoria_nombre).trim().toLowerCase();
  const categorias = await getCategoriasWeb();
  const match = (Array.isArray(categorias) ? categorias : []).find(
    (c) => String(c?.nombre || '').trim().toLowerCase() === objetivo
  );
  if (match?.id) {
    return { ...datos, categoria_id: match.id };
  }
  console.warn(`[posApiClient] categoría web no encontrada: "${datos.categoria_nombre}"`);
  return { ...datos, categoria_id: null };
}

/**
 * Busca productos en la web pública por una query JSON arbitraria.
 * Devuelve el array completo (sin límite forzado) para poder detectar
 * coincidencias múltiples en el backfill.
 * @param {object} query  Filtro JSON (ej. { producto_pos_id } o { nombre }).
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function buscarProductosWeb(query, limit = 10) {
  try {
    const res = await fetch(
      `${WEB_BASE_URL}/entities/ProductoTerminado?q=${encodeURIComponent(
        JSON.stringify(query)
      )}&limit=${limit}`,
      {
        headers: {
          'Content-Type': 'application/json',
          api_key: POS_API_KEY,
        },
      }
    );
    if (!res.ok) {
      console.warn(`[posApiClient] buscar web: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[posApiClient] buscar web error:', e);
    return [];
  }
}

/**
 * Busca un producto en la web pública por nombre exacto.
 * @param {string} nombre
 * @returns {Promise<object|null>} El producto web o null.
 */
export async function buscarProductoEnWeb(nombre) {
  if (!nombre) return null;
  const arr = await buscarProductosWeb({ nombre }, 1);
  return arr.length > 0 ? arr[0] : null;
}

/**
 * Busca la copia web de un producto del POS por su ID estable
 * (producto_pos_id). Es el método PRINCIPAL de matching: sobrevive a
 * renombres porque no depende del nombre.
 * @param {string} posId  id del ProductoTerminado del POS.
 * @returns {Promise<object|null>}
 */
export async function buscarProductoWebPorPosId(posId) {
  if (!posId) return null;
  const arr = await buscarProductosWeb({ producto_pos_id: posId }, 1);
  return arr.length > 0 ? arr[0] : null;
}

/**
 * Actualiza un producto en el proyecto web para mantener
 * sincronizado el catálogo público con los cambios del POS.
 * Solo campos públicos: nombre, precio, imagen, descripcion_web,
 * visible_en_web.
 * @param {string} productoWebId
 * @param {object} datos
 * @returns {Promise<object|null>}
 */
export async function actualizarProductoEnWeb(productoWebId, datos) {
  if (!productoWebId) return null;
  try {
    // La web filtra por NOMBRE de sucursal → traducir IDs del POS a nombres
    // y quitar el sucursal_ids original (la web ya no lo usa).
    const { sucursal_ids, ...resto } = datos || {};
    const datosWeb = {
      ...resto,
      sucursales_disponibles: nombresSucursalesParaWeb(sucursal_ids),
    };
    // Resolver categoria_id al ID de la web por nombre (IDs no coinciden).
    const payload = await resolverCategoriaWeb(datosWeb);
    // PARTE E — retry automático con backoff (504/timeout reintenta; 4xx no).
    const res = await fetchConRetry(
      `${WEB_BASE_URL}/entities/ProductoTerminado/${productoWebId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          api_key: POS_API_KEY,
        },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      console.warn(`[posApiClient] sync web: ${res.status}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn('[posApiClient] sync web error:', e);
    return null;
  }
}

/**
 * Crea un producto nuevo en el proyecto web para que aparezca en el
 * catálogo público. Espejo de actualizarProductoEnWeb pero con POST.
 * Solo campos públicos: nombre, precio, imagen, descripcion_web,
 * visible_en_web, activo, categoria_id, categoria_nombre.
 * Fire and forget: si falla NO debe romper el guardado del POS.
 * @param {object} datos  Campos públicos del producto.
 * @returns {Promise<object|null>}  El producto web creado o null si falló.
 */
export async function crearProductoEnWeb(datos) {
  if (!datos || !datos.nombre) return null;
  try {
    // Resolver categoria_id al ID de la web por nombre (IDs no coinciden).
    const payload = await resolverCategoriaWeb(datos);
    // PARTE E — retry automático con backoff (504/timeout reintenta; 4xx no).
    const res = await fetchConRetry(`${WEB_BASE_URL}/entities/ProductoTerminado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_key: POS_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[posApiClient] crear web: ${res.status}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn('[posApiClient] crear web error:', e);
    return null;
  }
}

/**
 * Helper central: sincroniza un ProductoTerminado recién creado en el POS
 * hacia el catálogo web. Centraliza los campos públicos a enviar para que
 * TODOS los flujos de creación del POS usen exactamente el mismo payload.
 * Fire and forget (delega en crearProductoEnWeb).
 * @param {object} producto  El producto creado en el POS.
 * @returns {Promise<object|null>}
 */
export async function sincronizarProductoCreado(producto) {
  if (!producto || !producto.nombre) return null;
  return crearProductoEnWeb({
    // VÍNCULO POR ID: la copia web queda atada al id del producto del POS.
    // Así, renombrar/editar después SIEMPRE actualiza esta misma copia.
    producto_pos_id: producto.id || null,
    nombre: producto.nombre,
    precio_venta: producto.precio_venta || 0,
    imagen_url: producto.imagen_url || null,
    descripcion_web: producto.descripcion_web || null,
    visible_en_web: producto.visible_en_web !== false,
    activo: true,
    categoria_nombre: producto.categoria_nombre || null,
    // La web filtra por NOMBRE de sucursal → traducir IDs del POS a nombres.
    sucursales_disponibles: nombresSucursalesParaWeb(producto.sucursal_ids),
  });
}

/**
 * Sincroniza una ACTUALIZACIÓN de producto POS→web emparejando por
 * producto_pos_id (ID estable del POS), NO por nombre.
 *
 * Estrategia:
 *  1. Buscar la copia web por producto_pos_id === posId.
 *  2. Si existe → PUT de los campos públicos (incluye nombre, para que
 *     renombrar en el POS se refleje en la misma copia).
 *  3. BACKFILL (copias viejas sin producto_pos_id): si NO hay match por ID,
 *     buscar por nombre actual. Solo si hay EXACTAMENTE UNA coincidencia,
 *     hacer el PUT incluyendo producto_pos_id para vincularla de ahí en
 *     adelante. Con 0 o varias coincidencias: NO enlazar y reportar (warn).
 *
 * Fire and forget: nunca rompe el guardado del POS.
 * @param {string} posId   id del ProductoTerminado del POS.
 * @param {string} nombre  nombre ACTUAL del producto en el POS (para backfill).
 * @param {object} campos  campos públicos a sincronizar (nombre, precio_venta,
 *                         categoria_nombre, descripcion_web, imagen_url,
 *                         visible_en_web, sucursal_ids).
 * @returns {Promise<object|null>}
 */
export async function sincronizarActualizacionProducto(posId, nombre, campos) {
  if (!posId) {
    console.warn('[posApiClient] sync update sin posId — no se enlaza.');
    return null;
  }
  try {
    // 1) Match principal por ID estable.
    const porId = await buscarProductoWebPorPosId(posId);
    if (porId?.id) {
      return actualizarProductoEnWeb(porId.id, { ...campos, producto_pos_id: posId });
    }

    // 2) Backfill: copia vieja sin producto_pos_id → buscar por nombre.
    if (nombre) {
      const candidatos = await buscarProductosWeb({ nombre }, 10);
      if (candidatos.length === 1 && candidatos[0]?.id) {
        // Una sola coincidencia → enlazar por ID de aquí en adelante.
        return actualizarProductoEnWeb(candidatos[0].id, { ...campos, producto_pos_id: posId });
      }
      console.warn(
        `[posApiClient] backfill no resuelto para "${nombre}" (${candidatos.length} coincidencias). No se enlaza.`
      );
    }
    return null;
  } catch (e) {
    console.warn('[posApiClient] sync update error:', e);
    return null;
  }
}

/**
 * Elimina la copia web de un producto del POS, emparejando por
 * producto_pos_id (ID estable). Reusa buscarProductoWebPorPosId.
 *
 * Contrato:
 *  - Si NO hay copia web → no es error: devuelve { ok: true } (nada que borrar).
 *  - Si hay copia y el DELETE responde ok → { ok: true }.
 *  - Si hay copia pero el DELETE falla (red/API) → { ok: false }.
 *    El caller usa esto para ABORTAR y no dejar un producto huérfano
 *    visible en el sitio público.
 *
 * @param {string} posId  id del ProductoTerminado del POS.
 * @returns {Promise<{ok: boolean}>}
 */
export async function eliminarProductoEnWeb(posId) {
  if (!posId) return { ok: true };
  let copiaWeb = null;
  try {
    copiaWeb = await buscarProductoWebPorPosId(posId);
  } catch (e) {
    console.warn('[posApiClient] buscar copia web (delete) error:', e);
    // No pudimos confirmar si existe copia → tratamos como fallo para no
    // dejar potencialmente un huérfano en el sitio público.
    return { ok: false };
  }
  // No hay copia web vinculada → nada que borrar, éxito.
  if (!copiaWeb?.id) return { ok: true };

  try {
    const res = await fetch(
      `${WEB_BASE_URL}/entities/ProductoTerminado/${copiaWeb.id}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          api_key: POS_API_KEY,
        },
      }
    );
    if (!res.ok) {
      console.warn(`[posApiClient] eliminar web: ${res.status}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[posApiClient] eliminar web error:', e);
    return { ok: false };
  }
}

/**
 * Borrado en cascada de un producto: PRIMERO la copia web, LUEGO el POS.
 *
 * Orden deliberado: si la web falla (existía copia pero el DELETE no pudo),
 * ABORTAMOS sin tocar el POS para no dejar un producto visible en el sitio
 * público sin su contraparte en el POS.
 *
 * El borrado es REAL (hard delete). El histórico NO se rompe: DetalleVenta
 * guarda producto_nombre y precio_unitario_snapshot, y los pedidos de
 * catálogo guardan el texto en notas_generales.
 *
 * @param {object} producto  El ProductoTerminado del POS (necesita id).
 * @param {object} entidad   base44.entities.ProductoTerminado (inyectado para
 *                           no acoplar este util al cliente del POS).
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function eliminarProductoConCascada(producto, entidad) {
  if (!producto?.id || !entidad?.delete) {
    return { ok: false, error: 'Producto o entidad inválidos.' };
  }
  // 1) Borrar copia web primero.
  const web = await eliminarProductoEnWeb(producto.id);
  if (!web.ok) {
    return { ok: false, error: 'No se pudo quitar de la web. Reintenta.' };
  }
  // 2) Web ok (borró o no había nada) → borrar el producto del POS.
  try {
    await entidad.delete(producto.id);
    return { ok: true };
  } catch (e) {
    console.error('[posApiClient] eliminar POS error:', e);
    return { ok: false, error: 'No se pudo eliminar del POS. Reintenta.' };
  }
}

/**
 * Sincroniza los extras del pastel (base, oblea, muñeca, velas) a la web.
 * Escribe el mismo JSON string en el campo extras_pastel de la
 * ConfiguracionNegocio de la app web. Fire and forget: si falla, no rompe
 * el guardado del POS.
 * @param {string} extrasJSON  JSON string del array de extras.
 * @returns {Promise<object|null>}
 */
export async function sincronizarExtrasAWeb(extrasJSON) {
  try {
    const res = await fetch(
      `${WEB_BASE_URL}/entities/ConfiguracionNegocio/${WEB_CONFIG_ID}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          api_key: POS_API_KEY,
        },
        body: JSON.stringify({ extras_pastel: extrasJSON }),
      }
    );
    if (!res.ok) {
      console.warn(`[posApiClient] sync extras web: ${res.status}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn('[posApiClient] sync extras web error:', e);
    return null;
  }
}

/**
 * Sincroniza los rellenos del pastel a la web. Escribe el mismo JSON string
 * en el campo rellenos_pastel de la ConfiguracionNegocio de la app web.
 * Fire and forget: si falla, no rompe el guardado del POS.
 * @param {string} rellenosJSON  JSON string del array de rellenos.
 * @returns {Promise<object|null>}
 */
export async function sincronizarRellenosAWeb(rellenosJSON) {
  try {
    const res = await fetch(
      `${WEB_BASE_URL}/entities/ConfiguracionNegocio/${WEB_CONFIG_ID}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          api_key: POS_API_KEY,
        },
        body: JSON.stringify({ rellenos_pastel: rellenosJSON }),
      }
    );
    if (!res.ok) {
      console.warn(`[posApiClient] sync rellenos web: ${res.status}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn('[posApiClient] sync rellenos web error:', e);
    return null;
  }
}