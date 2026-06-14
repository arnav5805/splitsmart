# FORMULAS.md — the maths & logic behind SplitSmart

Every calculation and decision rule in the app, with the exact formula and a
worked example using the real `Expenses Export (1).csv`. If you can explain this
page, you can defend the "walk through your balance calculation by hand" part of
the live session.

Code references: [`money.js`](server/src/money.js) ·
[`splits.js`](server/src/splits.js) · [`balances.js`](server/src/balances.js) ·
[`importer.js`](server/src/importer.js).

---

## 0. Golden rule: money is integer **paise**
Every amount is stored as a whole number of paise (₹1 = 100 paise). Floating
point can't hold `0.1` exactly, so splitting in decimals makes the parts drift
and balances stop reconciling. Integers + the rounding rule in §3 guarantee the
pieces always add back to the whole.

> ₹1,200 → `120000` paise.   `formatINR(120000)` → `"₹1,200.00"`.

---

## 1. Parsing an amount — `parseAmount(raw)`
Cleans a raw CSV cell and converts to paise.

```
hadComma     = raw contains ","
cleaned      = raw with "," and ₹/$ removed
num          = Number(cleaned)
exactPaise   = num × 100
minor        = round(exactPaise)              // half-up rounding
hadSubPaisa  = |exactPaise − minor| > 0
```

| Input | num | exactPaise | minor (stored) | flag |
|---|---|---|---|---|
| `"1,200"` (row 7) | 1200 | 120000 | **120000** | thousands-separator |
| `899.995` (row 10) | 899.995 | 89999.5 | **90000** (=₹900.00) | sub-paisa rounded |
| `-30` (row 26) | −30 | −3000 | **−3000** | negative → refund |
| `3200` | 3200 | 320000 | **320000** | — |

---

