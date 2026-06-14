// ImportWizard.jsx — the CSV import experience (theme-aware).
// Flow:  pick file  ->  DRY-RUN analysis (nothing saved)  ->  review every
// anomaly + planned action  ->  approve & commit. Nothing is written until the
// user clicks "Approve & import" (Meera's approval gate).
import { useState } from 'react';
import { api } from '../api.js';
import { formatINR, prettyDate, SEV_STYLE, PLAN_STYLE } from '../lib.js';

export default function ImportWizard({ id, reload, onDone }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const r = new FileReader();
    r.onload = () => setCsv(String(r.result));
    r.readAsText(file);
  }

  async function analyze() {
    setBusy(true); setErr(''); setAnalysis(null); setDone(null);
    try { setAnalysis(await api.post(`/api/groups/${id}/import/analyze`, { csv })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true); setErr('');
    try { const r = await api.post(`/api/groups/${id}/import/commit`, { analysis }); setDone(r); reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const rows = analysis?.rows || [];
  const shown = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'review') return r.anomalies.some((a) => a.severity === 'review');
    if (filter === 'skipped') return r.plan.action === 'skip';
    return r.anomalies.length > 0;
  });

  return (
    <div className="animate-fadeUp">
      {/* step 1: upload */}
      {!analysis && (
        <div className="card p-6">
          <h2 className="text-lg font-bold text-fg">Import expenses_export.csv</h2>
          <p className="mt-1 text-sm text-muted">
            Upload the file exactly as exported. We'll dry-run it and surface every problem — <b className="text-fg">nothing is saved until you approve.</b>
          </p>
          <div className="mt-5 rounded-2xl border-2 border-dashed border-line/15 bg-line/[0.03] p-10 text-center transition hover:border-brand-400/40">
            <div className="mb-3 text-3xl">📄</div>
            <input id="csvfile" type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <label htmlFor="csvfile" className="btn-primary cursor-pointer">Choose CSV file</label>
            {fileName && <p className="mt-3 text-sm text-brand-600 dark:text-brand-300">✓ {fileName}</p>}
            <p className="mt-2 text-xs text-faint">or paste below</p>
          </div>
          <textarea className="input mt-4 h-28 font-mono text-xs" placeholder="date,description,paid_by,amount,…" value={csv} onChange={(e) => setCsv(e.target.value)} />
          {err && <p className="mt-2 text-sm text-rose-500 dark:text-rose-300">{err}</p>}
          <button className="btn-primary mt-4" disabled={busy || !csv.trim()} onClick={analyze}>{busy ? 'Analysing…' : 'Analyse CSV →'}</button>
        </div>
      )}

      {/* step 2: review */}
      {analysis && (
        <div>
          {done ? (
            <div className="card mb-4 flex items-center justify-between border-brand-400/30 bg-brand-500/10 p-5">
              <div>
                <p className="font-bold text-brand-600 dark:text-brand-200">Import complete ✓</p>
                <p className="text-sm text-muted"><span className="nums">{done.expenses}</span> expenses and <span className="nums">{done.settlements}</span> settlements added.</p>
              </div>
              <button className="btn-primary" onClick={onDone}>View balances →</button>
            </div>
          ) : (
            <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h2 className="font-bold text-fg">Review before saving</h2>
                <p className="text-sm text-muted">Approve to apply the plan below. This is the only step that writes to the database.</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => downloadReport(analysis)}>⬇ report.md</button>
                <button className="btn-ghost" onClick={() => { setAnalysis(null); setErr(''); }}>Start over</button>
                <button className="btn-primary" disabled={busy} onClick={commit}>{busy ? 'Importing…' : 'Approve & import'}</button>
              </div>
            </div>
          )}

          {/* summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Rows read" value={analysis.summary.totalRows} />
            <Stat label="→ Expenses" value={analysis.summary.expenses} tone="brand" />
            <Stat label="→ Settlements" value={analysis.summary.settlements} tone="indigo" />
            <Stat label="→ Skipped" value={analysis.summary.skipped} tone="rose" />
            <Stat label="Anomalies" value={analysis.summary.anomalyCount} tone="amber" />
            <Stat label="Anomaly types" value={analysis.summary.distinctAnomalyTypes} tone="amber" />
          </div>

          {/* filter */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {['all', 'review', 'skipped', 'anomalies'].map((ff) => (
              <button key={ff} onClick={() => setFilter(ff)}
                className={`chip px-3 py-1 transition ${filter === ff ? 'bg-brand-500 text-ink-950' : 'bg-line/10 text-muted hover:bg-line/20'}`}>{ff}</button>
            ))}
            {err && <span className="ml-auto text-sm text-rose-500 dark:text-rose-300">{err}</span>}
          </div>

          {/* rows */}
          <div className="mt-3 space-y-2">
            {shown.map((r) => {
              const plan = PLAN_STYLE[r.plan.action];
              return (
                <div key={r.line} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="chip bg-line/10 text-muted">row {r.line}</span>
                        <span className="font-semibold text-fg">{r.raw.description || <i className="text-faint">(no description)</i>}</span>
                      </div>
                      <div className="mt-1 text-xs text-faint">
                        {prettyDate(r.cleaned.date)} · paid by {r.cleaned.paidBy || '—'} · {r.cleaned.participants.join(', ') || 'no participants'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="nums font-bold text-fg">{r.cleaned.amountINRminor != null ? formatINR(r.cleaned.amountINRminor) : '—'}</div>
                      <div className={`flex items-center justify-end gap-1.5 text-xs font-semibold ${plan.text}`}>
                        <span className={`inline-block h-2 w-2 rounded-full ${plan.dot}`} />{plan.label}
                      </div>
                    </div>
                  </div>
                  {r.anomalies.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {r.anomalies.map((a, i) => {
                        const s = SEV_STYLE[a.severity];
                        return (
                          <li key={i} className={`flex items-start gap-2 rounded-lg ${s.bg} px-3 py-1.5 text-sm ring-1 ${s.ring}`}>
                            <span className={`chip ${s.bg} ${s.text} shrink-0`}>{s.label}</span>
                            <span className="text-muted"><b className="font-mono text-xs text-fg">{a.code}</b> — {a.message}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-fg',
    brand: 'text-brand-600 dark:text-brand-300',
    indigo: 'text-indigo-600 dark:text-indigo-300',
    rose: 'text-rose-600 dark:text-rose-300',
    amber: 'text-amber-600 dark:text-amber-300',
  };
  return (
    <div className="card p-4">
      <div className={`nums text-2xl font-extrabold ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

// Build the "import report" deliverable as a downloadable Markdown file.
function downloadReport(analysis) {
  const s = analysis.summary;
  let md = `# Import Report\n\n`;
  md += `- Rows read: **${s.totalRows}**\n- Imported as expenses: **${s.expenses}**\n- Imported as settlements: **${s.settlements}**\n- Skipped: **${s.skipped}**\n- Anomalies detected: **${s.anomalyCount}** across **${s.distinctAnomalyTypes}** types\n\n`;
  md += `## Anomalies by type\n\n`;
  for (const [code, n] of Object.entries(s.byCode)) md += `- \`${code}\`: ${n}\n`;
  md += `\n## Per-row detail\n\n`;
  for (const r of analysis.rows) {
    if (!r.anomalies.length && r.plan.action === 'expense') continue;
    md += `### Row ${r.line}: ${r.raw.description || '(no description)'}\n`;
    md += `- Action: **${r.plan.action}**${r.plan.reason ? ` (${r.plan.reason})` : ''}\n`;
    for (const a of r.anomalies) md += `- [${a.severity}] \`${a.code}\` — ${a.message}\n`;
    md += `\n`;
  }
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'import-report.md';
  a.click();
}
