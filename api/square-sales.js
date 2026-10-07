// SQUARE SALES API VERSION: v2
// Vercel serverless function — read-only Square sales viewer.
//
// Modes (query string):
//   ?mode=locations   List Square locations (id, name, status).
//   ?mode=sales&start=<ISO>&end=<ISO>&locations=<id,id,...>
//                     Pull COMPLETED orders closed in [start, end) at the given
//                     locations, and roll line items up by dumpling flavor.
//
// Read-only: only calls Square's GET locations and POST orders/search (a
// search, not a write). Nothing is stored. Requires a signed-in app user
// (Supabase access token in the Authorization header) so sales data isn't
// publicly readable.
//
// Required env vars: SQUARE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

const SQUARE_BASE = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2025-01-23";
const MAX_LOCATIONS_PER_SEARCH = 10; // Square's SearchOrders limit

// Item/variation name → flavor code. Best-guess patterns (broadened from the
// order-form Apps Script) until we have the Square item library; check the
// "Square items" table on the tab for anything landing in unmapped.
// First match wins, so order matters: both "Cheddar Scallion Potato" and
// "Curried Sweet Potato" contain "Potato", so neither may match on that word
// alone; "Cheeseburger" must be tested before the beef pattern.
const FLAVORS = [
  { code: "LG", label: "Lemongrass Pork",       re: /lemongrass/i },
  { code: "GC", label: "Ginger Chicken",        re: /ginger/i },
  { code: "CS", label: "Curried Sweet Potato",  re: /curr(y|ied)|sweet potato/i },
  { code: "CH", label: "Cheddar Potato",        re: /cheddar|scallion potato/i },
  { code: "CB", label: "Cheeseburger",          re: /cheeseburger|burger/i },
  { code: "KB", label: "Korean BBQ Beef",       re: /korean|bbq|bulgogi|beef/i },
  { code: "TM", label: "Tofu Mushroom",         re: /5[\s-]?spice|five[\s-]?spice|tofu|mushroom/i },
];

// Every line is a retail pack of dumplings unless its name says "4pc" (or
// "6 pc", "4-pcs", "4 pieces"…) — those are hot-food servings of N dumplings.
const HOT_FOOD_RE = /(\d+)\s*-?\s*(?:pcs?|pieces?)\b/i;
const UNMAPPED = { code: "OTHER", label: "Other / unmapped" };

// Non-dumpling products sold at the stand. Checked before FLAVORS so e.g.
// "Ginger Scallion Sauce" or "BBQ sauce" isn't counted as a dumpling pack.
// Whole words only — "tea" must not match "steamed", nor "hat" "chat".
const NON_DUMPLING_RE = /\b(sauces?|chili crisp|chili oil|dressing|t-?shirts?|shirts?|hats?|totes?|stickers?|gift cards?|cookbooks?|books?|merch|drinks?|sodas?|water|tea|coffee)\b/i;

function flavorFor(name, variation) {
  const text = `${name || ""} ${variation || ""}`;
  if (NON_DUMPLING_RE.test(text)) return UNMAPPED;
  return FLAVORS.find((f) => f.re.test(text)) || UNMAPPED;
}

function squareHeaders() {
  return {
    "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json",
  };
}

async function requireUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return false;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data?.user;
}

async function listLocations() {
  const r = await fetch(`${SQUARE_BASE}/locations`, { headers: squareHeaders() });
  if (!r.ok) throw new Error(`Square locations failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (j.locations || [])
    .map((l) => ({ id: l.id, name: l.name || l.id, status: l.status || "ACTIVE" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function searchOrders(locationIds, startAt, endAt) {
  const orders = [];
  let cursor;
  do {
    const body = {
      location_ids: locationIds,
      limit: 500,
      query: {
        filter: {
          state_filter: { states: ["COMPLETED"] },
          date_time_filter: { closed_at: { start_at: startAt, end_at: endAt } },
        },
        // Square requires the sort field to match the date filter field.
        sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
      },
      ...(cursor ? { cursor } : {}),
    };
    const r = await fetch(`${SQUARE_BASE}/orders/search`, {
      method: "POST", headers: squareHeaders(), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Square orders search failed: ${r.status} ${await r.text()}`);
    const j = await r.json();
    if (Array.isArray(j.orders)) orders.push(...j.orders);
    cursor = j.cursor;
  } while (cursor);
  return orders;
}

