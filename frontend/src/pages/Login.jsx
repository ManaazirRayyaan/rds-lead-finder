import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, LockKeyhole } from 'lucide-react';
import { api } from '../api';
import logo from '../logo.png';

export default function Login({ onLoggedIn, message = '' }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ loading: false, error: message });

  useEffect(() => { document.title = 'Sign in · RDS Lead Finder'; }, []);
  useEffect(() => { setState((current) => ({ ...current, error: message })); }, [message]);

  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: '' });
    try {
      const user = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      setPassword('');
      onLoggedIn(user);
    } catch (error) {
      setState({ loading: false, error: error.message });
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center justify-center gap-3">
          <img src={logo} alt="" className="h-11 w-11 object-contain" />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">RDS Lead Finder</div>
            <div className="text-xs text-muted">Rayyaan Digital Studio</div>
          </div>
        </div>

        <section className="panel p-6 shadow-sm md:p-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <LockKeyhole size={20} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">This private workspace is available only to its administrator.</p>

          {state.error && (
            <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-lg border border-accent/30 bg-accent/5 px-3.5 py-3 text-sm">
              <AlertCircle size={17} className="mt-0.5 shrink-0 text-accent" />
              <span>{state.error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="login-username">Username</label>
              <input id="login-username" className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <input id="login-password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required maxLength={1024} />
            </div>
            <button className="btn btn-primary h-10 w-full" disabled={state.loading || !username.trim() || !password}>
              {state.loading ? <Loader2 size={17} className="animate-spin" /> : <LockKeyhole size={17} />}
              {state.loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>

        <div className="mt-5 flex justify-center gap-4 text-xs text-muted">
          <a href="#terms" className="hover:text-ink hover:underline">Terms of use</a>
          <a href="#privacy" className="hover:text-ink hover:underline">Privacy policy</a>
        </div>
      </div>
    </main>
  );
}
