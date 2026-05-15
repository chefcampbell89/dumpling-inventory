-- Add optional "expected receipt date" to purchase_orders.
-- Users enter this when creating/editing a PO so we can show an estimated
-- arrival on the PO list and (later) drive due-date alerts.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS expected_receipt_date DATE;

COMMENT ON COLUMN purchase_orders.expected_receipt_date IS
  'User-entered estimate of when the order will arrive. Independent of the PO creation date (po_date) and the actual receive date (which lives on the receipts table).';
