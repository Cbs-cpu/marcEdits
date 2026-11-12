import { useEffect, useRef, useState } from 'react';
import {
  Clapperboard, FolderOpen, Trash2, Plus, Loader2, Scissors, Timer, MoreVertical, Sparkles, SlidersHorizontal,
  History, Info, MessageSquare, Clock, Copy, SquarePen, Repeat, Volume2, VolumeX, Send, Check, RotateCcw, LogIn, Pencil, AlertTriangle, Play,
} from 'lucide-react';
import { api, media, fmtDur, fmtDate, fmtClock, useElapsed, useLibrary } from '../lib.js';
import { Header, Empty, Badge } from '../components/ui.jsx';
import VideoChat from '../components/VideoChat.jsx';

const TABS = [
  { id: 'claude', label: 'Conversación', icon: MessageSquare },
  { id: 'versions', label: 'Versiones', icon: History },
  { id: 'info', label: 'Info', icon: Info },
];

// ---------- reproductor con ajustes de reproducción ----------
function VideoPlayer({ src, busy }) {
  const ref = useRef(null);
  const [loop, setLoop] = useState(() => localStorage.getItem('play.loop') !== '0');
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  useEffect(() => { try { localStorage.setItem('play.loop', loop ? '1' : '0'); } catch {} }, [loop]);
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate, src]);
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="relative">
        <video ref={ref} key={src} src={src} controls autoPlay loop={loop} muted={muted}
          className="h-[66vh] max-h-[720px] aspect-[9/16] rounded-xl bg-black object-contain" />
        {busy && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 text-sm text-zinc-200">
            <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-accent" /> Aplicando cambios…</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-ink p-1 text-xs">
        <button title="Repetir" onClick={() => setLoop(!loop)}
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 ${loop ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}>
          <Repeat size={13} /> Bucle
        </button>
        <div className="mx-1 h-4 w-px bg-line" />
        {[0.5, 1, 1.5, 2].map((r) => (
          <button key={r} onClick={() => setRate(r)}
            className={`rounded-md px-2 py-1.5 tabular-nums ${rate === r ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}>{r}x</button>
        ))}
        <div className="mx-1 h-4 w-px bg-line" />
        <button title={muted ? 'Activar sonido' : 'Silenciar'} onClick={() => setMuted(!muted)}
          className={`rounded-md px-2 py-1.5 ${muted ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}>
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>
    </div>
  );
}

// ---------- pestaña: versiones ----------
function VersionsTab({ item, onPreview, previewing }) {
  const [busy, setBusy] = useState(null);
  const hist = [...(item.history || [])].reverse();
  const descFor = (v) => (item.history || []).find((h) => h.backup === v)?.desc;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        <button onClick={() => onPreview(null)}
          className={`flex items-center gap-3 rounded-lg border p-2 text-left ${!previewing ? 'border-accent/60 bg-accent/10' : 'border-line bg-card hover:border-white/20'}`}>
          {item.thumb && <img src={media(item.thumb, item.v)} className="h-16 w-9 rounded object-cover" />}
          <div className="text-sm font-medium">Actual</div>
        </button>
        {item.versions.map((v) => (
          <div key={v.id} className={`flex items-center gap-3 rounded-lg border p-2 ${previewing === v.id ? 'border-accent/60 bg-accent/10' : 'border-line bg-card'}`}>
            {v.thumb && <img src={media(v.thumb, v.at)} className="h-16 w-9 rounded object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{v.id}</div>
              <div className="truncate text-xs text-muted">{fmtDate(v.at)}{descFor(v.id) ? ` · antes de: ${descFor(v.id)}` : ''}</div>
            </div>
            <button className="btn-icon" title="Ver" onClick={() => onPreview(v.id)}><Play size={14} /></button>
            <button className="btn-ghost py-1.5 text-xs" disabled={!!busy || item.busy}
              onClick={async () => { setBusy(v.id); await api.restoreEdited({ id: item.id, version: v.id }); setBusy(null); onPreview(null); }}>
              {busy === v.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restaurar
            </button>
          </div>
        ))}
        {item.versions.length === 0 && <p className="text-sm text-muted">Todavía no hay versiones anteriores.</p>}
      </div>
      {hist.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted">Historial</div>
          <div className="flex flex-col gap-1.5 text-sm">
            {hist.map((h, i) => (
              <div key={i} className="flex gap-2 text-zinc-300">
                <span className="shrink-0 text-xs text-muted tabular-nums">{fmtDate(h.at)}</span>
                <span>{h.type === 'claude' ? 'Claude: ' : h.type === 'restaurar' ? '' : 'Ajuste: '}{h.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- pestaña: info ----------
const Stat = ({ label, value }) => (
  <div className="rounded-lg border border-line bg-ink px-3 py-2">
    <div className="text-[11px] text-muted">{label}</div>
    <div className="font-display text-lg font-semibold">{value}</div>
  </div>
);
// Descripción para TikTok (caption.txt): la escribe Claude al editar; se puede retocar y copiar
function CaptionBox({ item }) {
  const [text, setText] = useState(item.caption || '');
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(item.caption || ''), [item.caption]);
  if (!item.caption && !text) {
    return <div className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">Sin descripción para TikTok. Pídesela a Claude en la conversación: «Escribe la descripción y los hashtags para TikTok».</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted">Descripción para TikTok</div>
      <textarea className="field h-28 resize-none text-[13px]" value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== item.caption && api.saveEditedCaption({ id: item.id, caption: text })} />
      <button className="btn-ghost self-start py-1.5 text-xs" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiada' : 'Copiar descripción'}
      </button>
    </div>
  );
}

function InfoTab({ item }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <CaptionBox item={item} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Original" value={fmtDur(item.duration_in)} />
        <Stat label="Final" value={fmtDur(item.duration_out)} />
        <Stat label="Planos" value={item.cuts ?? '—'} />
      </div>
      {item.timing?.seconds != null && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Tiempo de edición" value={fmtClock(item.timing.seconds)} />
          <Stat label="Análisis (sin Claude)" value={fmtClock(item.timing.steps?.analisis)} />
          <Stat label="Claude" value={fmtClock(item.timing.steps?.claude)} />
        </div>
      )}
      {item.lastChange?.seconds != null && <div className="text-sm"><span className="text-muted">Último cambio: </span>{fmtClock(item.lastChange.seconds)}</div>}
      <div className="text-sm"><span className="text-muted">Estilo: </span>{item.recipe}</div>
      {item.transcript && (
        <div className="rounded-lg border border-line bg-ink p-3 text-sm leading-relaxed text-zinc-300 select-text">{item.transcript}</div>
      )}
      {item.prompt && (
        <details className="rounded-lg border border-line bg-ink">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted">Prompt con el que se editó</summary>
          <pre className="whitespace-pre-wrap px-3 pb-3 font-mono text-[11.5px] text-zinc-400 select-text">{item.prompt}</pre>
        </details>
      )}
    </div>
  );
}

// ---------- ventana del vídeo ----------
function VideoWindow({ item, initialTab, onClose, onDeleted, onEditor }) {
  const [tab, setTab] = useState(initialTab || 'claude');
  const [preview, setPreview] = useState(null); // id de versión que se está viendo
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(item.title);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const pv = item.versions.find((v) => v.id === preview);
  const src = pv ? media(pv.video, pv.at) : media(item.video, item.v);
  const saveTitle = async () => { setEditingTitle(false); if (title.trim() && title !== item.title) await api.renameEdited({ id: item.id, title: title.trim() }); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="fadein flex max-h-full w-full max-w-6xl gap-6 rounded-2xl border border-line bg-panel p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <VideoPlayer src={src} busy={item.busy} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input className="w-full bg-transparent font-display text-xl font-semibold outline-none" autoFocus value={title}
                  onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && saveTitle()} />
              ) : (
                <h2 className="group flex items-center gap-2 font-display text-xl font-semibold">
                  <span className="truncate">{item.title}</span>
                  <button className="opacity-0 transition group-hover:opacity-100" onClick={() => setEditingTitle(true)}><Pencil size={14} className="text-muted" /></button>
                </h2>
              )}
              <p className="mt-0.5 text-xs text-muted">{fmtDate(item.created)}{pv ? ` · viendo ${pv.id}` : ''}</p>
            </div>
            {onEditor && <button className="btn-ghost py-1.5 text-xs" onClick={() => onEditor(item.id)}><SquarePen size={14} /> Abrir en el editor</button>}
            <button className="btn-icon" title="Mostrar archivo" onClick={() => api.show(item.video)}><FolderOpen size={16} /></button>
            <button className="btn-icon hover:text-red-300" title="Borrar (a la papelera)"
              onClick={async () => { if (confirm('¿Mover este vídeo editado a la papelera?')) { await api.deleteEdited(item.id); onDeleted(); } }}>
              <Trash2 size={16} />
            </button>
            <button className="btn-icon" title="Cerrar" onClick={onClose}>✕</button>
          </div>

          {item.lastError && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <AlertTriangle size={15} /> {item.lastError}
            </div>
          )}

          <div className="flex gap-1 border-b border-line">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
                  tab === id ? 'border-accent text-white' : 'border-transparent text-muted hover:text-zinc-200'}`}>
                <Icon size={14} /> {label}
                {id === 'versions' && item.versions.length > 0 && <span className="text-xs text-muted">{item.versions.length}</span>}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {tab === 'claude' && <VideoChat item={item} />}
            {tab === 'versions' && <VersionsTab item={item} previewing={preview} onPreview={setPreview} />}
            {tab === 'info' && <InfoTab item={item} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- cronómetro en vivo mientras se edita ----------
function LiveClock({ it }) {
  const started = it.timing?.started ? Date.parse(it.timing.started) : null;
  const secs = useElapsed(started, true);
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-accent" /> {it.ready ? 'Cambiando…' : 'Editando…'}</span>
      {started && !it.ready && <span className="font-mono text-xs tabular-nums text-muted">{fmtClock(secs)}</span>}
    </span>
  );
}

// ---------- menú de opciones de cada tarjeta ----------
function CardMenu({ it, onOpen, onDeleted, onEditor }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const item = (icon, label, fn, danger) => {
    const Icon = icon;
    return (
      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setOpen(false); fn(); }}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-white/[.07] ${danger ? 'text-red-300' : 'text-zinc-200'}`}>
        <Icon size={14} /> {label}
      </button>
    );
  };
  return (
    <div className="absolute right-2 top-2 z-10" onClick={(e) => e.stopPropagation()}>
      <span role="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen(!open)}
        className="grid size-7 place-items-center rounded-md bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={open}>
        <MoreVertical size={15} />
      </span>
      {open && (
        <div className="fadein absolute right-0 top-8 w-48 rounded-lg border border-line bg-panel p-1 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
          {item(MessageSquare, 'Conversación con Claude', () => onOpen('claude'))}
          {onEditor && item(SquarePen, 'Abrir en el editor', () => onEditor(it.id))}
          {item(History, 'Versiones', () => onOpen('versions'))}
          {item(FolderOpen, 'Mostrar archivo', () => api.show(it.video))}
          <div className="my-1 h-px bg-line" />
          {item(Trash2, 'Borrar', async () => { if (confirm('¿Mover este vídeo editado a la papelera?')) { await api.deleteEdited(it.id); onDeleted(); } }, true)}
        </div>
      )}
    </div>
  );
}

