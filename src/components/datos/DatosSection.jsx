import React from 'react';
import PlantillasDescargables from '@/components/datos/PlantillasDescargables';
import ExportarDatos from '@/components/datos/ExportarDatos';
import ImportarDatos from '@/components/datos/ImportarDatos';
import { Database } from 'lucide-react';

/**
 * Sección "Base de datos y respaldo" — agrupa export/import/plantillas.
 * Se usa dentro de pages/Configuracion como una pestaña dedicada.
 */
export default function DatosSection() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-heading font-semibold text-sm">Exportar datos e importar catálogo</p>
            <p className="text-xs text-muted-foreground mt-1">
              Descarga archivos CSV de las secciones disponibles o importa productos al catálogo.
              Estos archivos no son un respaldo completo para restaurar el sistema.
              Antes de importar, el sistema validará el archivo y te mostrará una vista previa.
              <strong> Nada se guarda hasta que confirmes.</strong>
            </p>
          </div>
        </div>
      </div>

      <ExportarDatos />
      <PlantillasDescargables />
      <ImportarDatos />
    </div>
  );
}
