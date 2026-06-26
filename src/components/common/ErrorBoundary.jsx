import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * ErrorBoundary local. Atrapa errores de render en su subárbol y muestra un fallback
 * en lugar de dejar pantalla blanca. NO oculta el error en consola: lo loggea.
 *
 * Uso:
 *   <ErrorBoundary fallbackTitle="Ocurrió un error al mostrar esta mesa." onReset={() => ...}>
 *     <Mesero />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Loggear para diagnóstico — NO ocultar.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset(); } catch {}
    }
  };

  reload = () => {
    try { window.location.reload(); } catch {}
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.fallbackTitle || 'Ocurrió un error inesperado.';
    const message = this.props.fallbackMessage || 'No se pudo mostrar esta sección. Puedes volver atrás o recargar.';

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-card border-2 border-amber-200 rounded-2xl p-5 shadow-lg text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <h2 className="font-heading font-bold text-base mb-1">{title}</h2>
          <p className="text-xs text-muted-foreground mb-4">{message}</p>
          {this.state.error?.message && (
            <p className="text-[10px] text-muted-foreground/70 mb-4 font-mono break-all">
              {String(this.state.error.message).slice(0, 160)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95"
            >
              <Home className="w-4 h-4" /> Volver
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-semibold active:scale-95"
            >
              <RefreshCw className="w-4 h-4" /> Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}