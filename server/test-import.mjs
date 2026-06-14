// Quick sanity harness: run the importer against the real CSV and print the report.
// Also verifies every expense's splits sum EXACTLY to the total (no lost paise).
import fs from 'fs';
import { analyzeImport, CANONICAL_ROSTER } from './src/importer.js';
import { computeSplits } from './src/splits.js';

const csv = fs.readFileSync(new URL('../Expenses Export (1).csv', import.meta.url), 'utf8');
const a = analyzeImport(csv, CANONICAL_ROSTER);

console.log('SUMMARY', JSON.stringify(a.summary, null, 2));

let splitErrors = 0;
for (const r of a.rows) {
  if (r.plan.action !== 'expense') continue;
  const c = r.cleaned;
  const participants = c.participants.map((n, i) => ({ memberId: i, name: n }));
  const { shares, warnings } = computeSplits({
    amountINRminor: c.amountINRminor, splitType: c.splitType, participants, detailsRaw: c.detailsRaw, currency: c.currency,
  });
  const sum = shares.reduce((x, s) => x + s.owedMinor, 0);
  if (sum !== c.amountINRminor) { splitErrors++; console.log(`  SPLIT MISMATCH row ${r.line}: ${sum} != ${c.amountINRminor}`); }
}
console.log('\nSplit reconciliation errors:', splitErrors);

console.log('\nPER-ROW PLAN:');
for (const r of a.rows) {
  const codes = r.anomalies.map((x) => x.code).join(', ');
  console.log(`row ${String(r.line).padStart(2)} | ${r.plan.action.padEnd(10)} | ${(r.raw.description||'').slice(0,28).padEnd(28)} | ${codes}`);
}
