import { Scissors, Trash2, Copy, Play, AlertTriangle, Clapperboard, Type, Sticker, Sparkles, Volume2, Music, SlidersHorizontal, Layers } from 'lucide-react';
import { YEL, r2, starts, cdur, shiftFrom, shiftWithin, srcOf, GRADES, FONTS, ANIMS, TRANSITIONS, EFFECTS, EMOJIS } from './model.js';

const FITS = [{ v: 'fill', l: 'Llenar 9:16' }, { v: 'blur', l: 'Entero + fondo borroso' }, { v: 'fit', l: 'Entero + negro' }];
const vname = (src) => src.split('/').pop().replace(/^\d\d-/, '');

const Sec = ({ title, children }) => (
  <section className="border-b border-white/[.06] px-4 py-3.5">
    {title && <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h4>}
    <div className="flex flex-col gap-3">{children}</div>
  </section>
);
const Field = ({ label, children }) => (<label className="block"><span className="mb-1 block text-[11px] text-muted">{label}</span>{children}</label>);
const Num = ({ value, onChange, step = 0.01, min, max, suffix }) => (
  <div className="flex items-center rounded-lg border border-line bg-ink focus-within:border-accent/60">
    <input className="w-full bg-transparent px-2.5 py-1.5 text-sm outline-none" type="number" step={step} min={min} max={max} value={value}
      onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
    {suffix && <span className="pr-2.5 text-xs text-muted">{suffix}</span>}
  </div>
);
function Slider({ value, onChange, min, max, step, fmt }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="range" className="h-1 flex-1 accent-[#fe2c55]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-14 text-right text-xs tabular-nums text-zinc-300">{fmt ? fmt(value) : value}</span>
    </div>
  );
}
const Chips = ({ items, value, onPick }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((it) => (
      <button key={String(it.v)} onClick={() => onPick(it.v)}
        className={`rounded-md border px-2.5 py-1 text-xs transition ${value === it.v ? 'border-accent/70 bg-accent/15 text-white' : 'border-line bg-card text-zinc-300 hover:border-white/20'}`}>{it.l}</button>
    ))}
  </div>
);
const Toggle = ({ on, onChange, label }) => (
  <button onClick={() => onChange(!on)} className="flex items-center justify-between gap-2 text-sm text-zinc-200">
    {label}
    <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-accent' : 'bg-white/15'}`}>
      <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  </button>
);
const Colors = ({ value, onChange, list = ['#FFFFFF', YEL, '#FE2C55', '#25F4EE', '#22C55E', '#0B0B0F'] }) => (
  <div className="flex items-center gap-1.5">
    {list.map((c) => (
      <button key={c} onClick={() => onChange(c)} className={`size-6 rounded-full border-2 ${value?.toUpperCase() === c.toUpperCase() ? 'border-white' : 'border-white/15'}`} style={{ background: c }} />
    ))}
    <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-7 cursor-pointer rounded bg-transparent" />
  </div>
);
const Head = ({ icon: Icon, title, children }) => (
  <div className="flex items-center gap-2 border-b border-white/[.06] px-4 py-3">
    <Icon size={15} className="text-accent" /><h3 className="text-sm font-semibold">{title}</h3>
    <div className="ml-auto flex gap-1">{children}</div>
  </div>
);
const IconBtn = ({ title, onClick, children, danger }) => (
  <button title={title} onClick={onClick} className={`grid size-7 place-items-center rounded-md hover:bg-white/10 ${danger ? 'text-red-300' : 'text-zinc-300'}`}>{children}</button>
);

