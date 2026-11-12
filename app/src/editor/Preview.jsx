import { stageAt, animAt, totalDur } from './model.js';

const ARROW = (s, c) => (
  <svg viewBox="0 0 100 120" width={s} height={s * 1.2} style={{ filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.45))' }}>
    <path d="M50 112 L8 62 H34 V8 H66 V62 H92 Z" fill={c} stroke="#0b0b0f" strokeWidth="6" strokeLinejoin="round" />
  </svg>
);
const CART = (s, c) => (
  <svg viewBox="0 0 120 110" width={s} height={(s * 110) / 120} style={{ filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.45))' }}>
    <rect x="2" y="2" width="116" height="106" rx="26" fill={c} />
    <path d="M26 32 H38 L46 70 H86 L94 44 H42" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="50" cy="84" r="6" fill="#fff" /><circle cx="82" cy="84" r="6" fill="#fff" />
  </svg>
);
const CIRCLE = (s, c) => (
  <svg viewBox="0 0 120 120" width={s} height={s} style={{ filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.45))' }}>
    <circle cx="60" cy="60" r="52" fill="none" stroke={c} strokeWidth="9" />
  </svg>
);

function capStyle(c) {
  const font = c.font || 'Inter Tight';
  return {
    top: c.top ?? 1005, left: c.x || 0, right: -(c.x || 0), fontSize: c.size || 94, color: c.color || '#fff', fontFamily: `"${font}"`,
    fontWeight: c.weight || ({ 'Inter Tight': 900, Montserrat: 600, Caveat: 600, Inter: 600 }[font] || 400),
    fontStyle: font === 'Instrument Serif' || c.italic ? 'italic' : 'normal',
    letterSpacing: font === 'Inter Tight' ? '-.03em' : 0,
  };
}

export function Overlay({ o }) {
  if (o.type === 'arrow') return ARROW(o.size || 104, o.color || '#FAE67A');
  if (o.type === 'cart') return CART(o.size || 130, o.color || '#22C55E');
  if (o.type === 'circle') return CIRCLE(o.size || 220, o.color || '#FAE67A');
  if (o.type === 'title') {
    return (
      <span style={{ display: 'inline-block', fontFamily: '"Inter Tight"', fontWeight: 900, letterSpacing: '-.02em', fontSize: o.size || 66,
        color: o.color || '#0b0b0f', background: o.bg || '#FAE67A', padding: '.12em .42em .18em', borderRadius: '.3em', boxShadow: '0 18px 40px rgba(0,0,0,.35)' }}>
        {o.text}
      </span>
    );
  }
  return <span style={{ fontSize: o.size || 150, fontFamily: '"Segoe UI Emoji","Apple Color Emoji",sans-serif' }}>{o.text}</span>;
}

