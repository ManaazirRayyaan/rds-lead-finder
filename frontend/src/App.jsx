import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { api, store } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Legal from './pages/Legal';
import Login from './pages/Login';
import Search from './pages/Search';
import Saved from './pages/Saved';
import Settings from './pages/Settings';

const ROUTES = ['dashboard', 'search', 'saved', 'settings', 'terms', 'privacy'];
const EMPTY_PARAMS = { category: '', location: '', locality: '', keyword: '', radius_m: '' };

function useHash() {
  const read = () => (ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

function useTheme() {
  const [theme, setTheme] = useState(store.get('rds_theme') || 'system');
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const changed = (event) => setSystemDark(event.matches);
    setSystemDark(mq.matches);
    mq.addEventListener('change', changed);
    return () => mq.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    store.set('rds_theme', theme);
  }, [isDark, theme]);
  return [theme, setTheme, isDark];
}

export default function App() {
  const route = useHash();
  const [theme, setTheme, isDark] = useTheme();
  const [auth, setAuth] = useState({ state: 'loading', username: '', message: '' });
  const searchRequest = useRef(0);
  const mainRef = useRef(null);
  const [toast, setToast] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());
  const [status, setStatus] = useState({ state: 'loading' });
  const [search, setSearch] = useState({ params: EMPTY_PARAMS, results: [], token: null, loading: false, error: '', done: false, selected: new Set() });
  const [recent, setRecent] = useState(() => {
    try {
      const value = JSON.parse(store.get('rds_recent') || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  });

  useEffect(() => {
    const legal = route === 'terms' || route === 'privacy';
    if (auth.state === 'unauthenticated' && !legal) document.title = 'Sign in · RDS Lead Finder';
    else document.title = `${route === 'dashboard' ? 'Dashboard' : route[0].toUpperCase() + route.slice(1)} · RDS Lead Finder`;
    mainRef.current?.focus({ preventScroll: true });
  }, [auth.state, route]);

  const notify = useCallback((message, kind = 'ok') => {
    setToast({ message, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const checkAuth = useCallback(async () => {
    try {
      const user = await api('/api/auth/me');
      setAuth({ state: 'authenticated', username: user.username, message: '' });
    } catch (error) {
      setAuth({ state: 'unauthenticated', username: '', message: error.status === 401 ? '' : error.message });
    }
  }, []);
  useEffect(() => { checkAuth(); }, [checkAuth]);
  useEffect(() => {
    const unauthorized = () => setAuth({ state: 'unauthenticated', username: '', message: 'Your session expired. Sign in again.' });
    addEventListener('rds:unauthorized', unauthorized);
    return () => removeEventListener('rds:unauthorized', unauthorized);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, ids] = await Promise.all([api('/api/status'), api('/api/leads/ids')]);
      setStatus({ state: 'ok', ...s });
      setSavedIds(new Set(ids.place_ids));
    } catch (e) {
      setStatus({ state: 'error', message: e.message, status: e.status });
    }
  }, []);
  useEffect(() => {
    if (auth.state === 'authenticated') refresh();
  }, [auth.state, refresh]);

  const runSearch = useCallback(async (params, more = false) => {
    const requestId = ++searchRequest.current;
    setSearch((s) => ({ ...s, params, loading: true, error: '', ...(more ? {} : { results: [], token: null, done: false, selected: new Set() }) }));
    try {
      const data = await api('/api/search', {
        method: 'POST',
        body: {
          category: params.category.trim(), location: params.location.trim(), locality: params.locality.trim(), keyword: params.keyword.trim(),
          radius_m: params.radius_m ? Number(params.radius_m) : null,
          page_token: more ? search.token : null,
        },
      });
      if (requestId !== searchRequest.current) return;
      setSearch((s) => {
        const seen = new Set(more ? s.results.map((r) => r.place_id) : []);
        const added = data.results.filter((r) => !seen.has(r.place_id));
        return { ...s, loading: false, done: true, token: data.next_page_token, results: more ? [...s.results, ...added] : added };
      });
      if (!more) {
        const entry = { ...params };
        setRecent((current) => {
          const next = [entry, ...current.filter((r) => JSON.stringify(r) !== JSON.stringify(entry))].slice(0, 6);
          store.set('rds_recent', JSON.stringify(next));
          return next;
        });
      }
    } catch (e) {
      if (requestId !== searchRequest.current) return;
      // A failed pagination request should not discard the results that are
      // already on screen. A brand-new failed search still returns to empty.
      setSearch((s) => ({ ...s, loading: false, done: more && s.results.length > 0, error: e.message }));
    }
  }, [search.token]);

  const saveLeads = useCallback(async (ids) => {
    try {
      let added = 0, skipped = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const r = await api('/api/leads', { method: 'POST', body: { place_ids: ids.slice(i, i + 200) } });
        added += r.added; skipped += r.skipped;
      }
      notify(skipped ? `Saved ${added} new leads. ${skipped} were already saved.` : `Saved ${added} lead${added === 1 ? '' : 's'}.`);
      await refresh();
    } catch (e) { notify(e.message, 'error'); }
  }, [notify, refresh]);

  const go = (r) => { location.hash = r; };
  const rerun = (params) => { go('search'); runSearch(params); };

  const loggedIn = (user) => {
    setAuth({ state: 'authenticated', username: user.username, message: '' });
    location.hash = 'dashboard';
  };

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* clear local state even if the server is unavailable */ }
    setAuth({ state: 'unauthenticated', username: '', message: 'You have signed out.' });
    setStatus({ state: 'loading' });
    setSavedIds(new Set());
    setSearch((current) => ({ ...current, results: [], token: null, done: false, selected: new Set() }));
    location.hash = 'dashboard';
  };

  if (auth.state === 'loading') {
    return <div className="flex h-full items-center justify-center bg-bg text-sm text-muted">Checking your session…</div>;
  }

  if (auth.state === 'unauthenticated') {
    if (route === 'terms' || route === 'privacy') {
      return (
        <main className="min-h-full bg-bg px-5 py-8 md:px-10">
          <div className="mx-auto max-w-3xl">
            <a href="#dashboard" className="mb-7 inline-flex text-sm text-accent hover:underline">← Back to sign in</a>
            <Legal type={route} />
          </div>
        </main>
      );
    }
    return <Login onLoggedIn={loggedIn} message={auth.message} />;
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar route={route} setTheme={setTheme} isDark={isDark} onLogout={logout} />
      <main ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto pb-20 outline-none md:pb-0">
        <div className="mx-auto max-w-[1280px] px-5 py-8 md:px-10 md:py-10">
          {route === 'dashboard' && <Dashboard status={status} search={search} recent={recent} onRerun={rerun} go={go} />}
          {route === 'search' && <Search search={search} setSearch={setSearch} runSearch={runSearch} savedIds={savedIds} saveLeads={saveLeads} notify={notify} />}
          {route === 'saved' && <Saved notify={notify} onChanged={refresh} />}
          {route === 'settings' && <Settings status={status} theme={theme} setTheme={setTheme} username={auth.username} onLogout={logout} />}
          {route === 'terms' && <Legal type="terms" />}
          {route === 'privacy' && <Legal type="privacy" />}
          <footer className="mt-14 flex gap-4 border-t border-line pt-5 text-xs text-muted">
            <a href="#terms" className="hover:text-ink hover:underline">Terms of use</a>
            <a href="#privacy" className="hover:text-ink hover:underline">Privacy policy</a>
          </footer>
        </div>
      </main>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
        {toast && (
          <div key={toast.id} className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lg">
            {toast.kind === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-accent" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" />}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
