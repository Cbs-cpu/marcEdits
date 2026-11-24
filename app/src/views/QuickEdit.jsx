import { useEffect, useState } from 'react';
import { UploadCloud, Film, Check, X, Trash2, ArrowUp, ArrowDown, Plus, Link2, FolderOpen, Loader2, LogIn, Ban, Zap } from 'lucide-react';
import { api, useLibrary, media, fmtDur } from '../lib.js';

// Editar vídeo = modo Exprés (~20 s): vídeo, referencia opcional y listo.
// Una referencia ya analizada se aplica al momento; si no lo está, se analiza primero (una sola vez).
function Toggle({ on, onClick, children }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-2 text-left text-sm">
      <span className={`grid size-4 shrink-0 place-items-center rounded border ${on ? 'border-accent bg-accent' : 'border-zinc-600'}`}>{on && <Check size={11} />}</span>
      {children}
    </button>
  );
}

const pref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };

export default function QuickEdit({ initial = {}, onClose, onStarted }) {
  const [refs, reloadRefs] = useLibrary('references');
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [zoom, setZoom] = useState(() => pref('edit.zoom', true));
  const [gradient, setGradient] = useState(() => pref('edit.gradient', true));
  const [refId, setRefId] = useState(initial.refId || null);
  const [refUrl, setRefUrl] = useState('');
  const [refErr, setRefErr] = useState(null);
  const [notes, setNotes] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  useEffect(() => setPref('edit.zoom', zoom), [zoom]);
  useEffect(() => setPref('edit.gradient', gradient), [gradient]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const addFiles = async (paths) => {
    const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (!list.length) return;
    const probed = await Promise.all(list.map(async (p) => ({ path: p, name: p.split(/[\\/]/).pop(), ...(await api.probeVideo(p)) })));
    setFiles((fs) => [...fs, ...probed.filter((x) => !fs.some((f) => f.path === x.path))]);
    setTitle((t) => t || list[0].split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };
  // modo prueba (MARC_TEST_FILE)
  useEffect(() => {
    if (!window.__MARC_TEST_FILE) return;
    addFiles([].concat(window.__MARC_TEST_FILE));
    if (window.__MARC_TEST_TITLE) setTitle(window.__MARC_TEST_TITLE);
    if (window.__MARC_TEST_REF) setRefId(window.__MARC_TEST_REF);
  }, []);
  const move = (i, d) => setFiles((fs) => { const a = [...fs]; const j = i + d; if (j < 0 || j >= a.length) return fs; [a[i], a[j]] = [a[j], a[i]]; return a; });

  const ref = refs?.find((r) => r.id === refId) || null;
  const analyzed = (r) => !!(r?.analysis || r?.skill);
  useEffect(() => { if (refs && refId && !ref) { setRefId(null); setRefErr('No se ha podido descargar.'); } }, [refs]);
  const addRef = async (o) => {
    setRefErr(null);
    try { const r = await api.addReference(o); await reloadRefs(); setRefId(r.id); setRefUrl(''); }
    catch { setRefErr('No se ha podido añadir.'); }
  };

  const go = async () => {
    setBusy(true);
    try {
      const a = await api.authStatus();
      if (!a.loggedIn) { setNeedLogin(true); return; }
      const p = await api.prepareEdit({ files: files.map((f) => ({ path: f.path, role: 'principal' })), title });
      await api.runExpress({ id: p.id, title, notes: notes.trim(), gradient, zoom, refId });
      onStarted();
    } finally { setBusy(false); }
  };

  const total = files.reduce((a, f) => a + (f.dur || 0), 0);
  const ready = files.length > 0 && (!ref || ref.video);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="fadein flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 pb-2 pt-5">
          <h2 className="font-display text-lg font-semibold">Editar vídeo</h2>
          <button className="btn-icon ml-auto" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5">
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((f, i) => (
                <div key={f.path} className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-2.5 py-2">
                  <Film size={16} className="shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{f.name}</div>
                    <div className="text-[11px] text-muted">{fmtDur(f.dur)}</div>
                  </div>
                  {files.length > 1 && <>
                    <button className="btn-icon" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                    <button className="btn-icon" disabled={i === files.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                  </>}
                  <button className="btn-icon" onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files].map((f) => api.pathForFile(f))); }}
            onClick={async () => addFiles(await api.pickVideo(true))}
            className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 text-center transition-colors ${files.length ? 'py-3' : 'py-10'} ${
              drag ? 'border-accent bg-accent/5' : 'border-line hover:border-white/20'}`}>
            {files.length
              ? <span className="flex items-center gap-2 text-sm text-muted"><Plus size={15} /> Añadir otro vídeo</span>
              : <><UploadCloud size={26} className="mb-1.5 text-muted" /><span className="text-sm font-medium">Arrastra un vídeo o haz clic</span></>}
          </div>

          {files.length > 0 && (
            <>
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
              <div className="grid grid-cols-2 gap-2">
                <Toggle on={zoom} onClick={() => setZoom(!zoom)}>Zooms</Toggle>
                <Toggle on={gradient} onClick={() => setGradient(!gradient)}>Degradado negro</Toggle>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted">Que se parezca a… (opcional)</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button onClick={() => setRefId(null)}
                    className={`grid h-28 w-16 shrink-0 place-items-center rounded-lg border-2 bg-card text-[11px] text-muted ${!refId ? 'border-accent text-white' : 'border-transparent hover:border-white/15'}`}>
                    <span className="flex flex-col items-center gap-1"><Ban size={16} /> Ninguna</span>
                  </button>
                  {refs?.map((r) => (
                    <button key={r.id} onClick={() => setRefId(r.id)} title={r.title}
                      className={`relative h-28 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${refId === r.id ? 'border-accent' : 'border-transparent hover:border-white/15'}`}>
                      {r.thumb ? <img src={media(r.thumb)} className="size-full object-cover" /> : <div className="grid size-full place-items-center bg-card"><Loader2 size={14} className="animate-spin text-muted" /></div>}
                      <span className={`absolute inset-x-0 bottom-0 py-0.5 text-[9px] font-semibold ${analyzed(r) ? 'bg-emerald-500/90 text-black' : 'bg-black/70 text-zinc-300'}`}>
                        {!r.video ? '…' : analyzed(r) ? 'Lista' : 'Sin analizar'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input className="field py-1.5 pl-8 text-xs" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="Enlace de TikTok, Instagram o YouTube"
                      onKeyDown={(e) => e.key === 'Enter' && refUrl.trim() && addRef({ url: refUrl.trim() })} />
                  </div>
                  <button className="btn-ghost py-1.5 text-xs" onClick={async () => { const f = await api.pickVideo(); if (f) addRef({ file: f }); }}><FolderOpen size={13} /> Subir</button>
                </div>
                {refErr && <p className="text-xs text-red-300">{refErr}</p>}
                {ref && ref.video && !analyzed(ref) && <p className="text-xs text-amber-200">Se analiza primero: unos minutos, solo esta vez.</p>}
              </div>

              <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Indicaciones (opcional)" />
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-6 py-3.5">
          <span className="text-xs text-muted">{files.length ? `${fmtDur(total)} · ~20 s` : ''}</span>
          {needLogin && (
            <button className="btn-ghost ml-auto py-1 text-xs text-amber-200" onClick={() => api.login()}><LogIn size={13} /> Iniciar sesión en Claude</button>
          )}
          <button className={`btn-primary ${needLogin ? '' : 'ml-auto'}`} disabled={!ready || busy} onClick={go}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} Editar ya
          </button>
        </div>
      </div>
    </div>
  );
}
