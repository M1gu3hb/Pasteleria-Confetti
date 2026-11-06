import { useLayoutEffect, useRef, useState } from 'react';
import { getScannerCapture } from '@/lib/scannerCapture';

/** @param {any} options */
export function useBarcodeCapture(options) {
  const [state,setState]=useState({draft:'',reading:false,status:'Esperando una lectura.',nativo:/** @type {any} */(null)});
  const registration=useRef(null),latest=useRef(options);latest.current=options;
  useLayoutEffect(()=>{
    registration.current=getScannerCapture().register(latest.current,setState);
    return()=>{registration.current.remove();registration.current=null;};
  },[]);
  useLayoutEffect(()=>{registration.current?.update(options);});
  return {...state,invalidate:()=>getScannerCapture().invalidate(),isReading:()=>getScannerCapture().active};
}
