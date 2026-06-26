import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Database, Loader2 } from 'lucide-react';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';

/**
 * Exportación de datos actuales en CSV compatible con Excel.
 * Solo LEE de la base de datos — nunca modifica.
 * Cada botón es independiente para minimizar el riesgo si alguno falla.
 */

const hoy = () => new Date().toISOString().slice(0, 10);

const BLOQUES = [
  {
    key: 'inventario',
    titulo: 'Inventario / Ingredientes',
    descripcion: 'Todos los ingredientes con stock, costo y datos maestros.',
    fetch: () => base44.entities.Ingrediente.list('-created_date', 5000),
    columns: [
      { key: 'id', label: 'id' },
      { key: 'nombre', label: 'nombre' },
      { key: 'unidad_base', label: 'unidad_base' },
      { key: 'stock_actual', label: 'stock_actual' },
      { key: 'stock_minimo', label: 'stock_minimo' },
      { key: 'stock_critico', label: 'stock_critico' },
      { key: 'costo_por_unidad_base', label: 'costo_por_unidad_base' },
      { key: 'unidad_compra_default', label: 'unidad_compra_default' },
      { key: 'cantidad_por_compra_default', label: 'cantidad_por_compra_default' },
      { key: 'costo_compra_default', label: 'costo_compra_default' },
      { key: 'activo', label: 'activo', format: (v) => (v === false ? 'no' : 'sí') },
      { key: 'notas', label: 'notas' },
    ],
  },
  {
    key: 'productos',
    titulo: 'Productos',
    descripcion: 'Catálogo de productos vendibles con precio y categoría.',
    fetch: () => base44.entities.ProductoTerminado.list('-created_date', 5000),
    columns: [
      { key: 'id', label: 'id' },
      { key: 'nombre', label: 'nombre' },
      { key: 'categoria_nombre', label: 'categoria' },
      { key: 'precio_venta', label: 'precio_venta' },
      { key: 'descripcion', label: 'descripcion' },
      { key: 'area_preparacion', label: 'area_preparacion' },
      { key: 'visible_en_pos', label: 'visible_en_pos', format: (v) => (v === false ? 'no' : 'sí') },
      { key: 'activo', label: 'activo', format: (v) => (v === false ? 'no' : 'sí') },
    ],
  },
  {
    key: 'recetas',
    titulo: 'Recetas / Escandallos',
    descripcion: 'Una fila por par producto-ingrediente.',
    custom: async () => {
      // Cruzamos productos para obtener nombres legibles.
      const [recetas, productos] = await Promise.all([
        base44.entities.RecetaEscandallo.list('-created_date', 10000),
        base44.entities.ProductoTerminado.list('-created_date', 5000),
      ]);
      const safeProductos = Array.isArray(productos) ? productos : [];
      const mapProd = new Map(safeProductos.map(p => [p.id, p.nombre]));
      const safeRecetas = Array.isArray(recetas) ? recetas : [];
      return safeRecetas
        .filter(r => r.activo !== false)
        .map(r => ({
          producto_nombre: mapProd.get(r.producto_id) || r.producto_id || '',
          ingrediente_nombre: r.ingrediente_nombre || '',
          cantidad: r.cantidad_usada || 0,
          unidad: r.unidad_usada || '',
          merma_porcentaje: r.merma_porcentaje || 0,
          notas: r.notas || '',
        }));
    },
    columns: [
      { key: 'producto_nombre', label: 'producto_nombre' },
      { key: 'ingrediente_nombre', label: 'ingrediente_nombre' },
      { key: 'cantidad', label: 'cantidad' },
      { key: 'unidad', label: 'unidad' },
      { key: 'merma_porcentaje', label: 'merma_porcentaje' },
      { key: 'notas', label: 'notas' },
    ],
  },
  {
    key: 'proveedores',
    titulo: 'Proveedores',
    descripcion: 'Directorio completo (activos e inactivos).',
    fetch: () => base44.entities.Proveedor.list('-created_date', 5000),
    columns: [
      { key: 'id', label: 'id' },
      { key: 'nombre', label: 'nombre' },
      { key: 'contacto', label: 'contacto' },
      { key: 'telefono', label: 'telefono' },
      { key: 'correo', label: 'correo' },
      { key: 'notas', label: 'notas' },
      { key: 'activo', label: 'activo', format: (v) => (v === false ? 'no' : 'sí') },
    ],
  },
  {
    key: 'compras',
    titulo: 'Compras de insumos',
    descripcion: 'Historial de compras registradas. SOLO EXPORTACIÓN.',
    fetch: () => base44.entities.CompraInsumo.list('-fecha', 10000),
    columns: [
      { key: 'id', label: 'id' },
      { key: 'fecha', label: 'fecha' },
      { key: 'proveedor_nombre', label: 'proveedor' },
      { key: 'total_compra', label: 'total' },
      { key: 'metodo_pago', label: 'metodo_pago' },
      { key: 'usuario_nombre', label: 'registrado_por' },
      { key: 'notas', label: 'notas' },
    ],
  },
  {
    key: 'gastos',
    titulo: 'Gastos operativos',
    descripcion: 'Historial completo de gastos (renta, servicios, etc.).',
    fetch: () => base44.entities.GastoOperativo.list('-fecha', 10000),
    columns: [
      { key: 'id', label: 'id' },
      { key: 'fecha', label: 'fecha' },
      { key: 'descripcion', label: 'descripcion' },
      { key: 'categoria', label: 'categoria' },
      { key: 'monto', label: 'monto' },
      { key: 'metodo_pago', label: 'metodo_pago' },
      { key: 'usuario_nombre', label: 'registrado_por' },
      { key: 'notas', label: 'notas' },
    ],
  },
  {
    key: 'plantillas_gasto',
    titulo: 'Plantillas de gasto recurrentes',
    descripcion: 'Catálogo de gastos fijos (renta, luz, etc.).',
    fetch: () => base44.entities.PlantillaGasto.filter({ activa: true }),
    columns: [
      { key: 'id', label: 'id' },
      { key: 'nombre', label: 'nombre' },
      { key: 'categoria', label: 'categoria' },
      { key: 'monto_sugerido', label: 'monto_sugerido' },
      { key: 'metodo_pago', label: 'metodo_pago' },
      { key: 'periodicidad', label: 'periodicidad' },
      { key: 'dia_pago_sugerido', label: 'dia_pago' },
      { key: 'notas', label: 'notas' },
    ],
  },
  {
    key: 'categorias',
    titulo: 'Categorías de productos',
    descripcion: 'Categorías usadas en el catálogo.',
    fetch: () => base44.entities.CategoriaProducto.filter({ activo: true }),
    columns: [
      { key: 'id', label: 'id' },
      { key: 'nombre', label: 'nombre' },
      { key: 'descripcion', label: 'descripcion' },
      { key: 'orden', label: 'orden' },
    ],
  },
];

