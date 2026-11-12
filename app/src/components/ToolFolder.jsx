import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Trash2, Upload, FileJson, Film, Music, Image as ImageIcon, File, Check, TrendingUp, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { api, media } from '../lib.js';

const INFO = {
  transiciones: { empty: 'Sin transiciones', preset: true, hint: 'Vídeos de transición o presets con la descripción exacta del efecto.' },
  canciones: { empty: 'Sin canciones propias todavía', preset: false, hint: 'Tus canciones de fondo (mp3, wav): arrástralas aquí.' },
  sonidos: { empty: 'Sin sonidos', preset: false, hint: 'Arrastra aquí los sonidos que usas mucho.' },
  efectos: { empty: 'Sin efectos', preset: true, hint: 'Overlays en vídeo o presets con la descripción exacta del efecto.' },
};
const ICON = { preset: FileJson, video: Film, audio: Music, image: ImageIcon, file: File };

function Item({ cat, it, onChanged }) {
  const [name, setName] = useState(it.name);
  const [notes, setNotes] = useState(it.notes);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setName(it.name); setNotes(it.notes); }, [it.file, it.v]);
  const dirty = name !== it.name || notes !== it.notes;
  const save = async () => {
    await api.toolsMeta({ cat, file: it.file, name, notes });
    setSaved(true); setTimeout(() => setSaved(false), 1000);
    onChanged();
  };
  const Icon = ICON[it.kind] || File;
  return (
    <div className="fadein flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3.5">
      <div className="flex items-center gap-2">
        <Icon size={16} className="shrink-0 text-muted" />
        <input className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" value={name}
          onChange={(e) => setName(e.target.value)} onBlur={() => dirty && save()} />
        {saved && <Check size={14} className="text-emerald-400" />}
        <button className="btn-icon size-7" title="Mover a la papelera"
          onClick={async () => { if (confirm(`¿Mover «${it.name}» a la papelera?`)) { await api.toolsRemove(cat, it.file); onChanged(); } }}>
          <Trash2 size={14} />
        </button>
      </div>
      {it.kind === 'audio' && <audio src={media(it.path, it.v)} controls className="h-8 w-full" />}
      {it.kind === 'video' && <video src={media(it.path, it.v)} controls muted className="max-h-56 w-full rounded-lg bg-black object-contain" />}
      {it.kind === 'image' && <img src={media(it.path, it.v)} className="max-h-56 w-full rounded-lg object-contain" />}
      <textarea
        className="field h-20 resize-none text-[13px] leading-snug"
        placeholder="Notas para Claude: cuándo usarlo, volumen, duración…"
        value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => dirty && save()}
      />
    </div>
  );
}


// Canciones en tendencia: solo la lista (tienen copyright). Se añaden desde TikTok al publicar el vídeo.
function Trends() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.trendsGet().then(setData);
  useEffect(() => {
    load();
    const off = api.onChanged((s) => s === 'trends' && (load(), setBusy(false)));
    return off;
  }, []);
  const refresh = async () => {
    const a = await api.authStatus();
    if (!a.loggedIn) { if (confirm('Claude no tiene la sesión iniciada. ¿Iniciar sesión ahora?')) api.login(); return; }
    setBusy(true);
    await api.trendsRefresh();
  };
  const search = (t) => api.openExternal(`https://www.tiktok.com/search?q=${encodeURIComponent(`${t.title} ${t.artist}`)}`);
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp size={16} className="text-accent" />
        <h3 className="font-display text-base font-semibold">En tendencia en TikTok</h3>
        {data?.updated && <span className="text-xs text-muted">· {data.updated}</span>}
        <button className="btn-ghost ml-auto py-1.5 text-xs" disabled={busy} onClick={refresh}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualizar con Claude
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">Tienen copyright: Claude deja el vídeo listo y tú añades el sonido desde TikTok al publicar (así además cuenta en la tendencia).</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
        {data?.songs?.map((t, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
            <span className="w-5 text-right text-xs font-semibold text-muted tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.title}</div>
              <div className="truncate text-xs text-muted" title={t.notes}>{t.artist}</div>
            </div>
            <button className="btn-icon size-7" title="Buscar en TikTok" onClick={() => search(t)}><ExternalLink size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ToolFolder({ cat }) {
  const info = INFO[cat];
  const [items, setItems] = useState(null);
  const [drag, setDrag] = useState(false);
  const reload = () => api.toolsList(cat).then(setItems);
  useEffect(() => { reload(); window.addEventListener('focus', reload); return () => window.removeEventListener('focus', reload); }, [cat]);

  const onDrop = async (e) => {
    e.preventDefault(); setDrag(false);
    const files = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (files.length) { await api.toolsAdd(cat, files); reload(); }
  };

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
      className={`rounded-2xl transition ${drag ? 'outline-2 outline-dashed outline-accent/70 outline-offset-4' : ''}`}>
      {cat === 'canciones' && <Trends />}
      <div className="mb-4 flex items-center gap-2">
        <p className="mr-auto text-sm text-muted">{info.hint}</p>
        {info.preset && (
          <button className="btn-ghost" onClick={async () => {
            await api.toolsPreset({ cat, name: 'Nuevo preset', notes: '' }); reload();
          }}><Plus size={15} /> Preset</button>
        )}
        <button className="btn-ghost" onClick={async () => { await api.toolsAdd(cat); reload(); }}><Upload size={15} /> Añadir archivos</button>
        <button className="btn-ghost" title="Abrir carpeta" onClick={() => api.toolsOpenDir(cat)}><FolderOpen size={15} /></button>
      </div>
      {items && items.length === 0 && (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
          {info.empty}
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {items?.map((it) => <Item key={it.file} cat={cat} it={it} onChanged={reload} />)}
      </div>
    </div>
  );
}