// Vista previa 9:16 que imita el render. Los textos y stickers se pueden arrastrar directamente.
export default function Preview({ tl, T, videoRef, brollRef, width, cutoutValid, sel, onPick, onDragItem, safe }) {
  const scale = width / 1080;
  const dur = totalDur(tl.clips);
  const st = stageAt(tl, T);
  const c = tl.clips[st.k] || {};
  const br = (tl.broll || []).find((b) => T >= b.start && T < b.end);
  // el vídeo de cada plano lo pone el editor (puede cambiar de archivo entre planos); aquí solo el encuadre
  const fitCss = (x) => (x?.fit === 'blur' || x?.fit === 'fit' ? 'object-contain' : 'object-cover');
  const grade = tl.grade && tl.grade !== 'none' ? tl.grade : '';
  const capEl = (x, i, back) => {
    const a = animAt(x, T, dur);
    if (!a) return null;
    const isSel = sel?.type === 'cap' && sel.i === i;
    return (
      <div key={`c${i}`} onPointerDown={(e) => { e.stopPropagation(); onPick({ type: 'cap', i }); onDragItem(e, { type: 'cap', i }, scale); }}
        className="cap-prev cursor-move" style={{ ...capStyle(x), opacity: back && cutoutValid ? a.opacity * 0.6 : a.opacity,
          transform: `translateY(${a.y}px) scale(${a.scale})`, filter: a.blur ? `blur(${a.blur}px)` : undefined, zIndex: back ? 3 : 8 }}>
        <span style={{
          display: 'inline-block', clipPath: a.clip || undefined, outline: isSel ? '6px dashed rgba(254,44,85,.9)' : undefined, outlineOffset: 10,
          ...(x.stroke === false ? { WebkitTextStroke: 0, textShadow: x.box ? 'none' : '0 6px 24px rgba(0,0,0,.45)' } : {}),
          ...(x.box ? { background: 'rgba(10,10,12,.72)', padding: '.08em .32em .14em', borderRadius: '.2em' } : {}),
        }}>{x.text}</span>
      </div>
    );
  };
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl bg-black shadow-2xl" style={{ width, height: (width * 16) / 9 }}
      onPointerDown={() => onPick(null)}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: 1080, height: 1920, transform: `scale(${scale})` }}>
        {/* stage: transiciones y efectos */}
        <div className="absolute inset-0" style={{ transform: `translate(${st.x}px,${st.y}px) scale(${st.scale})`, transformOrigin: '50% 45%', filter: st.blur ? `blur(${st.blur}px)` : undefined }}>
          <div className="absolute inset-0" style={{ transform: `scale(${st.push})`, transformOrigin: '50% 40%' }}>
            <div className="absolute inset-0 overflow-hidden">
              <video ref={videoRef} playsInline preload="auto" className={`absolute inset-0 size-full ${fitCss(c)}`}
                style={{ transform: `scale(${c.zoom || 1})`, transformOrigin: `${(c.cx ?? 0.5) * 100}% ${(c.cy ?? 0.5) * 100}%`, filter: grade || undefined,
                  background: c.fit === 'blur' ? '#1b1b22' : '#000' }} />
              <video ref={brollRef} muted playsInline preload="auto" className={`absolute inset-0 size-full ${fitCss(br)} ${br ? '' : 'invisible'}`}
                style={{ transform: `scale(${br?.zoom || 1})`, transformOrigin: `${(br?.cx ?? 0.5) * 100}% ${(br?.cy ?? 0.5) * 100}%`, filter: grade || undefined,
                  background: br?.fit === 'blur' ? '#1b1b22' : '#000' }} />
            </div>
            {tl.captions.map((x, i) => (x.back && cutoutValid && !br ? capEl(x, i, true) : null))}
          </div>
        </div>
        {tl.look === 'bold' && grade && (
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,.34) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 50%,rgba(0,0,0,.42) 100%)' }} />
        )}
        {tl.captions.map((x, i) => (x.back && cutoutValid && !br ? null : capEl(x, i, false)))}
        {(tl.overlays || []).map((o, i) => {
          const a = animAt(o, T, dur);
          if (!a) return null;
          const isSel = sel?.type === 'ov' && sel.i === i;
          return (
            <div key={`o${i}`} onPointerDown={(e) => { e.stopPropagation(); onPick({ type: 'ov', i }); onDragItem(e, { type: 'ov', i }, scale); }}
              className="absolute cursor-move" style={{ left: o.x ?? 540, top: o.y ?? 960, zIndex: 12, opacity: a.opacity,
                transform: `translate(-50%,-50%) translateY(${a.y}px) rotate(${o.rotate || 0}deg) scale(${a.scale})`,
                outline: isSel ? '6px dashed rgba(254,44,85,.9)' : undefined, outlineOffset: 8 }}>
              <Overlay o={o} />
            </div>
          );
        })}
        {st.flash > 0 && <div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: st.flash, zIndex: 20 }} />}
        {tl.progress?.enabled && (
          <div className="pointer-events-none absolute left-0" style={{ [tl.progress.pos === 'bottom' ? 'bottom' : 'top']: 0, height: tl.progress.height || 8,
            width: `${(T / dur) * 100}%`, background: tl.progress.color || '#FAE67A', zIndex: 25 }} />
        )}
        {safe && (
          <div className="pointer-events-none absolute inset-0" style={{ zIndex: 30 }}>
            <div className="absolute inset-x-0 top-0 h-[220px] bg-red-500/25" />
            <div className="absolute inset-x-0 bottom-0 top-[1470px] bg-red-500/25" />
            <div className="absolute right-0 top-[1155px] h-[315px] w-[100px] bg-red-500/25" />
          </div>
        )}
      </div>
    </div>
  );
}
