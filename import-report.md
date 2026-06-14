# Import Report

- Rows read: **42**
- Imported as expenses: **36**
- Imported as settlements: **2**
- Skipped: **4**
- Anomalies detected: **26** across **18** types

## Anomalies by type

- `DUPLICATE_EXACT`: 1
- `NUMBER_THOUSANDS_SEP`: 1
- `NAME_NORMALISED`: 3
- `SUB_PAISA_ROUNDED`: 1
- `MISSING_PAYER`: 1
- `SETTLEMENT_NOT_EXPENSE`: 2
- `PERCENT_NOT_100`: 2
- `CURRENCY_CONVERTED`: 4
- `SPLIT_TYPE_SHARE`: 2
- `UNKNOWN_MEMBER`: 1
- `DUPLICATE_CONFLICT`: 1
- `NEGATIVE_AMOUNT_REFUND`: 1
- `DATE_REFORMATTED`: 1
- `MISSING_CURRENCY`: 1
- `ZERO_AMOUNT`: 1
- `DATE_AMBIGUOUS`: 1
- `MEMBER_OUTSIDE_TENURE`: 1
- `SPLITTYPE_DETAIL_MISMATCH`: 1

## Per-row detail

### Row 6: dinner - marina bites
- Action: **skip** (exact duplicate)
- [dropped] `DUPLICATE_EXACT` — Exact duplicate of row 5 (same date, payer and amount); skipped.

### Row 7: Electricity Feb
- Action: **expense**
- [fixed] `NUMBER_THOUSANDS_SEP` — Amount "1,200" had a thousands separator; parsed as 1200.

### Row 9: Movie night snacks
- Action: **expense**
- [fixed] `NAME_NORMALISED` — Payer "priya" normalised to "Priya".

### Row 10: Cylinder refill
- Action: **expense**
- [fixed] `SUB_PAISA_ROUNDED` — Amount "899.995" had sub-paisa precision; rounded to 900.

### Row 11: Groceries DMart
- Action: **expense**
- [fixed] `NAME_NORMALISED` — Payer "Priya S" normalised to "Priya".

### Row 13: House cleaning supplies
- Action: **skip** (no payer to attribute the expense to)
- [review] `MISSING_PAYER` — No payer recorded ("can't remember who paid"). Cannot attribute the expense; held for manual correction.

### Row 14: Rohan paid Aisha back
- Action: **settlement**
- [review] `SETTLEMENT_NOT_EXPENSE` — Reclassified as a settlement: Rohan → Aisha of ₹5000. It is a transfer, not a shared cost, so it does not create new debt.

### Row 15: Pizza Friday
- Action: **expense**
- [review] `PERCENT_NOT_100` — Percentages add up to 110%, not 100%; normalised proportionally.

### Row 20: Goa villa booking
- Action: **expense**
- [fixed] `CURRENCY_CONVERTED` — Converted 540 USD to ₹44820 at the documented trip rate (1 USD = ₹83).

### Row 21: Beach shack lunch
- Action: **expense**
- [fixed] `CURRENCY_CONVERTED` — Converted 84 USD to ₹6972 at the documented trip rate (1 USD = ₹83).

### Row 22: Scooter rentals
- Action: **expense**
- [info] `SPLIT_TYPE_SHARE` — Uses the "share" (ratio) split type — supported natively.

### Row 23: Parasailing
- Action: **expense**
- [fixed] `CURRENCY_CONVERTED` — Converted 150 USD to ₹12450 at the documented trip rate (1 USD = ₹83).
- [review] `UNKNOWN_MEMBER` — "Dev's friend Kabir" is not a group member; added as a one-day guest "Kabir" so the split still balances.

### Row 25: Thalassa dinner
- Action: **skip** (conflicting duplicate (kept first))
- [review] `DUPLICATE_CONFLICT` — Looks like the same item as row 24 but with a different amount/payer. Kept row 24 (first logged) and skipped this one; please confirm which is correct.

### Row 26: Parasailing refund
- Action: **expense**
- [fixed] `CURRENCY_CONVERTED` — Converted -30 USD to ₹-2490 at the documented trip rate (1 USD = ₹83).
- [info] `NEGATIVE_AMOUNT_REFUND` — Negative amount treated as a refund (reduces balances), not an error.

### Row 27: Airport cab
- Action: **expense**
- [fixed] `DATE_REFORMATTED` — Date "Mar-14" used a non-standard format; normalised to 2026-03-14.
- [fixed] `NAME_NORMALISED` — Payer "rohan" normalised to "Rohan".

### Row 28: Groceries DMart
- Action: **expense**
- [fixed] `MISSING_CURRENCY` — Currency was blank; defaulted to INR (the group base currency).

### Row 31: Dinner order Swiggy
- Action: **skip** (zero amount)
- [dropped] `ZERO_AMOUNT` — Amount is 0 ("counted twice earlier"); skipped as a no-op.

### Row 32: Weekend brunch
- Action: **expense**
- [review] `PERCENT_NOT_100` — Percentages add up to 110%, not 100%; normalised proportionally.

### Row 34: Deep cleaning service
- Action: **expense**
- [review] `DATE_AMBIGUOUS` — Date "04-05-2026" is out of chronological order (parsed as 2026-05-04, but the next row is 2026-04-01). The day/month may be swapped; defaulted to DD-MM-YYYY — please confirm.

### Row 35: April rent
- Action: **expense**
- [info] `SPLIT_TYPE_SHARE` — Uses the "share" (ratio) split type — supported natively.

### Row 36: Groceries BigBasket
- Action: **expense**
- [review] `MEMBER_OUTSIDE_TENURE` — Meera left on 2026-03-31 but appears in this 2026-04-02 expense; removed from the split and the cost redistributed among active members.

### Row 38: Sam deposit share
- Action: **settlement**
- [review] `SETTLEMENT_NOT_EXPENSE` — Reclassified as a settlement: Sam → Aisha of ₹15000. It is a transfer, not a shared cost, so it does not create new debt.

### Row 42: Furniture for common room
- Action: **expense**
- [fixed] `SPLITTYPE_DETAIL_MISMATCH` — split_type is "equal" but explicit (identical) shares were also provided; the equal rule is used and the redundant shares ignored.

