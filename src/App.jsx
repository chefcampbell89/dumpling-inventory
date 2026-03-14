import { useState, useMemo, useCallback, useEffect } from "react";
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

const R = (id,name,cost,unit,supplier="",minStock=0,qty=0) => ({id,name,category:"Raw Material",type:"Stock",costing:"FIFO",location:"Dumpling Factory",supplier,supplierCode:"",avgCost:cost,unit,minStock,qty,notes:"",status:"Active"});
const SEED_PARTS = [
  R("100-Baking Soda","Baking Soda",38.71,"24 LB","Baldor Boston, LLC",2,10),
  R("100-Blk Pepper 5 LB","Black Pepper",46.05,"5 LB","Chef's Warehouse",2,8),
  R("100-Blk Pepper 5LB Jug","Black Pepper Jug",46.05,"5 LB Jug","Chef's Warehouse",1,3),
  R("100-Cabot Shredded Cheddar 5 LB","Cabot Shredded Cheddar",34.5964,"5 LB","Baldor Boston, LLC",5,20),
  R("100-Cabot Shredded Sharp Cheddar","Cabot Shredded Sharp Cheddar",41.87,"5 LB","Baldor Boston, LLC",5,15),
  R("100-Cabot Unsalted Butter 36 LB Case","Cabot Unsalted Butter",99.0666,"36 LB Case","Baldor Boston, LLC",2,6),
  R("100-Carrots 50 LB","Carrots",47.5,"50 LB","Baldor Boston, LLC",2,8),
  R("100-CB Retail bag","CB Retail bag",0.4035,"Item","ePac",500,2000),
  R("100-CH Retail bag","CH Retail bag",0.4069,"Item","ePac",500,1800),
  R("100-GC Retail bag","GC Retail bag",0.403,"Item","ePac",500,1500),
  R("100-LG Retail bag","LG Retail bag",0.4028,"Item","ePac",500,1500),
  R("100-TM Retail bag","TM Retail bag",0.4045,"Item","ePac",500,1500),
  R("100-Chang Shing Pressed Tofu 30 LB bucket","Pressed Tofu",55,"30 LB","Chang Shing",3,10),
  R("100-King Arthur Special Patent AP Flour 50lbs","King Arthur Special Patent AP Flour",25.2071,"50 LB","",5,12),
  R("100-Dried Chives 4oz","Dried Chives",12.99,"4oz","",5,15),
  R("100-Kosher Salt Case 9X3","Kosher Salt",80.2651,"Case 9X3","",1,4),
  R("100-Vegetable Oil 2x17.5 LB","Vegetable Oil",37.99,"2x17.5 LB","",2,6),
  R("100-Yellow American Cheese, Unsliced 5 LB","Yellow American Cheese, Unsliced",16.4686,"5 LB","",10,30),
  R("100-Fried Shallots Case","Fried Shallots",106.58,"Case","",2,5),
  R("100-Garlic Powder 5 LB","Garlic Powder",32.25,"5 LB","",2,6),
  R("100-Green Cabbage 50 LB","Green Cabbage",28.0533,"50 LB","",3,8),
  R("100-Ground Beef 10 LB","Ground Beef",69.9,"10 LB","",10,30),
  R("100-Onion Powder 5 LB","Onion Powder",30.76,"5 LB","",2,5),
  R("100-Onions (uncured) 20LB","Onions (uncured)",12.4128,"20 LB","",5,15),
  R("100-Food Svc Bag Roll","Food Svc Bag Roll",203,"Roll","",2,5),
  R("100-Food Svc Case 25X","Food Svc Case 25X",25.75,"Case","",10,40),
  R("100-Retail Case","Retail Case",1.2,"Item","",50,200),
  R("100-Turmeric 5 LB","Turmeric",17.33,"5 LB","",2,5),
  R("100-Garlic Peeled 5 LB","Peeled Garlic",18.75,"5 LB","",5,15),
  R("100-Potatoes 50 LB","Yukon B Potatoes",25.5435,"50 LB","",3,8),
  R("100-Scallions 48 Ct. Case","Scallions",90.7518,"Case","",2,5),
  R("100-Spirulina","Spirulina",39.97,"Unit","",2,4),
  R("100-Duck Fat 7.5 LB","Duck Fat",50.2309,"7.5 LB","",2,5),
  R("100-Ginger 5 LB","Ginger",13.1667,"5 LB","",5,15),
  R("100-Ground Chicken 10 LB","Ground Chicken",36,"10 LB","",10,25),
  R("100-Shao Xing Cooking Wine","Shao Xing Cooking Wine",5,"Bottle","",5,10),
  R("100-Soy Sauce","Soy Sauce",42.75,"Bottle","",3,8),
  R("100-Zenzhu Vermicelli Case","Vermicelli",67.9,"Case","",2,5),
  R("100-Chopped Lemongrass Case","Chopped Lemongrass",108,"Case","",2,4),
  R("100-Ground Pork 10 LB","Ground Pork",10.172,"10 LB","",10,30),
  R("100-Olive Nation LG Flavor Oil - Natural 1Gal","Lemongrass Extract",146.99,"1 Gal","",1,3),
  R("100-Domino Granulated Sugar 50 LB","Granulated Sugar",42,"50 LB","",1,3),
  R("100-Pacific Vegetable Stock 32 oz","Pacific Vegetable Stock",4.67,"32 oz","",5,10),
  R("100-Deli Container 12oz Case","Deli Container 12oz",29.49,"Case","",3,8),
  R("100-Dried Parsley 5LB","Dried Parsley",12.25,"5 LB","",2,5),
  R("100-Holland Windmill Potato Starch 50 LB","Potato Starch",56.5,"50 LB","",2,4),
  R("100-Erawan Rice Flour 24 x 1 LB","Rice Flour",28.791,"24x1 LB","",2,4),
  R("100-Tapioca Starch 50 LB","Tapioca Starch",39.95,"50 LB","",2,4),
  R("100-Cilantro 1 LB","Cilantro",10,"1 LB","",10,20),
  R("100-Corn Starch 24x1lb case","Corn Starch",50.2,"24x1lb Case","",2,4),
  R("100-Dried Shiitake 5 LB","Dried Shiitake",46.5,"5 LB","",3,6),
  R("100-Curio Five Spice Blend 25LB","Curio Five Spice",750,"25 LB","",1,2),
  R("100-Rice Wine Vinegar","Rice Wine Vinegar",10.75,"Bottle","",3,6),
  R("100-Kadoya Sesame Oil Case","Sesame Oil",213.95,"Case","",1,3),
];

