import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Lock, Sparkles, Check, X, Package, Star, ShieldCheck, Megaphone, AlertTriangle,
} from 'lucide-react';
import {
  PACKAGE_KEYS,
  PACKAGE_LABELS,
  PACKAGE_TAGLINES,
  PACKAGE_TARGET,
  PACKAGE_FEATURES,
  PACKAGE_FLOW,
  PACKAGE_COMPARISON,
  ADDONS,
} from '@/lib/packageConfig';
import { Workflow, ArrowRight } from 'lucide-react';

const PACKAGE_ORDER = [
  PACKAGE_KEYS.ESENCIAL,
  PACKAGE_KEYS.OPERATIVO,
  PACKAGE_KEYS.RESTAURANTE_PRO,
];

function CompareCell({ value }) {
  if (value === true) return <Check className="w-4 h-4 text-emerald-600 mx-auto" />;
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/50 mx-auto" />;
  if (value === 'addon') return <Badge variant="outline" className="text-[10px]">Add-on</Badge>;
  return <span className="text-xs text-foreground">{value}</span>;
}

export default function ModoPresentacion({ cfg }) {
  const queryClient = useQueryClient();
  const expectedPassword = cfg?.presentacion_password || '2797';

  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(cfg?.paquete_modo || 'restaurante_pro');
  const [guardando, setGuardando] = useState(false);

  const handleUnlock = async () => {
    if (passwordInput.trim() === String(expectedPassword)) {
      setUnlocked(true);
      setError('');
      setPasswordInput('');
      // Registrar acceso (no crítico)
      try {
        if (cfg?.id) {
          await base44.entities.ConfiguracionNegocio.update(cfg.id, {
            presentacion_ultimo_acceso: new Date().toISOString(),
          });
          queryClient.invalidateQueries({ queryKey: ['config'] });
        }
      } catch {}
    } else {
      setError('Contraseña incorrecta');
    }
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      if (cfg?.id) {
        await base44.entities.ConfiguracionNegocio.update(cfg.id, { paquete_modo: seleccion });
      } else {
        await base44.entities.ConfiguracionNegocio.create({
          nombre_negocio: cfg?.nombre_negocio || 'MH Astral Systems',
          paquete_modo: seleccion,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Modo de paquete actualizado correctamente');
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e.message || ''));
    }
    setGuardando(false);
  };

  // ---------- Pantalla de candado ----------
  if (!unlocked) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-heading text-base">Pestaña protegida</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ingresa la contraseña para acceder al Modo Presentación.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Contraseña</Label>
            <Input
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
              placeholder="••••"
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
          <Button className="w-full" onClick={handleUnlock} disabled={!passwordInput}>
            <ShieldCheck className="w-4 h-4 mr-2" />
            Acceder
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---------- Contenido de la pestaña ----------
  return (
    <div className="space-y-6">
      {/* A) Encabezado */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="font-heading text-lg">
              Modo Presentación — MH Astral Systems POS
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Selecciona el paquete que quieres mostrar, configurar o preparar para un cliente.
          </p>
          <div className="text-xs text-muted-foreground mt-1">
            Paquete actual:{' '}
            <Badge variant="secondary" className="ml-1">
              {PACKAGE_LABELS[cfg?.paquete_modo || 'restaurante_pro']}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* B) Selector de paquete */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PACKAGE_ORDER.map(key => {
          const isSelected = seleccion === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSeleccion(key)}
              className={`text-left rounded-xl border-2 p-4 transition-all bg-card hover:shadow-md ${
                isSelected ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="font-heading font-semibold">{PACKAGE_LABELS[key]}</span>
                </div>
                {isSelected && <Badge className="bg-primary text-primary-foreground">Seleccionado</Badge>}
                {key === PACKAGE_KEYS.RESTAURANTE_PRO && !isSelected && (
                  <Badge variant="outline" className="text-[10px]">Por defecto</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{PACKAGE_TARGET[key]}</p>
              <p className="text-xs font-medium mb-3">{PACKAGE_TAGLINES[key]}</p>

              {/* Flujo operativo del paquete */}
              <div className="mb-3 p-2 rounded-lg bg-muted/40 border border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <Workflow className="w-3 h-3 text-primary" />
                  <span className="text-[11px] font-semibold">{PACKAGE_FLOW[key].titulo}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-1.5 leading-snug">
                  {PACKAGE_FLOW[key].descripcion}
                </p>
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {PACKAGE_FLOW[key].pasos.map((paso, i) => (
                    <React.Fragment key={i}>
                      <span className="px-1.5 py-0.5 rounded bg-white border">{paso}</span>
                      {i < PACKAGE_FLOW[key].pasos.length - 1 && (
                        <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <ul className="space-y-1">
                {PACKAGE_FEATURES[key].map((f, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <Check className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* C) Botón guardar */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          Selección: <strong>{PACKAGE_LABELS[seleccion]}</strong>
        </span>
        <Button onClick={handleGuardar} disabled={guardando || seleccion === cfg?.paquete_modo}>
          {guardando ? 'Guardando...' : 'Guardar modo de paquete'}
        </Button>
      </div>

      {/* D) Comparador */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            Comparador de paquetes
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-2 font-medium">Función</th>
                <th className="text-center py-2 px-2 font-medium">Esencial</th>
                <th className="text-center py-2 px-2 font-medium">Operativo</th>
                <th className="text-center py-2 px-2 font-medium">Restaurante Pro</th>
              </tr>
            </thead>
            <tbody>
              {PACKAGE_COMPARISON.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-2 pr-2 text-xs">{row.funcion}</td>
                  <td className="py-2 px-2 text-center"><CompareCell value={row.esencial} /></td>
                  <td className="py-2 px-2 text-center"><CompareCell value={row.operativo} /></td>
                  <td className="py-2 px-2 text-center"><CompareCell value={row.restaurante_pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* E) Add-ons */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            Add-ons disponibles
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Los add-ons se cotizan aparte y aplican a cualquiera de los tres paquetes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ADDONS.map(addon => (
              <div
                key={addon.key}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs">{addon.nombre}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* F) Aviso */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs">
          <strong>Esencial</strong> y <strong>Operativo</strong> funcionan como POS de mostrador / caja directa: el negocio puede tomar pedidos
          en papel y capturarlos en Caja al cobrar. <strong>Restaurante Pro</strong> es el sistema completo con Mesero, Cocina, Mesas y Caja.
          Cambiar de paquete oculta módulos visualmente; <strong>no se borran datos ni base de datos.</strong>
        </p>
      </div>
    </div>
  );
}