import type { CapacitorConfig } from '@capacitor/cli';

// Confetti POS — cáscara Android (Capacitor).
//
// Estrategia: el WebView carga la WEB VIVA desde una URL de Vercel (server.url),
// para que las actualizaciones normales del POS sigan llegando por la nube SIN
// reinstalar el APK. Lo único que se instala por USB es lo NATIVO (impresión
// ESC/POS y cajón, fases 3+), que va SIEMPRE detrás de Capacitor.isNativePlatform().
// En el NAVEGADOR (lo que Abel usa hoy) nada de esto aplica: el flujo actual queda intacto.
const config: CapacitorConfig = {
  appId: 'com.mhastral.confettipos',
  appName: 'Confetti POS',
  webDir: 'dist',
  server: {
    // PREVIEW de la rama apk/capacitor (NO producción). Es el ALIAS ESTABLE de
    // rama de Vercel: sigue SIEMPRE el último commit de apk/capacitor, y es una
    // URL separada e invisible para Abel. (Se verifica pública tras el push.)
    url: 'https://pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app',
    // El WebView se queda DENTRO de estos dominios (si no, los abriría en el
    // navegador externo y romperían los plugins nativos). Vercel = la app;
    // Supabase = datos/auth/storage/realtime.
    allowNavigation: [
      'pasteleria-confetti-git-apk-capacitor-mh-astral-systems.vercel.app',
      '*.vercel.app',
      'ivqcxdpqxwjxfohiswqb.supabase.co',
      '*.supabase.co',
    ],
    // cleartext: necesario en fases 3+ para hablar TCP crudo (ESC/POS, puerto
    // 9100) con la impresora por IP en la LAN, no solo https.
    cleartext: true,
  },
  android: {
    // Contenido mixto permitido (socket a la impresora local en la red).
    allowMixedContent: true,
  },
};

export default config;
