// SQUARE SALES VERSION: v2
// Read-only viewer: Square (farmers market / pop-up) sales by dumpling flavor,
// filtered by date range and any number of Square locations. All Square calls
// go through /api/square-sales — the access token never reaches the browser.

import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabase";
import { Loader2, ChevronDown, ChevronRight, X, Search, AlertTriangle, RefreshCw } from "lucide-react";

const STORAGE_KEY = "squareSales.locations";
const FLAVOR_COLORS = {
  CB: "#f59e0b", CH: "#fbbf24", GC: "#22c55e", LG: "#38bdf8",
  TM: "#a78bfa", CS: "#fb923c", KB: "#ef4444", OTHER: "#666",
};

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const money = (c) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyFmt = (q) => q.toLocaleString(undefined, { maximumFractionDigits: 2 });

const PRESETS = [
  { id: "7", label: "7d", start: () => daysAgo(6) },
  { id: "30", label: "30d", start: () => daysAgo(29) },
  { id: "90", label: "90d", start: () => daysAgo(89) },
  { id: "ytd", label: "YTD", start: () => `${new Date().getFullYear()}-01-01` },
  { id: "365", label: "1y", start: () => daysAgo(364) },
];

async function api(params, signal) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const resp = await fetch(`/api/square-sales?${new URLSearchParams(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  let j;
  try { j = await resp.json(); } catch { throw new Error(`Square endpoint returned ${resp.status}`); }
  if (!resp.ok || !j.ok) throw new Error(j.error || `Square endpoint returned ${resp.status}`);
  return j;
}

function loadStoredSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

const card = { background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 10, padding: 16 };
const btn = (active) => ({
  padding: "6px 12px", borderRadius: 6, border: "1px solid #2a2a3a", cursor: "pointer", fontSize: 12,
  background: active ? "#6366f1" : "#1e1e2e", color: active ? "#fff" : "#bbb", fontWeight: active ? 600 : 500,
});
const th = { padding: "8px 10px", color: "#888", fontSize: 11, fontWeight: 600, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.4 };
const td = { padding: "9px 10px", color: "#e0e0e0", fontSize: 13 };

// packSizes: { [flavorCode]: dumplings per retail pack } from the item master
// (400-{code} Pack). Read-only data from App — this tab never writes anything.
export default function SquareSales({ packSizes = {} }) {
  const [locations, setLocations] = useState([]);
  const [locLoading, setLocLoading] = useState(true);
  const [locError, setLocError] = useState(null);
  const [selected, setSelected] = useState(() => new Set(loadStoredSelection() || []));
  const [showInactive, setShowInactive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locSearch, setLocSearch] = useState("");
  const [preset, setPreset] = useState("30");
  const [start, setStart] = useState(daysAgo(29));
  const [end, setEnd] = useState(ymd(new Date()));
  const [fetched, setFetched] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pickerRef = useRef(null);

  // Locations, once. First visit (nothing stored) defaults to every active location.
  useEffect(() => {
    let cancelled = false;
    api({ mode: "locations" })
      .then((j) => {
        if (cancelled) return;
        setLocations(j.locations);
        if (loadStoredSelection() === null) {
          setSelected(new Set(j.locations.filter((l) => l.status === "ACTIVE").map((l) => l.id)));
        }
      })
      .catch((e) => { if (!cancelled) setLocError(e.message); })
      .finally(() => { if (!cancelled) setLocLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (locLoading) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected])); } catch { /* storage unavailable */ }
  }, [selected, locLoading]);

  // Close the location picker on outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const selectedKey = useMemo(() => [...selected].sort().join(","), [selected]);

  // Sales — debounced so ticking several location boxes triggers one request.
  useEffect(() => {
    if (locLoading || locError || !selectedKey || start > end) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true); setFetchError(null);
      const endExclusive = parseYmd(end); endExclusive.setDate(endExclusive.getDate() + 1);
      api({
        mode: "sales",
        start: parseYmd(start).toISOString(),
        end: endExclusive.toISOString(),
        locations: selectedKey,
      }, ctrl.signal)
        .then(setFetched)
        .catch((e) => { if (e.name !== "AbortError") setFetchError(e.message); })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [selectedKey, start, end, locLoading, locError, reloadKey]);

  // Derived, not stored: with no locations picked there's nothing to show,
  // and a reversed date range is a form error rather than a fetch error.
  const data = selectedKey ? fetched : null;
  const error = start > end ? "Start date is after end date." : selectedKey ? fetchError : null;

  const nameById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l.name])), [locations]);
  const shownLocations = useMemo(() => {
    const q = locSearch.trim().toLowerCase();
    return locations.filter((l) => (showInactive || l.status === "ACTIVE" || selected.has(l.id)) && (!q || l.name.toLowerCase().includes(q)));
  }, [locations, locSearch, showInactive, selected]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectShown = () => setSelected((s) => new Set([...s, ...shownLocations.map((l) => l.id)]));
  const clearShown = () => setSelected((s) => { const n = new Set(s); shownLocations.forEach((l) => n.delete(l.id)); return n; });

  const applyPreset = (p) => { setPreset(p.id); setStart(p.start()); setEnd(ymd(new Date())); };

  // Dumplings = packs × that flavor's pack size + hot-food pieces. Packs of a
  // flavor with no pack size in the item master (or unmapped) can't be
  // converted, so they're counted separately and flagged rather than guessed.
  const flavorRows = useMemo(() => {
    if (!data) return [];
    return data.flavors.map((f) => {
      const size = f.code === "OTHER" ? 0 : Number(packSizes[f.code]) || 0;
      const unconvertedPacks = size > 0 ? 0 : f.packs;
      return { ...f, packSize: size, unconvertedPacks, dumplings: f.packs * size + f.hotPieces };
    });
  }, [data, packSizes]);
  const totals = useMemo(() => {
    if (!data) return null;
    const sum = (k) => flavorRows.reduce((s, f) => s + f[k], 0);
    const netCents = sum("netCents");
    return {
      netCents, dumplings: sum("dumplings"), packs: sum("packs"), hotServings: sum("hotServings"), hotPieces: sum("hotPieces"),
      unconvertedPacks: sum("unconvertedPacks"),
      customPct: netCents > 0 ? (data.customCents / netCents) * 100 : 0,
    };
  }, [data, flavorRows]);
  const maxFlavorCents = data ? Math.max(1, ...data.flavors.map((f) => f.netCents)) : 1;
  const selectedList = [...selected].filter((id) => nameById[id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filters */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((p) => <button key={p.id} onClick={() => applyPreset(p)} style={btn(preset === p.id)}>{p.label}</button>)}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#888" }}>
          <input type="date" value={start} max={end} onChange={(e) => { setPreset("custom"); setStart(e.target.value); }}
            style={{ background: "#1e1e2e", color: "#e0e0e0", border: "1px solid #2a2a3a", borderRadius: 6, padding: "5px 8px", colorScheme: "dark" }} />
          to
          <input type="date" value={end} min={start} onChange={(e) => { setPreset("custom"); setEnd(e.target.value); }}
            style={{ background: "#1e1e2e", color: "#e0e0e0", border: "1px solid #2a2a3a", borderRadius: 6, padding: "5px 8px", colorScheme: "dark" }} />
        </div>

        <div ref={pickerRef} style={{ position: "relative" }}>
          <button onClick={() => setPickerOpen((o) => !o)} disabled={locLoading || !!locError} style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6 }}>
            {locLoading ? <Loader2 size={12} className="spin" /> : null}
            Locations: {locLoading ? "loading…" : `${selectedList.length} of ${locations.length}`}
            <ChevronDown size={12} />
          </button>
          {pickerOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, width: 340, maxWidth: "85vw", background: "#1e1e2e", border: "1px solid #2a2a3a", borderRadius: 10, boxShadow: "0 12px 32px #000a", padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 6, padding: "5px 8px", marginBottom: 8 }}>
                <Search size={12} color="#666" />
                <input autoFocus value={locSearch} onChange={(e) => setLocSearch(e.target.value)} placeholder="Search locations…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e0e0", fontSize: 12 }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, fontSize: 11 }}>
                <button onClick={selectShown} style={{ ...btn(false), padding: "3px 8px", fontSize: 11 }}>Select shown</button>
                <button onClick={clearShown} style={{ ...btn(false), padding: "3px 8px", fontSize: 11 }}>Clear shown</button>
                <label style={{ marginLeft: "auto", color: "#888", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
                </label>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {shownLocations.length === 0 && <div style={{ padding: 12, color: "#555", fontSize: 12, textAlign: "center" }}>No locations match.</div>}
                {shownLocations.map((l) => (
                  <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: l.status === "ACTIVE" ? "#e0e0e0" : "#777" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#23233355"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                    <span style={{ flex: 1 }}>{l.name}</span>
                    {l.status !== "ACTIVE" && <span style={{ fontSize: 10, color: "#666", border: "1px solid #333", borderRadius: 4, padding: "0 4px" }}>inactive</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={() => setReloadKey((k) => k + 1)} disabled={loading || !selectedKey} title="Re-pull from Square" style={{ ...btn(false), display: "flex", alignItems: "center", gap: 4 }}>
          {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Refresh
        </button>

        {selectedList.length > 0 && selectedList.length <= 12 && (
          <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectedList.map((id) => (
              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#6366f122", border: "1px solid #6366f155", color: "#c7c8ff", borderRadius: 12, padding: "2px 8px", fontSize: 11 }}>
                {nameById[id]}
                <X size={11} style={{ cursor: "pointer" }} onClick={() => toggle(id)} />
              </span>
            ))}
          </div>
        )}
      </div>

      {locError && (
        <div style={{ ...card, borderColor: "#ef444466", color: "#fca5a5", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <AlertTriangle size={16} /> Couldn't load Square locations: {locError}
        </div>
      )}
      {error && (
        <div style={{ ...card, borderColor: "#ef444466", color: "#fca5a5", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      {!locLoading && !locError && selectedList.length === 0 && (
        <div style={{ ...card, color: "#888", fontSize: 13, textAlign: "center" }}>Pick one or more locations to see sales.</div>
      )}

      {data && totals && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 150ms", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <Tile label="Net Sales" value={money(totals.netCents)} color="#22c55e" sub="after discounts, before tax" />
            <Tile label="Dumplings Sold" value={qtyFmt(totals.dumplings)} color="#fbbf24"
              sub={`${qtyFmt(totals.packs)} packs + ${qtyFmt(totals.hotServings)} hot-food servings (${qtyFmt(totals.hotPieces)} pcs)`} />
            <Tile label="Orders" value={data.orderCount.toLocaleString()} color="#e0e0e0" sub={`${selectedList.length} location${selectedList.length === 1 ? "" : "s"}`} />
            <Tile label="Custom Amounts" value={money(data.customCents)} color={totals.customPct > 5 ? "#f59e0b" : "#888"}
              sub={`${totals.customPct.toFixed(1)}% of sales — no item, can't map to a flavor`} />
          </div>

          {/* By flavor */}
          <div style={card}>
            <div style={{ color: "#e0e0e0", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Sales by Flavor</div>
            {data.flavors.length === 0 ? (
              <div style={{ color: "#555", fontSize: 12, padding: 12, textAlign: "center" }}>No completed sales in this range.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th}>Flavor</th>
                    <th style={{ ...th, textAlign: "right" }}>Packs</th>
                    <th style={{ ...th, textAlign: "right" }}>Hot Food</th>
                    <th style={{ ...th, textAlign: "right" }}>Dumplings</th>
                    <th style={{ ...th, textAlign: "right" }}>Net Sales</th>
                    <th style={{ ...th, width: "35%" }}>Share</th>
                  </tr></thead>
                  <tbody>
                    {flavorRows.map((f) => {
                      const pct = totals.netCents > 0 ? (f.netCents / totals.netCents) * 100 : 0;
                      const color = FLAVOR_COLORS[f.code] || "#888";
                      return (
                        <tr key={f.code} style={{ borderTop: "1px solid #2a2a3a" }}>
                          <td style={td}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: color, marginRight: 8 }} />
                            <span style={{ color: f.code === "OTHER" ? "#888" : "#e0e0e0" }}>{f.label}</span>
                            {f.code !== "OTHER" && <span style={{ color: "#555", fontSize: 11, marginLeft: 6 }}>{f.code}</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right" }} title={f.packSize ? `${f.packSize} dumplings per pack` : "No pack size in the item master — packs not converted to dumplings"}>
                            {qtyFmt(f.packs)}
                            {f.packs !== 0 && <span style={{ color: f.packSize ? "#555" : "#f59e0b", fontSize: 10, marginLeft: 4 }}>{f.packSize ? `×${f.packSize}` : "×?"}</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {f.hotServings ? <>{qtyFmt(f.hotServings)} <span style={{ color: "#555", fontSize: 10 }}>({qtyFmt(f.hotPieces)} pcs)</span></> : <span style={{ color: "#555" }}>—</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#fbbf24", fontWeight: 600 }}>{qtyFmt(f.dumplings)}</td>
                          <td style={{ ...td, textAlign: "right", color: "#22c55e" }}>{money(f.netCents)}</td>
                          <td style={td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 8, background: "#23233a", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${(f.netCents / maxFlavorCents) * 100}%`, height: "100%", background: color }} />
                              </div>
                              <span style={{ color: "#888", fontSize: 11, width: 40, textAlign: "right" }}>{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ color: "#555", fontSize: 11, marginTop: 8 }}>
                  Dumplings = packs × pack size (from the item master's 400-… Pack) + hot-food pieces. Items with "4pc"-style names count as hot food; everything else counts as a pack.
                  {totals.unconvertedPacks > 0 && <span style={{ color: "#f59e0b" }}> {qtyFmt(totals.unconvertedPacks)} pack(s) marked ×? have no known pack size and aren't in the dumpling total.</span>}
                </div>
              </div>
            )}
          </div>

          {/* Item detail — shows exactly which Square items landed in which flavor */}
          {data.items.length > 0 && (
            <div style={card}>
              <button onClick={() => setItemsOpen((o) => !o)} style={{ background: "none", border: "none", color: "#e0e0e0", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
                {itemsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Square items ({data.items.length})
                <span style={{ color: "#666", fontWeight: 400, fontSize: 12 }}>— check how each item was matched to a flavor</span>
              </button>
              {itemsOpen && (
                <div style={{ overflowX: "auto", marginTop: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={th}>Square Item</th>
                      <th style={th}>Variation</th>
                      <th style={th}>Flavor</th>
                      <th style={th}>Counted As</th>
                      <th style={{ ...th, textAlign: "right" }}>Qty</th>
                      <th style={{ ...th, textAlign: "right" }}>Net Sales</th>
                    </tr></thead>
                    <tbody>
                      {data.items.map((it) => (
                        <tr key={`${it.flavor}|${it.name}|${it.variation}`} style={{ borderTop: "1px solid #2a2a3a" }}>
                          <td style={td}>{it.name}</td>
                          <td style={{ ...td, color: "#888" }}>{it.variation || "—"}</td>
                          <td style={{ ...td, color: it.flavor === "OTHER" ? "#888" : FLAVOR_COLORS[it.flavor] }}>{it.flavor === "OTHER" ? "unmapped" : it.flavor}</td>
                          <td style={{ ...td, fontSize: 12, color: it.kind === "custom" ? "#f59e0b" : it.kind === "hot" ? "#fb923c" : "#888" }}>
                            {it.kind === "custom" ? "custom amount" : it.kind === "non-dumpling" ? "not a dumpling" : it.kind === "hot" ? `hot food · ${it.piecesEach} pc` : "pack"}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>{qtyFmt(it.qty)}</td>
                          <td style={{ ...td, textAlign: "right", color: "#22c55e" }}>{money(it.netCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading && !data && (
        <div style={{ ...card, color: "#888", fontSize: 13, display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={14} className="spin" /> Pulling sales from Square…
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, color, sub }) {
  return (
    <div style={card}>
      <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
