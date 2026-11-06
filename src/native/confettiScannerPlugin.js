import { Capacitor, registerPlugin } from '@capacitor/core';

// Thin boundary to the native ConfettiScanner plugin (APK 1.3.0+). registerPlugin only creates a
// proxy; nothing runs at import. Tests replace this file to emulate the APK.
export const ConfettiScanner = registerPlugin('ConfettiScanner');
export const isNativeApp = () => Capacitor.isNativePlatform();
