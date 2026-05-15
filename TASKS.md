# Dumpling Genie - Task List

Running backlog of features, fixes, and chores. Move items between sections as work progresses. Newest items at the top of each section.

**Tags:** `[bug]` `[feature]` `[chore]` `[ux]` `[infra]`

---

## Backlog

- [feature] Voice / pedal-as-push-to-talk for hands-free order and production-run completion. USB foot pedal → MediaRecorder → Whisper API → Claude tool use → on-screen confirm → second stomp executes. Single Anthropic API key on backend (Supabase Edge Function); no per-user accounts. Estimated 5-7 days; ~$5-15/mo in API fees. Design discussion: session 2026-05-14.
- [bug] Fix lot # on shipment transaction tracing
- [ux] Redo Orders tab layout / design
- [feature] Admin chatbot hooked up to Claude that allows layout / cosmetic changes only — read-only re: Supabase (no schema or data writes)
- [infra] Make the app more robust / configurable so it can be reused by other restaurants and food manufacturers (multi-tenant config, branding, configurable product lines, etc.)
- [feature] Wish alert system — notify admins when there are unfulfilled wishes

## In Progress

_(none)_

## Done

- [bug] Soft-delete (Discontinue) for items. Previous hard-delete was silently failing on FK constraints; cascade delete was destructive to historical records. Now flips `items.status` to `Discontinued`, hides from active lists/dropdowns, surfaces a Discontinued panel in Item Master with Restore. Shipped in `cde4b6d`.
- [feature] Dashboard: Dumplings by Flavor (on-order vs in-inventory, BOM-walking dumpling counts) + Today's/Tomorrow's Shipments split with order and piece totals. Shipped in `25d214f`.
- [bug] ListEditor input lost focus after every keystroke — component was defined inside render and recreated on each parent re-render. Moved out and gave it local state. Shipped in `3a3782a`.
- [feature] Order types + pricing matrix as a true grid (SKU rows × order-type columns), no tab toggling. Admin-configurable. Shipped in `b706304`, `467da42`.
- [feature] Editable POs (modify line items / quantities after creation) — shipped in `7eebff8`.
