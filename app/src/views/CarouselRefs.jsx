import { useState } from 'react';
import { Bookmark, Link2, Plus, FolderOpen, Loader2, Trash2, X, Copy as CloneIcon } from 'lucide-react';
import { api, media, useLibrary } from '../lib.js';
import { Header, Empty, Badge, Modal } from '../components/ui.jsx';

// Carruseles de referencia: desde un enlace de TikTok (se bajan las fotos) o desde capturas
export default function CarouselRefs({ onClone }) {
  const [items, reload] = useLibrary('carouselRefs');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const current = items?.find((i) => i.id === open);
  const add = async (o) => {
    setErr(null);
    try { await api.carouselRefAdd(o); setUrl(''); reload(); } catch { setErr('No se ha podido añadir. Prueba a subir capturas de las diapositivas.'); }
  };
  return (
    <>
      <Header title="Referencias de carruseles" subtitle="Carruseles que funcionan, para clonarlos con tu producto" />
      <div className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field pl-9" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pega el enlace de un carrusel de TikTok (post de fotos)"
            onKeyDown={(e) => e.key === 'Enter' && url.trim() && add({ url: url.trim() })} />
        </div>
        <button className="btn-primary" disabled={!url.trim()} onClick={() => add({ url: url.trim() })}><Plus size={15} /> Añadir</button>
        <button className="btn-ghost" onClick={async () => { const f = await api.pickImages(); if (f.length) add({ files: f }); }}><FolderOpen size={15} /> Subir capturas</button>
      </div>
      {err && <p className="-mt-4 mb-4 text-xs text-red-300">{err}</p>}
      {items && items.length === 0 && <Empty icon={Bookmark} title="Sin referencias" text="Pega el enlace de un carrusel que te guste o sube capturas de sus diapositivas, en orden." />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {items?.map((it) => (
          <div key={it.id} role="button" onClick={() => !it.busy && setOpen(it.id)}
            className="group fadein relative cursor-pointer overflow-hidden rounded-xl border border-line bg-card transition hover:-translate-y-0.5 hover:border-white/15">
            <div className="relative aspect-[9/16] bg-ink">
              {it.thumb ? <img src={media(it.thumb)} className="size-full object-cover" loading="lazy" />
                : <div className="grid size-full place-items-center text-xs text-muted"><Loader2 size={18} className="mb-2 animate-spin" /> Descargando…</div>}
              <div className="absolute left-2 top-2 flex gap-1">
                <Badge tone="dark">{it.images.length} fotos</Badge>
                {it.analysis && <Badge tone="ok">Analizada</Badge>}
              </div>
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{it.title}</div>
              {it.author && <div className="truncate text-xs text-muted">@{it.author}</div>}
            </div>
          </div>
        ))}
      </div>
      {current && (
        <Modal wide onClose={() => setOpen(null)}>
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2 pr-10">
              <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{current.title}</h2>
              <button className="btn-primary" onClick={() => { setOpen(null); onClone(current.id); }}><CloneIcon size={15} /> Clonar con mi producto</button>
              <button className="btn-icon" title="Borrar" onClick={async () => { if (confirm('¿Mover esta referencia a la papelera?')) { await api.carouselRefDelete(current.id); setOpen(null); } }}><Trash2 size={16} /></button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {current.images.map((im) => <img key={im} src={media(im)} className="h-[52vh] shrink-0 rounded-lg" />)}
            </div>
            {current.source?.desc && <p className="mt-3 text-sm text-zinc-300">{current.source.desc}</p>}
            {current.analysis && <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-ink p-3 font-sans text-[13px] text-zinc-300 select-text">{current.analysis}</pre>}
          </div>
        </Modal>
      )}
    </>
  );
}
