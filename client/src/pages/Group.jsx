// Group.jsx — the main workspace for one group (theme-aware).
// Tabs: Balances · Expenses · Members · Settle up · Chat · Import.
// It owns the data (group detail + balances) and passes a `reload` down so any
// child action refreshes everything consistently.
import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR, prettyDate } from '../lib.js';
import Modal from '../components/Modal.jsx';
import ImportWizard from './ImportWizard.jsx';

const TABS = ['Balances', 'Expenses', 'Members', 'Settle up', 'Chat', 'Import CSV'];

// deterministic avatar gradient per name
function avatarStyle(name) {
  const grads = [
    'linear-gradient(140deg,#06bd84,#0a6048)', 'linear-gradient(140deg,#3b82f6,#1e3a8a)',
    'linear-gradient(140deg,#a855f7,#5b21b6)', 'linear-gradient(140deg,#f59e0b,#b45309)',
    'linear-gradient(140deg,#ec4899,#9d174d)', 'linear-gradient(140deg,#14b8a6,#0f766e)',
  ];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % grads.length;
  return { backgroundImage: grads[h] };
}
const Avatar = ({ name }) => (
  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-ink-950" style={avatarStyle(name)}>
    {name[0]?.toUpperCase()}
  </div>
);

export default function Group() {
  const { id } = useParams();
  const [tab, setTab] = useState('Balances');
  const [detail, setDetail] = useState(null);
  const [balances, setBalances] = useState(null);
  const [err, setErr] = useState('');

  const reload = () => Promise.all([
    api.get(`/api/groups/${id}`).then(setDetail),
    api.get(`/api/groups/${id}/balances`).then(setBalances),
  ]).catch((e) => setErr(e.message));

  useEffect(() => { reload(); }, [id]);

  if (err) return <main className="mx-auto max-w-6xl px-4 py-8 text-rose-500">{err}</main>;
  if (!detail || !balances) return <main className="mx-auto max-w-6xl px-4 py-8 text-faint">Loading…</main>;

  return (
    <main className="mx-auto max-w-6xl animate-fadeUp px-4 py-8">
      <Link to="/" className="text-sm text-faint transition hover:text-fg">← All groups</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg">{detail.group.name}</h1>

      {/* tab bar */}
      <div className="mt-6 flex flex-wrap gap-1 rounded-2xl border border-line/10 bg-line/[0.03] p-1.5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === t ? 'bg-line/10 text-fg shadow-soft' : 'text-muted hover:text-fg'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'Balances' && <BalancesTab id={id} detail={detail} balances={balances} />}
        {tab === 'Expenses' && <ExpensesTab id={id} detail={detail} reload={reload} />}
        {tab === 'Members' && <MembersTab id={id} detail={detail} reload={reload} />}
        {tab === 'Settle up' && <SettleTab id={id} detail={detail} balances={balances} reload={reload} />}
        {tab === 'Chat' && <ChatTab id={id} />}
        {tab === 'Import CSV' && <ImportWizard id={id} detail={detail} reload={reload} onDone={() => setTab('Balances')} />}
      </div>
    </main>
  );
}

