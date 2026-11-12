import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, CheckCircle2, XCircle, Square, X, Timer } from 'lucide-react';
import { api, fmtClock, useElapsed } from '../lib.js';

const LEVEL = {
  claude: 'text-zinc-100',
  tool: 'text-cyan/90',
  ok: 'text-emerald-300',
  error: 'text-red-300',
  dim: 'text-muted/80',
  log: 'text-zinc-300',
};

function JobCard({ job, onToggle, onDismiss }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [job.logs.length, job.open]);
  const Icon = job.status === 'running' ? Loader2 : job.status === 'done' ? CheckCircle2 : XCircle;
  const color = job.status === 'running' ? 'text-accent animate-spin' : job.status === 'done' ? 'text-emerald-400' : 'text-red-400';
  const last = job.logs[job.logs.length - 1];
  const live = useElapsed(job.started, job.status === 'running');
  const secs = job.status === 'running' ? live : job.seconds ?? (job.ended && job.started ? (job.ended - job.started) / 1000 : null);
  return (
    <div className="fadein overflow-hidden rounded-xl border border-line bg-panel/95 shadow-2xl backdrop-blur">
      <div className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5" onClick={onToggle}>
        <Icon size={16} className={color} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{job.title}</div>
          {!job.open && last && <div className="truncate text-xs text-muted">{last.text}</div>}
        </div>
        {secs != null && (
          <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${job.status === 'running' ? 'bg-accent/15 text-[#ff8aa1]' : 'bg-white/[.06] text-muted'}`}
            title="Tiempo desde que empezó">
            <Timer size={11} /> {fmtClock(secs)}
          </span>
        )}
        {job.status === 'running' ? (
          <button className="btn-icon size-7" title="Cancelar" onClick={(e) => { e.stopPropagation(); api.cancelJob(job.id); }}>
            <Square size={13} />
          </button>
        ) : (
          <button className="btn-icon size-7" title="Cerrar" onClick={(e) => { e.stopPropagation(); onDismiss(); }}>
            <X size={14} />
          </button>
        )}
        <ChevronDown size={16} className={`text-muted transition ${job.open ? '' : '-rotate-90'}`} />
      </div>
      {job.open && (
        <div ref={ref} className="max-h-64 overflow-y-auto border-t border-line px-3 py-2 font-mono text-[11.5px] leading-relaxed select-text">
          {job.logs.length === 0 && <div className="text-muted">Arrancando…</div>}
          {job.logs.map((l, i) => l.level === 'auth' ? (
            <div key={i} className="my-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 font-sans text-xs text-amber-100">
              {l.text}
              <button className="btn-primary mt-2 w-full py-1.5 text-xs" onClick={() => api.login()}>Iniciar sesión en Claude</button>
            </div>
          ) : (
            <div key={i} className={`whitespace-pre-wrap break-words ${LEVEL[l.level] || LEVEL.log}`}>
              {l.level === 'tool' ? '› ' : ''}{l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Jobs({ jobs, setJobs }) {
  const [hidden, setHidden] = useState(false);
  if (!jobs.length || hidden) return null;
  const upd = (id, fn) => setJobs((l) => l.map((j) => (j.id === id ? fn(j) : j)));
  return (
    <div className="pointer-events-none absolute bottom-5 right-5 z-40 flex w-[420px] flex-col gap-2">
      {jobs.slice(0, 4).map((j) => (
        <div key={j.id} className="pointer-events-auto">
          <JobCard
            job={j}
            onToggle={() => upd(j.id, (x) => ({ ...x, open: !x.open }))}
            onDismiss={() => setJobs((l) => l.filter((x) => x.id !== j.id))}
          />
        </div>
      ))}
    </div>
  );
}
