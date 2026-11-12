import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Scissors, Undo2, Redo2, Save, Clapperboard, Loader2, RotateCcw, ArrowLeft, Check, SkipBack, SkipForward,
  ZoomIn, ZoomOut, Copy, Trash2, Shield, Repeat,
} from 'lucide-react';
import { api, media, fmtDur, useLibrary } from '../lib.js';
import { Header, Empty } from '../components/ui.jsx';
import Preview from '../editor/Preview.jsx';
import Timeline from '../editor/Timeline.jsx';
import Inspector from '../editor/Inspector.jsx';
import Library from '../editor/Library.jsx';
import {
  r2, clone, lin, cdur, starts, totalDur, clipAt, fmtT, sig, shiftFrom, shiftWithin, removeWithin, srcOf,
} from '../editor/model.js';

const FRAME = 1 / 30;

function EditorMain({ id, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tl, setTl] = useState(null);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState(null);
  const [T, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [pxs, setPxs] = useState(70);
  const [snap, setSnap] = useState(true);
  const [safe, setSafe] = useState(false);
  const [sounds, setSounds] = useState([]);
  const [songs, setSongs] = useState([]);
  const [assets, setAssets] = useState(null);       // { sources: { [vídeo]: { strip, fps, dur, voice, w, h } } }
  const [stripImgs, setStripImgs] = useState({});   // vídeo → imagen de la tira de fotogramas
  const [videos, setVideos] = useState([]);         // vídeos del proyecto (para juntar más)
  const [musicPeaks, setMusicPeaks] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [notice, setNotice] = useState(null);
  const [tlH, setTlH] = useState(() => { try { return +localStorage.getItem('ed.tlH') || 360; } catch { return 300; } });
  const videoRef = useRef(null);
  const brollRef = useRef(null);
  const musicRef = useRef(null);
  const st = useRef({ k: 0, lastT: 0, raf: 0 });
  const tlRef = useRef(null); tlRef.current = tl;
  const TRef = useRef(0); TRef.current = T;
  const lastTextEdit = useRef(0);
  const clipboard = useRef(null);
  const midRef = useRef(null);
  const [pw, setPw] = useState(300);

  // ---- carga ----
  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.editorLoad(id);
      const t = d.timeline;
      t.overlays = t.overlays || []; t.effects = t.effects || []; t.broll = t.broll || [];
      setData(d); setTl(t); setPast([]); setFuture([]); setDirty(false); setSel(null); setT(0); setRendering(d.busy);
      setVideos(d.videos || [t.source]);
      api.editorAssets(id).then((a) => { setAssets(a); Object.entries(a?.sources || {}).forEach(([src, x]) => loadStrip(src, x)); });
    } catch (e) { setError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  }, [id]);
  useEffect(() => { load(); api.toolsList('sonidos').then(setSounds); api.toolsList('canciones').then(setSongs); }, [load]);
  useEffect(() => { if (tl?.music?.file) api.editorPeaks(tl.music.file).then(setMusicPeaks); else setMusicPeaks(null); }, [tl?.music?.file]);
  useEffect(() => api.onEditorRendered((d) => {
    if (d.id !== id) return;
    setRendering(false);
    setNotice(d.ok ? 'Render listo: el vídeo ya está actualizado en «Vídeos editados» (la versión anterior queda en Versiones).' : 'El render ha fallado. Mira el panel de tareas.');
  }), [id]);
  // el visor se adapta a la altura disponible
  useEffect(() => {
    const el = midRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setPw(Math.max(170, Math.floor((el.clientHeight - 48) * 9 / 16))));
    ro.observe(el); return () => ro.disconnect();
  }, [tl === null]);

  const loadStrip = (src, x) => {
    if (!x?.strip) return;
    const img = new Image(); img.onload = () => setStripImgs((m) => ({ ...m, [src]: img })); img.src = media(x.strip);
  };
  const srcInfo = (src) => assets?.sources?.[src] || null;
  const srcDur = (src) => srcInfo(src)?.dur || (src === tl?.source ? data?.sourceDur : 0) || 9e9;
  // importar más vídeos al proyecto (botón de la biblioteca o soltar archivos)
  const importVideos = async (files) => {
    const added = await api.editorImportVideos({ id, files });
    if (!added?.length) return [];
    setVideos((v) => [...new Set([...v, ...added])]);
    for (const src of added) {
      const x = await api.editorSourceAssets(src);
      setAssets((a) => ({ ...(a || {}), sources: { ...(a?.sources || {}), [src]: x } }));
      loadStrip(src, x);
    }
    setNotice(`${added.length === 1 ? 'Vídeo añadido' : `${added.length} vídeos añadidos`}: pulsa o arrástralo a la línea de tiempo.`);
    return added;
  };

  // ---- historial ----
  const edit = useCallback((fn, kind) => {
    setTl((cur) => {
      const now = Date.now();
      const group = kind === 'text' && now - lastTextEdit.current < 900;
      lastTextEdit.current = kind === 'text' ? now : 0;
      if (!group) { setPast((p) => [...p.slice(-100), cur]); setFuture([]); }
      const next = clone(cur); fn(next); return next;
    });
    setDirty(true);
  }, []);
  const undo = () => { if (!past.length) return; setFuture((f) => [tl, ...f]); setTl(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setDirty(true); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, tl]); setTl(future[0]); setFuture((f) => f.slice(1)); setDirty(true); };

  // ---- reproducción: el original salta de plano en plano a la velocidad de cada uno ----
  const syncMusic = (t, play) => {
    const a = musicRef.current, m = tlRef.current?.music;
    if (!a || !m) return;
    if (t < (m.start || 0)) { a.pause(); return; }
    const mt = t - (m.start || 0) + (m.offset || 0);
    if (Math.abs(a.currentTime - mt) > 0.25) a.currentTime = Math.max(0, mt);
    if (play && a.paused) a.play().catch(() => {});
  };
  // Pone en el visor el vídeo del plano (si es otro archivo, lo cambia y espera a que cargue)
  const setVideo = (c, time) => {
    const v = videoRef.current; if (!v) return;
    const url = media(srcOf(c, tlRef.current));
    if (v.dataset.src !== url) {
      v.dataset.src = url; st.current.loading = true; v.src = url;
      v.addEventListener('loadedmetadata', () => {
        v.currentTime = time; v.playbackRate = c.speed || 1; st.current.loading = false;
        if (st.current.playing) v.play().catch(() => {});
      }, { once: true });
    } else {
      v.playbackRate = c.speed || 1; v.currentTime = time;
      if (st.current.playing && v.paused) v.play().catch(() => {});
    }
  };
  // B-roll: vídeo encima mientras la voz sigue debajo
  const syncBroll = (t, play) => {
    const b = brollRef.current, cur = tlRef.current; if (!b || !cur) return;
    const br = (cur.broll || []).find((x) => t >= x.start && t < x.end);
    if (!br) { if (!b.paused) b.pause(); return; }
    const url = media(br.src), want = (br.in || 0) + (t - br.start);
    if (b.dataset.src !== url) {
      b.dataset.src = url; b.src = url;
      b.addEventListener('loadedmetadata', () => { b.currentTime = want; if (st.current.playing) b.play().catch(() => {}); }, { once: true });
      return;
    }
    if (Math.abs(b.currentTime - want) > 0.3) b.currentTime = want;
    if (play && b.paused) b.play().catch(() => {});
    if (!play && !b.paused) b.pause();
  };
  const seek = (t) => {
    const cur = tlRef.current; if (!cur) return;
    t = Math.max(0, Math.min(totalDur(cur.clips), t));
    const k = clipAt(t, cur.clips); const c = cur.clips[k]; const s = starts(cur.clips)[k];
    st.current.k = k; st.current.lastT = t;
    setVideo(c, c.in + (t - s) * (c.speed || 1));
    syncMusic(t, false); syncBroll(t, false);
    setT(t);
  };
  const stop = () => {
    st.current.playing = false; setPlaying(false); cancelAnimationFrame(st.current.raf);
    videoRef.current?.pause(); musicRef.current?.pause(); brollRef.current?.pause();
  };
  const tick = () => {
    const v = videoRef.current, cur = tlRef.current;
    if (!v || !cur) return;
    if (st.current.loading) { st.current.raf = requestAnimationFrame(tick); return; }   // cambiando de vídeo
    let k = st.current.k; const S = starts(cur.clips);
    if (v.currentTime >= cur.clips[k].out - 0.02) {
      if (k + 1 >= cur.clips.length) {
        if (loop) { seek(0); v.play().catch(() => {}); st.current.raf = requestAnimationFrame(tick); return; }
        stop(); setT(totalDur(cur.clips)); return;
      }
      k += 1; st.current.k = k; setVideo(cur.clips[k], cur.clips[k].in);
      if (st.current.loading) { st.current.raf = requestAnimationFrame(tick); return; }
    }
    const c = cur.clips[k];
    const t = S[k] + Math.max(0, v.currentTime - c.in) / (c.speed || 1);
    for (const s of cur.sfx) if (s.t > st.current.lastT && s.t <= t) { const a = new Audio(media(s.file)); a.volume = lin(s.gain_db); a.play().catch(() => {}); }
    st.current.lastT = t;
    v.volume = c.mute ? 0 : Math.min(1, lin((cur.voice?.gain_db || 0) + (c.gain_db || 0)));
    syncBroll(t, true);
    if (musicRef.current && cur.music) {
      const speaking = cur.captions.some((x) => !x.back && t >= x.start && t < x.end && x.size <= 120);
      musicRef.current.volume = Math.min(1, lin(cur.music.gain_db + 6) * (cur.music.duck !== false && speaking ? 0.4 : 1));
      syncMusic(t, true);
    }
    setT(t);
    st.current.raf = requestAnimationFrame(tick);
  };
  const play = () => {
    const cur = tlRef.current; if (!cur) return;
    const t = TRef.current >= totalDur(cur.clips) - 0.05 ? 0 : TRef.current;
    st.current.playing = true; setPlaying(true); seek(t);
    if (!st.current.loading) videoRef.current?.play().catch(() => {});
    syncMusic(t, true); syncBroll(t, true);
    cancelAnimationFrame(st.current.raf); st.current.raf = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);
  // primer fotograma al abrir (el visor ya no lleva src fijo: cada plano pone el suyo)
  useEffect(() => { if (tl && videoRef.current && !videoRef.current.dataset.src) seek(TRef.current); });
  const goto = (t) => { stop(); seek(t); };

  // ---- operaciones ----
  const split = () => edit((t) => {
    const T0 = TRef.current;
    if (sel?.type === 'cap' || sel?.type === 'ov') {      // corta el texto/sticker seleccionado en el cursor
      const arr = sel.type === 'cap' ? t.captions : t.overlays; const it = arr[sel.i];
      if (!it || T0 <= it.start + 0.05 || T0 >= it.end - 0.05) return;
      arr.splice(sel.i + 1, 0, { ...clone(it), start: r2(T0) }); it.end = r2(T0); return;
    }
    const S = starts(t.clips); const k = clipAt(T0, t.clips); const c = t.clips[k];
    const at = r2(c.in + (T0 - S[k]) * (c.speed || 1));
    if (at - c.in < 0.1 || c.out - at < 0.1) return;
    t.clips.splice(k, 1, { ...c, out: at }, { ...c, in: at, transition: 'none', punch: false });
  });
  const remove = () => {
    if (!sel) return;
    edit((t) => {
      if (sel.type === 'clip') {
        if (t.clips.length <= 1) return;
        const S = starts(t.clips)[sel.i]; const E = S + cdur(t.clips[sel.i]);
        removeWithin(t, S, E); t.clips.splice(sel.i, 1); shiftFrom(t, E, -(E - S));
      } else if (sel.type === 'cap') t.captions.splice(sel.i, 1);
      else if (sel.type === 'ov') t.overlays.splice(sel.i, 1);
      else if (sel.type === 'fx') t.effects.splice(sel.i, 1);
      else if (sel.type === 'sfx') t.sfx.splice(sel.i, 1);
      else if (sel.type === 'broll') t.broll.splice(sel.i, 1);
      else if (sel.type === 'music') t.music = null;
    });
    setSel(null);
  };
  const listOf = (t, type) => ({ cap: t.captions, ov: t.overlays, fx: t.effects, sfx: t.sfx, broll: t.broll }[type]);
  const pasteAt = (item, type, at) => {
    edit((t) => {
      const x = clone(item);
      if (type === 'sfx' || type === 'fx') x.t = r2(at); else { const d = x.end - x.start; x.start = r2(at); x.end = r2(at + d); }
      listOf(t, type).push(x);
    });
    setTimeout(() => setSel({ type, i: listOf(tlRef.current, type).length - 1 }), 0);
  };
  const duplicate = () => {
    if (!sel || !listOf(tl, sel.type)) return;
    const it = listOf(tl, sel.type)[sel.i];
    const at = sel.type === 'sfx' || sel.type === 'fx' ? it.t + 0.5 : it.end;
    pasteAt(it, sel.type, Math.abs(T - (it.start ?? it.t)) < 0.01 ? at : T);
  };
  const onAdd = (d, at = TRef.current) => {
    const dur = totalDur(tl.clips);
    at = Math.max(0, Math.min(dur - 0.1, at));
    if (d.kind === 'text') {
      edit((t) => { t.captions.push({ text: d.label === 'Subtítulo' ? 'nuevo texto' : d.label?.toLowerCase() || 'texto', start: r2(at), end: r2(Math.min(dur, at + 1.5)), back: false, ...d.cap }); });
      setTimeout(() => setSel({ type: 'cap', i: tlRef.current.captions.length - 1 }), 0);
    } else if (d.kind === 'overlay') {
      edit((t) => { t.overlays.push({ x: 540, y: 960, ...clone(d.ov), start: r2(at), end: r2(Math.min(dur, at + 2)) }); });
      setTimeout(() => setSel({ type: 'ov', i: tlRef.current.overlays.length - 1 }), 0);
    } else if (d.kind === 'effect') {
      edit((t) => { t.effects.push({ ...d.fx, t: r2(at) }); });
      setTimeout(() => setSel({ type: 'fx', i: tlRef.current.effects.length - 1 }), 0);
    } else if (d.kind === 'transition') {
      const k = sel?.type === 'clip' ? sel.i : clipAt(at, tl.clips);
      if (k === 0) { setNotice('El primer plano no tiene transición de entrada: elige otro plano.'); return; }
      edit((t) => { t.clips[k].transition = d.v; t.clips[k].punch = d.v !== 'none'; });
      setSel({ type: 'clip', i: k });
    } else if (d.kind === 'sound') {
      edit((t) => { t.sfx.push({ file: d.path, t: r2(at), gain_db: -14 }); t.sfx.sort((a, b) => a.t - b.t); });
      setTimeout(() => setSel({ type: 'sfx', i: tlRef.current.sfx.findIndex((s) => s.file === d.path && Math.abs(s.t - r2(at)) < 0.01) }), 0);
    } else if (d.kind === 'video') {
      // se inserta como plano nuevo en el corte más cercano al cursor (lo de después se desplaza)
      const info = srcInfo(d.src) || {};
      const len = r2(Math.min(info.dur || 5, 5));
      let insertAt = 0;
      edit((t) => {
        const S = starts(t.clips); const k = clipAt(at, t.clips);
        const before = at - S[k] < cdur(t.clips[k]) / 2;
        const idx = before ? k : k + 1; insertAt = before ? S[k] : S[k] + cdur(t.clips[k]);
        const c = { in: 0, out: len, zoom: 1, cx: 0.5, cy: 0.5, transition: idx > 0 ? 'punch' : 'none', punch: idx > 0,
          ...(d.src !== t.source ? { src: d.src } : {}), ...(info.w > info.h ? { fit: 'blur' } : {}), ...(info.audio === false ? { mute: true } : {}) };
        shiftFrom(t, insertAt, len);
        t.clips.splice(idx, 0, c);
        setTimeout(() => setSel({ type: 'clip', i: idx }), 0);
      });
      setTimeout(() => goto(insertAt + 0.001), 0);
    } else if (d.kind === 'broll') {
      const info = srcInfo(d.src) || {};
      const len = Math.min(info.dur || 3, 3, Math.max(0.3, dur - at));
      edit((t) => { t.broll.push({ src: d.src, in: 0, start: r2(at), end: r2(at + len), ...(info.w > info.h ? { fit: 'blur' } : {}) }); t.broll.sort((a, b) => a.start - b.start); });
      setTimeout(() => setSel({ type: 'broll', i: tlRef.current.broll.findIndex((b) => b.src === d.src && Math.abs(b.start - r2(at)) < 0.01) }), 0);
    } else if (d.kind === 'music') {
      edit((t) => { t.music = { file: d.path, start: 0, offset: 0, gain_db: -19, duck: true, fade_in: 0.5, fade_out: 1, ...(t.music ? { start: t.music.start, gain_db: t.music.gain_db, duck: t.music.duck } : {}), file: d.path }; });
      setSel({ type: 'music', i: 0 });
    }
  };
  const playSound = (s) => { const a = new Audio(media(s.file)); a.volume = lin(s.gain_db); a.play().catch(() => {}); };

  // ---- arrastrar en la línea de tiempo (con imán) ----
  const beginDrag = (e, d) => {
    e.preventDefault();
    stop();
    const x0 = e.clientX;
    const base = clone(tlRef.current);
    setPast((p) => [...p.slice(-100), tlRef.current]); setFuture([]);
    const S = starts(base.clips);
    // puntos a los que se pega: cursor, cortes y bordes del resto de bloques
    const pts = [0, TRef.current, ...S, totalDur(base.clips)];
    base.captions.forEach((c, i) => { if (!(d.type === 'cap' && d.i === i)) pts.push(c.start, c.end); });
    base.overlays.forEach((c, i) => { if (!(d.type === 'ov' && d.i === i)) pts.push(c.start, c.end); });
    base.sfx.forEach((s, i) => { if (!(d.type === 'sfx' && d.i === i)) pts.push(s.t); });
    base.broll.forEach((b, i) => { if (!(d.type === 'broll' && d.i === i)) pts.push(b.start, b.end); });
    const thr = 8 / pxs;
    const snapT = (t) => { if (!snap) return r2(t); let best = t, bd = thr; for (const p of pts) { const dd = Math.abs(p - t); if (dd < bd) { bd = dd; best = p; } } return r2(best); };
    const mv = (ev) => {
      const dx = (ev.clientX - x0) / pxs;
      const t = clone(base);
      if (d.type === 'cap' || d.type === 'ov') {
        const arr = d.type === 'cap' ? t.captions : t.overlays, b = (d.type === 'cap' ? base.captions : base.overlays)[d.i], c = arr[d.i];
        if (d.mode === 'move') {
          let ns = Math.max(0, b.start + dx); const len = b.end - b.start;
          const s1 = snapT(ns), s2 = snapT(ns + len) - len;
          ns = Math.abs(s1 - ns) <= Math.abs(s2 - ns) ? s1 : s2;
          c.start = r2(ns); c.end = r2(ns + len);
        }
        if (d.mode === 'l') c.start = Math.min(snapT(Math.max(0, b.start + dx)), r2(b.end - 0.05));
        if (d.mode === 'r') c.end = Math.max(snapT(b.end + dx), r2(b.start + 0.05));
      } else if (d.type === 'broll') {
        const b = base.broll[d.i], c = t.broll[d.i], len = b.end - b.start, sd = srcDur(b.src);
        if (d.mode === 'move') { let ns = Math.max(0, b.start + dx); const s1 = snapT(ns), s2 = snapT(ns + len) - len; ns = Math.abs(s1 - ns) <= Math.abs(s2 - ns) ? s1 : s2; c.start = r2(ns); c.end = r2(ns + len); }
        if (d.mode === 'l') { const ns = Math.min(Math.max(snapT(b.start + dx), 0, b.start - (b.in || 0)), b.end - 0.2); c.in = r2((b.in || 0) + ns - b.start); c.start = r2(ns); }
        if (d.mode === 'r') c.end = Math.min(Math.max(snapT(b.end + dx), b.start + 0.2), r2(b.start + sd - (b.in || 0)));
      } else if (d.type === 'sfx') t.sfx[d.i].t = snapT(Math.max(0, base.sfx[d.i].t + dx));
      else if (d.type === 'fx') t.effects[d.i].t = snapT(Math.max(0, base.effects[d.i].t + dx));
      else if (d.type === 'music') t.music.start = snapT(Math.max(0, (base.music.start || 0) + dx));
      else if (d.type === 'clip') {
        const b = base.clips[d.i], c = t.clips[d.i], sp = b.speed || 1;
        const E = S[d.i] + cdur(b);
        if (d.mode === 'r') {
          const o = r2(Math.min(Math.max(b.out + dx * sp, b.in + 0.1), srcDur(srcOf(b, base))));
          c.out = o; shiftFrom(t, E, (o - b.out) / sp);
        } else if (d.mode === 'l') {
          const n = r2(Math.min(Math.max(b.in + dx * sp, 0), b.out - 0.1));
          const dd = (n - b.in) / sp; c.in = n;
          shiftWithin(t, S[d.i], E, -dd); shiftFrom(t, E, -dd);
        }
      }
      setTl(t); setDirty(true);
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  // ---- arrastrar textos y stickers en el visor ----
  const dragInPreview = (e, d, scale) => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    const base = clone(tlRef.current);
    let moved = false;
    const mv = (ev) => {
      const dx = (ev.clientX - x0) / scale, dy = (ev.clientY - y0) / scale;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!moved) { moved = true; setPast((p) => [...p.slice(-100), tlRef.current]); setFuture([]); }
      const t = clone(base);
      if (d.type === 'cap') { const b = base.captions[d.i]; t.captions[d.i].top = Math.round(Math.min(1860, Math.max(40, (b.top ?? 1005) + dy))); t.captions[d.i].x = Math.round((b.x || 0) + dx); }
      if (d.type === 'ov') { const b = base.overlays[d.i]; t.overlays[d.i].x = Math.round((b.x ?? 540) + dx); t.overlays[d.i].y = Math.round((b.y ?? 960) + dy); }
      setTl(t); setDirty(true);
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  // ---- teclado ----
  useEffect(() => {
    const k = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
      else if (!ctrl && (e.key === 's' || e.key === 'S')) split();
      else if (e.key === 'Delete' || e.key === 'Backspace') remove();
      else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
      else if (ctrl && e.key.toLowerCase() === 'c' && sel && listOf(tl, sel.type)) clipboard.current = { type: sel.type, item: clone(listOf(tl, sel.type)[sel.i]) };
      else if (ctrl && e.key.toLowerCase() === 'v' && clipboard.current) pasteAt(clipboard.current.item, clipboard.current.type, T);
      else if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goto(T - (e.shiftKey ? 1 : FRAME)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goto(T + (e.shiftKey ? 1 : FRAME)); }
      else if (e.key === 'Home') goto(0);
      else if (e.key === 'End') goto(totalDur(tl.clips));
      else if (e.key === '+' || e.key === '=') setPxs((p) => Math.min(400, p * 1.25));
      else if (e.key === '-') setPxs((p) => Math.max(12, p / 1.25));
      else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const save = async () => { if (!tl) return; await api.editorSave({ id, timeline: tl }); setDirty(false); setNotice('Guardado.'); setTimeout(() => setNotice(null), 1500); };
  const render = async () => { stop(); setRendering(true); setNotice(null); await api.editorRender({ id, timeline: tl }); setDirty(false); };
  const reimport = async () => {
    if (!confirm('¿Volver a cargar la edición de Claude? Tus cambios a mano se guardan como timeline.prev.json.')) return;
    await api.editorReimport(id); load();
  };
  const resizeTl = (e) => {
    const y0 = e.clientY, h0 = tlH;
    const mv = (ev) => { const h = Math.min(560, Math.max(180, h0 - (ev.clientY - y0))); setTlH(h); try { localStorage.setItem('ed.tlH', h); } catch {} };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  if (error) return (
    <div className="pt-10 text-center">
      <p className="text-red-300">No se ha podido abrir el editor: {error}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn-ghost" onClick={onBack}><ArrowLeft size={15} /> Volver</button>
        <button className="btn-ghost" onClick={reimport}><RotateCcw size={15} /> Volver a importar</button>
      </div>
    </div>
  );
  if (!tl) return <div className="grid place-items-center pt-24 text-muted"><Loader2 className="animate-spin" /></div>;

  const dur = totalDur(tl.clips);
  const cutoutValid = !!tl.cutout && tl.cutout.sig === sig(tl.clips);

  return (
    <div className="-mx-4 flex h-[calc(100vh-44px)] flex-col gap-2 pb-2">
      {/* barra superior */}
      <div className="flex items-center gap-2 px-1">
        <button className="btn-icon" onClick={() => { if (!dirty || confirm('Hay cambios sin guardar. ¿Salir igualmente?')) onBack(); }}><ArrowLeft size={18} /></button>
        <h1 className="truncate font-display text-lg font-semibold">{data.title}</h1>
        {dirty && <span className="text-xs text-amber-200">● sin guardar</span>}
        <div className="ml-4 flex items-center gap-0.5">
          <button className="btn-icon" disabled={!past.length} onClick={undo} title="Deshacer (Ctrl+Z)"><Undo2 size={16} /></button>
          <button className="btn-icon" disabled={!future.length} onClick={redo} title="Rehacer (Ctrl+Y)"><Redo2 size={16} /></button>
        </div>
        {notice && <span className="ml-3 truncate text-xs text-zinc-300">{notice}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost py-1.5 text-xs" onClick={reimport} title="Cargar de nuevo la edición que hizo Claude"><RotateCcw size={13} /> Recargar lo de Claude</button>
          <button className="btn-ghost py-1.5 text-xs" disabled={!dirty} onClick={save}><Save size={13} /> Guardar</button>
          <button className="btn-primary py-1.5 text-xs" disabled={rendering} onClick={render}>
            {rendering ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {rendering ? 'Exportando…' : 'Exportar vídeo'}
          </button>
        </div>
      </div>

      {/* biblioteca · visor · inspector */}
      <div ref={midRef} className="flex min-h-0 flex-1 gap-2">
        <Library onAdd={(d) => onAdd(d)} sounds={sounds} songs={songs} selClip={sel?.type === 'clip' ? sel.i : null}
          videos={videos} videoInfo={srcInfo} stripImgs={stripImgs} mainSource={tl.source} onImport={() => importVideos()} />
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-[#0d0d12] py-2">
          <Preview tl={tl} T={T} videoRef={videoRef} brollRef={brollRef} width={pw} cutoutValid={cutoutValid} sel={sel} onPick={setSel} onDragItem={dragInPreview} safe={safe} />
          {tl.music && <audio ref={musicRef} src={media(tl.music.file)} preload="auto" />}
          <div className="flex items-center gap-1">
            <button className="btn-icon" onClick={() => goto(0)} title="Inicio (Home)"><SkipBack size={15} /></button>
            <button className="btn-icon" onClick={() => goto(T - FRAME)} title="Fotograma anterior (←)">‹</button>
            <button className="grid size-9 place-items-center rounded-full bg-white text-black transition hover:scale-105" onClick={() => (playing ? stop() : play())} title="Espacio">
              {playing ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" className="ml-0.5" />}
            </button>
            <button className="btn-icon" onClick={() => goto(T + FRAME)} title="Fotograma siguiente (→)">›</button>
            <button className="btn-icon" onClick={() => goto(dur)} title="Final (End)"><SkipForward size={15} /></button>
            <span className="mx-2 text-xs tabular-nums text-zinc-300">{fmtT(T)} <span className="text-muted">/ {fmtT(dur)}</span></span>
            <button className={`btn-icon ${loop ? 'text-accent' : ''}`} onClick={() => setLoop(!loop)} title="Bucle"><Repeat size={14} /></button>
            <button className={`btn-icon ${safe ? 'text-accent' : ''}`} onClick={() => setSafe(!safe)} title="Zona segura de TikTok"><Shield size={14} /></button>
          </div>
        </div>
        <div className="w-[300px] shrink-0 overflow-y-auto rounded-xl border border-line bg-panel">
          <Inspector tl={tl} sel={sel} edit={edit} T={T} srcDur={srcDur} sounds={sounds} songs={songs}
            cutoutValid={cutoutValid} split={split} remove={remove} duplicate={duplicate} playSound={playSound} />
        </div>
      </div>

      {/* separador para cambiar el alto de la línea de tiempo */}
      <div onPointerDown={resizeTl} className="mx-auto h-1.5 w-16 shrink-0 cursor-row-resize rounded-full bg-white/10 hover:bg-white/25" />

      {/* herramientas + línea de tiempo */}
      <div className="flex shrink-0 flex-col gap-1.5" style={{ height: tlH }}>
        <div className="flex items-center gap-1 px-1">
          <button className="btn-ghost px-2.5 py-1 text-xs" onClick={split} title="S"><Scissors size={13} /> Cortar</button>
          <button className="btn-ghost px-2.5 py-1 text-xs" disabled={!sel || !listOf(tl, sel.type)} onClick={duplicate} title="Ctrl+D"><Copy size={13} /> Duplicar</button>
          <button className="btn-ghost px-2.5 py-1 text-xs" disabled={!sel} onClick={remove} title="Supr"><Trash2 size={13} /> Borrar</button>
          <span className="ml-3 text-[11px] text-muted">{tl.clips.length} planos{tl.broll.length ? ` · ${tl.broll.length} B-roll` : ''} · {tl.captions.length} textos · {tl.overlays.length} stickers · {tl.sfx.length} sonidos</span>
          <div className="ml-auto flex items-center gap-1 text-muted">
            <button className="btn-icon" onClick={() => setPxs((p) => Math.max(12, p / 1.25))}><ZoomOut size={14} /></button>
            <input type="range" min={12} max={400} value={pxs} onChange={(e) => setPxs(Number(e.target.value))} className="w-28 accent-[#fe2c55]" />
            <button className="btn-icon" onClick={() => setPxs((p) => Math.min(400, p * 1.25))}><ZoomIn size={14} /></button>
          </div>
        </div>
        <Timeline tl={tl} T={T} pxs={pxs} setPxs={setPxs} sel={sel} setSel={setSel} onSeek={goto} beginDrag={beginDrag}
          cutoutValid={cutoutValid} assets={assets} stripImgs={stripImgs} musicPeaks={musicPeaks} snap={snap} setSnap={setSnap}
          onDropItem={(d, at) => onAdd(d, at)} onDropFiles={async (files, at, asBroll) => {
            const added = await importVideos(files);
            if (added[0]) onAdd({ kind: asBroll ? 'broll' : 'video', src: added[0] }, at);
          }} />
      </div>
    </div>
  );
}

export default function Editor({ id, onPick }) {
  const [items] = useLibrary('edited');
  if (id) return <EditorMain key={id} id={id} onBack={() => onPick(null)} />;
  const ready = items?.filter((i) => i.ready && !i.busy) || [];
  return (
    <>
      <Header title="Editor" />
      {items && ready.length === 0 && <Empty icon={Clapperboard} title="No hay vídeos para editar" text="" />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {ready.map((it) => (
          <button key={it.id} onClick={() => onPick(it.id)} className="fadein overflow-hidden rounded-xl border border-line bg-card text-left transition hover:-translate-y-0.5 hover:border-white/15">
            <div className="aspect-[9/16] bg-ink">{it.thumb && <img src={media(it.thumb, it.v)} className="size-full object-cover" />}</div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{it.title}</div>
              <div className="text-xs text-muted">{fmtDur(it.duration_out)}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
