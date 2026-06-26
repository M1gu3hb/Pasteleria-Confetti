import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet } from 'lucide-react';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';

/**
 * Plantillas vacías descargables — guían al admin sobre las columnas correctas.
 * Solo descarga CSV con encabezado + 1 fila de ejemplo. NO crea datos.
 */
const PLANTILLAS = [
  {
    key: 'inventario',
    titulo: 'Plantilla — Inventario / Ingredientes',
    descripcion: 'Carga masiva de ingredientes con stock inicial.',
    columns: [
      { key: 'nombre', label: 'nombre' },
      { key: 'unidad_base', label: 'unidad_base' },
      { key: 'stock_actual', label: 'stock_actual' },
      { key: 'stock_minimo', label: 'stock_minimo' },
      { key: 'stock_critico', label: 'stock_critico' },
      { key: 'costo_por_unidad_base', label: 'costo_por_unidad_base' },
      { key: 'unidad_compra_default', label: 'unidad_compra_default' },
      { key: 'cantidad_por_compra_default', label: 'cantidad_por_compra_default' },
      { key: 'costo_compra_default', label: 'costo_compra_default' },
      { key: 'activo', label: 'activo' },
      { key: 'notas', label: 'notas' },
    ],
    ejemplo: [{
      nombre: 'Café molido',
      unidad_base: 'g',
      stock_actual: 1000,
      stock_minimo: 200,
      stock_critico: 100,
      costo_por_unidad_base: 0.45,
      unidad_compra_default: 'kg',
      cantidad_por_compra_default: 1,
      costo_compra_default: 450,
      activo: 'sí',
      notas: 'Tueste medio',
    }],
  },
  {
    key: 'productos',
    titulo: 'Plantilla — Productos',
    descripcion: 'Carga masiva del catálogo de productos vendibles.',
    columns: [
      { key: 'nombre', label: 'nombre' },
      { key: 'categoria', label: 'categoria' },
      { key: 'precio_venta', label: 'precio_venta' },
      { key: 'descripcion', label: 'descripcion' },
      { key: 'area_preparacion', label: 'area_preparacion' },
      { key: 'visible_en_pos', label: 'visible_en_pos' },
      { key: 'activo', label: 'activo' },
    ],
    ejemplo: [{
      nombre: 'Capuchino',
      categoria: 'Bebidas calientes',
      precio_venta: 55,
      descripcion: 'Café con leche vaporizada',
      area_preparacion: 'barra',
      visible_en_pos: 'sí',
      activo: 'sí',
    }],
  },
  {
    key: 'recetas',
    titulo: 'Plantilla — Recetas / Escandallos',
    descripcion: 'Una fila por ingrediente. Unidad debe ser compatible con la base (g, kg, ml, l, pieza).',
    columns: [
      { key: 'producto_nombre', label: 'producto_nombre' },
      { key: 'ingrediente_nombre', label: 'ingrediente_nombre' },
      { key: 'cantidad', label: 'cantidad' },
      { key: 'unidad', label: 'unidad' },
      { key: 'merma_porcentaje', label: 'merma_porcentaje' },
      { key: 'notas', label: 'notas' },
    ],
    ejemplo: [
      { producto_nombre: 'Capuchino', ingrediente_nombre: 'Café molido', cantidad: 18, unidad: 'g', merma_porcentaje: 0, notas: '' },
      { producto_nombre: 'Capuchino', ingrediente_nombre: 'Leche', cantidad: 180, unidad: 'ml', merma_porcentaje: 0, notas: '' },
      { producto_nombre: 'Capuchino', ingrediente_nombre: 'Vaso 12oz', cantidad: 1, unidad: 'pieza', merma_porcentaje: 0, notas: '' },
    ],
  },
  {
    key: 'proveedores',
    titulo: 'Plantilla — Proveedores',
    descripcion: 'Carga masiva de proveedores de insumos.',
    columns: [
      { key: 'nombre', label: 'nombre' },
      { key: 'contacto', label: 'contacto' },
      { key: 'telefono', label: 'telefono' },
      { key: 'correo', label: 'correo' },
      { key: 'notas', label: 'notas' },
      { key: 'activo', label: 'activo' },
    ],
    ejemplo: [{
      nombre: 'Panadería San José',
      contacto: 'Carlos R.',
      telefono: '555-1234',
      correo: 'ventas@sanjose.mx',
      notas: 'Entrega lunes y jueves',
      activo: 'sí',
    }],
  },
  {
    key: 'gastos',
    titulo: 'Plantilla — Gastos operativos',
    descripcion: 'Para registrar gastos pasados (renta, luz, etc.). Fechas en formato AAAA-MM-DD.',
    columns: [
      { key: 'fecha', label: 'fecha' },
      { key: 'descripcion', label: 'descripcion' },
      { key: 'categoria', label: 'categoria' },
      { key: 'monto', label: 'monto' },
      { key: 'metodo_pago', label: 'metodo_pago' },
      { key: 'notas', label: 'notas' },
    ],
    ejemplo: [{
      fecha: '2026-05-01',
      descripcion: 'Renta local',
      categoria: 'servicios',
      monto: 12000,
      metodo_pago: 'transferencia',
      notas: '',
    }],
  },
];

export default function PlantillasDescargables() {
  const handle = (p) => {
    try {
      exportToCSV(p.ejemplo, p.columns, `plantilla_${p.key}`);
      toast.success(`Plantilla de ${p.key} descargada`);
    } catch (e) {
      toast.error('No se pudo descargar la plantilla: ' + (e?.message || ''));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-primary" />
          Plantillas vacías para carga masiva
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Descarga, llena el archivo en Excel o Google Sheets y súbelo en la sección de Importar.
          El archivo trae una fila de ejemplo — bórrala antes de cargar tus datos.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PLANTILLAS.map(p => (
          <div key={p.key} className="p-3 rounded-lg border bg-muted/30 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{p.titulo}</p>
              <p className="text-[11px] text-muted-foreground">{p.descripcion}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => handle(p)} className="shrink-0">
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}