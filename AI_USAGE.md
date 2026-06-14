# AI_USAGE.md

## Tools used
- **Claude (Anthropic)** — primary development collaborator, used in an agentic
  coding workflow (it could read/write files in the repo and run commands).
- Used for: scaffolding the React/Express/SQLite project, drafting the anomaly
  detectors, and writing tests and docs.
- I remained the **engineer of record**: I decided the schema, the anomaly
  policies, and the split maths, reviewed every file, and ran the tests myself.
  The AI accelerated typing and boilerplate; it did not get a free pass.

## How I directed it (key prompts)
These are the substance of the prompts I used (paraphrased to the essentials):

1. **Framing / architecture**
   > "Build a Splitwise-style shared-expenses app: React + Vite + Tailwind
   > frontend, Express + a *relational* DB backend. Login, groups with membership
   > that changes over time, expenses with equal/unequal/percentage/share splits,
   > balances, settle-up, and a CSV import. Money must reconcile exactly."

2. **The core — import**
   > "Write an importer that ingests the CSV *unedited*. For every deliberate data
   > problem it must detect it, surface it with a clear message, and handle it via
   > a documented policy. It must never crash and never silently guess. Make it a
   > dry-run that returns a report, separate from the commit step."

3. **Correctness guards**
   > "Store money as integer paise. Split with the largest-remainder method so the
   > parts sum to the total exactly. Write a test that runs the importer on the
   > real CSV and asserts every split reconciles and balances sum to zero."

4. **Per-anomaly policy** — I went row by row through the CSV with the AI and
   pinned down each policy (refund vs error, which duplicate wins, settlement vs
   expense, member tenure), which became [SCOPE.md](SCOPE.md).

---

## Three concrete cases where the AI was wrong

### Case 1 — Date "ambiguity" detector cried wolf on 24 rows
- **What the AI produced:** the first `parseDate` flagged a date as ambiguous
  whenever *both* the day and month were ≤ 12 and differed. Plausible-sounding,
  but on this file that's almost every date (`01-02-2026`, `03-02-2026`, …).
- **How I caught it:** I ran `node server/test-import.mjs` and the summary showed
  `DATE_AMBIGUOUS: 24`. That's noise — it buries the *one* row that's genuinely
  ambiguous (`04-05-2026`).
- **What I changed:** the file is unambiguously DD-MM-YYYY (many rows have day >
  12), so I parse everything as DD-MM-YYYY and instead flag only rows that are
  **out of chronological order** (a mis-keyed date breaks the sort). Result:
  `DATE_AMBIGUOUS: 1`, the correct row. See the chronological pass in
  [`importer.js`](server/src/importer.js) and decision #7 in
  [DECISIONS.md](DECISIONS.md).

### Case 2 — Importer assumed the CSV was always a JS string
- **What the AI produced:** `analyzeImport` passed the request body straight into
  `csv-parse`. It worked in the Node unit test (which reads a string from disk).
- **How I caught it:** testing the HTTP endpoint, the import failed with
  `"buf.slice is not a function"` thrown from inside `csv-parse` — the body had
  arrived as something other than a plain string (an array/Buffer, depending on
  the client), which the parser couldn't handle.
- **What I changed:** I normalise the input before parsing —
  `Array.isArray(csvText) ? csvText.join('\n') : String(csvText)` — so the
  importer is robust to however the file is delivered. I also kept a `fetch`-based
  end-to-end test (`server/test-api.mjs`) that exercises the real HTTP path, not
  just the in-process function, so this class of bug can't hide again.

### Case 3 — Settlement detector missed a disguised transfer
- **What the AI produced:** the first rule classified a row as a settlement only
  when `split_type` was empty. That correctly caught row 14 ("Rohan paid Aisha
  back") but **misclassified row 38** ("Sam deposit share", `split_type = equal`,
  split with only Aisha) as a normal shared expense.
- **How I caught it:** I read the per-row plan printed by `test-import.mjs` and
  saw row 38 listed as `expense`. A deposit paid to one person isn't a shared
  cost — importing it as one would inflate everyone's balances.
- **What I changed:** the rule now treats a row as a settlement when there's
  exactly **one counterparty** *and* (the split type is empty **or** the
  description/notes contain a transfer keyword like `paid…back`/`settle`/
  `repay`/`deposit`). Both rows 14 and 38 are now correctly routed to the
  `settlements` table. See SCOPE.md anomaly #5.

---

## What I verified myself (not taken on trust)
- `node server/test-import.mjs` → **18 anomaly types**, **"Split reconciliation
  errors: 0"**, and a sensible per-row plan.
- `node server/test-api.mjs` → over real HTTP: **balances sum to ₹0.00** and
  **Rohan's breakdown lines sum to his balance exactly**.
- `npm run build` in `client/` → the frontend compiles with no errors.
- I can trace any anomaly in the CSV to its handling in `importer.js` and explain
  every policy in SCOPE.md / DECISIONS.md.
