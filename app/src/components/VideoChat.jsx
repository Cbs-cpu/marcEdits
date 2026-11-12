import { useEffect, useRef, useState } from 'react';
import {
  Send, Loader2, LogIn, Type, Sparkles, Shuffle, Volume2, Music, Zap, ChevronDown, RotateCcw, X, Check, TrendingUp, MessageSquarePlus,
} from 'lucide-react';
import { api } from '../lib.js';
import { buildChatContext, CHANGE_CHIPS } from '../prompt.js';
import { buildCarouselChatContext, CAROUSEL_CHIPS } from '../carouselPrompt.js';

// ---------- panel flotante encima del cuadro de texto ----------
function Pop({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={`fadein absolute bottom-full left-0 z-20 mb-2 flex max-h-[52vh] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl ${wide ? 'w-full' : 'w-[420px]'}`}>
      <div className="flex items-center border-b border-line px-3 py-2">
        <span className="text-sm font-medium">{title}</span>
        <button className="btn-icon ml-auto size-7" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="min-h-0 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

// Lista de herramientas de una carpeta: al elegir una, se inserta su referencia exacta en el mensaje
function ToolPicker({ cat, label, onPick }) {
  const [items, setItems] = useState(null);
  const [trends, setTrends] = useState([]);
  useEffect(() => {
    api.toolsList(cat).then(setItems);
    if (cat === 'canciones') api.trendsGet().then((t) => setTrends(t.songs || []));
  }, [cat]);
  const Row = ({ title, sub, onClick }) => (
    <button onClick={onClick} className="flex w-full flex-col rounded-lg px-2.5 py-2 text-left hover:bg-white/[.06]">
      <span className="text-sm">{title}</span>
      {sub && <span className="line-clamp-2 text-xs text-muted">{sub}</span>}
    </button>
  );
  return (
    <div className="flex flex-col">
      {items?.length === 0 && trends.length === 0 && <p className="p-2 text-sm text-muted">No hay {label.toLowerCase()} en Herramientas.</p>}
      {items?.map((t) => (
        <Row key={t.file} title={t.name} sub={t.notes}
          onClick={() => onPick(`[${label}: ${t.name} → ${t.path}${t.notes ? ` | notas: ${t.notes}` : ''}]`)} />
      ))}
      {trends.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-3 text-xs font-medium text-muted"><TrendingUp size={12} /> En tendencia (se añade desde TikTok)</div>
          {trends.map((t, i) => (
            <Row key={i} title={`${t.title} · ${t.artist}`} sub={t.notes}
              onClick={() => onPick(`[Canción en tendencia de TikTok: «${t.title}» de ${t.artist}. No la metas en el vídeo (copyright): déjalo sin música de fondo para añadirla desde TikTok al publicar.]`)} />
          ))}
        </>
      )}
    </div>
  );
}

// Subtítulos: corregir el texto palabra por palabra o cambiar de estilo
function SubtitlesPicker({ item, onPick }) {
  const [text, setText] = useState(item.transcript || '');
  const [recipes, setRecipes] = useState([]);
  useEffect(() => { api.list('recipes').then(setRecipes); }, []);
  return (
    <div className="flex flex-col gap-3 p-1">
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">Texto de los subtítulos (corrígelo aquí)</div>
        <textarea className="field h-36 resize-none text-[13px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-ghost mt-2 py-1.5 text-xs" disabled={!text.trim() || text === item.transcript}
          onClick={() => onPick(`Cambia los subtítulos para que digan exactamente esto, palabra por palabra, manteniendo los tiempos:\n"""\n${text.trim()}\n"""`)}>
          Insertar corrección
        </button>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">Estilo de subtítulos</div>
        <div className="flex flex-wrap gap-1.5">
          {recipes.map((r) => (
            <button key={r.id} className="rounded-full border border-line bg-card px-3 py-1 text-[13px] hover:border-white/20"
              onClick={() => onPick(`[Estilo de subtítulos: ${r.name} → library/tools/recipes/${r.id}.json${r.data.captions_notes ? ` | notas: ${r.data.captions_notes}` : ''}]`)}>
              {r.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Ajustes rápidos (ffmpeg, sin Claude): se aplican al momento y quedan apuntados en la conversación
function QuickPanel({ item }) {
  const [running, setRunning] = useState(null);
  const [msg, setMsg] = useState(null);
  const [trim, setTrim] = useState({ start: '', end: '' });
  const run = async (key, op, value) => {
    setRunning(key); setMsg(null);
    try { await api.quickEdited({ id: item.id, op, value }); setMsg({ ok: true, text: 'Hecho. Está apuntado en la conversación.' }); }
    catch (e) { setMsg({ ok: false, text: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }); }
    setRunning(null);
  };
  const Btn = ({ k, op, value, children }) => (
    <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={!!running || item.busy} onClick={() => run(k, op, value)}>
      {running === k && <Loader2 size={12} className="animate-spin" />}{children}
    </button>
  );
  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-xs text-muted">Velocidad</span>
        <Btn k="s105" op="speed" value={1.05}>1.05x</Btn><Btn k="s110" op="speed" value={1.1}>1.1x</Btn>
        <Btn k="s120" op="speed" value={1.2}>1.2x</Btn><Btn k="s125" op="speed" value={1.25}>1.25x</Btn>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-xs text-muted">Recortar (s)</span>
        <input className="field w-20 py-1.5 text-xs" type="number" min="0" step="0.1" placeholder="Inicio" value={trim.start} onChange={(e) => setTrim({ ...trim, start: e.target.value })} />
        <input className="field w-20 py-1.5 text-xs" type="number" min="0" step="0.1" placeholder="Final" value={trim.end} onChange={(e) => setTrim({ ...trim, end: e.target.value })} />
        <Btn k="trim" op="trim" value={trim}>Recortar</Btn>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-xs text-muted">Volumen</span>
        <Btn k="v-3" op="volume" value={-3}>−3 dB</Btn><Btn k="v+3" op="volume" value={3}>+3 dB</Btn>
        <Btn k="norm" op="normalize">Normalizar para TikTok</Btn>
      </div>
      {msg && <div className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</div>}
    </div>
  );
}

// ---------- mensajes ----------
function Message({ m }) {
  const [open, setOpen] = useState(false);
  if (m.role === 'context') {
    return (
      <div className="rounded-lg border border-line bg-ink text-xs">
        <button className="flex w-full items-center gap-2 px-3 py-2 text-muted" onClick={() => setOpen(!open)}>
          <ChevronDown size={13} className={`transition ${open ? '' : '-rotate-90'}`} /> Contexto del vídeo que recibió Claude con el primer mensaje
        </button>
        {open && <pre className="whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] text-zinc-400 select-text">{m.text}</pre>}
      </div>
    );
  }
  if (m.role === 'event') {
    return <div className="mx-auto max-w-[90%] rounded-full bg-white/[.05] px-3 py-1 text-center text-xs text-muted">{m.text}</div>;
  }
  const mine = m.role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'gap-2.5'}`}>
      {!mine && <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#ff7a59] text-[10px] font-bold">C</div>}
      <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed select-text ${
        mine ? 'rounded-tr-sm bg-accent/15 text-zinc-100' : 'rounded-tl-sm bg-white/[.06] text-zinc-200'}`}>
        {m.text}
      </div>
    </div>
  );
}

export default function VideoChat({ item, kind = 'video' }) {
  const car = kind === 'carousel';
  const chatApi = car
    ? { get: api.carouselChatGet, add: api.carouselChatNew, send: api.carouselChatSend }
    : { get: api.chatGet, add: api.chatNew, send: api.chatSend };
  const [chat, setChat] = useState({ session: null, messages: [], jobId: null });
  const [logs, setLogs] = useState([]);
  const [text, setText] = useState('');
  const [pop, setPop] = useState(null);
  const [showCtx, setShowCtx] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const taRef = useRef(null);

  const load = () => chatApi.get(item.id).then(setChat);
  useEffect(() => {
    load();
    const off = api.onChat((id) => id === item.id && load());
    return off;
  }, [item.id]);
  // actividad en directo del trabajo de Claude de esta conversación
  useEffect(() => {
    if (!chat.jobId) { setLogs([]); return; }
    const off = api.onJob((ev) => {
      if (ev.id !== chat.jobId) return;
      if (ev.type === 'log' && ['tool', 'claude'].includes(ev.level)) setLogs((l) => [...l.slice(-3), ev.text]);
      if (ev.type === 'end') load();
    });
    return off;
  }, [chat.jobId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat.messages.length, logs.length, chat.jobId]);

  const working = !!chat.jobId;
  const first = !chat.session && !chat.messages.some((m) => m.role === 'user');
  const context = car ? buildCarouselChatContext(item) : buildChatContext(item);
  const insert = (snippet) => {
    setText((t) => (t.trim() ? `${t.trimEnd()}\n${snippet}` : snippet));
    setPop(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };
  const send = async () => {
    const msg = text.trim();
    if (!msg || working) return;
    setSending(true);
    const a = await api.authStatus();
    if (!a.loggedIn) { setNeedLogin(true); setSending(false); return; }
    setNeedLogin(false);
    await chatApi.send({ id: item.id, text: msg, context: first ? context : null });
    setText(''); setSending(false);
    load();
  };

  const TOOLS = car ? [] : [
    { id: 'subs', label: 'Subtítulos', icon: Type },
    { id: 'efectos', label: 'Efectos', icon: Sparkles, cat: 'efectos', ref: 'Efecto' },
    { id: 'transiciones', label: 'Transiciones', icon: Shuffle, cat: 'transiciones', ref: 'Transición' },
    { id: 'sonidos', label: 'Sonidos', icon: Volume2, cat: 'sonidos', ref: 'Sonido' },
    { id: 'canciones', label: 'Canciones', icon: Music, cat: 'canciones', ref: 'Canción' },
    { id: 'quick', label: 'Ajustes rápidos', icon: Zap },
  ];
  const cur = TOOLS.find((t) => t.id === pop);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span>Opus 5.5 · {chat.session ? 'Claude recuerda toda la conversación' : 'conversación nueva'}</span>
        {chat.messages.length > 0 && (
          <button className="ml-auto flex items-center gap-1 hover:text-white" disabled={working}
            onClick={async () => { if (confirm('¿Empezar una conversación nueva? La actual se archiva.')) { await chatApi.add(item.id); load(); } }}>
            <MessageSquarePlus size={13} /> Nueva conversación
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-3 pb-2">
          {chat.messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-line p-4 text-sm text-zinc-300">
              {car
                ? 'Pídele cambios a Claude como en un chat: «otra versión del gancho», «letra más grande en la 3», «añade una diapositiva con el precio»… Cada vez que cambie el carrusel se guarda la versión anterior.'
                : 'Pídele cambios a Claude como en un chat: «sube los subtítulos», «pon el efecto de shake en el 20», «quita la última frase»… Cada vez que cambie el vídeo se guarda la versión anterior.'}
              <button className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-white" onClick={() => setShowCtx(!showCtx)}>
                <ChevronDown size={12} className={`transition ${showCtx ? '' : '-rotate-90'}`} /> Ver el contexto que irá con el primer mensaje
              </button>
              {showCtx && <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400 select-text">{context}</pre>}
            </div>
          )}
          {chat.messages.map((m, i) => <Message key={i} m={m} />)}
          {working && (
            <div className="flex gap-2.5">
              <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#ff7a59] text-[10px] font-bold">C</div>
              <div className="min-w-0 rounded-2xl rounded-tl-sm bg-white/[.06] px-3.5 py-2 text-[13px]">
                <div className="flex items-center gap-2 text-zinc-200"><Loader2 size={14} className="animate-spin text-accent" /> {car ? 'Trabajando en el carrusel…' : 'Trabajando en el vídeo…'}</div>
                {logs.map((l, i) => <div key={i} className="mt-1 truncate font-mono text-[11px] text-muted">› {l}</div>)}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* sugerencias rápidas */}
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        {(car ? CAROUSEL_CHIPS : CHANGE_CHIPS).map((c) => (
          <button key={c} onClick={() => insert(c)} className="shrink-0 rounded-full border border-line bg-card px-2.5 py-1 text-xs text-zinc-300 hover:border-white/20">{c}</button>
        ))}
      </div>

      <div className="relative rounded-xl border border-line bg-ink focus-within:border-accent/50">
        {cur && (
          <Pop title={cur.label} onClose={() => setPop(null)} wide={cur.id === 'subs'}>
            {cur.id === 'subs' && <SubtitlesPicker item={item} onPick={insert} />}
            {cur.cat && <ToolPicker cat={cur.cat} label={cur.ref} onPick={insert} />}
            {cur.id === 'quick' && <QuickPanel item={item} />}
          </Pop>
        )}
        <textarea ref={taRef} rows={3} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={working ? 'Claude está trabajando… puedes ir escribiendo el siguiente cambio' : 'Escribe qué quieres cambiar (Enter para enviar, Shift+Enter para salto de línea)'}
          className="block max-h-48 w-full resize-none bg-transparent px-3.5 pt-3 text-[13.5px] leading-relaxed outline-none placeholder:text-muted/60" />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button key={id} title={label} onClick={() => setPop(pop === id ? null : id)}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${pop === id ? 'bg-white/10 text-white' : 'text-muted hover:bg-white/5 hover:text-white'}`}>
              <Icon size={14} /> <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
          {needLogin && (
            <button className="ml-auto flex items-center gap-1 text-xs text-amber-200" onClick={() => api.login()}><LogIn size={13} /> Iniciar sesión</button>
          )}
          <button className={`btn-primary px-3 py-1.5 ${needLogin ? '' : 'ml-auto'}`} disabled={!text.trim() || working || sending} onClick={send}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
      {first && text.trim() && <p className="mt-1.5 text-[11px] text-muted">El primer mensaje va con el contexto {car ? 'del carrusel' : 'del vídeo'} delante; los siguientes se envían tal cual.</p>}
    </div>
  );
}
