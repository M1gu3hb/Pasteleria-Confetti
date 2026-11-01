import React, { useMemo } from 'react';
import { barcodeRuns } from '@/lib/barcodeLabels';
/** @param {{code:string,name?:string}} props */
export default function BarcodeImage({ code, name = '' }) {
  const bars = useMemo(()=>{try{return barcodeRuns(code);}catch{return null;}},[code]);
  if (!bars) return <p role="alert">Código no válido para imprimir.</p>;
  return <div className="bg-white text-black rounded-lg p-3 overflow-hidden" data-barcode-label>
    <svg role="img" aria-label={`Código ${code}`} viewBox={`0 0 ${bars.width+24} 95`} className="w-full h-auto max-h-32" preserveAspectRatio="xMidYMid meet">
      <rect width={bars.width+24} height="95" fill="white" />
      {bars.runs.map(run=><rect key={run.x} x={run.x+12} y="4" width={run.width} height="62" fill="black" />)}
      <text x={(bars.width+24)/2} y="85" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="black">{code}</text>
    </svg>
    {name && <p className="text-xs text-center font-semibold break-words mt-1">{name}</p>}
  </div>;
}
