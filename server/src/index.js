// index.js
// ---------------------------------------------------------------------------
// The Express HTTP server. It wires the modules together into a REST API and,
// in production, also serves the built React app so the whole thing deploys as
// ONE service with ONE public URL.
//
// Route groups:
//   /api/auth/*           register / login (public)
//   /api/groups/*         groups, members, expenses, settlements, balances
//   /api/groups/:id/import/(analyze|commit)   the CSV import dry-run + commit
// Every /api route except auth is protected by requireAuth.
// ---------------------------------------------------------------------------

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import db from './db.js';
import { register, login, requireAuth } from './auth.js';
import { analyzeImport, commitImport, CANONICAL_ROSTER } from './importer.js';
import { computeBalances, simplifyDebts, memberBreakdown } from './balances.js';
import { parseAmount, toINRminor } from './money.js';
import { computeSplits } from './splits.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // CSV is sent as JSON text

// small wrapper so route handlers can throw and we return a clean 400
const h = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) { res.status(400).json({ error: e.message }); }
};

// ---- auth ------------------------------------------------------------------
app.post('/api/auth/register', h((req, res) => res.json(register(req.body))));
app.post('/api/auth/login', h((req, res) => res.json(login(req.body))));
app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

// everything below requires a logged-in user
app.use('/api/groups', requireAuth);

// ---- groups ----------------------------------------------------------------
app.get('/api/groups', h((req, res) => {
  const groups = db.prepare('SELECT * FROM groups WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(groups.map((g) => ({
    ...g,
    memberCount: db.prepare('SELECT COUNT(*) c FROM members WHERE group_id = ?').get(g.id).c,
    expenseCount: db.prepare('SELECT COUNT(*) c FROM expenses WHERE group_id = ?').get(g.id).c,
  })));
}));

app.post('/api/groups', h((req, res) => {
  const { name, seedRoster } = req.body;
  if (!name?.trim()) throw new Error('Group name is required');
  const id = db.prepare('INSERT INTO groups (name, owner_id) VALUES (?, ?)').run(name.trim(), req.user.id).lastInsertRowid;
  if (seedRoster) {
    const ins = db.prepare('INSERT INTO members (group_id, name, joined_at, left_at, is_guest) VALUES (?, ?, ?, ?, ?)');
    for (const m of CANONICAL_ROSTER) ins.run(id, m.name, m.joined_at, m.left_at, m.is_guest);
  }
  res.json({ id });
}));

const ownGroup = (req) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!g) throw new Error('Group not found');
  return g;
};

app.get('/api/groups/:id', h((req, res) => {
  const g = ownGroup(req);
  const members = db.prepare('SELECT * FROM members WHERE group_id = ? ORDER BY is_guest, name').all(g.id);
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const expenses = db.prepare('SELECT * FROM expenses WHERE group_id = ? ORDER BY date, id').all(g.id).map((e) => ({
    ...e,
    paid_by_name: memberName[e.paid_by] || '—',
    splits: db.prepare('SELECT es.*, m.name FROM expense_splits es JOIN members m ON m.id = es.member_id WHERE expense_id = ?').all(e.id),
  }));
  const settlements = db.prepare('SELECT * FROM settlements WHERE group_id = ? ORDER BY date').all(g.id).map((s) => ({
    ...s, from_name: memberName[s.from_member], to_name: memberName[s.to_member],
  }));
  res.json({ group: g, members, expenses, settlements });
}));

// ---- members ---------------------------------------------------------------
app.post('/api/groups/:id/members', h((req, res) => {
  const g = ownGroup(req);
  const { name, joined_at, left_at, is_guest } = req.body;
  if (!name?.trim()) throw new Error('Member name is required');
  const id = db.prepare('INSERT INTO members (group_id, name, joined_at, left_at, is_guest) VALUES (?, ?, ?, ?, ?)')
    .run(g.id, name.trim(), joined_at || null, left_at || null, is_guest ? 1 : 0).lastInsertRowid;
  res.json({ id });
}));

app.patch('/api/groups/:id/members/:mid', h((req, res) => {
  ownGroup(req);
  const { joined_at, left_at } = req.body;
  db.prepare('UPDATE members SET joined_at = ?, left_at = ? WHERE id = ? AND group_id = ?')
    .run(joined_at || null, left_at || null, req.params.mid, req.params.id);
  res.json({ ok: true });
}));

