import { useCallback, useEffect, useState } from 'react';

export const api = window.api;
export const media = (rel, v) => (rel ? `media://f/${encodeURIComponent(rel)}${v ? `?v=${Math.round(v)}` : ''}` : null);

export const fmtDur = (s) => {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
};

export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(typeof iso === 'number' ? iso : iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

// Carga una sección de la biblioteca y se refresca cuando el proceso principal avisa de cambios
export function useLibrary(section, deps = []) {
  const [items, setItems] = useState(null);
  const reload = useCallback(() => api.list(section).then(setItems), [section]);
  useEffect(() => {
    reload();
    const off = api.onChanged((s) => (s === section || (section === 'recipes' && s === 'references')) && reload());
    return off;
  }, [reload, ...deps]);
  return [items, reload];
}