## 2. Currency conversion — `toINRminor(minor, currency)`
```
amountINR = (currency == "USD") ? round(minor × 83) : minor
```
A single documented rate **1 USD = ₹83** is used for the whole trip (see
[DECISIONS.md](DECISIONS.md) #9). The original amount + currency are kept too.

> Row 21 "Beach shack lunch" = `84 USD` → `8400 × 83 = 697200` paise = **₹6,972.00**.

---

## 3. Splitting one expense — the largest-remainder method
The core helper is `allocateByWeights(total, weights)`. Given a total (paise) and
a weight per person, it returns whole-paise amounts that **sum to the total
exactly**.

```
totalWeight = Σ wᵢ
exactᵢ      = total × wᵢ / totalWeight          // fractional ideal share
floorᵢ      = ⌊exactᵢ⌋                           // give everyone the floor
remainder   = total − Σ floorᵢ                   // leftover paise (0 … n−1)
→ sort people by fractional part (exactᵢ − floorᵢ), descending
→ add 1 paisa to the first `remainder` of them
```
This hands the spare paise to whoever was rounded down the most — fair, and the
result always reconciles.

**Worked example — equal split of ₹3,200 among 3** (`total = 320000`, weights
`[1,1,1]`):
```
exact  = 106666.67 each
floor  = [106666, 106666, 106666]  → sum 319998
remainder = 320000 − 319998 = 2
fractions all equal → first 2 get +1
result = [106667, 106667, 106666]  → sum 320000 ✓  (₹1066.67, ₹1066.67, ₹1066.66)
```

### How each split type maps to weights — `computeSplits()`
| Split type | Weights used | Notes |
|---|---|---|
| **equal** | all `1` | even division |
| **share** | the ratios | e.g. row 22 `1;2;1;2` |
| **percentage** | the percentages | normalised by their **sum**, so 110% is handled |
| **unequal** | n/a — explicit amounts | each value parsed + converted; sum validated against total |

**Share example — row 22 "Scooter rentals" ₹3,600, shares `Aisha1;Rohan2;Priya1;Dev2`**
(`total = 360000`, totalWeight = 6):
```
Aisha = 360000×1/6 = 60000  = ₹600
Rohan = 360000×2/6 = 120000 = ₹1200
Priya = 60000  = ₹600
Dev   = 120000 = ₹1200
sum = 360000 ✓
```

**Percentage example — row 32 "Weekend brunch" ₹2,200, `30;30;30;20` (=110%)**
(`total = 220000`, totalWeight = 110):
```
30% people: 220000×30/110 = 60000 = ₹600 each
20% person: 220000×20/110 = 40000 = ₹400
sum = 600×3 + 400 = 220000 ✓   (110% normalised away cleanly)
```

**Unequal example — row 12 "Aisha birthday cake" ₹1,500, `Rohan700;Priya400;Meera400`:**
each amount is taken literally (converted to INR if needed); the app checks
`700+400+400 = 1500` ✓ and flags it if they didn't match.

---

## 4. Net balance per member — `computeBalances()`
For every member, accumulate:
```
net = Σ(amount of expenses they PAID)
    − Σ(their owed share of every expense)
    + Σ(settlements they SENT)
    − Σ(settlements they RECEIVED)
```
- `net > 0` → **creditor** (the group owes them).
- `net < 0` → **debtor** (they owe the group).
- Across all members, **Σ net = 0** (asserted by the test).

**Worked micro-example** — one expense: Aisha pays ₹1,200, split equally among
Aisha/Rohan/Priya/Meera (₹300 each):
```
Aisha: paid 1200, owes 300 → +900
Rohan: paid 0,    owes 300 → −300
Priya: −300
Meera: −300
check: 900 − 300 − 300 − 300 = 0 ✓
```
Why a settlement *adds* to the sender: paying down your debt moves your negative
balance toward zero, so `+amount` to the sender and `−amount` to the receiver.

---

## 5. Fewest transfers — `simplifyDebts()` (greedy min-cash-flow)
```
creditors = members with net > 0   (sorted by amount, desc)
debtors   = members with net < 0   (use |net|, sorted desc)
while a debtor and a creditor remain:
    pay = min(biggest debtor, biggest creditor)
    record "debtor → creditor : pay"
    subtract pay from both; drop whoever hits 0
```
Matching the largest debtor to the largest creditor each step keeps the number of
payments small (Aisha's "one number per person, who pays whom").

**Example:** balances `A +900, R −300, P −300, M −300` → one creditor (A 900),
three debtors (300 each) → transfers: `R→A 300`, `P→A 300`, `M→A 300`. Three
payments, everyone at zero.

---

## 6. One member's line-by-line breakdown — `memberBreakdown()`
For the chosen member, per row:
```
expense line:    paid = (they paid ? amount : 0)
                 owed = their split share (or 0)
                 effect = paid − owed
settlement line: effect = +amount if they sent it, −amount if they received it
total = Σ effect          // equals their net balance from §4, exactly
```
This is Rohan's "no magic numbers": the lines literally add up to the headline.
The test asserts `total === net balance` for a member.

---

## 7. Date parsing — `parseDate(raw)` + chronological check
1. `"Mon-DD"` (e.g. `Mar-14`) → month-name format, year inferred 2026 → `2026-03-14`.
2. `"DD-MM-YYYY"` → ISO `YYYY-MM-DD`. The file is day-first (many rows have
   day > 12, e.g. `25-02-2026`), so this is unambiguous *as a format*.
3. **Ambiguity is detected by order, not by guessing per row.** After parsing,
   any row whose date is later than the row after it is out of sequence:
   ```
   if date[i] > date[i+1]  →  flag DATE_AMBIGUOUS (review)
   ```
   On this file that fires exactly once — row 34 `04-05-2026`, which parses to
   4 May but sits between 28 Mar and 1 Apr.

---

## 8. Duplicate detection — token overlap (Jaccard)
Description → a set of significant tokens (lowercased, alphanumeric, length ≥ 3).
Similarity of two sets A, B:
```
J(A,B) = |A ∩ B| / |A ∪ B|
```
Two rows are "the same item" when they share a **date** and `J ≥ 0.6`. Then:
```
same amount AND same payer  →  DUPLICATE_EXACT   (drop the later row)
otherwise                   →  DUPLICATE_CONFLICT (keep the first, skip + flag)
```

| Rows | Tokens | J | Amounts / payers | Verdict |
|---|---|---|---|---|
| 5 & 6 | {dinner,marina,bites} vs {dinner,marina,bites} | 1.0 | ₹3200 Dev = ₹3200 Dev | **EXACT** → drop row 6 |
| 24 & 25 | {dinner,thalassa} vs {thalassa,dinner} | 1.0 | ₹2400 Aisha ≠ ₹2450 Rohan | **CONFLICT** → keep 24, skip 25 |

---

## 9. Settlement-vs-expense detection
A row is reclassified as a money transfer (not a shared cost) when:
```
exactly ONE counterparty (split_with minus the payer = 1 person)
AND ( split_type is blank  OR  text matches /paid .*back | settle | repay | deposit/i )
```
- Row 14 "Rohan paid Aisha back", blank split type, counterparty Aisha →
  settlement **Rohan → Aisha ₹5,000**.
- Row 38 "Sam deposit share", note "paid Aisha his deposit", counterparty Aisha →
  settlement **Sam → Aisha ₹15,000**.

---

## 10. Membership tenure — `activeOn(member, date)`
```
active = NOT (joined_at exists AND date < joined_at)
     AND NOT (left_at  exists AND date > left_at)
```
A non-guest participant who isn't active on the expense date is removed from the
split and the cost redistributed among the active members (anomaly
`MEMBER_OUTSIDE_TENURE`).
- Sam joined 8 Apr → excluded from any earlier expense.
- Meera left 31 Mar → row 36 (2 Apr groceries) drops her before splitting.

---

## 11. Anomaly severities (how each is treated)
```
fixed   → auto-corrected deterministically (e.g. comma, currency, name)
info    → intentional/notable, imported as-is (e.g. refund, share type)
review  → a human judgement is involved; surfaced for approval before commit
dropped → not imported (zero amount, exact duplicate)
```
The full per-row catalogue (18 types) is in [SCOPE.md](SCOPE.md).

---

### Invariants the tests assert (your correctness proof)
1. **Each expense:** `Σ owedᵢ == amount_inr_minor` (no paise lost). — §3
2. **Whole group:** `Σ netᵢ == 0`. — §4
3. **Each member:** `Σ breakdown effects == net balance`. — §6

Run `node server/test-import.mjs` and `node server/test-api.mjs` to see all three
hold on the real data.
