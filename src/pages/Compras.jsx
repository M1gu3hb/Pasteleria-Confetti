import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/utils/financialUtils';
import PageHeader from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Receipt, Plus, Wallet, Package, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import RegistrarCompraDialog from '@/components/compras/RegistrarCompraDialog';
import RegistrarGastoDialog from '@/components/compras/RegistrarGastoDialog';
import PlantillasGastoSection from '@/components/compras/PlantillasGastoSection';
import LoadingState from '@/components/common/LoadingState';

export default function Compras() {
  const [openCompra, setOpenCompra] = useState(false);
  const [openGasto, setOpenGasto] = useState(false);

  // Sin initialData:[] — distinguir "primer fetch" de "vacío real".
  const { data: ingredientes } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => base44.entities.Ingrediente.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const { data: compras, isPending: comprasLoading } = useQuery({
    queryKey: ['compras_all'],
    queryFn: () => base44.entities.CompraInsumo.list('-created_date', 30),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const { data: gastos, isPending: gastosLoading } = useQuery({
    queryKey: ['gastos_hoy'],
    queryFn: () => base44.entities.GastoOperativo.list('-created_date', 30),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const safeIngredientes = Array.isArray(ingredientes) ? ingredientes : [];
  const safeCompras = Array.isArray(compras) ? compras : [];
  const safeGastos = Array.isArray(gastos) ? gastos : [];
  const cargandoCompras = comprasLoading && !compras;
  const cargandoGastos = gastosLoading && !gastos;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras y gastos"
        description="Compras de insumos suman al inventario. Gastos operativos NO afectan el inventario."
      />

      {/* Acciones grandes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => setOpenCompra(true)}
          className="premium-sheen group text-left p-6 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-md hover:shadow-xl transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white shadow-lg">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-heading font-bold text-lg">Registrar compra</h3>
              <p className="text-xs text-muted-foreground">Suma insumos al inventario</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
          <p className="text-sm text-muted-foreground">
            Agrega ingredientes nuevos o suma a los existentes. Se actualiza automáticamente el stock y los costos.
          </p>
        </button>

        <button onClick={() => setOpenGasto(true)}
          className="premium-sheen group text-left p-6 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-md hover:shadow-xl transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white shadow-lg">
              <Wallet className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-heading font-bold text-lg">Registrar gasto</h3>
              <p className="text-xs text-muted-foreground">Servicios, mantenimiento, etc.</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
          <p className="text-sm text-muted-foreground">
            Luz, agua, internet, gas, limpieza. Marca como recurrente para gastos fijos mensuales.
          </p>
        </button>
      </div>

      {/* Plantillas de gasto recurrentes */}
      <PlantillasGastoSection />

      {/* Compras recientes */}
      <div>
        <h3 className="font-heading font-bold text-lg mb-3 flex items-center gap-2">
          <Package className="w-5 h-5" /> Compras de insumos recientes
        </h3>
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          Aumentan inventario. NO se cuentan como gasto operativo en la utilidad neta.
        </p>
        {cargandoCompras ? (
          <LoadingState label="Cargando compras…" compact />
        ) : safeCompras.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay compras registradas. Da click en "Registrar compra".
          </Card>
        ) : (
          <div className="space-y-2">
            {safeCompras.slice(0, 12).map(c => (
              <Card key={c.id} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium text-sm">{c.proveedor_nombre || 'Compra directa'}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.fecha} {c.usuario_nombre ? `· ${c.usuario_nombre}` : ''}
                  </p>
                </div>
                <Badge variant="secondary" className="capitalize text-[10px]">{c.metodo_pago || '—'}</Badge>
                <p className="font-heading font-black min-w-[80px] text-right">{formatCurrency(c.total_compra)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Gastos recientes */}
      <div>
        <h3 className="font-heading font-bold text-lg mb-3 flex items-center gap-2">
          <Receipt className="w-5 h-5" /> Gastos operativos recientes
        </h3>
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          Servicios, mantenimiento, renta, etc. NO aumentan inventario. Sí afectan la utilidad neta del periodo.
        </p>
        {cargandoGastos ? (
          <LoadingState label="Cargando gastos…" compact />
        ) : safeGastos.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay gastos registrados.
          </Card>
        ) : (
          <div className="space-y-2">
            {safeGastos.slice(0, 12).map(g => {
              const recurrente = (g.notas || '').includes('[RECURRENTE');
              return (
                <Card key={g.id} className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-sm">{g.descripcion}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.fecha} · <span className="capitalize">{g.categoria}</span>
                      {g.usuario_nombre ? ` · ${g.usuario_nombre}` : ''}
                    </p>
                  </div>
                  {recurrente && <Badge className="bg-amber-100 text-amber-700 text-[10px] border-0">Fijo mensual</Badge>}
                  <Badge variant="secondary" className="capitalize text-[10px]">{g.metodo_pago || '—'}</Badge>
                  <p className="font-heading font-black min-w-[80px] text-right text-red-600">−{formatCurrency(g.monto)}</p>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <RegistrarCompraDialog open={openCompra} onClose={() => setOpenCompra(false)} ingredientes={safeIngredientes} />
      <RegistrarGastoDialog open={openGasto} onClose={() => setOpenGasto(false)} />
    </div>
  );
}