export default function ExportarDatos() {
  const [loading, setLoading] = useState(null);
  const [exportandoTodo, setExportandoTodo] = useState(false);

  const exportar = async (bloque) => {
    setLoading(bloque.key);
    try {
      const rows = bloque.custom ? await bloque.custom() : await bloque.fetch();
      const safeRows = Array.isArray(rows) ? rows : [];
      if (safeRows.length === 0) {
        toast.info(`No hay datos en ${bloque.titulo} para exportar.`);
        setLoading(null);
        return;
      }
      exportToCSV(safeRows, bloque.columns, `${bloque.key}_POS_MH_${hoy()}`);
      toast.success(`${bloque.titulo}: ${safeRows.length} fila(s) exportada(s).`);
    } catch (e) {
      toast.error(`Error al exportar ${bloque.titulo}: ${e?.message || ''}`);
    }
    setLoading(null);
  };

  // Genera un respaldo completo descargando UN archivo por bloque,
  // separados para evitar dependencias de ZIP.
  const exportarTodo = async () => {
    setExportandoTodo(true);
    let ok = 0;
    let fail = 0;
    for (const b of BLOQUES) {
      try {
        const rows = b.custom ? await b.custom() : await b.fetch();
        const safeRows = Array.isArray(rows) ? rows : [];
        if (safeRows.length > 0) {
          exportToCSV(safeRows, b.columns, `${b.key}_POS_MH_${hoy()}`);
          ok++;
          // Pequeña pausa para que el navegador no agrupe los downloads
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (e) {
        console.warn('[ExportarDatos] falló bloque', b.key, e);
        fail++;
      }
    }
    setExportandoTodo(false);
    toast.success(`Respaldo completo: ${ok} archivo(s) descargado(s)${fail ? `, ${fail} falló(aron)` : ''}.`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          Exportar datos actuales
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Descarga tu información en CSV compatible con Excel y Google Sheets.
          Exportar nunca modifica tus datos — es solo de lectura.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BLOQUES.map(b => (
            <div key={b.key} className="p-3 rounded-lg border bg-muted/30 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{b.titulo}</p>
                <p className="text-[11px] text-muted-foreground">{b.descripcion}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportar(b)}
                disabled={loading === b.key || exportandoTodo}
                className="shrink-0"
              >
                {loading === b.key
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5 mr-1" />}
                {loading === b.key ? '' : 'CSV'}
              </Button>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t">
          <Button onClick={exportarTodo} disabled={exportandoTodo} className="w-full">
            {exportandoTodo
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando respaldo…</>
              : <><Download className="w-4 h-4 mr-2" /> Exportar TODO el respaldo (varios archivos)</>}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Se descarga un archivo CSV por cada bloque. Guárdalos juntos en una carpeta.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}