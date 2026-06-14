// Dashboard.jsx — list of the user's groups + create new ones (theme-aware).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Dashboard() {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get('/api/groups').then(setGroups).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function create(seedRoster) {
    setBusy(true); setErr('');
    try {
      const groupName = seedRoster ? (name.trim() || 'Flat 4B') : name.trim();
      if (!groupName) throw new Error('Enter a group name');
      await api.post('/api/groups', { name: groupName, seedRoster });
      setName('');
      load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const gradients = [
    'linear-gradient(140deg,#06bd84,#0a6048)', 'linear-gradient(140deg,#3b82f6,#1e3a8a)',
    'linear-gradient(140deg,#a855f7,#5b21b6)', 'linear-gradient(140deg,#f59e0b,#b45309)',
    'linear-gradient(140deg,#ec4899,#9d174d)', 'linear-gradient(140deg,#14b8a6,#0f766e)',
  ];

  return (
    <main className="mx-auto max-w-6xl animate-fadeUp px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-fg">Your groups</h1>
        <p className="mt-1 text-sm text-muted">Create a group, add members, and split expenses.</p>
      </div>

      <div className="card mt-7 flex flex-wrap items-end gap-3 p-5">
        <div className="grow">
          <label className="label">New group name</label>
          <input className="input" placeholder="Flat 4B / Goa Trip / …" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create(false)} />
        </div>
        <button className="btn-primary" disabled={busy} onClick={() => create(false)}>Create group</button>
        <button className="btn-ghost" disabled={busy} onClick={() => create(true)} title="Seeds Aisha, Rohan, Priya, Meera (left Mar), Dev (guest), Sam (joined Apr)">
          ✨ Create demo flat
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-rose-500 dark:text-rose-300">{err}</p>}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g, i) => (
          <Link key={g.id} to={`/groups/${g.id}`} className="card card-hover group relative overflow-hidden p-5">
            <div className="flex items-start justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-xl text-lg font-black text-ink-950 shadow-glow" style={{ backgroundImage: gradients[i % gradients.length] }}>
                {g.name[0]?.toUpperCase()}
              </div>
              <span className="text-faint transition group-hover:translate-x-1 group-hover:text-brand-500">→</span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-fg">{g.name}</h3>
            <div className="mt-2 flex items-center gap-3 text-sm text-muted">
              <span className="nums">{g.memberCount} members</span>
              <span className="text-line/20">•</span>
              <span className="nums">{g.expenseCount} expenses</span>
            </div>
          </Link>
        ))}
        {groups.length === 0 && (
          <div className="card col-span-full grid place-items-center p-14 text-center">
            <div className="text-4xl">📊</div>
            <p className="mt-3 max-w-sm text-muted">
              No groups yet. Create one above — or click <b className="text-brand-600 dark:text-brand-300">Create demo flat</b> to load the assignment scenario, ready to import the CSV.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
