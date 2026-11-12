import { useEffect, useRef, useState } from 'react';
import { UploadCloud, Film, Check, LogIn, Bookmark, Send, ChevronRight, Music, Volume2, Shuffle, Sparkles, X, Pencil,
  ArrowUp, ArrowDown, Trash2, Plus, Link2, Loader2, FolderOpen, Ban } from 'lucide-react';
import { api, useLibrary, media, fmtDur } from '../lib.js';
import { CaptionPreview } from './Tools.jsx';
import { buildPrompt, SUGGESTIONS, ROLES } from '../prompt.js';

// Editar vídeo paso a paso: cada respuesta se va apilando como una conversación y al final
// se enseña el prompt exacto que recibirá Claude (editable) antes de enviarlo.
// Pocas preguntas: lo demás (transiciones, efectos, sonidos) lo decide Claude; se puede fijar en «Más opciones»
const STEPS = ['video', 'referencia', 'estilo', 'musica', 'indicaciones', 'revision'];

const Q = {
  video: '¿Qué vídeos editamos? (uno o varios para juntarlos)',
  referencia: '¿Quieres que quede como algún vídeo?',
  estilo: '¿Qué estilo y qué subtítulos?',
  musica: '¿Música de fondo?',
  indicaciones: '¿Alguna indicación? (lo demás lo decide Claude)',
  revision: 'Esto es exactamente lo que va a recibir Claude.',
};

function Bubble({ who, children, onEdit }) {
  return who === 'q' ? (
    <div className="fadein flex gap-2.5">
      <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#ff7a59] text-[10px] font-bold">C</div>
      <div className="text-[15px] font-medium text-zinc-100">{children}</div>
    </div>
  ) : (
    <div className="fadein group flex justify-end">
      <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-tr-sm bg-white/[.07] px-3.5 py-2 text-sm text-zinc-200">
        <span>{children}</span>
        {onEdit && (
          <button className="opacity-0 transition group-hover:opacity-100" title="Cambiar" onClick={onEdit}><Pencil size={13} className="text-muted" /></button>
        )}
      </div>
    </div>
  );
}

