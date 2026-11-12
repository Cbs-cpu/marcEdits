import { useEffect, useMemo, useRef } from 'react';
import { Clapperboard, Type, Volume2, Music, Sticker, Sparkles, Mic, Magnet, Layers } from 'lucide-react';
import { media } from '../lib.js';
import { starts, totalDur, cdur, lanes, fmtT, srcOf } from './model.js';

const LABEL_W = 108;


const Handle = ({ side, d, beginDrag }) => (
  <span onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { ...d, mode: side }); }}
    className={`absolute top-0 z-10 h-full w-2 cursor-ew-resize ${side === 'l' ? 'left-0 rounded-l' : 'right-0 rounded-r'} hover:bg-white/40`} />
);

function Row({ icon: Icon, label, h, children, onDropKind, width, pxs, onDropItem, onDropFiles, onEmpty }) {
  return (
    <div className="flex border-b border-white/[.06]" style={{ height: h }}
      onDragOver={(e) => onDropKind && e.preventDefault()}
      onDrop={(e) => {
        if (!onDropKind) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const at = Math.max(0, (e.clientX - r.left - LABEL_W) / pxs);
        // vídeos soltados desde el explorador de Windows
        if (e.dataTransfer.files?.length && onDropFiles) {
          const files = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter((f) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(f));
          if (files.length) onDropFiles(files, at);
          return;
        }
        try { onDropItem(JSON.parse(e.dataTransfer.getData('application/x-marc')), at); } catch {}
      }}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-white/[.06] bg-[#141419] px-3 text-[11px] text-muted" style={{ width: LABEL_W }}>
        <Icon size={13} /> {label}
      </div>
      <div className="relative" style={{ width }} onPointerDown={(e) => { if (e.target === e.currentTarget) onEmpty(e); }}>{children}</div>
    </div>
  );
}

// Tira de fotogramas de un plano (canvas): como las miniaturas de CapCut/Premiere
function FilmStrip({ img, assets, clip, width, height }) {   // clip: { in, out } en segundos de su vídeo
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !img || !assets) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(width * dpr)); cv.height = Math.floor(height * dpr);
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const n = Math.max(1, Math.round(assets.dur * assets.fps));
    const fw = img.width / n, tileW = (fw / img.height) * height;
    for (let x = 0; x < width; x += tileW) {
      const t = clip.in + ((x + tileW / 2) / width) * (clip.out - clip.in);
      const idx = Math.min(n - 1, Math.max(0, Math.floor(t * assets.fps)));
      ctx.drawImage(img, idx * fw, 0, fw, img.height, x, 0, tileW, height);
    }
  }, [img, assets, clip.in, clip.out, width, height]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 opacity-90" style={{ width, height }} />;
}

// Forma de onda de un tramo de audio [a, b) en segundos del archivo
function Wave({ peaks, a, b, width, height, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(width * dpr)); cv.height = Math.floor(height * dpr);
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.fillStyle = color;
    const { rate, peaks: p } = peaks;
    for (let x = 0; x < width; x += 2) {
      const i0 = Math.floor((a + (x / width) * (b - a)) * rate), i1 = Math.max(i0 + 1, Math.floor((a + ((x + 2) / width) * (b - a)) * rate));
      let m = 0; for (let i = i0; i < i1 && i < p.length; i++) if (p[i] > m) m = p[i];
      const h = Math.max(1, (m / 100) * (height - 4));
      ctx.fillRect(x, (height - h) / 2, 1.4, h);
    }
  }, [peaks, a, b, width, height, color]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0" style={{ width, height }} />;
}

