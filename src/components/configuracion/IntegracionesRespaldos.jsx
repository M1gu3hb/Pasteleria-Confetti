import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Sheet, HardDrive, RefreshCw, Clock, CheckCircle2, Info } from 'lucide-react';

function StatusBadge({ status }) {
  if (status === 'synced') return <Badge className="bg-green-100 text-green-700 border-green-200">Sincronizado</Badge>;
  if (status === 'failed') return <Badge className="bg-red-100 text-red-700 border-red-200">Falló</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pendiente</Badge>;
}

// eslint-disable-next-line no-unused-vars
function IntegrationCard({ icon: IconComponent, title, description, onConnect }) {
  const Icon = IconComponent;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 rounded-xl border bg-muted/30">
      <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:min-w-[56px]">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-sm">{title}</p>
          <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300 bg-yellow-50">
            <Clock className="w-3 h-3 mr-1" />
            Pendiente de conectar
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <Button size="sm" variant="outline" onClick={onConnect} className="mt-1">
          Conectar {title}
        </Button>
      </div>
    </div>
  );
}

export default function IntegracionesRespaldos() {
  const [retrying, setRetrying] = useState(false);

  const { data: pendingLogs = [] } = useQuery({
    queryKey: ['integration_sync_logs_pending'],
    queryFn: () => base44.entities.IntegrationSyncLog.filter({ status: 'pending_external_sync' }),
    initialData: [],
  });

  const { data: failedLogs = [] } = useQuery({
    queryKey: ['integration_sync_logs_failed'],
    queryFn: () => base44.entities.IntegrationSyncLog.filter({ status: 'failed' }),
    initialData: [],
  });

  const totalPendingOrFailed = pendingLogs.length + failedLogs.length;

  const handleConnectSheets = () => {
    toast.info('La conexión real con Google Sheets se configurará después mediante OAuth.');
  };

  const handleConnectDrive = () => {
    toast.info('La conexión real con Google Drive se configurará después mediante OAuth.');
  };

  const handleRetry = async () => {
    setRetrying(true);
    await new Promise(r => setTimeout(r, 800));
    toast.info('La sincronización externa está preparada pero pendiente de conexión.');
    setRetrying(false);
  };

  return (
    <div className="space-y-6">
      {/* Estado general */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            Integraciones en la nube
            <Badge variant="outline" className="text-xs ml-2">Demo — pendiente de configurar</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Las integraciones con Google Sheets y Google Drive están <strong>preparadas en la arquitectura</strong> pero no conectadas todavía.
              El sistema opera al 100% sin ellas. Podrás activarlas cuando tengas las credenciales OAuth de Google Cloud.
            </p>
          </div>

          <IntegrationCard
            icon={Sheet}
            title="Google Sheets"
            description="Sincronización futura para reportes tipo Excel: ventas, cortes, compras, gastos e inventario."
            onConnect={handleConnectSheets}
          />

          <IntegrationCard
            icon={HardDrive}
            title="Google Drive"
            description="Respaldo futuro para guardar PDFs de cortes, reportes y exportaciones en una carpeta dedicada del negocio."
            onConnect={handleConnectDrive}
          />
        </CardContent>
      </Card>

      {/* Cola de sincronización */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center justify-between flex-wrap gap-2">
            Cola de sincronización pendiente
            {totalPendingOrFailed > 0 && (
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                {totalPendingOrFailed} registros en espera
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-muted/30 text-center">
              <p className="text-2xl font-bold text-yellow-600">{pendingLogs.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Pendientes</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30 text-center">
              <p className="text-2xl font-bold text-red-500">{failedLogs.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Con error</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30 text-center col-span-2 sm:col-span-1">
              <p className="text-2xl font-bold text-primary">{totalPendingOrFailed}</p>
              <p className="text-xs text-muted-foreground mt-1">Total en cola</p>
            </div>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleRetry}
            disabled={retrying}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Reintentando...' : 'Reintentar sincronización'}
          </Button>

          {totalPendingOrFailed === 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              No hay registros pendientes en cola.
            </p>
          )}

          {/* Lista últimos 5 pendientes */}
          {pendingLogs.slice(0, 5).map(log => (
            <div key={log.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border text-xs">
              <div>
                <span className="font-medium capitalize">{log.record_type?.replace(/_/g, ' ')}</span>
                <span className="text-muted-foreground ml-2">→ {log.destination?.replace(/_/g, ' ')}</span>
              </div>
              <StatusBadge status={log.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Nota técnica */}
      <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Al cerrar cada corte de caja, el sistema crea automáticamente registros en la cola de sincronización con estado <code className="bg-muted px-1 rounded">pending_external_sync</code>.
          Cuando se active la integración real con Google, esos registros se procesarán sin pérdida de datos.
        </span>
      </div>
    </div>
  );
}