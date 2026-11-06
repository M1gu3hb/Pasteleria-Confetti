import { Capacitor, registerPlugin } from '@capacitor/core';

// Thin boundary to the native ConfettiApp plugin (APK 1.3.0+): installed version and verified
// self-update. registerPlugin only creates a proxy. Tests replace this file to emulate the APK.
export const ConfettiApp = registerPlugin('ConfettiApp');
export const isNativeApp = () => Capacitor.isNativePlatform();