export default function Timeline({ tl, T, pxs, setPxs, sel, setSel, onSeek, beginDrag, cutoutValid, assets, stripImgs, musicPeaks, snap, setSnap, onDropItem, onDropFiles }) {
  const A = (src) => assets?.sources?.[src] || null;
  const name = (src) => src.split('/').pop().replace(/\.[^.]+$/, '').replace(/^\d\d-/, '');
  const multi = new Set(tl.clips.map((c) => srcOf(c, tl))).size > 1;
  const st = starts(tl.clips);
  const dur = totalDur(tl.clips);
  const capLanes = useMemo(() => lanes(tl.captions), [tl.captions]);
  const ovs = tl.overlays || [];
  const ovLanes = useMemo(() => lanes(ovs), [ovs]);
  const nCap = Math.max(1, ...capLanes.map((l) => l + 1));
  const nOv = Math.max(1, ...ovLanes.map((l) => l + 1));
  const width = Math.max(dur * pxs + 80, 400);
  const scroller = useRef(null);
  const rulerRef = useRef(null);
  const tick = pxs >= 120 ? 0.5 : pxs >= 60 ? 1 : pxs >= 30 ? 2 : 5;

  // Ctrl + rueda = zoom (centrado en el ratón); rueda sola = desplazar
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const wheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(); const xIn = e.clientX - r.left - LABEL_W + el.scrollLeft; const tAt = xIn / pxs;
      const next = Math.min(400, Math.max(12, pxs * (e.deltaY < 0 ? 1.15 : 0.87)));
      setPxs(next);
      requestAnimationFrame(() => { el.scrollLeft = tAt * next - (e.clientX - r.left - LABEL_W); });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [pxs, setPxs]);
  // el cursor no se sale de la vista mientras reproduce
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const x = T * pxs;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - LABEL_W - 40) el.scrollLeft = Math.max(0, x - 80);
  }, [Math.floor(T * pxs / 200)]);

  const seekEv = (e) => {
    const r = rulerRef.current.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(dur, (e.clientX - r.left) / pxs)));
  };
  const scrub = (e) => {
    seekEv(e);
    const mv = (ev) => seekEv(ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const isSel = (type, i) => sel && sel.type === type && sel.i === i;
  const rowProps = { width, pxs, onDropItem, onEmpty: (e) => { setSel(null); scrub(e); } };
  const block = (base, selected) => `absolute overflow-hidden rounded-md border text-[11px] leading-tight transition-colors ${selected ? 'border-white ring-1 ring-white/70' : 'border-transparent'} ${base}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-[#101015]">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <div style={{ width: width + LABEL_W }} className="relative select-none">
          {/* regla */}
          <div className="sticky top-0 z-30 flex h-7 border-b border-white/[.08] bg-[#141419]">
            <div className="sticky left-0 z-20 flex shrink-0 items-center justify-between border-r border-white/[.06] bg-[#141419] px-2.5 text-[11px] tabular-nums text-zinc-300" style={{ width: LABEL_W }}>
              {fmtT(T)}
              <button title="Imán: ajustar a cortes, cursor y bordes" onClick={() => setSnap(!snap)} className={snap ? 'text-accent' : 'text-muted'}><Magnet size={13} /></button>
            </div>
            <div ref={rulerRef} className="relative h-full cursor-text" style={{ width }} onPointerDown={scrub}>
              {Array.from({ length: Math.ceil(dur / tick) + 2 }, (_, i) => i * tick).map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-white/10" style={{ left: t * pxs }}>
                  {Math.abs(t - Math.round(t)) < 1e-6 && <span className="pl-1 text-[10px] text-muted">{t}s</span>}
                </div>
              ))}
            </div>
          </div>

          <Row icon={Sticker} label="Stickers" h={nOv * 26 + 8} onDropKind {...rowProps}>
            {ovs.map((o, i) => (
              <div key={i} onPointerDown={(e) => { setSel({ type: 'ov', i }); beginDrag(e, { type: 'ov', i, mode: 'move' }); }}
                className={block('cursor-grab bg-fuchsia-500/30 hover:bg-fuchsia-500/40', isSel('ov', i))}
                style={{ left: o.start * pxs, width: Math.max(8, (o.end - o.start) * pxs - 1), top: 4 + ovLanes[i] * 26, height: 22 }}>
                <span className="block truncate px-1.5 leading-[20px]">{o.type === 'emoji' ? o.text : o.type === 'title' ? o.text : { arrow: '↓ Flecha', cart: '🛒 Carrito', circle: '◯ Círculo' }[o.type]}</span>
                <Handle beginDrag={beginDrag} side="l" d={{ type: 'ov', i }} /><Handle beginDrag={beginDrag} side="r" d={{ type: 'ov', i }} />
              </div>
            ))}
          </Row>

          <Row icon={Type} label="Textos" h={nCap * 24 + 8} onDropKind {...rowProps}>
            {tl.captions.map((c, i) => (
              <div key={i} title={c.text} onPointerDown={(e) => { setSel({ type: 'cap', i }); beginDrag(e, { type: 'cap', i, mode: 'move' }); }}
                className={block('cursor-grab bg-sky-500/30 hover:bg-sky-500/40', isSel('cap', i))}
                style={{ left: c.start * pxs, width: Math.max(8, (c.end - c.start) * pxs - 1), top: 4 + capLanes[i] * 24, height: 21, color: c.color === '#FFFFFF' ? '#fff' : c.color }}>
                <span className="block truncate px-1.5 leading-[20px]">{c.back && <span className="opacity-70">{cutoutValid ? '◐ ' : '◑ '}</span>}{c.text}</span>
                <Handle beginDrag={beginDrag} side="l" d={{ type: 'cap', i }} /><Handle beginDrag={beginDrag} side="r" d={{ type: 'cap', i }} />
              </div>
            ))}
          </Row>

          <Row icon={Sparkles} label="Efectos" h={32} onDropKind {...rowProps}>
            {(tl.effects || []).map((e, i) => (
              <div key={i} onPointerDown={(ev) => { setSel({ type: 'fx', i }); beginDrag(ev, { type: 'fx', i, mode: 'move' }); }}
                className={block('cursor-grab bg-violet-500/35 hover:bg-violet-500/45', isSel('fx', i))}
                style={{ left: e.t * pxs, width: Math.max(16, (e.dur || 0.3) * pxs), top: 5, height: 22 }}>
                <span className="block truncate px-1.5 leading-[20px]">{{ shake: 'Temblor', zoom: 'Zoom', flash: 'Flash', blur: 'Blur' }[e.type]}</span>
              </div>
            ))}
          </Row>

          <Row icon={Layers} label="B-roll" h={tl.broll?.length ? 46 : 30} onDropKind {...rowProps}
            onDropItem={(d, at) => onDropItem(d.kind === 'video' ? { ...d, kind: 'broll' } : d, at)} onDropFiles={(f, at) => onDropFiles(f, at, true)}>
            {!tl.broll?.length && <span className="pointer-events-none absolute left-2 top-1.5 text-[10.5px] text-zinc-600">Arrastra aquí un vídeo para ponerlo encima de la voz</span>}
            {(tl.broll || []).map((b, i) => {
              const w = Math.max(8, (b.end - b.start) * pxs - 1);
              return (
                <div key={i} onPointerDown={(e) => { setSel({ type: 'broll', i }); beginDrag(e, { type: 'broll', i, mode: 'move' }); }}
                  className={block('cursor-grab bg-orange-900/60', isSel('broll', i))} style={{ left: b.start * pxs, width: w, top: 4, height: 38 }}>
                  <FilmStrip img={stripImgs[b.src]} assets={A(b.src)} clip={{ in: b.in || 0, out: (b.in || 0) + b.end - b.start }} width={w} height={38} />
                  <span className="absolute inset-x-0 top-0 truncate bg-gradient-to-b from-black/70 to-transparent px-1.5 text-[10px] text-white">{name(b.src)}</span>
                  <Handle beginDrag={beginDrag} side="l" d={{ type: 'broll', i }} /><Handle beginDrag={beginDrag} side="r" d={{ type: 'broll', i }} />
                </div>
              );
            })}
          </Row>

          <Row icon={Clapperboard} label="Vídeo" h={62} onDropKind {...rowProps} onDropFiles={(f, at) => onDropFiles(f, at, false)}>
            {tl.clips.map((c, i) => {
              const w = Math.max(6, cdur(c) * pxs - 2);
              const tr = c.transition || (c.punch ? 'punch' : 'none');
              return (
                <div key={i} onPointerDown={() => { setSel({ type: 'clip', i }); onSeek(st[i] + 0.001); }}
                  className={block('cursor-pointer bg-[#2a1a22]', isSel('clip', i))} style={{ left: st[i] * pxs, width: w, top: 4, height: 54 }}>
                  <FilmStrip img={stripImgs[srcOf(c, tl)]} assets={A(srcOf(c, tl))} clip={c} width={w} height={54} />
                  <div className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/70 to-transparent px-1.5 py-0.5 text-[10px] text-white">
                    <span className="shrink-0">{i + 1}</span>
                    {multi && <span className="truncate opacity-80">{name(srcOf(c, tl))}</span>}
                    {c.mute && <span className="rounded bg-black/60 px-1">mudo</span>}
                    {(c.speed || 1) !== 1 && <span className="rounded bg-black/60 px-1">{c.speed}x</span>}
                    {(c.zoom || 1) > 1.001 && <span className="rounded bg-black/60 px-1">{(c.zoom).toFixed(2)}x</span>}
                    {c.pushin && <span className="rounded bg-black/60 px-1">push</span>}
                    <span className="ml-auto opacity-80">{cdur(c).toFixed(1)}s</span>
                  </div>
                  {i > 0 && tr !== 'none' && <span className="absolute bottom-1 left-1 rounded bg-accent px-1 text-[9px] font-semibold text-white">{tr}</span>}
                  <Handle beginDrag={beginDrag} side="l" d={{ type: 'clip', i }} /><Handle beginDrag={beginDrag} side="r" d={{ type: 'clip', i }} />
                </div>
              );
            })}
          </Row>

          <Row icon={Mic} label="Voz" h={38} {...rowProps}>
            {tl.clips.map((c, i) => {
              const w = Math.max(6, cdur(c) * pxs - 2);
              return (
                <div key={i} className="absolute top-1 h-[30px] overflow-hidden rounded bg-teal-500/15" style={{ left: st[i] * pxs, width: w }}>
                  {!c.mute && <Wave peaks={A(srcOf(c, tl))?.voice} a={c.in} b={c.out} width={w} height={30} color="rgba(45,212,191,.85)" />}
                </div>
              );
            })}
          </Row>

          <Row icon={Music} label="Música" h={38} onDropKind {...rowProps}>
            {tl.music && (
              <div onPointerDown={(e) => { setSel({ type: 'music', i: 0 }); beginDrag(e, { type: 'music', i: 0, mode: 'move' }); }}
                className={block('cursor-grab bg-emerald-500/20', isSel('music', 0))}
                style={{ left: (tl.music.start || 0) * pxs, width: Math.max(10, (dur - (tl.music.start || 0)) * pxs), top: 4, height: 30 }}>
                <Wave peaks={musicPeaks} a={tl.music.offset || 0} b={(tl.music.offset || 0) + dur - (tl.music.start || 0)}
                  width={Math.max(10, (dur - (tl.music.start || 0)) * pxs)} height={30} color="rgba(52,211,153,.75)" />
                <span className="relative block truncate px-1.5 text-[10px] leading-[30px] text-white">{tl.music.file.split('/').pop()} · {tl.music.gain_db} dB</span>
              </div>
            )}
          </Row>

          <Row icon={Volume2} label="Sonidos" h={32} onDropKind {...rowProps}>
            {tl.sfx.map((s, i) => (
              <div key={i} title={`${s.file.split('/').pop()} · ${s.gain_db} dB`}
                onPointerDown={(e) => { setSel({ type: 'sfx', i }); beginDrag(e, { type: 'sfx', i, mode: 'move' }); }}
                className={block('cursor-grab bg-amber-500/35 hover:bg-amber-500/45', isSel('sfx', i))}
                style={{ left: s.t * pxs, width: Math.max(22, 0.5 * pxs), top: 5, height: 22 }}>
                <span className="block truncate px-1 leading-[20px]">{s.file.split('/').pop().replace(/\.[^.]+$/, '')}</span>
              </div>
            ))}
          </Row>

          {/* cursor de reproducción */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-40 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,.6)]" style={{ left: LABEL_W + T * pxs }}>
            <div className="-ml-[6px] h-3 w-[13px] rounded-b-sm bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
