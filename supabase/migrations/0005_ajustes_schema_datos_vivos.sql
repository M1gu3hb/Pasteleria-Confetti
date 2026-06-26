-- Correcciones de schema contra datos vivos de Base44 (Fase 2, Paso A).

-- usuarios_pos: el dato real usa rol 'dueño' (no estaba en el enum declarado).
alter table usuarios_pos drop constraint usuarios_pos_rol_check;
alter table usuarios_pos add constraint usuarios_pos_rol_check
  check (rol in ('administrador','caja','dueño','mesero','cocina','barra'));
-- PIN interino: el login del POS lo necesita en Fase 2/3.
-- Fase 4: hash -> pin_hash + Supabase Auth, y se ELIMINA esta columna `pin` plana.
alter table usuarios_pos add column pin text;

-- sucursales: campos presentes en datos reales (no declarados en doc 02).
alter table sucursales add column google_maps_url text;
alter table sucursales add column whatsapp_numero text;

-- configuracion_negocio: quitar el campo inferido inexistente (ticket_config)
-- y agregar los campos reales que consume el POS (ConfigContext) — incluye
-- hora_inicio_dia_operativo (CANDADO 2: frontera del día operativo).
alter table configuracion_negocio drop column ticket_config;
alter table configuracion_negocio
  add column nombre_sistema text,
  add column platform_brand text,
  add column logo_ticket_url text,
  add column logo_pdf_url text,
  add column background_logo_url text,
  add column background_image_url text,
  add column background_fit text,
  add column background_opacity numeric,
  add column color_secundario text,
  add column colorear_importes_monetarios boolean,
  add column simbolo_moneda text,
  add column iva_porcentaje numeric,
  add column paquete_modo text,
  add column usa_mesas boolean,
  add column usa_cocina boolean,
  add column usa_barra boolean,
  add column permitir_venta_sin_stock boolean,
  add column mostrar_costos_a_caja boolean,
  add column mostrar_logo_ticket boolean,
  add column mensaje_ticket text,
  add column ticket_footer text,
  add column pdf_footer text,
  add column footer_text text,
  add column descargar_pdf_corte_auto boolean,
  add column formato_export_default text,
  add column modo_presentacion_activo boolean,
  add column hora_inicio_dia_operativo text,
  add column direccion text,
  add column telefono text,
  add column whatsapp text,
  add column correo text;