const cents = (m) => Number(m?.amount) || 0;

function aggregate(orders) {
  const flavors = new Map(); // code → { code, label, qty, netCents }
  const items = new Map();   // "flavor|name|variation" → { ... }
  let customCents = 0;

  const add = (li, sign) => {
    const qty = (Number(li.quantity) || 0) * sign;
    // Net = gross minus discounts, before tax.
    const net = (cents(li.gross_sales_money) - cents(li.total_discount_money)) * sign;
    const isCustom = li.item_type === "CUSTOM_AMOUNT" || !li.catalog_object_id;
    const f = flavorFor(li.name, li.variation_name);
    if (isCustom) customCents += net;
    const hot = isCustom ? null : `${li.name || ""} ${li.variation_name || ""}`.match(HOT_FOOD_RE);
    const piecesEach = hot ? Number(hot[1]) : 0;
    // Custom amounts have no item, and merch/sauces aren't dumplings, so
    // neither counts as packs or servings.
    const nonDumpling = NON_DUMPLING_RE.test(`${li.name || ""} ${li.variation_name || ""}`);
    const kind = isCustom ? "custom" : nonDumpling ? "non-dumpling" : hot ? "hot" : "pack";

    if (!flavors.has(f.code)) flavors.set(f.code, { code: f.code, label: f.label, packs: 0, hotServings: 0, hotPieces: 0, netCents: 0 });
    const fa = flavors.get(f.code);
    fa.netCents += net;
    if (kind === "pack") fa.packs += qty;
    if (kind === "hot") { fa.hotServings += qty; fa.hotPieces += qty * piecesEach; }

    const name = li.name || (isCustom ? "Custom amount" : "(unnamed)");
    const variation = li.variation_name || "";
    const key = `${f.code}|${name}|${variation}`;
    if (!items.has(key)) items.set(key, { flavor: f.code, name, variation, kind, piecesEach, qty: 0, netCents: 0 });
    const ia = items.get(key);
    ia.qty += qty; ia.netCents += net;
  };

  for (const o of orders) {
    for (const li of o.line_items || []) add(li, 1);
    for (const ret of o.returns || []) {
      for (const li of ret.return_line_items || []) add(li, -1);
    }
  }

  const order = [...FLAVORS.map((f) => f.code), UNMAPPED.code];
  return {
    flavors: [...flavors.values()].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code)),
    items: [...items.values()].sort((a, b) => b.netCents - a.netCents),
    customCents,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const missing = ["SQUARE_ACCESS_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
    if (missing.length) {
      res.status(503).json({ ok: false, error: `Missing env vars: ${missing.join(", ")}` });
      return;
    }
    if (!(await requireUser(req))) {
      res.status(401).json({ ok: false, error: "Sign in required" });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const mode = url.searchParams.get("mode") || "sales";

    if (mode === "locations") {
      res.status(200).json({ ok: true, locations: await listLocations() });
      return;
    }

    if (mode === "sales") {
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const locationIds = (url.searchParams.get("locations") || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
        res.status(400).json({ ok: false, error: "start and end (ISO dates) are required" });
        return;
      }
      if (locationIds.length === 0) {
        res.status(200).json({ ok: true, orderCount: 0, flavors: [], items: [], customCents: 0 });
        return;
      }

      const chunks = [];
      for (let i = 0; i < locationIds.length; i += MAX_LOCATIONS_PER_SEARCH) {
        chunks.push(locationIds.slice(i, i + MAX_LOCATIONS_PER_SEARCH));
      }
      const results = await Promise.all(chunks.map((c) => searchOrders(c, start, end)));
      const orders = results.flat();
      res.status(200).json({ ok: true, orderCount: orders.length, ...aggregate(orders) });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown mode: ${mode}` });
  } catch (e) {
    console.error("square-sales error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
