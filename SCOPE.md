# SCOPE.md — Anomaly log & database schema

This documents (a) **every data problem found in `Expenses Export (1).csv`** and
the exact policy used to handle it, and (b) the **relational database schema**.

The detection code is in [`server/src/importer.js`](server/src/importer.js).
Run `node server/test-import.mjs` to reproduce the table below from the live code.

---

## Part A — Anomaly log

**Summary on the provided file:** 42 rows → **36 expenses, 2 settlements, 4
skipped**, with **18 distinct anomaly types** detected (the brief promised "at
least 12"). Every detected anomaly is shown in the app's import report and
colour-coded by severity:

- **fixed** — auto-corrected deterministically; no human action needed.
- **info** — intentional/notable (e.g. a refund); imported as-is.
- **review** — a human judgement is involved; surfaced for approval before commit.
- **dropped** — the row is not imported.

| # | Code | Severity | Row(s) | The problem | Policy / action taken |
|---|------|----------|--------|-------------|-----------------------|
| 1 | `NUMBER_THOUSANDS_SEP` | fixed | 7 | Amount `"1,200"` has a thousands separator (and is quoted). | Strip the comma, parse to `1200`. A real CSV parser (`csv-parse`) keeps the quoted field intact. |
| 2 | `SUB_PAISA_ROUNDED` | fixed | 10 | `899.995` — more precision than a real currency has. | Round half-up to paise → `900.00`. |
| 3 | `NAME_NORMALISED` | fixed | 9, 11, 27 | Payer/participant names vary: `priya`, `Priya S`, `rohan ` (trailing space). | Trim, collapse case, and match to a canonical member (`Priya S` → `Priya` via first-name match). |
| 4 | `MISSING_PAYER` | review | 13 | `paid_by` is blank ("can't remember who paid"). | Cannot attribute the cost to anyone, so **skip** and surface for manual correction. Importing it would invent a creditor. |
| 5 | `SETTLEMENT_NOT_EXPENSE` | review | 14, 38 | Row 14 "Rohan paid Aisha back" (a repayment); row 38 "Sam deposit share" paid to one person. | **Reclassify as a settlement** (a transfer), not a shared cost — it moves the balance but creates no new debt. Detected by: exactly one counterparty + a transfer keyword (`paid…back`/`settle`/`repay`/`deposit`) or empty split type. |
| 6 | `PERCENT_NOT_100` | review | 15, 32 | Percentages sum to **110%**, not 100%. | **Normalise proportionally** (divide each by the total) so the split still sums to the exact amount; flag for confirmation. |
| 7 | `CURRENCY_CONVERTED` | fixed | 20, 21, 23, 26 | Trip spending in **USD**, but the sheet treats $ as ₹ (Priya's complaint). | Convert to INR at a documented rate (`1 USD = ₹83`); keep the original amount + currency for display. |
| 8 | `MISSING_CURRENCY` | fixed | 28 | `currency` blank ("forgot to set currency"). | Default to **INR**, the group's base currency (every other domestic row is INR). |
| 9 | `SPLIT_TYPE_SHARE` | info | 22, 35 | Uses the `share` (ratio) split type, e.g. `Aisha 1; Rohan 2`. | Supported natively — shares become weights in the allocator. |
| 10 | `UNKNOWN_MEMBER` | review | 23 | `split_with` includes "Dev's friend Kabir", not a group member. | Add **Kabir as a one-day guest** (joined=left=that date) so the split balances, but he's not a permanent member. Surfaced for approval. |
| 11 | `DUPLICATE_EXACT` | dropped | 6 (dup of 5) | "Dinner at Marina Bites" and "dinner - marina bites" — same date, payer, amount. | **Drop the second.** Detected by same date + ≥60% description-token overlap + same amount & payer. |
| 12 | `DUPLICATE_CONFLICT` | review | 25 (vs 24) | Thalassa dinner logged twice with **different amounts/payers** (₹2400 by Aisha vs ₹2450 by Rohan). | Can't know which is true → **keep the first-logged (row 24), skip row 25**, and flag for confirmation. (The note on row 25 even says "hers is wrong".) |
| 13 | `NEGATIVE_AMOUNT_REFUND` | info | 26 | `-30 USD` — a negative amount. | Treat as a **refund**, not an error: it reduces balances. Kept with `is_refund = 1`. |
| 14 | `DATE_REFORMATTED` | fixed | 27 | `Mar-14` — a different date format. | Parse month-name format, infer year 2026 → `2026-03-14`. |
| 15 | `DATE_AMBIGUOUS` | review | 34 | `04-05-2026` — "April 5 or May 4?". | The whole file is **DD-MM-YYYY** (many rows have day > 12), so we parse it as **4 May**, but it's **out of chronological order** (it sits between 28 Mar and 1 Apr), so we flag it for confirmation rather than silently guessing. |
| 16 | `ZERO_AMOUNT` | dropped | 31 | Amount `0` ("counted twice earlier - fixing later"). | A ₹0 expense is a no-op → **skip**. |
| 17 | `MEMBER_OUTSIDE_TENURE` | review | 36 | April groceries still list **Meera**, who left 31 Mar ("oops Meera still in the group list"). This is also Sam's principle. | **Remove the out-of-tenure member** from the split and redistribute among active members; flag it. Membership windows (`joined_at`/`left_at`) drive this. |
| 18 | `SPLITTYPE_DETAIL_MISMATCH` | fixed | 42 | `split_type = equal` but explicit shares `1;1;1;1` were also provided. | **`split_type` wins** (equal). The redundant/uniform shares are ignored. |

### Cross-cutting policies (the live-session questions)
- **Is a negative amount an error or a refund?** → A refund (#13). It reduces the
  payer-side total.
- **If two people logged the same dinner with different amounts, which wins?** →
  The first-logged row; the conflicting duplicate is skipped and flagged (#12).
- **Does someone who moved out still owe expenses dated after they left?** → No.
  Out-of-tenure members are removed from those splits (#17). Same rule keeps Sam
  off pre-April expenses.
- **Guests vs members:** Dev (trip) and Kabir (one day) are `is_guest = 1`. They
  appear in the splits they took part in, but they aren't permanent members and
  membership-tenure checks don't fight their guest status.

---

## Part B — Database schema

Relational, SQLite (`better-sqlite3`). Foreign keys enforced. All money columns
are **integer paise** (`*_minor`). Defined in
[`server/src/db.js`](server/src/db.js).

```
users
  id            PK
  name          TEXT
  email         TEXT UNIQUE          -- login identity
  password_hash TEXT                 -- bcrypt, never plain text
  created_at    TEXT

groups
  id            PK
  name          TEXT
  owner_id      FK → users.id        -- who created/owns the group
  base_currency TEXT  (default INR)  -- the currency balances are shown in
  created_at    TEXT

members                              -- a PERSON inside a group, with tenure
  id        PK
  group_id  FK → groups.id
  name      TEXT
  joined_at TEXT  (nullable)         -- NULL = since group start
  left_at   TEXT  (nullable)         -- NULL = still a member
  is_guest  INTEGER (0/1)            -- short-term trip participants (Dev, Kabir)

expenses
  id               PK
  group_id         FK → groups.id
  date             TEXT              -- normalised ISO YYYY-MM-DD
  description      TEXT
  paid_by          FK → members.id   -- who fronted the money
  amount_minor     INTEGER           -- original amount, in its own currency
  currency         TEXT              -- 'INR' | 'USD'
  amount_inr_minor INTEGER           -- converted to INR for balance maths
  split_type       TEXT              -- equal | unequal | percentage | share
  notes            TEXT
  is_refund        INTEGER (0/1)
  source           TEXT              -- 'manual' | 'import'
  created_at       TEXT

expense_splits                       -- one row per participant per expense
  id         PK
  expense_id FK → expenses.id
  member_id  FK → members.id
  owed_minor INTEGER                 -- this member's share; rows sum to amount_inr_minor

settlements                          -- a transfer A → B (settle up / repayment / deposit)
  id               PK
  group_id         FK → groups.id
  from_member      FK → members.id
  to_member        FK → members.id
  amount_inr_minor INTEGER
  date             TEXT
  note             TEXT
  source           TEXT              -- 'manual' | 'import'
  created_at       TEXT

import_runs                          -- persisted import reports (reproducible audit)
  id          PK
  group_id    FK → groups.id
  created_at  TEXT
  report_json TEXT                   -- the full {summary, rows[]} report

messages                             -- in-app group chat
  id          PK
  group_id    FK → groups.id
  user_id     FK → users.id          -- who sent it (for the "mine" flag)
  author      TEXT                   -- snapshot of the sender's name
  body        TEXT
  created_at  TEXT
```

### Why this shape
- **`expense_splits` as its own table** (rather than a JSON blob) means balances
  are a couple of `SUM()`/JOIN queries and every share is individually
  inspectable — which is what makes Rohan's line-by-line breakdown trivial.
- **Tenure on `members`** (not a separate join/leave event log) is enough to
  answer every membership question in the brief while staying simple to explain.
- **Two amount columns** (`amount_minor` + `amount_inr_minor`) keep the source of
  truth (what was actually paid, in its currency) *and* the comparable INR value.
- **`settlements` is separate from `expenses`** because a transfer is not a
  shared cost — conflating them is exactly the bug in CSV rows 14 and 38.
```
