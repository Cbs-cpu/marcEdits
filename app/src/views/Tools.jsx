import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Save, Check, Copy, Bookmark, Type, Shuffle, Music, Volume2, Sparkles, FolderOpen, Plus, Trash2, Upload, FileJson, Film, Image as ImageIcon } from 'lucide-react';
import ToolFolder from '../components/ToolFolder.jsx';
import { api, useLibrary } from '../lib.js';
import { Header } from '../components/ui.jsx';

const TOOL_INFO = {
  claude: 'Claude Code (usa tu suscripción)',
  ffmpeg: 'Cortes, zooms y render',
  ffprobe: 'Lectura de vídeos',
  whisper: 'Transcripción palabra a palabra',
  'yt-dlp': 'Descarga de referencias',
  python: 'Motor de edición',
};

export function CaptionPreview({ cap = {}, className = '' }) {
  const words = ['AUNQUE', 'PAREZCA', 'MENTIRA'];
  const t = (w) => (cap.uppercase === false ? w.toLowerCase() : w);
  const scale = 0.24; // 1080px → ~260px
  const stroke = (cap.outline_w ?? 7) * scale * 1.6;
  return (
    <div className={`relative aspect-[9/16] overflow-hidden rounded-xl bg-gradient-to-b from-[#3a3f4a] via-[#23262e] to-[#121318] ${className}`}>
      <div className="absolute left-1/2 top-[18%] h-[38%] w-[46%] -translate-x-1/2 rounded-[45%_45%_30%_30%] bg-white/[.06]" />
      <div
        className="absolute left-0 right-0 -translate-y-1/2 px-3 text-center leading-[1.05]"
        style={{
          top: `${(cap.pos_y ?? 0.66) * 100}%`,
          fontFamily: `"${cap.font || 'Montserrat Black'}", Montserrat, sans-serif`,
          fontWeight: 900,
          fontSize: (cap.size ?? 84) * scale,
          letterSpacing: (cap.spacing ?? 1) * scale,
          color: cap.primary || '#fff',
          WebkitTextStroke: `${stroke}px ${cap.outline || '#000'}`,
          paintOrder: 'stroke fill',
          textShadow: `0 ${(cap.shadow ?? 3) * scale * 1.5}px 0 rgba(0,0,0,.45)`,
        }}
      >
        {words.slice(0, cap.words_per_chunk ?? 3).map((w, i) => (
          <span key={i} style={{ color: i === 1 && cap.highlight_active !== false ? cap.highlight || '#FFE14D' : undefined }}>
            {t(w)}{' '}
          </span>
        ))}
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step = 1, min, max }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input type="number" className="field" step={step} min={min} max={max} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
    </label>
  );
}
function Color({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-ink px-2 py-1.5">
        <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-xs text-zinc-300">{value}</span>
      </div>
    </label>
  );
}

