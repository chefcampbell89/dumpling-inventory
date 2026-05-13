-- Enable Row Level Security on every public table used by Dumpling Genie,
-- and add a baseline policy that requires Supabase Auth for ANY access.
--
-- Why: Vercel embeds VITE_SUPABASE_ANON_KEY in the client JS bundle, so the
-- key is effectively public. Without RLS, anyone who visits the deployed
-- site can extract that key and call the Supabase REST API directly to read
-- or modify any table. RLS-enabled tables, by contrast, deny everything by
-- default unless an explicit policy allows it.
--
-- Baseline policy: any authenticated Supabase user can read/write everything.
-- This matches what the app already allows in the UI (admin vs user gates
-- are UI-only). Tightening individual tables to admin-only writes is a
-- follow-up.
--
-- Run once in the Supabase SQL editor. Safe to re-run — uses IF NOT EXISTS
-- where Postgres supports it, and IF EXISTS / DROP-then-CREATE elsewhere.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS on every table
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_lines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors                ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lot_allocations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_lines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_lines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_consumed    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_hours            ENABLE ROW LEVEL SECURITY;
ALTER TABLE toast_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_weeks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_days          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Drop any existing "authenticated_all" policies so this script is idempotent
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS authenticated_all ON items;
DROP POLICY IF EXISTS authenticated_all ON bom_lines;
DROP POLICY IF EXISTS authenticated_all ON vendors;
DROP POLICY IF EXISTS authenticated_all ON item_vendors;
DROP POLICY IF EXISTS authenticated_all ON orders;
DROP POLICY IF EXISTS authenticated_all ON order_lot_allocations;
DROP POLICY IF EXISTS authenticated_all ON purchase_orders;
DROP POLICY IF EXISTS authenticated_all ON po_lines;
DROP POLICY IF EXISTS authenticated_all ON receipts;
DROP POLICY IF EXISTS authenticated_all ON receipt_lines;
DROP POLICY IF EXISTS authenticated_all ON production_runs;
DROP POLICY IF EXISTS authenticated_all ON production_consumed;
DROP POLICY IF EXISTS authenticated_all ON inventory_lots;
DROP POLICY IF EXISTS authenticated_all ON labor_hours;
DROP POLICY IF EXISTS authenticated_all ON toast_jobs;
DROP POLICY IF EXISTS authenticated_all ON forecast_weeks;
DROP POLICY IF EXISTS authenticated_all ON forecast_days;
DROP POLICY IF EXISTS authenticated_all ON app_settings;
DROP POLICY IF EXISTS authenticated_all ON wishes;
DROP POLICY IF EXISTS authenticated_all ON profiles;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Create the baseline policy on each table:
--    "any authenticated user can read and write"
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY authenticated_all ON items                 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON bom_lines             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON vendors               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON item_vendors          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON orders                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON order_lot_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON purchase_orders       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON po_lines              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON receipts              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON receipt_lines         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON production_runs       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON production_consumed   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON inventory_lots        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON labor_hours           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON toast_jobs            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON forecast_weeks        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON forecast_days         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON app_settings          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON wishes                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON profiles              FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Sanity check — confirm every table now has RLS enabled
-- ─────────────────────────────────────────────────────────────────────────
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Every row should show rowsecurity = true. If any show false, name them
-- above in the ALTER TABLE list and re-run.
