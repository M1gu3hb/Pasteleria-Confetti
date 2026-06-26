-- Seed de DATOS MAESTROS reales (export de Base44, solo lectura). FKs remapeadas
-- string->uuid vía columnas temporales base44_id (se eliminan al final).
-- NO incluye datos transaccionales (decisión Miguel: ventas/cortes/abonos/pedidos
-- de prueba NO se migran). Aplicado a staging el 2026-06-26.

alter table sucursales          add column base44_id text;
alter table categorias_producto add column base44_id text;
alter table productos           add column base44_id text;
alter table usuarios_pos        add column base44_id text;

-- Sucursales (3)
insert into sucursales (base44_id, nombre, direccion, telefono, activa, folio_prefijo, orden_visual, google_maps_url, whatsapp_numero) values
('6a28b475553d114b364bf134','Xochimilco / Principal','Morelos No. 162, Barrio San Pedro, Xochimilco','55 9350 2639',true,'A',1,'https://maps.app.goo.gl/Q2NWsS9DvWDNzf4p9','5559350 2639'),
('6a28b475553d114b364bf135','Topilejo','Zaragoza esquina Juárez, a lado del Banco Azteca, Topilejo','55 9246 9141',true,'B',2,'https://maps.app.goo.gl/2DktoEnqjm2ZWokL7','5559246 9141'),
('6a28b475553d114b364bf136','San Gregorio','San Gregorio Atlapulco, Xochimilco, CDMX',null,true,'C',3,'https://maps.app.goo.gl/1PaNp4gyftFEAmwv8',null);

-- Categorías (8: 7 activas + General inactiva)
insert into categorias_producto (base44_id, nombre, color, orden, activo) values
('6a320facfdf103ba324a6fc0','Pasteles Personalizados','#E8579A',1,true),
('6a320facfdf103ba324a6fc1','Tres Leches','#F4A4C0',2,true),
('6a320facfdf103ba324a6fc2','Rebanadas','#C49A6C',3,true),
('6a320facfdf103ba324a6fc3','Postres','#8B5A3C',4,true),
('6a320facfdf103ba324a6fc4','Pasteles de Mostrador','#D4AF37',5,true),
('6a320facfdf103ba324a6fc5','Gelatinas','#7BB661',6,true),
('6a320facfdf103ba324a6fc6','Pay de Limón','#F5DC6F',7,true),
('6a2c5cffd8140e372074a5db','General','#4A5568',1,false);

