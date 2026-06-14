// theme.js — light/dark theme state.
// The actual class is applied to <html>; we persist the choice in localStorage.
// (An inline script in index.html applies it before first paint to avoid a flash.)
const KEY = 'se_theme';

export const getTheme = () => localStorage.getItem(KEY) || 'dark';

export function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  localStorage.setItem(KEY, t);
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
