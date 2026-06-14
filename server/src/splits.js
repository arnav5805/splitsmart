// splits.js
// ---------------------------------------------------------------------------
// Turns one expense into "who owes how much" rows that sum EXACTLY to the total.
//
// Supported split types (every type that appears in the CSV):
//   equal       -> divide the total evenly among participants
//   unequal     -> explicit absolute amounts per person ("Rohan 700; Priya 400")
//   percentage  -> percentage per person ("Aisha 30%; Rohan 30%")
//   share       -> integer ratio per person ("Aisha 1; Rohan 2")
//
// The hard part is rounding. ₹3200 / 3 = ₹1066.666...  We must NOT silently
// drop the leftover paise, or balances won't reconcile. We use the
// LARGEST-REMAINDER method: give everyone the floor, then hand the leftover
// paise out one at a time to whoever was rounded down the most. The result
// always sums back to the exact total. (Documented in DECISIONS.md.)
// ---------------------------------------------------------------------------

import { parseAmount, toINRminor } from './money.js';

// Distribute `totalMinor` across positions in proportion to `weights`,
// returning integers that sum EXACTLY to totalMinor (largest-remainder rounding).
export function allocateByWeights(totalMinor, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error('Split weights must be positive');

  // Exact (fractional) target for each position.
  const exact = weights.map((w) => (totalMinor * w) / totalWeight);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = totalMinor - floors.reduce((a, b) => a + b, 0);

  // Hand out the leftover paise to the largest fractional parts first.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);

  const result = floors.slice();
  for (let k = 0; k < remainder; k++) result[order[k % order.length].i] += 1;
  return result;
}

// Parse "Name 700; Name 400" or "Name 30%; Name 20%" into [{ name, value }].
export function parseSplitDetails(raw) {
  if (!raw) return [];
  return String(raw)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      // last token is the number, the rest is the name (handles "Priya S 400")
      const m = part.match(/^(.*?)[\s]+([\-\d.]+)%?$/);
      if (!m) return null;
      return { name: m[1].trim(), value: Number(m[2]) };
    })
    .filter(Boolean);
}

// Compute the per-member owed amounts (in INR minor units) for one expense.
//   participants : [{ memberId, name }]  (already resolved + currency-converted total)
//   amountINRminor : the expense total in INR minor units
//   splitType, detailsRaw, currency : straight from the (cleaned) CSV row
// Returns { shares: [{ memberId, owedMinor }], warnings: [...] }
export function computeSplits({ amountINRminor, splitType, participants, detailsRaw, currency }) {
  const warnings = [];
  const names = participants.map((p) => p.name);
  const details = parseSplitDetails(detailsRaw);

  // Helper to look up a detail value by participant name (case-insensitive).
  const valueFor = (name) => {
    const d = details.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return d ? d.value : null;
  };

  let owed;

  if (splitType === 'unequal') {
    // Explicit absolute amounts. Convert each from the expense currency to INR.
    const rawValues = names.map((n) => valueFor(n));
    if (rawValues.some((v) => v === null)) {
      warnings.push('unequal split is missing an amount for at least one participant');
    }
    owed = rawValues.map((v) => toINRminor(parseAmount(String(v ?? 0)).minor, currency));
    const sum = owed.reduce((a, b) => a + b, 0);
    if (sum !== amountINRminor) {
      warnings.push(
        `unequal split parts sum to ${sum / 100} but the expense total is ${amountINRminor / 100}`,
      );
    }
  } else if (splitType === 'percentage') {
    const pcts = names.map((n) => valueFor(n) ?? 0);
    const totalPct = pcts.reduce((a, b) => a + b, 0);
    if (Math.abs(totalPct - 100) > 0.001) {
      warnings.push(`percentages add up to ${totalPct}%, not 100% — normalised proportionally`);
    }
    // Use percentages as weights; allocateByWeights normalises by their sum,
    // so a 110% total is handled by scaling everyone down proportionally.
    owed = allocateByWeights(amountINRminor, pcts.map((p) => p || 0.000001));
  } else if (splitType === 'share') {
    const shares = names.map((n) => valueFor(n) ?? 0);
    if (shares.some((s) => s <= 0)) warnings.push('a share split has a zero/negative share');
    owed = allocateByWeights(amountINRminor, shares.map((s) => s || 0.000001));
  } else {
    // equal (default / fallback). Everyone gets weight 1.
    owed = allocateByWeights(amountINRminor, names.map(() => 1));
  }

  const shares = participants.map((p, i) => ({ memberId: p.memberId, owedMinor: owed[i] }));
  return { shares, warnings };
}
