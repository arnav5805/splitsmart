// End-to-end API test using fetch (exactly how the browser client calls it).
import fs from 'fs';
const base = 'http://localhost:4000';
const csv = fs.readFileSync(new URL('../Expenses Export (1).csv', import.meta.url), 'utf8');
const J = (b) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

const reg = await (await fetch(`${base}/api/auth/register`, J({ name: 'Tester', email: `t${Date.now()}@x.com`, password: 'secret1' }))).json();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` };
const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
const get = async (p) => (await fetch(base + p, { headers: H })).json();

const g = await post('/api/groups', { name: 'Flat 4B', seedRoster: true });
const an = await post(`/api/groups/${g.id}/import/analyze`, { csv });
console.log('analyze =>', JSON.stringify(an.summary));
const cm = await post(`/api/groups/${g.id}/import/commit`, { analysis: an });
console.log('commit =>', cm);
const bal = await get(`/api/groups/${g.id}/balances`);
let sum = 0;
console.log('\nBALANCES:');
for (const b of bal.balances) { sum += b.netMinor; console.log('  ' + b.name.padEnd(8), (b.netMinor / 100).toFixed(2).padStart(12)); }
console.log('  SUM =', (sum / 100).toFixed(2), '(must be 0)');
console.log('\nSETTLE-UP PLAN:');
for (const t of bal.transfers) console.log(`  ${t.from} pays ${t.to}: ₹${(t.amountMinor / 100).toFixed(2)}`);

// Rohan's breakdown sanity check
const rohan = bal.balances.find((b) => b.name === 'Rohan');
const bd = await get(`/api/groups/${g.id}/members/${rohan.memberId}/breakdown`);
console.log(`\nRohan breakdown: ${bd.lines.length} lines, net ₹${(bd.totalMinor / 100).toFixed(2)} (matches balance: ${bd.totalMinor === rohan.netMinor})`);
