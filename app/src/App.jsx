import { useEffect, useState } from 'react';
import { Clapperboard, FileText, Wrench, Bookmark, Plus, Scissors, LogIn, SquarePen } from 'lucide-react';
import { api } from './lib.js';
import Edited from './views/Edited.jsx';
import Scripts from './views/Scripts.jsx';
import Tools from './views/Tools.jsx';
import References from './views/References.jsx';
import NewEdit from './views/NewEdit.jsx';
import Editor from './views/Editor.jsx';
import Jobs from './components/Jobs.jsx';

const NAV = [
  { id: 'edited', label: 'Vídeos editados', icon: Clapperboard },
  { id: 'editor', label: 'Editor', icon: SquarePen },
  { id: 'scripts', label: 'Guiones', icon: FileText },
  { id: 'tools', label: 'Herramientas', icon: Wrench },
  { id: 'references', label: 'Referencias', icon: Bookmark },
];

export default function App() {
  const [view, setView] = useState('edited');
  const [editorId, setEditorId] = useState(null);
  const openEditor = (id) => { setEditorId(id); setView('editor'); };
  const [newEdit, setNewEdit] = useState(null); // null | { recipeId? }
  const [jobs, setJobs] = useState([]);

  useEffect(() => api.onJob((ev) => {
    setJobs((list) => {
      if (ev.type === 'start') return [{ ...ev, logs: [], open: true }, ...list];
      return list.map((j) => {
        if (j.id !== ev.id) return j;
        if (ev.type === 'log') return { ...j, logs: [...j.logs.slice(-400), ev] };
        if (ev.type === 'end') return { ...j, status: ev.status, ended: Date.now() };
        return j;
      });
    });
  }), []);

  const running = jobs.filter((j) => j.status === 'running').length;

  // Sesión del CLI de Claude: se comprueba al abrir y cada vez que vuelves a la ventana
  const [auth, setAuth] = useState(null); // null = comprobando | { loggedIn }
  const checkAuth = () => api.authStatus().then(setAuth);
  useEffect(() => {
    checkAuth();
    window.addEventListener('focus', checkAuth);
    const off = api.onAuth(setAuth);
    return () => { window.removeEventListener('focus', checkAuth); off(); };
  }, []);
  const login = () => { api.login(); setAuth({ loggedIn: false, pending: true }); };

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="drag flex h-14 items-center gap-2.5 px-5 pt-1">
          <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#ff7a59] shadow-[0_0_20px_-4px_var(--color-accent)]">
            <Scissors size={15} strokeWidth={2.5} />
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight">Marc Edits</span>
        </div>

        <div className="px-3 pb-3">
          <button className="btn-primary w-full" onClick={() => setNewEdit({})}>
            <Plus size={16} /> Editar vídeo
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                view === id ? 'bg-white/[.07] text-white' : 'text-muted hover:bg-white/[.04] hover:text-zinc-200'
              }`}
            >
              <Icon size={17} className={view === id ? 'text-accent' : ''} />
              {label}
            </button>
          ))}
        </nav>

        {auth && !auth.loggedIn && (
          <div className="fadein mx-3 mt-auto rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
            <div className="mb-1 font-semibold text-amber-200">Claude no tiene la sesión iniciada</div>
            {auth.pending
              ? 'Termina el inicio de sesión en el navegador y vuelve aquí.'
              : 'Sin sesión no se puede editar con Claude ni guardar skills. El modo Rápido sí funciona.'}
            <button className="btn-primary mt-2.5 w-full py-1.5 text-xs" onClick={login}>
              <LogIn size={14} /> Iniciar sesión en Claude
            </button>
          </div>
        )}

        <div className={`p-4 text-[11px] leading-relaxed text-muted/70 ${auth && !auth.loggedIn ? '' : 'mt-auto'}`}>
          {running > 0 ? (
            <span className="flex items-center gap-2 text-zinc-300">
              <span className="size-2 animate-pulse rounded-full bg-accent" /> {running} tarea{running > 1 ? 's' : ''} en marcha
            </span>
          ) : null}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="drag h-9 shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
          {view === 'edited' && <Edited onNew={() => setNewEdit({})} onEditor={openEditor} />}
          {view === 'editor' && <Editor id={editorId} onPick={setEditorId} />}
          {view === 'scripts' && <Scripts />}
          {view === 'tools' && <Tools />}
          {view === 'references' && <References onUse={(refId) => setNewEdit({ refId })} />}
        </div>
        <Jobs jobs={jobs} setJobs={setJobs} />
      </main>

      {newEdit && (
        <NewEdit
          initial={newEdit}
          onClose={() => setNewEdit(null)}
          onStarted={() => { setNewEdit(null); setView('edited'); }}
        />
      )}
    </div>
  );
}