function Chips({ items, selected, onToggle, multi = true }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const on = multi ? selected.includes(it.key) : selected === it.key;
        return (
          <button key={it.key} onClick={() => onToggle(it.key)} title={it.notes || ''}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
              on ? 'border-accent/70 bg-accent/15 text-white' : 'border-line bg-card text-zinc-300 hover:border-white/20'}`}>
            {on && <Check size={13} className="text-accent" />} {it.label}
          </button>
        );
      })}
    </div>
  );
}

export default function NewEdit({ initial, onClose, onStarted }) {
  const [recipes] = useLibrary('recipes');
  const [refs, reloadRefs] = useLibrary('references');
  const [tools, setTools] = useState({ transiciones: [], canciones: [], sonidos: [], efectos: [] });
  useEffect(() => {
    Promise.all(Object.keys(tools).map((c) => api.toolsList(c))).then(([transiciones, canciones, sonidos, efectos]) =>
      setTools({ transiciones, canciones, sonidos, efectos }));
  }, []);

  const [trends, setTrends] = useState([]);
  useEffect(() => { api.trendsGet().then((t) => setTrends(t.songs || [])); }, []);
  // canción elegida: archivo de Canciones o 'trend:<n>' (canción en tendencia que se añade desde TikTok)
  const songObj = (k) => (k?.startsWith('trend:') ? { ...trends[+k.slice(6)], trend: true } : tools.canciones.find((s) => s.file === k) || null);

  const [step, setStep] = useState(0);
  // vídeos de entrada, en orden: { path, name, dur, w, h, audio, role, note }
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState('orden');      // varios vídeos: 'orden' (el de la lista) | 'libre' (lo decide Claude)
  const [length, setLength] = useState(null);     // vídeos largos: corto | medio | largo | todo
  const [title, setTitle] = useState(window.__MARC_TEST_FILE ? 'Embutido ibérico · prueba 0.6' : '');
  // referencia «quiero que quede así»: id de library/references (o null)
  const [refId, setRefId] = useState(initial.refId || null);
  const [refAnalyse, setRefAnalyse] = useState(true);
  const [refUrl, setRefUrl] = useState('');
  const [refErr, setRefErr] = useState(null);
  const [recipeId, setRecipeId] = useState(initial.recipeId || 'skill-video-edit');
  const [captionsId, setCaptionsId] = useState(null); // null = los del estilo · 'none' = sin subtítulos
  const [more, setMore] = useState(false);
  // Exprés (por defecto): cortes perfectos + degradado en < 1 min, sin más preguntas · Completo: el asistente entero
  const [express, setExpress] = useState(() => { try { return localStorage.getItem('edit.express') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('edit.express', express ? '1' : '0'); } catch {} }, [express]);
  const [gradient, setGradient] = useState(true);
  const [notes, setNotes] = useState('');
  const [transitions, setTransitions] = useState([]);
  const [song, setSong] = useState(null);
  const [songVolume, setSongVolume] = useState('suave');
  const [sounds, setSounds] = useState([]);
  const [effects, setEffects] = useState([]);
  const [suggestions, setSuggestions] = useState(SUGGESTIONS.filter((s) => s.on).map((s) => s.id));
  const [extra, setExtra] = useState('');
  const [prep, setPrep] = useState(null); // { id, input }
  const [prompt, setPrompt] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [sending, setSending] = useState(false);
  const [drag, setDrag] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [step]);

  const recipe = recipes?.find((r) => r.id === recipeId);
  const captions = captionsId === 'none' ? { id: 'none', name: 'Sin subtítulos', data: {} } : recipes?.find((r) => r.id === captionsId) || recipe;
  const byFile = (cat, files) => tools[cat].filter((t) => files.includes(t.file));
  const toggle = (setter) => (k) => setter((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  const addFiles = async (paths) => {
    const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (!list.length) return;
    const probed = await Promise.all(list.map(async (p) => ({ path: p, name: p.split(/[\\/]/).pop(), role: 'principal', note: '', ...(await api.probeVideo(p)) })));
    setFiles((fs) => {
      const all = [...fs, ...probed.filter((x) => !fs.some((f) => f.path === x.path))];
      // un vídeo sin audio o apaisado suele ser recurso: se marca como B-roll (se puede cambiar)
      return all.map((f, i) => (fs.includes(f) || i === 0 ? f : { ...f, role: !f.audio ? 'broll' : f.role }));
    });
    if (!title) setTitle(list[0].split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };
  useEffect(() => {
    if (!window.__MARC_TEST_FILE) return;
    addFiles([].concat(window.__MARC_TEST_FILE));
    // modo prueba: subtítulos, indicaciones y texto extra fijados desde el entorno
    if (window.__MARC_TEST_CAPTIONS) setCaptionsId(window.__MARC_TEST_CAPTIONS);
    if (window.__MARC_TEST_TIPS) setSuggestions((l) => [...new Set([...l, ...window.__MARC_TEST_TIPS])]);
    if (window.__MARC_TEST_EXTRA) setExtra(window.__MARC_TEST_EXTRA);
    if (window.__MARC_TEST_TITLE) setTitle(window.__MARC_TEST_TITLE);
  }, []);
  const setF = (i, patch) => setFiles((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const moveF = (i, d) => setFiles((fs) => { const a = [...fs]; const j = i + d; if (j < 0 || j >= a.length) return fs; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const totalDur = files.reduce((a, f) => a + (f.dur || 0), 0);
  const isLong = files.some((f) => f.dur > 120) || totalDur > 180;

  const ref = refs?.find((r) => r.id === refId) || null;
  const refReady = !refId || !!ref?.video;
  // si la descarga falla, la referencia desaparece de la lista
  useEffect(() => { if (refs && refId && !ref) { setRefId(null); setRefErr('No se ha podido descargar ese enlace. Prueba con otro o sube el vídeo.'); } }, [refs]);
  const addRef = async ({ url, file }) => {
    setRefErr(null);
    try {
      const r = await api.addReference(url ? { url } : { file });
      await reloadRefs(); setRefId(r.id); setRefUrl('');
    } catch (e) { setRefErr('No se ha podido añadir la referencia.'); }
  };

  // Al llegar a la revisión: se prepara el vídeo (id + copia en inputs/) y se genera el prompt exacto
  const [preparing, setPreparing] = useState(false);
  const goReview = async () => {
    // el vídeo se prepara (copia en inputs/ + id) una vez; si cambian los vídeos, se vuelve a preparar
    const key = JSON.stringify(files.map((f) => [f.path, f.role, f.note]));
    let p = prep;
    if (!p || p.key !== key) {
      setPreparing(true);
      try {
        if (p) await api.discardEdit(p.id);
        p = { ...(await api.prepareEdit({ files: files.map((f) => ({ path: f.path, role: f.role, note: f.note })), title })), key };
        setPrep(p);
      } finally { setPreparing(false); }
    }
    let reference = null;
    if (ref) {
      reference = { ...ref, analyse: !ref.skill && refAnalyse };
      if (reference.analyse) reference.skillPrompt = await api.skillPrompt(ref.id);
    }
    setPrompt(buildPrompt({
      id: p.id, input: p.input, inputs: p.inputs, mode, length: isLong ? (length || 'corto') : null, reference, title, recipe, captions,
      transitions: byFile('transiciones', transitions), song: songObj(song), songVolume,
      sounds: byFile('sonidos', sounds), effects: byFile('efectos', effects), suggestions, extra,
    }));
    setStep(STEPS.indexOf('revision'));
  };
  const next = () => (STEPS[step + 1] === 'revision' ? goReview() : setStep(step + 1));
  const goTo = (name) => setStep(STEPS.indexOf(name));
  const close = () => { if (prep) api.discardEdit(prep.id); onClose(); };

  const sendExpress = async () => {
    setSending(true);
    const a = await api.authStatus();
    if (!a.loggedIn) { setNeedLogin(true); setSending(false); return; }
    setPreparing(true);
    try {
      if (prep) await api.discardEdit(prep.id);
      const p = await api.prepareEdit({ files: files.map((f) => ({ path: f.path, role: f.role, note: f.note })), title });
      await api.runExpress({ id: p.id, title, notes: notes.trim(), gradient });
      onStarted();
    } finally { setPreparing(false); setSending(false); }
  };
  const send = async () => {
    setSending(true);
    const a = await api.authStatus();
    if (!a.loggedIn) { setNeedLogin(true); setSending(false); return; }
    // con la skill video-edit, el análisis previo deja hecha su ingesta en work/reels/<id>
    await api.runEdit({ id: prep.id, title, recipe: recipe?.name || recipeId, prompt, skillProject: recipe?.data?.skill === 'video-edit' ? `work/reels/${prep.id}` : null });
    onStarted();
  };

  // ---- resumen de cada respuesta ya dada ----
  const names = (cat, files) => byFile(cat, files).map((t) => t.name).join(', ');
  const answer = {
    video: files.length === 1 ? `${files[0].name}${title ? ` · «${title}»` : ''}`
      : `${files.length} vídeos (${fmtDur(totalDur)})${mode === 'libre' ? ' · orden libre' : ' · en este orden'}${title ? ` · «${title}»` : ''}`,
    referencia: !ref ? 'Ninguna' : `${ref.title}${ref.skill ? ' · skill ya analizada' : refAnalyse ? ' · analizar y guardar como skill' : ''}`,
    estilo: `${recipe?.name} · ${captionsId === 'none' ? 'sin subtítulos' : captionsId && captionsId !== recipeId ? `subtítulos ${captions?.name}` : 'sus subtítulos'}${transitions.length ? ` · ${names('transiciones', transitions)}` : ''}${effects.length ? ` · ${names('efectos', effects)}` : ''}`,
    musica: !song ? 'Sin música' : song.startsWith('trend:') ? `${songObj(song)?.title} (se añade en TikTok)` : `${songObj(song)?.name} · volumen ${songVolume.replace('_', ' ')}`,
    indicaciones: `${suggestions.length} indicaciones${extra.trim() ? ` · «${extra.trim().slice(0, 60)}${extra.trim().length > 60 ? '…' : ''}»` : ''}`,
  };

  // ---- controles del paso actual ----
  const current = STEPS[step];
  const controls = {
    video: (
      <div className="flex flex-col gap-3">
        {files.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <div key={f.path} className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-2.5 py-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold">{i + 1}</span>
                <Film size={16} className="shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.name}</div>
                  <div className="text-[11px] text-muted">
                    {fmtDur(f.dur)}{f.w ? ` · ${f.w > f.h ? 'horizontal' : 'vertical'}` : ''}{!f.audio ? ' · sin sonido' : ''}
                  </div>
                  {files.length > 1 && (
                    <input className="mt-1 w-full bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600" value={f.note}
                      onChange={(e) => setF(i, { note: e.target.value })} placeholder="Qué hay en este vídeo (opcional): «unboxing», «pantalla de la web»…" />
                  )}
                </div>
                {files.length > 1 && (
                  <select className="field w-auto py-1 text-xs" value={f.role} onChange={(e) => setF(i, { role: e.target.value })}>
                    {Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                )}
                {files.length > 1 && <>
                  <button className="btn-icon" disabled={i === 0} onClick={() => moveF(i, -1)} title="Subir"><ArrowUp size={14} /></button>
                  <button className="btn-icon" disabled={i === files.length - 1} onClick={() => moveF(i, 1)} title="Bajar"><ArrowDown size={14} /></button>
                </>}
                <button className="btn-icon" onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))} title="Quitar"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files].map((f) => api.pathForFile(f))); }}
          onClick={async () => addFiles(await api.pickVideo(true))}
          className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 text-center transition ${files.length ? 'py-4' : 'py-8'} ${
            drag ? 'border-accent bg-accent/5' : 'border-line hover:border-white/20'}`}>
          {files.length
            ? <div className="flex items-center gap-2 text-sm text-muted"><Plus size={16} /> Añadir más vídeos para juntarlos</div>
            : <><UploadCloud size={26} className="mb-1.5 text-muted" /><div className="text-sm font-medium">Arrastra uno o varios vídeos o haz clic</div></>}
        </div>
        {files.length > 1 && (
          <Chips multi={false} selected={mode} onToggle={setMode}
            items={[{ key: 'orden', label: 'Juntarlos en este orden' }, { key: 'libre', label: 'Que Claude decida el orden y qué usar' }]} />
        )}
        {isLong && (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-medium text-muted">Vídeo largo ({fmtDur(totalDur)}). ¿Cuánto tiene que durar el resultado?</div>
            <Chips multi={false} selected={length || 'corto'} onToggle={setLength}
              items={[{ key: 'corto', label: '15-35 s' }, { key: 'medio', label: '35-60 s' }, { key: 'largo', label: '1-3 min' }, { key: 'todo', label: 'Todo, solo limpiar' }]} />
          </div>
        )}
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
        <div className="grid grid-cols-2 gap-2">
          {[[true, '⚡ Exprés', 'menos de 1 min', 'Cortes perfectos y degradado negro. Sin subtítulos ni efectos: listo para subir.'],
            [false, '🎬 Completo', '5-12 min', 'Claude edita con estilo: subtítulos, zooms, música, efectos, referencias.']].map(([v, t, d, txt]) => (
            <button key={t} onClick={() => setExpress(v)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${express === v ? 'border-accent/70 bg-accent/10' : 'border-line bg-card hover:border-white/20'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">{t}<span className="ml-auto text-[11px] font-normal text-muted">{d}</span></div>
              <div className="mt-0.5 text-xs text-muted">{txt}</div>
            </button>
          ))}
        </div>
        {express && (
          <div className="flex flex-col gap-2">
            <button onClick={() => setGradient(!gradient)} className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-2 text-left text-sm">
              <span className={`grid size-4 shrink-0 place-items-center rounded border ${gradient ? 'border-accent bg-accent' : 'border-zinc-600'}`}>{gradient && <Check size={11} />}</span>
              Degradado negro arriba y abajo (más cinematográfico)
            </button>
            <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Indicaciones para los cortes (opcional): «quita la parte del precio», «la marca es Esamagna»…" />
            {needLogin && (
              <p className="flex items-center gap-2 text-xs text-amber-200">Claude no tiene la sesión iniciada.
                <button className="btn-ghost py-1 text-xs" onClick={() => api.login()}><LogIn size={13} /> Iniciar sesión</button></p>
            )}
          </div>
        )}
      </div>
    ),
    referencia: (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-5 gap-2.5">
          <button onClick={() => setRefId(null)}
            className={`grid aspect-[9/16] place-items-center rounded-xl border-2 bg-card text-sm text-muted transition ${!refId ? 'border-accent text-white' : 'border-transparent hover:border-white/15'}`}>
            <span className="flex flex-col items-center gap-1.5"><Ban size={20} /> Ninguna</span>
          </button>
          {refs?.map((r) => {
            const on = refId === r.id;
            return (
              <button key={r.id} onClick={() => setRefId(r.id)}
                className={`relative overflow-hidden rounded-xl border-2 text-left transition ${on ? 'border-accent' : 'border-transparent hover:border-white/15'}`}>
                {r.thumb ? <img src={media(r.thumb)} className="aspect-[9/16] w-full object-cover" />
                  : <div className="grid aspect-[9/16] place-items-center bg-card"><Loader2 size={18} className="animate-spin text-muted" /></div>}
                <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.skill ? 'bg-emerald-500/90 text-black' : 'bg-black/70 text-zinc-300'}`}>
                  {!r.video ? 'Descargando…' : r.skill ? 'Skill' : 'Sin analizar'}
                </span>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6 text-xs font-medium">{r.title}</div>
                {on && <div className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent"><Check size={12} /></div>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field pl-9" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="Pega un enlace de TikTok, Instagram o YouTube"
              onKeyDown={(e) => { if (e.key === 'Enter' && refUrl.trim()) addRef({ url: refUrl.trim() }); }} />
          </div>
          <button className="btn-ghost" disabled={!refUrl.trim()} onClick={() => addRef({ url: refUrl.trim() })}><Plus size={14} /> Añadir</button>
          <button className="btn-ghost" onClick={async () => { const f = await api.pickVideo(); if (f) addRef({ file: f }); }}><FolderOpen size={14} /> Subir vídeo</button>
        </div>
        {refErr && <p className="text-xs text-red-300">{refErr}</p>}
        {ref && !ref.video && <p className="flex items-center gap-2 text-xs text-muted"><Loader2 size={13} className="animate-spin" /> Descargando la referencia… (se guarda también en Referencias)</p>}
        {ref && ref.video && !ref.skill && (
          <button onClick={() => setRefAnalyse(!refAnalyse)} className="flex items-start gap-2.5 rounded-lg border border-line bg-card px-3 py-2 text-left text-sm">
            <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${refAnalyse ? 'border-accent bg-accent' : 'border-zinc-600'}`}>{refAnalyse && <Check size={11} />}</span>
            <span>Analizarla a fondo y guardarla como skill antes de editar<span className="block text-xs text-muted">Así queda en Referencias y la puedes reutilizar en otros vídeos.</span></span>
          </button>
        )}
        {ref?.skill && <p className="text-xs text-muted">Ya está analizada: Claude seguirá su skill (estructura, ritmo, subtítulos, B-roll y sonido).</p>}
      </div>
    ),
    estilo: (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-3">
          {recipes?.map((r) => {
            const th = refs?.find((x) => `ref-${x.id}` === r.id)?.thumb || (r.data.skill === 'video-edit' ? 'library/edited/embutido-iberico-skill-2026-11-08/thumb.jpg' : null);
            const on = recipeId === r.id;
            return (
              <button key={r.id} onClick={() => setRecipeId(r.id)}
                className={`relative overflow-hidden rounded-xl border-2 text-left transition ${on ? 'border-accent' : 'border-transparent hover:border-white/15'}`}>
                {th ? <img src={media(th)} className="aspect-[9/16] w-full object-cover" /> : <CaptionPreview cap={r.data.captions} className="rounded-none" />}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6 text-xs font-medium">
                  {r.fromReference && <Bookmark size={11} className="mr-1 inline" />}{r.name}
                </div>
                {on && <div className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent"><Check size={12} /></div>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted">Subtítulos</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCaptionsId(null)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${!captionsId || captionsId === recipeId ? 'border-accent/70 bg-accent/15 text-white' : 'border-line bg-card text-zinc-300 hover:border-white/20'}`}>Los del estilo</button>
            {recipes?.filter((r) => r.id !== recipeId).map((r) => (
              <button key={r.id} onClick={() => setCaptionsId(r.id)} title={r.data.captions_notes || ''}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${captionsId === r.id ? 'border-accent/70 bg-accent/15 text-white' : 'border-line bg-card text-zinc-300 hover:border-white/20'}`}>{r.name}</button>
            ))}
            <button onClick={() => setCaptionsId('none')}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${captionsId === 'none' ? 'border-accent/70 bg-accent/15 text-white' : 'border-line bg-card text-zinc-300 hover:border-white/20'}`}>
              <Ban size={13} /> Sin subtítulos
            </button>
          </div>
        </div>
        <div>
          <button className="flex items-center gap-1.5 text-xs text-muted hover:text-white" onClick={() => setMore(!more)}>
            <ChevronRight size={13} className={`transition ${more ? 'rotate-90' : ''}`} /> Más opciones: transiciones y efectos concretos (si no, los elige Claude)
          </button>
          {more && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-ink p-3">
              <div className="text-xs text-muted">Transiciones</div>
              <Chips items={tools.transiciones.map((t) => ({ key: t.file, label: t.name, notes: t.notes }))} selected={transitions} onToggle={toggle(setTransitions)} />
              <div className="mt-1 text-xs text-muted">Efectos</div>
              <Chips items={tools.efectos.map((t) => ({ key: t.file, label: t.name, notes: t.notes }))} selected={effects} onToggle={toggle(setEffects)} />
            </div>
          )}
        </div>
      </div>
    ),
    musica: (
      <div className="flex flex-col gap-3">
        <Chips multi={false} selected={song || '__none'} onToggle={(k) => setSong(k === '__none' ? null : k)}
          items={[{ key: '__none', label: 'Sin música' }, ...tools.canciones.map((t) => ({ key: t.file, label: t.name, notes: t.notes }))]} />
        {trends.length > 0 && (
          <>
            <div className="mt-1 text-xs font-medium text-muted">En tendencia en TikTok · se añade desde TikTok al publicar</div>
            <Chips multi={false} selected={song || '__none'} onToggle={(k) => setSong(k === song ? null : k)}
              items={trends.map((t, i) => ({ key: `trend:${i}`, label: `${t.title} · ${t.artist}`, notes: t.notes }))} />
          </>
        )}
        {song && !song.startsWith('trend:') && (
          <Chips multi={false} selected={songVolume} onToggle={setSongVolume}
            items={[{ key: 'muy_suave', label: 'Muy suave' }, { key: 'suave', label: 'Suave' }, { key: 'media', label: 'Media' }]} />
        )}
      </div>
    ),
    indicaciones: (
      <div className="flex flex-col gap-1.5">
        {SUGGESTIONS.map((s) => {
          const on = suggestions.includes(s.id);
          return (
            <button key={s.id} onClick={() => toggle(setSuggestions)(s.id)}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition ${
                on ? 'border-accent/50 bg-accent/10 text-white' : 'border-line bg-card text-zinc-400 hover:border-white/20'}`}>
              <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${on ? 'border-accent bg-accent' : 'border-zinc-600'}`}>
                {on && <Check size={11} />}
              </span>
              {s.text}
            </button>
          );
        })}
        <textarea className="field mt-1.5 h-24 resize-none" value={extra} onChange={(e) => setExtra(e.target.value)}
          placeholder="Algo más (opcional). Ej. La marca se escribe «Esamagna». Corta la última frase. Pon la canción solo en el final." />
      </div>
    ),
    revision: (
      <div className="flex flex-col gap-3">
        <textarea className="field h-[46vh] resize-none font-mono text-[12px] leading-relaxed" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>Modelo: <b className="text-zinc-300">Opus 5.5</b> · tu suscripción de Claude · primero la app analiza el vídeo en tu PC (transcripción y silencios) y luego edita Claude</span>
          {needLogin && (
            <span className="ml-auto flex items-center gap-2 text-amber-200">
              Claude no tiene la sesión iniciada.
              <button className="btn-ghost py-1 text-xs" onClick={() => api.login()}><LogIn size={13} /> Iniciar sesión</button>
            </span>
          )}
        </div>
      </div>
    ),
  };

  const canNext = current === 'video' ? files.length > 0 : current === 'referencia' ? refReady : true;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={close}>
      <div className="fadein flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-6 py-3.5">
          <h2 className="font-display text-lg font-semibold">Editar vídeo</h2>
          <div className="ml-2 flex gap-1">
            {STEPS.map((s, i) => <span key={s} className={`h-1 w-6 rounded-full ${i < step ? 'bg-accent' : i === step ? 'bg-accent/50' : 'bg-white/10'}`} />)}
          </div>
          <button className="btn-icon ml-auto" onClick={close}><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-4">
            {STEPS.slice(0, step).map((s) => (
              <div key={s} className="flex flex-col gap-2">
                <Bubble who="q">{Q[s]}</Bubble>
                <Bubble who="a" onEdit={() => goTo(s)}>{answer[s]}</Bubble>
              </div>
            ))}
            <div className="flex flex-col gap-3">
              <Bubble who="q">{Q[current]}</Bubble>
              <div className="fadein pl-8">{controls[current]}</div>
            </div>
            <div ref={endRef} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">
          {step > 0 && <button className="btn-ghost mr-auto" onClick={() => setStep(step - 1)}>Atrás</button>}
          {current === 'video' && express ? (
            <button className="btn-primary" disabled={!files.length || sending || preparing} onClick={sendExpress}>
              {preparing ? <><Loader2 size={15} className="animate-spin" /> Preparando…</> : <>⚡ Editar ya</>}
            </button>
          ) : current === 'revision' ? (
            <button className="btn-primary" disabled={sending || !prompt.trim()} onClick={send}><Send size={15} /> Enviar a Claude</button>
          ) : (
            <button className="btn-primary" disabled={!canNext || preparing} onClick={next}>
              {preparing ? <><Loader2 size={15} className="animate-spin" /> Preparando vídeos…</> : <>Seguir <ChevronRight size={15} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
