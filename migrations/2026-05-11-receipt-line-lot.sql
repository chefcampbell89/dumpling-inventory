-- Add lot_number column to receipt_lines so shipment / receipt rows can
-- record which lot each line of inventory moved against. The column is
-- nullable for backwards compatibility with non-lot-tracked items and
-- with rows created before this migration.
--
-- Run once in the Supabase SQL editor before deploying code that reads
-- or writes this column.

ALTER TABLE receipt_lines
  ADD COLUMN IF NOT EXISTS lot_number TEXT;
