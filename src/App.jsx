import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  fetchItems, upsertItem, deleteItem as dbDeleteItem, bulkInsertItems,
  fetchBomLines, setBomForAssembly,
  fetchVendors, upsertVendor, deleteVendor as dbDeleteVendor,
  fetchOrders, upsertOrder, deleteOrder as dbDeleteOrder,
  fetchPurchaseOrders, createPurchaseOrder, updatePOStatus, deletePO as dbDeletePO,
} from "./supabase";

// Icons — install lucide-react: npm install lucide-react
import {
  Package, AlertTriangle, Search, Plus, Edit2, Trash2, Download, Upload,
  X, ChevronDown, ChevronRight, DollarSign, CheckCircle, Layers,
  ShoppingCart, ClipboardList, Minus, FileText, Printer, Building2, Loader2,
} from "lucide-react";

// ============================================================
// CONSTANTS
// ============================================================

const LEVELS = {
  100: { label: "100 - Raw Materials", color: "#6366f1", cat: "Raw Material" },
  200: { label: "200 - Sub-Recipe", color: "#a78bfa", cat: "Sub-Recipe" },
  250: { label: "250 - Batch / WIP", color: "#f59e0b", cat: "WIP" },
  300: { label: "300 - Bulk Storage", color: "#22c55e", cat: "Bulk Storage" },
  400: { label: "400 - Retail Unit", color: "#ec4899", cat: "Retail Unit" },
  500: { label: "500 - Retail Case", color: "#f97316", cat: "Retail Case" },
};
const LEVEL_KEYS = [100, 200, 250, 300, 400, 500];
const COSTING = ["FIFO", "FEFO - Batch"];
const PO_STATUSES = ["Draft", "Sent", "Confirmed", "Received", "Cancelled"];
const ORD_STATUSES = ["Pending", "Confirmed", "In Production", "Fulfilled", "Cancelled"];

function getLevel(id) {
  const m = id.match(/^(\d+)-/);
  return m ? Number(m[1]) : 100;
}

// ============================================================
// SAMPLE / SEED DATA (used as fallback if Supabase is empty)
// ============================================================

const SEED_PARTS = [
  { id: "100-Baking Soda", name: "Baking Soda", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "Baldor Boston, LLC", supplierCode: "", avgCost: 38.71, unit: "24 LB", minStock: 2, qty: 10, notes: "", status: "Active" },
  { id: "100-Blk Pepper 5 LB", name: "Black Pepper", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "Chef's Warehouse", supplierCode: "SPP150", avgCost: 46.05, unit: "5 LB", minStock: 2, qty: 8, notes: "", status: "Active" },
  { id: "100-Blk Pepper 5LB Jug", name: "Black Pepper", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "Chef's Warehouse", supplierCode: "SPP150", avgCost: 46.05, unit: "5 LB Jug", minStock: 1, qty: 3, notes: "", status: "Active" },
  { id: "100-Cabot Shredded Cheddar 5 LB", name: "Cabot Shredded Cheddar", category: "Raw Material", type: "Stock", costing: "FIFO", location: "", supplier: "Baldor Boston, LLC", supplierCode: "", avgCost: 34.60, unit: "5 LB", minStock: 5, qty: 20, notes: "", status: "Active" },
  { id: "100-Cabot Shredded Sharp Cheddar", name: "Cabot Shredded Sharp Cheddar", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "Baldor Boston, LLC", supplierCode: "", avgCost: 41.87, unit: "5 LB", minStock: 5, qty: 15, notes: "", status: "Active" },
  { id: "100-Cabot Unsalted Butter 36 LB Case", name: "Cabot Unsalted Butter", category: "Raw Material", type: "Stock", costing: "FIFO", location: "", supplier: "Baldor Boston, LLC", supplierCode: "", avgCost: 99.07, unit: "36 LB Case", minStock: 2, qty: 6, notes: "", status: "Active" },
  { id: "100-Carrots 50 LB", name: "Carrots", category: "Raw Material", type: "Stock", costing: "FIFO", location: "", supplier: "Baldor Boston, LLC", supplierCode: "", avgCost: 47.50, unit: "50 LB", minStock: 2, qty: 8, notes: "", status: "Active" },
  { id: "100-CB Retail bag", name: "CB Retail bag", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "ePac", supplierCode: "", avgCost: 0.40, unit: "Item", minStock: 500, qty: 2000, notes: "", status: "Active" },
  { id: "100-CH Retail bag", name: "CH Retail bag", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "ePac", supplierCode: "", avgCost: 0.41, unit: "Item", minStock: 500, qty: 1800, notes: "", status: "Active" },
  { id: "100-Chang Shing Pressed Tofu 30 LB", name: "Pressed Tofu", category: "Raw Material", type: "Stock", costing: "FIFO", location: "", supplier: "Chang Shing", supplierCode: "", avgCost: 55.00, unit: "30 LB", minStock: 3, qty: 10, notes: "", status: "Active" },
  { id: "100-King Arthur Special Patent", name: "King Arthur Special Patent Flour", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 25.21, unit: "50 LB", minStock: 5, qty: 12, notes: "", status: "Active" },
  { id: "100-Dried Chives 4oz", name: "Dried Chives", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 12.99, unit: "4oz", minStock: 5, qty: 15, notes: "", status: "Active" },
  { id: "100-Kosher Salt Case 9X3", name: "Kosher Salt", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 80.27, unit: "Case 9X3", minStock: 1, qty: 4, notes: "", status: "Active" },
  { id: "100-Vegetable Oil 2x17.5 LE", name: "Vegetable Oil", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 37.99, unit: "2x17.5 LE", minStock: 2, qty: 6, notes: "", status: "Active" },
  { id: "100-Yellow American Cheese", name: "Yellow American Cheese, Deli", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 16.47, unit: "LB", minStock: 20, qty: 50, notes: "", status: "Active" },
  { id: "100-Fried Shallots Case", name: "Fried Shallots", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 106.58, unit: "Case", minStock: 2, qty: 5, notes: "", status: "Active" },
  { id: "100-Garlic Powder 5 LB", name: "Garlic Powder", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 32.25, unit: "5 LB", minStock: 2, qty: 6, notes: "", status: "Active" },
  { id: "100-Green Cabbage 50 LB", name: "Green Cabbage", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 28.05, unit: "50 LB", minStock: 3, qty: 8, notes: "", status: "Active" },
  { id: "100-Ground Beef 10 LB", name: "Ground Beef", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 69.90, unit: "10 LB", minStock: 10, qty: 30, notes: "", status: "Active" },
  { id: "100-Onion Powder 5 LB", name: "Onion Powder", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 30.76, unit: "5 LB", minStock: 2, qty: 5, notes: "", status: "Active" },
  { id: "100-Onions (uncured) 20LB", name: "Onions (uncured)", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 12.41, unit: "20 LB", minStock: 5, qty: 15, notes: "", status: "Active" },
  { id: "100-Food Svc Bag Roll", name: "Food Svc Bag Roll", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 203.00, unit: "Roll", minStock: 2, qty: 5, notes: "", status: "Active" },
  { id: "100-Food Svc Case 25X", name: "Food Svc Case 25X", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 25.75, unit: "Case", minStock: 10, qty: 40, notes: "", status: "Active" },
  { id: "100-Retail Case", name: "Retail Case", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 1.20, unit: "Item", minStock: 50, qty: 200, notes: "", status: "Active" },
];

