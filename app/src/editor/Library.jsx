import { useRef, useState } from 'react';
import { Type, Sticker, Sparkles, Shuffle, Volume2, Music, Play, Square, Plus, TrendingUp, Film, FolderPlus, Layers } from 'lucide-react';
import { fmtDur } from '../lib.js';
import { media } from '../lib.js';
import { TEXT_PRESETS, STICKERS, EMOJIS, EFFECTS, TRANSITIONS, YEL } from './model.js';
import { Overlay } from './Preview.jsx';

const TABS = [
  { id: 'vid', icon: Film, l: 'Vídeos' }, { id: 'text', icon: Type, l: 'Texto' }, { id: 'stk', icon: Sticker, l: 'Stickers' }, { id: 'fx', icon: Sparkles, l: 'Efectos' },
  { id: 'tr', icon: Shuffle, l: 'Transiciones' }, { id: 'snd', icon: Volume2, l: 'Sonidos' }, { id: 'mus', icon: Music, l: 'Música' },
];

// Cada elemento se puede pulsar (se añade en el cursor) o arrastrar a la línea de tiempo
function Item({ d, onAdd, children, className = '' }) {
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-marc', JSON.stringify(d)); e.dataTransfer.effectAllowed = 'copy'; }}
      onClick={() => onAdd(d)} title="Clic para añadir en el cursor · arrastra a la línea de tiempo"
      className={`group relative cursor-pointer rounded-lg border border-line bg-card transition hover:border-accent/50 hover:bg-[#1d1d27] ${className}`}>
      {children}
      <Plus size={13} className="absolute right-1.5 top-1.5 text-muted opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}

// Primer fotograma de un vídeo sacado de su tira de miniaturas
function Thumb({ img, info }) {
  if (!img || !info) return <div className="h-full w-full bg-white/5" />;
  const n = Math.max(1, Math.round(info.dur * info.fps));
  const fw = img.width / n;
  return <canvas className="h-full w-full object-cover" width={fw} height={img.height}
    ref={(cv) => { if (cv) cv.getContext('2d').drawImage(img, Math.min(n - 1, Math.floor(n * 0.15)) * fw, 0, fw, img.height, 0, 0, fw, img.height); }} />;
}

export default function Library({ onAdd, sounds, songs, selClip, videos = [], videoInfo, stripImgs = {}, mainSource, onImport }) {
  const [tab, setTab] = useState('text');
  const [playing, setPlaying] = useState(null);
  const audio = useRef(null);
  const preview = (path) => {
    audio.current?.pause();
    if (playing === path) { setPlaying(null); return; }
    const a = new Audio(media(path)); a.volume = 0.8; a.play().catch(() => {}); a.onended = () => setPlaying(null);
    audio.current = a; setPlaying(path);
  };
  const PlayBtn = ({ path }) => (
    <button onClick={(e) => { e.stopPropagation(); preview(path); }} className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-accent">
      {playing === path ? <Square size={11} /> : <Play size={11} />}
    </button>
  );

  return (
    <div className="flex min-h-0 w-[264px] shrink-0 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex w-[58px] shrink-0 flex-col gap-0.5 border-r border-white/[.06] p-1.5">
        {TABS.map(({ id, icon: Icon, l }) => (
          <button key={id} onClick={() => setTab(id)} title={l}
            className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[9.5px] transition ${tab === id ? 'bg-accent/15 text-white' : 'text-muted hover:bg-white/5 hover:text-zinc-200'}`}>
            <Icon size={17} className={tab === id ? 'text-accent' : ''} />{l}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {tab === 'vid' && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-snug text-muted">Clic: se añade como plano en el corte más cercano. Arrástralo a <b className="text-zinc-300">Vídeo</b> (plano) o a <b className="text-zinc-300">B-roll</b> (encima, con la voz debajo).</p>
            {videos.map((v) => {
              const info = videoInfo?.(v);
              return (
                <Item key={v} d={{ kind: 'video', src: v }} onAdd={onAdd} className="flex items-center gap-2 p-1.5">
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-black"><Thumb img={stripImgs[v]} info={info} /></div>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px]">{v.split('/').pop().replace(/^\d\d-/, '')}</div>
                    <div className="text-[10.5px] text-muted">
                      {info ? `${fmtDur(info.dur)}${info.w ? ` · ${info.w > info.h ? 'horizontal' : 'vertical'}` : ''}${info.audio === false ? ' · sin sonido' : ''}` : 'cargando…'}
                      {v === mainSource && ' · principal'}
                    </div>
                  </div>
                </Item>
              );
            })}
            <button className="btn-ghost justify-center py-2 text-xs" onClick={onImport}><FolderPlus size={14} /> Importar vídeos</button>
            <p className="flex gap-1.5 text-[10.5px] text-muted"><Layers size={12} className="shrink-0" /> También puedes soltar vídeos desde el explorador directamente en la línea de tiempo.</p>
          </div>
        )}
        {tab === 'text' && (
          <div className="flex flex-col gap-2">
            {TEXT_PRESETS.map((p) => (
              <Item key={p.l} d={{ kind: 'text', cap: p.cap, label: p.l }} onAdd={onAdd} className="px-3 py-2.5">
                <div className="truncate" style={{ fontFamily: `"${p.cap.font}"`, fontWeight: p.cap.font === 'Inter Tight' ? 900 : 600, fontStyle: p.cap.font === 'Instrument Serif' ? 'italic' : 'normal',
                  fontSize: 19, color: p.cap.color, ...(p.cap.box ? { background: 'rgba(10,10,12,.85)', padding: '0 6px', borderRadius: 4, display: 'inline-block' } : {}) }}>{p.l}</div>
                <div className="text-[11px] text-muted">{p.d}</div>
              </Item>
            ))}
          </div>
        )}
        {tab === 'stk' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {STICKERS.map((s) => (
                <Item key={s.l} d={{ kind: 'overlay', ov: s.ov, label: s.l }} onAdd={onAdd} className="h-20 overflow-hidden">
                  <div className="pointer-events-none absolute left-1/2 top-[42%]" style={{ transform: 'translate(-50%,-50%) scale(.36)' }}>
                    <Overlay o={{ ...s.ov, text: s.ov.type === 'title' ? 'Título' : s.ov.text }} />
                  </div>
                  <span className="absolute bottom-1 text-[10px] text-muted">{s.l}</span>
                </Item>
              ))}
            </div>
            <div className="mb-2 mt-4 text-[11px] font-medium text-muted">Emojis</div>
            <div className="grid grid-cols-4 gap-1.5">
              {EMOJIS.map((em) => (
                <Item key={em} d={{ kind: 'overlay', ov: { type: 'emoji', text: em, size: 150, x: 820, y: 560, anim: 'bounce', rotate: 8 } }} onAdd={onAdd} className="grid h-11 place-items-center text-2xl">
                  <span style={{ fontFamily: '"Segoe UI Emoji",sans-serif' }}>{em}</span>
                </Item>
              ))}
            </div>
          </>
        )}
        {tab === 'fx' && (
          <div className="flex flex-col gap-2">
            {EFFECTS.map((e) => (
              <Item key={e.v} d={{ kind: 'effect', fx: { type: e.v, dur: e.dur, amount: e.amount } }} onAdd={onAdd} className="px-3 py-2.5">
                <div className="text-sm font-medium">{e.l}</div>
                <div className="text-[11px] text-muted">{{ shake: 'Temblor en un golpe o dato fuerte', zoom: 'Zoom rápido que vuelve', flash: 'Destello blanco', blur: 'Desenfoque que se aclara' }[e.v]}</div>
              </Item>
            ))}
          </div>
        )}
        {tab === 'tr' && (
          <div className="flex flex-col gap-2">
            <p className="mb-1 text-[11px] text-muted">{selClip != null ? `Se aplica a la entrada del plano ${selClip + 1}.` : 'Se aplica al plano del cursor (o arrástrala sobre un plano).'}</p>
            {TRANSITIONS.map((t) => (
              <Item key={t.v} d={{ kind: 'transition', v: t.v }} onAdd={onAdd} className="px-3 py-2.5">
                <div className="text-sm font-medium">{t.l}</div>
                <div className="text-[11px] text-muted">{{ none: 'Sin efecto', punch: 'Pequeño golpe de zoom (1.05x)', zoom: 'Zoom más marcado (1.18x)', flash: 'Destello blanco', blur: 'Del desenfoque a nítido', whip: 'Barrido lateral con desenfoque' }[t.v]}</div>
              </Item>
            ))}
          </div>
        )}
        {tab === 'snd' && (
          <div className="flex flex-col gap-1.5">
            {sounds.length === 0 && <p className="text-xs text-muted">Añade sonidos en Herramientas → Sonidos.</p>}
            {sounds.map((s) => (
              <Item key={s.path} d={{ kind: 'sound', path: s.path }} onAdd={onAdd} className="flex items-center gap-2 px-2 py-2">
                <PlayBtn path={s.path} />
                <div className="min-w-0"><div className="truncate text-[13px]">{s.name}</div>{s.notes && <div className="truncate text-[10.5px] text-muted">{s.notes}</div>}</div>
              </Item>
            ))}
          </div>
        )}
        {tab === 'mus' && (
          <div className="flex flex-col gap-1.5">
            {songs.length === 0 && <p className="text-xs text-muted">Añade canciones en Herramientas → Canciones.</p>}
            {songs.map((s) => (
              <Item key={s.path} d={{ kind: 'music', path: s.path }} onAdd={onAdd} className="flex items-center gap-2 px-2 py-2">
                <PlayBtn path={s.path} />
                <div className="min-w-0"><div className="truncate text-[13px]">{s.name}</div>{s.notes && <div className="line-clamp-2 text-[10.5px] text-muted">{s.notes}</div>}</div>
              </Item>
            ))}
            <p className="mt-2 flex gap-1.5 text-[11px] text-muted"><TrendingUp size={13} className="shrink-0" /> Las canciones en tendencia de TikTok tienen copyright: se añaden desde TikTok al publicar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
