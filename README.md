# SplitSmart — Shared Expenses App

A Splitwise-style app for a flat of room-mates whose expenses live in a messy
spreadsheet. It lets them log expenses with **four split types**, handles
**multiple currencies**, tracks **membership that changes over time** (people
join and leave), shows **who owes whom in the fewest transfers**, and — the
centrepiece — **imports their real CSV, detecting and surfacing every data
anomaly before anything is saved.**

Built for the Spreetail "Build a Shared Expenses App" assignment.

> **Live URL:** _add your deployed URL here after following the Deploy section_
> **Repo:** _add your GitHub URL here_

---

## Table of contents

1. [What each flatmate asked for, and where it's solved](#1-what-each-flatmate-asked-for)
2. [Tech stack & why](#2-tech-stack--why)
3. [Run it locally](#3-run-it-locally)
4. [Deploy it (one public URL)](#4-deploy-it)
5. [Repository map](#5-repository-map)
6. [How the code works — module by module](#6-how-the-code-works)
7. [The import pipeline (the core requirement)](#7-the-import-pipeline)
8. [The money & maths, explained](#8-the-money--maths)
9. [Testing](#9-testing)
10. [AI used](#10-ai-used)

Companion docs: **[APP_GUIDE.md](APP_GUIDE.md)** (plain-English walkthrough of the
whole app — read this to explain it in the live session),
**[FORMULAS.md](FORMULAS.md)** (every formula & rule with worked examples),
**[SCOPE.md](SCOPE.md)** (every anomaly + the DB schema),
**[DECISIONS.md](DECISIONS.md)** (why each choice was made),
**[AI_USAGE.md](AI_USAGE.md)** (prompts + where the AI was wrong).

---

## 1. What each flatmate asked for

| Flatmate | Request | Where it's solved |
|---|---|---|
| **Aisha** | "One number per person. Who pays whom, done." | `simplifyDebts()` in [`server/src/balances.js`](server/src/balances.js) → the **Settle-up plan** on the Balances tab. |
| **Rohan** | "If I owe ₹2,300, show me exactly which expenses make that up." | `memberBreakdown()` in [`server/src/balances.js`](server/src/balances.js) → click any member on the Balances tab to see **every line**, which sums to the balance exactly. |
| **Priya** | "Half the trip was in dollars. A dollar isn't a rupee." | `toINRminor()` in [`server/src/money.js`](server/src/money.js) converts USD→INR at a documented rate; the original amount is kept too. |
| **Sam** | "I moved in mid-April. Why would March electricity affect me?" | Time-bounded membership (`members.joined_at/left_at`) + the `activeOn()` check in [`server/src/importer.js`](server/src/importer.js). Sam isn't on any pre-April expense. |
| **Meera** | "Clean up duplicates — but I approve anything you delete or change." | The import is a **dry-run preview**: nothing is written until she clicks **Approve & import** ([`client/src/pages/ImportWizard.jsx`](client/src/pages/ImportWizard.jsx)). |

Minimum product requirements (all met): login, groups with changing membership,
expenses with every split type in the CSV (`equal`, `unequal`, `percentage`,
`share`), group + individual balances, settle/record payments, CSV import, and a
relational DB.

**Beyond the brief:** a polished **light/dark theme** (toggle in the top bar,
remembered across visits), a distinctive type system (Space Grotesk · Manrope ·
JetBrains Mono for figures), and a per-group **chat** so flatmates can discuss
expenses in-app.

---

## 2. Tech stack & why

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + Vite + Tailwind CSS** | Fast dev server, tiny build, utility CSS for a clean UI without a component-library black box I'd have to explain. |
| Backend | **Node + Express** | Minimal, transparent HTTP layer — every route is a few lines I can read out loud. |
| Database | **SQLite via `better-sqlite3`** | A real **relational** DB (tables, foreign keys, JOINs, transactions) in a single file, so the whole app deploys as one service with no DB server to provision. Synchronous API = simpler, race-free code. |
| Auth | **JWT + bcrypt** | Stateless tokens; passwords are hashed, never stored. |
| CSV | **`csv-parse`** | Correctly handles the quoted `"1,200"` field — a hand-rolled `split(',')` would break on it. |

Money is stored as **integer paise**, never floats (see [§8](#8-the-money--maths)).

---

## 3. Run it locally

You need **Node 18+**.

```bash
# 1. backend
cd server
npm install
npm run dev          # API on http://localhost:4000  (auto-restarts on change)

# 2. frontend (in a second terminal)
cd client
npm install
npm run dev          # UI on http://localhost:5173
```

Open **http://localhost:5173**, create an account, then on the dashboard click
**"✨ Create demo flat (seeded for CSV)"** — this makes a group pre-loaded with
the assignment's membership timeline (Meera leaves 31 Mar, Sam joins 8 Apr, Dev
is a trip guest). Open it → **Import CSV** tab → upload `Expenses Export (1).csv`
→ review the anomalies → **Approve & import** → check the **Balances** tab.

> On Windows, if `npm install` fails inside a OneDrive folder with an `EBUSY`
> error, run it from **PowerShell** (not Git Bash) or pause OneDrive sync — the
> native `better-sqlite3` build needs an unlocked `node_modules`.

---

## 4. Deploy it

The Express server serves the built React app, so it ships as **one service /
one URL**. The repo includes a root `package.json` with the right scripts.

### Render (free, recommended)
1. Push this repo to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. **Build command:** `npm run build`
   (installs client, builds it to `client/dist`, installs server)
4. **Start command:** `npm start`
5. Add a persistent disk (so `data.sqlite` survives restarts), mount path e.g.
   `/data`, and set env var `DB_PATH=/data/data.sqlite`. Also set a real
   `JWT_SECRET`.
6. Deploy → you get a public URL. Put it at the top of this file.

The same works on Railway/Fly.io. (Splitting client to Vercel + server to Render
also works — just point the client at the API URL — but one service is simpler.)

---

## 5. Repository map

```
spreetail/
├─ package.json              # root scripts for build/deploy
├─ README.md  SCOPE.md  DECISIONS.md  AI_USAGE.md
├─ Expenses Export (1).csv   # the dataset to import
│
├─ server/                   # Express + SQLite API
│  └─ src/
│     ├─ index.js            # routes + static hosting of the built client
│     ├─ db.js               # SQLite connection + schema (CREATE TABLE …)
│     ├─ auth.js             # register/login, bcrypt, JWT, requireAuth middleware
│     ├─ money.js            # paise parsing, currency conversion, formatting
│     ├─ splits.js           # turn one expense into per-person "owed" amounts
│     ├─ importer.js         # ★ CSV anomaly detection + commit (the core)
│     └─ balances.js         # net balances, debt simplification, per-member breakdown
│
└─ client/                   # React + Vite + Tailwind UI
   └─ src/
      ├─ main.jsx  App.jsx   # bootstrap + routing + top bar + theme toggle
      ├─ auth.jsx  api.js    # auth context + fetch wrapper (attaches JWT)
      ├─ theme.js            # light/dark theme state (persisted)
      ├─ lib.js              # display helpers (formatINR, severity colours)
      ├─ components/Modal.jsx
      └─ pages/
         ├─ Login.jsx        # sign in / sign up
         ├─ Dashboard.jsx    # list/create groups, seed demo flat
         ├─ Group.jsx        # tabs: Balances · Expenses · Members · Settle up · Chat
         └─ ImportWizard.jsx # ★ upload → review anomalies → approve → commit
```

---

## 6. How the code works

### Backend

**`db.js` — the relational schema.** Seven tables: `users`, `groups`,
`members`, `expenses`, `expense_splits`, `settlements`, `import_runs`. Foreign
keys are enforced (`PRAGMA foreign_keys = ON`). The interesting design choices:
- **`members` is time-aware** (`joined_at`, `left_at`, `is_guest`). The same
  group can have people come and go — that's how Meera/Sam/Dev are modelled.
- **`expense_splits`** stores one row per participant per expense = *how much
  that person owes for it*. These rows always sum to the expense total.
- Money columns end in `_minor` and hold **integer paise**.
Full column-by-column explanation is in [SCOPE.md](SCOPE.md#database-schema).

**`auth.js` — login module.** `register()` hashes the password with bcrypt and
returns a signed JWT; `login()` verifies the hash; `requireAuth` is the
middleware that reads `Authorization: Bearer <token>` and rejects anyone
without a valid token. Every `/api/groups/*` route is behind it.

**`money.js` — never trust a float.**
- `parseAmount("1,200")` strips the comma → `120000` paise and flags
  `hadComma`. `parseAmount("899.995")` rounds to paise → `90000` and flags
  `hadSubPaisa`. Negative values pass through (refunds).
- `toINRminor(minor, "USD")` multiplies by the documented rate (`USD_TO_INR = 83`).
- `formatINR()` renders `₹1,234.50` with Indian grouping.

**`splits.js` — one expense → who owes what.** The key function
`allocateByWeights(total, weights)` distributes the total in proportion to
weights using the **largest-remainder method** so the parts sum to the total
*exactly* (no lost paise). `computeSplits()` maps each split type onto weights:
`equal` → all 1s; `share` → the ratios; `percentage` → the percentages (a 110%
total is normalised by dividing by the sum); `unequal` → explicit amounts
(validated against the total, flagged if off).

**`balances.js` — who owes whom.**
- `computeBalances()` nets, per member, `(paid) − (owed) − (settlements)`. The
  result always sums to zero.
- `simplifyDebts()` greedily matches the biggest debtor to the biggest creditor,
  producing the **fewest transfers** (Aisha's ask).
- `memberBreakdown()` lists every expense/settlement line touching one member,
  with `paid`, `owed`, and net `effect` — and the effects sum to their balance
  (Rohan's ask). This is verified by an automated test.

**`index.js` — the API.** Thin handlers that call the modules above. Notable:
the import is **two endpoints** — `…/import/analyze` (pure dry-run, no writes)
and `…/import/commit` (writes inside a single DB transaction). Splitting them is
what makes the "review before saving" flow possible. In production this file also
serves `client/dist`, so one server answers both the API and the UI.

### Frontend

- **`api.js`** — a 20-line `fetch` wrapper that attaches the JWT and throws on
  non-2xx so pages can `try/catch`.
- **`auth.jsx`** — React context holding the current user; restores the session
  from the saved token on load.
- **`App.jsx`** — routes; `<Protected>` bounces logged-out users to `/login`.
- **`pages/Dashboard.jsx`** — create groups; "Create demo flat" seeds the roster.
- **`pages/Group.jsx`** — the workspace, with tabs:
  - *Balances*: net position per member, the settle-up plan, and a click-through
    breakdown modal.
  - *Expenses*: a table + an "Add expense" modal that supports all four split
    types (per-person inputs appear for non-equal splits).
  - *Members*: edit each person's join/leave dates (this powers Sam's rule).
  - *Settle up*: record a payment, with a one-click "suggested settlement".
- **`pages/ImportWizard.jsx`** — described next.

---

## 7. The import pipeline

This is the heart of the assignment, and it lives in
[`server/src/importer.js`](server/src/importer.js). The flow:

```
CSV text
  └─ analyzeImport()           ← PURE: parses + detects, writes NOTHING
       → { rows[], summary, roster }
            each row: { raw, cleaned, anomalies[], plan }
  └─ (user reviews in the UI)
  └─ commitImport()            ← applies the plan in ONE transaction
       → inserts expenses + splits + settlements + the saved report
```

For **every row** the analyzer:
1. **Detects** problems (bad number formats, wrong currency, duplicates,
   settlements-disguised-as-expenses, members outside their tenure, …).
2. **Surfaces** each as an anomaly with a **severity** (`fixed` / `info` /
   `review` / `dropped`) and a plain-English message.
3. **Handles** it by deciding the row's **plan**: import as an *expense*, import
   as a *settlement*, or *skip* it — every choice following a documented policy.

The UI shows summary cards (rows read, → expenses, → settlements, → skipped,
anomalies, anomaly types), a severity-coloured list of every row and its
anomalies, and a **Download report.md** button (deliverable #6). **Nothing is
written until "Approve & import"** — that's Meera's approval gate.

The full list of anomalies the importer detects, with the exact policy for each,
is in **[SCOPE.md](SCOPE.md)**. On the provided CSV it finds **18 distinct
anomaly types across 42 rows**, producing 36 expenses, 2 settlements, and 4
skipped rows.

---

## 8. The money & maths

**Why integer paise?** `0.1 + 0.2 !== 0.3` in floating point. If we split
`₹3200 / 3` as floats and store the pieces, they won't add back to ₹3200 and
balances drift. So every amount is an integer count of paise, and division uses
the largest-remainder method:

> Give everyone the floor of their share, then hand the leftover paise out one
> at a time to whoever was rounded down the most. Result sums to the total,
> always.

Example — `₹3200` equally among 3: floors are `106666, 106666, 106666` paise
(=₹3199.98), leftover `2` paise go to the first two → `106667, 106667, 106666`,
which sums to `320000` = ₹3200.00 exactly.

**Currency:** USD amounts are converted to INR at a single documented rate
(`1 USD = ₹83`) and stored as `amount_inr_minor`; the original `amount_minor`
and `currency` are kept so the UI can show "84 USD → ₹6,972". (A production app
would use a dated FX rate per transaction — see [DECISIONS.md](DECISIONS.md).)

**Balances** are pure integer arithmetic and are asserted to **sum to zero**;
a member's **breakdown lines** are asserted to **sum to their balance**. Both are
checked by the test in §9.

---

## 9. Testing

Two scripts under `server/` (run with Node, no test framework needed):

```bash
cd server

node test-import.mjs   # runs the importer on the real CSV and prints:
                       #  - the anomaly summary (18 types)
                       #  - "Split reconciliation errors: 0"  (every split sums exactly)
                       #  - the per-row plan (expense / settlement / skip)

node test-api.mjs      # starts from a fresh user, seeds a group, imports the CSV
                       # over HTTP, and asserts balances sum to 0 and Rohan's
                       # breakdown equals his balance
```

(The server must be running for `test-api.mjs`: `npm start` in another terminal.)

---

## 10. AI used

This project was built with **Claude (Anthropic)** as the primary development
collaborator, used through an agentic coding workflow. I directed the design
(schema, anomaly policies, split maths), reviewed every file, and corrected the
AI where it was wrong. Three concrete cases where the AI produced something
incorrect — how I caught them and what I changed — are documented in
**[AI_USAGE.md](AI_USAGE.md)**, along with the key prompts I used.