const A = (id,name,cat,unit,cost,loc,notes,bom) => ({id,name,category:cat,type:"Stock",costing:cat==="Raw Material"?"FIFO":"FEFO - Batch",location:loc||"Dumpling Factory",supplier:"",supplierCode:"",avgCost:cost,unit,minStock:0,qty:0,notes:notes||"",status:"Active",bom});
const SEED_ASSEMBLIES = [
  // ---- CB (Cheeseburger) ----
  A("200-CB Dough","CB Dough","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-King Arthur Special Patent AP Flour 50lbs",qty:0.5},{partId:"100-Dried Chives 4oz",qty:0.084},{partId:"100-Kosher Salt Case 9X3",qty:0.009},{partId:"100-Vegetable Oil 2x17.5 LB",qty:0.007}]),
  A("200-CB Fill","CB Fill","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-Yellow American Cheese, Unsliced 5 LB",qty:1.1},{partId:"100-Fried Shallots Case",qty:1.1},{partId:"100-Garlic Powder 5 LB",qty:0.007},{partId:"100-Green Cabbage 50 LB",qty:0.13},{partId:"100-Ground Beef 10 LB",qty:1.5},{partId:"100-Kosher Salt Case 9X3",qty:0.011},{partId:"100-Onion Powder 5 LB",qty:0.02},{partId:"100-Onions (uncured) 20LB",qty:0.106}]),
  A("250-CB Batch","CB Batch","WIP","1 Batch",202.81,"Dumpling Factory","~432 pcs/batch",
    [{partId:"200-CB Dough",qty:1},{partId:"200-CB Fill",qty:1}]),
  A("300-CB Bin","CB Bin","Bulk Storage","432 pieces",68.95,"Dumpling Factory: Walk-in Freezer","0.34 batch/bin",
    [{partId:"250-CB Batch",qty:0.34}]),
  A("400-CB Catering Pieces","CB Catering (Pieces)","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-CB Bin",qty:0.0024}]),
  A("400-CB Catering Tray","CB Catering Tray","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-CB Bin",qty:0.11}]),
  A("400-CB Food Service Case","CB Food Service Case","Retail Unit","200 pcs",60.43,"Dumpling Factory: Walk-in Freezer","",
    [{partId:"300-CB Bin",qty:0.5},{partId:"100-Food Svc Bag Roll",qty:0.001},{partId:"100-Food Svc Case 25X",qty:0.04}]),
  A("400-CB Pack","CB Pack","Retail Unit","14 oz",2.70,"Dumpling Factory","Retail 14oz",
    [{partId:"300-CB Bin",qty:0.0333},{partId:"100-CB Retail bag",qty:1}]),
  A("500-CB Retail Case","CB Retail Case","Retail Case","Case",0,"Dumpling Factory","12 packs/case",
    [{partId:"400-CB Pack",qty:12},{partId:"100-Retail Case",qty:1}]),

  // ---- CH (Cheddar Potato) ----
  A("200-CH Dough","CH Dough","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-King Arthur Special Patent AP Flour 50lbs",qty:0.556},{partId:"100-Kosher Salt Case 9X3",qty:0.01},{partId:"100-Turmeric 5 LB",qty:0.028},{partId:"100-Vegetable Oil 2x17.5 LB",qty:0.004}]),
  A("200-CH Fill","CH Fill","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-Blk Pepper 5 LB",qty:0.029},{partId:"100-Cabot Shredded Cheddar 5 LB",qty:1},{partId:"100-Cabot Unsalted Butter 36 LB Case",qty:0.139},{partId:"100-Garlic Peeled 5 LB",qty:0.11},{partId:"100-Kosher Salt Case 9X3",qty:0.012},{partId:"100-Potatoes 50 LB",qty:0.5},{partId:"100-Scallions 48 Ct. Case",qty:0.017}]),
  A("250-CH Batch","CH Batch","WIP","1 Batch",100.59,"Dumpling Factory","",
    [{partId:"200-CH Dough",qty:1},{partId:"200-CH Fill",qty:1}]),
  A("300-CH Bin","CH Bin","Bulk Storage","432 pieces",40.24,"Dumpling Factory: Walk-in Freezer","0.4 batch/bin",
    [{partId:"250-CH Batch",qty:0.4}]),
  A("400-CH Catering Pieces","CH Catering (Pieces)","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-CH Bin",qty:0.0024}]),
  A("400-CH Catering Tray","CH Catering Tray","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-CH Bin",qty:0.11}]),
  A("400-CH Food Service Case","CH Food Service Case","Retail Unit","200 pcs",0,"Dumpling Factory: Walk-in Freezer","",
    [{partId:"300-CH Bin",qty:0.5},{partId:"100-Food Svc Bag Roll",qty:0.001},{partId:"100-Food Svc Case 25X",qty:0.04}]),
  A("400-CH Pack","CH Pack","Retail Unit","14 oz",0,"Dumpling Factory","",
    [{partId:"300-CH Bin",qty:0.0333},{partId:"100-CH Retail bag",qty:1}]),
  A("500-CH Retail Case","CH Retail Case","Retail Case","Case",0,"Dumpling Factory","12 packs/case",
    [{partId:"400-CH Pack",qty:12},{partId:"100-Retail Case",qty:1}]),

  // ---- GC (Ginger Chicken) ----
  A("200-GC Dough","GC Dough","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-King Arthur Special Patent AP Flour 50lbs",qty:0.423},{partId:"100-Kosher Salt Case 9X3",qty:0.008},{partId:"100-Spirulina",qty:0.025},{partId:"100-Vegetable Oil 2x17.5 LB",qty:0.009}]),
  A("200-GC Fill","GC Fill","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-Green Cabbage 50 LB",qty:0.08},{partId:"100-Duck Fat 7.5 LB",qty:0.187},{partId:"100-Garlic Peeled 5 LB",qty:0.079},{partId:"100-Ginger 5 LB",qty:0.115},{partId:"100-Ground Chicken 10 LB",qty:2},{partId:"100-Kosher Salt Case 9X3",qty:0.009},{partId:"100-Onions (uncured) 20LB",qty:0.026},{partId:"100-Shao Xing Cooking Wine",qty:0.291},{partId:"100-Soy Sauce",qty:0.02},{partId:"100-Zenzhu Vermicelli Case",qty:0.045}]),
  A("250-GC Batch","GC Batch","WIP","1 Batch",105.42,"Dumpling Factory","",
    [{partId:"200-GC Dough",qty:1},{partId:"200-GC Fill",qty:1}]),
  A("300-GC Bin","GC Bin","Bulk Storage","432 pieces",40.26,"Dumpling Factory: Walk-in Freezer","0.38 batch/bin",
    [{partId:"250-GC Batch",qty:0.38}]),
  A("400-GC Catering Pieces","GC Catering (Pieces)","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-GC Bin",qty:0.0024}]),
  A("400-GC Catering Tray","GC Catering Tray","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-GC Bin",qty:0.11}]),
  A("400-GC Food Service Case","GC Food Service Case","Retail Unit","200 pcs",0,"Dumpling Factory: Walk-in Freezer","",
    [{partId:"100-Food Svc Bag Roll",qty:0.001},{partId:"100-Food Svc Case 25X",qty:1},{partId:"300-GC Bin",qty:0.5}]),
  A("400-GC Pack","GC Pack","Retail Unit","14 oz",0,"Dumpling Factory","",
    [{partId:"300-GC Bin",qty:0.0333},{partId:"100-GC Retail bag",qty:1}]),
  A("500-GC Retail Case","GC Retail Case","Retail Case","Case",0,"Dumpling Factory","12 packs/case",
    [{partId:"400-GC Pack",qty:12},{partId:"100-Retail Case",qty:1}]),

  // ---- LG (Lemongrass Pork) ----
  A("200-LG Dough","LG Dough","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-King Arthur Special Patent AP Flour 50lbs",qty:0.529},{partId:"100-Kosher Salt Case 9X3",qty:0.01},{partId:"100-Vegetable Oil 2x17.5 LB",qty:0.009}]),
  A("200-LG Fill","LG Fill","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-Green Cabbage 50 LB",qty:0.176},{partId:"100-Chopped Lemongrass Case",qty:0.03},{partId:"100-Garlic Peeled 5 LB",qty:0.108},{partId:"100-Ginger 5 LB",qty:0.108},{partId:"100-Ground Pork 10 LB",qty:2},{partId:"100-Kosher Salt Case 9X3",qty:0.011},{partId:"100-Olive Nation LG Flavor Oil - Natural 1Gal",qty:0.017},{partId:"100-Scallions 48 Ct. Case",qty:0.101},{partId:"100-Soy Sauce",qty:0.024},{partId:"100-Domino Granulated Sugar 50 LB",qty:0.011}]),
  A("200-LG Fill Vegetable Stock","LG Fill Vegetable Stock","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-Pacific Vegetable Stock 32 oz",qty:1.103}]),
  A("250-LG Batch","LG Batch","WIP","1 Batch",146.63,"Dumpling Factory","",
    [{partId:"200-LG Dough",qty:1},{partId:"200-LG Fill",qty:1}]),
  A("300-LG Bin","LG Bin","Bulk Storage","432 pieces",47.67,"Dumpling Factory: Walk-in Freezer","0.333 batch/bin",
    [{partId:"250-LG Batch",qty:0.333}]),
  A("300-LG Class Fill Pint","LG Class Fill Pint","Bulk Storage","1 Batch",0,"Dumpling Factory","",
    [{partId:"100-Deli Container 12oz Case",qty:0.005},{partId:"200-LG Fill",qty:0.03333}]),
  A("400-LG Catering Pieces","LG Catering (Pieces)","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-LG Bin",qty:0.0024}]),
  A("400-LG Catering Tray","LG Catering Tray","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-LG Bin",qty:0.11}]),
  A("400-LG Food Service Case","LG Food Service Case","Retail Unit","200 pcs",0,"Dumpling Factory: Walk-in Freezer","",
    [{partId:"100-Food Svc Bag Roll",qty:0.001},{partId:"100-Food Svc Case 25X",qty:1},{partId:"300-LG Bin",qty:0.5}]),
  A("400-LG Pack","LG Pack","Retail Unit","14 oz",0,"Dumpling Factory","",
    [{partId:"300-LG Bin",qty:0.0333},{partId:"100-LG Retail bag",qty:1}]),
  A("500-LG Retail Case","LG Retail Case","Retail Case","Case",0,"Dumpling Factory","12 packs/case",
    [{partId:"400-LG Pack",qty:12},{partId:"100-Retail Case",qty:1}]),

  // ---- TM (Tofu Mushroom) ----
  A("200-TM Dough","TM Dough","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-Baking Soda",qty:0.007},{partId:"100-Dried Parsley 5LB",qty:0.011},{partId:"100-Holland Windmill Potato Starch 50 LB",qty:0.159},{partId:"100-Erawan Rice Flour 24 x 1 LB",qty:0.11},{partId:"100-Kosher Salt Case 9X3",qty:0.008},{partId:"100-Tapioca Starch 50 LB",qty:0.106},{partId:"100-Vegetable Oil 2x17.5 LB",qty:0.036}]),
  A("200-TM Fill","TM Fill","Sub-Recipe","Batch",0,"Dumpling Factory","",
    [{partId:"100-Green Cabbage 50 LB",qty:0.144},{partId:"100-Carrots 50 LB",qty:0.045},{partId:"100-Cilantro 1 LB",qty:0.331},{partId:"100-Corn Starch 24x1lb case",qty:0.014},{partId:"100-Dried Shiitake 5 LB",qty:0.171},{partId:"100-Curio Five Spice Blend 25LB",qty:0.004},{partId:"100-Ginger 5 LB",qty:0.082},{partId:"100-Chang Shing Pressed Tofu 30 LB bucket",qty:0.367},{partId:"100-Rice Wine Vinegar",qty:0.128},{partId:"100-Kosher Salt Case 9X3",qty:0.009},{partId:"100-Kadoya Sesame Oil Case",qty:0.008},{partId:"100-Soy Sauce",qty:0.018},{partId:"100-Domino Granulated Sugar 50 LB",qty:0.008}]),
  A("250-TM Batch","TM Batch","WIP","1 Batch",96,"Dumpling Factory","",
    [{partId:"200-TM Dough",qty:1},{partId:"200-TM Fill",qty:1}]),
  A("300-TM Bin","TM Bin","Bulk Storage","400 pcs",31.59,"Dumpling Factory: Walk-in Freezer","0.35 batch/bin",
    [{partId:"250-TM Batch",qty:0.35}]),
  A("400-TM Catering Pieces","TM Catering (Pieces)","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-TM Bin",qty:0.0024}]),
  A("400-TM Catering Tray","TM Catering Tray","Retail Unit","Each",0,"Dumpling Factory","",
    [{partId:"300-TM Bin",qty:0.11}]),
  A("400-TM Food Service Case","TM Food Service Case","Retail Unit","200 pcs",0,"Dumpling Factory: Walk-in Freezer","",
    [{partId:"100-Food Svc Bag Roll",qty:0.001},{partId:"100-Food Svc Case 25X",qty:1},{partId:"300-TM Bin",qty:0.5}]),
  A("400-TM Pack","TM Pack","Retail Unit","14 oz",0,"Dumpling Factory","",
    [{partId:"300-TM Bin",qty:0.0333},{partId:"100-TM Retail bag",qty:1}]),
  A("500-TM Retail Case","TM Retail Case","Retail Case","Case",0,"Dumpling Factory","12 packs/case",
    [{partId:"400-TM Pack",qty:12},{partId:"100-Retail Case",qty:1}]),

  // ---- Misc sub-assemblies ----
  A("200-Deli Container 12oz","Deli Container 12oz","Sub-Recipe","Each",0,"Dumpling Factory","",
    [{partId:"100-Deli Container 12oz Case",qty:0.15}]),
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
  { id: "ORD-003", customer: "Happy Belly Restaurant", item: "400-LG Food Service Case", qty: 4, date: "2026-03-12", status: "Fulfilled", notes: "" },
  { id: "ORD-004", customer: "Whole Foods Northeast", item: "500-CB Retail Case", qty: 20, date: "2026-03-18", status: "Pending", notes: "New account trial" },
  { id: "ORD-005", customer: "Whole Foods Northeast", item: "500-CH Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial" },
  { id: "ORD-006", customer: "Whole Foods Northeast", item: "500-GC Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial" },
  { id: "ORD-007", customer: "Whole Foods Northeast", item: "500-LG Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial" },
  { id: "ORD-008", customer: "Whole Foods Northeast", item: "500-TM Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial" },
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
  const [importData, setImportData] = useState(null);
  const [importMapping, setImportMapping] = useState({});
  const [importMode, setImportMode] = useState("append");

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

  // ---- CSV IMPORT WITH PREVIEW ----
  const APP_FIELDS = [
    { key: "id", label: "ProductCode (ID)", required: true },
    { key: "name", label: "Name", required: true },
    { key: "category", label: "Category" },
    { key: "type", label: "Type" },
    { key: "costing", label: "Costing Method" },
    { key: "location", label: "Location" },
    { key: "supplier", label: "Supplier" },
    { key: "supplierCode", label: "Supplier Product Code" },
    { key: "avgCost", label: "Average Cost", numeric: true },
    { key: "unit", label: "Unit of Measure" },
    { key: "minStock", label: "Min Before Reorder", numeric: true },
    { key: "qty", label: "Qty On Hand", numeric: true },
    { key: "notes", label: "Notes" },
    { key: "status", label: "Status" },
  ];

  const HEADER_ALIASES = {
    productcode: "id", sku: "id", "product code": "id", id: "id",
    name: "name", "part name": "name", description: "name",
    category: "category",
    type: "type",
    costingmethod: "costing", "costing method": "costing",
    defaultlocation: "location", "default location": "location", location: "location", bin: "location",
    lastsuppliedby: "supplier", "last supplied by": "supplier", supplier: "supplier", vendor: "supplier",
    supplierproductcode: "supplierCode", "supplier product code": "supplierCode",
    "averagecost (last 3 orders)": "avgCost", averagecost: "avgCost", avgcost: "avgCost", cost: "avgCost", "average cost": "avgCost", "supplier price": "avgCost", supplierprice: "avgCost",
    defaultunitofmeasure: "unit", "default unit of measure": "unit", unit: "unit", uom: "unit",
    minimumbeforereorder: "minStock", "minimum before reorder": "minStock", minstock: "minStock", min: "minStock",
    qty: "qty", quantity: "qty", "on hand": "qty",
    notes: "notes",
    status: "status",
  };

  const importCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split("\n").filter((l) => l.trim());
        if (lines.length < 2) { show("CSV has no data rows", "error"); return; }
        const rawHeaders = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((c) => c.replace(/^"|"$/g, "").trim());
          if (!cols || cols.length < 2) continue;
          const row = {};
          rawHeaders.forEach((h, idx) => { row[h] = cols[idx] || ""; });
          rows.push(row);
        }
        if (rows.length === 0) { show("No valid rows found", "error"); return; }
        const autoMap = {};
        rawHeaders.forEach((h) => {
          const normalized = h.toLowerCase().trim();
          if (HEADER_ALIASES[normalized]) { autoMap[h] = HEADER_ALIASES[normalized]; }
        });
        setImportData({ headers: rawHeaders, rows, fileName: file.name });
        setImportMapping(autoMap);
        setImportMode("append");
      } catch { show("Failed to read CSV", "error"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const executeImport = () => {
    if (!importData) return;
    const { rows } = importData;
    const mapping = importMapping;
    const idCol = Object.entries(mapping).find(([_, v]) => v === "id")?.[0];
    const nameCol = Object.entries(mapping).find(([_, v]) => v === "name")?.[0];
    if (!idCol || !nameCol) { show("ProductCode and Name must be mapped", "error"); return; }
    const newItems = [];
    const existingIds = new Set(allItems.map((i) => i.id));
    for (const row of rows) {
      const item = { id: "", name: "", category: "Raw Material", type: "Stock", costing: "FIFO", location: "", supplier: "", supplierCode: "", avgCost: 0, unit: "", minStock: 0, qty: 0, notes: "", status: "Active" };
      for (const [csvCol, appField] of Object.entries(mapping)) {
        if (!appField || appField === "skip") continue;
        const val = row[csvCol] || "";
        const fieldDef = APP_FIELDS.find((f) => f.key === appField);
        if (fieldDef?.numeric) { item[appField] = Number(val.replace(/[^0-9.\-]/g, "")) || 0; }
        else { item[appField] = val; }
      }
      if (!item.id || !item.name) continue;
      if (importMode === "append" && existingIds.has(item.id)) continue;
      if (importMode === "overwrite") existingIds.add(item.id);
      newItems.push(item);
    }
    if (newItems.length === 0) { show(importMode === "append" ? "No new items (all IDs already exist)" : "No valid items found", "error"); setImportData(null); return; }
    if (importMode === "overwrite") {
      const overwriteIds = new Set(newItems.map((i) => i.id));
      setParts((prev) => [...prev.filter((p) => !overwriteIds.has(p.id)), ...newItems]);
    } else { setParts((prev) => [...prev, ...newItems]); }
    bulkInsertItems(newItems).catch((e) => console.warn("Bulk insert failed:", e.message));
    show(`Imported ${newItems.length} items (${importMode})`);
    setImportData(null);
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

      {/* CSV Import Preview */}
      <Modal open={importData !== null} onClose={() => setImportData(null)} title={`Import CSV — ${importData?.fileName || ""}`} wide>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#ccc" }}>{importData?.rows.length || 0} rows found</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#888" }}>Mode:</span>
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)} style={{ ...IS, width: "auto", minWidth: 140 }}>
                <option value="append">Append (skip existing IDs)</option>
                <option value="overwrite">Overwrite (replace matching IDs)</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>Column Mapping</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Match your CSV columns to inventory fields. Unmapped columns will be skipped.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "6px 12px", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>YOUR CSV COLUMN</div>
            <div></div>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>MAPS TO</div>
            {importData?.headers.map((h) => (
              <React.Fragment key={h}>
                <div style={{ fontSize: 13, color: "#e0e0e0", padding: "4px 8px", background: "#16161e", borderRadius: 4, fontFamily: "monospace" }}>{h}</div>
                <div style={{ color: "#555", fontSize: 13 }}>→</div>
                <select value={importMapping[h] || "skip"} onChange={(e) => setImportMapping((prev) => ({ ...prev, [h]: e.target.value }))} style={{ ...IS, padding: "6px 10px", fontSize: 13, background: importMapping[h] && importMapping[h] !== "skip" ? "#1a2a1a" : "#16161e", borderColor: importMapping[h] && importMapping[h] !== "skip" ? "#2a4a2a" : "#333" }}>
                  <option value="skip">— Skip this column —</option>
                  {APP_FIELDS.map((f) => (<option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>))}
                </select>
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>Preview (first 5 rows)</div>
          <div style={{ overflowX: "auto", border: "1px solid #2a2a3a", borderRadius: 8, marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{APP_FIELDS.filter((f) => Object.values(importMapping).includes(f.key)).map((f) => (<th key={f.key} style={{ ...TH, fontSize: 10, padding: "6px 8px" }}>{f.label}</th>))}</tr></thead>
              <tbody>{importData?.rows.slice(0, 5).map((row, i) => (<tr key={i}>{APP_FIELDS.filter((f) => Object.values(importMapping).includes(f.key)).map((f) => { const csvCol = Object.entries(importMapping).find(([_, v]) => v === f.key)?.[0]; return <td key={f.key} style={{ ...TD, fontSize: 12, padding: "6px 8px", color: row[csvCol] ? "#ccc" : "#555" }}>{row[csvCol] || "—"}</td>; })}</tr>))}</tbody>
            </table>
          </div>
          {!Object.values(importMapping).includes("id") && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>⚠ ProductCode (ID) must be mapped</div>}
          {!Object.values(importMapping).includes("name") && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>⚠ Name must be mapped</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#888" }}>{Object.values(importMapping).filter((v) => v && v !== "skip").length} of {importData?.headers.length || 0} columns mapped</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setImportData(null)} style={B2}>Cancel</button>
            <button onClick={executeImport} disabled={!Object.values(importMapping).includes("id") || !Object.values(importMapping).includes("name")} style={{ ...B1, opacity: (!Object.values(importMapping).includes("id") || !Object.values(importMapping).includes("name")) ? 0.4 : 1 }}>Import {importData?.rows.length || 0} Rows</button>
          </div>
        </div>
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
