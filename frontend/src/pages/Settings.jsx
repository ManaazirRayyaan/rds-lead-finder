import { Check, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import PageHeader from '../components/PageHeader';

const THEMES = [['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', Monitor]];

function Row({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1.5 font-medium">{ok && <Check size={15} className="text-accent" />}{value}</span>
    </div>
  );
}

export default function Settings({ status, theme, setTheme, username, onLogout }) {
  const ok = status.state === 'ok';

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-2xl gap-6">
        <section className="panel p-5 md:p-6">
          <h2 className="font-semibold">Appearance</h2>
          <div className="mt-4 inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Theme">
            {THEMES.map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTheme(id)} aria-pressed={theme === id}
                className={`flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors ${theme === id ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel p-5 md:p-6">
          <h2 className="font-semibold">Account</h2>
          <p className="mt-1 text-sm text-muted">Signed in as <span className="font-medium text-ink">{username}</span>. Your session is stored in a secure HTTP-only cookie.</p>
          <button className="btn mt-4" onClick={onLogout}><LogOut size={16} /> Sign out</button>
        </section>

        <section className="panel px-5 py-3 md:px-6">
          <h2 className="pb-1 pt-2 font-semibold">Server</h2>
          <div className="divide-y divide-line">
            <Row label="Connection" value={ok ? 'Connected' : status.state === 'loading' ? 'Checking…' : 'Not connected'} ok={ok} />
            {ok && <Row label="Google API key" value={status.google_key_configured ? 'Configured' : 'Missing'} ok={status.google_key_configured} />}
          </div>
        </section>

        <section className="panel p-5 md:p-6">
          <h2 className="font-semibold">How saved data is handled</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Google’s Places terms only allow storing a Place ID long-term. Saved leads keep that ID and your notes. Names, phone numbers, websites and addresses are fetched live whenever you view a lead, and exports contain the Place ID, Google Maps link and your notes.
          </p>
        </section>
      </div>
    </>
  );
}
