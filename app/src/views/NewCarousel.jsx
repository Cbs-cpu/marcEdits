import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Check, Send, ChevronRight, X, Pencil, Trash2, Link2, Plus, Loader2, LogIn, Ban, FolderOpen } from 'lucide-react';
import { api, useLibrary, media } from '../lib.js';
import { buildCarouselPrompt, TONES, CAROUSEL_TIPS } from '../carouselPrompt.js';

// Crear carrusel: producto → en qué se basa (formato o referencia a clonar) → detalles → prompt exacto
const STEPS = ['producto', 'base', 'detalles', 'revision'];
const Q = {
  producto: '¿Qué vendemos?',
  base: '¿Formato o carrusel a clonar?',
  detalles: 'Detalles',
  revision: 'Esto es lo que recibe Claude.',
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
        {onEdit && <button className="opacity-0 transition group-hover:opacity-100" title="Cambiar" onClick={onEdit}><Pencil size={13} className="text-muted" /></button>}
      </div>
    </div>
  );
}

const Chip = ({ on, onClick, children, title }) => (
  <button onClick={onClick} title={title}
    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-accent/70 bg-accent/15 text-white' : 'border-line bg-card text-zinc-300 hover:border-white/20'}`}>
    {on && <Check size={13} className="text-accent" />} {children}
  </button>
);

