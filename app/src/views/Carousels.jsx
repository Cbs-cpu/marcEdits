import { useEffect, useState } from 'react';
import { Images, Plus, Loader2, Trash2, FolderOpen, ChevronLeft, ChevronRight, Copy, Check, Timer, X, MessageSquare, Info, AlertTriangle } from 'lucide-react';
import { api, media, fmtDate, fmtClock, useLibrary, useElapsed } from '../lib.js';
import { Header, Empty, Badge } from '../components/ui.jsx';
import VideoChat from '../components/VideoChat.jsx';

// Visor tipo móvil: desliza entre diapositivas con flechas, teclado o miniaturas
function Swiper({ item }) {
  const [i, setI] = useState(0);
  const n = item.slides.length;
  useEffect(() => { if (i >= n) setI(Math.max(0, n - 1)); }, [n]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'ArrowRight') setI((x) => Math.min(n - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [n]);
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="relative h-[64vh] max-h-[700px] aspect-[9/16] overflow-hidden rounded-xl bg-black">
        {n > 0 && <img key={item.slides[i]} src={media(item.slides[i], item.v)} className="fadein size-full object-contain" />}
        {item.busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-zinc-200">
            <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-accent" /> Aplicando cambios…</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-2 flex justify-center gap-1">
          {item.slides.map((_, k) => <span key={k} className={`h-1 rounded-full transition-all ${k === i ? 'w-5 bg-white' : 'w-2.5 bg-white/40'}`} />)}
        </div>
        {i > 0 && <button className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 backdrop-blur" onClick={() => setI(i - 1)}><ChevronLeft size={18} /></button>}
        {i < n - 1 && <button className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 backdrop-blur" onClick={() => setI(i + 1)}><ChevronRight size={18} /></button>}
        <span className="absolute bottom-2 right-2"><Badge tone="dark">{i + 1}/{n}</Badge></span>
      </div>
      <div className="flex max-w-[calc(64vh*9/16)] gap-1 overflow-x-auto pb-1">
        {item.slides.map((s, k) => (
          <button key={s} onClick={() => setI(k)} className={`shrink-0 overflow-hidden rounded border-2 ${k === i ? 'border-accent' : 'border-transparent opacity-70 hover:opacity-100'}`}>
            <img src={media(s, item.v)} className="h-14 w-8 object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

function CaptionBox({ item }) {
  const [text, setText] = useState(item.caption || '');
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(item.caption || ''), [item.caption]);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted">Descripción para TikTok</div>
      <textarea className="field h-32 resize-none text-[13px]" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== item.caption && api.carouselSaveCaption({ id: item.id, caption: text })} />
      <button className="btn-ghost self-start py-1.5 text-xs" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiada' : 'Copiar descripción'}
      </button>
    </div>
  );
}

function CarouselWindow({ item, onClose, onDeleted }) {
  const [tab, setTab] = useState('claude');
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const t = item.timing;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="fadein flex h-[88vh] w-full max-w-6xl gap-6 overflow-hidden rounded-2xl border border-line bg-panel p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <Swiper item={item} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-semibold">{item.title}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {fmtDate(item.created)} · {item.slides.length} diapositivas
                {t?.seconds != null && <Badge><Timer size={11} /> creado en {fmtClock(t.seconds)}</Badge>}
                {item.lastChange?.seconds != null && <Badge>último cambio {fmtClock(item.lastChange.seconds)}</Badge>}
              </div>
            </div>
            <button className="btn-ghost py-1.5 text-xs" onClick={() => api.open(`${item.dir}/slides`)}><FolderOpen size={14} /> Abrir carpeta</button>
            <button className="btn-icon" title="Borrar" onClick={async () => { if (confirm('¿Mover este carrusel a la papelera?')) { await api.carouselDelete(item.id); onDeleted(); } }}><Trash2 size={16} /></button>
            <button className="btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="mb-3 flex gap-1 border-b border-line">
            {[['claude', 'Conversación', MessageSquare], ['info', 'Publicar', Info]].map(([k, l, Icon]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === k ? 'border-accent text-white' : 'border-transparent text-muted hover:text-zinc-200'}`}>
                <Icon size={14} /> {l}
              </button>
            ))}
          </div>
          {tab === 'claude' && <VideoChat item={item} kind="carousel" />}
          {tab === 'info' && (
            <div className="flex flex-col gap-4 overflow-y-auto text-sm">
              <CaptionBox item={item} />
              <div className="rounded-xl border border-line bg-ink p-3 text-xs leading-relaxed text-zinc-300">
                <b className="text-white">Cómo publicarlo con el producto anclado:</b> pasa los PNG de la carpeta <i>slides</i> al móvil →
                TikTok → <b>+</b> → <b>Fotos</b> → elige las diapositivas en orden → añade un sonido en tendencia → <b>Añadir enlace → Producto</b>
                (TikTok Shop) → pega la descripción.
              </div>
              {item.prompt && (
                <details className="rounded-xl border border-line bg-ink p-3 text-xs">
                  <summary className="cursor-pointer text-muted">Prompt con el que se creó</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-zinc-400 select-text">{item.prompt}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BusyCard({ it, reload }) {
  const started = it.timing?.started ? Date.parse(it.timing.started) : null;
  const secs = useElapsed(started, it.busy);
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-zinc-300">
      {it.status === 'error' ? (
        <span className="flex flex-col items-center gap-2 text-red-300">
          <AlertTriangle size={18} /> Ha fallado
          <span role="button" className="btn-ghost py-1 text-xs" onClick={async (e) => { e.stopPropagation(); await api.carouselDelete(it.id); reload(); }}><Trash2 size={13} /> Quitar</span>
        </span>
      ) : (
        <span className="flex flex-col items-center gap-1.5">
          <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-accent" /> {it.ready ? 'Cambiando…' : 'Creando…'}</span>
          {started && <span className="font-mono text-xs tabular-nums text-muted">{fmtClock(secs)}</span>}
        </span>
      )}
    </div>
  );
}

export default function Carousels({ onNew }) {
  const [items, reload] = useLibrary('carousels');
  const [open, setOpen] = useState(null);
  const current = items?.find((i) => i.id === open);
  return (
    <>
      <Header title="Mis carruseles" subtitle="Posts de fotos para TikTok Shop, listos para subir">
        <button className="btn-ghost" onClick={onNew}><Plus size={15} /> Nuevo</button>
      </Header>
      {items && items.length === 0 && (
        <Empty icon={Images} title="Aún no hay carruseles" text="Sube las fotos de tu producto y elige un formato en tendencia o un carrusel para clonar.">
          <button className="btn-primary" onClick={onNew}><Plus size={15} /> Crear carrusel</button>
        </Empty>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        {items?.map((it) => (
          <div key={it.id} role="button" onClick={() => it.ready && setOpen(it.id)}
            className="group fadein relative cursor-pointer overflow-hidden rounded-xl border border-line bg-card text-left transition hover:-translate-y-0.5 hover:border-white/15">
            <div className="relative aspect-[9/16] bg-ink">
              {it.thumb && <img src={media(it.thumb, it.v)} className="size-full object-cover" loading="lazy" />}
              {(!it.ready || it.busy || it.status === 'error') && <BusyCard it={it} reload={reload} />}
              {it.ready && !it.busy && (
                <div className="absolute bottom-2 left-2 flex gap-1">
                  <Badge tone="dark"><Images size={11} /> {it.slides.length}</Badge>
                  {it.timing?.seconds != null && <Badge tone="dark"><Timer size={11} /> {fmtClock(it.timing.seconds)}</Badge>}
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{it.title}</div>
              <div className="mt-0.5 truncate text-xs text-muted">{fmtDate(it.created)}</div>
            </div>
          </div>
        ))}
      </div>
      {current && <CarouselWindow key={current.id} item={current} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); reload(); }} />}
    </>
  );
}