const SEED_ASSEMBLIES = [
  { id: "200-CB Dough", name: "CB Dough", category: "Sub-Recipe", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "Batch", minStock: 0, qty: 0, notes: "Sub-recipe for CB dough", status: "Active",
    bom: [{ partId: "100-King Arthur Special Patent", qty: 0.5 }, { partId: "100-Dried Chives 4oz", qty: 0.084 }, { partId: "100-Kosher Salt Case 9X3", qty: 0.009 }, { partId: "100-Vegetable Oil 2x17.5 LE", qty: 0.007 }] },
  { id: "200-CB Fill", name: "CB Fill", category: "Sub-Recipe", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "Batch", minStock: 0, qty: 0, notes: "Sub-recipe for CB filling", status: "Active",
    bom: [{ partId: "100-Yellow American Cheese", qty: 1.1 }, { partId: "100-Fried Shallots Case", qty: 1.1 }, { partId: "100-Garlic Powder 5 LB", qty: 0.007 }, { partId: "100-Green Cabbage 50 LB", qty: 0.13 }, { partId: "100-Ground Beef 10 LB", qty: 1.5 }, { partId: "100-Kosher Salt Case 9X3", qty: 0.011 }, { partId: "100-Onion Powder 5 LB", qty: 0.02 }, { partId: "100-Onions (uncured) 20LB", qty: 0.106 }] },
  { id: "250-CB Batch", name: "CB Batch", category: "WIP", type: "Stock", costing: "FEFO - Batch", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 202.81, unit: "1 Batch", minStock: 2, qty: 5, notes: "~432 pieces per batch", status: "Active",
    bom: [{ partId: "200-CB Dough", qty: 1 }, { partId: "200-CB Fill", qty: 1 }] },
  { id: "300-CB Bin", name: "CB Bin", category: "Bulk Storage", type: "Stock", costing: "FEFO - Batch", location: "Dumpling Factory: Walk-in Freezer", supplier: "", supplierCode: "", avgCost: 68.95, unit: "432 pieces", minStock: 3, qty: 8, notes: "0.34 of a batch per bin", status: "Active",
    bom: [{ partId: "250-CB Batch", qty: 0.34 }] },
  { id: "400-CB Catering Pieces", name: "CB Catering (Pieces)", category: "Retail Unit", type: "Stock", costing: "FEFO - Batch", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "Each", minStock: 0, qty: 0, notes: "", status: "Active",
    bom: [{ partId: "300-CB Bin", qty: 0.0024 }] },
  { id: "400-CB Catering Tray", name: "CB Catering Tray", category: "Retail Unit", type: "Stock", costing: "FEFO - Batch", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "Each", minStock: 0, qty: 0, notes: "", status: "Active",
    bom: [{ partId: "300-CB Bin", qty: 0.11 }] },
  { id: "400-CB Food Service Case", name: "CB Food Service Case", category: "Retail Unit", type: "Stock", costing: "FEFO - Batch", location: "Dumpling Factory: Walk-in Freezer", supplier: "", supplierCode: "", avgCost: 60.43, unit: "200 pcs", minStock: 5, qty: 15, notes: "", status: "Active",
    bom: [{ partId: "300-CB Bin", qty: 0.5 }, { partId: "100-Food Svc Bag Roll", qty: 0.001 }, { partId: "100-Food Svc Case 25X", qty: 0.04 }] },
  { id: "400-CB Pack", name: "CB Pack", category: "Retail Unit", type: "Stock", costing: "FEFO - Batch", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 2.70, unit: "14 oz", minStock: 20, qty: 30, notes: "Retail 14oz pack", status: "Active",
    bom: [{ partId: "300-CB Bin", qty: 0.0333 }, { partId: "100-CB Retail bag", qty: 1 }] },
  { id: "500-CB Retail Case", name: "CB Retail Case", category: "Retail Case", type: "Stock", costing: "FEFO - Batch", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "Case", minStock: 5, qty: 10, notes: "12 packs per case", status: "Active",
    bom: [{ partId: "400-CB Pack", qty: 12 }, { partId: "100-Retail Case", qty: 1 }] },
];

const SEED_VENDORS = [
  { id: "V-001", name: "Baldor Boston, LLC", contact: "", email: "", phone: "", address: "", paymentTerms: "Net 30", leadDays: 2, notes: "Dairy, produce, butter" },
  { id: "V-002", name: "Chef's Warehouse", contact: "", email: "", phone: "", address: "", paymentTerms: "Net 30", leadDays: 3, notes: "Spices, specialty" },
  { id: "V-003", name: "ePac", contact: "", email: "", phone: "", address: "", paymentTerms: "Net 30", leadDays: 14, notes: "Retail packaging bags" },
  { id: "V-004", name: "Chang Shing", contact: "", email: "", phone: "", address: "", paymentTerms: "Net 15", leadDays: 3, notes: "Tofu" },
];

const SEED_ORDERS = [
  { id: "ORD-001", customer: "Green Grocer Market", item: "400-CB Pack", qty: 48, date: "2026-03-10", status: "Pending", notes: "Weekly standing order" },
  { id: "ORD-002", customer: "Dumpling Festival", item: "400-CB Food Service Case", qty: 10, date: "2026-03-15", status: "Confirmed", notes: "Event — deliver by 8am" },
  { id: "ORD-003", customer: "Happy Belly Restaurant", item: "400-CB Food Service Case", qty: 4, date: "2026-03-12", status: "Fulfilled", notes: "" },
  { id: "ORD-004", customer: "Whole Foods Northeast", item: "500-CB Retail Case", qty: 20, date: "2026-03-18", status: "Pending", notes: "New account trial" },
];

