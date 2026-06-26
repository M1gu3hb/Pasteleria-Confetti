import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { exportToCSV, exportToXLSX } from '@/lib/exportUtils';
import { toast } from 'sonner';

/**
 * Botón reutilizable que exporta una sección a CSV o XLSX.
 * Recibe los datos ya filtrados y la definición de columnas.
 */
export default function ExportarSeccionButton({ rows, columns, filename, label = 'Exportar', size = 'sm' }) {
  const [busy, setBusy] = useState(false);

  const run = async (fmt) => {
    if (!rows?.length) {
      toast.warning('No hay datos para exportar');
      return;
    }
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const fname = `${filename}-${stamp}`;
      if (fmt === 'xlsx') exportToXLSX(rows, columns, fname);
      else exportToCSV(rows, columns, fname);
      toast.success(`Exportado: ${rows.length} registros`);
    } catch (err) {
      toast.error('Error al exportar: ' + (err.message || ''));
    }
    setBusy(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" disabled={busy} className="gap-1.5">
          <Download className="w-4 h-4" />
          {label}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => run('csv')} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-blue-600" /> CSV (Excel/Sheets)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('xlsx')} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="w-4 h-4 text-green-600" /> XLSX (Excel)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}