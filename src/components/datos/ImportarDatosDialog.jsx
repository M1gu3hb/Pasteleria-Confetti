import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Upload, AlertTriangle, CheckCircle2, XCircle, Info, Loader2, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseCSV } from '@/utils/csvParser';
import {
  validarInventario, validarProductos, validarRecetas,
  validarProveedores, validarGastos,
} from '@/utils/importValidators';
import {
  ejecutarImportInventario, ejecutarImportProductos, ejecutarImportRecetas,
  ejecutarImportProveedores, ejecutarImportGastos,
} from '@/utils/importExecutors';
import { usePOSAuth } from '@/lib/POSAuthContext';

/**
 * Dialog de importación masiva en 3 pasos:
 *  1) Cargar archivo CSV.
 *  2) Vista previa con conteos y problemas por fila.
 *  3) Confirmar → ejecutar y mostrar reporte.
 *
 * NUNCA escribe en BD sin que el usuario pulse "Confirmar importación".
 */
export default function ImportarDatosDialog({ open, onClose, tipo }) {
  const { posUser } = usePOSAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [paso, setPaso] = useState(1); // 1=cargar, 2=preview, 3=reporte
  const [archivo, setArchivo] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState(null); // { rows, resumen }
  const [ajustarStock, setAjustarStock] = useState(false);
  const [crearCategorias, setCrearCategorias] = useState(true);
  const [reemplazarReceta, setReemplazarReceta] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [reporte, setReporte] = useState(null);

  const TITULOS = {
    inventario: 'Importar inventario / ingredientes',
    productos: 'Importar productos',
    recetas: 'Importar recetas',
    proveedores: 'Importar proveedores',
    gastos: 'Importar gastos operativos',
  };

  const reset = () => {
    setPaso(1);
    setArchivo(null);
    setPreview(null);
    setReporte(null);
    setEjecutando(false);
    setParsing(false);
    setAjustarStock(false);
    setCrearCategorias(true);
    setReemplazarReceta(false);
  };

  const handleClose = () => {
    if (parsing || ejecutando) return;
    reset();
    onClose();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setParsing(true);
    try {
      const text = await file.text();
      const { rows } = parseCSV(text);
      if (!rows || rows.length === 0) {
        toast.error('El archivo no contiene filas.');
        setParsing(false);
        return;
      }

      // Cargar snapshot actual de BD según tipo
      let snapshot = {};
      if (tipo === 'inventario') {
        snapshot.ingredientes = await base44.entities.Ingrediente.list('-created_date', 5000).catch(() => []);
      } else if (tipo === 'productos') {
        const [productos, categorias] = await Promise.all([
          base44.entities.ProductoTerminado.list('-created_date', 5000).catch(() => []),
          base44.entities.CategoriaProducto.filter({ activo: true }).catch(() => []),
        ]);
        snapshot.productos = productos;
        snapshot.categorias = categorias;
      } else if (tipo === 'recetas') {
        const [ingredientes, productos] = await Promise.all([
          base44.entities.Ingrediente.list('-created_date', 5000).catch(() => []),
          base44.entities.ProductoTerminado.list('-created_date', 5000).catch(() => []),
        ]);
        snapshot.ingredientes = ingredientes;
        snapshot.productos = productos;
      } else if (tipo === 'proveedores') {
        snapshot.proveedores = await base44.entities.Proveedor.list('-created_date', 5000).catch(() => []);
      }

      let result = null;
      if (tipo === 'inventario') result = validarInventario(rows, snapshot);
      else if (tipo === 'productos') result = validarProductos(rows, snapshot);
      else if (tipo === 'recetas') result = validarRecetas(rows, snapshot);
      else if (tipo === 'proveedores') result = validarProveedores(rows, snapshot);
      else if (tipo === 'gastos') result = validarGastos(rows);

      setPreview(result);
      setPaso(2);
    } catch (e) {
      toast.error('No se pudo leer el archivo: ' + (e?.message || ''));
    }
    setParsing(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const ejecutar = async () => {
    if (!preview) return;
    setEjecutando(true);
    try {
      let r = null;
      if (tipo === 'inventario') {
        r = await ejecutarImportInventario(preview.rows, { ajustarStock, posUser });
        ['ingredientes_all', 'movimientos_inv', 'registros_movimientos'].forEach(k =>
          queryClient.invalidateQueries({ queryKey: [k] }));
      } else if (tipo === 'productos') {
        r = await ejecutarImportProductos(preview.rows, { crearCategoriasFaltantes: crearCategorias });
        ['productos_all', 'productos_pos', 'categorias_producto'].forEach(k =>
          queryClient.invalidateQueries({ queryKey: [k] }));
      } else if (tipo === 'recetas') {
        r = await ejecutarImportRecetas(preview.rows, { reemplazarExistente: reemplazarReceta });
        ['recetas_all', 'productos_all', 'productos_pos'].forEach(k =>
          queryClient.invalidateQueries({ queryKey: [k] }));
      } else if (tipo === 'proveedores') {
        r = await ejecutarImportProveedores(preview.rows);
        queryClient.invalidateQueries({ queryKey: ['proveedores_activos'] });
      } else if (tipo === 'gastos') {
        r = await ejecutarImportGastos(preview.rows, { posUser });
        ['gastos_hoy', 'registros_gastos'].forEach(k =>
          queryClient.invalidateQueries({ queryKey: [k] }));
      }
      setReporte(r);
      setPaso(3);
      toast.success('Importación completada. Revisa el reporte.');
    } catch (e) {
      toast.error('Error en importación: ' + (e?.message || ''));
    }
    setEjecutando(false);
  };

  const resumen = preview?.resumen || {};
  const hayErrores = (resumen.errores || 0) > 0;
  const hayFilasValidas = preview && (preview.rows || []).some(r => r.status !== 'error' && r.parsed);
  // Para RECETAS: si hay CUALQUIER error en el archivo, bloqueamos confirmación entera.
  // El costeo de recetas afecta utilidad/margen/reportes — no se permiten parciales.
  const bloqueadoPorErroresCriticos = tipo === 'recetas' && hayErrores;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="font-heading">{TITULOS[tipo] || 'Importar'}</DialogTitle>
          <DialogDescription className="text-xs">
            Paso {paso} de 3 — {paso === 1 ? 'cargar archivo' : paso === 2 ? 'vista previa' : 'reporte final'}.
            Nada se guarda hasta que confirmes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* PASO 1: cargar */}
          {paso === 1 && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg border-2 border-dashed bg-muted/30 text-center">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Selecciona un archivo CSV</p>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Usa la plantilla descargable para asegurar las columnas correctas.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="hidden"
                />
                <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
                  {parsing
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Leyendo…</>
                    : <><Upload className="w-4 h-4 mr-2" /> Elegir archivo</>}
                </Button>
                {archivo && <p className="text-[11px] text-muted-foreground mt-2">{archivo.name}</p>}
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs">
                <p className="font-medium flex items-center gap-1 mb-1">
                  <Info className="w-3.5 h-3.5" /> Importante
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  <li>Nada se guarda en este paso. Solo se leen y validan datos.</li>
                  <li>Después verás una vista previa con problemas detectados.</li>
                  <li>Tienes que confirmar antes de escribir en la base de datos.</li>
                </ul>
              </div>
            </div>
          )}

          {/* PASO 2: preview */}
          {paso === 2 && preview && (
            <div className="space-y-4">
              <ResumenPreview tipo={tipo} resumen={resumen} />

              {/* Opciones específicas por tipo */}
              {tipo === 'inventario' && (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">Ajustar stock al valor del archivo</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Si está apagado, solo se actualizan datos maestros (costo, mínimos) sin tocar stock.
                        Si está encendido, el stock se ajusta y se crea MovimientoInventario por cada cambio.
                      </p>
                    </div>
                    <Switch checked={ajustarStock} onCheckedChange={setAjustarStock} />
                  </div>
                </div>
              )}
              {tipo === 'productos' && (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">Crear categorías nuevas si no existen</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Si está apagado, los productos con categoría inexistente se crearán sin categoría.
                      </p>
                    </div>
                    <Switch checked={crearCategorias} onCheckedChange={setCrearCategorias} />
                  </div>
                </div>
              )}
              {tipo === 'recetas' && (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">Reemplazar receta existente</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Si el producto ya tiene receta y esta opción está apagada, se OMITIRÁ para evitar borrar tu trabajo.
                      </p>
                    </div>
                    <Switch checked={reemplazarReceta} onCheckedChange={setReemplazarReceta} />
                  </div>
                </div>
              )}

              {/* Listado de filas */}
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-medium border-b">
                  Detalle por fila ({preview.rows.length})
                </div>
                <div className="max-h-72 overflow-y-auto divide-y">
                  {preview.rows.map((r, i) => (
                    <FilaPreview key={i} fila={r} tipo={tipo} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PASO 3: reporte */}
          {paso === 3 && reporte && (
            <ReporteFinal reporte={reporte} tipo={tipo} />
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t flex-row gap-2 justify-end">
          {paso === 1 && (
            <Button variant="outline" onClick={handleClose} disabled={parsing}>Cancelar</Button>
          )}
          {paso === 2 && (
            <>
              <Button variant="outline" onClick={() => { setPaso(1); setPreview(null); }} disabled={ejecutando}>
                Volver
              </Button>
              <Button
                onClick={ejecutar}
                disabled={ejecutando || !hayFilasValidas || bloqueadoPorErroresCriticos}
                title={bloqueadoPorErroresCriticos ? 'Hay errores en el archivo. Corrige el CSV y vuelve a cargarlo.' : ''}
              >
                {ejecutando
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando…</>
                  : bloqueadoPorErroresCriticos
                    ? 'Corrige el archivo para continuar'
                    : 'Confirmar importación'}
              </Button>
            </>
          )}
          {paso === 3 && (
            <Button onClick={handleClose}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumenPreview({ tipo, resumen }) {
  const items = [];
  if ('nuevas' in resumen) items.push({ label: 'Nuevos', value: resumen.nuevas, color: 'bg-emerald-100 text-emerald-700' });
  if ('actualizar' in resumen) items.push({ label: 'A actualizar', value: resumen.actualizar, color: 'bg-blue-100 text-blue-700' });
  if ('validas' in resumen) items.push({ label: 'Válidos', value: resumen.validas, color: 'bg-emerald-100 text-emerald-700' });
  if ('advertencias' in resumen) items.push({ label: 'Advertencias', value: resumen.advertencias, color: 'bg-amber-100 text-amber-700' });
  if ('errores' in resumen) items.push({ label: 'Errores', value: resumen.errores, color: 'bg-rose-100 text-rose-700' });
  if ('inactivos' in resumen) items.push({ label: 'Inactivos detectados', value: resumen.inactivos, color: 'bg-amber-100 text-amber-700' });
  if ('duplicadasArchivo' in resumen) items.push({ label: 'Duplicados en archivo', value: resumen.duplicadasArchivo, color: 'bg-rose-100 text-rose-700' });
  if ('total' in resumen) items.push({ label: 'Total filas', value: resumen.total, color: 'bg-slate-100 text-slate-700' });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map(it => (
          <div key={it.label} className={`p-2 rounded-lg text-center ${it.color}`}>
            <p className="text-[10px] uppercase tracking-wide">{it.label}</p>
            <p className="text-xl font-bold">{it.value || 0}</p>
          </div>
        ))}
      </div>
      {tipo === 'recetas' && (resumen.ingredientesFaltantes?.length > 0 || resumen.productosFaltantes?.length > 0) && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs space-y-2">
          {resumen.ingredientesFaltantes?.length > 0 && (
            <div>
              <p className="font-medium mb-1">Ingredientes faltantes ({resumen.ingredientesFaltantes.length}):</p>
              <div className="flex flex-wrap gap-1">
                {resumen.ingredientesFaltantes.slice(0, 30).map(n =>
                  <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>
                )}
                {resumen.ingredientesFaltantes.length > 30 && <Badge variant="outline" className="text-[10px]">+{resumen.ingredientesFaltantes.length - 30}</Badge>}
              </div>
            </div>
          )}
          {resumen.productosFaltantes?.length > 0 && (
            <div>
              <p className="font-medium mb-1">Productos faltantes ({resumen.productosFaltantes.length}):</p>
              <div className="flex flex-wrap gap-1">
                {resumen.productosFaltantes.slice(0, 30).map(n =>
                  <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>
                )}
              </div>
            </div>
          )}
          <p className="text-[10px] mt-1">Crea estos datos primero (inventario / productos) y vuelve a subir el archivo.</p>
        </div>
      )}
      {tipo === 'productos' && resumen.categoriasFaltantes?.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs">
          <p className="font-medium mb-1">Categorías nuevas detectadas ({resumen.categoriasFaltantes.length}):</p>
          <div className="flex flex-wrap gap-1">
            {resumen.categoriasFaltantes.slice(0, 20).map(n =>
              <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaPreview({ fila, tipo }) {
  const icon = fila.status === 'error'
    ? <XCircle className="w-3.5 h-3.5 text-rose-500" />
    : fila.status === 'advertencia'
      ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
      : fila.status === 'actualizar'
        ? <Info className="w-3.5 h-3.5 text-blue-500" />
        : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  const titulo = fila.parsed?.nombre || fila.parsed?.producto_nombre || fila.parsed?.descripcion || `Línea ${fila.line}`;
  return (
    <div className="px-3 py-2 text-xs flex items-start gap-2 hover:bg-muted/30">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          <span className="text-muted-foreground mr-1">L{fila.line}:</span>
          {titulo}
        </p>
        {(fila.messages || []).map((m, i) => (
          <p key={i} className="text-[11px] text-muted-foreground">{m}</p>
        ))}
      </div>
    </div>
  );
}

function ReporteFinal({ reporte, tipo }) {
  const items = [];
  if ('creados' in reporte) items.push({ k: 'Creados', v: reporte.creados });
  if ('actualizados' in reporte) items.push({ k: 'Actualizados', v: reporte.actualizados });
  if ('ajustes_stock' in reporte) items.push({ k: 'Ajustes de stock', v: reporte.ajustes_stock });
  if ('omitidos_inactivos' in reporte) items.push({ k: 'Omitidos (inactivos)', v: reporte.omitidos_inactivos });
  if ('categorias_creadas' in reporte) items.push({ k: 'Categorías creadas', v: reporte.categorias_creadas });
  if ('productos_actualizados' in reporte) items.push({ k: 'Productos actualizados', v: reporte.productos_actualizados });
  if ('lineas_creadas' in reporte) items.push({ k: 'Líneas creadas', v: reporte.lineas_creadas });
  if ('productos_omitidos' in reporte) items.push({ k: 'Productos omitidos', v: reporte.productos_omitidos });
  if ('fallidos' in reporte) items.push({ k: 'Fallidos', v: reporte.fallidos });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map(it => (
          <div key={it.k} className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{it.k}</p>
            <p className="text-xl font-bold">{it.v || 0}</p>
          </div>
        ))}
      </div>
      {reporte.errores?.length > 0 && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs">
          <p className="font-medium mb-1">Errores ({reporte.errores.length}):</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {reporte.errores.map((e, i) => <p key={i} className="text-[11px]">• {e}</p>)}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Refresca las pantallas afectadas para ver los cambios reflejados.
      </p>
    </div>
  );
}