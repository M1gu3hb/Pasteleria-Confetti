import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as SonnerToaster } from 'sonner';
import PageNotFound from './lib/PageNotFound';
import usePageTitle from '@/lib/usePageTitle';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { POSAuthProvider } from '@/lib/POSAuthContext';
import { TerminalProvider } from '@/lib/TerminalContext';
import { ConfigProvider } from '@/lib/ConfigContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/common/AppLayout';
import TerminalGate from '@/components/common/TerminalGate';
import AdminRoute from '@/components/common/AdminRoute';
import RestrictedRoute from '@/components/common/RestrictedRoute';

// Pages
import POSLogin from './pages/POSLogin';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Mesero from './pages/Mesero';
import Inventario from './pages/Inventario';
import Compras from './pages/Compras';
import Recetas from './pages/Recetas';
import Productos from './pages/Productos';
import Mesas from './pages/Mesas';
import Cocina from './pages/Cocina';
import Ventas from './pages/Ventas';
import Caja from './pages/Caja';
import Registros from './pages/Registros';
import Configuracion from './pages/Configuracion';
import PortalQR from './pages/PortalQR';
import PedidosPastel from './pages/PedidosPastel';
import NuevoPedidoPastel from './pages/NuevoPedidoPastel';
import PortalCliente from './pages/PortalCliente';
import WebPublica from './pages/WebPublica';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  usePageTitle();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <POSAuthProvider>
      <TerminalProvider>
        <ConfigProvider>
          <Routes>
            {/* POS Login (full screen, no layout) — ruta alternativa, ya no es
                el flujo principal en Fase 2A (ver TerminalGate). */}
            <Route path="/login-pos" element={<POSLogin />} />

            {/* Portal público del comensal — sin sidebar, sin auth interna */}
            <Route path="/qr/:token" element={<PortalCliente />} />

            {/* Main app con gate de terminal + sidebar layout.
                TerminalGate: si no hay terminal configurada → ConfigurarTerminal.
                Si hay terminal → auto-login modo empleado y entra al AppLayout. */}
            <Route element={<TerminalGate><AppLayout /></TerminalGate>}>
              {/* Rutas admin (Fase 2A): protegidas por AdminRoute → en modo
                  empleado redirigen a /caja. Solo accesibles tras PIN admin. */}
              <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
              <Route path="/pos" element={<POS />} />
              <Route path="/mesero" element={<RestrictedRoute><Mesero /></RestrictedRoute>} />
              {/* /mesas: vista antigua bloqueada → redirige al flujo Mesero */}
              <Route path="/mesas" element={<Mesas />} />
              <Route path="/cocina" element={<RestrictedRoute><Cocina /></RestrictedRoute>} />
              <Route path="/inventario" element={<RestrictedRoute><Inventario /></RestrictedRoute>} />
              <Route path="/compras" element={<RestrictedRoute><Compras /></RestrictedRoute>} />
              <Route path="/recetas" element={<RestrictedRoute><Recetas /></RestrictedRoute>} />
              <Route path="/productos" element={<AdminRoute><Productos /></AdminRoute>} />
              <Route path="/ventas" element={<AdminRoute><Ventas /></AdminRoute>} />
              <Route path="/caja" element={<Caja />} />
              {/* Fase 3 — Pedidos de pastel personalizado: accesible a todos
                  los roles operativos (igual que /caja, sin AdminRoute). */}
              <Route path="/pedidos-pastel" element={<PedidosPastel />} />
              <Route path="/pedidos-pastel/nuevo" element={<NuevoPedidoPastel />} />
              {/* Fase 7 — Web Pública: gestión del catálogo web. Visibilidad
                  del menú restringida a admin/dueño en el Sidebar. */}
              <Route path="/web-publica" element={<WebPublica />} />
              {/* /corte-caja deprecada: toda la lógica vive ahora en /caja. */}
              <Route path="/corte-caja" element={<Navigate to="/caja" replace />} />
              <Route path="/registros" element={<AdminRoute><Registros /></AdminRoute>} />
              <Route path="/portal-qr" element={<RestrictedRoute><PortalQR /></RestrictedRoute>} />
              <Route path="/configuracion" element={<AdminRoute soloDueno><Configuracion /></AdminRoute>} />
            </Route>

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </ConfigProvider>
      </TerminalProvider>
    </POSAuthProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster
            richColors
            position="top-right"
            closeButton
            duration={3500}
            visibleToasts={4}
            swipeDirections={['top', 'right']}
          />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;