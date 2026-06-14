// lib.js — small display helpers shared across pages.

// Format INR minor units (paise) as "₹1,234.50" with Indian digit grouping.
export function formatINR(minor) {
  const sign = minor < 0 ? '-' : '';
  const rupees = Math.abs(minor) / 100;
  return sign + '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Colour + label for the four anomaly severities (works in light AND dark).
export const SEV_STYLE = {
  fixed:   { ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-300', label: 'Auto-fixed' },
  info:    { ring: 'ring-sky-500/30',     bg: 'bg-sky-500/10',     text: 'text-sky-600 dark:text-sky-300',         label: 'Info' },
  review:  { ring: 'ring-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-600 dark:text-amber-300',     label: 'Needs review' },
  dropped: { ring: 'ring-rose-500/30',    bg: 'bg-rose-500/10',    text: 'text-rose-600 dark:text-rose-300',       label: 'Dropped' },
};

export const PLAN_STYLE = {
  expense:    { text: 'text-brand-600 dark:text-brand-300',   dot: 'bg-brand-500',   label: 'Import as expense' },
  settlement: { text: 'text-indigo-600 dark:text-indigo-300', dot: 'bg-indigo-500',  label: 'Import as settlement' },
  skip:       { text: 'text-rose-600 dark:text-rose-300',     dot: 'bg-rose-400',    label: 'Skip (not imported)' },
};

export const prettyDate = (iso) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
