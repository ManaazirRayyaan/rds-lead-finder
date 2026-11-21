import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown, ExternalLink, Search as SearchIcon, SearchX, Star } from 'lucide-react';

const FILTERS = [['all', 'All'], ['with', 'With website'], ['without', 'No website']];

function Skeleton({ columns }) {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="border-t border-line">
      {Array.from({ length: columns }).map((__, j) => (
        <td key={j} className="px-4 py-4"><div className="h-3.5 rounded bg-ink/10 motion-safe:animate-pulse" style={{ width: `${55 + ((i * 7 + j * 13) % 40)}%` }} /></td>
      ))}
    </tr>
  ));
}

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

function NotesInput({ row, onNotes }) {
  const [value, setValue] = useState(row.notes || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(row.notes || ''); }, [row.key, row.notes]);

  const save = async () => {
    if (saving || value === row.notes) return;
    setSaving(true);
    try {
      await onNotes(row, value);
    } catch {
      setValue(row.notes || '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      className="field h-9"
      value={value}
      placeholder="Add a note"
      aria-label={`Notes for ${row.name || row.key}`}
      maxLength={5000}
      disabled={saving}
      aria-busy={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { void save(); }}
    />
  );
}

export default function LeadTable({ rows, selected, setSelected, savedIds, loading, onNotes, empty, actions, footer }) {
  const [q, setQ] = useState('');
  const [site, setSite] = useState('all');
  const [sort, setSort] = useState('none');
  const allRef = useRef(null);

  const live = rows.filter((r) => !r.stale && !r.error);
  const withSite = live.filter((r) => r.website).length;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (site === 'with' && !r.website) return false;
      if (site === 'without' && (r.website || r.stale || r.error)) return false;
      if (!needle) return true;
      return [r.name, r.address, r.phone, r.website, r.notes].some((v) => (v || '').toLowerCase().includes(needle));
    });
    if (sort !== 'none') {
      out = [...out].sort((a, b) => a.name.localeCompare(b.name) * (sort === 'asc' ? 1 : -1));
    }
    return out;
  }, [rows, q, site, sort]);

  const selectedVisible = visible.filter((r) => selected.has(r.key)).length;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  }, [selectedVisible, visible.length]);

  const toggle = (key) => setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (selectedVisible === visible.length) visible.forEach((r) => n.delete(r.key));
    else visible.forEach((r) => n.add(r.key));
    return n;
  });
  const SortIcon = sort === 'asc' ? ArrowDownAZ : sort === 'desc' ? ArrowUpAZ : ArrowUpDown;
  const nextSort = { none: 'asc', asc: 'desc', desc: 'none' }[sort];

  return (
    <section aria-label="Leads">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span><b className="font-semibold">{live.length}</b> <span className="text-muted">businesses</span></span>
        <span><b className="font-semibold">{withSite}</b> <span className="text-muted">with a website</span></span>
        <span><b className="font-semibold text-accent">{live.length - withSite}</b> <span className="text-muted">without</span></span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field pl-9" placeholder="Search these results" aria-label="Search within results" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Website filter">
          {FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setSite(id)} aria-pressed={site === id}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${site === id ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>{label}</button>
          ))}
        </div>
        <button className="btn h-9" onClick={() => setSort(nextSort)} aria-label={`Sort by business name: ${sort === 'none' ? 'not sorted' : sort === 'asc' ? 'ascending' : 'descending'}`}>
          <SortIcon size={16} /> Name
        </button>
        <div className="ml-auto flex items-center gap-2.5">{actions}</div>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="w-12 px-4 py-3"><input ref={allRef} type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" aria-label="Select all visible"
                  checked={visible.length > 0 && selectedVisible === visible.length} onChange={toggleAll} disabled={!visible.length} /></th>
                <th className="px-4 py-3 font-medium" aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'}>Business name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Website</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Reviews</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Google Maps</th>
                {onNotes && <th className="px-4 py-3 font-medium">Notes</th>}
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length && <Skeleton columns={onNotes ? 9 : 8} />}
              {visible.map((r) => (
                <tr key={r.key} className={`border-t border-line transition-colors hover:bg-ink/[0.03] ${selected.has(r.key) ? 'bg-accent/[0.06]' : ''}`}>
                  <td className="px-4 py-3.5"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" aria-label={`Select ${r.name || r.key}`} checked={selected.has(r.key)} onChange={() => toggle(r.key)} /></td>
                  <td className="max-w-[260px] px-4 py-3.5">
                    {r.stale ? <span className="text-muted">Listing no longer found on Google</span>
                      : r.error ? <span className="text-muted">Couldn’t load: {r.error}</span>
                      : <span className="font-semibold">{r.name}</span>}
                    {savedIds?.has(r.key) && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Saved</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {r.phone ? <a className="hover:text-accent hover:underline" href={`tel:${r.phone_tel || r.phone}`}>{r.phone}</a> : <span className="text-muted">—</span>}
                  </td>
                  <td className="max-w-[200px] px-4 py-3.5">
                    {r.website ? <a className="block truncate text-accent hover:underline" href={r.website} target="_blank" rel="noopener noreferrer" title={r.website}>{host(r.website)}</a>
                      : r.stale || r.error ? <span className="text-muted">—</span>
                      : <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">No website</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {typeof r.rating === 'number' ? (
                      <span className="inline-flex items-center gap-1.5" aria-label={`Rated ${r.rating.toFixed(1)} out of 5`}>
                        <Star size={14} className="fill-amber-500 text-amber-500" aria-hidden="true" />
                        {r.rating.toFixed(1)}
                      </span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {typeof r.review_count === 'number' ? r.review_count.toLocaleString() : <span className="text-muted">—</span>}
                  </td>
                  <td className="max-w-[300px] px-4 py-3.5 text-muted"><span className="line-clamp-2" title={r.address}>{r.address || '—'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <a className="inline-flex items-center gap-1.5 hover:text-accent hover:underline" href={r.maps_url} target="_blank" rel="noopener noreferrer">
                      Open <ExternalLink size={13} />
                    </a>
                  </td>
                  {onNotes && (
                    <td className="min-w-[200px] px-4 py-2.5">
                      <NotesInput row={r} onNotes={onNotes} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && !visible.length && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <SearchX size={28} className="text-muted" strokeWidth={1.5} />
            {rows.length ? (
              <>
                <p className="mt-4 font-semibold">No matches</p>
                <p className="mt-1 text-sm text-muted">Clear the search or website filter to see all {rows.length} results.</p>
              </>
            ) : empty}
          </div>
        )}
        <div className="border-t border-line px-4 py-3 text-xs text-muted">
          {footer || <>Business data provided by <span translate="no" className="whitespace-nowrap font-normal">Google Maps</span>.</>}
        </div>
      </div>
    </section>
  );
}
