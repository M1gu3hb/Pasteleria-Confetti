import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/financialUtils';
import { useIsDark } from '@/lib/ThemeContext';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

/**
 * Dona comparativa de ventas por sucursal (solo vista general del dueño).
 * Una porción por sucursal con su color asignado. Centro = total general.
 * Mismo estilo visual que la dona de métodos de pago para coherencia.
 * Puramente visual — recibe ya los datos calculados del padre.
 */
export default function SucursalDonutCard({ data }) {
  const isDark = useIsDark();
  const safe = Array.isArray(data) ? data.filter(d => (Number(d?.total) || 0) > 0) : [];
  const totalGeneral = safe.reduce((s, d) => s + (Number(d?.total) || 0), 0);

  const cardBg = isDark
    ? 'linear-gradient(135deg, hsl(222 40% 11%) 0%, hsl(222 40% 9%) 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #fafaf7 100%)';
  const cardShadow = isDark
    ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 20px rgba(0,0,0,0.35)'
    : '0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 20px rgba(0,0,0,0.06)';

  return (
    <Card className="premium-sheen border-2 text-card-foreground" style={{ background: cardBg, boxShadow: cardShadow }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading">Distribución de ventas por sucursal — hoy</CardTitle>
      </CardHeader>
      <CardContent>
        {safe.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sin ventas hoy</p>
        ) : (
          <div>
            <div className="h-52 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={safe} cx="50%" cy="50%" innerRadius={55} outerRadius={82}
                    paddingAngle={4} dataKey="total" nameKey="nombre"
                    stroke={isDark ? '#0f172a' : '#ffffff'} strokeWidth={2}>
                    {safe.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => formatCurrency(val)}
                    contentStyle={isDark
                      ? { backgroundColor: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }
                      : { fontSize: 12 }}
                    labelStyle={isDark ? { color: '#f1f5f9' } : undefined}
                    itemStyle={isDark ? { color: '#f1f5f9' } : undefined}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Centro de la dona — total general */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
                <span className="text-lg font-heading font-black">{formatCurrency(totalGeneral)}</span>
              </div>
            </div>
            <div className="flex justify-center flex-wrap gap-3 -mt-2">
              {safe.map((d) => (
                <div key={d.nombre} className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                  <span className="font-medium">{d.nombre}:</span> {formatCurrency(d.total)}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}