/* ---------------------------- Balances tab ---------------------------- */
function BalancesTab({ id, detail, balances }) {
  const [breakdown, setBreakdown] = useState(null);
  const totalSpent = detail.expenses.filter((e) => !e.is_refund).reduce((a, e) => a + e.amount_inr_minor, 0);
  const owedCount = balances.balances.filter((b) => b.netMinor < 0).length;

  const openBreakdown = async (m) => {
    const data = await api.get(`/api/groups/${id}/members/${m.memberId}/breakdown`);
    setBreakdown({ member: m, ...data });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Total spent" value={formatINR(totalSpent)} />
          <Stat label="Members" value={balances.balances.length} />
          <Stat label="Still owing" value={owedCount} tone="neg" />
        </div>

        <h2 className="mb-3 px-1 font-bold text-fg">Net balances <span className="text-faint">· tap to see every line</span></h2>
        <div className="card divide-hair overflow-hidden">
          {balances.balances.map((b) => {
            const owes = b.netMinor < 0;
            const settled = b.netMinor === 0;
            return (
              <button key={b.memberId} onClick={() => openBreakdown(b)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-line/[0.05]">
                <div className="flex items-center gap-3">
                  <Avatar name={b.name} />
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-fg">{b.name}
                      {b.is_guest ? <span className="chip bg-line/10 text-muted">guest</span> : null}
                      {b.left_at ? <span className="chip bg-amber-500/15 text-amber-600 dark:text-amber-300">left {prettyDate(b.left_at)}</span> : null}
                    </div>
                    <div className="text-xs text-faint">View breakdown →</div>
                  </div>
                </div>
                <div className={`nums text-right text-base font-bold ${settled ? 'text-faint' : owes ? 'text-neg' : 'text-pos'}`}>
                  {settled ? 'settled up' : owes ? `owes ${formatINR(-b.netMinor)}` : `gets ${formatINR(b.netMinor)}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 px-1 font-bold text-fg">Settle-up plan</h2>
        <div className="card p-5">
          <p className="mb-4 text-xs text-muted">Fewest transfers to clear all debts.</p>
          {balances.transfers.length === 0 && <p className="text-sm text-faint">Everyone is settled up. 🎉</p>}
          <ul className="space-y-2.5">
            {balances.transfers.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-line/10 bg-line/[0.03] px-3.5 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-fg">{t.from}</span>
                  <span className="text-brand-500">→</span>
                  <span className="font-semibold text-fg">{t.to}</span>
                </span>
                <span className="nums font-bold text-fg">{formatINR(t.amountMinor)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* breakdown modal — Rohan's "no magic numbers" */}
      <Modal open={!!breakdown} onClose={() => setBreakdown(null)} wide
        title={breakdown ? `${breakdown.member.name} — every line` : ''}>
        {breakdown && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
                  <tr><th className="py-2">Date</th><th>Item</th><th className="text-right">Paid</th><th className="text-right">Owed</th><th className="text-right">Effect</th></tr>
                </thead>
                <tbody className="divide-hair">
                  {breakdown.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap py-2.5 text-muted">{prettyDate(l.date)}</td>
                      <td className="text-fg">{l.description}{l.type === 'settlement' && <span className="chip ml-1 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">settlement</span>}</td>
                      <td className="nums text-right text-muted">{l.paidMinor ? formatINR(l.paidMinor) : '—'}</td>
                      <td className="nums text-right text-muted">{l.owedMinor ? formatINR(l.owedMinor) : '—'}</td>
                      <td className={`nums text-right font-semibold ${l.effectMinor >= 0 ? 'text-pos' : 'text-neg'}`}>{formatINR(l.effectMinor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line/15 font-bold">
                    <td className="py-2.5 text-fg" colSpan={4}>Net</td>
                    <td className={`nums text-right ${breakdown.totalMinor >= 0 ? 'text-pos' : 'text-neg'}`}>{formatINR(breakdown.totalMinor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-faint">Positive = the group owes them; negative = they owe the group. These lines sum to the net balance exactly.</p>
          </>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }) {
  const tones = { default: 'text-fg', neg: 'text-neg', pos: 'text-pos' };
  return (
    <div className="card p-4">
      <div className={`nums text-xl font-extrabold ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

/* ---------------------------- Expenses tab ---------------------------- */
function ExpensesTab({ id, detail, reload }) {
  const [open, setOpen] = useState(false);
  const del = async (eid) => { if (confirm('Delete this expense?')) { await api.del(`/api/groups/${id}/expenses/${eid}`); reload(); } };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-fg">Expenses <span className="nums text-faint">({detail.expenses.length})</span></h2>
        <button className="btn-primary" onClick={() => setOpen(true)}>+ Add expense</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line/10 text-left text-[11px] uppercase tracking-wider text-faint">
            <tr><th className="px-5 py-3">Date</th><th>Description</th><th>Paid by</th><th>Split</th><th className="text-right">Amount</th><th></th></tr>
          </thead>
          <tbody className="divide-hair">
            {detail.expenses.map((e) => (
              <tr key={e.id} className="transition hover:bg-line/[0.04]">
                <td className="whitespace-nowrap px-5 py-3 text-muted">{prettyDate(e.date)}</td>
                <td className="max-w-xs">
                  <div className="font-medium text-fg">{e.description}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {e.source === 'import' && <span className="chip bg-line/10 text-muted">imported</span>}
                    {!!e.is_refund && <span className="chip bg-sky-500/15 text-sky-600 dark:text-sky-300">refund</span>}
                    {e.currency !== 'INR' && <span className="chip bg-violet-500/15 text-violet-600 dark:text-violet-300">{e.currency}→INR</span>}
                  </div>
                </td>
                <td className="text-muted">{e.paid_by_name}</td>
                <td><span className="chip bg-brand-500/15 text-brand-600 dark:text-brand-300">{e.split_type}</span> <span className="nums text-xs text-faint">{e.splits.length}p</span></td>
                <td className="nums text-right font-semibold text-fg">
                  {formatINR(e.amount_inr_minor)}
                  {e.currency !== 'INR' && <div className="text-xs font-normal text-faint">{(e.amount_minor/100).toLocaleString()} {e.currency}</div>}
                </td>
                <td className="pr-4 text-right"><button className="text-faint transition hover:text-neg" onClick={() => del(e.id)}>✕</button></td>
              </tr>
            ))}
            {detail.expenses.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-faint">No expenses yet. Add one, or import the CSV.</td></tr>}
          </tbody>
        </table>
      </div>
      <AddExpense id={id} detail={detail} open={open} onClose={() => setOpen(false)} reload={reload} />
    </div>
  );
}

function AddExpense({ id, detail, open, onClose, reload }) {
  const active = detail.members;
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), description: '', paidBy: '', amount: '', currency: 'INR', splitType: 'equal' });
  const [parts, setParts] = useState({});
  const [vals, setVals] = useState({});
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (mid) => setParts({ ...parts, [mid]: !parts[mid] });

  async function submit(e) {
    e.preventDefault(); setErr('');
    try {
      const chosen = active.filter((m) => parts[m.id]);
      if (!f.paidBy) throw new Error('Choose who paid');
      if (!chosen.length) throw new Error('Pick at least one participant');
      let detailsRaw = '';
      if (f.splitType !== 'equal') detailsRaw = chosen.map((m) => `${m.name} ${vals[m.id] ?? 0}`).join('; ');
      await api.post(`/api/groups/${id}/expenses`, {
        ...f, paidBy: Number(f.paidBy), participants: chosen.map((m) => m.id), detailsRaw,
      });
      onClose(); reload();
      setF({ ...f, description: '', amount: '' }); setParts({}); setVals({});
    } catch (e) { setErr(e.message); }
  }

  const unit = { unequal: '₹', percentage: '%', share: '×' }[f.splitType];

  return (
    <Modal open={open} onClose={onClose} title="Add expense" wide>
      <form onSubmit={submit} className="space-y-4">
        {err && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500 dark:text-rose-300">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Date</label><input type="date" className="input nums" value={f.date} onChange={set('date')} required /></div>
          <div><label className="label">Paid by</label>
            <select className="input" value={f.paidBy} onChange={set('paidBy')} required>
              <option value="">Select…</option>
              {active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Description</label><input className="input" value={f.description} onChange={set('description')} placeholder="Groceries" required /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Amount</label><input className="input nums" value={f.amount} onChange={set('amount')} placeholder="1200" required /></div>
          <div><label className="label">Currency</label>
            <select className="input" value={f.currency} onChange={set('currency')}><option>INR</option><option>USD</option></select>
          </div>
          <div><label className="label">Split type</label>
            <select className="input" value={f.splitType} onChange={set('splitType')}>
              <option value="equal">equal</option><option value="unequal">unequal</option>
              <option value="percentage">percentage</option><option value="share">share</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Participants {f.splitType !== 'equal' && <span className="text-faint">· enter {f.splitType} value each</span>}</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {active.map((m) => (
              <label key={m.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${parts[m.id] ? 'border-brand-400/50 bg-brand-500/10' : 'border-line/10 bg-line/[0.03] hover:border-line/20'}`}>
                <input type="checkbox" className="accent-brand-500" checked={!!parts[m.id]} onChange={() => toggle(m.id)} />
                <span className="grow text-fg">{m.name}</span>
                {parts[m.id] && f.splitType !== 'equal' && (
                  <input className="nums w-16 rounded-lg border border-line/10 bg-inset px-1.5 py-0.5 text-right text-xs text-fg"
                    value={vals[m.id] ?? ''} onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })} placeholder={unit} />
                )}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">Save expense</button></div>
      </form>
    </Modal>
  );
}

/* ---------------------------- Members tab ---------------------------- */
function MembersTab({ id, detail, reload }) {
  const [f, setF] = useState({ name: '', joined_at: '', left_at: '', is_guest: false });
  const add = async (e) => { e.preventDefault(); await api.post(`/api/groups/${id}/members`, f); setF({ name: '', joined_at: '', left_at: '', is_guest: false }); reload(); };
  const saveDates = async (m, joined_at, left_at) => { await api.patch(`/api/groups/${id}/members/${m.id}`, { joined_at, left_at }); reload(); };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h2 className="mb-3 px-1 font-bold text-fg">Members & tenure</h2>
        <div className="card divide-hair overflow-hidden">
          {detail.members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <Avatar name={m.name} />
              <div className="grow font-semibold text-fg">{m.name}{!!m.is_guest && <span className="chip ml-2 bg-line/10 text-muted">guest</span>}</div>
              <label className="text-xs text-faint">joined <input type="date" defaultValue={m.joined_at || ''} className="input nums mt-1 !w-36 !py-1.5" onBlur={(e) => saveDates(m, e.target.value, m.left_at)} /></label>
              <label className="text-xs text-faint">left <input type="date" defaultValue={m.left_at || ''} className="input nums mt-1 !w-36 !py-1.5" onBlur={(e) => saveDates(m, m.joined_at, e.target.value)} /></label>
            </div>
          ))}
          {detail.members.length === 0 && <p className="px-5 py-10 text-center text-faint">No members yet.</p>}
        </div>
        <p className="mt-2 px-1 text-xs text-faint">Tenure powers Sam's rule: someone is only on an expense if it falls within their join→leave window.</p>
      </div>
      <div>
        <h2 className="mb-3 px-1 font-bold text-fg">Add member</h2>
        <form onSubmit={add} className="card space-y-3 p-5">
          <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div><label className="label">Joined</label><input type="date" className="input nums" value={f.joined_at} onChange={(e) => setF({ ...f, joined_at: e.target.value })} /></div>
          <div><label className="label">Left</label><input type="date" className="input nums" value={f.left_at} onChange={(e) => setF({ ...f, left_at: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-brand-500" checked={f.is_guest} onChange={(e) => setF({ ...f, is_guest: e.target.checked })} /> Guest (short-term)</label>
          <button className="btn-primary w-full">Add member</button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------- Settle up tab ---------------------------- */
function SettleTab({ id, detail, balances, reload }) {
  const [f, setF] = useState({ from_member: '', to_member: '', amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr('');
    try { await api.post(`/api/groups/${id}/settlements`, { ...f, from_member: Number(f.from_member), to_member: Number(f.to_member) }); setF({ ...f, amount: '', note: '' }); reload(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 px-1 font-bold text-fg">Record a payment</h2>
        <form onSubmit={submit} className="card space-y-3 p-5">
          {err && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500 dark:text-rose-300">{err}</div>}
          {balances.transfers[0] && (
            <button type="button" className="w-full rounded-xl border border-brand-400/30 bg-brand-500/10 px-3.5 py-2.5 text-left text-sm text-brand-700 transition hover:bg-brand-500/20 dark:text-brand-200"
              onClick={() => { const t = balances.transfers[0]; const from = detail.members.find((m)=>m.name===t.from), to = detail.members.find((m)=>m.name===t.to); setF({ ...f, from_member: from?.id||'', to_member: to?.id||'', amount: (t.amountMinor/100).toString() }); }}>
              💡 Suggested: {balances.transfers[0].from} pays {balances.transfers[0].to} {formatINR(balances.transfers[0].amountMinor)} — tap to fill
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">From</label><select className="input" value={f.from_member} onChange={set('from_member')} required><option value="">…</option>{detail.members.map((m)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label className="label">To</label><select className="input" value={f.to_member} onChange={set('to_member')} required><option value="">…</option>{detail.members.map((m)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Amount (₹)</label><input className="input nums" value={f.amount} onChange={set('amount')} required /></div>
            <div><label className="label">Date</label><input type="date" className="input nums" value={f.date} onChange={set('date')} required /></div>
          </div>
          <div><label className="label">Note</label><input className="input" value={f.note} onChange={set('note')} placeholder="UPI / cash…" /></div>
          <button className="btn-primary w-full">Record payment</button>
        </form>
      </div>
      <div>
        <h2 className="mb-3 px-1 font-bold text-fg">Settlement history</h2>
        <div className="card divide-hair overflow-hidden">
          {detail.settlements.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
              <div><span className="font-semibold text-fg">{s.from_name}</span> <span className="text-brand-500">→</span> <span className="font-semibold text-fg">{s.to_name}</span><div className="text-xs text-faint">{prettyDate(s.date)} {s.note ? `· ${s.note}` : ''} {s.source==='import' && '· imported'}</div></div>
              <span className="nums font-bold text-fg">{formatINR(s.amount_inr_minor)}</span>
            </div>
          ))}
          {detail.settlements.length === 0 && <p className="px-5 py-10 text-center text-faint">No payments recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Chat tab ---------------------------- */
function ChatTab({ id }) {
  const [msgs, setMsgs] = useState([]);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const endRef = useRef(null);
  const firstLoad = useRef(true);

  const load = () => api.get(`/api/groups/${id}/messages`).then(setMsgs).catch((e) => setErr(e.message));

  // initial load + light polling so new messages appear without a refresh
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: firstLoad.current ? 'auto' : 'smooth' });
    firstLoad.current = false;
  }, [msgs]);

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody('');
    try { await api.post(`/api/groups/${id}/messages`, { body: text }); load(); }
    catch (e) { setErr(e.message); }
  }

  const time = (s) => { const d = new Date((s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-3 px-1 font-bold text-fg">Group chat</h2>
      <div className="card flex h-[60vh] flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {msgs.length === 0 && <p className="grid h-full place-items-center text-sm text-faint">No messages yet. Say hi 👋</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? 'bg-brand-500 text-ink-950' : 'border border-line/10 bg-line/[0.04] text-fg'}`}>
                {!m.mine && <div className="mb-0.5 text-xs font-semibold text-brand-600 dark:text-brand-300">{m.author}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-0.5 text-right text-[10px] ${m.mine ? 'text-ink-950/60' : 'text-faint'}`}>{time(m.created_at)}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="flex items-center gap-2 border-t border-line/10 p-3">
          <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message the group…" />
          <button className="btn-primary shrink-0">Send</button>
        </form>
      </div>
      {err && <p className="mt-2 text-sm text-rose-500 dark:text-rose-300">{err}</p>}
    </div>
  );
}
