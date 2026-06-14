// Login.jsx — combined sign-in / sign-up screen (theme-aware).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Logo, ThemeToggle } from '../App.jsx';

export default function Login() {
  const { login, register, user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) { nav('/'); return null; }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      nav('/');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 top-10 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl animate-pulseGlow" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
        <Logo size="lg" />
        <div className="relative">
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-fg">
            Shared expenses,<br /><span className="grad-text">settled smart.</span>
          </h1>
          <p className="mt-5 max-w-md text-muted">
            Track who paid what, split it any way, and settle up in the fewest
            transfers. Import a messy spreadsheet and we flag every anomaly
            before a single rupee is saved.
          </p>
          <div className="mt-8 grid max-w-md gap-3">
            {[
              ['Every split type', 'Equal · unequal · percentage · share'],
              ['Multi-currency', '₹ / $ with documented conversion'],
              ['Reviewable import', 'Detects anomalies — never silently guesses'],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-3 rounded-xl border border-line/10 bg-line/[0.03] p-3">
                <div className="mt-0.5 grid h-6 w-6 place-items-center rounded-lg bg-brand-500/20 text-brand-500">✓</div>
                <div><div className="text-sm font-semibold text-fg">{t}</div><div className="text-xs text-muted">{d}</div></div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-faint">Built for the Spreetail assignment.</p>
      </div>

      {/* Right: form */}
      <div className="relative flex items-center justify-center p-6">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <form onSubmit={submit} className="card w-full max-w-sm animate-fadeUp p-8">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold text-fg">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === 'login' ? 'Sign in to manage your groups.' : 'Start tracking shared expenses.'}
          </p>

          {err && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500 dark:text-rose-300">{err}</div>}

          {mode === 'register' && (
            <div className="mt-5">
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={set('name')} placeholder="Aisha" required />
            </div>
          )}
          <div className="mt-4">
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@flat.com" required />
          </div>
          <div className="mt-4">
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••" required />
          </div>

          <button className="btn-primary mt-6 w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="mt-5 text-center text-sm text-muted">
            {mode === 'login' ? "No account yet? " : 'Already have an account? '}
            <button type="button" className="font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
