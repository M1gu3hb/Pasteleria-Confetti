import React, { useEffect, useRef, useState } from 'react';
import { isNativeApp } from '@/native/confettiAppPlugin';
import { abreFueraDeLaApp, abrirEnNavegador, hayActualizacion, instalarConPlugin, leerManifiesto, leerVersionInstalada } from '@/native/apkUpdate';

const REVISAR_CADA_MS = 30 * 60 * 1000;
const POSPONER_MS = 4 * 60 * 60 * 1000;
const clavePosponer = vc => `confetti_apk_aviso_pospuesto_${vc}`;
const leerPospuesto = vc => { try { return Number(localStorage.getItem(clavePosponer(vc))) || 0; } catch { return 0; } };
const guardarPospuesto = vc => { try { localStorage.setItem(clavePosponer(vc), String(Date.now())); } catch { /* sin almacenamiento: sólo esta pantalla */ } };

const MENSAJE_PERMISO = 'Android abrió el permiso para instalar. Active «Permitir de esta fuente», regrese a Confetti POS y toque «Actualizar ahora» otra vez.';

/**
 * Aviso grande "Actualización pendiente" — SÓLO dentro del APK (Capacitor), en todas las pantallas
 * del POS. No bloquea ventas ni cobros. Ver src/native/apkUpdate.js.
 */
export default function ActualizacionApkBanner() {
  const [manifiesto, setManifiesto] = useState(null);
  const [instalada, setInstalada] = useState(null);
  const [pospuesto, setPospuesto] = useState(0);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [ofrecerNavegador, setOfrecerNavegador] = useState(false);
  const instaladaRef = useRef(null);

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let vivo = true;
    const revisar = async () => {
      try {
        if (!instaladaRef.current) instaladaRef.current = await leerVersionInstalada();
        const m = await leerManifiesto();
        if (!vivo) return;
        setInstalada(instaladaRef.current);
        setManifiesto(m);
        if (m) setPospuesto(leerPospuesto(m.versionCode));
      } catch { /* sin red: se reintenta en la siguiente revisión */ }
    };
    revisar();
    const t = window.setInterval(revisar, REVISAR_CADA_MS);
    const alVolver = () => { if (!document.hidden) revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; window.clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, []);

  if (!hayActualizacion(manifiesto, instalada)) return null;

  const minimizado = Date.now() - pospuesto < POSPONER_MS;
  const nativo = instalada.actualizadorNativo === true;
  const enlaceDirecto = !nativo && abreFueraDeLaApp(manifiesto.apk);

  const actualizar = async () => {
    if (trabajando) return;
    setMensaje(''); setOfrecerNavegador(false); setTrabajando(true);
    try {
      await instalarConPlugin(manifiesto);
      setMensaje('Se abrió el instalador de Android. Toque «Actualizar» y espere a que termine.');
    } catch (e) {
      if (e?.code === 'PERMISO') setMensaje(MENSAJE_PERMISO);
      else { setMensaje(e?.message || 'No se pudo actualizar desde la app.'); setOfrecerNavegador(abreFueraDeLaApp(manifiesto.apk)); }
    } finally { setTrabajando(false); }
  };
  const conNavegador = async () => {
    try { await abrirEnNavegador(manifiesto.apk); } catch (e) { setMensaje(e?.message || 'No se pudo abrir el navegador.'); }
  };
  const posponer = () => { guardarPospuesto(manifiesto.versionCode); setPospuesto(Date.now()); };
  const reabrir = () => { setPospuesto(0); };

  const boton = 'inline-flex items-center justify-center min-h-14 px-6 rounded-xl font-bold text-lg shadow';
  const accionPrincipal = nativo
    ? <button type="button" onClick={actualizar} disabled={trabajando} className={`${boton} bg-white text-amber-800 disabled:opacity-60`}>{trabajando ? 'Descargando actualización…' : 'Actualizar ahora'}</button>
    : enlaceDirecto
      ? <a href={manifiesto.apk} className={`${boton} bg-white text-amber-800`}>Actualizar ahora</a>
      : null;

  if (minimizado) {
    return (
      <div role="region" aria-label="Actualización pendiente" className="mb-4 rounded-xl bg-amber-600 text-white px-4 py-2 flex flex-wrap items-center gap-3 shadow">
        <span className="font-bold">Actualización {manifiesto.versionName} pendiente</span>
        <button type="button" onClick={reabrir} className="underline font-semibold min-h-10">Ver y actualizar</button>
      </div>
    );
  }

  return (
    <section role="region" aria-label="Actualización pendiente" className="mb-5 rounded-2xl bg-amber-600 text-white p-5 shadow-lg space-y-3">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-tight">⬆️ Actualización pendiente</h2>
      <p className="text-base md:text-lg">Nueva versión <strong>{manifiesto.versionName}</strong> de Confetti POS. Esta terminal tiene la <strong>{instalada.versionName || 'anterior'}</strong>.</p>
      <div>
        <p className="font-semibold">Qué cambia:</p>
        <ul className="list-disc pl-6 space-y-0.5">{manifiesto.cambios.map(c => <li key={c}>{c}</li>)}</ul>
      </div>
      <p className="font-semibold">Termine la venta en curso antes de actualizar. Sus ventas, su sesión y sus ajustes se conservan. No desinstale la app.</p>
      {!nativo && enlaceDirecto && (
        <p className="text-sm md:text-base bg-amber-700/60 rounded-lg p-3">
          Al tocar «Actualizar ahora» se abrirá Chrome y descargará la actualización. Si pregunta, toque «Descargar» o «Conservar»; después «Abrir» y «Actualizar».
          Si Android pide permiso, toque «Configuración», active «Permitir de esta fuente» y regrese.
        </p>
      )}
      {!nativo && !enlaceDirecto && (
        <p className="text-sm md:text-base bg-amber-700/60 rounded-lg p-3">Para actualizar, abra Chrome y entre a la página de descargas que le compartió Miguel{manifiesto.pagina ? `: ${manifiesto.pagina}` : ''}.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {accionPrincipal}
        {ofrecerNavegador && <button type="button" onClick={conNavegador} className={`${boton} bg-amber-800 text-white`}>Descargar con el navegador</button>}
        <button type="button" onClick={posponer} className="min-h-12 px-4 underline font-semibold">Más tarde</button>
      </div>
      {mensaje && <p role="status" className="font-semibold bg-amber-800/70 rounded-lg p-3">{mensaje}</p>}
    </section>
  );
}
