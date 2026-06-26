import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useConfig } from '@/lib/ConfigContext';
import { isRouteAllowed, getPackageLabel } from '@/lib/packageConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

// Envuelve rutas para bloquear módulos no incluidos en el paquete activo.
// Si la ruta no aplica al paquete actual, muestra una pantalla informativa.
export default function RestrictedRoute({ children, redirectTo = '/' }) {
  const { paquete_modo, isLoading } = useConfig();
  const location = useLocation();

  if (isLoading) return null;

  if (isRouteAllowed(location.pathname, paquete_modo)) {
    return children;
  }

  // Si es la home y no está permitida (caso raro), redirige a otra ruta segura
  if (location.pathname === redirectTo) {
    return <Navigate to="/configuracion" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-lg">Módulo no incluido</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Este módulo no está incluido en el paquete actual{' '}
              <strong>{getPackageLabel(paquete_modo)}</strong>.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Para activarlo, cambia el paquete en Configuración → Presentación.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to={redirectTo}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al inicio
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}