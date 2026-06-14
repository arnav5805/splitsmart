// importer.js
// ---------------------------------------------------------------------------
// THE CORE OF THE ASSIGNMENT. Ingests expenses_export.csv EXACTLY as provided
// (no hand-editing) and for every deliberate data problem it:
//   1. DETECTS it
//   2. SURFACES it (every anomaly ends up in the import report)
//   3. HANDLES it via a documented policy (auto-fix, reclassify, or hold for review)
//
// Two phases:
//   analyzeImport(csvText, roster)  -> pure analysis, NO database writes. Produces
//                                      the import report + a per-row "plan".
//   commitImport(db, groupId, analysis) -> applies the plan (only after the user
//                                      approves, satisfying Meera's request).
//
// Splitting analysis from commit is what lets the UI show a dry-run preview and
// let the user approve everything before anything is deleted or changed.
// ---------------------------------------------------------------------------

import { parse } from 'csv-parse/sync';
import { parseAmount, toINRminor } from './money.js';
import { computeSplits, parseSplitDetails } from './splits.js';

// Severity drives how the UI colours each anomaly:
//   fixed   = auto-corrected, no action needed
//   info    = notable but intentional (e.g. a refund)
//   review  = needs a human decision before/at commit (Meera approves)
//   dropped = the row will NOT be imported
export const SEV = { FIXED: 'fixed', INFO: 'info', REVIEW: 'review', DROPPED: 'dropped' };

// The canonical group roster with the membership timeline taken from the brief:
// Meera left end of March; Sam moved in mid-April; Dev was a trip guest.
// Guests discovered during import (e.g. Kabir) are appended to a working copy.
export const CANONICAL_ROSTER = [
  { name: 'Aisha', joined_at: null, left_at: null, is_guest: 0 },
  { name: 'Rohan', joined_at: null, left_at: null, is_guest: 0 },
  { name: 'Priya', joined_at: null, left_at: null, is_guest: 0 },
  { name: 'Meera', joined_at: null, left_at: '2026-03-31', is_guest: 0 },
  { name: 'Dev', joined_at: '2026-02-01', left_at: null, is_guest: 1 },
  { name: 'Sam', joined_at: '2026-04-08', left_at: null, is_guest: 0 },
];

// ---- small helpers ---------------------------------------------------------

