import React, { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { setPaperWidth } from '@/lib/print';
import {
  getCurrentPackage,
  getPackageLabel,
  getPackageFeatures,
  canAccessModule as canAccessModuleHelper,
} from '@/lib/packageConfig';

// Logo oficial por defecto de la plataforma MH Astral Systems
export const MH_LOGO_URL = 'https://ivqcxdpqxwjxfohiswqb.supabase.co/storage/v1/object/public/uploads/rehost/mhlogo/platform.png';

const PLATFORM_BRAND = 'MH Astral Systems';
const DEFAULT_SYSTEM_NAME = 'MH Astral POS';

const DEFAULT_CONFIG = {
  nombre_negocio: PLATFORM_BRAND,
  nombre_sistema: DEFAULT_SYSTEM_NAME,
  platform_brand: PLATFORM_BRAND,
  logo_url: MH_LOGO_URL,
  logo_ticket_url: '',
  logo_pdf_url: '',
  background_logo_url: '',
  background_image_url: '',
  background_fit: 'cover',
  background_opacity: 0.12,
  color_primario: '#1e40af',
  color_secundario: '#0f172a',
  color_acento: '#38bdf8',
  moneda: 'MXN',
  simbolo_moneda: '$',
  iva_porcentaje: 0,
  usa_mesas: true,
  usa_cocina: true,
  usa_barra: true,
  permitir_venta_sin_stock: false,
  mostrar_costos_a_caja: false,
  mostrar_logo_ticket: true,
  mensaje_ticket: '¡Gracias por tu visita!',
  ticket_footer: '',
  pdf_footer: '',
  footer_text: '',
  descargar_pdf_corte_auto: true,
  formato_export_default: 'csv',
  colorear_importes_monetarios: true,
  paquete_modo: 'esencial', // Confetti es 'esencial'; default seguro = paquete mínimo (nunca restaurante)
  modo_presentacion_activo: false,
  presentacion_password: '2797',
  ancho_impresora: '58', // impresora térmica: '58' (default) u '80' mm
};

const ConfigContext = createContext({ config: DEFAULT_CONFIG, isLoading: false });

export function ConfigProvider({ children }) {
  // HOTFIX persistencia: sin initialData:[] para distinguir "primer fetch"
  // de "vacío real". placeholderData mantiene el valor previo durante refetch
  // (evita parpadeos de switches en cualquier pantalla que use useConfig).
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    // Fase 4: autenticado (sesión terminal/dueño) → config COMPLETA de la tabla.
    // Pre-login (anon, p. ej. ConfigurarTerminal / AccesoDuenoGate) → la tabla
    // está bloqueada para anon, así que caemos a la vista pública config_publica
    // (anon-legible) para preservar el branding de las pantallas de entrada.
    queryFn: async () => {
      try {
        const full = await base44.entities.ConfiguracionNegocio.list();
        if (Array.isArray(full) && full.length > 0) return full;
      } catch { /* anon/sin acceso → fallback a vista pública */ }
      try {
        const { data: pub } = await supabase.from('config_publica').select('*').limit(1);
        if (Array.isArray(pub) && pub.length > 0) return pub;
      } catch { /* noop */ }
      return [];
    },
    placeholderData: (prev) => prev,
    staleTime: 3000,
  });

  const stored = (Array.isArray(data) && data[0]) ? data[0] : {};

  // Resolución de logos: si no hay específico, usar logo_url; y si tampoco, usar el oficial.
  const logoPrincipal = stored.logo_url || MH_LOGO_URL;

  const config = {
    ...DEFAULT_CONFIG,
    ...stored,
    nombre_negocio: stored.nombre_negocio || PLATFORM_BRAND,
    nombre_sistema: stored.nombre_sistema || DEFAULT_SYSTEM_NAME,
    platform_brand: stored.platform_brand || PLATFORM_BRAND,
    logo_url: logoPrincipal,
    logo_ticket_url: stored.logo_ticket_url || logoPrincipal,
    logo_pdf_url: stored.logo_pdf_url || logoPrincipal,
    // IMPORTANTE: NO usar logoPrincipal como fallback de background_logo_url.
    // Antes esto provocaba que el logo del negocio se mostrara como un
    // rectángulo flotante en medio de la pantalla aunque el usuario nunca
    // hubiera configurado un fondo. Si está vacío, debe quedar vacío.
    background_logo_url: stored.background_logo_url || '',
    background_image_url: stored.background_image_url || '',
  };

  // Mantener sincronizado el ancho de la impresora térmica (print.js) con la
  // config. Dep primitiva → solo corre cuando cambia el valor.
  useEffect(() => { setPaperWidth(config.ancho_impresora); }, [config.ancho_impresora]);

  // Helpers de paquete expuestos globalmente
  const paquete_modo = getCurrentPackage(config);
  const modo_presentacion_activo = !!config.modo_presentacion_activo;
  const presentacion_password = config.presentacion_password || '2797';
  const canAccessModule = (moduleName) => canAccessModuleHelper(moduleName, paquete_modo);
  const packageLabel = getPackageLabel(paquete_modo);
  const packageFeatures = getPackageFeatures(paquete_modo);

  return (
    <ConfigContext.Provider value={{
      config,
      isLoading,
      paquete_modo,
      modo_presentacion_activo,
      presentacion_password,
      canAccessModule,
      packageLabel,
      packageFeatures,
    }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}