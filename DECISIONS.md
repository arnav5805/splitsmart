# DECISIONS.md — Decision log

Each significant product/engineering decision, the options I considered, and why
I chose what I chose. Anomaly-specific policies are in
[SCOPE.md](SCOPE.md); this is the "why" behind the architecture and the
judgement calls.

---

### 1. Relational DB engine → **SQLite (`better-sqlite3`)**
- **Options:** PostgreSQL, MySQL, SQLite.
- **Chosen:** SQLite.
- **Why:** The brief requires a *relational* DB, not a *server*. SQLite gives
  real tables, foreign keys, JOINs and transactions in a single file, so the app
  deploys as one service with nothing to provision. `better-sqlite3` is
  synchronous, which removes a whole class of async race bugs and keeps the code
  readable. Trade-off: a single writer — fine for a flat-share app; I'd move to
  Postgres if this needed concurrent write scale.

### 2. Money representation → **integer paise**
- **Options:** JS floats, a decimal library, integer minor units.
- **Chosen:** integer minor units (paise).
- **Why:** Floats can't represent `0.1`, so split amounts wouldn't add back to
  the total and balances would drift by a paisa here and there. Integers make
  every split provably reconcile. A decimal library would also work but adds a
  dependency for something integers solve cleanly.

### 3. Split rounding → **largest-remainder method**
- **Options:** naive `floor` (loses paise), give-remainder-to-payer, largest
  remainder.
- **Chosen:** largest remainder (hand leftover paise to the most rounded-down).
- **Why:** It guarantees the parts sum to the exact total *and* spreads the
  rounding fairly instead of always dumping it on one person. Verified by an
  automated reconciliation test (0 errors across the dataset).

### 4. Import flow → **two phases: dry-run `analyze` then `commit`**
- **Options:** one-shot import (parse + write), or analyze-then-commit.
- **Chosen:** two phases; nothing is written until the user approves.
- **Why:** This is the single most important decision for the brief. It (a)
  satisfies Meera's "I approve anything you delete or change", (b) makes "detect
  → surface → handle" a visible, reviewable step instead of a black box, and (c)
  means a crash during analysis can never leave a half-imported DB. Commit runs
  inside one transaction so it's all-or-nothing.

### 5. Settlement vs expense → **reclassify transfers, don't import as cost**
- **Options:** import everything as an expense; drop the weird rows; reclassify.
- **Chosen:** reclassify rows that are really transfers (rows 14, 38) into the
  `settlements` table.
- **Why:** "Rohan paid Aisha back" is a *movement of money to settle debt*, not a
  new shared cost. Importing it as an expense would double-count and corrupt
  every balance. Detecting it (one counterparty + a transfer keyword) and routing
  it correctly is the difference between right and wrong numbers.

### 6. Conflicting duplicate → **keep the first, skip & flag the second**
- **Options:** keep highest amount, keep latest, keep first, ask the user.
- **Chosen:** keep the first-logged row, skip the second, mark `review`.
- **Why:** With two contradictory entries there's no truth in the data, so any
  *silent* auto-pick is a guess. First-logged is a stable, explainable default,
  and flagging it lets a human override. (The CSV note "hers is wrong" supports
  keeping one and reviewing.)

### 7. Ambiguous dates → **parse to the file's dominant format, flag only the outlier**
- **Options:** flag every date where day&month ≤ 12; trust a fixed format
  silently; detect the real outlier.
- **Chosen:** parse everything as DD-MM-YYYY (the file clearly is — many rows have
  day > 12) and flag only rows that are **out of chronological order**.
- **Why:** My first version flagged 24 "ambiguous" dates — noise that buries the
  one row that actually matters (`04-05-2026`). Using chronological order as the
  signal surfaces exactly the genuinely-suspicious row and trusts the rest.

### 8. Membership over time → **`joined_at`/`left_at` columns on `members`**
- **Options:** a full membership-event log; boolean "active"; date columns.
- **Chosen:** two nullable date columns + an `is_guest` flag.
- **Why:** It's the simplest model that answers every membership question in the
  brief (Sam's "not before I joined", Meera's "not after I left", Dev/Kabir as
  guests). A full event log is more powerful but more than this problem needs,
  and harder to explain line-by-line.

### 9. Currency → **single documented rate (1 USD = ₹83)**
- **Options:** live FX API, per-transaction historical rate, one fixed rate.
- **Chosen:** one fixed, documented rate.
- **Why:** The dataset is one short trip; a single rate is defensible and keeps
  the import deterministic and testable. I explicitly note that a production app
  should store the FX rate *as of each transaction's date* — that's the correct
  long-term design, just overkill for this assignment's data.

### 10. Unknown participant (Kabir) → **add as a guest, don't reject**
- **Options:** reject the row, ignore the unknown name, add a guest.
- **Chosen:** add Kabir as a one-day guest member.
- **Why:** He genuinely shared that expense, so dropping him would make everyone
  else's share too high. Adding him as a guest keeps the split mathematically
  correct without polluting the permanent roster.

### 11. Percentages ≠ 100% → **normalise proportionally**
- **Options:** reject, clamp, normalise.
- **Chosen:** normalise (divide each percentage by the actual total).
- **Why:** The intent (relative shares) is clear even when the numbers are sloppy;
  normalising preserves that intent and still sums to the exact amount. Flagged so
  a human can fix the source data.

### 12. Missing payer → **skip & flag, don't guess**
- **Options:** assign to the group owner, split with no payer, skip.
- **Chosen:** skip and surface for manual correction.
- **Why:** A "silent guess" is explicitly called a failing answer. With no payer
  there's no creditor, so any auto-assignment invents a debt. Better to hold it.

### 13. Auth → **JWT + bcrypt**
- **Options:** server sessions, JWT.
- **Chosen:** stateless JWT, bcrypt-hashed passwords.
- **Why:** No session store to run, trivial to scale, and simple to reason about
  (a token in `localStorage`, verified by one middleware). Passwords are never
  stored in plain text.

### 14. Deployment → **one service serving API + built client**
- **Options:** client on Vercel + server on Render; or one combined service.
- **Chosen:** Express serves `client/dist`, so it's one repo, one build, one URL.
- **Why:** Fewest moving parts to deploy and explain, no CORS/origin config in
  prod, and a single place for the SQLite file. The code still supports the split
  setup (Vite proxy in dev) if needed later.

### 15. UI for splits → **per-person inputs that appear with the split type**
- **Options:** a separate screen per split type; one form that adapts.
- **Chosen:** one "Add expense" form where choosing `unequal`/`percentage`/`share`
  reveals a small value box next to each selected participant.
- **Why:** One mental model for the user, and it mirrors exactly the four split
  types the importer supports, so manual entry and import stay consistent.