// Significant tokens of a description, used for duplicate detection.
function descTokens(desc) {
  return new Set(
    String(desc || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Parse the many date formats found in the CSV into ISO YYYY-MM-DD.
// Returns { iso, valid, reformatted, ambiguous }.
function parseDate(raw) {
  const s = String(raw || '').trim();
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

  // "Mar-14"  ->  month name + day, year assumed 2026 (the dataset year)
  let m = s.match(/^([A-Za-z]{3})-(\d{1,2})$/);
  if (m) {
    const mm = months[m[1].toLowerCase()];
    if (mm) return { iso: `2026-${String(mm).padStart(2,'0')}-${m[2].padStart(2,'0')}`, valid: true, reformatted: true };
  }

  // "DD-MM-YYYY" (the dominant format in the file — many rows have day > 12,
  // e.g. 14-02, 25-02, so the whole file is unambiguously day-first). We parse
  // everything as DD-MM-YYYY confidently; the ONE genuinely ambiguous row is
  // caught later by a chronological-order check, not by a per-row guess.
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    return { iso: `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, valid: d <= 31 && mo <= 12 };
  }

  return { iso: null, valid: false };
}

// Resolve a raw person name to a canonical member, fuzzy-matching variants
// like "priya", "rohan " (trailing space), "Priya S". Unknown names become guests.
function resolveName(raw, roster) {
  const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { name: null, valid: false };

  // exact (case-insensitive)
  let hit = roster.find((r) => r.name.toLowerCase() === cleaned.toLowerCase());
  if (hit) return { name: hit.name, valid: true, changed: hit.name !== cleaned, from: cleaned };

  // first-token match ("Priya S" -> Priya)
  const first = cleaned.split(' ')[0];
  hit = roster.find((r) => r.name.toLowerCase() === first.toLowerCase());
  if (hit) return { name: hit.name, valid: true, changed: true, from: cleaned };

  // unknown -> treat the last word as a guest's name ("Dev's friend Kabir" -> Kabir)
  const guestName = cleaned.split(' ').pop().replace(/[^A-Za-z]/g, '');
  const display = guestName.charAt(0).toUpperCase() + guestName.slice(1);
  return { name: display, valid: true, isUnknown: true, from: cleaned };
}

function activeOn(member, isoDate) {
  if (!member) return true;
  if (member.joined_at && isoDate < member.joined_at) return false;
  if (member.left_at && isoDate > member.left_at) return false;
  return true;
}

// ---------------------------------------------------------------------------
// analyzeImport: the dry run. Returns { rows, summary, roster }.
// ---------------------------------------------------------------------------
export function analyzeImport(csvText, baseRoster = CANONICAL_ROSTER) {
  const roster = baseRoster.map((r) => ({ ...r })); // working copy; guests appended here
  // Coerce to string: depending on how the client sends the file the body can
  // arrive as a string, a Buffer, or (from some HTTP clients) an array of lines.
  const text = Array.isArray(csvText) ? csvText.join('\n') : String(csvText);
  const records = parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });

  const rows = [];
  const seenByDate = []; // for duplicate detection

  records.forEach((rec, idx) => {
    const lineNo = idx + 2; // +1 for header, +1 for 1-based
    const anomalies = [];
    const add = (code, severity, message) => anomalies.push({ code, severity, message });

    // --- amount -----------------------------------------------------------
    const amt = parseAmount(rec.amount);
    if (amt.hadComma) add('NUMBER_THOUSANDS_SEP', SEV.FIXED, `Amount "${rec.amount}" had a thousands separator; parsed as ${amt.minor / 100}.`);
    if (amt.hadSubPaisa) add('SUB_PAISA_ROUNDED', SEV.FIXED, `Amount "${rec.amount}" had sub-paisa precision; rounded to ${amt.minor / 100}.`);

    // --- currency ---------------------------------------------------------
    let currency = (rec.currency || '').trim().toUpperCase();
    if (!currency) { currency = 'INR'; add('MISSING_CURRENCY', SEV.FIXED, 'Currency was blank; defaulted to INR (the group base currency).'); }
    const amountINRminor = amt.valid ? toINRminor(amt.minor, currency) : null;
    if (currency === 'USD') add('CURRENCY_CONVERTED', SEV.FIXED, `Converted ${amt.minor / 100} USD to ₹${amountINRminor / 100} at the documented trip rate (1 USD = ₹83).`);

    // --- date -------------------------------------------------------------
    const dt = parseDate(rec.date);
    if (dt.reformatted) add('DATE_REFORMATTED', SEV.FIXED, `Date "${rec.date}" used a non-standard format; normalised to ${dt.iso}.`);
    if (!dt.valid) add('DATE_INVALID', SEV.REVIEW, `Could not parse date "${rec.date}".`);

    // --- payer ------------------------------------------------------------
    let paidBy = null;
    if (!String(rec.paid_by || '').trim()) {
      add('MISSING_PAYER', SEV.REVIEW, 'No payer recorded ("can\'t remember who paid"). Cannot attribute the expense; held for manual correction.');
    } else {
      const r = resolveName(rec.paid_by, roster);
      paidBy = r.name;
      if (r.changed) add('NAME_NORMALISED', SEV.FIXED, `Payer "${r.from}" normalised to "${r.name}".`);
      if (r.isUnknown) add('UNKNOWN_MEMBER', SEV.REVIEW, `Payer "${r.from}" is not a known member; added as guest "${r.name}".`);
    }

    // --- participants -----------------------------------------------------
    const rawParts = String(rec.split_with || '').split(';').map((s) => s.trim()).filter(Boolean);
    const participants = [];
    for (const p of rawParts) {
      const r = resolveName(p, roster);
      if (!r.valid) continue;
      if (r.changed) add('NAME_NORMALISED', SEV.FIXED, `Participant "${r.from}" normalised to "${r.name}".`);
      if (r.isUnknown && !roster.find((x) => x.name === r.name)) {
        roster.push({ name: r.name, joined_at: dt.iso, left_at: dt.iso, is_guest: 1 });
        add('UNKNOWN_MEMBER', SEV.REVIEW, `"${r.from}" is not a group member; added as a one-day guest "${r.name}" so the split still balances.`);
      }
      if (!participants.includes(r.name)) participants.push(r.name);
    }

    // membership-time check: was each participant actually in the flat on this date?
    if (dt.iso) {
      for (const name of [...participants]) {
        const mem = roster.find((r) => r.name === name);
        if (mem && !mem.is_guest && !activeOn(mem, dt.iso)) {
          const reason = mem.left_at && dt.iso > mem.left_at ? `left on ${mem.left_at}` : `joined on ${mem.joined_at}`;
          add('MEMBER_OUTSIDE_TENURE', SEV.REVIEW, `${name} ${reason} but appears in this ${dt.iso} expense; removed from the split and the cost redistributed among active members.`);
          participants.splice(participants.indexOf(name), 1);
        }
      }
    }

    // --- split type -------------------------------------------------------
    let splitType = (rec.split_type || '').trim().toLowerCase();
    const details = parseSplitDetails(rec.split_details);
    if (splitType === 'share') add('SPLIT_TYPE_SHARE', SEV.INFO, 'Uses the "share" (ratio) split type — supported natively.');
    if (splitType === 'equal' && details.length) {
      const allOnes = details.every((d) => d.value === details[0].value);
      add('SPLITTYPE_DETAIL_MISMATCH', SEV.FIXED, allOnes
        ? 'split_type is "equal" but explicit (identical) shares were also provided; the equal rule is used and the redundant shares ignored.'
        : 'split_type is "equal" but non-uniform shares were provided; honoured split_type=equal and ignored the conflicting shares.');
    }
    if ((splitType === 'percentage') ) {
      const total = details.reduce((a, d) => a + d.value, 0);
      if (Math.abs(total - 100) > 0.001) add('PERCENT_NOT_100', SEV.REVIEW, `Percentages add up to ${total}%, not 100%; normalised proportionally.`);
    }

    // --- amount sign / zero ----------------------------------------------
    let isRefund = false;
    if (amt.valid && amt.minor < 0) { isRefund = true; add('NEGATIVE_AMOUNT_REFUND', SEV.INFO, 'Negative amount treated as a refund (reduces balances), not an error.'); }
    if (amt.valid && amt.minor === 0) add('ZERO_AMOUNT', SEV.DROPPED, 'Amount is 0 ("counted twice earlier"); skipped as a no-op.');

    // --- settlement-not-expense (repayment / deposit logged as an expense) -
    const uniqueCounterparties = participants.filter((p) => p !== paidBy);
    const looksLikeTransfer = /paid .*back|settle|repay|deposit/i.test(`${rec.description} ${rec.notes || ''}`);
    const isSettlement =
      paidBy && uniqueCounterparties.length === 1 &&
      (splitType === '' || looksLikeTransfer);

    // --- duplicate detection ---------------------------------------------
    const tokens = descTokens(rec.description);
    let dupOf = null, dupConflict = false;
    for (const prev of seenByDate) {
      if (prev.iso && prev.iso === dt.iso && jaccard(prev.tokens, tokens) >= 0.6) {
        dupOf = prev.lineNo;
        dupConflict = prev.amountINRminor !== amountINRminor || prev.paidBy !== paidBy;
        break;
      }
    }
    if (dupOf && !dupConflict) add('DUPLICATE_EXACT', SEV.DROPPED, `Exact duplicate of row ${dupOf} (same date, payer and amount); skipped.`);
    if (dupOf && dupConflict) add('DUPLICATE_CONFLICT', SEV.REVIEW, `Looks like the same item as row ${dupOf} but with a different amount/payer. Kept row ${dupOf} (first logged) and skipped this one; please confirm which is correct.`);

    // --- decide the plan --------------------------------------------------
    let plan;
    if (!amt.valid) plan = { action: 'skip', reason: 'unparseable amount' };
    else if (amt.minor === 0) plan = { action: 'skip', reason: 'zero amount' };
    else if (dupOf) plan = { action: 'skip', reason: dupConflict ? 'conflicting duplicate (kept first)' : 'exact duplicate' };
    else if (isSettlement) plan = { action: 'settlement', from: paidBy, to: uniqueCounterparties[0], amountINRminor };
    else if (!paidBy) plan = { action: 'skip', reason: 'no payer to attribute the expense to' };
    else if (!participants.length) plan = { action: 'skip', reason: 'no valid participants' };
    else plan = { action: 'expense' };

    if (isSettlement) add('SETTLEMENT_NOT_EXPENSE', SEV.REVIEW, `Reclassified as a settlement: ${paidBy} → ${uniqueCounterparties[0]} of ₹${amountINRminor / 100}. It is a transfer, not a shared cost, so it does not create new debt.`);

    // record for duplicate comparison (only meaningful, kept rows)
    seenByDate.push({ lineNo, iso: dt.iso, tokens, amountINRminor, paidBy });

    rows.push({
      line: lineNo,
      raw: rec,
      cleaned: {
        date: dt.iso, description: rec.description, paidBy,
        amountMinor: amt.minor, currency, amountINRminor,
        splitType: splitType || 'equal', participants, detailsRaw: rec.split_details, isRefund,
      },
      anomalies,
      plan,
    });
  });

  // Chronological-order check: the export is meant to be sorted by date. A row
  // whose date sits LATER than the row after it is out of order, which usually
  // means its date was mis-entered or mis-formatted (the classic "04-05-2026 —
  // April 5 or May 4?" case). We surface exactly those rows for review instead
  // of crying wolf on every date.
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i].cleaned.date, b = rows[i + 1].cleaned.date;
    if (a && b && a > b) {
      rows[i].anomalies.push({
        code: 'DATE_AMBIGUOUS', severity: SEV.REVIEW,
        message: `Date "${rows[i].raw.date}" is out of chronological order (parsed as ${a}, but the next row is ${b}). The day/month may be swapped; defaulted to DD-MM-YYYY — please confirm.`,
      });
    }
  }

  // summary counts
  const byCode = {};
  let anomalyCount = 0;
  for (const r of rows) for (const a of r.anomalies) { byCode[a.code] = (byCode[a.code] || 0) + 1; anomalyCount++; }
  const summary = {
    totalRows: rows.length,
    expenses: rows.filter((r) => r.plan.action === 'expense').length,
    settlements: rows.filter((r) => r.plan.action === 'settlement').length,
    skipped: rows.filter((r) => r.plan.action === 'skip').length,
    anomalyCount,
    distinctAnomalyTypes: Object.keys(byCode).length,
    byCode,
  };

  return { rows, summary, roster };
}

// ---------------------------------------------------------------------------
// commitImport: apply the approved plan to the database, inside one transaction
// so a failure rolls everything back (no half-imported state).
// ---------------------------------------------------------------------------
export function commitImport(db, groupId, analysis) {
  const ensureMember = db.prepare('SELECT id FROM members WHERE group_id = ? AND name = ?');
  const insertMember = db.prepare('INSERT INTO members (group_id, name, joined_at, left_at, is_guest) VALUES (?, ?, ?, ?, ?)');
  const insertExpense = db.prepare(`INSERT INTO expenses
    (group_id, date, description, paid_by, amount_minor, currency, amount_inr_minor, split_type, notes, is_refund, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import')`);
  const insertSplit = db.prepare('INSERT INTO expense_splits (expense_id, member_id, owed_minor) VALUES (?, ?, ?)');
  const insertSettlement = db.prepare(`INSERT INTO settlements
    (group_id, from_member, to_member, amount_inr_minor, date, note, source) VALUES (?, ?, ?, ?, ?, ?, 'import')`);
  const insertRun = db.prepare('INSERT INTO import_runs (group_id, report_json) VALUES (?, ?)');

  // resolve a member name to its id, creating guests/members from the roster as needed
  const memberId = (name) => {
    const found = ensureMember.get(groupId, name);
    if (found) return found.id;
    const r = analysis.roster.find((x) => x.name === name) || { joined_at: null, left_at: null, is_guest: 1 };
    return insertMember.run(groupId, name, r.joined_at, r.left_at, r.is_guest).lastInsertRowid;
  };

  const tx = db.transaction(() => {
    let expenses = 0, settlements = 0;
    for (const row of analysis.rows) {
      const c = row.cleaned;
      if (row.plan.action === 'expense') {
        const pid = memberId(c.paidBy);
        const expId = insertExpense.run(
          groupId, c.date, c.description, pid, c.amountMinor, c.currency, c.amountINRminor, c.splitType, row.raw.notes || null, c.isRefund ? 1 : 0,
        ).lastInsertRowid;
        const participants = c.participants.map((n) => ({ memberId: memberId(n), name: n }));
        const { shares } = computeSplits({
          amountINRminor: c.amountINRminor, splitType: c.splitType, participants, detailsRaw: c.detailsRaw, currency: c.currency,
        });
        for (const s of shares) insertSplit.run(expId, s.memberId, s.owedMinor);
        expenses++;
      } else if (row.plan.action === 'settlement') {
        insertSettlement.run(groupId, memberId(row.plan.from), memberId(row.plan.to), row.plan.amountINRminor, c.date, row.raw.description);
        settlements++;
      }
    }
    insertRun.run(groupId, JSON.stringify({ summary: analysis.summary, rows: analysis.rows }));
    return { expenses, settlements };
  });

  return tx();
}
