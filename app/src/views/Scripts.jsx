import { useEffect, useState } from 'react';
import { FileText, Plus, Save, Trash2, Check } from 'lucide-react';
import { api, fmtDate, useLibrary } from '../lib.js';
import { Header, Empty } from '../components/ui.jsx';

const stripTitle = (c) => c.replace(/^#\s+.+\n*/m, '');

export default function Scripts() {
  const [items, reload] = useLibrary('scripts');
  const [sel, setSel] = useState(null); // { id?, title, content }
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (items && !sel && items[0]) setSel({ ...items[0], content: stripTitle(items[0].content) });
  }, [items]);

  const save = async () => {
    const id = await api.saveScript(sel);
    setSel((s) => ({ ...s, id }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
    reload();
  };

  return (
    <>
      <Header title="Guiones">
        <button className="btn-ghost" onClick={() => setSel({ title: 'Nuevo guion', content: '**Hook**\n\n\n**Desarrollo**\n\n\n**CTA**\n' })}>
          <Plus size={15} /> Nuevo guion
        </button>
      </Header>

      {items && items.length === 0 && !sel ? (
        <Empty icon={FileText} title="Sin guiones" text="" />
      ) : (
        <div className="grid h-[calc(100vh-170px)] grid-cols-[280px_1fr] gap-4">
          <div className="overflow-y-auto rounded-xl border border-line bg-panel p-1.5">
            {items?.map((s) => (
              <button
                key={s.id}
                onClick={() => setSel({ ...s, content: stripTitle(s.content) })}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition ${sel?.id === s.id ? 'bg-white/[.07]' : 'hover:bg-white/[.04]'}`}
              >
                <div className="truncate text-sm font-medium">{s.title}</div>
                <div className="mt-0.5 truncate text-xs text-muted">{fmtDate(s.updated)}</div>
              </button>
            ))}
          </div>
          {sel && (
            <div className="flex min-h-0 flex-col rounded-xl border border-line bg-panel">
              <div className="flex items-center gap-2 border-b border-line p-3">
                <input
                  className="flex-1 bg-transparent px-1 font-display text-lg font-semibold outline-none"
                  value={sel.title}
                  onChange={(e) => setSel({ ...sel, title: e.target.value })}
                />
                {sel.id && (
                  <button className="btn-icon" title="Borrar"
                    onClick={async () => { if (confirm('¿Borrar este guion?')) { await api.deleteScript(sel.id); setSel(null); reload(); } }}>
                    <Trash2 size={16} />
                  </button>
                )}
                <button className="btn-primary" onClick={save}>{saved ? <Check size={15} /> : <Save size={15} />} Guardar</button>
              </div>
              <textarea
                className="min-h-0 flex-1 resize-none bg-transparent p-4 text-[14.5px] leading-7 outline-none"
                value={sel.content}
                onChange={(e) => setSel({ ...sel, content: e.target.value })}
                onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } }}
                placeholder="Escribe el guion…"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
