// Dump every Supabase table to JSON files in backups/<timestamp>/.
// Run BEFORE the RLS migration (or any time you want a snapshot):
//
//   node scripts/backup-supabase.mjs
//
// Reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from .env.local. With the
// anon key, this works as long as RLS is currently off (or you're logged in,
// which this script is not). After enabling RLS, switch to SUPABASE_SERVICE_ROLE_KEY
// in .env.local — that key bypasses RLS and lets you back up everything.
//
// The script never modifies data — it only SELECTs from each table.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars manually so we don't need a dotenv dep.
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.VITE_SUPABASE_URL;
// Prefer service_role if set (works after RLS is on). Falls back to anon
// (works before RLS, or for whichever tables anon can SELECT).
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const tables = [
  "items", "bom_lines", "vendors", "item_vendors",
  "orders", "order_lot_allocations",
  "purchase_orders", "po_lines",
  "receipts", "receipt_lines",
  "production_runs", "production_consumed",
  "inventory_lots",
  "labor_hours", "toast_jobs",
  "forecast_weeks", "forecast_days",
  "app_settings", "wishes", "profiles",
];

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(__dirname, "..", "backups", ts);
fs.mkdirSync(outDir, { recursive: true });

console.log(`Writing snapshot to ${outDir}\n`);

let totalRows = 0;
let okCount = 0;
let failed = [];

for (const t of tables) {
  process.stdout.write(`  ${t.padEnd(28)} `);
  // Paginate to handle tables > 1000 rows (Supabase default limit).
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.from(t).select("*").range(from, from + pageSize - 1);
    if (error) {
      console.log(`✗ ${error.message}`);
      failed.push({ table: t, error: error.message });
      allRows = null;
      break;
    }
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  if (allRows === null) continue;
  fs.writeFileSync(path.join(outDir, `${t}.json`), JSON.stringify(allRows, null, 2));
  console.log(`✓ ${allRows.length} rows`);
  totalRows += allRows.length;
  okCount += 1;
}

// Write a manifest so the restore side knows what's in the snapshot.
fs.writeFileSync(path.join(outDir, "_manifest.json"), JSON.stringify({
  takenAt: new Date().toISOString(),
  supabaseUrl: url,
  tables: tables.length,
  successful: okCount,
  failed,
  totalRows,
}, null, 2));

console.log(`\nDone — ${okCount}/${tables.length} tables, ${totalRows} total rows.`);
if (failed.length) {
  console.log(`\n${failed.length} table(s) failed:`);
  for (const f of failed) console.log(`  - ${f.table}: ${f.error}`);
  console.log("\nIf you're using the anon key and have RLS on, switch to SUPABASE_SERVICE_ROLE_KEY in .env.local. Find it in Supabase → Project Settings → API → service_role secret. Keep that key off public clients.");
  process.exit(1);
}
