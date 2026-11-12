import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Header({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 pt-2">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Modal({ onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={`fadein relative max-h-full w-full overflow-auto rounded-2xl border border-line bg-panel shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="btn-icon absolute right-3 top-3 z-10" onClick={onClose}><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, text, children }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line py-20 text-center">
      <Icon size={28} className="mb-3 text-muted" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'muted' }) {
  const tones = {
    muted: 'bg-white/[.06] text-muted',
    ok: 'bg-emerald-500/15 text-emerald-300',
    accent: 'bg-accent/15 text-[#ff8aa1]',
    warn: 'bg-amber-500/15 text-amber-300',
    dark: 'bg-black/70 text-white backdrop-blur',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
