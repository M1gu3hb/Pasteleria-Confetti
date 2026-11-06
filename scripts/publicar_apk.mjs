// Publica una versión del APK SÓLO si el archivo es instalable encima de la app de las tiendas:
// firmado con la llave de Miguel (certificado del APK 1.1.1 publicado), mismo paquete, versión de
// build.gradle y server.url del alias de apk/capacitor. Si algo no coincide no escribe NADA.
//
//   ANDROID_HOME=<sdk> node scripts/publicar_apk.mjs <APK-firmado> [--salida <dir>] [--raiz <repo>] [--fecha AAAA-MM-DD]
//
// Escribe: <salida>/ConfettiPOS-<versión>.apk (para la rama descargas-apk), <salida>/index.html
// (página de descarga de Vercel) y <raiz>/public/apk/actualizacion.json con publicada:true.
// Después: subir el APK a la rama, desplegar la página y hacer push del JSON (docs/ACTUALIZACION_APK.md).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const apk=args.find(a=>!a.startsWith('--')&&args[args.indexOf(a)-1]?.startsWith('--')!==true);
const raiz=path.resolve(opt('--raiz',process.cwd()));
const salida=path.resolve(opt('--salida','descargas-apk-salida'));
const fecha=opt('--fecha',new Date().toISOString().slice(0,10));
const fallar=m=>{console.error('NO PUBLICADO: '+m);process.exit(1);};
if(!apk||!fs.existsSync(apk))fallar('indica la ruta del APK firmado.');
if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha))fallar('fecha inválida.');

const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk)fallar('define ANDROID_HOME (Android SDK con build-tools).');
const bt=path.join(sdk,'build-tools');
const version=fs.readdirSync(bt).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
const herramienta=n=>{const p=path.join(bt,version,n);if(!fs.existsSync(p))fallar(`falta ${n} en ${path.join(bt,version)}`);return p;};
const correr=(bin,a)=>{try{return execFileSync(bin,a,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(e){return String(e.stdout||'')+String(e.stderr||'');}};

const manifiestoRuta=path.join(raiz,'public/apk/actualizacion.json');
const manifiesto=JSON.parse(fs.readFileSync(manifiestoRuta,'utf8'));
const gradle=fs.readFileSync(path.join(raiz,'android/app/build.gradle'),'utf8');
const capConfig=fs.readFileSync(path.join(raiz,'capacitor.config.ts'),'utf8');
const vcGradle=Number(gradle.match(/versionCode (\d+)/)?.[1]);
const vnGradle=gradle.match(/versionName "([^"]+)"/)?.[1];
const urlServidor=capConfig.match(/url: '([^']+)'/)?.[1];
const certEsperado=String(manifiesto.certificadoSha256||'').toLowerCase();
if(!/^[0-9a-f]{64}$/.test(certEsperado))fallar('certificadoSha256 del manifiesto inválido.');

// 1) Paquete y versión
const badging=correr(herramienta('aapt2'),['dump','badging',apk]);
const pkg=badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
if(!pkg)fallar('no se pudo leer el paquete del APK.');
if(pkg[1]!=='com.mhastral.confettipos')fallar(`paquete ${pkg[1]} ≠ com.mhastral.confettipos.`);
if(Number(pkg[2])!==vcGradle||pkg[3]!==vnGradle)fallar(`versión ${pkg[3]} (${pkg[2]}) ≠ build.gradle ${vnGradle} (${vcGradle}).`);
if(Number(pkg[2])!==manifiesto.versionCode||pkg[3]!==manifiesto.versionName)fallar('la versión no coincide con public/apk/actualizacion.json.');