export default function NewCarousel({ initial, onClose, onStarted }) {
  const [refs, reloadRefs] = useLibrary('carouselRefs');
  const [formats, setFormats] = useState([]);
  useEffect(() => { api.carouselFormats().then((f) => setFormats(f.formats || [])); }, []);

  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState([]);       // rutas absolutas
  const [title, setTitle] = useState('');
  const [product, setProduct] = useState({ name: '', price: '', notes: '' });
  const [refId, setRefId] = useState(initial.refId || null);
  const [formatId, setFormatId] = useState(initial.format || (initial.refId ? null : 'problema-solucion'));
  const [refUrl, setRefUrl] = useState('');
  const [refErr, setRefErr] = useState(null);
  const [slides, setSlides] = useState('auto');
  const [tone, setTone] = useState('nativo');
  const [tips, setTips] = useState(CAROUSEL_TIPS.filter((t) => t.on).map((t) => t.id));
  const [extra, setExtra] = useState('');
  const [prep, setPrep] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [drag, setDrag] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [step]);

  // modo prueba (MARC_TEST_CAROUSEL): fotos y producto de ejemplo
  useEffect(() => {
    if (window.__MARC_TEST_IMAGES) addPhotos(window.__MARC_TEST_IMAGES);
    if (window.__MARC_TEST_PRODUCT) setProduct(window.__MARC_TEST_PRODUCT);
    if (window.__MARC_TEST_TONE) setTone(window.__MARC_TEST_TONE);
    if (window.__MARC_TEST_FORMAT) setFormatId(window.__MARC_TEST_FORMAT);
    if (window.__MARC_TEST_CEXTRA) setExtra(window.__MARC_TEST_CEXTRA);
  }, []);
  const ref = refs?.find((r) => r.id === refId) || null;
  const format = formats.find((f) => f.id === formatId) || null;
  const addPhotos = (list) => {
    const ok = list.filter((p) => /\.(jpe?g|png|webp)$/i.test(p));
    setPhotos((ps) => [...ps, ...ok.filter((p) => !ps.includes(p))]);
  };
  const addRef = async ({ url, files }) => {
    setRefErr(null);
    try { const r = await api.carouselRefAdd(url ? { url } : { files }); await reloadRefs(); setRefId(r.id); setFormatId(null); setRefUrl(''); }
    catch { setRefErr('No se ha podido añadir. Sube capturas.'); }
  };
  // si la descarga del enlace falla, la referencia desaparece
  useEffect(() => { if (refs && refId && !ref) { setRefId(null); setRefErr('No se ha podido descargar. Sube capturas.'); } }, [refs]);

  const goReview = async () => {
    setBusy(true);
    try {
      const key = JSON.stringify([photos, title]);
      let p = prep;
      if (!p || p.key !== key) {
        if (p) await api.carouselDiscard(p.id);
        p = { ...(await api.carouselPrepare({ title: title || product.name || 'carrusel', photos })), key };
        setPrep(p);
      }
      setPrompt(buildCarouselPrompt({ id: p.id, dir: p.dir, title: title || product.name, product, assets: p.assets, format, reference: ref, slides, tone, tips, extra }));
      setStep(STEPS.indexOf('revision'));
    } finally { setBusy(false); }
  };
  const next = () => (STEPS[step + 1] === 'revision' ? goReview() : setStep(step + 1));
  const close = () => { if (prep) api.carouselDiscard(prep.id); onClose(); };
  const send = async () => {
    setBusy(true);
    const a = await api.authStatus();
    if (!a.loggedIn) { setNeedLogin(true); setBusy(false); return; }
    await api.carouselRun({ id: prep.id, title: title || product.name || prep.id, format: ref ? 'clon' : formatId, reference: ref?.id, product, prompt });
    onStarted();
  };

  const answer = {
    producto: `${product.name || 'Producto'}${product.price ? ` · ${product.price}` : ''} · ${photos.length} foto${photos.length === 1 ? '' : 's'}`,
    base: ref ? `Clonar «${ref.title}» (${ref.images.length} diapositivas)` : format ? `${format.emoji} ${format.name}` : '—',
    detalles: `${slides === 'auto' ? 'Diapositivas automáticas' : `${slides} diapositivas`} · ${tone} · ${tips.length} indicaciones${extra.trim() ? ' + nota' : ''}`,
  };

  const current = STEPS[step];
  const controls = {
    producto: (
      <div className="flex flex-col gap-3">
        {photos.length > 0 && (
          <div className="grid grid-cols-6 gap-2">
            {photos.map((p) => (
              <div key={p} className="group relative overflow-hidden rounded-lg border border-line">
                <img src={`file:///${p.replace(/\\/g, '/')}`} className="aspect-square w-full object-cover" onError={(e) => { e.currentTarget.style.opacity = 0; }} />
                <button className="absolute right-1 top-1 grid size-6 place-items-center rounded bg-black/70 opacity-0 group-hover:opacity-100"
                  onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}><Trash2 size={12} /></button>
                <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px]">{p.split(/[\\/]/).pop()}</div>
              </div>
            ))}
          </div>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addPhotos([...e.dataTransfer.files].map((f) => api.pathForFile(f))); }}
          onClick={async () => addPhotos(await api.pickImages())}
          className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 text-center transition ${photos.length ? 'py-4' : 'py-8'} ${drag ? 'border-accent bg-accent/5' : 'border-line hover:border-white/20'}`}>
          <div className="flex items-center gap-2 text-sm text-muted"><ImagePlus size={18} /> {photos.length ? 'Añadir más fotos' : 'Arrastra fotos del producto'}</div>
        </div>
        <div className="grid grid-cols-[1fr_160px] gap-2">
          <input className="field" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Producto" />
          <input className="field" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} placeholder="Precio (opcional)" />
        </div>
        <textarea className="field h-20 resize-none" value={product.notes} onChange={(e) => setProduct({ ...product, notes: e.target.value })}
          placeholder="Qué lo hace especial (opcional)" />
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" />
      </div>
    ),
    base: (
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted">En tendencia</div>
          <div className="grid grid-cols-2 gap-2">
            {formats.map((f) => {
              const on = !refId && formatId === f.id;
              return (
                <button key={f.id} onClick={() => { setFormatId(f.id); setRefId(null); }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${on ? 'border-accent/70 bg-accent/10' : 'border-line bg-card hover:border-white/20'}`}>
                  <div className="flex items-center gap-2 text-sm font-medium">{f.emoji} {f.name}<span className="ml-auto text-[11px] font-normal text-muted">{f.slides} fotos</span></div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted">{f.hook}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-muted">O clona uno</div>
          <div className="grid grid-cols-6 gap-2">
            {refs?.map((r) => {
              const on = refId === r.id;
              return (
                <button key={r.id} onClick={() => { setRefId(r.id); setFormatId(null); }}
                  className={`relative overflow-hidden rounded-lg border-2 text-left transition ${on ? 'border-accent' : 'border-transparent hover:border-white/15'}`}>
                  {r.thumb ? <img src={media(r.thumb)} className="aspect-[9/16] w-full object-cover" />
                    : <div className="grid aspect-[9/16] place-items-center bg-card"><Loader2 size={16} className="animate-spin text-muted" /></div>}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-5 text-[11px] font-medium">{r.title}</div>
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">{r.images.length}</span>
                  {on && <div className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-accent"><Check size={12} /></div>}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="field pl-9" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="Enlace de TikTok"
                onKeyDown={(e) => { if (e.key === 'Enter' && refUrl.trim()) addRef({ url: refUrl.trim() }); }} />
            </div>
            <button className="btn-ghost" disabled={!refUrl.trim()} onClick={() => addRef({ url: refUrl.trim() })}><Plus size={14} /> Añadir</button>
            <button className="btn-ghost" onClick={async () => { const f = await api.pickImages(); if (f.length) addRef({ files: f }); }}><FolderOpen size={14} /> Subir capturas</button>
          </div>
          {refErr && <p className="mt-1.5 text-xs text-red-300">{refErr}</p>}
          {ref?.busy && <p className="mt-1.5 flex items-center gap-2 text-xs text-muted"><Loader2 size={13} className="animate-spin" /> Descargando las fotos del carrusel…</p>}
        </div>
      </div>
    ),
    detalles: (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-xs text-muted">Diapositivas</span>
          {['auto', '3', '5', '7', '10'].map((n) => <Chip key={n} on={slides === n} onClick={() => setSlides(n)}>{n === 'auto' ? 'Que decida Claude' : n}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-xs text-muted">Estilo</span>
          {Object.keys(TONES).map((k) => <Chip key={k} on={tone === k} onClick={() => setTone(k)} title={TONES[k]}>{k[0].toUpperCase() + k.slice(1)}</Chip>)}
        </div>
        <div className="flex flex-col gap-1.5">
          {CAROUSEL_TIPS.map((t) => {
            const on = tips.includes(t.id);
            return (
              <button key={t.id} onClick={() => setTips((l) => (on ? l.filter((x) => x !== t.id) : [...l, t.id]))}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition ${on ? 'border-accent/50 bg-accent/10 text-white' : 'border-line bg-card text-zinc-400 hover:border-white/20'}`}>
                <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${on ? 'border-accent bg-accent' : 'border-zinc-600'}`}>{on && <Check size={11} />}</span>
                {t.text}
              </button>
            );
          })}
        </div>
        <textarea className="field h-20 resize-none" value={extra} onChange={(e) => setExtra(e.target.value)}
          placeholder="Algo más (opcional)" />
      </div>
    ),
    revision: (
      <div className="flex flex-col gap-3">
        <textarea className="field h-[46vh] resize-none font-mono text-[12px] leading-relaxed" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>Modelo: <b className="text-zinc-300">Opus 5.5</b> · tu suscripción</span>
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

  const canNext = current === 'producto' ? (photos.length > 0 || product.name.trim()) : current === 'base' ? ((ref && !ref.busy && ref.images.length) || (!refId && format)) : true;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={close}>
      <div className="fadein flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-6 py-3.5">
          <h2 className="font-display text-lg font-semibold">Crear carrusel</h2>
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
                <Bubble who="a" onEdit={() => setStep(STEPS.indexOf(s))}>{answer[s]}</Bubble>
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
          {current === 'revision' ? (
            <button className="btn-primary" disabled={busy || !prompt.trim()} onClick={send}><Send size={15} /> Enviar a Claude</button>
          ) : (
            <button className="btn-primary" disabled={!canNext || busy} onClick={next}>
              {busy ? <><Loader2 size={15} className="animate-spin" /> Preparando…</> : <>Seguir <ChevronRight size={15} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
