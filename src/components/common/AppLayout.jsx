import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePOSAuth } from '@/lib/POSAuthContext';
import Sidebar from './Sidebar';
import BrandedBackground from './BrandedBackground';
import BrandColorsApplier from './BrandColorsApplier';
import NotificationsWatcher from './NotificationsWatcher';
import SolicitudesQRWatcher from './SolicitudesQRWatcher';
import PedidoListoWatcher from './PedidoListoWatcher';
import MobileAdminRadialMenu from './MobileAdminRadialMenu';
import { useRouteCleanup } from '@/lib/useRouteCleanup';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { posUser, isLoading } = usePOSAuth();
  const navigate = useNavigate();
  // Libera body locks (overflow/pointer-events) si quedó algún portal pegado al cambiar de ruta.
  useRouteCleanup();

  React.useEffect(() => {
    if (!isLoading && !posUser) {
      navigate('/login-pos');
    }
  }, [posUser, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!posUser) return null;

  return (
    <div className="flex relative" style={{ minHeight: '100dvh' }}>
      <BrandColorsApplier />
      <BrandedBackground />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      {/* min-w-0 + overflow-x-hidden: evita que tablas/cards anchas rompan el
          viewport en móvil (causa principal del "zoom-out" en Inventario). */}
      <main
        className={`flex-1 min-w-0 max-w-full overflow-x-hidden transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'} relative z-10`}
        style={{ minHeight: '100dvh' }}
      >
        <div className="p-4 md:p-6 lg:p-8 pt-14 lg:pt-6 min-w-0 max-w-full" style={{ minHeight: '100dvh' }}>
          <Outlet />
        </div>
      </main>
      <NotificationsWatcher />
      <SolicitudesQRWatcher />
      <PedidoListoWatcher />
      <MobileAdminRadialMenu />
    </div>
  );
}