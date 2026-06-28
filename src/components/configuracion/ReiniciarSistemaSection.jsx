import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle, Trash2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';

/**
 * Sección administrativa de mantenimiento.
 *
 * - "Borrar todos los datos del sistema" → deja el POS limpio para un nuevo cliente.
 * - "Borrar solo ventas y pruebas"       → conserva catálogos (productos, recetas,
 *                                          ingredientes, mesas, usuarios, config).
 *
 * Seguridad: solo admin. Confirmación tipeada obligatoria.
 * No toca lógica de negocio: invoca el backend `reiniciarSistema`.
 */
export default function ReiniciarSistemaSection() {
  const { posUser } = usePOSAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const esAdmin = posUser?.rol === 'administrador';

  const [mode, setMode] = useState(null); // 'all' | 'tests' | null
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const open = mode !== null;
  const expectedText = mode === 'all' ? 'BORRAR TODO' : 'BORRAR PRUEBAS';
  const isConfirmValid = confirmText.trim() === expectedText;

  const closeDialog = () => {
    if (loading) return; // no cerrar mientras corre
    setMode(null);
    setConfirmText('');
  };

  const invalidateAllQueries = () => {
    // Invalidamos todas las queries del sistema para refrescar UI tras el borrado.
    const keys = [
      'config', 'usuarios_pos', 'mesas',
      'ventas_all', 'ventas_hoy', 'ventas_para_cocina',
      'productos_all', 'recetas_all',
      'ingredientes_all', 'ingredientes_dashboard',
      'categorias_producto', 'categorias_ingrediente',
      'compras_all', 'gastos_hoy', 'gastos_all',
      'cortes_caja_estado', 'cortes_caja_all', 'cortes_historial',
      'pedidos_cocina', 'pedidos_barra',
      'solicitudes_qr', 'solicitudes_qr_panel',
      'descuentos_hoy', 'movimientos_inventario',
      'liquidaciones_propina', 'propinas_pendientes',
      'menu_qr_secciones', 'plantillas_compra',
      'proveedores', 'clientes',
      'integration_sync_logs',
    ];
    for (const k of keys) {
      try { queryClient.invalidateQueries({ queryKey: [k] }); } catch {}
    }
    // Invalidación amplia por si quedan queries con keys compuestas:
    try { queryClient.invalidateQueries(); } catch {}
  };

  // FASE 5 (F4) — botón muerto NEUTRALIZADO: la función de mantenimiento
  // "reiniciar/borrar datos" (de Base44) no está migrada. Avisa que está
  // desactivada en vez de fallar.
  const handleConfirm = async () => {
    toast.info('Función desactivada por el momento.');
    setMode(null);
    setConfirmText('');
  };

  if (!esAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Mantenimiento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Esta sección solo está disponible para el administrador.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Reiniciar sistema para cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm">
              Esta acción borra todos los datos operativos del POS y deja el sistema
              limpio para configurar un nuevo negocio. <strong>No se puede deshacer.</strong>
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* Borrar TODO */}
            <div className="rounded-lg border border-destructive/30 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-destructive" />
                <p className="font-semibold text-sm">Borrar todos los datos del sistema</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Elimina ventas, cortes, compras, gastos, inventario, productos,
                recetas, mesas, solicitudes QR, tickets, movimientos y registros.
                Resetea la configuración a valores base. Conserva tu usuario
                administrador.
              </p>
              <Button
                variant="destructive"
                className="mt-1 w-full"
                onClick={() => { setMode('all'); setConfirmText(''); }}
              >
                Borrar todos los datos del sistema
              </Button>
            </div>

            {/* Borrar SOLO pruebas */}
            <div className="rounded-lg border border-amber-300/40 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-600" />
                <p className="font-semibold text-sm">Borrar solo ventas y pruebas</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Borra solo ventas, cortes, propinas, pedidos de cocina,
                solicitudes QR, compras, gastos y movimientos. Conserva
                productos, recetas, ingredientes, mesas, usuarios y configuración.
              </p>
              <Button
                variant="outline"
                className="mt-1 w-full border-amber-500/50 text-amber-700 hover:bg-amber-50"
                onClick={() => { setMode('tests'); setConfirmText(''); }}
              >
                Borrar solo ventas y pruebas
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {mode === 'all' ? 'Borrar TODOS los datos del sistema' : 'Borrar solo ventas y pruebas'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm">
              {mode === 'all' ? (
                <p>
                  Esta acción eliminará <strong>ventas, cortes, compras, gastos,
                  inventario, productos, recetas, mesas, solicitudes QR, tickets,
                  movimientos y registros</strong>. También reseteará la
                  configuración del negocio a valores base. <strong>No se puede deshacer.</strong>
                </p>
              ) : (
                <p>
                  Esta acción eliminará <strong>solo ventas, detalles, cortes,
                  propinas, pedidos de cocina, solicitudes QR, compras, gastos
                  y movimientos de inventario</strong>. Se conservarán productos,
                  recetas, ingredientes, mesas, usuarios y configuración.
                  <strong> No se puede deshacer.</strong>
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">
                Para confirmar, escribe exactamente: <strong>{expectedText}</strong>
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedText}
                autoFocus
                disabled={loading}
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Sesión actual: <strong>{posUser?.nombre}</strong> ({posUser?.rol}).
              Solo el rol administrador puede ejecutar esta acción.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!isConfirmValid || loading}
              onClick={handleConfirm}
            >
              {loading
                ? 'Reiniciando sistema…'
                : (mode === 'all' ? 'Sí, borrar todo y dejar sistema limpio' : 'Sí, borrar ventas y pruebas')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}