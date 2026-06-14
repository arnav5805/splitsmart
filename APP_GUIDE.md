# APP_GUIDE.md — Explain-the-app walkthrough

A plain-English guide to **what the app does, how it works end to end, and how to
defend every part of it** in the live session. Read this top to bottom and you
can explain the whole project without opening the code — then the code will make
sense when they point at it.

> Companion docs: [README.md](README.md) (setup + per-file code explanation),
> [SCOPE.md](SCOPE.md) (anomalies + schema), [DECISIONS.md](DECISIONS.md) (why),
> [AI_USAGE.md](AI_USAGE.md) (AI + mistakes caught).

---

## 1. The one-paragraph pitch
SplitSmart is a shared-expenses app (like Splitwise) for a flat whose members
change over time. You log expenses, split them four different ways, in rupees or
dollars, and the app tells you **who owes whom in the fewest payments**. Its
standout feature is a **CSV importer** that takes the flat's messy real
spreadsheet and, before saving anything, **detects every data problem, explains
it, and applies a documented fix** — so the numbers you end up with are
trustworthy and every change was approved by a human.

## 2. The pieces (how the app is wired)
```
  Browser (React + Vite + Tailwind)            "the UI"
        │  fetch() with a JWT token
        ▼
  Express API (Node)                           "the rules"
        │  SQL queries
        ▼
  SQLite database (one file)                   "the truth"
```
- **Frontend** draws the screens and calls the backend over HTTP.
- **Backend** holds all the logic: auth, splitting maths, the importer, balances.
- **Database** stores users, groups, members, expenses, splits, settlements.

Three numbers that prove it's correct, all checked by automated tests:
1. Every expense's split shares **add up to the expense total** (no lost paise).
2. Everyone's net balances **add up to zero**.
3. A member's line-by-line breakdown **adds up to their net balance**.

## 3. The user journey (screen by screen)
1. **Sign up / log in.** Password is hashed (bcrypt); the server returns a token
   the browser stores and sends on every later request.
2. **Dashboard.** Your groups. "Create demo flat" makes a group pre-loaded with
   the assignment's people and their join/leave dates.
3. **Group → Balances.** Net position per person, plus the **settle-up plan**
   (fewest transfers). Click a person to see **every line** behind their number.
4. **Group → Expenses.** A table of all expenses; "Add expense" supports equal,
   unequal, percentage and share splits.
5. **Group → Members.** Each person's join/leave dates (this is what keeps Sam
   off March bills and Meera off post-March ones).
6. **Group → Settle up.** Record a payment; one-tap "suggested settlement".
7. **Group → Import CSV.** Upload the spreadsheet → review the anomaly report →
   **Approve & import**.

## 4. What happens behind the scenes (per action)
| You do… | Frontend calls | Backend does | DB effect |
|---|---|---|---|
| Sign up | `POST /api/auth/register` | bcrypt-hash password, sign a JWT | insert `users` |
| Add expense | `POST /api/groups/:id/expenses` | `computeSplits()` → per-person owed | insert `expenses` + `expense_splits` |
| View balances | `GET /api/groups/:id/balances` | `computeBalances()` + `simplifyDebts()` | reads only |
| Click a member | `GET …/members/:mid/breakdown` | `memberBreakdown()` | reads only |
| Record payment | `POST …/settlements` | store the transfer | insert `settlements` |
| Analyse CSV | `POST …/import/analyze` | `analyzeImport()` — **no writes** | nothing |
| Approve import | `POST …/import/commit` | `commitImport()` in one transaction | inserts everything |

## 5. The import, explained simply
The importer runs in **two steps on purpose**:
- **Analyse (dry run):** read the CSV, and for each row work out a *clean*
  version, a list of *anomalies*, and a *plan* (import as expense / import as
  settlement / skip). **It writes nothing.** The UI shows all of this.
- **Commit:** only when you click *Approve & import*, it writes the planned rows
  to the database in a single transaction (all-or-nothing).

For every row it follows the same three beats the brief asks for: **detect →
surface → handle**. A worked example using a real row:

> CSV row 7: `10-02-2026, Electricity Feb, Aisha, "1,200", INR, equal, …`
> - **Detect:** the amount `"1,200"` has a comma.
> - **Surface:** an "Auto-fixed" note: *"Amount had a thousands separator; parsed
>   as 1200."*
> - **Handle:** strip the comma → ₹1,200, split equally among the 4 members →
>   ₹300 each.

The full anomaly list (18 types on this file) with the policy for each is in
[SCOPE.md](SCOPE.md). The headline tricky calls:
- A **negative amount** is a refund, not an error.
- A **repayment/deposit** ("Rohan paid Aisha back", "Sam deposit") is a
  *settlement*, not a shared expense.
- **Duplicates**: identical one is dropped; a conflicting one (same dinner,
  different amount) keeps the first and flags the rest.
- A person **listed after they left** is removed from that split.

## 6. How a balance is calculated (the by-hand version)
For each person:
```
net balance = (everything they PAID)  −  (their SHARE of every expense)  +  (settlements they made)  −  (settlements they received)
```
- **positive** → the group owes them (creditor).
- **negative** → they owe the group (debtor).

Worked micro-example. Suppose only one expense exists: Aisha pays ₹1,200 for
electricity, split equally among Aisha, Rohan, Priya, Meera (₹300 each).
- Aisha: paid 1200, owes 300 → **+900** (she's owed ₹900).
- Rohan / Priya / Meera: paid 0, owe 300 → **−300** each.
- Check: 900 − 300 − 300 − 300 = **0**. ✓

The **settle-up plan** then matches the biggest debtor to the biggest creditor
until everyone is at zero, which gives the fewest payments.

Splitting itself uses the **largest-remainder rule**: divide, give everyone the
whole-paisa floor, then hand the leftover paise to whoever was rounded down most,
so the parts always sum back to the total.

## 7. Likely live-session questions (and answers)
- **"Trace what happens to row 34 (`04-05-2026`)."** → The file is DD-MM-YYYY, so
  it parses to 4 May, but that's *out of chronological order* (it sits between 28
  Mar and 1 Apr), so it's flagged `DATE_AMBIGUOUS` for review rather than guessed.
  See the chronological pass in `importer.js`.
- **"Change the rounding rule."** → It's isolated in `allocateByWeights()` in
  `splits.js`; change how the leftover paise are distributed there and every split
  type updates at once.
- **"Add a new split type."** → Map it to weights in `computeSplits()` (e.g. a new
  rule becomes a weights array) — the allocator and DB don't change.
- **"Why does Sam not owe March electricity?"** → His `joined_at` is 8 Apr; the
  `activeOn()` tenure check excludes him from any earlier expense.
- **"Why is row 14 not an expense?"** → It's a repayment (one counterparty +
  "paid back"), so it's routed to the `settlements` table; a transfer settles
  debt, it doesn't create a shared cost.
- **"Where could this break?"** → A wrong/oversimplified FX rate (documented
  single rate), and conflicting duplicates default to "keep first" — both are
  surfaced for review rather than hidden.

## 8. Mini glossary
- **Split** — how an expense's cost is divided among participants.
- **expense_splits** — the DB table with one row per participant = what they owe.
- **Settlement** — a direct payment A→B to clear debt (not a shared cost).
- **Tenure** — a member's join→leave window; controls who can be on an expense.
- **Guest** — a short-term participant (Dev on the trip, Kabir for a day).
- **Anomaly** — a data problem the importer detects, with a severity and a fix.
- **Minor units (paise)** — money stored as whole integers so maths is exact.
- **Largest-remainder** — the rounding rule that makes split parts sum exactly.
