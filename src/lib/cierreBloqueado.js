// =====================================================================
// cierreBloqueado — ¿la BASE rechazó el cierre por un guard nuestro?
// ---------------------------------------------------------------------
// POR QUÉ EXISTE (2026-08-09):
//   Los triggers `guard_cierre_en_cero` (0058) y `guard_cierre_incompleto`
//   (0064) rechazan un cierre cuando el resumen de la pantalla trae MENOS
//   ventas de las que la base tiene ligadas al corte. Escriben un mensaje
//   pensado para el cajero... que NUNCA LLEGABA A LA PANTALLA: el `catch` de
//   `handleCierreDiario` mostraba siempre 'No se pudo cerrar la caja. Intenta
//   de nuevo.' y mandaba el error real a la consola.
//
//   Resultado: el cajero leía "intenta de nuevo", reintentaba, y volvía a
//   fallar. Un callejón sin salida. Un guard que bloquea sin decir qué hacer
//   es peor que no tener guard.
//
// CÓMO SE DECIDE:
//   Por MARCADOR, nunca por SQLSTATE ni volcando el error crudo. Los triggers
//   ponen el marcador al PRINCIPIO de su mensaje; el resto del texto (folios,
//   importes) es informativo y NO se le enseña al cajero.
//
// LA CADENA QUE TIENE QUE SOBREVIVIR EL MARCADOR:
//   trigger (raise exception 'CIERRE_INCOMPLETO: …')
//     -> PostgREST            (lo devuelve como `message`)
//     -> entitiesAdapter      (antepone '[cortes_caja] ')
//     -> catch de Caja.jsx    (recibe err.message)
//   Por eso se usa `includes` y no `startsWith`: el prefijo del adaptador
//   rompería un `startsWith`. Comprobado con las formas reales en
//   scripts/cierre_bloqueado_verify.mjs.
// =====================================================================

/**
 * Marcadores que los triggers de la base ponen al principio del mensaje.
 * Añadir uno aquí es lo único que hace falta para que un guard nuevo muestre
 * el aviso amable en vez del genérico.
 */
export const MARCADORES_GUARD_CIERRE = ['CIERRE_INCOMPLETO', 'CIERRE_EN_CERO'];

/**
 * ¿Este error viene de un guard de cierre de la base?
 *
 * Acepta lo que llegue: un Error, un string, null, undefined o un objeto raro.
 * Ante la duda devuelve `false` -> se muestra el mensaje genérico de siempre,
 * que es el comportamiento actual. Nunca lanza.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function cierreBloqueadoPorLaBase(err) {
  let msg = '';
  if (typeof err === 'string') {
    msg = err;
  } else if (err && typeof err === 'object') {
    // `message` es lo normal; `details` y `hint` por si PostgREST reparte el
    // texto de otra forma en alguna versión.
    const e = /** @type {{message?: unknown, details?: unknown, hint?: unknown}} */ (err);
    msg = [e.message, e.details, e.hint]
      .filter((x) => typeof x === 'string')
      .join(' ');
  }
  if (!msg) return false;
  return MARCADORES_GUARD_CIERRE.some((m) => msg.includes(m));
}
