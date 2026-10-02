import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const values=new Map();let current={user:{email:'terminal-00000000-0000-4000-8000-000000000001@pos.confetti.local'},access_token:'fixture-access',refresh_token:'fixture-refresh'};
let calls=[];let redeemed=0;
const sb={auth:{getSession:async()=>({data:{session:current}}),setSession:async(tokens)=>{calls.push('restore');current={...tokens,user:{email:'terminal-00000000-0000-4000-8000-000000000001@pos.confetti.local'}};return {data:{session:current}};},verifyOtp:async()=>{redeemed++;current={access_token:'owner-access',refresh_token:'owner-refresh',user:{email:'owner@fixture.local'}};return {data:{session:current}};},signOut:async()=>{current=null;}},functions:{invoke:async(name,{body})=>{calls.push(name);if(name==='pin-login')return {data:{ok:true,operador:{id:'owner',rol:'dueño'},token_hash:'one-use-fixture'}};return {data:{ok:false}};}}};
const ctx=vm.createContext({console,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},sb});
let source=read('src/api/supabaseClient.js').replace(/^import .*;$/gm,'').replace(/const url =.*;/,'const url="fixture";').replace(/const anonKey =.*;/,'const anonKey="fixture";').replace(/export const supabase = createClient[\s\S]*?\n\}\);/,'const supabase=sb;').replace(/export /g,'');
vm.runInContext(source+'\nglobalThis.api={loginTerminal,loginConPin,validarPin};',ctx);
assert.equal((await ctx.api.loginTerminal('00000000-0000-4000-8000-000000000001')).ok,true);
await ctx.api.loginConPin('1234','owner');assert.equal(redeemed,1);
assert.equal(values.size,1);assert(![...values.values()].join('').includes('1234'));
assert.equal((await ctx.api.loginTerminal('00000000-0000-4000-8000-000000000001')).ok,true);assert.equal(current.user.email,'terminal-00000000-0000-4000-8000-000000000001@pos.confetti.local');
values.clear();current=null;
const notEnrolled=await ctx.api.loginTerminal('00000000-0000-4000-8000-000000000002');assert.equal(notEnrolled.ok,false);assert.equal(notEnrolled.requiereEnrolamiento,true);
assert(!source.includes('TERMINAL_PASSWORD'));assert(!source.includes('signInWithPassword'));
console.log('PASS: terminal session survives owner switch; one-use Auth exchange; no stored PIN/shared password; new device cannot auto-login');
// Exercise the actual dialog handler after a confirmed payment whose response
// was lost. Balance is now zero and cut closed; recovery must bypass current
// form validation and query the original intent, then refresh the parent.
const dialog=read('src/components/pedidos/RegistrarPagoDialog.jsx');
const start=dialog.indexOf('  const confirmar = async () => {');const end=dialog.indexOf('\n  // FASE 4 — cierre',start);
let confirmed=0,refreshed=0;let errorMessage='';
const dc=vm.createContext({cobrandoRef:{current:false},loading:false,pedido:{id:'P',estado:'pagado'},navigator:{onLine:true},pendiente:true,cajaAbierta:null,hayCorteAtrasado:true,monto:'',saldoActual:0,pagoValido:false,slotPago:'pago:A:P',setLoading:()=>{},setLiquidado:()=>{},recuperarOperacionPedido:async slot=>{assert.equal(slot,'pago:A:P');confirmed++;return {montoRegistrado:100,intencionRecuperada:true,saldoPendiente:0};},registrarPagoPedido:()=>{throw Error('A second payment was attempted');},onPagoRegistrado:()=>refreshed++,onClose:()=>{},toast:{error:x=>errorMessage=x,success:()=>{}},console});
vm.runInContext(dialog.slice(start,end)+'\nglobalThis.confirm=confirmar;',dc);await dc.confirm();assert.equal(confirmed,1);assert.equal(refreshed,1);assert.equal(errorMessage,'');
console.log('PASS: actual payment dialog recovers at zero balance with closed/missing current cut');
