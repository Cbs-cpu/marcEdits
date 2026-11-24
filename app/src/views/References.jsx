import { useState } from 'react';
import { Bookmark, Link2, Upload, Sparkles, CheckCircle2, Trash2, FolderOpen, Wand2, Loader2, ExternalLink } from 'lucide-react';
import { api, media, fmtDur, useLibrary } from '../lib.js';
import { Header, Modal, Empty, Badge } from '../components/ui.jsx';

function Detail({ item, busy, onClose, onSkill, onUse, onDeleted }) {
  return (
    <Modal onClose={onClose} wide>
      <div className="flex gap-6 p-6">
        {item.video && (
          <video src={media(item.video)} controls autoPlay
            className="h-[72vh] max-h-[760px] aspect-[9/16] rounded-xl bg-black object-contain" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-4 pt-2">
          <div>
            <h2 className="font-display text-xl font-semibold">{item.title}</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              {item.author && <span>@{item.author}</span>}
              {item.duration && <span>· {fmtDur(item.duration)}</span>}
            </div>
          </div>
          {item.skill ? (
            <>
              <Badge tone="ok"><CheckCircle2 size={12} /> Skill guardada · {item.recipe}</Badge>
              {item.analysis && (
                <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-ink p-4 text-sm leading-relaxed text-zinc-300 select-text">
                  {item.analysis}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Claude la analiza y la guarda como estilo.</p>
          )}
          <div className="mt-auto flex flex-wrap gap-2">
            {item.skill ? (
              <button className="btn-primary" onClick={() => onUse(item.id)}><Wand2 size={15} /> Editar un vídeo así</button>
            ) : (<>
              <button className="btn-primary" disabled={busy} onClick={onSkill}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Guardar como skill
              </button>
              {item.video && <button className="btn-ghost" onClick={() => onUse(item.id)}><Wand2 size={15} /> Editar un vídeo así</button>}
            </>
            )}
            {item.skill && <button className="btn-ghost" disabled={busy} onClick={onSkill}><Sparkles size={15} /> Volver a analizar</button>}
            {item.url && <button className="btn-ghost" onClick={() => window.open(item.url)}><ExternalLink size={15} /> Original</button>}
            <button className="btn-ghost" onClick={() => api.open(item.dir)}><FolderOpen size={15} /></button>
            <button className="btn-ghost text-red-300"
              onClick={async () => { if (confirm('¿Borrar esta referencia?')) { await api.deleteReference(item.id); onDeleted(); } }}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function References({ onUse }) {
  const [items, reload] = useLibrary('references');
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState({}); // id -> true mientras se crea la skill

  const add = async () => {
    if (!url.trim()) return;
    await api.addReference({ url: url.trim() });
    setUrl('');
  };
  const addFile = async () => {
    const f = await api.pickVideo();
    if (f) { await api.addReference({ file: f }); reload(); }
  };
  const saveSkill = async (id) => {
    const a = await api.authStatus();
    if (!a.loggedIn) {
      if (confirm('Claude no tiene la sesión iniciada. ¿Abrir el inicio de sesión ahora?')) api.login();
      return;
    }
    setBusy((b) => ({ ...b, [id]: true }));
    await api.saveSkill(id);
    const off = api.onJob((ev) => {
      if (ev.type === 'end') { setBusy((b) => ({ ...b, [id]: false })); reload(); off(); }
    });
  };

  return (
    <>
      <Header title="Referencias" />

      <div className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field pl-9" placeholder="Enlace de TikTok, Instagram o YouTube" value={url}
            onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </div>
        <button className="btn-primary" onClick={add} disabled={!url.trim()}>Añadir</button>
        <button className="btn-ghost" onClick={addFile}><Upload size={15} /> Desde archivo</button>
      </div>

      {items && items.length === 0 && (
        <Empty icon={Bookmark} title="Sin referencias" text="" />
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        {items?.map((it) => (
          <div key={it.id} className="group fadein overflow-hidden rounded-xl border border-line bg-card transition hover:-translate-y-0.5 hover:border-white/15">
            <button className="relative block aspect-[9/16] w-full bg-ink" onClick={() => setOpen(it)}>
              {it.thumb && <img src={media(it.thumb)} className="size-full object-cover" />}
              <div className="absolute left-2 top-2">
                {it.skill ? <Badge tone="ok"><CheckCircle2 size={11} /> Skill</Badge> : busy[it.id] ? <Badge tone="accent"><Loader2 size={11} className="animate-spin" /> Analizando</Badge> : null}
              </div>
            </button>
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.title}</div>
                <div className="truncate text-xs text-muted">{it.author ? `@${it.author}` : 'Archivo local'}</div>
              </div>
              {it.skill ? (
                <button className="btn-icon" title="Editar con este estilo" onClick={() => onUse(it.id)}><Wand2 size={16} /></button>
              ) : (
                <button className="btn-icon text-accent" title="Guardar como skill" disabled={busy[it.id]} onClick={() => saveSkill(it.id)}>
                  <Sparkles size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Detail
          item={items.find((i) => i.id === open.id) || open}
          busy={busy[open.id]}
          onClose={() => setOpen(null)}
          onSkill={() => saveSkill(open.id)}
          onUse={(r) => { setOpen(null); onUse(r); }}
          onDeleted={() => { setOpen(null); reload(); }}
        />
      )}
    </>
  );
}
