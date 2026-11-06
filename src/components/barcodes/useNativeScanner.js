import { useEffect, useState } from 'react';
import { getScannerCapture } from '@/lib/scannerCapture';

/** Native reader state (APK 1.3.0+) and its actions; {disponible:false} in browser/older APKs. */
export function useNativeScanner() {
  const capture = getScannerCapture();
  const [state, setState] = useState(capture.native);
  useEffect(() => capture.subscribeNative(setState), [capture]);
  return { state, bridge: capture.nativeBridge, subscribePairing: capture.subscribePairing };
}
