import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ErrorBoundary ligero y reutilizable para envolver secciones críticas
 * (tickets, modales de cobro, vistas de mesa) sin reemplazar toda la pantalla.
 *
 * Si el subárbol falla, muestra un fallback compacto y permite reintentar
 * mediante `onReset`. NO recarga la página: solo re-monta el subárbol.
 */
export default class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      console.error('[SafeBoundary]', this.props.label || '', error, info?.componentStack);
    } catch (_) {}
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset(); } catch (_) {}
    }
  };

  render() {
    if (this.state.hasError) {
      const {
        fallback,
        fallbackTitle = 'Algo salió mal en esta sección.',
        fallbackMessage = 'Puedes cerrar e intentar de nuevo.',
      } = this.props;
      if (fallback) return fallback({ error: this.state.error, reset: this.reset });
      return (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{fallbackTitle}</p>
            <p className="text-xs opacity-80 mt-0.5">{fallbackMessage}</p>
            <button
              type="button"
              onClick={this.reset}
              className="mt-2 px-3 py-1 rounded-md bg-red-600 text-white text-xs font-semibold"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}