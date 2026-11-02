import { useEffect, useState } from 'react';
import { readScannerSettings, subscribeScannerConfig } from '@/lib/scannerConfig';
export function useScannerSettings() {
  const [settings,setSettings]=useState(readScannerSettings);
  useEffect(()=>subscribeScannerConfig(()=>setSettings(readScannerSettings())),[]);
  return settings;
}
