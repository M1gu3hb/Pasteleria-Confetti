import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read=p=>fs.readFileSync(process.env.CONFETTI_VERIFY_ROOT ? process.env.CONFETTI_VERIFY_ROOT+'/'+p : new URL('../'+p,import.meta.url),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/export default /g,'').replace(/export /g,'');
const mode=process.env.CONFETTI_AUDIT_CASE;

if(!mode||mode==='badge'){
  const source=read('src/components/common/Sidebar.jsx');
  const start=source.indexOf('  const badgeSucId'),end=source.indexOf('  // Cerrar al cambiar de ruta',start);
  assert(start>=0&&end>start);
  let options,cache,branch='A';
  const legacy=[{id:'active',sucursal_id:'A',estado:'con_anticipo'},{id:'archived-paid',sucursal_id:'A',estado:'pagado'}];
  const c=vm.createContext({Number,Array,
    useQuery:o=>{options=o;return{data:cache};},sucursalEfectiva:{sucursal_id:branch},
    cargarPaginaPedidos:async p=>{assert.equal(p.sucursal,branch);assert.equal(p.vista,'actuales');assert.equal(p.limite,1);return{total:branch==='A'?1:0};},
    base44:{entities:{PedidoPastel:{filterAll:async()=>legacy}}},
  });
  const render=()=>{vm.runInContext('{'+source.slice(start,end)+';globalThis.count=conteoWebPendientes;}',c);return c.count;};
  render();cache=await options.queryFn();assert.equal(render(),1,'Badge must exclude a fully paid archived order');
  assert.equal(options.queryKey[0],'pedidos_pastel','Payment invalidation must refresh badge too');
  branch='B';c.sucursalEfectiva={sucursal_id:branch};cache=undefined;assert.equal(render(),0);
  cache=await options.queryFn();assert.equal(render(),0);assert.equal(options.queryKey.at(-1),'B');
  console.log('PASS: real sidebar query uses Actuales, a one-row page and full server count; ignores archived paid orders, shares payment invalidation and changes branch without stale count');
}

if(!mode||mode==='gastos'){
  const source=read('src/pages/Registros.jsx');
  const React={createElement:(type,props,...children)=>({type,props:props||{},children})};
  const tags=[...new Set([...source.matchAll(/<([A-Z]\w*)/g)].map(m=>m[1]))];
  const stale={id:'foreign-expense',sucursal_id:'B',monto:500,descripcion:'Never include B in A'};
  const local={id:'local-expense',sucursal_id:'A',monto:100,descripcion:'Current branch'};
  const c=vm.createContext({React,URLSearchParams,console,formatCurrency:n=>'$'+n,format:()=>'',es:{},
    ...Object.fromEntries(tags.map(t=>[t,t])),
    ...Object.fromEntries(['CORTES','VENTAS','COMPRAS','GASTOS','MOVIMIENTOS','DETALLES_VENTA'].map(t=>['COLUMNS_'+t,[]])),
    useState:v=>[v,()=>{}],useEffect:()=>{},useMemo:fn=>fn(),useRef:v=>({current:v}),
    useConfig:()=>({config:{},paquete_modo:'esencial'}),usePOSAuth:()=>({posUser:{rol:'caja'}}),
    useTerminal:()=>({sucursalEfectiva:{sucursal_id:'A'}}),sucursalIdDe:s=>s.sucursal_id,
    useQueryClient:()=>({invalidateQueries:()=>{}}),useLocation:()=>({search:''}),tipsEnabled:()=>false,
    useListaPaginada:()=>({items:[],loading:false,loadingMore:false,hayMas:false}),
    useQuery:o=>({data:o.queryKey[0]==='registros_gastos'?[stale,local]:[],isPending:false}),
  });
  vm.runInContext(ts.transpileModule(strip(source)+'\nglobalThis.component=Registros;',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,c);
  const tree=c.component();
  const walk=n=>Array.isArray(n)?n.flatMap(walk):n&&typeof n==='object'?[n,...(n.children||[]).flatMap(walk)]:[];
  const report=walk(tree).find(n=>n.type==='ResumenPeriodo');assert(report);
  assert.deepEqual(Array.from(report.props.gastos,r=>r.id),['local-expense'],'Never pass stale foreign expenses to the period report');
  console.log('PASS: actual Registros render excludes foreign cached expenses before passing data to the period report or export; same-branch expense preserved');
}
