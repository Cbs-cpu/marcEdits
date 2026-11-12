import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib.js';
import { Header } from '../components/ui.jsx';

// Formatos de carrusel que más se usan en TikTok Shop (library/tools/carruseles/formatos.json, editable)
export default function Formats({ onUse }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.carouselFormats().then(setData); }, []);
  return (
    <>
      <Header title="Formatos en tendencia" subtitle={data?.updated ? `TikTok Shop · actualizado el ${data.updated}` : ''} />
      {data?.notes && <p className="mb-6 max-w-3xl text-sm leading-relaxed text-zinc-400">{data.notes}</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {data?.formats?.map((f) => (
          <div key={f.id} className="fadein flex flex-col rounded-xl border border-line bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{f.emoji}</span>
              <h3 className="font-medium">{f.name}</h3>
              <span className="ml-auto text-xs text-muted">{f.slides} fotos</span>
            </div>
            <p className="mt-2 text-sm italic text-zinc-300">{f.hook}</p>
            <ol className="mt-3 flex flex-col gap-1 text-[13px] text-zinc-400">
              {f.structure.map((s, i) => <li key={i} className="flex gap-2"><span className="w-4 shrink-0 text-right text-muted">{i + 1}</span>{s}</li>)}
            </ol>
            <p className="mt-3 text-xs text-muted">{f.look}</p>
            <button className="btn-ghost mt-4 self-start py-1.5 text-xs" onClick={() => onUse(f.id)}>Usar este formato <ArrowRight size={13} /></button>
          </div>
        ))}
      </div>
      {data?.sources?.length > 0 && (
        <p className="mt-8 text-[11px] text-muted/70">Fuentes: {data.sources.map((s) => new URL(s).hostname.replace('www.', '')).join(' · ')}</p>
      )}
    </>
  );
}
