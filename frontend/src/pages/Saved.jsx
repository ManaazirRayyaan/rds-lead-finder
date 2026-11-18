import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bookmark, ChevronLeft, ChevronRight, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api';
import LeadTable from '../components/LeadTable';
import ExportMenu from '../components/ExportMenu';
import PageHeader from '../components/PageHeader';

export default function Saved({ notify, onChanged }) {
  const [size, setSize] = useState(25);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [], offset: 0, size: 25 });
  const [state, setState] = useState({ loading: true, error: '' });
  const [selected, setSelected] = useState(new Set());
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setState({ loading: true, error: '' });
    try {
      const d = await api(`/api/leads?limit=${size}&offset=${offset}`);
      if (requestId !== loadRequest.current) return;
      if (!d.items.length && offset > 0) { setOffset(Math.max(0, offset - size)); return; }
      setData({ ...d, offset, size });
      setState({ loading: false, error: '' });
    } catch (e) {
      if (requestId === loadRequest.current) setState({ loading: false, error: e.message });
    }
  }, [size, offset]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => data.items.map((it) => ({
    key: it.place_id, id: it.id, notes: it.notes, stale: !!it.stale, error: it.error,
    place_id: it.place_id, name: it.place?.name || '', phone: it.place?.phone || '', phone_tel: it.place?.phone_tel || '',
    website: it.place?.website || '', address: it.place?.address || '',
    maps_url: it.place?.maps_url || `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(it.place_id)}`,
  })), [data]);

  const saveNote = async (row, text) => {
    try {
      await api(`/api/leads/${row.id}`, { method: 'PATCH', body: { notes: text } });
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === row.id ? { ...i, notes: text } : i)) }));
    } catch (e) {
      notify(e.message, 'error');
      throw e;
    }
  };

  const removeSelected = async () => {
    const ids = rows.filter((r) => selected.has(r.key)).map((r) => r.id);
    if (!ids.length || !confirm(`Remove ${ids.length} saved lead${ids.length === 1 ? '' : 's'}? Your notes on them are deleted too.`)) return;
    try {
      await api('/api/leads/bulk-delete', { method: 'POST', body: { ids } });
      notify(`Removed ${ids.length} lead${ids.length === 1 ? '' : 's'}.`);
      setSelected(new Set());
      await load();
      onChanged();
    } catch (e) { notify(e.message, 'error'); }
  };

  const picked = rows.filter((r) => selected.has(r.key)).map((r) => r.place_id);
  const from = data.total ? data.offset + 1 : 0;
  const to = Math.min(data.offset + data.size, data.total);

  return (
    <>
      <PageHeader title="Saved leads">Your shortlist. Business details are fetched live from Google whenever this page loads.</PageHeader>

      {state.error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3.5 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="flex-1">
            <p className="font-semibold">Couldn’t load saved leads</p>
            <p className="mt-0.5 text-muted">{state.error}</p>
          </div>
          <button className="btn h-8" onClick={load}>Try again</button>
        </div>
      )}

      {(data.total > 0 || state.loading) ? (
        <>
          <LeadTable
            rows={rows}
            loading={state.loading}
            selected={selected}
            setSelected={setSelected}
            onNotes={saveNote}
            footer={<>Business data provided by <span translate="no" className="whitespace-nowrap font-normal">Google Maps</span>. Search, filter and sort apply to the leads on this page.</>}
            empty={null}
            actions={<>
              <button className="btn" onClick={load} disabled={state.loading} aria-label="Refresh from Google">
                {state.loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              </button>
              <ExportMenu notify={notify} scopes={[
                { label: 'All saved', scope: 'saved', count: data.total },
                { label: 'Selected', scope: 'selected', count: picked.length, place_ids: picked },
              ]} />
              <button className="btn" disabled={!picked.length} onClick={removeSelected}>
                <Trash2 size={16} /> Remove{picked.length ? ` ${picked.length}` : ''}
              </button>
            </>}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>{from}–{to} of {data.total}</span>
            <div className="flex items-center gap-2">
              <label htmlFor="size" className="sr-only">Leads per page</label>
              <select id="size" className="field h-9 w-auto" value={size} disabled={state.loading} onChange={(e) => { setSize(Number(e.target.value)); setOffset(0); setSelected(new Set()); }}>
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n} per page</option>)}
              </select>
              <button className="btn h-9 px-2.5" aria-label="Previous page" disabled={offset === 0 || state.loading} onClick={() => { setOffset(Math.max(0, offset - size)); setSelected(new Set()); }}><ChevronLeft size={16} /></button>
              <button className="btn h-9 px-2.5" aria-label="Next page" disabled={offset + size >= data.total || state.loading} onClick={() => { setOffset(offset + size); setSelected(new Set()); }}><ChevronRight size={16} /></button>
            </div>
          </div>
        </>
      ) : !state.error && (
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <Bookmark size={30} className="text-muted" strokeWidth={1.5} />
          <p className="mt-4 font-semibold">No saved leads yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted">Run a search, tick the businesses you want to contact, and choose Save selected.</p>
          <a href="#search" className="btn btn-primary mt-6">Find leads</a>
        </div>
      )}
    </>
  );
}
