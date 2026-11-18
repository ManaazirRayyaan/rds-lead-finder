import { useEffect, useState } from 'react';
import { AlertCircle, BookmarkPlus, Loader2, MapPinned, Plus, Search as SearchIcon } from 'lucide-react';
import LeadTable from '../components/LeadTable';
import ExportMenu from '../components/ExportMenu';
import PageHeader from '../components/PageHeader';

const RADII = [['', 'Whole area'], ['1000', '1 km'], ['2000', '2 km'], ['5000', '5 km'], ['10000', '10 km'], ['25000', '25 km']];

export default function Search({ search, setSearch, runSearch, savedIds, saveLeads, notify }) {
  const [form, setForm] = useState(search.params);
  useEffect(() => { setForm(search.params); }, [search.params]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSelected = (fn) => setSearch((s) => ({ ...s, selected: typeof fn === 'function' ? fn(s.selected) : fn }));

  const submit = (e) => {
    e.preventDefault();
    runSearch(form);
  };

  const rows = search.results.map((r) => ({ ...r, key: r.place_id }));
  const selectedIds = [...search.selected];
  const ready = form.category.trim().length >= 2 && form.location.trim().length >= 2;

  return (
    <>
      <PageHeader title="Find leads">Search Google Maps by business type and place. Pick the businesses worth contacting and save them.</PageHeader>

      <form onSubmit={submit} className="panel mb-8 p-5 md:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="category">Business category</label>
            <input id="category" className="field" placeholder="Dental clinics" value={form.category} onChange={set('category')} required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="location">City</label>
            <input id="location" className="field" placeholder="Bengaluru" value={form.location} onChange={set('location')} required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="locality">Locality (optional)</label>
            <input id="locality" className="field" placeholder="HSR Layout" value={form.locality} onChange={set('locality')} />
          </div>
          <div>
            <label className="label" htmlFor="radius">Search radius</label>
            <select id="radius" className="field" value={form.radius_m} onChange={set('radius_m')}>
              {RADII.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1 sm:max-w-sm">
            <label className="label" htmlFor="keyword">Extra keyword (optional)</label>
            <input id="keyword" className="field" placeholder="orthodontist" value={form.keyword} onChange={set('keyword')} />
          </div>
          <button className="btn btn-primary h-10 px-5" disabled={!ready || search.loading}>
            {search.loading && !search.results.length ? <Loader2 size={16} className="animate-spin" /> : <SearchIcon size={16} />}
            Find leads
          </button>
        </div>
        <p className="mt-4 text-xs text-muted">A radius centres on the locality (or city) and limits results to that area. Google returns up to about 60 results per search.</p>
      </form>

      {search.error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3.5 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="font-semibold">The search didn’t go through</p>
            <p className="mt-0.5 text-muted">{search.error}</p>
          </div>
        </div>
      )}

      {(search.loading || search.done) && (
        <LeadTable
          rows={rows}
          loading={search.loading}
          selected={search.selected}
          setSelected={setSelected}
          savedIds={savedIds}
          empty={<>
            <MapPinned size={28} className="text-muted" strokeWidth={1.5} />
            <p className="mt-4 font-semibold">No businesses found</p>
            <p className="mt-1 max-w-sm text-sm text-muted">Try a broader category, check the spelling of the city, or remove the radius.</p>
          </>}
          actions={<>
            <ExportMenu notify={notify} scopes={[
              { label: 'All results', scope: 'results', count: rows.length, place_ids: rows.map((r) => r.place_id) },
              { label: 'Selected', scope: 'selected', count: selectedIds.length, place_ids: selectedIds },
            ]} />
            <button className="btn btn-primary" disabled={!selectedIds.length} onClick={() => saveLeads(selectedIds)}>
              <BookmarkPlus size={16} /> Save{selectedIds.length ? ` ${selectedIds.length}` : ''} selected
            </button>
          </>}
        />
      )}

      {search.done && search.token && (
        <div className="mt-5 flex justify-center">
          <button className="btn" disabled={search.loading} onClick={() => runSearch(search.params, true)}>
            {search.loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Load more results
          </button>
        </div>
      )}

      {!search.loading && !search.done && !search.error && (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <MapPinned size={30} className="text-muted" strokeWidth={1.5} />
          <p className="mt-4 font-semibold">Nothing searched yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted">Enter a category and a city above. Businesses without a website are marked, so they’re easy to spot.</p>
        </div>
      )}
    </>
  );
}
