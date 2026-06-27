import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as SonnerToaster } from 'sonner';
import PageNotFound from './lib/PageNotFound';
import usePageTitle from '@/lib/usePageTitle';
import { AuthProvider } from '@/lib/AuthContext';
import { POSAuthProvider } from '@/lib/POSAuthContext';
import { TerminalProvider } from '@/lib/TerminalContext';
import { ConfigProvider } from '@/lib/ConfigContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import AppLayout from '@/components/common/AppLayout';
import TerminalGate from '@/components/common/TerminalGate';
import AdminRoute from '@/components/common/AdminRoute';

// Pages (solo las reales de Confetti — la basura de plantilla de restaurante
// — Mesero/Mesas/Cocina/Barra/Inventario/Compras/Recetas/PortalQR/PortalCliente —
// se descartó en la migración Fase 2).
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Productos from './pages/Productos';
import Ventas from './pages/Ventas';
import Caja from './pages/Caja';
import Registros from './pages/Registros';
import Configuracion from './pages/Configuracion';
import PedidosPastel from './pages/PedidosPastel';
import NuevoPedidoPastel from './pages/NuevoPedidoPastel';
import WebPublica from './pages/WebPublica';

const AuthenticatedApp = () => {
  usePageTitle();

  return (
    <POSAuthProvider>
      <TerminalProvider>
        <ConfigProvider>
          <Routes>
            <Route element={<TerminalGate><AppLayout /></TerminalGate>}>
              <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
              <Route path="/pos" element={<POS />} />
              <Route path="/productos" element={<AdminRoute><Productos /></AdminRoute>} />
              <Route path="/ventas" element={<AdminRoute><Ventas /></AdminRoute>} />
              <Route path="/caja" element={<Caja />} />
              <Route path="/pedidos-pastel" element={<PedidosPastel />} />
              <Route path="/pedidos-pastel/nuevo" element={<NuevoPedidoPastel />} />
              <Route path="/web-publica" element={<WebPublica />} />
              <Route path="/corte-caja" element={<Navigate to="/caja" replace />} />
              <Route path="/registros" element={<AdminRoute><Registros /></AdminRoute>} />
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
