import { lazy, Suspense, useEffect, useState } from 'react';
import { Clapperboard, FileText, Wrench, Bookmark, Plus, Scissors, LogIn, SquarePen, GalleryHorizontalEnd, Images, Flame, Loader2, Zap, Gem } from 'lucide-react';
import { api } from './lib.js';
import Jobs from './components/Jobs.jsx';

// Cada sección se carga solo cuando se abre: la app arranca antes y usa menos memoria
const Edited = lazy(() => import('./views/Edited.jsx'));
const Scripts = lazy(() => import('./views/Scripts.jsx'));
const Tools = lazy(() => import('./views/Tools.jsx'));
const References = lazy(() => import('./views/References.jsx'));
const NewEdit = lazy(() => import('./views/NewEdit.jsx'));
const Editor = lazy(() => import('./views/Editor.jsx'));
const Carousels = lazy(() => import('./views/Carousels.jsx'));
const CarouselRefs = lazy(() => import('./views/CarouselRefs.jsx'));
const Formats = lazy(() => import('./views/Formats.jsx'));
const NewCarousel = lazy(() => import('./views/NewCarousel.jsx'));

const MODES = {
  videos: {
    label: 'Vídeos', icon: Clapperboard, cta: 'Editar vídeo', home: 'edited',
    nav: [
      { id: 'edited', label: 'Vídeos editados', icon: Clapperboard },
      { id: 'editor', label: 'Editor', icon: SquarePen },
      { id: 'scripts', label: 'Guiones', icon: FileText },
      { id: 'tools', label: 'Herramientas', icon: Wrench },
      { id: 'references', label: 'Referencias', icon: Bookmark },
    ],
  },
  carousels: {
    label: 'Carruseles', icon: GalleryHorizontalEnd, cta: 'Crear carrusel', home: 'carousels',
    nav: [
      { id: 'carousels', label: 'Mis carruseles', icon: Images },
      { id: 'carouselRefs', label: 'Referencias', icon: Bookmark },
      { id: 'formats', label: 'Formatos en tendencia', icon: Flame },
    ],
  },
};

const load = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const Spinner = () => <div className="grid h-60 place-items-center text-muted"><Loader2 size={20} className="animate-spin" /></div>;

export default function App() {
  const [mode, setModeRaw] = useState(() => (MODES[load('mode', 'videos')] ? load('mode', 'videos') : 'videos'));
  const [view, setView] = useState(() => MODES[mode].home);
  const setMode = (m) => { setModeRaw(m); save('mode', m); setView(MODES[m].home); };
  const [editorId, setEditorId] = useState(null);
  const openEditor = (id) => { setEditorId(id); setView('editor'); };
  const [newEdit, setNewEdit] = useState(null); // null | { recipeId?, refId? }
  const [newCarousel, setNewCarousel] = useState(null); // null | { refId?, format? }
  const [jobs, setJobs] = useState([]);

  useEffect(() => api.onJob((ev) => {
    setJobs((list) => {
      if (ev.type === 'start') return [{ ...ev, logs: [], open: true }, ...list];
      return list.map((j) => {
        if (j.id !== ev.id) return j;
        if (ev.type === 'log') return { ...j, logs: [...j.logs.slice(-200), ev] };
        if (ev.type === 'end') return { ...j, status: ev.status, ended: Date.now(), seconds: ev.seconds };
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

  // Velocidad de Claude: Rápido (esfuerzo medio) o Máxima calidad (alto)
  const [settings, setSettings] = useState(null);
  useEffect(() => { api.settingsGet().then(setSettings); }, []);
  const setEffort = async (effort) => setSettings(await api.settingsSet({ effort }));

  const M = MODES[mode];
  const primary = () => (mode === 'videos' ? setNewEdit({}) : setNewCarousel({}));

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="drag flex h-14 items-center gap-2.5 px-5 pt-1">
          <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#ff7a59] shadow-[0_0_20px_-4px_var(--color-accent)]">
            <Scissors size={15} strokeWidth={2.5} />
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight">Marc Edits</span>
        </div>

        {/* Vídeos | Carruseles */}
        <div className="mx-3 mb-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink p-1">
          {Object.entries(MODES).map(([k, m]) => {
            const Icon = m.icon;
            return (
              <button key={k} onClick={() => setMode(k)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] font-medium transition ${
                  mode === k ? 'bg-white/[.09] text-white shadow' : 'text-muted hover:text-zinc-200'}`}>
                <Icon size={14} className={mode === k ? 'text-accent' : ''} /> {m.label}
              </button>
            );
          })}
        </div>

        <div className="px-3 pb-3">
          <button className="btn-primary w-full" onClick={primary}>
            <Plus size={16} /> {M.cta}
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {M.nav.map(({ id, label, icon: Icon }) => (
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
              : 'Sin sesión no se puede editar con Claude ni guardar skills.'}
            <button className="btn-primary mt-2.5 w-full py-1.5 text-xs" onClick={login}>
              <LogIn size={14} /> Iniciar sesión en Claude
            </button>
          </div>
        )}

        <div className={`flex flex-col gap-2 p-3 text-[11px] leading-relaxed text-muted/70 ${auth && !auth.loggedIn ? '' : 'mt-auto'}`}>
          {running > 0 && (
            <span className="flex items-center gap-2 px-1 text-zinc-300">
              <span className="size-2 animate-pulse rounded-full bg-accent" /> {running} tarea{running > 1 ? 's' : ''} en marcha
            </span>
          )}
          {settings && (
            <div className="rounded-lg border border-line bg-ink p-1" title="Cuánto piensa Claude entre paso y paso. Rápido tarda bastante menos; Máxima calidad, para vídeos complicados.">
              <div className="grid grid-cols-2 gap-1">
                {[['medium', 'Rápido', Zap], ['high', 'Máx. calidad', Gem]].map(([k, l, Icon]) => (
                  <button key={k} onClick={() => setEffort(k)}
                    className={`flex items-center justify-center gap-1 rounded-md py-1 text-[11px] transition ${settings.effort === k ? 'bg-white/10 text-white' : 'text-muted hover:text-zinc-200'}`}>
                    <Icon size={11} /> {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="drag h-9 shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
          <Suspense fallback={<Spinner />}>
            {view === 'edited' && <Edited onNew={() => setNewEdit({})} onEditor={openEditor} />}
            {view === 'editor' && <Editor id={editorId} onPick={setEditorId} />}
            {view === 'scripts' && <Scripts />}
            {view === 'tools' && <Tools />}
            {view === 'references' && <References onUse={(refId) => setNewEdit({ refId })} />}
            {view === 'carousels' && <Carousels onNew={() => setNewCarousel({})} />}
            {view === 'carouselRefs' && <CarouselRefs onClone={(refId) => setNewCarousel({ refId })} />}
            {view === 'formats' && <Formats onUse={(format) => setNewCarousel({ format })} />}
          </Suspense>
        </div>
        <Jobs jobs={jobs} setJobs={setJobs} />
      </main>

      <Suspense fallback={null}>
        {newEdit && (
          <NewEdit
            initial={newEdit}
            onClose={() => setNewEdit(null)}
            onStarted={() => { setNewEdit(null); setView('edited'); }}
          />
        )}
        {newCarousel && (
          <NewCarousel
            initial={newCarousel}
            onClose={() => setNewCarousel(null)}
            onStarted={() => { setNewCarousel(null); setView('carousels'); }}
          />
        )}
      </Suspense>
    </div>
  );
}
