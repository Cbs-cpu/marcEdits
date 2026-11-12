// Modelo de la línea de tiempo (mismo formato que engine/timeline.py → engine/TIMELINE.md)

export const YEL = '#FAE67A';
export const r2 = (x) => Math.round(x * 100) / 100;
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const lin = (db) => Math.min(1, Math.pow(10, (db || 0) / 20));
export const cdur = (c) => (c.out - c.in) / (c.speed || 1);
export const starts = (clips) => { let t = 0; return clips.map((c) => { const s = t; t += cdur(c); return s; }); };
export const totalDur = (clips) => clips.reduce((a, c) => a + cdur(c), 0);
export const clipAt = (t, clips) => { const s = starts(clips); let k = 0; for (let i = 0; i < clips.length; i++) if (t >= s[i] - 1e-6) k = i; return k; };
export const fmtT = (t) => { const m = Math.floor(t / 60); const s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
export const easeOut = (p) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

// misma huella que sig() de timeline.py: el recorte de la persona solo vale mientras no cambie
export const sig = (clips) => clips.map((c) => {
  const base = [c.in, c.out, c.zoom ?? 1, c.cx ?? 0.5, c.cy ?? 0.5].map((x) => Number(x).toFixed(3)).join(',');
  const sp = c.speed || 1;
  const b = Math.abs(sp - 1) < 1e-6 ? base : `${base},x${sp.toFixed(3)}`;
  return c.src ? `${b},@${c.src}` : b;
}).join('|');
// vídeo del que sale cada plano (varios vídeos en un mismo montaje)
export const srcOf = (c, tl) => c?.src || tl.source;

// Desplaza todo lo que está a partir de t0 (para que siga en su sitio al alargar/acortar/borrar un plano)
export function shiftFrom(tl, t0, delta) {
  for (const c of tl.captions) if (c.start >= t0 - 1e-6) { c.start = r2(c.start + delta); c.end = r2(c.end + delta); }
  for (const o of tl.overlays || []) if (o.start >= t0 - 1e-6) { o.start = r2(o.start + delta); o.end = r2(o.end + delta); }
  for (const s of tl.sfx) if (s.t >= t0 - 1e-6) s.t = r2(s.t + delta);
  for (const e of tl.effects || []) if (e.t >= t0 - 1e-6) e.t = r2(e.t + delta);
}
// Mueve lo que cae dentro de [a, b) (al recortar el inicio de un plano el contenido se adelanta)
export function shiftWithin(tl, a, b, delta) {
  const inR = (t) => t >= a - 1e-6 && t < b;
  for (const c of tl.captions) if (inR(c.start)) { c.start = r2(c.start + delta); c.end = r2(c.end + delta); }
  for (const o of tl.overlays || []) if (inR(o.start)) { o.start = r2(o.start + delta); o.end = r2(o.end + delta); }
  for (const s of tl.sfx) if (inR(s.t)) s.t = r2(s.t + delta);
  for (const e of tl.effects || []) if (inR(e.t)) e.t = r2(e.t + delta);
}
export function removeWithin(tl, a, b) {
  const out = (t) => !(t >= a - 1e-6 && t < b);
  tl.captions = tl.captions.filter((c) => out(c.start));
  tl.overlays = (tl.overlays || []).filter((o) => out(o.start));
  tl.sfx = tl.sfx.filter((s) => out(s.t));
  tl.effects = (tl.effects || []).filter((e) => out(e.t));
}

// Reparte bloques que se solapan en carriles
export function lanes(items) {
  const ends = [];
  return items.map((c) => {
    let l = ends.findIndex((e) => e <= c.start + 1e-6);
    if (l === -1) { l = ends.length; ends.push(0); }
    ends[l] = c.end;
    return l;
  });
}

export const GRADES = [
  { l: 'Bold', v: 'contrast(1.07) saturate(.9) brightness(.97)' },
  { l: 'Natural', v: 'none' },
  { l: 'Cálido', v: 'sepia(.18) saturate(1.05) contrast(1.02) brightness(1.03) hue-rotate(-6deg)' },
  { l: 'Frío', v: 'saturate(.9) contrast(1.06) hue-rotate(8deg) brightness(.98)' },
  { l: 'Vivo', v: 'saturate(1.25) contrast(1.08)' },
  { l: 'B/N', v: 'grayscale(1) contrast(1.15)' },
];
export const FONTS = ['Inter Tight', 'Montserrat', 'DM Serif Display', 'Instrument Serif', 'Caveat', 'Inter'];
export const ANIMS = [
  { v: 'pop', l: 'Pop' }, { v: 'fade', l: 'Fundido' }, { v: 'up', l: 'Subir' }, { v: 'type', l: 'Escribir' },
  { v: 'bounce', l: 'Rebote' }, { v: 'none', l: 'Ninguna' },
];
export const TRANSITIONS = [
  { v: 'none', l: 'Corte seco' }, { v: 'punch', l: 'Punch' }, { v: 'zoom', l: 'Zoom' },
  { v: 'flash', l: 'Flash' }, { v: 'blur', l: 'Desenfoque' }, { v: 'whip', l: 'Barrido' },
];
export const EFFECTS = [
  { v: 'shake', l: 'Temblor', dur: 0.34, amount: 14 }, { v: 'zoom', l: 'Zoom golpe', dur: 0.35, amount: 0.12 },
  { v: 'flash', l: 'Flash', dur: 0.3, amount: 0.8 }, { v: 'blur', l: 'Desenfoque', dur: 0.35, amount: 1 },
];
export const TEXT_PRESETS = [
  { l: 'Subtítulo', d: 'Blanco, borde oscuro', cap: { size: 94, color: '#FFFFFF', top: 1005, font: 'Inter Tight', stroke: true, anim: 'pop' } },
  { l: 'Palabra clave', d: 'Grande y amarilla', cap: { size: 220, color: YEL, top: 980, font: 'Inter Tight', stroke: true, anim: 'pop' } },
  { l: 'Caja negra', d: 'Texto sobre fondo', cap: { size: 72, color: '#FFFFFF', top: 1120, font: 'Inter Tight', stroke: false, box: true, anim: 'up' } },
  { l: 'Serif elegante', d: 'DM Serif', cap: { size: 150, color: '#F7F4EE', top: 980, font: 'DM Serif Display', stroke: false, anim: 'up' } },
  { l: 'Cursiva', d: 'Instrument Serif', cap: { size: 160, color: YEL, top: 980, font: 'Instrument Serif', stroke: false, anim: 'fade' } },
  { l: 'Manuscrita', d: 'Caveat', cap: { size: 120, color: YEL, top: 1000, font: 'Caveat', stroke: false, anim: 'type' } },
  { l: 'Máquina de escribir', d: 'Aparece letra a letra', cap: { size: 80, color: '#FFFFFF', top: 1040, font: 'Inter Tight', stroke: true, anim: 'type' } },
];
export const STICKERS = [
  { l: 'Título gancho', ov: { type: 'title', text: 'Título', size: 66, color: '#0b0b0f', bg: YEL, y: 300, anim: 'bounce', rotate: -2 } },
  { l: 'Flecha abajo', ov: { type: 'arrow', size: 104, color: YEL, y: 1395, anim: 'bounce', loop: true } },
  { l: 'Carrito', ov: { type: 'cart', size: 130, color: '#22C55E', y: 1300, anim: 'bounce' } },
  { l: 'Círculo', ov: { type: 'circle', size: 220, color: YEL, y: 900, anim: 'bounce' } },
];
export const EMOJIS = ['😳', '🔥', '😂', '👇', '💸', '🤯', '✅', '❌', '⏳', '🛒', '❤️', '👀', '🎁', '⭐', '💯', '🙌'];

// ---- estado visual en el instante T (la vista previa imita el render) ----
export function stageAt(tl, T) {
  const S = starts(tl.clips);
  const k = clipAt(T, tl.clips);
  const c = tl.clips[k] || {};
  const d = T - (S[k] || 0);
  let scale = 1, x = 0, y = 0, blur = 0, flash = 0, push = 1;
  const tr = c.transition || (c.punch ? 'punch' : 'none');
  if (k > 0) {
    if (tr === 'punch' && d < 0.32) scale *= 1.05 - 0.05 * easeOut(d / 0.32);
    if (tr === 'zoom' && d < 0.4) scale *= 1.18 - 0.18 * easeOut(d / 0.4);
    if (tr === 'flash' && d < 0.3) flash = Math.max(flash, 0.85 * (1 - easeOut(d / 0.3)));
    if (tr === 'blur' && d < 0.38) blur = 16 * (1 - easeOut(d / 0.38));
    if (tr === 'whip' && d < 0.28) { x = -160 * (1 - easeOut(d / 0.28)); blur = 14 * (1 - easeOut(d / 0.28)); }
  }
  if (c.pushin) push = 1 + (c.pushin_amount ?? 0.06) * Math.min(1, d / cdur(c));
  for (const e of tl.effects || []) {
    const p = (T - e.t) / (e.dur || 0.3);
    if (p < 0 || p > 1) continue;
    if (e.type === 'zoom') scale *= 1 + (e.amount ?? 0.12) * (1 - easeOut(p));
    if (e.type === 'flash') flash = Math.max(flash, (e.amount ?? 0.8) * (1 - easeOut(p)));
    if (e.type === 'blur') blur = Math.max(blur, 14 * (1 - easeOut(p)));
    if (e.type === 'shake') { const a = (e.amount ?? 14) * (1 - p); x += Math.sin(T * 160) * a; y += Math.cos(T * 120) * a * 0.6; }
  }
  return { k, scale, x, y, blur, flash, push };
}

// estilo de entrada/salida de un texto o sticker en el instante T
export function animAt(it, T, dur) {
  const a = it.start, b = Math.min(it.end, dur);
  if (T < a || T >= b) return null;
  const t = T - a;
  let opacity = 1, scale = 1, blur = 0, y = 0, clip = null;
  const kind = it.anim || 'pop';
  if (kind === 'pop') { const p = Math.min(1, t / 0.2); opacity = p; scale = 1.22 - 0.22 * easeOut(p); blur = 22 * (1 - easeOut(p)); }
  else if (kind === 'fade') opacity = Math.min(1, t / 0.25);
  else if (kind === 'up') { const p = Math.min(1, t / 0.3); opacity = p; y = 46 * (1 - easeOut(p)); }
  else if (kind === 'type') { const d = Math.max(0.2, Math.min(0.7, (b - a) * 0.5)); clip = `inset(0 ${(1 - Math.min(1, t / d)) * 100}% 0 0)`; }
  else if (kind === 'bounce') { const p = Math.min(1, t / 0.45); opacity = Math.min(1, p * 2); const c1 = 2.2, c3 = c1 + 1; scale = 0.3 + 0.7 * (1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)); }
  if (b < dur - 0.01 && T > b - 0.12) { const q = (T - (b - 0.12)) / 0.12; opacity *= 1 - q; blur = Math.max(blur, 16 * q); }
  if (it.loop && t > 0.45) y += 26 * Math.abs(Math.sin(((t - 0.45) / 0.36) * Math.PI));
  return { opacity, scale, blur, y, clip };
}