function RecipeEditor({ recipe, onSaved }) {
  const [data, setData] = useState(recipe.data);
  const [json, setJson] = useState(JSON.stringify(recipe.data, null, 2));
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setData(recipe.data); setJson(JSON.stringify(recipe.data, null, 2)); }, [recipe.id]);

  const set = (section, key, val) => {
    const next = { ...data, [section]: { ...(data[section] || {}), [key]: val } };
    setData(next);
    setJson(JSON.stringify(next, null, 2));
  };
  const cap = data.captions || {};
  const save = async (asCopy) => {
    const id = asCopy ? `${recipe.id}-copia-${Date.now().toString().slice(-4)}` : recipe.id;
    const d = asCopy ? { ...data, name: `${data.name} (copia)` } : data;
    await api.saveRecipe({ id, data: d });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
    onSaved(id);
  };

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6">
      <div>
        <CaptionPreview cap={cap} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <input className="w-full bg-transparent font-display text-lg font-semibold outline-none" value={data.name || ''}
              onChange={(e) => { const n = { ...data, name: e.target.value }; setData(n); setJson(JSON.stringify(n, null, 2)); }} />
          </div>
          <button className="btn-ghost" onClick={() => save(true)}><Copy size={15} /> Duplicar</button>
          <button className="btn-primary" onClick={() => save(false)}>{saved ? <Check size={15} /> : <Save size={15} />} Guardar</button>
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Subtítulos</h3>
          <div className="grid grid-cols-4 gap-3">
            <Num label="Tamaño" value={cap.size} onChange={(v) => set('captions', 'size', v)} />
            <Num label="Palabras por bloque" value={cap.words_per_chunk} min={1} max={6} onChange={(v) => set('captions', 'words_per_chunk', v)} />
            <Num label="Posición vertical (0-1)" value={cap.pos_y} step={0.01} min={0} max={1} onChange={(v) => set('captions', 'pos_y', v)} />
            <Num label="Borde" value={cap.outline_w} onChange={(v) => set('captions', 'outline_w', v)} />
            <Color label="Texto" value={cap.primary} onChange={(v) => set('captions', 'primary', v)} />
            <Color label="Palabra activa" value={cap.highlight} onChange={(v) => set('captions', 'highlight', v)} />
            <Color label="Borde" value={cap.outline} onChange={(v) => set('captions', 'outline', v)} />
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={cap.uppercase !== false} onChange={(e) => set('captions', 'uppercase', e.target.checked)} /> Mayúsculas
            </label>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Cortes y zoom</h3>
          <div className="grid grid-cols-4 gap-3">
            <Num label="Pausa que se corta (s)" value={data.cuts?.silence_gap} step={0.05} onChange={(v) => set('cuts', 'silence_gap', v)} />
            <Num label="Plano máximo (s)" value={data.cuts?.max_shot} step={0.5} onChange={(v) => set('cuts', 'max_shot', v)} />
            <Num label="Zoom en cortes" value={data.zoom?.pattern?.[1]} step={0.02} onChange={(v) => set('zoom', 'pattern', [1, v])} />
            <Num label="Encuadre vertical (0-1)" value={data.zoom?.anchor_y} step={0.05} onChange={(v) => set('zoom', 'anchor_y', v)} />
          </div>
        </section>

        <details className="rounded-lg border border-line bg-ink">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted">JSON avanzado</summary>
          <textarea
            className="h-72 w-full resize-y bg-transparent p-3 font-mono text-xs outline-none"
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              try { setData(JSON.parse(e.target.value)); setErr(null); } catch (x) { setErr(x.message); }
            }}
          />
          {err && <div className="px-3 pb-2 text-xs text-red-300">{err}</div>}
        </details>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'subtitulos', label: 'Subtítulos', icon: Type },
  { id: 'transiciones', label: 'Transiciones', icon: Shuffle },
  { id: 'canciones', label: 'Canciones', icon: Music },
  { id: 'sonidos', label: 'Sonidos', icon: Volume2 },
  { id: 'efectos', label: 'Efectos', icon: Sparkles },
];

function Subtitles() {
  const [recipes, reload] = useLibrary('recipes');
  const [sel, setSel] = useState('skill-video-edit');
  const current = recipes?.find((r) => r.id === sel) || recipes?.[0];
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {recipes?.map((r) => (
          <button key={r.id} onClick={() => setSel(r.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
              current?.id === r.id ? 'border-accent/60 bg-accent/10 text-white' : 'border-line bg-card text-muted hover:text-zinc-200'}`}>
            {r.fromReference && <Bookmark size={13} />} {r.name}
          </button>
        ))}
      </div>
      {current && (
        <div className="rounded-2xl border border-line bg-panel p-6">
          <RecipeEditor recipe={current} onSaved={(id) => { reload(); setSel(id); }} />
        </div>
      )}
    </>
  );
}

export default function Tools() {
  const [tab, setTab] = useState('subtitulos');
  const [tools] = useLibrary('tools');
  const missing = tools?.filter((t) => !t.path) || [];
  return (
    <>
      <Header title="Herramientas">
        {missing.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-red-300"><XCircle size={14} /> Falta: {missing.map((t) => t.name).join(', ')}</span>
        )}
      </Header>
      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${
              tab === id ? 'border-accent text-white' : 'border-transparent text-muted hover:text-zinc-200'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'subtitulos' ? <Subtitles /> : <ToolFolder key={tab} cat={tab} />}
    </>
  );
}
