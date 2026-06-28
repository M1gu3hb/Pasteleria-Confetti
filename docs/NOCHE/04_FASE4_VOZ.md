# 04 — Fase 4 · Nota de voz en pastel personalizado

## Objetivo
En las **notas internas** (abajo del formulario de pastel personalizado) se puede
**ESCRIBIR o GRABAR AUDIO**. Al grabar: se graba el audio **Y** se transcribe (dictado de
voz). Al abrir la card del pastel: se ve el **audio (play)** + la **transcripción
(editable** como nota interna). La parte 1 (notas escritas aparte) ya está; esto agrega la
voz. Hay un placeholder **"Nota de voz — próximamente"** reservado en
`PedidoPastelDetalleDialog`.

## Stack (sin depender de API keys externas)
- **Audio → Supabase Storage** (bucket nuevo, ej. `notas-voz`, con RLS).
- **Transcripción → Web Speech API del navegador** (`SpeechRecognition`, idioma `es-MX`)
  durante la grabación.

## Pasos
1. **Diagnóstico:** ubica el placeholder y la sección de nota interna en el form de pastel
   y en el detalle (`PedidoPastelDetalleDialog`). Reporta.
2. **Storage:** crea el bucket `notas-voz` con políticas RLS (insert autenticado por
   sucursal; lectura para el POS). **Espejo de los buckets existentes** (`uploads` /
   `web_uploads`). Migración/registro.
3. **Grabación:** `MediaRecorder` para capturar audio; `SpeechRecognition` en paralelo
   para la transcripción en vivo. Sube el audio a Storage; guarda **URL + transcript** en
   el pedido (campos `nota_voz_url` + `nota_voz_transcripcion`; **migración idempotente**
   si faltan).
4. **Reproducción:** en el detalle del pedido, botón **play** del audio + el **transcript
   mostrado/editable** como nota interna. **Sustituye** el placeholder "próximamente".
5. **Degradación:** si `SpeechRecognition` no está disponible, **guarda el audio igual** y
   deja el transcript editable a mano (no rompas el guardado).

## Auto-auditoría / verificación
La grabación depende de **micrófono real** → la transcripción **NO se puede verificar
headless**. Verifica TODO lo verificable: el bucket existe + RLS, la **subida de audio
funciona** (sube un blob de prueba), los campos se guardan, el **play renderiza**, el
placeholder se reemplazó, `vite build` limpio. **FLAGGEA claramente** que la
grabación/transcripción con micrófono real necesita **verificación manual de Miguel en la
mañana**. Reporta.