export default function Edited({ onNew, onEditor }) {
  const [items, reload] = useLibrary('edited');
  const [open, setOpen] = useState(null); // { id, tab }
  const current = items?.find((i) => i.id === open?.id);   // siempre la versión más reciente del vídeo

  return (
    <>
      <Header title="Vídeos editados">
        <button className="btn-ghost" onClick={onNew}><Plus size={15} /> Nuevo</button>
      </Header>

      {items && items.length === 0 && (
        <Empty icon={Clapperboard} title="Aún no hay vídeos" text="">
          <button className="btn-primary" onClick={onNew}><Plus size={15} /> Editar vídeo</button>
        </Empty>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        {items?.map((it) => (
          <div key={it.id} role="button" tabIndex={0}
            onClick={() => it.ready && setOpen({ id: it.id, tab: 'claude' })}
            className="group fadein relative cursor-pointer overflow-hidden rounded-xl border border-line bg-card text-left transition hover:-translate-y-0.5 hover:border-white/15">
            <div className="relative aspect-[9/16] bg-ink">
              {it.thumb && <img src={media(it.thumb, it.v)} className="size-full object-cover" />}
              {(!it.ready || it.busy) && (
                <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-zinc-300">
                  {it.status === 'error' ? (
                    <span className="flex flex-col items-center gap-2 text-red-300">
                      Ha fallado
                      <span role="button" className="btn-ghost py-1 text-xs"
                        onClick={async (e) => { e.stopPropagation(); await api.deleteEdited(it.id); reload(); }}>
                        <Trash2 size={13} /> Quitar
                      </span>
                    </span>
                  ) : (
                    <LiveClock it={it} />
                  )}
                </div>
              )}
              {it.ready && !it.busy && (
                <>
                  <CardMenu it={it} onOpen={(tab) => setOpen({ id: it.id, tab })} onDeleted={reload} onEditor={onEditor} />
                  <div className="absolute bottom-2 left-2 flex gap-1">
                    <Badge tone="dark"><Timer size={11} /> {fmtDur(it.duration_out)}</Badge>
                    {it.cuts != null && <Badge tone="dark"><Scissors size={11} /> {it.cuts}</Badge>}
                    {it.timing?.seconds != null && <Badge tone="dark" title="Tiempo de edición"><Clock size={11} /> {fmtClock(it.timing.seconds)}</Badge>}
                    {it.versions?.length > 0 && <Badge tone="dark"><History size={11} /> {it.versions.length}</Badge>}
                  </div>
                </>
              )}
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{it.title}</div>
              <div className="mt-0.5 truncate text-xs text-muted">{fmtDate(it.created)}</div>
            </div>
          </div>
        ))}
      </div>

      {current && (
        <VideoWindow key={current.id} item={current} initialTab={open.tab}
          onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); reload(); }}
          onEditor={onEditor && ((id) => { setOpen(null); onEditor(id); })} />
      )}
    </>
  );
}
