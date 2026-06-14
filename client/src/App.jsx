// App.jsx — routing + the top navigation shell (with theme toggle).
import { useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { getTheme, toggleTheme } from './theme.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Group from './pages/Group.jsx';

export function Logo({ size = 'base' }) {
  const box = size === 'lg' ? 'h-10 w-10 text-lg' : 'h-8 w-8 text-sm';
  return (
    <div className="flex items-center gap-2.5">
      <div className={`grid ${box} place-items-center rounded-xl font-black text-ink-950 shadow-glow`}
        style={{ backgroundImage: 'linear-gradient(140deg,#5deebd,#06bd84)' }}>S</div>
      <span className="font-display text-base font-bold tracking-tight text-fg">SplitSmart</span>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme());
  return (
    <button
      onClick={() => setTheme(toggleTheme())}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      className="grid h-9 w-9 place-items-center rounded-xl border border-line/15 bg-line/[0.04] text-fg transition hover:bg-line/[0.09]">
      {theme === 'dark' ? '🌙' : '☀️'}
    </button>
  );
}

function TopBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return null;
  return (
    <header className="sticky top-0 z-20 border-b border-line/10 bg-app/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/"><Logo /></Link>
        <div className="flex items-center gap-2.5">
          <div className="mr-1 hidden items-center gap-2 sm:flex">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-500 ring-1 ring-brand-400/30">
              {user.name?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm text-muted">{user.name}</span>
          </div>
          <ThemeToggle />
          <button className="btn-ghost !py-2" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="grid h-screen place-items-center text-faint">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/groups/:id" element={<Protected><Group /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