export default function Inspector({ tl, sel, edit, T, srcDur, sounds, songs, cutoutValid, split, remove, duplicate, playSound }) {
  if (!sel) {
    const p = tl.progress || {};
    return (
      <>
        <Head icon={SlidersHorizontal} title="Proyecto" />
        <Sec title="Imagen">
          <Field label="Color"><Chips items={GRADES} value={tl.grade || 'none'} onPick={(v) => edit((t) => { t.grade = v; })} /></Field>
          <Toggle label="Mejorar calidad (vídeo de poca resolución)" on={!!tl.enhance} onChange={(v) => edit((t) => { t.enhance = v; })} />
        </Sec>
        <Sec title="Voz">
          <Field label="Volumen"><Slider min={-12} max={6} step={0.5} value={tl.voice?.gain_db || 0} fmt={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={(v) => edit((t) => { t.voice = { ...(t.voice || {}), gain_db: v }; })} /></Field>
          <Toggle label="Limpiar graves (filtro 80 Hz)" on={tl.voice?.clean !== false} onChange={(v) => edit((t) => { t.voice = { ...(t.voice || {}), clean: v }; })} />
        </Sec>
        <Sec title="Barra de progreso">
          <Toggle label="Mostrar" on={!!p.enabled} onChange={(v) => edit((t) => { t.progress = { pos: 'top', color: YEL, height: 8, ...(t.progress || {}), enabled: v }; })} />
          {p.enabled && (
            <>
              <Chips items={[{ v: 'top', l: 'Arriba' }, { v: 'bottom', l: 'Abajo' }]} value={p.pos || 'top'} onPick={(v) => edit((t) => { t.progress.pos = v; })} />
              <Colors value={p.color} onChange={(v) => edit((t) => { t.progress.color = v; })} />
            </>
          )}
        </Sec>
        <Sec>
          <p className="text-xs leading-relaxed text-muted">
            Selecciona un bloque o arrastra cosas desde la biblioteca. Los textos y stickers se mueven arrastrándolos en el visor.<br /><br />
            <b className="text-zinc-300">Espacio</b> reproducir · <b className="text-zinc-300">S</b> cortar · <b className="text-zinc-300">Supr</b> borrar ·
            <b className="text-zinc-300"> Ctrl+D</b> duplicar · <b className="text-zinc-300">Ctrl+Z/Y</b> deshacer/rehacer · <b className="text-zinc-300">← →</b> fotograma ·
            <b className="text-zinc-300"> Ctrl+rueda</b> zoom
          </p>
          {tl.note && <p className="text-xs text-amber-200">{tl.note}</p>}
        </Sec>
      </>
    );
  }
  const { type, i } = sel;

  if (type === 'clip') {
    const c = tl.clips[i];
    if (!c) return null;
    const S = starts(tl.clips)[i];
    const sourceDur = srcDur(srcOf(c, tl));
    const setIn = (v) => edit((t) => {
      const cl = t.clips[i]; const n = r2(Math.min(Math.max(0, v), cl.out - 0.1)); const sp = cl.speed || 1;
      const E = S + cdur(cl); const d = (n - cl.in) / sp;
      shiftWithin(t, S, E, -d); shiftFrom(t, E, -d); cl.in = n;
    });
    const setOut = (v) => edit((t) => {
      const cl = t.clips[i]; const o = r2(Math.max(Math.min(v, sourceDur || v), cl.in + 0.1));
      const E = S + cdur(cl); shiftFrom(t, E, (o - cl.out) / (cl.speed || 1)); cl.out = o;
    });
    const setSpeed = (v) => edit((t) => {
      const cl = t.clips[i]; const oldD = cdur(cl); const E = S + oldD; const ratio = (cl.speed || 1) / v;
      // lo que hay dentro del plano se estira/encoge con él; lo de después se desplaza
      for (const x of t.captions) if (x.start >= S && x.start < E) { x.start = r2(S + (x.start - S) * ratio); x.end = r2(S + (x.end - S) * ratio); }
      for (const x of t.sfx) if (x.t >= S && x.t < E) x.t = r2(S + (x.t - S) * ratio);
      cl.speed = v; shiftFrom(t, E, cdur(cl) - oldD);
    });
    return (
      <>
        <Head icon={Clapperboard} title={`Plano ${i + 1}`}>
          <IconBtn title="Cortar en el cursor (S)" onClick={split}><Scissors size={14} /></IconBtn>
          <IconBtn title="Borrar plano" onClick={remove} danger><Trash2 size={14} /></IconBtn>
        </Head>
        <Sec title="Recorte">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Entrada"><Num value={c.in} onChange={setIn} suffix="s" /></Field>
            <Field label="Salida"><Num value={c.out} onChange={setOut} suffix="s" /></Field>
          </div>
          <p className="text-[11px] text-muted">Duración en el vídeo: {cdur(c).toFixed(2)} s · también puedes arrastrar los bordes del plano.</p>
          <p className="truncate text-[11px] text-muted" title={srcOf(c, tl)}>Vídeo: <span className="text-zinc-300">{vname(srcOf(c, tl))}</span>{sourceDur < 9e8 ? ` · ${sourceDur.toFixed(1)} s` : ''}</p>
        </Sec>
        <Sec title="Sonido del plano">
          <Toggle label="Silenciar este plano" on={!!c.mute} onChange={(v) => edit((t) => { t.clips[i].mute = v; })} />
          {!c.mute && <Field label="Volumen del plano"><Slider min={-18} max={12} step={0.5} value={c.gain_db || 0} fmt={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={(v) => edit((t) => { t.clips[i].gain_db = v; })} /></Field>}
        </Sec>
        <Sec title="Velocidad">
          <Chips items={[0.5, 0.75, 1, 1.1, 1.25, 1.5, 2].map((v) => ({ v, l: `${v}x` }))} value={c.speed || 1} onPick={setSpeed} />
          {(c.speed || 1) !== 1 && tl.cutout && <p className="text-[11px] text-amber-200">Con la velocidad cambiada, las palabras «detrás de la cabeza» van delante.</p>}
        </Sec>
        <Sec title="Encuadre">
          <Field label="Ajuste"><Chips items={FITS} value={c.fit || 'fill'} onPick={(v) => edit((t) => { t.clips[i].fit = v; })} /></Field>
          <Field label="Zoom"><Slider min={1} max={1.8} step={0.01} value={c.zoom || 1} fmt={(v) => `${v.toFixed(2)}x`} onChange={(v) => edit((t) => { t.clips[i].zoom = v; })} /></Field>
          <Field label="Horizontal"><Slider min={0} max={1} step={0.01} value={c.cx ?? 0.5} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => edit((t) => { t.clips[i].cx = v; })} /></Field>
          <Field label="Vertical"><Slider min={0} max={1} step={0.01} value={c.cy ?? 0.5} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => edit((t) => { t.clips[i].cy = v; })} /></Field>
          <Toggle label="Zoom lento (push-in)" on={!!c.pushin} onChange={(v) => edit((t) => { t.clips[i].pushin = v; })} />
          {c.pushin && <Field label="Intensidad"><Slider min={0.02} max={0.15} step={0.01} value={c.pushin_amount ?? 0.06} fmt={(v) => `+${Math.round(v * 100)}%`} onChange={(v) => edit((t) => { t.clips[i].pushin_amount = v; })} /></Field>}
        </Sec>
        {i > 0 && (
          <Sec title="Transición de entrada">
            <Chips items={TRANSITIONS} value={c.transition || (c.punch ? 'punch' : 'none')} onPick={(v) => edit((t) => { t.clips[i].transition = v; t.clips[i].punch = v !== 'none'; })} />
          </Sec>
        )}
        {!cutoutValid && tl.cutout && <Sec><p className="flex gap-2 text-[11px] text-amber-200"><AlertTriangle size={14} className="shrink-0" /> Los cortes han cambiado: las palabras «detrás de la cabeza» irán delante en el render.</p></Sec>}
      </>
    );
  }

  if (type === 'broll') {
    const b = (tl.broll || [])[i];
    if (!b) return null;
    const set = (k, v) => edit((t) => { t.broll[i][k] = v; });
    const max = srcDur(b.src);
    return (
      <>
        <Head icon={Layers} title="B-roll">
          <IconBtn title="Duplicar en el cursor (Ctrl+D)" onClick={duplicate}><Copy size={14} /></IconBtn>
          <IconBtn title="Borrar (Supr)" onClick={remove} danger><Trash2 size={14} /></IconBtn>
        </Head>
        <Sec>
          <p className="truncate text-[11px] text-muted" title={b.src}>Vídeo: <span className="text-zinc-300">{vname(b.src)}</span> · se ve encima y la voz sigue debajo</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Aparece"><Num value={b.start} onChange={(v) => set('start', r2(Math.min(Math.max(0, v), b.end - 0.2)))} suffix="s" /></Field>
            <Field label="Desaparece"><Num value={b.end} onChange={(v) => set('end', r2(Math.min(Math.max(v, b.start + 0.2), b.start + max - (b.in || 0))))} suffix="s" /></Field>
          </div>
          <Field label="Desde el segundo del vídeo"><Num value={b.in || 0} onChange={(v) => set('in', r2(Math.min(Math.max(0, v), Math.max(0, max - (b.end - b.start)))))} suffix="s" /></Field>
        </Sec>
        <Sec title="Encuadre">
          <Field label="Ajuste"><Chips items={FITS} value={b.fit || 'fill'} onPick={(v) => set('fit', v)} /></Field>
          <Field label="Zoom"><Slider min={1} max={1.8} step={0.01} value={b.zoom || 1} fmt={(v) => `${v.toFixed(2)}x`} onChange={(v) => set('zoom', v)} /></Field>
          {(b.zoom || 1) > 1 && <>
            <Field label="Horizontal"><Slider min={0} max={1} step={0.01} value={b.cx ?? 0.5} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('cx', v)} /></Field>
            <Field label="Vertical"><Slider min={0} max={1} step={0.01} value={b.cy ?? 0.5} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('cy', v)} /></Field>
          </>}
        </Sec>
      </>
    );
  }

  if (type === 'cap') {
    const c = tl.captions[i];
    const set = (k, v) => edit((t) => { t.captions[i][k] = v; });
    return (
      <>
        <Head icon={Type} title="Texto">
          <IconBtn title="Duplicar en el cursor (Ctrl+D)" onClick={duplicate}><Copy size={14} /></IconBtn>
          <IconBtn title="Borrar (Supr)" onClick={remove} danger><Trash2 size={14} /></IconBtn>
        </Head>
        <Sec>
          <textarea className="field h-16 resize-none text-sm" value={c.text} onChange={(e) => edit((t) => { t.captions[i].text = e.target.value; }, 'text')} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Aparece"><Num value={c.start} onChange={(v) => set('start', r2(Math.min(v, c.end - 0.05)))} suffix="s" /></Field>
            <Field label="Desaparece"><Num value={c.end} onChange={(v) => set('end', r2(Math.max(v, c.start + 0.05)))} suffix="s" /></Field>
          </div>
        </Sec>
        <Sec title="Estilo">
          <Field label="Fuente">
            <select className="field py-1.5 text-sm" value={c.font || 'Inter Tight'} onChange={(e) => set('font', e.target.value)}>
              {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
          </Field>
          <Field label="Tamaño"><Slider min={40} max={320} step={2} value={c.size || 94} fmt={(v) => `${v}px`} onChange={(v) => set('size', v)} /></Field>
          <Field label="Color"><Colors value={c.color} onChange={(v) => set('color', v)} /></Field>
          <Toggle label="Borde y sombra" on={c.stroke !== false} onChange={(v) => set('stroke', v)} />
          <Toggle label="Caja de fondo" on={!!c.box} onChange={(v) => set('box', v)} />
        </Sec>
        <Sec title="Animación de entrada"><Chips items={ANIMS.filter((a) => a.v !== 'bounce')} value={c.anim || 'pop'} onPick={(v) => set('anim', v)} /></Sec>
        <Sec title="Posición">
          <Field label="Altura"><Slider min={225} max={1460} step={5} value={c.top ?? 1005} fmt={(v) => `${v}px`} onChange={(v) => set('top', v)} /></Field>
          <Field label="Horizontal"><Slider min={-400} max={400} step={5} value={c.x || 0} fmt={(v) => `${v}px`} onChange={(v) => set('x', v)} /></Field>
          <label className={`flex items-center gap-2 text-sm ${tl.cutout ? '' : 'opacity-40'}`}>
            <input type="checkbox" disabled={!tl.cutout} checked={!!c.back} onChange={(e) => set('back', e.target.checked)} /> Detrás de la cabeza
            {c.back && !cutoutValid && <AlertTriangle size={13} className="text-amber-300" />}
          </label>
        </Sec>
      </>
    );
  }

  if (type === 'ov') {
    const o = (tl.overlays || [])[i];
    if (!o) return null;
    const set = (k, v) => edit((t) => { t.overlays[i][k] = v; });
    return (
      <>
        <Head icon={Sticker} title={{ title: 'Título', emoji: 'Emoji', arrow: 'Flecha', cart: 'Carrito', circle: 'Círculo' }[o.type] || 'Sticker'}>
          <IconBtn title="Duplicar en el cursor (Ctrl+D)" onClick={duplicate}><Copy size={14} /></IconBtn>
          <IconBtn title="Borrar (Supr)" onClick={remove} danger><Trash2 size={14} /></IconBtn>
        </Head>
        <Sec>
          {o.type === 'title' && <input className="field text-sm" value={o.text} onChange={(e) => edit((t) => { t.overlays[i].text = e.target.value; }, 'text')} />}
          {o.type === 'emoji' && (
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((em) => <button key={em} onClick={() => set('text', em)} className={`grid size-8 place-items-center rounded-md text-lg ${o.text === em ? 'bg-accent/25' : 'hover:bg-white/10'}`}>{em}</button>)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Aparece"><Num value={o.start} onChange={(v) => set('start', r2(Math.min(v, o.end - 0.05)))} suffix="s" /></Field>
            <Field label="Desaparece"><Num value={o.end} onChange={(v) => set('end', r2(Math.max(v, o.start + 0.05)))} suffix="s" /></Field>
          </div>
        </Sec>
        <Sec title="Estilo">
          <Field label="Tamaño"><Slider min={30} max={400} step={2} value={o.size || 120} fmt={(v) => `${v}px`} onChange={(v) => set('size', v)} /></Field>
          {o.type !== 'emoji' && <Field label={o.type === 'title' ? 'Color del texto' : 'Color'}><Colors value={o.color} onChange={(v) => set('color', v)} /></Field>}
          {o.type === 'title' && <Field label="Fondo"><Colors value={o.bg} onChange={(v) => set('bg', v)} /></Field>}
          <Field label="Giro"><Slider min={-45} max={45} step={1} value={o.rotate || 0} fmt={(v) => `${v}°`} onChange={(v) => set('rotate', v)} /></Field>
          <Field label="Animación"><Chips items={ANIMS} value={o.anim || 'bounce'} onPick={(v) => set('anim', v)} /></Field>
          <Toggle label="Rebotar en bucle" on={!!o.loop} onChange={(v) => set('loop', v)} />
        </Sec>
        <Sec title="Posición">
          <Field label="Horizontal"><Slider min={40} max={1040} step={5} value={o.x ?? 540} fmt={(v) => `${v}px`} onChange={(v) => set('x', v)} /></Field>
          <Field label="Vertical"><Slider min={60} max={1860} step={5} value={o.y ?? 960} fmt={(v) => `${v}px`} onChange={(v) => set('y', v)} /></Field>
        </Sec>
      </>
    );
  }

  if (type === 'fx') {
    const e = (tl.effects || [])[i];
    if (!e) return null;
    const set = (k, v) => edit((t) => { t.effects[i][k] = v; });
    return (
      <>
        <Head icon={Sparkles} title="Efecto">
          <IconBtn title="Borrar (Supr)" onClick={remove} danger><Trash2 size={14} /></IconBtn>
        </Head>
        <Sec>
          <Field label="Tipo"><Chips items={EFFECTS.map((x) => ({ v: x.v, l: x.l }))} value={e.type} onPick={(v) => set('type', v)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Momento"><Num value={e.t} onChange={(v) => set('t', r2(Math.max(0, v)))} suffix="s" /></Field>
            <Field label="Duración"><Num value={e.dur ?? 0.3} step={0.05} onChange={(v) => set('dur', Math.max(0.05, v))} suffix="s" /></Field>
          </div>
          {e.type === 'shake' && <Field label="Intensidad"><Slider min={4} max={40} step={1} value={e.amount ?? 14} fmt={(v) => `${v}px`} onChange={(v) => set('amount', v)} /></Field>}
          {e.type === 'zoom' && <Field label="Intensidad"><Slider min={0.04} max={0.35} step={0.01} value={e.amount ?? 0.12} fmt={(v) => `+${Math.round(v * 100)}%`} onChange={(v) => set('amount', v)} /></Field>}
          {e.type === 'flash' && <Field label="Intensidad"><Slider min={0.2} max={1} step={0.05} value={e.amount ?? 0.8} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('amount', v)} /></Field>}
        </Sec>
      </>
    );
  }

  if (type === 'sfx') {
    const s = tl.sfx[i];
    return (
      <>
        <Head icon={Volume2} title="Sonido">
          <IconBtn title="Escuchar" onClick={() => playSound(s)}><Play size={14} /></IconBtn>
          <IconBtn title="Duplicar en el cursor (Ctrl+D)" onClick={duplicate}><Copy size={14} /></IconBtn>
          <IconBtn title="Borrar (Supr)" onClick={remove} danger><Trash2 size={14} /></IconBtn>
        </Head>
        <Sec>
          <Field label="Archivo">
            <select className="field py-1.5 text-sm" value={s.file} onChange={(e) => edit((t) => { t.sfx[i].file = e.target.value; })}>
              {!sounds.some((x) => x.path === s.file) && <option value={s.file}>{s.file.split('/').pop()}</option>}
              {sounds.map((x) => <option key={x.path} value={x.path}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Momento"><Num value={s.t} onChange={(v) => edit((t) => { t.sfx[i].t = r2(Math.max(0, v)); })} suffix="s" /></Field>
          <Field label="Volumen"><Slider min={-36} max={0} step={0.5} value={s.gain_db} fmt={(v) => `${v} dB`} onChange={(v) => edit((t) => { t.sfx[i].gain_db = v; })} /></Field>
        </Sec>
      </>
    );
  }

  if (type === 'music' && tl.music) {
    const m = tl.music;
    const set = (k, v) => edit((t) => { t.music[k] = v; });
    return (
      <>
        <Head icon={Music} title="Música">
          <IconBtn title="Quitar música" onClick={remove} danger><Trash2 size={14} /></IconBtn>
        </Head>
        <Sec>
          <Field label="Canción">
            <select className="field py-1.5 text-sm" value={m.file} onChange={(e) => set('file', e.target.value)}>
              {!songs.some((x) => x.path === m.file) && <option value={m.file}>{m.file.split('/').pop()}</option>}
              {songs.map((x) => <option key={x.path} value={x.path}>{x.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Empieza en el vídeo"><Num value={m.start || 0} onChange={(v) => set('start', r2(Math.max(0, v)))} suffix="s" /></Field>
            <Field label="Desde la canción"><Num value={m.offset || 0} step={0.5} onChange={(v) => set('offset', r2(Math.max(0, v)))} suffix="s" /></Field>
          </div>
          <Field label="Volumen"><Slider min={-36} max={-4} step={0.5} value={m.gain_db} fmt={(v) => `${v} dB`} onChange={(v) => set('gain_db', v)} /></Field>
          <Toggle label="Bajar cuando se habla (ducking)" on={m.duck !== false} onChange={(v) => set('duck', v)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Entrada suave"><Num value={m.fade_in ?? 0.5} step={0.1} onChange={(v) => set('fade_in', Math.max(0, v))} suffix="s" /></Field>
            <Field label="Salida suave"><Num value={m.fade_out ?? 1} step={0.1} onChange={(v) => set('fade_out', Math.max(0, v))} suffix="s" /></Field>
          </div>
        </Sec>
      </>
    );
  }
  return null;
}
