// balances.js
// ---------------------------------------------------------------------------
// Turns expenses + settlements into "who owes whom".
//
// Net balance per member = (total they PAID) - (total they OWE) - (settlements).
//   positive  -> the group owes them money (they are a creditor)
//   negative  -> they owe the group money (they are a debtor)
// Net balances always sum to zero (every rupee paid is owed by someone).
//
// simplifyDebts() turns those net positions into the FEWEST direct transfers
// (Aisha's request: "one number per person, who pays whom, done") by greedily
// matching the biggest debtor to the biggest creditor.
//
// memberBreakdown() backs Rohan's request ("no magic numbers"): for one member
// it lists every expense line that contributed to their balance.
// ---------------------------------------------------------------------------

export function computeBalances(db, groupId) {
  const members = db.prepare('SELECT * FROM members WHERE group_id = ?').all(groupId);
  const net = new Map(members.map((m) => [m.id, 0]));

  // money each member PAID (expenses they fronted), minus refunds they received
  for (const e of db.prepare('SELECT * FROM expenses WHERE group_id = ?').all(groupId)) {
    if (e.paid_by != null) net.set(e.paid_by, (net.get(e.paid_by) || 0) + e.amount_inr_minor);
  }
  // money each member OWES (their share of each expense)
  for (const s of db.prepare(
    'SELECT es.* FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = ?',
  ).all(groupId)) {
    net.set(s.member_id, (net.get(s.member_id) || 0) - s.owed_minor);
  }
  // settlements: a payment from A to B settles A's debt -> A's balance goes UP, B's DOWN
  for (const t of db.prepare('SELECT * FROM settlements WHERE group_id = ?').all(groupId)) {
    net.set(t.from_member, (net.get(t.from_member) || 0) + t.amount_inr_minor);
    net.set(t.to_member, (net.get(t.to_member) || 0) - t.amount_inr_minor);
  }

  return members.map((m) => ({
    memberId: m.id, name: m.name, is_guest: !!m.is_guest, left_at: m.left_at,
    netMinor: net.get(m.id) || 0,
  }));
}

// Greedy minimum-cash-flow settlement: fewest transfers that clear all debts.
export function simplifyDebts(balances) {
  const creditors = balances.filter((b) => b.netMinor > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.netMinor < 0).map((b) => ({ ...b, netMinor: -b.netMinor }));
  creditors.sort((a, b) => b.netMinor - a.netMinor);
  debtors.sort((a, b) => b.netMinor - a.netMinor);

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].netMinor, creditors[j].netMinor);
    if (pay > 0) transfers.push({ from: debtors[i].name, to: creditors[j].name, amountMinor: pay });
    debtors[i].netMinor -= pay;
    creditors[j].netMinor -= pay;
    if (debtors[i].netMinor === 0) i++;
    if (creditors[j].netMinor === 0) j++;
  }
  return transfers;
}

// Itemised contributions to one member's balance (Rohan's "show me the lines").
export function memberBreakdown(db, groupId, memberId) {
  const lines = [];

  for (const e of db.prepare('SELECT * FROM expenses WHERE group_id = ? ORDER BY date').all(groupId)) {
    const split = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ? AND member_id = ?').get(e.id, memberId);
    const paid = e.paid_by === memberId ? e.amount_inr_minor : 0;
    const owed = split ? split.owed_minor : 0;
    if (paid === 0 && owed === 0) continue;
    lines.push({
      type: 'expense', date: e.date, description: e.description,
      paidMinor: paid, owedMinor: owed, effectMinor: paid - owed,
    });
  }
  for (const t of db.prepare('SELECT * FROM settlements WHERE group_id = ? ORDER BY date').all(groupId)) {
    if (t.from_member === memberId) lines.push({ type: 'settlement', date: t.date, description: t.note || 'Settlement (you paid)', effectMinor: t.amount_inr_minor });
    if (t.to_member === memberId) lines.push({ type: 'settlement', date: t.date, description: t.note || 'Settlement (you received)', effectMinor: -t.amount_inr_minor });
  }

  lines.sort((a, b) => (a.date < b.date ? -1 : 1));
  const totalMinor = lines.reduce((a, l) => a + l.effectMinor, 0);
  return { lines, totalMinor };
}
