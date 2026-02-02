import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info);
  }

  render() {
    const { hasError, error } = this.state;
    if (!hasError) return this.props.children;
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/50 p-6 text-sm text-slate-200">
        <p className="text-sm font-semibold text-slate-100">Ocurrió un error al cargar la pantalla.</p>
        <p className="text-xs text-slate-400">
          {error?.message || 'Error inesperado. Revisa la consola para más detalle.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500"
        >
          Recargar
        </button>
      </div>
    );
  }
}
