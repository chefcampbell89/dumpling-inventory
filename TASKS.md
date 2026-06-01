# Dumpling Genie - Task List

Running backlog of features, fixes, and chores. Move items between sections as work progresses. Newest items at the top of each section.

**Tags:** `[bug]` `[feature]` `[chore]` `[ux]` `[infra]`

---

## Backlog

- [feature] Voice / pedal-as-push-to-talk for hands-free order and production-run completion. USB foot pedal → MediaRecorder → Whisper API → Claude tool use → on-screen confirm → second stomp executes. Single Anthropic API key on backend (Supabase Edge Function); no per-user accounts. Estimated 5-7 days; ~$5-15/mo in API fees. Design discussion: session 2026-05-14.
- [ux] Redo Orders tab layout / design
- [feature] Admin chatbot hooked up to Claude that allows layout / cosmetic changes only — read-only re: Supabase (no schema or data writes)
- [infra] Make the app more robust / configurable so it can be reused by other restaurants and food manufacturers (multi-tenant config, branding, configurable product lines, etc.)

## In Progress

_(none)_

## Done

- [feature] Admins can refill a user's wishes. Per-user "Wish Allowances" panel in Admin → Wishes shows each user's remaining lamps and a "Grant 3 more" button that resets their baseline so they get a fresh 3 (never exceeds 3 available at once). Stored in `app_settings.wish_baselines`. Shipped v174.
- [bug] Order tab search was too narrow (customer/id/status only) and split order groups. Now group-aware and matches customer, order id, status, type, order date, ship date, item SKU, item name, qty, and notes. Also extended search to POs (id/vendor/status/dates/line items) and Vendors (contact/email/phone/terms/notes). Shipped v174.
- [bug] Dashboard Outgoing Orders dropped order lines whose `shipDate` was null. Ship date is stored per-line; setting it then adding lines (or adding lines after) left siblings null, and the dashboard filtered per-line so they vanished (e.g. Crown O Maine showed 1 of 4 lines). Fixed: dashboard resolves an effective ship date per order group (`customer|||date`) so all siblings inherit it; newly-added lines now inherit the group's ship date too. Shipped v173.
- [feature] Purchase Needs: "On Order" and "Net Need" columns. Shows the quantity of each material already on open POs (Draft/Sent/Confirmed) so users can tell at a glance which shortfalls are pending receipt vs. still need a new PO. Rows are color-coded (sky-blue truck icon = pending receipt, red triangle = still to PO) and `Generate POs` only orders the Net Need so we don't double-order. Shipped v169.
- [feature] PO expected receipt date — optional date field on purchase orders, set at creation or via the Edit PO modal. Shown on the PO list next to the PO date. Migration: `migrations/2026-05-14-po-expected-receipt-date.sql`. Shipped v168 / sb v121.
- [feature] Defer lot # assignment from draft to completion. Plans made weeks in advance no longer burn lot numbers that get edited away. The Complete-draft modal now pre-fills with a suggestion computed from the current counter + actual completion date, which the user can edit. The global counter auto-syncs on submit via the existing `ensureCounterMatchesLot`. Shipped v168.
- [feature] Wish alert badge on Admin Config tab — red count badge on the sidebar icon when there are ungranted wishes awaiting an admin decision. Loads `allWishes` on admin login and recomputes via `useMemo`.
- [bug] Lot # on shipment transaction tracing — confirmed fixed.
- [bug] Soft-delete (Discontinue) for items. Previous hard-delete was silently failing on FK constraints; cascade delete was destructive to historical records. Now flips `items.status` to `Discontinued`, hides from active lists/dropdowns, surfaces a Discontinued panel in Item Master with Restore. Shipped in `cde4b6d`.
- [feature] Dashboard: Dumplings by Flavor (on-order vs in-inventory, BOM-walking dumpling counts) + Today's/Tomorrow's Shipments split with order and piece totals. Shipped in `25d214f`.
- [bug] ListEditor input lost focus after every keystroke — component was defined inside render and recreated on each parent re-render. Moved out and gave it local state. Shipped in `3a3782a`.
- [feature] Order types + pricing matrix as a true grid (SKU rows × order-type columns), no tab toggling. Admin-configurable. Shipped in `b706304`, `467da42`.
- [feature] Editable POs (modify line items / quantities after creation) — shipped in `7eebff8`.
