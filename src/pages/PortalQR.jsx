import React from 'react';
import { QrCode } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import PageHeader from '@/components/common/PageHeader';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import MesasQRTab from '@/components/portalqr/MesasQRTab';
import MenuQRTab from '@/components/portalqr/MenuQRTab';
import SolicitudesQRTab from '@/components/portalqr/SolicitudesQRTab';
import ConfiguracionQRTab from '@/components/portalqr/ConfiguracionQRTab';

/**
 * Página interna Portal QR — solo administrador.
 * Cuatro pestañas: Mesas QR, Menú QR, Solicitudes, Configuración.
 */
export default function PortalQRPage() {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();

  if (posUser?.rol !== 'administrador') {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        <QrCode className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>El Portal QR solo está disponible para administradores.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallbackTitle="Ocurrió un error en Portal QR."
      fallbackMessage="Recarga la página para reintentar."
    >
      <div className="space-y-4">
        <PageHeader
          title="Portal QR"
          description="Administra los QR de cada mesa, el menú digital y las solicitudes de comensales."
        />

        <Tabs defaultValue="mesas">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="mesas">Mesas QR</TabsTrigger>
            <TabsTrigger value="menu">Menú QR</TabsTrigger>
            <TabsTrigger value="solicitudes">Solicitudes</TabsTrigger>
            <TabsTrigger value="config">Configuración</TabsTrigger>
          </TabsList>

          <TabsContent value="mesas" className="mt-4">
            <MesasQRTab config={config} />
          </TabsContent>
          <TabsContent value="menu" className="mt-4">
            <MenuQRTab />
          </TabsContent>
          <TabsContent value="solicitudes" className="mt-4">
            <SolicitudesQRTab posUser={posUser} />
          </TabsContent>
          <TabsContent value="config" className="mt-4">
            <ConfiguracionQRTab config={config} />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}