// 2) Firma: v2/v3 válidas, un solo firmante, el certificado de la llave de Miguel
const firma=correr(herramienta('apksigner'),['verify','--print-certs','-v',apk]);
if(!/Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(firma)&&!/Verified using v3 scheme \(APK Signature Scheme v3\): true/.test(firma))fallar('el APK no está firmado (o la firma no es válida).\n'+firma.slice(0,600));
if(/Number of signers: (\d+)/.test(firma)&&Number(firma.match(/Number of signers: (\d+)/)[1])!==1)fallar('se esperaba exactamente un firmante.');
const certReal=(firma.match(/Signer #1 certificate SHA-256 digest: ([0-9a-f]{64})/)||[])[1];
if(certReal!==certEsperado)fallar(`firmado con otra llave (${certReal||'desconocida'}); se espera ${certEsperado}. Android NO lo instalaría encima de la app actual.`);

// 3) La app debe seguir cargando el alias de apk/capacitor
const cfgApk=JSON.parse(execFileSync('unzip',['-p',apk,'assets/capacitor.config.json'],{encoding:'utf8'}));
if(cfgApk?.server?.url!==urlServidor)fallar(`server.url ${cfgApk?.server?.url} ≠ ${urlServidor}.`);

// 4) Huella del archivo
const bytes=fs.readFileSync(apk);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');

// Todo verificado: escribir salida y manifiesto
const nombre=`ConfettiPOS-${pkg[3]}.apk`;
const urlApk=`https://raw.githubusercontent.com/M1gu3hb/Pasteleria-Confetti/descargas-apk/${nombre}`;
if(manifiesto.apk!==urlApk)fallar(`el manifiesto apunta a ${manifiesto.apk}; se espera ${urlApk}.`);
fs.mkdirSync(salida,{recursive:true});
fs.copyFileSync(apk,path.join(salida,nombre));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const html=`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Confetti POS — Actualización ${esc(pkg[3])}</title>
<style>:root{--bg:#1c1410;--card:#251a12;--line:#3a2a1e;--text:#fdf6ef;--muted:#c9b6a5;--accent:#ff8a3d;--accent2:#ffb26b}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 50% -10%,#2e2016 0%,var(--bg) 60%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.card{width:100%;max-width:520px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:28px 22px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
h1{font-size:24px;text-align:center;margin:6px 0 2px}.sub{text-align:center;color:var(--muted);font-size:14px;margin:0 0 20px}
.btn{display:flex;justify-content:center;width:100%;padding:18px;border-radius:16px;font-size:19px;font-weight:800;text-decoration:none;color:#2a1400;background:linear-gradient(180deg,var(--accent2),var(--accent))}
h2{font-size:16px;margin:22px 0 6px}ul,ol{margin:0;padding-left:20px;line-height:1.5}.meta{margin-top:20px;font-size:12px;color:var(--muted);word-break:break-all}.aviso{margin-top:16px;padding:12px;border-radius:12px;background:#3a2a1e;font-size:14px}</style></head>
<body><main class="card">
<div style="text-align:center;font-size:40px">🎂</div>
<h1>Confetti POS ${esc(pkg[3])}</h1>
<p class="sub">Actualización de la app del punto de venta · ${esc(fecha)}</p>
<a class="btn" href="${esc(urlApk)}">⬇️ Descargar actualización</a>
<h2>Qué cambia</h2><ul>${manifiesto.cambios.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>
<h2>Cómo instalar</h2><ol>
<li>Termine la venta en curso.</li>
<li>Toque «Descargar actualización». Si Chrome pregunta, toque «Descargar» o «Conservar».</li>
<li>Abra el archivo descargado y toque «Actualizar». Si Android pide permiso, active «Permitir de esta fuente» y regrese.</li>
<li>Abra Confetti POS. Sus ventas, su sesión y sus ajustes se conservan.</li></ol>
<p class="aviso">La app también muestra el aviso «Actualización pendiente» con el mismo botón. No desinstale la app: la actualización se instala encima.</p>
<p class="meta">Versión ${esc(pkg[3])} (código ${esc(pkg[2])}) · com.mhastral.confettipos<br>SHA-256 del APK: ${sha256}<br>Certificado: ${certReal}</p>
</main></body></html>
`;
fs.writeFileSync(path.join(salida,'index.html'),html);
const nuevo={...manifiesto,publicada:true,fecha,sha256};
fs.writeFileSync(manifiestoRuta,JSON.stringify(nuevo,null,2)+'\n');
console.log(JSON.stringify({publicado:true,version:pkg[3],versionCode:Number(pkg[2]),sha256,certificado:certReal,apk:path.join(salida,nombre),pagina:path.join(salida,'index.html'),manifiesto:manifiestoRuta},null,2));
