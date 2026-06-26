import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Mapping: producto nombre → recipe lines [{ ingrediente_nombre, cantidad, unidad }]
// Unit must be the ingrediente's unidad_base.
const RECETAS = {
  'Espresso': [
    { ing: 'Café molido', cantidad: 18, unidad: 'g' },
  ],
  'Americano': [
    { ing: 'Café molido', cantidad: 18, unidad: 'g' },
    { ing: 'Agua', cantidad: 250, unidad: 'ml' },
    { ing: 'Vaso desechable', cantidad: 1, unidad: 'pieza' },
    { ing: 'Tapa desechable', cantidad: 1, unidad: 'pieza' },
  ],
  'Cappuccino': [
    { ing: 'Café molido', cantidad: 18, unidad: 'g' },
    { ing: 'Leche entera', cantidad: 180, unidad: 'ml' },
    { ing: 'Azúcar', cantidad: 8, unidad: 'g' },
    { ing: 'Vaso desechable', cantidad: 1, unidad: 'pieza' },
    { ing: 'Tapa desechable', cantidad: 1, unidad: 'pieza' },
  ],
  'Latte Vainilla': [
    { ing: 'Café molido', cantidad: 18, unidad: 'g' },
    { ing: 'Leche entera', cantidad: 250, unidad: 'ml' },
    { ing: 'Jarabe de vainilla', cantidad: 25, unidad: 'ml' },
    { ing: 'Vaso desechable', cantidad: 1, unidad: 'pieza' },
    { ing: 'Tapa desechable', cantidad: 1, unidad: 'pieza' },
  ],
  'Mocha Frío': [
    { ing: 'Café molido', cantidad: 18, unidad: 'g' },
    { ing: 'Leche entera', cantidad: 220, unidad: 'ml' },
    { ing: 'Chocolate líquido', cantidad: 40, unidad: 'ml' },
    { ing: 'Hielo', cantidad: 120, unidad: 'g' },
    { ing: 'Vaso desechable', cantidad: 1, unidad: 'pieza' },
    { ing: 'Tapa desechable', cantidad: 1, unidad: 'pieza' },
  ],
  'Frappuccino Caramelo': [
    { ing: 'Café molido', cantidad: 18, unidad: 'g' },
    { ing: 'Leche entera', cantidad: 180, unidad: 'ml' },
    { ing: 'Jarabe de caramelo', cantidad: 25, unidad: 'ml' },
    { ing: 'Hielo', cantidad: 100, unidad: 'g' },
    { ing: 'Vaso desechable', cantidad: 1, unidad: 'pieza' },
    { ing: 'Tapa desechable', cantidad: 1, unidad: 'pieza' },
  ],
  'Enchiladas Verdes': [
    { ing: 'Tortilla maíz', cantidad: 3, unidad: 'pieza' },
    { ing: 'Pollo cocido', cantidad: 120, unidad: 'g' },
    { ing: 'Salsa verde', cantidad: 120, unidad: 'ml' },
    { ing: 'Crema ácida', cantidad: 25, unidad: 'ml' },
    { ing: 'Queso fresco', cantidad: 30, unidad: 'g' },
  ],
  'Tostada con Aguacate': [
    { ing: 'Pan tostado', cantidad: 1, unidad: 'pieza' },
    { ing: 'Aguacate', cantidad: 80, unidad: 'g' },
    { ing: 'Aceite oliva', cantidad: 5, unidad: 'ml' },
    { ing: 'Queso fresco', cantidad: 10, unidad: 'g' },
  ],
  'Pan de Boló': [
    { ing: 'Harina trigo', cantidad: 60, unidad: 'g' },
    { ing: 'Mantequilla', cantidad: 20, unidad: 'g' },
    { ing: 'Azúcar', cantidad: 20, unidad: 'g' },
    { ing: 'Huevo', cantidad: 0.25, unidad: 'pieza' },
    { ing: 'Levadura', cantidad: 5, unidad: 'g' },
  ],
  'Crème Brûlée': [
    { ing: 'Crema ácida', cantidad: 150, unidad: 'ml' },
    { ing: 'Huevo', cantidad: 1, unidad: 'pieza' },
    { ing: 'Azúcar', cantidad: 35, unidad: 'g' },
    { ing: 'Jarabe de vainilla', cantidad: 5, unidad: 'ml' },
  ],
};

