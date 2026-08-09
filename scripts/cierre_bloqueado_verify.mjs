// =====================================================================
// Verificación del AVISO al cajero cuando la BASE rechaza el cierre.
//
// EL DEFECTO QUE ORIGINA ESTA PRUEBA (2026-08-09):
//   Los triggers 0058 / 0064 escriben un mensaje pensado para el cajero, pero
//   el `catch` de handleCierreDiario lo tiraba a la consola y mostraba siempre
//   'No se pudo cerrar la caja. Intenta de nuevo.'. El cajero reintentaba y
//   volvía a fallar: callejón sin salida.
//
// COMPROBADA CONTRA EL CÓDIGO VIEJO: sin src/lib/cierreBloqueado.js el bloque
//   (A) ni siquiera importa, y con el catch anterior el bloque (B) falla en
//   sus 4 comprobaciones. Si esta prueba no falla contra el código viejo, no
//   prueba nada.
//
// Uso:  node scripts/cierre_bloqueado_verify.mjs
// =====================================================================
import { readFileSync } from 'node:fs';

let ok = 0, fail = 0;
const check = (n, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : '*** FAIL ***'}  ${n}${extra ? '  ' + extra : ''}`);
};

// ── (A) La detección, contra las formas REALES del mensaje ──────────────
// Se ejercita la función de verdad, no una réplica. Las cadenas son las que
// produce la cadena completa trigger -> PostgREST -> entitiesAdapter.
const { cierreBloqueadoPorLaBase, MARCADORES_GUARD_CIERRE } =
  await import('../src/lib/cierreBloqueado.js');

// Mensaje literal capturado del trigger 0064 en producción (transacción
// revertida sobre CONF-A-C044).
const MSG_0064 = 'CIERRE_INCOMPLETO: la caja CONF-A-C044 tiene 37 ventas por $10735.00 registradas, pero la pantalla sólo mostró 32 por $9735.00. No se guardó el corte.';
// Mensaje literal del trigger 0058.
const MSG_0058 = 'CIERRE_EN_CERO: el corte CONF-A-C044 tiene 37 ventas pagadas por 10735.00 pero se intentó cerrar con total 0. No se guardó. Actualiza la aplicación (cierra y vuelve a abrirla) e intenta de nuevo.';
// El adaptador antepone '[tabla] ' — por eso NO se puede usar startsWith.
const PREFIJO = '[cortes_caja] ';

check('detecta 0064 tal cual sale del trigger',
  cierreBloqueadoPorLaBase(new Error(MSG_0064)) === true);
check('detecta 0064 CON el prefijo "[cortes_caja] " del adaptador',
  cierreBloqueadoPorLaBase(new Error(PREFIJO + MSG_0064)) === true);
check('detecta 0058 CON el prefijo del adaptador',
  cierreBloqueadoPorLaBase(new Error(PREFIJO + MSG_0058)) === true);
check('detecta si el error llega como STRING pelado',
  cierreBloqueadoPorLaBase(PREFIJO + MSG_0064) === true);
check('detecta si PostgREST reparte el texto en `details`',
  cierreBloqueadoPorLaBase({ message: 'error', details: MSG_0064 }) === true);

// Lo que NO debe reconocer: cualquier otro fallo mantiene el mensaje genérico.
check('NO confunde un fallo de red',
  cierreBloqueadoPorLaBase(new Error('[cortes_caja] Failed to fetch')) === false);
check('NO confunde una violación de índice único (23505)',
  cierreBloqueadoPorLaBase(new Error('[cortes_caja] duplicate key value violates unique constraint')) === false);
check('NO confunde un permiso denegado por RLS',
  cierreBloqueadoPorLaBase(new Error('[cortes_caja] permission denied for table cortes_caja')) === false);

// Valores crudos, no banderas: null/undefined/objetos raros no pueden lanzar.
for (const v of [null, undefined, 0, '', NaN, {}, [], { message: 42 }]) {
  check(`no lanza y devuelve false con ${JSON.stringify(v) ?? String(v)}`,
    cierreBloqueadoPorLaBase(v) === false);
}
check('los dos marcadores están declarados',
  MARCADORES_GUARD_CIERRE.includes('CIERRE_INCOMPLETO') &&
  MARCADORES_GUARD_CIERRE.includes('CIERRE_EN_CERO'));

// ── (B) El catch de Caja.jsx usa la detección y NO vuelca el error crudo ──
const caja = readFileSync(new URL('../src/pages/Caja.jsx', import.meta.url), 'utf8');
const iCatch = caja.indexOf("console.error('[Caja] handleCierreDiario:'");
const bloque = iCatch >= 0 ? caja.slice(iCatch, iCatch + 2600) : '';

check('el catch del cierre existe', iCatch >= 0);
check('el catch decide con cierreBloqueadoPorLaBase(err)',
  /if\s*\(\s*cierreBloqueadoPorLaBase\s*\(\s*err\s*\)\s*\)/.test(bloque));
check('se conserva el mensaje genérico como fallback',
  /No se pudo cerrar la caja\. Intenta de nuevo\./.test(bloque));
check('el aviso dice QUÉ HACER (reiniciar la app y revisar el Resumen)',
  /vuelve a abrirla/.test(bloque) && /Resumen/.test(bloque) && /Cierre diario/.test(bloque));
check('el aviso dice que no se perdió nada y que la caja sigue abierta',
  /sigue abierta/.test(bloque) && /no se perdió ninguna venta/.test(bloque));
check('el aviso manda avisar a Miguel POR WHATSAPP',
  /avisa a Miguel por WhatsApp/.test(bloque));
// Sobre el CÓDIGO, no sobre los comentarios: el bloque explica por qué NO se
// decide por SQLSTATE, y esa mención en un comentario no debe hacer fallar la
// comprobación. (Este check ya cazó esa confusión una vez.)
const codigo = bloque
  .replace(/\/\*[\s\S]*?\*\//g, ' ')   // comentarios de bloque
  .replace(/^\s*\/\/.*$/gm, ' ');      // comentarios de línea
check('el aviso NO vuelca el error crudo a la pantalla',
  !/err\.message/.test(codigo) && !/String\(err\)/.test(codigo) &&
  !/SQLSTATE/.test(codigo) && !/\$\{\s*err\s*\}/.test(codigo) &&
  !/JSON\.stringify\(\s*err/.test(codigo));
check('el import de la detección está en Caja.jsx',
  /from '@\/lib\/cierreBloqueado'/.test(caja));

console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
