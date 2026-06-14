// peek-db.mjs — print the contents of the SQLite database to the terminal.
// Usage:  node peek-db.mjs            (shows every table)
//         node peek-db.mjs expenses   (shows just one table)
import db from './src/db.js';

const only = process.argv[2];
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).all().map((t) => t.name);

for (const t of tables) {
  if (only && t !== only) continue;
  const rows = db.prepare(`SELECT * FROM ${t}`).all();
  console.log(`\n=== ${t} (${rows.length} rows) ===`);
  if (rows.length) console.table(rows);
}
console.log('');
