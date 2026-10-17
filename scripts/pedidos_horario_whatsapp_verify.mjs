import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { compararEntregaPedidos, coincideHorarioEntrega, segundosHoraEntrega } from '../src/utils/horarioPedidos.js';

// Ejecuta los componentes y callbacks reales. Sólo datos/contextos se sustituyen
// por fixtures; no se crean pedidos, cobros ni sesiones de producción.
const root = process.env.CONFETTI_VERIFY_ROOT;
const read = p => fs.readFileSync(root ? root + '/' + p : new URL('../' + p, import.meta.url), 'utf8');
const strip = s => s.replace(/^import[\s\S]*?;\s*$/gm, '').replace(/export default /g, '').replace(/export /g, '');
const utilities = vm.createContext({ Intl, Date, URL, Number, encodeURIComponent });
vm.runInContext(strip(read('src/utils/pedidoPastelUtils.js')) + '\nglobalThis.api={buildWhatsAppLink,fechaCDMX,ESTADOS_PEDIDO};', utilities);
const fixture = {
  id: 'a', folio: 'EJEMPLO-001', cliente_nombre: 'Cliente de ejemplo', cliente_telefono: '5500000000',
  fecha_entrega: '2026-10-12', hora_entrega: '15:00', kilos: 9, concepto: 'Pastel de cumpleaños',
  tipo_pedido: 'pastel_personalizado', incluye_base: true, precio_base: '120',
  total_final: 1380, total_abonado: 500, saldo_pendiente: 880, a_cuenta: 100, resta: 1280,
};
const original = JSON.stringify(fixture);
const message = p => new URL(utilities.api.buildWhatsAppLink(p)).searchParams.get('text');
const text = message(fixture);
assert.match(text, /Importe de base: \$120\.00 \(incluido en el total\)/);
assert.match(text, /Al devolver la base limpia, se te devolverán \$120\.00/);
assert.match(text, /Total: \$1380\.00/);
assert.match(text, /Abonado: \$500\.00 \| Resta: \$880\.00/);
assert.equal(new URL(utilities.api.buildWhatsAppLink(fixture)).pathname, '/525500000000');
assert.equal(JSON.stringify(fixture), original);
for (const invalid of [0, -1, null, undefined, '', 'abc', NaN, Infinity]) {
  assert(!message({ ...fixture, precio_base: invalid }).includes('Importe de base'));
}
for (const amount of [80, '100', 120, 400, 1000, 2000]) {
  assert(message({ ...fixture, precio_base: amount }).includes(`Importe de base: $${Number(amount).toFixed(2)}`));
}
assert(!message({ ...fixture, incluye_base: false }).includes('Importe de base'));
assert(!message({ ...fixture, tipo_pedido: 'productos_catalogo' }).includes('Importe de base'));
assert.match(message({ ...fixture, total_abonado: null, saldo_pendiente: null }), /Abonado: \$100\.00 \| Resta: \$1280\.00/);
assert.equal(utilities.api.buildWhatsAppLink(null), '#');
console.log('PASS: WhatsApp real usa base guardada, pagos vivos y respaldo legacy; no suma dinero ni altera el pedido; omite base cero/inválida/catálogo.');