-- Productos (20). categoria_id remap por base44_id; sucursal_ids remap (solo 1 con sucursal).
insert into productos (base44_id, nombre, categoria_id, categoria_nombre, descripcion_web, precio_venta, imagen_url, sucursal_ids, activo, visible_en_pos, visible_en_web)
select v.base44_id, v.nombre, c.id, v.categoria_nombre, v.descripcion_web, v.precio_venta, v.imagen_url, v.sucursal_ids, v.activo, v.visible_en_pos, v.visible_en_web
from (values
 ('6a3784c38b8eed95f965a5fc','prueba suscursal','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null::text,300::numeric,null::text,(select array(select id from sucursales where base44_id='6a28b475553d114b364bf134')),true,true,true),
 ('6a37823462e16d5efcc97547','prueba 1','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null,300,null,null,true,true,false),
 ('6a3780ab81d419eb2294b7fd','prueba 2','6a320facfdf103ba324a6fc1','Tres Leches',null,498,null,null,true,true,true),
 ('6a32072b467de48c7742fe72','pastel tiramisu','6a320facfdf103ba324a6fc2','Rebanadas','pastel  tiramisu ',300,'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjk8uAmnzgQOHueU-6_U1IocEfDpe6kBo0mA&s',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b4','Pastel Chico (2 kg aprox)','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null,320,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/948abb378_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b5','Pastel Grande 3 kg','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null,420,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/dcaf13d39_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b6','Pastel Cuadrado','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null,490,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/cf94a8ee4_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b7','Imposible','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null,300,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/185b75914_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b8','Cheesecake','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null,300,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/a2a6da8ba_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b9','Gelatina Mini','6a320facfdf103ba324a6fc5','Gelatinas',null,56,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/c986b1d9d_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07ba','Gelatina Corazón Chico','6a320facfdf103ba324a6fc5','Gelatinas',null,110,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/2a2d0fb9d_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07bb','Gelatina Corazón Grande','6a320facfdf103ba324a6fc5','Gelatinas',null,180,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/4a1a64d04_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07bc','Gelatina Rosca','6a320facfdf103ba324a6fc5','Gelatinas',null,230,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/4e42b4171_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07bd','Gelatina Grande','6a320facfdf103ba324a6fc5','Gelatinas',null,290,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/9367ac5c4_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07be','Flan','6a320facfdf103ba324a6fc5','Gelatinas',null,260,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/d9a466906_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07bf','Pay de Limón Mini','6a320facfdf103ba324a6fc6','Pay de Limón',null,1000,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/b8959c421_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07c0','Pay de Limón Chico','6a320facfdf103ba324a6fc6','Pay de Limón',null,280,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/3c95f4ce5_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07c1','Pay de Limón Grande','6a320facfdf103ba324a6fc6','Pay de Limón',null,420,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/8318074fd_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b2','Rebanada Tres Leches','6a320facfdf103ba324a6fc2','Rebanadas',null,35,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/783daf757_generated_image.png',null,true,true,true),
 ('6a2b3e5ed7b5a668551c07b3','Pastel Mini (1 kg aprox)','6a320facfdf103ba324a6fc4','Pasteles de Mostrador',null,140,'https://media.base44.com/images/public/6a2afcaf5df5e3322f4da64e/e3c92c313_generated_image.png',null,true,true,true)
) as v(base44_id,nombre,categoria_base44,categoria_nombre,descripcion_web,precio_venta,imagen_url,sucursal_ids,activo,visible_en_pos,visible_en_web)
join categorias_producto c on c.base44_id = v.categoria_base44;

-- Usuarios (33: 6 dueño, 12 administrador, 15 caja). sucursal_id remap; pin interino.
insert into usuarios_pos (base44_id, nombre, rol, pin, activo, sucursal_id, sucursal_nombre)
select v.base44_id, v.nombre, v.rol, v.pin, true, s.id, v.sucursal_nombre
from (values
 ('6a37648607518407e5f359fc','OBSERVADOR_3','administrador','9003','6a28b475553d114b364bf136','San Gregorio'),
 ('6a37648611b6b7700bf732ed','OBSERVADOR_2','administrador','9002','6a28b475553d114b364bf135','Topilejo'),
 ('6a376486d49f8af62f3d49a7','OBSERVADOR_1','administrador','9001','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a37648542fa75b1cde8de68','EMP_SANG_5','caja','4105','6a28b475553d114b364bf136','San Gregorio'),
 ('6a37648534736e9b60475cc5','EMP_SANG_4','caja','4104','6a28b475553d114b364bf136','San Gregorio'),
 ('6a3764852f1e88238e6de976','ADMIN_SANG_3','administrador','4003','6a28b475553d114b364bf136','San Gregorio'),
 ('6a376485d03ba622155df2a6','EMP_TOPI_5','caja','3105','6a28b475553d114b364bf135','Topilejo'),
 ('6a3764857362530fbf349742','EMP_TOPI_4','caja','3104','6a28b475553d114b364bf135','Topilejo'),
 ('6a376485161188fd29b0f909','ADMIN_TOPI_3','administrador','3003','6a28b475553d114b364bf135','Topilejo'),
 ('6a376484e8a724cf64cbc687','EMP_XOCHI_5','caja','2105','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a37648486a38a7a9bb30361','EMP_XOCHI_4','caja','2104','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a3764841f81980c1c7e022b','ADMIN_XOCHI_3','administrador','2003','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a37648461db283cfb2dd8c5','DUENO_3','dueño','1236',null,null),
 ('6a376484a5c503faf90e901f','DUENO_2','dueño','1235',null,null),
 ('6a3764842f1e88238e6de973','DUENO_1','dueño','1234',null,null),
 ('6a343a05b0fbc93dfa9f6ec5','EMP_SANG_3','caja','4103','6a28b475553d114b364bf136','San Gregorio'),
 ('6a343a059a845e08a6e4917f','EMP_SANG_2','caja','4102','6a28b475553d114b364bf136','San Gregorio'),
 ('6a343a056828cd19c8cf5b95','EMP_SANG_1','caja','4101','6a28b475553d114b364bf136','San Gregorio'),
 ('6a343a05ea3ba919ba149316','ADMIN_SANG_2','administrador','4002','6a28b475553d114b364bf136','San Gregorio'),
 ('6a343a04142bb2b9b237c4c9','ADMIN_SANG_1','administrador','4001','6a28b475553d114b364bf136','San Gregorio'),
 ('6a343a048803c61a5bbb1ce8','EMP_TOPI_3','caja','3103','6a28b475553d114b364bf135','Topilejo'),
 ('6a343a04c1bb78ec1e585a1e','EMP_TOPI_2','caja','3102','6a28b475553d114b364bf135','Topilejo'),
 ('6a343a04c3f7d35d6f1c2c41','EMP_TOPI_1','caja','3101','6a28b475553d114b364bf135','Topilejo'),
 ('6a343a04cd343e5ee41a9a92','ADMIN_TOPI_2','administrador','3002','6a28b475553d114b364bf135','Topilejo'),
 ('6a343a04651937ebd5c90c5e','ADMIN_TOPI_1','administrador','3001','6a28b475553d114b364bf135','Topilejo'),
 ('6a343a034039aac48239a0ca','EMP_XOCHI_3','caja','2103','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a343a03a9fd2d756eda4d29','EMP_XOCHI_2','caja','2102','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a343a0335d4f3f5b412474e','EMP_XOCHI_1','caja','2101','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a343a03965a0130b0fe3a1d','ADMIN_XOCHI_2','administrador','2002','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a343a03157d2ec9c347f547','ADMIN_XOCHI_1','administrador','2001','6a28b475553d114b364bf134','Xochimilco / Principal'),
 ('6a343a023cdd49c304c6418e','ADMIN_3','dueño','1236',null,null),
 ('6a343a027de57a2bb6343c1b','ADMIN_2','dueño','1235',null,null),
 ('6a343a02c1e14f563b6637ca','ADMIN_1','dueño','1234',null,null)
) as v(base44_id,nombre,rol,pin,sucursal_base44,sucursal_nombre)
left join sucursales s on s.base44_id = v.sucursal_base44;

-- ConfiguracionNegocio (1 fila, valores reales)
insert into configuracion_negocio (
  nombre_negocio, nombre_sistema, platform_brand, logo_url,
  color_primario, color_secundario, color_acento, colorear_importes_monetarios,
  moneda, simbolo_moneda, iva_porcentaje,
  paquete_modo, usa_mesas, usa_cocina, usa_barra, mostrar_costos_a_caja, mostrar_logo_ticket,
  mensaje_ticket, descargar_pdf_corte_auto, formato_export_default,
  modo_presentacion_activo, presentacion_password,
  hora_inicio_dia_operativo,
  precio_kilo_global, precio_kilo_es_global, precio_kilo_por_sucursal,
  ratio_personas_por_kilo, ratio_personas_es_global, ratio_personas_por_sucursal,
  extras_pastel, rellenos_pastel,
  direccion, telefono, whatsapp, correo
) values (
  'Pastelería Confetti','', 'POS Pastelería Confetti',
  'https://base44.app/api/apps/6a28a71350ef872d8486262b/files/mp/public/6a28a71350ef872d8486262b/ea8d107e7_1000135197.png',
  '#E8579A','#FFF8F4','#5C2D1E',false,
  'MXN','$',0,
  'esencial',false,false,false,false,true,
  '¡Gracias por tu visita!',true,'csv',
  false,'2797',
  '06:00',
  140,true,null,
  7,true,null,
  '[{"id":"base","nombre":"Pastel de base","precio":50,"activo":true},{"id":"oblea","nombre":"Oblea personalizada","precio":30,"activo":true},{"id":"muneca","nombre":"Muñeca decorativa","precio":80,"activo":true},{"id":"velas","nombre":"Velas","precio":25,"activo":true}]'::jsonb,
  '[{"id":"chantilly_fresa","nombre":"Chantilly con fresa","precio_kilo":0,"activo":true},{"id":"chantilly_durazno","nombre":"Chantilly con durazno","precio_kilo":0,"activo":true},{"id":"tres_leches","nombre":"Tres leches","precio_kilo":0,"activo":true},{"id":"chocolate_chochochips","nombre":"Chocolate con chochochips","precio_kilo":0,"activo":true},{"id":"nuez_pasas","nombre":"Nuez con pasas","precio_kilo":0,"activo":true},{"id":"piña","nombre":"Piña","precio_kilo":0,"activo":true},{"id":"crema_pastelera","nombre":"Crema pastelera","precio_kilo":0,"activo":true},{"id":"cajeta","nombre":"Cajeta","precio_kilo":0,"activo":true}]'::jsonb,
  'Morelos No. 162, Barrio San Pedro, Xochimilco','55 1473 3871','55 9350 2639',''
);

alter table sucursales          drop column base44_id;
alter table categorias_producto drop column base44_id;
alter table productos           drop column base44_id;
alter table usuarios_pos        drop column base44_id;
