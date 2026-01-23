import { Link } from 'react-router-dom';
import { FileText, MoveRight } from 'lucide-react';
import Card from '../components/ui/Card.jsx';

export default function MonitoreoSelect() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Monitoreo</p>
        <h1 className="text-3xl font-semibold text-slate-100">Elegir monitoreo</h1>
        <p className="text-sm text-slate-400">
          Selecciona el formulario que deseas completar. Puedes continuar más tarde gracias al
          guardado local automático.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Formulario 1</p>
                <p className="text-xs text-slate-500">Ficha de escritura</p>
              </div>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              Disponible
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Monitoreo de sesión de aprendizaje para la competencia de escritura. Incluye
            planificación, textualización, evaluación y cierre.
          </p>
          <Link
            to="/monitoreo/ficha-escritura"
            className="inline-flex items-center gap-2 self-start rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:border-sky-400/60 hover:bg-sky-500/20"
          >
            Abrir formulario
            <MoveRight size={14} />
          </Link>
        </Card>
        <Card className="flex flex-col gap-6 opacity-60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300">Formulario 2</p>
                <p className="text-xs text-slate-500">Próximamente</p>
              </div>
            </div>
            <span className="rounded-full border border-slate-700/60 bg-slate-800/40 px-3 py-1 text-xs text-slate-400">
              Bloqueado
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Este formulario estará disponible en la siguiente iteración de monitoreo.
          </p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-500"
          >
            Próximamente
          </button>
        </Card>
      </div>
    </div>
  );
}
