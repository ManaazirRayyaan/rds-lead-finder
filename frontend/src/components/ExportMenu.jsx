import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import { downloadExport } from '../api';

/** scopes: [{ label, scope, count, place_ids? }] */
export default function ExportMenu({ scopes, notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', esc); };
  }, [open]);

  const run = async (s, format) => {
    setBusy(true);
    try {
      await downloadExport({ format, scope: s.scope, place_ids: s.place_ids || [] });
      notify(`Exported ${s.count} lead${s.count === 1 ? '' : 's'} as ${format === 'csv' ? 'CSV' : 'Excel'}.`);
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    } catch (e) { notify(e.message, 'error'); }
    setBusy(false);
  };

  return (
    <div ref={ref} className="relative">
      <button ref={triggerRef} className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="export-options">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Export
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div id="export-options" className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          {scopes.map((s) => (
            <div key={s.scope} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
              <div className={`text-sm ${s.count ? '' : 'text-muted'}`}>
                {s.label} <span className="text-muted">({s.count})</span>
              </div>
              <div className="flex gap-1.5">
                <button className="btn h-8 px-2.5 text-xs" disabled={!s.count || busy} onClick={() => run(s, 'csv')}>CSV</button>
                <button className="btn h-8 px-2.5 text-xs" disabled={!s.count || busy} onClick={() => run(s, 'xlsx')}>Excel</button>
              </div>
            </div>
          ))}
          <p className="border-t border-line px-3 pb-2 pt-2.5 text-xs leading-relaxed text-muted">
            Files contain the Place ID, Google Maps link and your notes. Google’s terms don’t allow exporting business names, phones or addresses.
          </p>
        </div>
      )}
    </div>
  );
}
