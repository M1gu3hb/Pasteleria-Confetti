import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/financialUtils';

const PAGE_SIZE = 25;
const PERIODOS = [
  { id: 'all', label: 'Todos' },
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'mes', label: 'Mes' },
  { id: 'year', label: 'Año' },
];
const TIPOS = [
  { id: 'all', label: 'Todos los tipos' },
  { id: 'entrada_compra', label: 'Entradas (compras)' },
  { id: 'salida_venta', label: 'Salidas (ventas)' },
  { id: 'ajuste_manual', label: 'Ajustes manuales' },
  { id: 'merma', label: 'Mermas' },
  { id: 'devolucion', label: 'Devoluciones' },
  { id: 'correccion', label: 'Correcciones' },
];

/**
 * Panel optimizado para movimientos de inventario.
 * Filtros (periodo, tipo, ingrediente, ticket/corte/búsqueda libre) +
 * agrupación por día + paginación 25/50.
 */
export default function MovimientosPanel({ movimientos = [] }) {
  const [search, setSearch] = useState('');
  const [periodo, setPeriodo] = useState('30d');
  const [tipo, setTipo] = useState('all');
  const [ingrediente, setIngrediente] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const ingredientesList = useMemo(() => {
    const map = {};
    movimientos.forEach(m => { if (m.ingrediente_id) map[m.ingrediente_id] = m.ingrediente_nombre; });
    return Object.entries(map).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [movimientos]);

  const range = useMemo(() => {
    const now = new Date();
    if (periodo === 'today') return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
    if (periodo === '7d') return { from: startOfDay(subDays(now, 6)).getTime(), to: endOfDay(now).getTime() };
    if (periodo === '30d') return { from: startOfDay(subDays(now, 29)).getTime(), to: endOfDay(now).getTime() };
    if (periodo === 'mes') return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() };
    if (periodo === 'year') return { from: startOfYear(now).getTime(), to: endOfDay(now).getTime() };
    return null;
  }, [periodo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movimientos.filter(m => {
      if (range) {
        const t = new Date(m.fecha || m.created_date || 0).getTime();
        if (t < range.from || t > range.to) return false;
      }
      if (tipo !== 'all' && m.tipo_movimiento !== tipo) return false;
      if (ingrediente !== 'all' && m.ingrediente_id !== ingrediente) return false;
      if (q) {
        const haystack = [m.ingrediente_nombre, m.motivo, m.usuario_nombre, m.referencia_id, m.tipo_movimiento]
          .join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [movimientos, range, tipo, ingrediente, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Agrupado por día
  const grouped = useMemo(() => {
    const groups = {};
    slice.forEach(m => {
      const key = (m.fecha || m.created_date || '').slice(0, 10);
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [slice]);

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card className="p-3 bg-white/70 backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Buscar ingrediente, motivo, usuario..."
            value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} className="h-9" />
          <Select value={periodo} onValueChange={(v) => { setPeriodo(v); resetPage(); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={(v) => { setTipo(v); resetPage(); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ingrediente} onValueChange={(v) => { setIngrediente(v); resetPage(); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Ingrediente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los ingredientes</SelectItem>
              {ingredientesList.map(i => <SelectItem key={i.id} value={i.id}>{i.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>{filtered.length} movimientos</span>
          <div className="flex items-center gap-2">
            <span>Por página:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); resetPage(); }}>
              <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista agrupada por día */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Sin movimientos en este filtro.</p>
      ) : (
        <div className="space-y-3">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-semibold">
                {day ? format(new Date(day), "EEEE d MMM yyyy", { locale: es }) : 'Sin fecha'} · {items.length}
              </p>
              <div className="space-y-1.5">
                {items.map(m => {
                  const negativo = m.cantidad < 0;
                  return (
                    <Card key={m.id} className="p-2.5 flex items-center gap-3 flex-wrap bg-white/70 backdrop-blur-sm">
                      <div className="flex-1 min-w-[180px]">
                        <p className="font-medium text-sm">{m.ingrediente_nombre}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.fecha ? format(new Date(m.fecha), "HH:mm", { locale: es }) : ''}
                          {m.motivo ? ` · ${m.motivo}` : ''}
                          {m.usuario_nombre ? ` · ${m.usuario_nombre}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize text-[10px]">{(m.tipo_movimiento || '').replace('_', ' ')}</Badge>
                      <p className={`font-heading font-black min-w-[100px] text-right text-sm ${negativo ? 'text-red-600' : 'text-emerald-600'}`}>
                        {negativo ? '' : '+'}{Number(m.cantidad).toLocaleString()} {m.unidad_base}
                      </p>
                      <p className="text-xs text-muted-foreground min-w-[70px] text-right">
                        {formatCurrency(Math.abs(m.costo_total_movimiento || 0))}
                      </p>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {safePage} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}