// ============================================================
// STYLES
// ============================================================

const IS = { width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #333", background: "#16161e", color: "#e0e0e0", fontSize: 14, boxSizing: "border-box" };
const B1 = { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const B2 = { background: "#2a2a3a", color: "#ccc", border: "1px solid #333", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const TH = { padding: "9px 12px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid #2a2a3a" };
const TD = { padding: "9px 12px", fontSize: 13, color: "#d0d0d0", borderBottom: "1px solid #1a1a2a" };

// ============================================================
// COMPONENTS
// ============================================================

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1e1e2e", borderRadius: 12, padding: 24, width: "95%", maxWidth: wide ? 780 : 520, maxHeight: "88vh", overflow: "auto", border: "1px solid #333" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#e0e0e0" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 4 }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, accent }) {
  return (
    <div style={{ background: "#1e1e2e", borderRadius: 10, padding: "14px 18px", border: "1px solid #2a2a3a", flex: "1 1 130px", minWidth: 120 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ color: accent }}>{icon}</div>
        <span style={{ color: "#888", fontSize: 11 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>{value}</div>
    </div>
  );
}

function LevelBadge({ level }) {
  const l = LEVELS[level];
  return l ? <span style={{ background: l.color + "22", color: l.color, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{level}</span> : <span>{level}</span>;
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  // ---- State ----
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("inventory");
  const [parts, setParts] = useState(SEED_PARTS);
  const [assemblies, setAssemblies] = useState(SEED_ASSEMBLIES);
  const [vendors, setVendors] = useState(SEED_VENDORS);
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [pos, setPOs] = useState([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({});
  const [bomForm, setBomForm] = useState([]);
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [delConfirm, setDelConfirm] = useState(null);

  // ---- Load from Supabase on mount ----
  useEffect(() => {
    async function loadAll() {
      try {
        const [dbItems, dbBom, dbVendors, dbOrders, dbPOs] = await Promise.all([
          fetchItems(), fetchBomLines(), fetchVendors(), fetchOrders(), fetchPurchaseOrders(),
        ]);
        const assemblyIds = new Set(dbBom.map((b) => b.assemblyId));
        const rawMats = dbItems.filter((i) => !assemblyIds.has(i.id));
        const asms = dbItems.filter((i) => assemblyIds.has(i.id)).map((a) => ({
          ...a,
          bom: dbBom.filter((b) => b.assemblyId === a.id).map((b) => ({ partId: b.partId, qty: b.qty })),
        }));
        if (dbItems.length > 0) { setParts(rawMats); setAssemblies(asms); }
        if (dbVendors.length > 0) setVendors(dbVendors);
        if (dbOrders.length > 0) setOrders(dbOrders);
        if (dbPOs.length > 0) setPOs(dbPOs);
      } catch (err) {
        console.warn("Supabase load failed, using seed data:", err.message);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  // ---- Derived ----
  const allItems = useMemo(() => [...parts, ...assemblies], [parts, assemblies]);
  const gi = useCallback((id) => allItems.find((i) => i.id === id), [allItems]);
  const show = (msg, t = "success") => { setToast({ msg, t }); setTimeout(() => setToast(null), 2500); };
  const sC = (s) => ({ Pending: "#f59e0b", Confirmed: "#6366f1", "In Production": "#8b5cf6", Fulfilled: "#22c55e", Cancelled: "#ef4444", Draft: "#888", Sent: "#6366f1", Received: "#22c55e" }[s] || "#888");
  const tog = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const bomCost = useCallback((bom) => {
    let t = 0;
    for (const l of bom) {
      const it = allItems.find((i) => i.id === l.partId);
      if (!it) continue;
      if (it.bom) t += bomCost(it.bom) * l.qty;
      else t += it.avgCost * l.qty;
    }
    return t;
  }, [allItems]);

  const viewItems = useMemo(() => {
    let d = tab === "inventory" ? [...parts, ...assemblies] : [];
    if (search) { const s = search.toLowerCase(); d = d.filter((p) => p.name.toLowerCase().includes(s) || p.id.toLowerCase().includes(s) || (p.supplier || "").toLowerCase().includes(s)); }
    if (levelFilter !== "All") d = d.filter((p) => getLevel(p.id) === Number(levelFilter));
    if (stockFilter === "Low") d = d.filter((p) => p.minStock > 0 && p.qty <= p.minStock);
    if (stockFilter === "OK") d = d.filter((p) => p.minStock === 0 || p.qty > p.minStock);
    return d;
  }, [tab, parts, assemblies, search, levelFilter, stockFilter]);

  const viewOrders = useMemo(() => { if (!search) return orders; const s = search.toLowerCase(); return orders.filter((o) => o.customer.toLowerCase().includes(s) || o.id.toLowerCase().includes(s)); }, [orders, search]);
  const viewVendors = useMemo(() => { if (!search) return vendors; const s = search.toLowerCase(); return vendors.filter((v) => v.name.toLowerCase().includes(s)); }, [vendors, search]);

  const stats = useMemo(() => {
    const low = allItems.filter((i) => i.minStock > 0 && i.qty <= i.minStock).length;
    const rawVal = parts.reduce((s, p) => s + p.qty * p.avgCost, 0);
    const open = orders.filter((o) => o.status === "Pending" || o.status === "Confirmed").length;
    return { total: allItems.length, raw: parts.length, asm: assemblies.length, low, rawVal, open };
  }, [allItems, parts, assemblies, orders]);

  // ---- MRP Explosion ----
  const mrp = useMemo(() => {
    const oo = orders.filter((o) => o.status === "Pending" || o.status === "Confirmed" || o.status === "In Production");
    const needs = {};
    const explode = (id, mult) => {
      const it = allItems.find((i) => i.id === id);
      if (!it) return;
      if (getLevel(it.id) === 100) { if (!needs[it.id]) needs[it.id] = { ...it, required: 0 }; needs[it.id].required += mult; return; }
      if (it.bom) for (const l of it.bom) explode(l.partId, l.qty * mult);
    };
    for (const o of oo) explode(o.item, o.qty);
    const rows = Object.values(needs).map((r) => ({
      ...r, required: Math.ceil(r.required * 1000) / 1000,
      shortfall: Math.max(0, Math.ceil((r.required - r.qty) * 1000) / 1000),
      coverage: r.required > 0 ? Math.min(100, Math.round((r.qty / r.required) * 100)) : 100,
      purchaseCost: Math.max(0, Math.ceil((r.required - r.qty) * 1000) / 1000) * r.avgCost,
    })).sort((a, b) => b.shortfall - a.shortfall);
    const byVendor = {};
    for (const r of rows) {
      if (r.shortfall <= 0) continue;
      const vid = r.supplier || "Unassigned";
      if (!byVendor[vid]) byVendor[vid] = { vendor: vid, lines: [], total: 0 };
      byVendor[vid].lines.push(r);
      byVendor[vid].total += r.purchaseCost;
    }
    return { oo, rows, byVendor: Object.values(byVendor), totalCost: rows.reduce((s, r) => s + r.purchaseCost, 0), critical: rows.filter((r) => r.shortfall > 0).length, covered: rows.filter((r) => r.shortfall === 0).length };
  }, [orders, allItems]);

  // ---- CRUD with Supabase persistence ----
  const bomItemsForLevel = (level) => {
    if (level <= 200) return parts;
    if (level === 250) return [...parts, ...assemblies.filter((a) => getLevel(a.id) === 200)];
    if (level === 300) return [...parts, ...assemblies.filter((a) => getLevel(a.id) <= 250)];
    if (level === 400) return [...parts, ...assemblies.filter((a) => getLevel(a.id) <= 300)];
    return allItems;
  };

  const openAdd = (type) => {
    setEditItem(null);
    if (type === "part") setForm({ id: "100-", name: "", category: "Raw Material", type: "Stock", costing: "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "", minStock: 0, qty: 0, notes: "", status: "Active" });
    else if (type === "assembly") { const lvl = levelFilter !== "All" && Number(levelFilter) >= 200 ? Number(levelFilter) : 200; setForm({ id: `${lvl}-`, name: "", category: LEVELS[lvl]?.cat || "", type: "Stock", costing: lvl >= 250 ? "FEFO - Batch" : "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "", minStock: 0, qty: 0, notes: "", status: "Active" }); setBomForm([]); }
    else if (type === "order") setForm({ id: `ORD-${String(orders.length + 1).padStart(3, "0")}`, customer: "", item: "", qty: 0, date: new Date().toISOString().slice(0, 10), status: "Pending", notes: "" });
    else if (type === "vendor") setForm({ id: `V-${String(vendors.length + 1).padStart(3, "0")}`, name: "", contact: "", email: "", phone: "", address: "", paymentTerms: "Net 30", leadDays: 0, notes: "" });
    setModal(type);
  };

  const openEdit = (type, item) => { setEditItem(item); setForm({ ...item }); if (item.bom) setBomForm([...item.bom]); setModal(type); };

  const save = async () => {
    if (modal === "part") {
      if (!form.name || !form.id) { show("Name and ID required", "error"); return; }
      const obj = { ...form, avgCost: Number(form.avgCost), qty: Number(form.qty), minStock: Number(form.minStock) };
      try { await upsertItem(obj); } catch (e) { console.warn("DB save failed:", e.message); }
      if (editItem) setParts((p) => p.map((x) => (x.id === editItem.id ? obj : x)));
      else setParts((p) => [...p, obj]);
    } else if (modal === "assembly") {
      if (!form.name || !form.id) { show("Name and ID required", "error"); return; }
      const cleanBom = bomForm.filter((b) => b.partId && b.qty > 0);
      const obj = { ...form, avgCost: Number(form.avgCost), qty: Number(form.qty), minStock: Number(form.minStock), bom: cleanBom };
      try { await upsertItem(obj); await setBomForAssembly(obj.id, cleanBom); } catch (e) { console.warn("DB save failed:", e.message); }
      if (editItem) setAssemblies((p) => p.map((x) => (x.id === editItem.id ? obj : x)));
      else setAssemblies((p) => [...p, obj]);
    } else if (modal === "order") {
      if (!form.customer || !form.item) { show("Customer & item required", "error"); return; }
      const obj = { ...form, qty: Number(form.qty) };
      try { await upsertOrder(obj); } catch (e) { console.warn("DB save failed:", e.message); }
      if (editItem) setOrders((p) => p.map((x) => (x.id === editItem.id ? obj : x)));
      else setOrders((p) => [...p, obj]);
    } else if (modal === "vendor") {
      if (!form.name) { show("Name required", "error"); return; }
      const obj = { ...form, leadDays: Number(form.leadDays) };
      try { await upsertVendor(obj); } catch (e) { console.warn("DB save failed:", e.message); }
      if (editItem) setVendors((p) => p.map((x) => (x.id === editItem.id ? obj : x)));
      else setVendors((p) => [...p, obj]);
    }
    show(editItem ? "Updated" : "Added");
    setModal(null);
  };

  const del = async (id) => {
    try { await Promise.allSettled([dbDeleteItem(id), dbDeleteOrder(id), dbDeleteVendor(id), dbDeletePO(id)]); } catch (e) { console.warn("DB delete failed:", e.message); }
    setParts((p) => p.filter((x) => x.id !== id));
    setAssemblies((p) => p.filter((x) => x.id !== id));
    setOrders((p) => p.filter((x) => x.id !== id));
    setVendors((p) => p.filter((x) => x.id !== id));
    setPOs((p) => p.filter((x) => x.id !== id));
    show("Deleted");
  };

  const genPOs = async () => {
    const npos = [];
    for (const vg of mrp.byVendor) {
      const pid = `PO-${String(pos.length + npos.length + 1).padStart(3, "0")}`;
      const vObj = vendors.find((v) => v.name === vg.vendor);
      const po = { id: pid, vendor: vg.vendor, vendorId: vObj?.id || "", date: new Date().toISOString().slice(0, 10), status: "Draft", lines: vg.lines.map((l) => ({ partId: l.id, name: l.name, qty: l.shortfall, unit: l.unit, unitCost: l.avgCost, total: l.purchaseCost })), total: vg.total, paymentTerms: vObj?.paymentTerms || "", leadDays: vObj?.leadDays || 0, notes: "" };
      npos.push(po);
      try { await createPurchaseOrder(po); } catch (e) { console.warn("PO save failed:", e.message); }
    }
    if (npos.length) { setPOs((p) => [...p, ...npos]); show(`Generated ${npos.length} POs`); setTab("pos"); }
    else show("No shortfalls", "error");
  };

  const printPO = (po) => {
    const v = vendors.find((x) => x.name === po.vendor);
    const w = window.open("", "_blank", "width=700,height=900");
    w.document.write(`<html><head><title>PO ${po.id}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#222}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}th{background:#f5f5f5}.total{text-align:right;font-size:16px;font-weight:bold;margin-top:10px}</style></head><body><h1>PURCHASE ORDER ${po.id}</h1><p>Date: ${po.date} | Status: ${po.status}</p><div style="display:flex;justify-content:space-between;margin:20px 0"><div><strong>${po.vendor}</strong><br>${v?.address || ""}<br>${v?.contact || ""} ${v?.email || ""} ${v?.phone || ""}</div><div style="text-align:right"><strong>Terms:</strong> ${po.paymentTerms || "N/A"}<br><strong>Lead:</strong> ${po.leadDays || "?"} days</div></div><table><thead><tr><th>Part ID</th><th>Description</th><th>Qty</th><th>Unit</th><th>Cost</th><th>Total</th></tr></thead><tbody>${po.lines.map((l) => `<tr><td>${l.partId}</td><td>${l.name}</td><td>${l.qty}</td><td>${l.unit}</td><td>$${l.unitCost.toFixed(2)}</td><td>$${l.total.toFixed(2)}</td></tr>`).join("")}</tbody></table><div class="total">TOTAL: $${po.total.toFixed(2)}</div></body></html>`);
    w.document.close();
    w.print();
  };

  const renderBom = (bom, depth = 0) => (
    <div style={{ marginLeft: depth * 20 }}>
      {bom.map((line, i) => {
        const it = gi(line.partId);
        if (!it) return <div key={i} style={{ color: "#ef4444", fontSize: 12, padding: "2px 0" }}>⚠ {line.partId} not found</div>;
        const lvl = getLevel(it.id);
        const hasSub = it.bom && it.bom.length > 0;
        const k = `${it.id}-${depth}-${i}`;
        return (
          <div key={k}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 13, color: "#ccc" }}>
              {hasSub ? <button onClick={() => tog(k)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 0 }}>{expanded[k] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span style={{ width: 14 }} />}
              <span style={{ color: LEVELS[lvl]?.color || "#888", fontSize: 11, fontFamily: "monospace" }}>{it.id}</span>
              <span>{it.name}</span>
              <span style={{ color: "#666" }}>× {line.qty} {it.unit}</span>
            </div>
            {hasSub && expanded[k] && renderBom(it.bom, depth + 1)}
          </div>
        );
      })}
    </div>
  );

  // ---- CSV Import ----
  const importCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const lines = ev.target.result.split("\n").filter((l) => l.trim());
        if (lines.length < 2) { show("No rows", "error"); return; }
        const hdr = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());
        const np = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map((c) => c.replace(/^"|"$/g, "").trim());
          if (!cols || cols.length < 2) continue;
          const g = (k) => { const idx = hdr.indexOf(k); return idx >= 0 && cols[idx] ? cols[idx] : ""; };
          const id = g("productcode") || g("id") || g("sku") || `100-Import-${i}`;
          if (allItems.find((x) => x.id === id)) continue;
          np.push({
            id, name: g("name") || cols[1] || "", category: g("category") || "Raw Material",
            type: g("type") || "Stock", costing: g("costingmethod") || g("costing method") || "FIFO",
            location: g("defaultlocation") || g("default location") || "",
            supplier: g("lastsuppliedby") || g("last supplied by") || g("supplier") || "",
            supplierCode: g("supplierproductcode") || g("supplier product code") || "",
            avgCost: Number(g("averagecost (last 3 orders)") || g("averagecost") || g("avgcost") || g("cost") || 0),
            unit: g("defaultunitofmeasure") || g("default unit of measure") || g("unit") || "",
            minStock: Number(g("minimumbeforereorder") || g("minimum before reorder") || g("minstock") || g("min") || 0),
            qty: 0, notes: "", status: g("status") || "Active",
          });
        }
        if (np.length) {
          setParts((p) => [...p, ...np]);
          bulkInsertItems(np).catch((e) => console.warn("Bulk insert failed:", e.message));
          show(`Imported ${np.length} items`);
        } else show("No new items", "error");
      } catch { show("Import failed", "error"); }
    };
    r.readAsText(file);
    e.target.value = "";
  };

  const exportCSV = () => {
    const h = ["ProductCode", "Name", "Category", "Type", "CostingMethod", "DefaultLocation", "Supplier", "SupplierProductCode", "AverageCost", "DefaultUnitOfMeasure", "MinStock", "Qty", "Status"];
    const rows = allItems.map((p) => [p.id, p.name, p.category, p.type, p.costing, p.location, p.supplier, p.supplierCode || "", p.avgCost, p.unit, p.minStock, p.qty, p.status || "Active"].map((v) => `"${v}"`).join(","));
    const blob = new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "inventory_export.csv"; a.click();
    show("Exported");
  };

  const tabBtn = (k, lbl, ico) => (
    <button onClick={() => { setTab(k); setSearch(""); setLevelFilter("All"); setStockFilter("All"); }}
      style={{ ...B2, background: tab === k ? "#6366f1" : "#2a2a3a", color: tab === k ? "#fff" : "#ccc", borderColor: tab === k ? "#6366f1" : "#333" }}>{ico}{lbl}</button>
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", background: "#12121c", minHeight: "100vh", color: "#e0e0e0", padding: "16px 20px" }}>

      {/* Loading Screen */}
      {loading && (
        <div style={{ position: "fixed", inset: 0, background: "#12121c", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ textAlign: "center", color: "#888" }}>
            <Loader2 size={40} style={{ color: "#6366f1", marginBottom: 12, animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: 16, margin: 0 }}>Loading inventory...</p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: toast.t === "error" ? "#dc2626" : "#16a34a", color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 14, zIndex: 2000, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}><CheckCircle size={16} />{toast.msg}</div>}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><Package size={26} style={{ color: "#6366f1" }} /> Dumpling Factory</h1>
          <p style={{ margin: "2px 0 0", color: "#555", fontSize: 12 }}>Production Inventory • BOM • Purchasing</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <label style={B2}><Upload size={14} /> Import CSV<input type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} /></label>
          <button onClick={exportCSV} style={B2}><Download size={14} /> Export</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <Stat icon={<Package size={18} />} label="Total SKUs" value={stats.total} accent="#6366f1" />
        <Stat icon={<AlertTriangle size={18} />} label="Low Stock" value={stats.low} accent={stats.low > 0 ? "#ef4444" : "#22c55e"} />
        <Stat icon={<DollarSign size={18} />} label="Raw Material Value" value={`$${stats.rawVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} accent="#22c55e" />
        <Stat icon={<ShoppingCart size={18} />} label="Open Orders" value={stats.open} accent="#ec4899" />
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("inventory", "Inventory", <Package size={14} />)}
        {tabBtn("orders", "Orders", <ShoppingCart size={14} />)}
        {tabBtn("vendors", "Vendors", <Building2 size={14} />)}
        {tabBtn("mrp", "Purchase Needs", <ClipboardList size={14} />)}
        {tabBtn("pos", "Purchase Orders", <FileText size={14} />)}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#555" }} />
          <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...IS, paddingLeft: 32 }} />
        </div>
        {tab === "inventory" && <>
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ ...IS, width: "auto", minWidth: 160 }}>
            <option value="All">All Levels</option>
            {LEVEL_KEYS.map((k) => <option key={k} value={k}>{LEVELS[k].label}</option>)}
          </select>
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} style={{ ...IS, width: "auto", minWidth: 100 }}>
            <option value="All">All Stock</option>
            <option value="Low">Low Stock</option>
            <option value="OK">In Stock</option>
          </select>
          <button onClick={() => openAdd("part")} style={B2}><Plus size={14} /> Raw Material</button>
          <button onClick={() => openAdd("assembly")} style={B1}><Plus size={14} /> Assembly</button>
        </>}
        {tab === "orders" && <button onClick={() => openAdd("order")} style={B1}><Plus size={14} /> Order</button>}
        {tab === "vendors" && <button onClick={() => openAdd("vendor")} style={B1}><Plus size={14} /> Vendor</button>}
      </div>

      {/* ================== INVENTORY TABLE ================== */}
      {tab === "inventory" && (
        <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead><tr>
                {["", "ProductCode", "Name", "Level", "Costing", "Qty", "Min", "Unit", "Avg Cost", "BOM Cost", "Location", "Supplier", ""].map((h) => <th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {viewItems.length === 0 ? <tr><td colSpan={13} style={{ ...TD, textAlign: "center", color: "#555", padding: 32 }}>No items found</td></tr> :
                  viewItems.map((p) => {
                    const lvl = getLevel(p.id); const low = p.minStock > 0 && p.qty <= p.minStock; const hasBom = p.bom && p.bom.length > 0; const bc = hasBom ? bomCost(p.bom) : null;
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ background: low ? "rgba(239,68,68,0.06)" : "transparent" }}>
                          <td style={TD}>{hasBom && <button onClick={() => tog(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 2 }}>{expanded[p.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}</td>
                          <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: LEVELS[lvl]?.color || "#888" }}>{p.id}</td>
                          <td style={{ ...TD, fontWeight: 500 }}>{p.name}{low && <AlertTriangle size={13} style={{ color: "#f59e0b", verticalAlign: "middle", marginLeft: 4 }} />}</td>
                          <td style={TD}><LevelBadge level={lvl} /></td>
                          <td style={{ ...TD, fontSize: 11, color: "#888" }}>{p.costing}</td>
                          <td style={{ ...TD, fontWeight: 600, color: low ? "#ef4444" : "#22c55e" }}>{p.qty}</td>
                          <td style={{ ...TD, color: "#666" }}>{p.minStock || "—"}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#999" }}>{p.unit}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{p.avgCost > 0 ? `$${p.avgCost.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#f59e0b" }}>{bc !== null ? `$${bc.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 11, color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.location}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{p.supplier}</td>
                          <td style={TD}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => openEdit(hasBom ? "assembly" : "part", p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 3 }}><Edit2 size={14} /></button>
                              <button onClick={() => setDelConfirm(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                        {hasBom && expanded[p.id] && <tr><td colSpan={13} style={{ ...TD, background: "#16161e", paddingLeft: 48 }}><div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 600 }}>BILL OF MATERIALS</div>{renderBom(p.bom)}</td></tr>}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "8px 14px", borderTop: "1px solid #2a2a3a", color: "#555", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>{viewItems.length} of {allItems.length} items</span>
            <span>{LEVEL_KEYS.map((k) => <span key={k} style={{ marginLeft: 12, color: LEVELS[k].color }}>{k}: {allItems.filter((i) => getLevel(i.id) === k).length}</span>)}</span>
          </div>
        </div>
      )}

      {/* ================== ORDERS TABLE ================== */}
      {tab === "orders" && (
        <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["Order", "Customer", "Item", "Qty", "Date", "Status", "Notes", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {viewOrders.length === 0 ? <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: "#555", padding: 32 }}>No orders</td></tr> :
                  viewOrders.map((o) => { const it = gi(o.item); return (
                    <tr key={o.id}>
                      <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#8b8bf5" }}>{o.id}</td>
                      <td style={{ ...TD, fontWeight: 500 }}>{o.customer}</td>
                      <td style={{ ...TD, fontSize: 12 }}>{it ? `${it.name} (${o.item})` : o.item}</td>
                      <td style={{ ...TD, fontWeight: 600 }}>{o.qty}</td>
                      <td style={{ ...TD, fontSize: 12, color: "#888" }}>{o.date}</td>
                      <td style={TD}><span style={{ background: sC(o.status) + "22", color: sC(o.status), padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{o.status}</span></td>
                      <td style={{ ...TD, fontSize: 12, color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.notes}</td>
                      <td style={TD}><div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openEdit("order", o)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 3 }}><Edit2 size={14} /></button>
                        <button onClick={() => setDelConfirm(o.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Trash2 size={14} /></button>
                      </div></td>
                    </tr>
                  ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================== VENDORS TABLE ================== */}
      {tab === "vendors" && (
        <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead><tr>{["ID", "Vendor", "Contact", "Email", "Phone", "Terms", "Lead", "Parts", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {viewVendors.map((v) => { const pc = parts.filter((p) => p.supplier === v.name).length; return (
                  <tr key={v.id}>
                    <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#8b8bf5" }}>{v.id}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{v.name}</td>
                    <td style={{ ...TD, fontSize: 12 }}>{v.contact}</td>
                    <td style={{ ...TD, fontSize: 12, color: "#888" }}>{v.email}</td>
                    <td style={{ ...TD, fontSize: 12, color: "#888" }}>{v.phone}</td>
                    <td style={TD}><span style={{ background: "#2a2a3a", padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>{v.paymentTerms}</span></td>
                    <td style={{ ...TD, fontSize: 12 }}>{v.leadDays}d</td>
                    <td style={{ ...TD, color: "#6366f1", fontWeight: 600 }}>{pc}</td>
                    <td style={TD}><div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => openEdit("vendor", v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 3 }}><Edit2 size={14} /></button>
                      <button onClick={() => setDelConfirm(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================== MRP TAB ================== */}
      {tab === "mrp" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={<ShoppingCart size={18} />} label="Open Orders" value={mrp.oo.length} accent="#6366f1" />
            <Stat icon={<AlertTriangle size={18} />} label="Materials Short" value={mrp.critical} accent={mrp.critical > 0 ? "#ef4444" : "#22c55e"} />
            <Stat icon={<CheckCircle size={18} />} label="Covered" value={mrp.covered} accent="#22c55e" />
            <Stat icon={<DollarSign size={18} />} label="Purchase Needed" value={`$${mrp.totalCost.toFixed(2)}`} accent="#f59e0b" />
          </div>
          {mrp.oo.length === 0 ? <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: 40, textAlign: "center", color: "#555" }}><p>No open orders to plan for.</p></div> : <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button onClick={genPOs} style={{ ...B1, background: "#f59e0b", color: "#000" }}><FileText size={15} /> Generate POs by Vendor</button></div>
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Raw Material Requirements (exploded from open orders)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                  <thead><tr>{["ProductCode", "Material", "Required", "On Hand", "Shortfall", "Coverage", "Avg Cost", "Purchase $", "Supplier"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {mrp.rows.map((r) => (
                      <tr key={r.id} style={{ background: r.shortfall > 0 ? "rgba(239,68,68,0.06)" : "transparent" }}>
                        <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#6366f1" }}>{r.id}</td>
                        <td style={{ ...TD, fontWeight: 500 }}>{r.name}{r.shortfall > 0 && <AlertTriangle size={13} style={{ color: "#ef4444", verticalAlign: "middle", marginLeft: 4 }} />}</td>
                        <td style={{ ...TD, fontWeight: 600 }}>{r.required} {r.unit}</td>
                        <td style={{ ...TD, color: r.qty >= r.required ? "#22c55e" : "#f59e0b" }}>{r.qty}</td>
                        <td style={{ ...TD, fontWeight: 700, color: r.shortfall > 0 ? "#ef4444" : "#22c55e" }}>{r.shortfall > 0 ? r.shortfall : "—"}</td>
                        <td style={TD}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 50, height: 5, background: "#2a2a3a", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${r.coverage}%`, height: "100%", background: r.coverage >= 100 ? "#22c55e" : r.coverage >= 50 ? "#f59e0b" : "#ef4444", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, color: "#888" }}>{r.coverage}%</span>
                          </div>
                        </td>
                        <td style={{ ...TD, fontSize: 12 }}>${r.avgCost.toFixed(2)}</td>
                        <td style={{ ...TD, fontWeight: 600, color: r.purchaseCost > 0 ? "#f59e0b" : "#555" }}>{r.purchaseCost > 0 ? `$${r.purchaseCost.toFixed(2)}` : "—"}</td>
                        <td style={{ ...TD, fontSize: 12, color: "#888" }}>{r.supplier || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "10px 14px", borderTop: "1px solid #2a2a3a", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#555", fontSize: 11 }}>{mrp.rows.length} materials • {mrp.byVendor.length} vendors</span>
                <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 600 }}>Total: ${mrp.totalCost.toFixed(2)}</span>
              </div>
            </div>
          </>}
        </div>
      )}

      {/* ================== PURCHASE ORDERS TAB ================== */}
      {tab === "pos" && (
        <div>
          {pos.length === 0 ? <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: 40, textAlign: "center", color: "#555" }}><FileText size={32} style={{ marginBottom: 12, opacity: 0.4 }} /><p>No POs yet. Generate from Purchase Needs tab.</p></div> :
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pos.map((po) => {
                const exp = expanded[`po-${po.id}`];
                return (
                  <div key={po.id} style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, cursor: "pointer" }} onClick={() => tog(`po-${po.id}`)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {exp ? <ChevronDown size={16} style={{ color: "#888" }} /> : <ChevronRight size={16} style={{ color: "#888" }} />}
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{po.id}</span><span style={{ background: sC(po.status) + "22", color: sC(po.status), padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{po.status}</span></div>
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{po.vendor} • {po.lines.length} items • {po.date}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>${po.total.toFixed(2)}</span>
                        <button onClick={(e) => { e.stopPropagation(); printPO(po); }} style={{ ...B2, padding: "5px 10px" }}><Printer size={13} /></button>
                        <select value={po.status} onClick={(e) => e.stopPropagation()} onChange={async (e) => { e.stopPropagation(); const ns = e.target.value; setPOs((p) => p.map((x) => x.id === po.id ? { ...x, status: ns } : x)); try { await updatePOStatus(po.id, ns); } catch (err) { console.warn(err); } }} style={{ ...IS, width: "auto", minWidth: 90, padding: "4px 8px", fontSize: 12 }}>
                          {PO_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        <button onClick={(e) => { e.stopPropagation(); setDelConfirm(po.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {exp && (
                      <div style={{ borderTop: "1px solid #2a2a3a" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr>{["Part ID", "Description", "Qty", "Unit", "Cost", "Total"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                          <tbody>
                            {po.lines.map((l, i) => (
                              <tr key={i}>
                                <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#6366f1" }}>{l.partId}</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{l.name}</td>
                                <td style={{ ...TD, fontWeight: 600 }}>{l.qty}</td>
                                <td style={{ ...TD, color: "#888" }}>{l.unit}</td>
                                <td style={{ ...TD, fontSize: 12 }}>${l.unitCost.toFixed(2)}</td>
                                <td style={{ ...TD, fontWeight: 600, color: "#f59e0b" }}>${l.total.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {/* ================== MODALS ================== */}

      {/* Part Modal */}
      <Modal open={modal === "part"} onClose={() => setModal(null)} title={editItem ? "Edit Raw Material" : "Add Raw Material"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>ProductCode</label><input value={form.id || ""} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Name</label><input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Costing Method</label><select value={form.costing || "FIFO"} onChange={(e) => setForm((f) => ({ ...f, costing: e.target.value }))} style={IS}>{COSTING.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Unit of Measure</label><input value={form.unit || ""} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Qty On Hand</label><input type="number" value={form.qty || 0} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Min Before Reorder</label><input type="number" value={form.minStock || 0} onChange={(e) => setForm((f) => ({ ...f, minStock: Number(e.target.value) }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Avg Cost (last 3 orders)</label><input type="number" step="0.01" value={form.avgCost || 0} onChange={(e) => setForm((f) => ({ ...f, avgCost: Number(e.target.value) }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Supplier</label><select value={form.supplier || ""} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} style={IS}><option value="">None</option>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Supplier Product Code</label><input value={form.supplierCode || ""} onChange={(e) => setForm((f) => ({ ...f, supplierCode: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Location</label><input value={form.location || ""} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={IS} /></div>
          <div style={{ gridColumn: "1/3" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label><input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={IS} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setModal(null)} style={B2}>Cancel</button><button onClick={save} style={B1}>{editItem ? "Update" : "Add"}</button></div>
      </Modal>

      {/* Assembly Modal */}
      <Modal open={modal === "assembly"} onClose={() => setModal(null)} title={editItem ? "Edit Assembly" : "Create Assembly"} wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>ProductCode</label><input value={form.id || ""} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Name</label><input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Category</label><select value={form.category || ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={IS}>{Object.values(LEVELS).filter((l) => l.cat !== "Raw Material").map((l) => <option key={l.cat} value={l.cat}>{l.cat}</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Unit</label><input value={form.unit || ""} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Qty On Hand</label><input type="number" value={form.qty || 0} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Min Stock</label><input type="number" value={form.minStock || 0} onChange={(e) => setForm((f) => ({ ...f, minStock: Number(e.target.value) }))} style={IS} /></div>
          <div style={{ gridColumn: "1/3" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Location</label><input value={form.location || ""} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label><input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={IS} /></div>
        </div>
        <div style={{ borderTop: "1px solid #2a2a3a", paddingTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ margin: 0, fontSize: 15 }}>Bill of Materials</h3><button onClick={() => setBomForm((p) => [...p, { partId: "", qty: 1 }])} style={B2}><Plus size={14} /> Add Line</button></div>
          {bomForm.length === 0 && <p style={{ color: "#555", fontSize: 13 }}>No components yet.</p>}
          {bomForm.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <select value={line.partId} onChange={(e) => setBomForm((p) => p.map((b, j) => j === i ? { ...b, partId: e.target.value } : b))} style={{ ...IS, flex: 2 }}>
                <option value="">Select component...</option>
                {bomItemsForLevel(getLevel(form.id || "200")).map((p) => <option key={p.id} value={p.id}>[{p.id}] {p.name}</option>)}
              </select>
              <input type="number" step="any" min="0" placeholder="Qty" value={line.qty} onChange={(e) => setBomForm((p) => p.map((b, j) => j === i ? { ...b, qty: Number(e.target.value) } : b))} style={{ ...IS, flex: 0.5, minWidth: 70 }} />
              <button onClick={() => setBomForm((p) => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}><Minus size={16} /></button>
            </div>
          ))}
          {bomForm.filter((b) => b.partId && b.qty > 0).length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#888" }}>BOM Cost: <strong style={{ color: "#22c55e" }}>${bomCost(bomForm.filter((b) => b.partId && b.qty > 0)).toFixed(2)}</strong></div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setModal(null)} style={B2}>Cancel</button><button onClick={save} style={B1}>{editItem ? "Update" : "Create"}</button></div>
      </Modal>

      {/* Order Modal */}
      <Modal open={modal === "order"} onClose={() => setModal(null)} title={editItem ? "Edit Order" : "Add Order"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Order ID</label><input value={form.id || ""} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Customer</label><input value={form.customer || ""} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Item</label><select value={form.item || ""} onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))} style={IS}><option value="">Select...</option>{assemblies.filter((a) => getLevel(a.id) >= 300).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Qty</label><input type="number" value={form.qty || 0} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Date</label><input type="date" value={form.date || ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Status</label><select value={form.status || "Pending"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={IS}>{ORD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div style={{ gridColumn: "1/3" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label><input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={IS} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setModal(null)} style={B2}>Cancel</button><button onClick={save} style={B1}>{editItem ? "Update" : "Add"}</button></div>
      </Modal>

      {/* Vendor Modal */}
      <Modal open={modal === "vendor"} onClose={() => setModal(null)} title={editItem ? "Edit Vendor" : "Add Vendor"} wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>ID</label><input value={form.id || ""} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} style={IS} /></div>
          <div style={{ gridColumn: "2/4" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Vendor Name</label><input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Contact</label><input value={form.contact || ""} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Email</label><input value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Phone</label><input value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={IS} /></div>
          <div style={{ gridColumn: "1/4" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Address</label><input value={form.address || ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Payment Terms</label><select value={form.paymentTerms || "Net 30"} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} style={IS}>{["COD", "Net 7", "Net 14", "Net 15", "Net 30", "Net 45", "Net 60", "Prepaid"].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Lead Time (days)</label><input type="number" value={form.leadDays || 0} onChange={(e) => setForm((f) => ({ ...f, leadDays: Number(e.target.value) }))} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label><input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={IS} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setModal(null)} style={B2}>Cancel</button><button onClick={save} style={B1}>{editItem ? "Update" : "Add"}</button></div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={delConfirm !== null} onClose={() => setDelConfirm(null)} title="Confirm Delete">
        <p style={{ color: "#ccc", margin: "0 0 20px", fontSize: 14 }}>Are you sure? This cannot be undone.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setDelConfirm(null)} style={B2}>Cancel</button>
          <button onClick={() => { del(delConfirm); setDelConfirm(null); }} style={{ ...B1, background: "#dc2626" }}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