// ---- expenses (manual create / delete) ------------------------------------
app.post('/api/groups/:id/expenses', h((req, res) => {
  const g = ownGroup(req);
  const { date, description, paidBy, amount, currency = 'INR', splitType = 'equal', participants, detailsRaw, notes } = req.body;
  const amt = parseAmount(String(amount));
  if (!amt.valid) throw new Error('Invalid amount');
  if (!date || !description?.trim()) throw new Error('Date and description are required');
  if (!Array.isArray(participants) || !participants.length) throw new Error('Pick at least one participant');

  const amountINRminor = toINRminor(amt.minor, currency);
  const memberRows = db.prepare(`SELECT id, name FROM members WHERE group_id = ? AND id IN (${participants.map(() => '?').join(',')})`).all(g.id, ...participants);
  const expId = db.prepare(`INSERT INTO expenses (group_id, date, description, paid_by, amount_minor, currency, amount_inr_minor, split_type, notes, is_refund, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`)
    .run(g.id, date, description.trim(), paidBy, amt.minor, currency, amountINRminor, splitType, notes || null, amt.minor < 0 ? 1 : 0).lastInsertRowid;
  const { shares } = computeSplits({ amountINRminor, splitType, participants: memberRows, detailsRaw, currency });
  const insSplit = db.prepare('INSERT INTO expense_splits (expense_id, member_id, owed_minor) VALUES (?, ?, ?)');
  for (const s of shares) insSplit.run(expId, s.memberId, s.owedMinor);
  res.json({ id: expId });
}));

app.delete('/api/groups/:id/expenses/:eid', h((req, res) => {
  ownGroup(req);
  db.prepare('DELETE FROM expenses WHERE id = ? AND group_id = ?').run(req.params.eid, req.params.id);
  res.json({ ok: true });
}));

// ---- settlements -----------------------------------------------------------
app.post('/api/groups/:id/settlements', h((req, res) => {
  const g = ownGroup(req);
  const { from_member, to_member, amount, date, note } = req.body;
  const amt = parseAmount(String(amount));
  if (!amt.valid || amt.minor <= 0) throw new Error('Enter a positive amount');
  if (from_member === to_member) throw new Error('Payer and receiver must differ');
  db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount_inr_minor, date, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(g.id, from_member, to_member, amt.minor, date, note || null);
  res.json({ ok: true });
}));

// ---- balances --------------------------------------------------------------
app.get('/api/groups/:id/balances', h((req, res) => {
  const g = ownGroup(req);
  const balances = computeBalances(db, g.id);
  res.json({ balances, transfers: simplifyDebts(balances) });
}));

app.get('/api/groups/:id/members/:mid/breakdown', h((req, res) => {
  ownGroup(req);
  res.json(memberBreakdown(db, req.params.id, +req.params.mid));
}));

// ---- import ----------------------------------------------------------------
// Dry run: analyse the CSV and return the report WITHOUT writing anything.
app.post('/api/groups/:id/import/analyze', h((req, res) => {
  const g = ownGroup(req);
  const { csv } = req.body;
  if (!csv) throw new Error('No CSV provided');
  // Use the group's own roster (membership timeline) if it has members.
  const members = db.prepare('SELECT name, joined_at, left_at, is_guest FROM members WHERE group_id = ?').all(g.id);
  const roster = members.length ? members : CANONICAL_ROSTER;
  res.json(analyzeImport(csv, roster));
}));

// Commit: persist the (already-reviewed) analysis. Idempotency is the caller's
// concern; in the UI the user explicitly approves before this is called.
app.post('/api/groups/:id/import/commit', h((req, res) => {
  const g = ownGroup(req);
  const { analysis } = req.body;
  if (!analysis?.rows) throw new Error('No analysis to commit');
  res.json(commitImport(db, g.id, analysis));
}));

// ---- chat ------------------------------------------------------------------
app.get('/api/groups/:id/messages', h((req, res) => {
  const g = ownGroup(req);
  const msgs = db.prepare('SELECT id, user_id, author, body, created_at FROM messages WHERE group_id = ? ORDER BY id ASC LIMIT 500').all(g.id);
  res.json(msgs.map((m) => ({ ...m, mine: m.user_id === req.user.id })));
}));

app.post('/api/groups/:id/messages', h((req, res) => {
  const g = ownGroup(req);
  const body = String(req.body.body || '').trim();
  if (!body) throw new Error('Message is empty');
  if (body.length > 2000) throw new Error('Message too long');
  const id = db.prepare('INSERT INTO messages (group_id, user_id, author, body) VALUES (?, ?, ?, ?)')
    .run(g.id, req.user.id, req.user.name, body).lastInsertRowid;
  res.json({ id });
}));

app.get('/api/groups/:id/import-report', h((req, res) => {
  ownGroup(req);
  const run = db.prepare('SELECT * FROM import_runs WHERE group_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.id);
  res.json(run ? JSON.parse(run.report_json) : null);
}));

// ---- serve the built frontend in production --------------------------------
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
