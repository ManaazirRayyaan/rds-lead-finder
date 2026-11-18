import { AlertCircle, ArrowRight, History } from 'lucide-react';
import PageHeader from '../components/PageHeader';

function Figure({ value, label, accent }) {
  return (
    <div className="panel px-5 py-5">
      <div className={`text-4xl font-semibold tracking-tight ${accent ? 'text-accent' : ''}`}>{value}</div>
      <div className="mt-1.5 text-sm text-muted">{label}</div>
    </div>
  );
}

export default function Dashboard({ status, search, recent, onRerun, go }) {
  const live = search.results;
  const without = live.filter((r) => !r.website).length;
  const label = (p) => [p.category, [p.locality, p.location].filter(Boolean).join(', ')].join(' in ');

  return (
    <>
      <PageHeader title="Dashboard">Find local businesses, save the ones worth a call, and export them for outreach.</PageHeader>

      {status.state === 'error' && (
        <div role="alert" className="mb-8 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3.5 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="font-semibold">{status.status === 401 ? 'Your session expired' : 'The server isn’t responding'}</p>
            <p className="mt-0.5 text-muted">{status.message}</p>
          </div>
        </div>
      )}
      {status.state === 'ok' && !status.google_key_configured && (
        <div role="alert" className="mb-8 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3.5 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-accent" />
          <p><span className="font-semibold">Google API key missing.</span> <span className="text-muted">Set GOOGLE_MAPS_API_KEY on the backend and restart it before searching.</span></p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Figure value={status.state === 'ok' ? status.saved_count : '–'} label="Saved leads" />
        <Figure value={search.done ? live.length : '–'} label="Businesses in your last search" />
        <Figure value={search.done ? without : '–'} label="Of those, without a website" accent />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><History size={17} className="text-muted" /> Recent searches</h2>
          {recent.length ? (
            <ul className="panel divide-y divide-line overflow-hidden">
              {recent.map((p, i) => (
                <li key={i}>
                  <button onClick={() => onRerun(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-ink/[0.04]">
                    <span>{label(p)}{p.keyword && <span className="text-muted"> · {p.keyword}</span>}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">Run again <ArrowRight size={14} /></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="panel px-5 py-10 text-center">
              <p className="font-semibold">No searches yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Your last few searches appear here so you can run them again in one click.</p>
              <button className="btn btn-primary mt-5" onClick={() => go('search')}>Start a search</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
