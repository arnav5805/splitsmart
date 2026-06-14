// money.js
// ---------------------------------------------------------------------------
// All money in this app is stored as INTEGER MINOR UNITS (paise for INR).
// Why: floating point can't represent 0.1 exactly, so 3200/3 in float drifts.
// Working in integers means every split adds back up to the exact total.
//
// Exposed helpers:
//   parseAmount(raw)        -> { minor, hadComma, hadSubPaisa, rounded }  (parses "1,200", "899.995", etc.)
//   USD_TO_INR              -> documented fixed FX rate used for the trip
//   toINRminor(minor, ccy)  -> converts a minor-unit amount in `ccy` to INR minor units
//   formatINR(minor)        -> "₹1,234.50" for display
// ---------------------------------------------------------------------------

// Fixed FX rate for the assignment. A production app would store a dated rate
// per transaction (see DECISIONS.md); for this dataset we use one documented rate.
export const USD_TO_INR = 83;

// Parse a raw amount cell from the CSV into integer minor units (paise).
// Handles the deliberate anomalies:
//   - thousands separators:  "1,200"      -> 120000 paise   (hadComma = true)
//   - sub-paisa precision:   "899.995"    -> 90000  paise   (hadSubPaisa = true, rounded up)
//   - normal values:         "3200"       -> 320000 paise
//   - negative refunds:      "-30"        -> -3000  paise
// Returns { minor, hadComma, hadSubPaisa } so the importer can flag what it changed.
export function parseAmount(raw) {
  if (raw === null || raw === undefined) return { minor: null, valid: false };
  const original = String(raw).trim();
  if (original === '') return { minor: null, valid: false };

  const hadComma = original.includes(',');
  // Strip thousands separators and any stray currency symbols.
  const cleaned = original.replace(/,/g, '').replace(/[₹$]/g, '').trim();

  const num = Number(cleaned);
  if (Number.isNaN(num)) return { minor: null, valid: false, hadComma };

  // Convert to paise. Multiplying a float by 100 can leave 0.0001 dust,
  // so we round to the nearest integer paise (half-up). 899.995 -> 90000 (=900.00).
  const exactPaise = num * 100;
  const minor = Math.round(exactPaise);
  // sub-paisa = the value had more precision than paise (e.g. 899.995 -> .5 paise)
  const hadSubPaisa = Math.abs(exactPaise - minor) > 1e-9;

  return { minor, valid: true, hadComma, hadSubPaisa };
}

// Convert an amount (in its own currency's minor units) to INR minor units.
export function toINRminor(minor, currency) {
  if (currency === 'USD') return Math.round(minor * USD_TO_INR);
  return minor; // INR (or assumed-INR) passes through unchanged
}

// Pretty-print INR minor units as "₹1,234.50" using the Indian digit grouping.
export function formatINR(minor) {
  const sign = minor < 0 ? '-' : '';
  const rupees = Math.abs(minor) / 100;
  return sign + '₹' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