for (const [raw, expected] of [['00:00', 0], ['9:05', 32700], ['09:05', 32700], ['23:59:59', 86399], [' 15:00 ', 54000]]) {
  assert.equal(segundosHoraEntrega(raw), expected);
}
for (const raw of [null, undefined, '', 0, '24:00', '15:60', '15:00:60', '15:0', '3 pm', 'abc']) assert.equal(segundosHoraEntrega(raw), null);
for (const [hour, filter] of [['00:00','manana'],['11:59:59','manana'],['12:00','tarde'],['17:59:59','tarde'],['18:00','noche'],['23:59:59','noche']]) {
  assert(coincideHorarioEntrega(hour, filter));
  assert.equal(['manana','tarde','noche'].filter(f => coincideHorarioEntrega(hour, f)).length, 1);
}
assert(coincideHorarioEntrega(null, 'sin_hora'));
assert(coincideHorarioEntrega('mal', 'sin_hora'));
assert(coincideHorarioEntrega(null, 'todos'));
assert(!coincideHorarioEntrega(null, 'manana'));
assert(!coincideHorarioEntrega('12:00', 'manana'));
assert(!coincideHorarioEntrega('18:00', 'tarde'));
const sortRows = [
  { id:'a',fecha_entrega:'2026-10-12',hora_entrega:'17:00' },
  { id:'b',fecha_entrega:'2026-10-12',hora_entrega:'15:00' },
  { id:'c',fecha_entrega:'2026-10-12',hora_entrega:null },
  { id:'d',fecha_entrega:'2026-10-11',hora_entrega:null },
  { id:'e',fecha_entrega:null,hora_entrega:'00:00' },
  { id:'f',fecha_entrega:'2026-10-12',hora_entrega:'09:00' },
  { id:'g',fecha_entrega:'2026-10-12',hora_entrega:'9:00' },
];
assert.deepEqual(sortRows.toSorted(compararEntregaPedidos).map(p=>p.id), ['d','f','g','b','a','c','e']);
assert.deepEqual(sortRows.map(p=>p.id), ['a','b','c','d','e','f','g']);
console.log('PASS: medianoche, minutos/segundos, límites 12/18, fechas, desempates y sin hora al final de su día.');

