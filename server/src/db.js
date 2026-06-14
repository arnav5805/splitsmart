// db.js
// ---------------------------------------------------------------------------
// Relational database layer (SQLite via better-sqlite3).
// SQLite IS a relational DB: tables, foreign keys, JOINs, transactions — it
// just lives in a single file, which makes it trivial to deploy. The schema
// below is what we explain in SCOPE.md.
//
// Money columns are *_minor INTEGER  -> paise (see money.js).
// Membership is time-aware: members.joined_at / left_at let us answer Sam's
// question ("why would March electricity affect my balance?") — it doesn't,
// because he wasn't a member yet.
// ---------------------------------------------------------------------------

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // better concurrency
db.pragma('foreign_keys = ON'); // enforce referential integrity

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    owner_id    INTEGER NOT NULL REFERENCES users(id),
    base_currency TEXT NOT NULL DEFAULT 'INR',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A "member" is a person inside a group. Membership is time-bounded so the
  -- same group can have people join and leave (Meera left, Sam joined, Dev/Kabir
  -- were guests). is_guest marks short-term trip participants.
  CREATE TABLE IF NOT EXISTS members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    joined_at  TEXT,           -- ISO date or NULL (= since group start)
    left_at    TEXT,           -- ISO date or NULL (= still a member)
    is_guest   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    date             TEXT NOT NULL,            -- normalised ISO date YYYY-MM-DD
    description      TEXT NOT NULL,
    paid_by          INTEGER REFERENCES members(id),
    amount_minor     INTEGER NOT NULL,         -- original amount in its own currency
    currency         TEXT NOT NULL DEFAULT 'INR',
    amount_inr_minor INTEGER NOT NULL,         -- converted to INR for balance math
    split_type       TEXT NOT NULL,
    notes            TEXT,
    is_refund        INTEGER NOT NULL DEFAULT 0,
    source           TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'import'
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per participant per expense: how much that member OWES for it.
  -- These rows always sum to expenses.amount_inr_minor (largest-remainder rule).
  CREATE TABLE IF NOT EXISTS expense_splits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id  INTEGER NOT NULL REFERENCES members(id),
    owed_minor INTEGER NOT NULL
  );

  -- A direct payment from one member to another (settling up, or a logged
  -- repayment / deposit that was mislabelled as an expense in the CSV).
  CREATE TABLE IF NOT EXISTS settlements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_member INTEGER NOT NULL REFERENCES members(id),
    to_member   INTEGER NOT NULL REFERENCES members(id),
    amount_inr_minor INTEGER NOT NULL,
    date       TEXT NOT NULL,
    note       TEXT,
    source     TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Persisted import reports so the anomaly log is reproducible after the fact.
  CREATE TABLE IF NOT EXISTS import_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    report_json TEXT NOT NULL
  );

  -- Group chat: lightweight messages so flatmates can discuss expenses in-app.
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    author     TEXT NOT NULL,        -- snapshot of the sender's name
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
