# PROMPTS.md — Prompts útiles del proyecto

> Guarda aquí lo que funcionó. Actualizado 2026-08-09.

---

## 1. Prompt de arranque para una sesión NUEVA (o para otra IA)

Pégalo tal cual al abrir un chat nuevo sobre este proyecto:

```
Vas a continuar un POS EN PRODUCCIÓN (Pastelería Confetti, 3 sucursales, tablets,
personal no técnico). Está operando HOY: cada error cuesta dinero real.

ANTES DE TOCAR NADA, lee en este orden y confírmame que lo hiciste:
  1. HANDOFF.md          (raíz) — lo más reciente: qué se hizo, qué quedó roto y por qué
  2. CLAUDE.md           (raíz) — reglas permanentes e irrompibles
  3. PROJECT_CONTEXT.md  (raíz) — estado real, arquitectura, flujos, qué no romper
  4. docs/BUGS_PENDING.md — abiertos, con los REFUTADOS marcados para no perseguirlos
  5. docs/NEXT_STEPS.md   — prioridades
  6. docs/DATABASE.md, docs/FILE_MAP.md, docs/DECISIONS.md, docs/ARCHITECTURE.md
  7. docs/CHANGELOG.md    — al menos las entradas de 2026-08

Luego verifica el ESTADO REAL (la doc puede estar vieja; el código y la base mandan):
  - Supabase, proyecto ivqcxdpqxwjxfohiswqb: migraciones aplicadas, políticas y triggers
    de `pedidos` y `cortes_caja`, y que no haya cortes cerrados en cero con ventas.
  - El último commit de la rama `migracion/supabase` (= producción) y qué bundle sirve
    Vercel ahora mismo.

Después dime, en este orden:
  (a) qué entendiste del estado actual,
  (b) qué encontraste que la documentación NO refleja,
  (c) cuál es el próximo paso y por qué.

No cambies código hasta que yo te dé luz verde.
```

---

## 2. Verificar contra la base SIN alterar datos (transacción revertida)

Patrón usado en toda la etapa 2026-08. El `RAISE` final **aborta y revierte** todo lo que haya dentro, así que nada persiste. Después **comprueba** que no quedó rastro.

```sql
do $$
declare
  IDENT constant text := '{"sub":"<auth_user_id>","role":"authenticated"}';
  n int; r text := E'\n';
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', IDENT, true);

  begin
    update <tabla> set <col> = 'PRUEBA_REVERTIDA' where id = '<id>';
    get diagnostics n = row_count;
    r := r || 'filas afectadas = ' || n || E'\n';
  exception when others then
    r := r || 'BLOQUEADO (' || sqlstate || '): ' || sqlerrm || E'\n';
  end;

  reset role;
  raise exception '%', r;   -- <- revierte TODO
end $$;
```

Y justo después:
```sql
select count(*) from <tabla> where <col> = 'PRUEBA_REVERTIDA';  -- debe dar 0
```

> Para probar RLS de verdad, el `INSERT` de prueba debe llevar **todas las columnas NOT NULL**; si no, muere con `23502` y el rechazo no prueba nada. Exige el SQLSTATE `42501`.

---

## 3. Reproducir el POS en un navegador cuando la sesión no tiene salida a internet

Sirvió para localizar un crash hasta la **posición exacta del bundle minificado**.

1. Espeja el build de producción en local (`index.html` + assets de `pasteleria-confetti.vercel.app`).
2. Sírvelo en `127.0.0.1` con un servidor estático mínimo y **fallback SPA** a `index.html` (localhost está en `no_proxy`, así que el navegador sí lo alcanza).
3. Puentea Supabase con `page.route('**://*.supabase.co/**')` y reenvía con el `fetch` de **Node** (Node sí sale por el proxy). Así el navegador habla con la base **real**.
4. Siembra `localStorage.confetti_terminal` para simular una tablet configurada.
5. Interactúa y mide `document.getElementById('root').childElementCount` — **0 = pantalla en blanco**.
6. Captura `pageerror` y `console` para tener el stack real.

Con el stack (`archivo:línea:columna`) puedes leer esa posición exacta del bundle minificado y saber **qué línea de tu código** es.

---

## 4. Auditoría multiagente con verificación adversarial

Lo que encontró la mayoría de los bugs abiertos de `BUGS_PENDING.md`:

- **Fan-out por rutas independientes** (hooks / render / sesión / permisos / datos), cada agente con su propio contexto y sin ver a los demás.
- **Cada hallazgo pasa por un refutador**: se parte de que es **falso** hasta demostrar lo contrario, y ante duda razonable se descarta. *"Es preferible descartar un hallazgo dudoso que mandar al equipo a perseguir un fantasma en un POS en producción."*
- **Los refutados se guardan y se publican**, para que nadie los vuelva a perseguir.

De ~40 hallazgos, sobrevivieron ~12. Los refutados incluían cosas que "parecían" obvias (una desreferencia nula en el Dashboard, un `return null` en el layout) y que no ocurrían.

---

## 5. Cerrar sesión con documentación viva

```
Antes de terminar, actualiza la documentación y termina tu respuesta con el bloque
"Estado de documentación" de CLAUDE.md, más UNA sola acción concreta como próximo paso.
```