const React = { createElement:(type,props,...children)=>({type,props:props||{},children}), Fragment:'Fragment' };
const hooks=[]; let cursor=0; let effects=[]; let options;
let scope={ sucursalEfectiva:null, adminRole:'pastelero' };
const branches=[{id:'A',nombre:'Xochimilco',orden_visual:1},{id:'B',nombre:'Topilejo',orden_visual:2},{id:'C',nombre:'San Gregorio',orden_visual:3}];
let supplied=[]; let requested;
const dataApi={ entities:{ Sucursal:{filter:async()=>branches}, PedidoPastel:{filterAll:async criteria=>{requested=criteria;return supplied.map(p=>({...p}));}} } };
const useState=initial=>{const i=cursor++;if(!hooks[i])hooks[i]={value:initial};return [hooks[i].value,v=>{hooks[i].value=typeof v==='function'?v(hooks[i].value):v;}];};
const useEffect=(fn,deps)=>{const i=cursor++;const old=hooks[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){hooks[i]={deps};effects.push(fn);}};
// La pantalla obtiene ahora páginas del servidor. Este doble conserva las
// pruebas de interacción; clasificación y RLS se ejecutan en PostgreSQL aislado.
const pageOf=(list,sucursal,filtros={})=>{
 const pedidos=list.filter(p=>(!sucursal||p.sucursal_id===sucursal)&&coincideHorarioEntrega(p.hora_entrega,filtros.hora||'todos')&&
  (!filtros.busqueda||`${p.folio} ${p.cliente_nombre}`.toLowerCase().includes(filtros.busqueda.toLowerCase()))).toSorted(compararEntregaPedidos);
 return {pedidos,conteos:{actuales:pedidos.length,anteriores:0,historial:pedidos.length},total:pedidos.length,hay_mas:false,siguiente:null};
};
const context=vm.createContext({
  React, useState, useEffect, useMemo:fn=>fn(), useTerminal:()=>scope,
  useCajaAbierta:()=>({hayCaja:false}), useConfig:()=>({config:{}}), base44:dataApi,
  cargarPaginaPedidos:async ({sucursal,filtros})=>{requested=sucursal?{sucursal_id:sucursal}:{};return pageOf(supplied,sucursal,filtros);},
  useInfiniteQuery:o=>{options=o;return {data:{pages:[pageOf(supplied,o.queryKey[2],o.queryKey[4])]},isPending:false,isError:false,refetch:()=>{},hasNextPage:false};},
  useQuery:o=>{if(o.queryKey[0]==='sucursales_activas_pedidos_pastel')return {data:branches};options=o;return {data:supplied,isLoading:false,isError:false,refetch:()=>{}};},
  ESTADOS_PEDIDO:utilities.api.ESTADOS_PEDIDO, fechaCDMX:utilities.api.fechaCDMX,
  compararEntregaPedidos, coincideHorarioEntrega, paletaSucursal:()=>({activo:'',badge:''}),
  toast:{error:()=>{}}, console,
  ...Object.fromEntries(['Link','Button','Input','Select','SelectContent','SelectItem','SelectTrigger','SelectValue','Cake','Plus','Search','SucursalBadge','PedidoPastelCard','PedidoPastelDetalleDialog'].map(n=>[n,n])),
});
vm.runInContext(ts.transpileModule(strip(read('src/pages/PedidosPastel.jsx'))+'\nglobalThis.component=PedidosPastel;', {compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,context);
const render=()=>{cursor=0;const tree=context.component();effects.splice(0).forEach(fn=>fn());return tree;};
const all=(tree,predicate)=>{const found=[];const walk=n=>{if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(typeof n.type==='function'){walk(n.type({...n.props,children:n.children}));return;}if(predicate(n))found.push(n);n.children?.forEach(walk);};walk(tree);return found;};
const label=n=>n.children.flat(Infinity).filter(x=>typeof x==='string').join('');
const click=(tree,text)=>{const b=all(tree,n=>n.type==='Button'&&label(n)===text)[0];assert(b,'missing button '+text);b.props.onClick();return render();};
const ids=tree=>all(tree,n=>n.type==='PedidoPastelCard').map(n=>n.props.pedido.id);
const a3={...fixture,id:'z',folio:'A-15',sucursal_id:'A',estado:'confirmado'};
const a5={...a3,id:'a',folio:'A-17',hora_entrega:'17:00'};
const foreign={...a3,id:'b',folio:'B-15',sucursal_id:'B'};
supplied=[a5,a3,foreign]; let tree=render();
assert.equal(options.refetchInterval,15000,'Activos se actualizan en vivo');
supplied=(await options.queryFn({pageParam:null})).pedidos; tree=render();
assert.deepEqual(ids(tree),['b','z','a']); // mismos días: 15:00 antes que 17:00 aunque UUID diga lo contrario
tree=click(tree,'Xochimilco');
assert.equal(requested.sucursal_id,undefined);
supplied=(await options.queryFn({pageParam:null})).pedidos;tree=render();assert.equal(requested.sucursal_id,'A');assert.deepEqual(ids(tree),['z','a']);
assert.equal(all(tree,n=>n.type==='SucursalBadge')[0].props.sucursalEfectiva.sucursal_id,'A');
// Una respuesta/caché con otras sucursales nunca pasa el segundo filtro local.
assert(!ids(tree).includes('b'));
tree=click(tree,'Desde 18:00');assert.deepEqual(ids(tree),[]);
const search=all(tree,n=>n.type==='Input')[0];search.props.onChange({target:{value:'A-15'}});tree=render();
assert.equal(options.refetchInterval,false,'Consultar historial no vuelve a descargar todas sus páginas cada 15 segundos');
assert.deepEqual(ids(tree),['z']);assert.equal(all(tree,n=>n.type==='Button'&&label(n)==='Todas las horas')[0].props['aria-pressed'],true);
// Buscar abre historial/horarios pero conserva SIEMPRE la sucursal seleccionada.
search.props.onChange({target:{value:'B-15'}});tree=render();assert.deepEqual(ids(tree),[]);
search.props.onChange({target:{value:''}});tree=render();
all(tree,n=>n.type==='PedidoPastelCard')[0].props.onVer(a3);tree=render();
assert.equal(all(tree,n=>n.type==='PedidoPastelDetalleDialog')[0].props.pedido.id,'z');
supplied=[a5,a3,foreign];tree=click(tree,'Topilejo');assert.equal(all(tree,n=>n.type==='PedidoPastelDetalleDialog')[0].props.pedido,null);
supplied=(await options.queryFn({pageParam:null})).pedidos;tree=render();assert.equal(requested.sucursal_id,'B');assert.deepEqual(ids(tree),['b']);
scope={sucursalEfectiva:{sucursal_id:'C',sucursal_nombre:'San Gregorio'},adminRole:null};tree=render();
assert.deepEqual(ids(tree),[]);assert.equal(all(tree,n=>n.type==='PedidoPastelDetalleDialog')[0].props.pedido,null);
supplied=(await options.queryFn({pageParam:null})).pedidos;assert.equal(requested.sucursal_id,'C');
console.log('PASS: página real ordena 15 antes de 17; tabs, consulta/cache, búsqueda, horario y detalle conservan sucursal; terminal usa su sucursal propia.');
console.log('\nEJEMPLO WHATSAPP (fixture, no enviado):\n'+text);