// Default ingredient costs (per unidad_base) and stock — used if ingredient doesn't exist yet
const SEED_INGREDIENTES = [
  { nombre: 'Café molido', unidad_base: 'g', costo_por_unidad_base: 0.45, stock_actual: 5000, stock_minimo: 1000, stock_critico: 500, unidad_compra_default: 'kg', cantidad_por_compra_default: 1000, costo_compra_default: 450 },
  { nombre: 'Agua', unidad_base: 'ml', costo_por_unidad_base: 0.002, stock_actual: 50000, stock_minimo: 5000, stock_critico: 1000, unidad_compra_default: 'litro', cantidad_por_compra_default: 1000, costo_compra_default: 2 },
  { nombre: 'Leche entera', unidad_base: 'ml', costo_por_unidad_base: 0.028, stock_actual: 20000, stock_minimo: 5000, stock_critico: 1000, unidad_compra_default: 'litro', cantidad_por_compra_default: 1000, costo_compra_default: 28 },
  { nombre: 'Azúcar', unidad_base: 'g', costo_por_unidad_base: 0.025, stock_actual: 10000, stock_minimo: 2000, stock_critico: 500, unidad_compra_default: 'kg', cantidad_por_compra_default: 1000, costo_compra_default: 25 },
  { nombre: 'Jarabe de vainilla', unidad_base: 'ml', costo_por_unidad_base: 0.12, stock_actual: 2000, stock_minimo: 500, stock_critico: 100, unidad_compra_default: 'litro', cantidad_por_compra_default: 1000, costo_compra_default: 120 },
  { nombre: 'Chocolate líquido', unidad_base: 'ml', costo_por_unidad_base: 0.18, stock_actual: 2000, stock_minimo: 500, stock_critico: 100, unidad_compra_default: 'litro', cantidad_por_compra_default: 1000, costo_compra_default: 180 },
  { nombre: 'Hielo', unidad_base: 'g', costo_por_unidad_base: 0.005, stock_actual: 10000, stock_minimo: 1000, stock_critico: 200, unidad_compra_default: 'kg', cantidad_por_compra_default: 1000, costo_compra_default: 5 },
  { nombre: 'Aceite oliva', unidad_base: 'ml', costo_por_unidad_base: 0.25, stock_actual: 3000, stock_minimo: 500, stock_critico: 100, unidad_compra_default: 'litro', cantidad_por_compra_default: 1000, costo_compra_default: 250 },
  { nombre: 'Levadura', unidad_base: 'g', costo_por_unidad_base: 0.4, stock_actual: 500, stock_minimo: 100, stock_critico: 30, unidad_compra_default: 'paquete', cantidad_por_compra_default: 100, costo_compra_default: 40 },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body?.rol !== 'administrador') {
      return Response.json({ error: 'Forbidden: solo administrador' }, { status: 403 });
    }

    // 1. Ensure ingredients exist
    const existing = await base44.asServiceRole.entities.Ingrediente.list('-created_date', 500);
    const byName = new Map(existing.map(i => [i.nombre.toLowerCase().trim(), i]));

    let ingCreados = 0;
    for (const seed of SEED_INGREDIENTES) {
      if (!byName.has(seed.nombre.toLowerCase().trim())) {
        const created = await base44.asServiceRole.entities.Ingrediente.create({ ...seed, activo: true });
        byName.set(seed.nombre.toLowerCase().trim(), created);
        ingCreados++;
      }
    }

    // 2. Recipes per producto
    const productos = await base44.asServiceRole.entities.ProductoTerminado.list('-created_date', 500);
    const oldRecetas = await base44.asServiceRole.entities.RecetaEscandallo.list('-created_date', 1000);
    let recetasCreadas = 0;
    let productosActualizados = 0;
    const noEncontrados = [];

    for (const [prodNombre, lineas] of Object.entries(RECETAS)) {
      const prod = productos.find(p => p.nombre.toLowerCase().trim() === prodNombre.toLowerCase().trim());
      if (!prod) { noEncontrados.push(prodNombre); continue; }

      // Delete previous recipe lines for this product
      const previas = oldRecetas.filter(r => r.producto_id === prod.id);
      for (const r of previas) {
        await base44.asServiceRole.entities.RecetaEscandallo.delete(r.id);
      }

      let costoTotal = 0;
      for (const linea of lineas) {
        const ing = byName.get(linea.ing.toLowerCase().trim());
        if (!ing) continue;
        const costoLinea = (linea.cantidad || 0) * (ing.costo_por_unidad_base || 0);
        costoTotal += costoLinea;
        await base44.asServiceRole.entities.RecetaEscandallo.create({
          producto_id: prod.id,
          ingrediente_id: ing.id,
          ingrediente_nombre: ing.nombre,
          cantidad_usada: linea.cantidad,
          unidad_usada: linea.unidad,
          cantidad_convertida_unidad_base: linea.cantidad,
          merma_porcentaje: 0,
          costo_unitario_base_snapshot: ing.costo_por_unidad_base,
          costo_linea_calculado: Math.round(costoLinea * 100) / 100,
          activo: true,
        });
        recetasCreadas++;
      }

      const utilidad = (prod.precio_venta || 0) - costoTotal;
      const margen = (prod.precio_venta || 0) > 0 ? (utilidad / prod.precio_venta * 100) : 0;
      await base44.asServiceRole.entities.ProductoTerminado.update(prod.id, {
        costo_calculado_actual: Math.round(costoTotal * 100) / 100,
        utilidad_bruta_actual: Math.round(utilidad * 100) / 100,
        margen_bruto_actual: Math.round(margen * 10) / 10,
      });
      productosActualizados++;
    }

    return Response.json({
      ok: true,
      ingredientesCreados: ingCreados,
      recetasCreadas,
      productosActualizados,
      productosNoEncontrados: noEncontrados,
    });
  } catch (e) {
    return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
});