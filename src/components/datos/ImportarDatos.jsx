import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Boxes, Tag, BookOpen, Truck, Receipt } from 'lucide-react';
import ImportarDatosDialog from '@/components/datos/ImportarDatosDialog';

/**
 * Tarjetas que abren el dialog de importación según tipo.
 * Cada tipo es independiente: si uno falla, los demás siguen funcionando.
 */
const TIPOS = [
  { key: 'inventario', titulo: 'Inventario / Ingredientes', descripcion: 'Carga masiva con anti-duplicados.', icon: Boxes },
  { key: 'productos', titulo: 'Productos', descripcion: 'Catálogo con categorías y precios.', icon: Tag },
  { key: 'recetas', titulo: 'Recetas', descripcion: 'Requiere ingredientes y productos creados primero.', icon: BookOpen },
  { key: 'proveedores', titulo: 'Proveedores', descripcion: 'Directorio de proveedores.', icon: Truck },
  { key: 'gastos', titulo: 'Gastos operativos', descripcion: 'Historial de gastos pasados.', icon: Receipt },
];

export default function ImportarDatos() {
  const [tipoActivo, setTipoActivo] = useState(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
          Importar datos desde archivo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sube un CSV (usa la plantilla descargable). El sistema valida primero y
          muestra vista previa. <strong>Nada se guarda hasta que confirmes.</strong>
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TIPOS.map(t => (
          <div key={t.key} className="p-3 rounded-lg border bg-muted/30 flex items-start gap-3">
            <t.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t.titulo}</p>
              <p className="text-[11px] text-muted-foreground">{t.descripcion}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setTipoActivo(t.key)} className="shrink-0">
              <Upload className="w-3.5 h-3.5 mr-1" /> Importar
            </Button>
          </div>
        ))}
      </CardContent>

      <ImportarDatosDialog
        open={!!tipoActivo}
        tipo={tipoActivo}
        onClose={() => setTipoActivo(null)}
      />
    </Card>
  );
}