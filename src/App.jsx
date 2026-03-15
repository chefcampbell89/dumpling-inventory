// APP VERSION: v93
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  fetchItems, upsertItem, deleteItem as dbDeleteItem, bulkInsertItems,
  fetchBomLines, setBomForAssembly,
  fetchVendors, upsertVendor, deleteVendor as dbDeleteVendor,
  fetchOrders, upsertOrder, deleteOrder as dbDeleteOrder,
  fetchPurchaseOrders, createPurchaseOrder, updatePOStatus, deletePO as dbDeletePO,
  fetchReceipts, createReceipt, updateItemQty,
  fetchProductionRuns, createProductionRun,
  fetchInventoryLots, adjustLotQty,
  signIn, signUp, signOut, getSession, getProfile, updateProfile, fetchProfiles,
  getInviteCode, setInviteCode, getLocations, saveLocations, changePassword, supabase,
} from "./supabase";

// Icons — install lucide-react: npm install lucide-react
import {
  Package, AlertTriangle, Search, Plus, Edit2, Trash2, Download, Upload,
  X, ChevronDown, ChevronRight, DollarSign, CheckCircle, Layers,
  ShoppingCart, ClipboardList, Minus, FileText, Printer, Building2, Loader2, PackageCheck, Hammer, Users, LogOut, Lock, KeyRound,
  ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronsUpDown, ScrollText, MapPin,
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
const RECEIPT_TYPES = ["PO Receipt", "Vendor delivery (no PO)", "Inventory adjustment", "Return from production", "Found/count correction"];

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
    [{partId:"100-Green Cabbage 50 LB",qty:0.176},{partId:"100-Chopped Lemongrass Case",qty:0.03},{partId:"100-Garlic Peeled 5 LB",qty:0.108},{partId:"100-Ginger 5 LB",qty:0.108},{partId:"100-Ground Pork 10 LB",qty:2},{partId:"100-Kosher Salt Case 9X3",qty:0.011},{partId:"100-Olive Nation LG Flavor Oil - Natural 1Gal",qty:0.017},{partId:"100-Scallions 48 Ct. Case",qty:0.101},{partId:"100-Soy Sauce",qty:0.024},{partId:"100-Domino Granulated Sugar 50 LB",qty:0.011},{partId:"100-Pacific Vegetable Stock 32 oz",qty:1.103}]),
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

function MultiSelectDropdown({ options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const label = selected.length === 0 ? placeholder : selected.length === options.length ? "All Levels" : selected.map(v => v).join(", ");
  return (
    <div style={{ position: "relative", minWidth: 160 }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...IS, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left", background: "#16161e", fontSize: 14, padding: "8px 12px" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected.length === 0 ? "#888" : "#e0e0e0" }}>{label}</span>
        <ChevronsUpDown size={14} style={{ color: "#666", flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 900 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#1e1e2e", border: "1px solid #333", borderRadius: 8, zIndex: 901, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            <button onClick={() => { onChange(selected.length === options.length ? [] : options.map(o => o.value)); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 13, borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#2a2a3a"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <div style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid #555", display: "flex", alignItems: "center", justifyContent: "center", background: selected.length === options.length ? "#6366f1" : "transparent" }}>{selected.length === options.length && <Check size={12} style={{ color: "#fff" }} />}</div>
              All
            </button>
            <div style={{ height: 1, background: "#2a2a3a", margin: "2px 0" }} />
            {options.map(o => {
              const checked = selected.includes(o.value);
              return (
                <button key={o.value} onClick={() => onChange(checked ? selected.filter(v => v !== o.value) : [...selected, o.value])} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: o.color || "#ccc", fontSize: 13, borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#2a2a3a"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${checked ? o.color || "#6366f1" : "#555"}`, display: "flex", alignItems: "center", justifyContent: "center", background: checked ? (o.color || "#6366f1") : "transparent" }}>{checked && <Check size={12} style={{ color: "#fff" }} />}</div>
                  {o.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  // ---- State ----
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authScreen, setAuthScreen] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authName, setAuthName] = useState("");
  const [authInvite, setAuthInvite] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [allProfiles, setAllProfiles] = useState([]);
  const [pwModal, setPwModal] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const isAdmin = profile?.role === "admin";
  const [tab, setTab] = useState("inventory");
  const [parts, setParts] = useState(SEED_PARTS);
  const [assemblies, setAssemblies] = useState(SEED_ASSEMBLIES);
  const [vendors, setVendors] = useState(SEED_VENDORS);
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [pos, setPOs] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [rcvModal, setRcvModal] = useState(false);
  const [rcvMode, setRcvMode] = useState("po");
  const [rcvPO, setRcvPO] = useState("");
  const [rcvLines, setRcvLines] = useState([]);
  const [rcvType, setRcvType] = useState("PO Receipt");
  const [rcvNotes, setRcvNotes] = useState("");
  const [rcvPoAction, setRcvPoAction] = useState("received");
  const [manualPOModal, setManualPOModal] = useState(false);
  const [manualPOForm, setManualPOForm] = useState({ vendor: "", notes: "" });
  const [manualPOLines, setManualPOLines] = useState([]);
  const [prodRuns, setProdRuns] = useState([]);
  const [prodModal, setProdModal] = useState(false);
  const [prodAssembly, setProdAssembly] = useState("");
  const [prodQty, setProdQty] = useState(1);
  const [prodNotes, setProdNotes] = useState("");
  const [prodConsume, setProdConsume] = useState({});
  const [prodLotNumber, setProdLotNumber] = useState("");
  const [lots, setLots] = useState([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState([]);
  const [stockFilter, setStockFilter] = useState("All");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
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
  const [adjModal, setAdjModal] = useState(false);
  const [adjItem, setAdjItem] = useState(null);
  const [adjQty, setAdjQty] = useState(0);
  const [adjNotes, setAdjNotes] = useState("");
  const [locations, setLocations] = useState(["Dumpling Factory", "Dumpling Factory: Walk-in Freezer", "Dumpling Factory: Dry Storage"]);
  const [locModal, setLocModal] = useState(false);
  const [locEdit, setLocEdit] = useState("");

  // ---- Helper: load all data from Supabase ----
  const loadAllData = useCallback(async () => {
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
      fetchReceipts().then(r => setReceipts(r)).catch(() => {});
      fetchProductionRuns().then(r => setProdRuns(r)).catch(() => {});
      fetchInventoryLots().then(r => setLots(r)).catch(() => {});
      getLocations().then(r => { if (r && r.length > 0) setLocations(r); }).catch(() => {});
    } catch (err) {
      console.warn("Supabase load failed, using seed data:", err.message);
    }
  }, []);

  // ---- Restore session on mount + listen for auth changes ----
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const session = await getSession();
        if (session?.user && isMounted) {
          setAuthUser(session.user);
          try {
            const p = await getProfile(session.user.id);
            if (isMounted) setProfile(p);
          } catch {
            if (isMounted) setProfile({ id: session.user.id, email: session.user.email, name: "", role: "user" });
          }
          await loadAllData();
        }
      } catch (err) {
        console.warn("Session restore failed:", err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    restoreSession();

    // Listen for sign-in / sign-out / token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        if (event === "SIGNED_OUT" || !session) {
          setAuthUser(null);
          setProfile(null);
        }
      }
    );

    return () => { isMounted = false; subscription.unsubscribe(); };
  }, [loadAllData]);

  // ---- Auth handlers ----
  const handleLogin = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const data = await signIn(authEmail, authPass);
      setAuthUser(data.user);
      try { const p = await getProfile(data.user.id); setProfile(p); } catch { setProfile({ id: data.user.id, email: data.user.email, name: "", role: "user" }); }
      setAuthEmail(""); setAuthPass("");
      await loadAllData();
    } catch (e) { setAuthError(e.message); }
    finally { setAuthLoading(false); }
  };

  const handleSignup = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const code = await getInviteCode();
      if (authInvite !== code) { setAuthError("Invalid invite code"); setAuthLoading(false); return; }
      const data = await signUp(authEmail, authPass);
      if (data.user) {
        try { await updateProfile(data.user.id, { name: authName }); } catch {}
        setAuthUser(data.user);
        setProfile({ id: data.user.id, email: authEmail, name: authName, role: "user" });
      }
    } catch (e) { setAuthError(e.message); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = async () => {
    await signOut();
    setAuthUser(null); setProfile(null);
  };

  const handleChangePassword = async () => {
    if (newPw.length < 6) { show("Password must be at least 6 characters", "error"); return; }
    if (newPw !== newPwConfirm) { show("Passwords don't match", "error"); return; }
    try { await changePassword(newPw); show("Password changed!"); setPwModal(false); setNewPw(""); setNewPwConfirm(""); } catch (e) { show(e.message, "error"); }
  };

  // ---- ORDER FULFILLMENT ----
  const shipOrderLine = async (order) => {
    const item = allItems.find(i => i.id === order.item);
    if (item && item.qty < order.qty) {
      if (!window.confirm(`Warning: ${item.name} has ${item.qty} in stock but order needs ${order.qty}. Inventory will go negative. Continue?`)) return;
    }

    // Deduct inventory
    if (item) {
      const newQty = item.qty - order.qty;
      const isPart = parts.some(p => p.id === item.id);
      if (isPart) setParts(prev => prev.map(p => p.id === item.id ? { ...p, qty: newQty } : p));
      else setAssemblies(prev => prev.map(a => a.id === item.id ? { ...a, qty: newQty } : a));
      try { await updateItemQty(item.id, newQty); } catch (e) { console.warn("Qty update failed:", e.message); }
    }

    // Mark order as fulfilled
    const updated = { ...order, status: "Fulfilled" };
    setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
    try { await upsertOrder(updated); } catch (e) { console.warn("Order update failed:", e.message); }
    show(`Shipped ${order.qty} × ${item?.name || order.item}`);
  };

  const shipAllLines = async (lines) => {
    const unshipped = lines.filter(o => o.status !== "Fulfilled" && o.status !== "Cancelled");
    if (unshipped.length === 0) { show("All lines already shipped", "error"); return; }

    // Check stock for all lines
    const warnings = [];
    for (const o of unshipped) {
      const item = allItems.find(i => i.id === o.item);
      if (item && item.qty < o.qty) warnings.push(`${item.name}: need ${o.qty}, have ${item.qty}`);
    }
    if (warnings.length > 0) {
      if (!window.confirm(`Warning — insufficient stock:\n${warnings.join("\n")}\n\nInventory will go negative. Continue?`)) return;
    }

    for (const o of unshipped) {
      await shipOrderLine(o);
    }
  };

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

  // Lots grouped by item, sorted oldest first (FIFO)
  const lotsByItem = useMemo(() => {
    const map = {};
    for (const lot of lots) {
      if (!map[lot.itemId]) map[lot.itemId] = [];
      map[lot.itemId].push(lot);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
    }
    return map;
  }, [lots]);

  const viewItems = useMemo(() => {
    let d = (tab === "inventory" || tab === "items") ? [...parts, ...assemblies] : [];
    if (search) { const s = search.toLowerCase(); d = d.filter((p) => p.name.toLowerCase().includes(s) || p.id.toLowerCase().includes(s) || (p.supplier || "").toLowerCase().includes(s)); }
    if (levelFilter.length > 0) d = d.filter((p) => levelFilter.includes(getLevel(p.id)));
    if (stockFilter === "Low") d = d.filter((p) => p.minStock > 0 && p.qty <= p.minStock);
    if (stockFilter === "OK") d = d.filter((p) => p.minStock === 0 || p.qty > p.minStock);
    if (sortCol) {
      const dir = sortDir === "asc" ? 1 : -1;
      d.sort((a, b) => {
        let av, bv;
        switch (sortCol) {
          case "id": av = a.id; bv = b.id; break;
          case "name": av = a.name; bv = b.name; break;
          case "level": av = getLevel(a.id); bv = getLevel(b.id); break;
          case "costing": av = a.costing || ""; bv = b.costing || ""; break;
          case "qty": av = a.qty; bv = b.qty; break;
          case "minStock": av = a.minStock; bv = b.minStock; break;
          case "unit": av = a.unit || ""; bv = b.unit || ""; break;
          case "avgCost": av = a.avgCost || 0; bv = b.avgCost || 0; break;
          case "bomCost": av = a.bom ? bomCost(a.bom) : 0; bv = b.bom ? bomCost(b.bom) : 0; break;
          case "location": av = a.location || ""; bv = b.location || ""; break;
          case "supplier": av = a.supplier || ""; bv = b.supplier || ""; break;
          default: return 0;
        }
        if (typeof av === "string") return dir * av.localeCompare(bv);
        return dir * ((av || 0) - (bv || 0));
      });
    }
    return d;
  }, [tab, parts, assemblies, search, levelFilter, stockFilter, sortCol, sortDir, bomCost]);

  const viewOrders = useMemo(() => {
    // Group orders by customer+date (orders from Google Forms share a group ID prefix)
    if (!search) return orders;
    const s = search.toLowerCase();
    return orders.filter((o) => o.customer.toLowerCase().includes(s) || o.id.toLowerCase().includes(s) || o.status.toLowerCase().includes(s));
  }, [orders, search]);

  // Group orders by customer+date for display
  const groupedOrders = useMemo(() => {
    const src = viewOrders;
    const groups = {};
    for (const o of src) {
      // Group by customer + date
      const key = `${o.customer}|||${o.date}`;
      if (!groups[key]) groups[key] = { customer: o.customer, date: o.date, lines: [], ids: [] };
      groups[key].lines.push(o);
      groups[key].ids.push(o.id);
    }
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [viewOrders]);
  const viewVendors = useMemo(() => { if (!search) return vendors; const s = search.toLowerCase(); return vendors.filter((v) => v.name.toLowerCase().includes(s)); }, [vendors, search]);

  // Order stats by group (not line items)
  const orderStats = useMemo(() => {
    const groups = {};
    for (const o of orders) {
      const key = `${o.customer}|||${o.date}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    }
    const gArr = Object.values(groups);
    return {
      total: gArr.length,
      pending: gArr.filter(g => g.some(o => o.status === "Pending" || o.status === "Confirmed")).length,
      fulfilled: gArr.filter(g => g.every(o => o.status === "Fulfilled" || o.status === "Cancelled")).length,
    };
  }, [orders]);

  // Unified transaction log from existing data
  const transactionLog = useMemo(() => {
    const entries = [];

    // Production runs
    for (const r of prodRuns) {
      entries.push({
        date: r.date, time: r.createdAt || r.date, type: "Production",
        desc: `Produced ${r.qtyProduced} x ${r.assemblyName}`,
        lot: r.lotNumber || "", user: r.createdBy || "",
        detail: r.consumed.map(c => `-${c.qty.toFixed(3)} ${c.name}`).join(", "),
        color: "#8b5cf6",
      });
    }

    // Receipts (PO receipts, adjustments, manual)
    for (const r of receipts) {
      const totalUnits = r.lines.reduce((s, l) => s + (l.qtyReceived || 0), 0);
      const isAdj = r.type === "Inventory adjustment";
      entries.push({
        date: r.date, time: r.createdAt || r.date, type: isAdj ? "Adjustment" : "Receipt",
        desc: isAdj ? r.notes || "Inventory adjustment" : `${r.type}: ${r.lines.length} items, ${totalUnits} units`,
        lot: "", user: r.createdBy || "",
        detail: r.lines.map(l => `${l.name}: ${l.qtyReceived} ${l.unit}`).join(", "),
        color: isAdj ? "#f59e0b" : "#22c55e",
      });
    }

    // Sort newest first
    entries.sort((a, b) => (b.time || b.date || "").localeCompare(a.time || a.date || ""));
    return entries;
  }, [prodRuns, receipts]);

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

  const openAdd = (type, initLevel) => {
    setEditItem(null);
    if (type === "item") {
      const lvl = initLevel || 100;
      setForm({ id: `${lvl}-`, name: "", category: LEVELS[lvl]?.cat || "Raw Material", type: "Stock", costing: lvl >= 250 ? "FEFO - Batch" : "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "", minStock: 0, qty: 0, notes: "", status: "Active" });
      setBomForm([]);
    }
    else if (type === "order") setForm({ id: `ORD-${String(orders.length + 1).padStart(3, "0")}`, customer: "", item: "", qty: 0, date: new Date().toISOString().slice(0, 10), status: "Pending", notes: "" });
    else if (type === "vendor") setForm({ id: `V-${String(vendors.length + 1).padStart(3, "0")}`, name: "", contact: "", email: "", phone: "", address: "", paymentTerms: "Net 30", leadDays: 0, notes: "" });
    setModal(type);
  };

  const openEdit = (type, item) => { setEditItem(item); setForm({ ...item }); setBomForm(item.bom ? item.bom.map(b => ({...b})) : []); setModal(type); };

  const changeItemLevel = (newLvl) => {
    const oldId = form.id || "";
    const oldPrefix = oldId.match(/^(\d+)-/);
    const suffix = oldPrefix ? oldId.slice(oldPrefix[0].length) : oldId;
    setForm(f => ({
      ...f,
      id: `${newLvl}-${suffix}`,
      category: LEVELS[newLvl]?.cat || f.category,
      costing: newLvl >= 250 ? "FEFO - Batch" : "FIFO",
      supplier: newLvl === 100 ? f.supplier : "",
      supplierCode: newLvl === 100 ? f.supplierCode : "",
    }));
    if (newLvl === 100) setBomForm([]);
  };

  const save = async () => {
    if (modal === "item") {
      if (!form.name || !form.id) { show("Name and ID required", "error"); return; }
      const lvl = getLevel(form.id);
      const cleanBom = lvl >= 200 ? bomForm.filter((b) => b.partId && b.qty > 0) : [];
      const isAssembly = cleanBom.length > 0;
      const obj = { ...form, avgCost: Number(form.avgCost), qty: Number(form.qty), minStock: Number(form.minStock), ...(isAssembly ? { bom: cleanBom } : {}) };
      if (!isAssembly) { delete obj.bom; }
      try {
        await upsertItem(obj);
        if (isAssembly) await setBomForAssembly(obj.id, cleanBom);
        else await setBomForAssembly(obj.id, []); // clear BOM if converting to raw
      } catch (e) { console.warn("DB save failed:", e.message); }

      // Determine where item lives (parts vs assemblies) and handle moves
      const wasPart = parts.some(p => p.id === editItem?.id);
      const wasAssembly = assemblies.some(a => a.id === editItem?.id);

      if (isAssembly) {
        if (wasPart) setParts(p => p.filter(x => x.id !== editItem.id)); // remove from parts
        if (wasAssembly) setAssemblies(p => p.map(x => x.id === editItem.id ? obj : x));
        else setAssemblies(p => [...p, obj]);
      } else {
        if (wasAssembly) setAssemblies(p => p.filter(x => x.id !== editItem.id)); // remove from assemblies
        if (wasPart) setParts(p => p.map(x => x.id === editItem.id ? obj : x));
        else setParts(p => [...p, obj]);
      }
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

  const delOrderGroup = async (group) => {
    if (!window.confirm(`Delete entire order for ${group.customer} (${group.date})? This removes all ${group.lines.length} line(s).`)) return;
    for (const o of group.lines) {
      try { await dbDeleteOrder(o.id); } catch (e) { console.warn(e.message); }
    }
    const ids = new Set(group.lines.map(o => o.id));
    setOrders(prev => prev.filter(o => !ids.has(o.id)));
    show(`Deleted order for ${group.customer}`);
  };

  const addLocation = async (name) => {
    const trimmed = name.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    const updated = [...locations, trimmed].sort();
    setLocations(updated);
    try { await saveLocations(updated); } catch (e) { console.warn("Save locations failed:", e.message); }
  };

  const removeLocation = async (name) => {
    const updated = locations.filter(l => l !== name);
    setLocations(updated);
    try { await saveLocations(updated); } catch (e) { console.warn("Save locations failed:", e.message); }
  };

  const openAdjust = (item) => { setAdjItem(item); setAdjQty(item.qty); setAdjNotes(""); setAdjModal(true); };
  const submitAdjust = async () => {
    if (!adjItem) return;
    const newQty = Number(adjQty);
    const diff = newQty - adjItem.qty;
    if (diff === 0) { setAdjModal(false); return; }
    // Update local state
    const isPart = parts.some(p => p.id === adjItem.id);
    if (isPart) setParts(prev => prev.map(p => p.id === adjItem.id ? { ...p, qty: newQty } : p));
    else setAssemblies(prev => prev.map(a => a.id === adjItem.id ? { ...a, qty: newQty } : a));
    // Persist qty
    try { await updateItemQty(adjItem.id, newQty); } catch (e) { console.warn("Qty update failed:", e.message); }
    // Log as receipt (inventory adjustment)
    const rcptId = `ADJ-${Date.now()}`;
    const rcpt = {
      id: rcptId, poId: null, type: "Inventory adjustment", date: new Date().toISOString().slice(0, 10),
      notes: `Admin adjustment: ${adjItem.qty} -> ${newQty} (${diff > 0 ? "+" : ""}${diff})${adjNotes ? " | " + adjNotes : ""}`,
      createdBy: profile?.email || "", lines: [{ partId: adjItem.id, name: adjItem.name, qtyExpected: adjItem.qty, qtyReceived: newQty, unit: adjItem.unit }],
    };
    try { await createReceipt(rcpt); setReceipts(prev => [rcpt, ...prev]); } catch (e) { console.warn("Receipt log failed:", e.message); }
    show(`Adjusted ${adjItem.name}: ${adjItem.qty} -> ${newQty}`);
    setAdjModal(false);
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

  // ---- PRODUCTION ----
  const prodAssemblyItem = useMemo(() => assemblies.find(a => a.id === prodAssembly), [assemblies, prodAssembly]);

  // Find available lots from 200-level ancestors for lot inheritance
  const suggestedLots = useMemo(() => {
    if (!prodAssemblyItem || !prodAssemblyItem.bom) return [];
    const prodLvl = getLevel(prodAssemblyItem.id);
    if (prodLvl <= 200) return []; // 200-level = manual entry

    // Find lots from 200-level components in the BOM tree
    const find200Lots = (bom) => {
      const result = [];
      for (const line of bom) {
        const item = allItems.find(i => i.id === line.partId);
        if (!item) continue;
        if (getLevel(item.id) === 200) {
          const itemLots = (lotsByItem[item.id] || []).filter(l => l.qty > 0);
          result.push(...itemLots);
        } else if (item.bom) {
          result.push(...find200Lots(item.bom));
        }
      }
      return result;
    };

    // Also check direct BOM components for any level that has lots
    const findDirectLots = (bom) => {
      const result = [];
      for (const line of bom) {
        const itemLots = (lotsByItem[line.partId] || []).filter(l => l.qty > 0);
        result.push(...itemLots);
      }
      return result;
    };

    const allLots = [...find200Lots(prodAssemblyItem.bom), ...findDirectLots(prodAssemblyItem.bom)];
    // Deduplicate by lot number, keep oldest
    const unique = {};
    for (const l of allLots) {
      if (!unique[l.lotNumber] || (l.productionDate || "") < (unique[l.lotNumber].productionDate || "")) {
        unique[l.lotNumber] = l;
      }
    }
    return Object.values(unique).sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
  }, [prodAssemblyItem, allItems, lotsByItem]);

  // prodConsume is { [partId]: true/false } — true means "consume this item from inventory"
  const initConsume = useCallback((assemblyId) => {
    // Default: check the direct children (consume sub-assemblies as whole items)
    const asm = assemblies.find(a => a.id === assemblyId);
    if (!asm || !asm.bom) return {};
    const state = {};
    for (const line of asm.bom) { state[line.partId] = true; }
    return state;
  }, [assemblies]);

  // When checking a sub-assembly, uncheck all its descendants
  // When unchecking a sub-assembly, check all its direct children
  const toggleConsume = (itemId) => {
    setProdConsume(prev => {
      const next = { ...prev };
      const wasChecked = !!prev[itemId];
      const item = allItems.find(i => i.id === itemId);

      if (wasChecked) {
        // Unchecking — drill down: uncheck this, check its direct children
        next[itemId] = false;
        if (item?.bom) {
          for (const l of item.bom) { next[l.partId] = true; }
        }
      } else {
        // Checking — roll up: check this, uncheck all descendants
        next[itemId] = true;
        if (item?.bom) {
          const uncheckDescendants = (bom) => {
            for (const l of bom) {
              next[l.partId] = false;
              const child = allItems.find(i => i.id === l.partId);
              if (child?.bom) uncheckDescendants(child.bom);
            }
          };
          uncheckDescendants(item.bom);
        }
      }
      return next;
    });
  };

  // Collect all checked items with their quantities
  const getConsumedItems = useCallback((bom, multiplier) => {
    const result = [];
    for (const line of bom) {
      const item = allItems.find(i => i.id === line.partId);
      if (!item) continue;
      const totalQty = line.qty * multiplier;
      if (prodConsume[item.id]) {
        // This item is checked — consume it directly
        result.push({ partId: item.id, name: item.name, qty: totalQty, unit: item.unit, currentQty: item.qty });
      } else if (item.bom && item.bom.length > 0) {
        // Not checked but has children — recurse
        result.push(...getConsumedItems(item.bom, totalQty));
      }
      // If no children and not checked, it's a gap (validation will catch it)
    }
    return result;
  }, [allItems, prodConsume]);

  // Validate that every leaf in the tree is covered
  const getValidationErrors = useCallback((bom, multiplier) => {
    const errors = [];
    for (const line of bom) {
      const item = allItems.find(i => i.id === line.partId);
      if (!item) { errors.push(`${line.partId} not found`); continue; }
      if (prodConsume[item.id]) continue; // checked, we're good
      if (item.bom && item.bom.length > 0) {
        // Not checked — children must cover it
        errors.push(...getValidationErrors(item.bom, line.qty * multiplier));
      } else {
        // Raw material not checked — gap
        errors.push(`${item.name} is not checked`);
      }
    }
    return errors;
  }, [allItems, prodConsume]);

  const submitProduction = async () => {
    if (!prodAssemblyItem) { show("Select an assembly", "error"); return; }
    if (prodQty <= 0) { show("Qty must be > 0", "error"); return; }
    const validationErrors = getValidationErrors(prodAssemblyItem.bom, prodQty);
    if (validationErrors.length > 0) { show("Not all materials are accounted for: " + validationErrors[0], "error"); return; }
    const consumed = getConsumedItems(prodAssemblyItem.bom, prodQty);
    if (consumed.length === 0) { show("Nothing to consume", "error"); return; }

    const shortages = consumed.filter(c => c.qty > c.currentQty);
    if (shortages.length > 0) {
      const names = shortages.map(s => `${s.name} (need ${s.qty.toFixed(2)}, have ${s.currentQty})`).join(", ");
      if (!window.confirm(`Warning: insufficient stock for: ${names}. Inventory will go negative. Continue?`)) return;
    }

    const runId = `PROD-${new Date().toISOString().slice(0, 10)}-${String(prodRuns.length + 1).padStart(3, "0")}`;
    const runDate = new Date().toISOString().slice(0, 10);
    const lotNum = prodLotNumber.trim();
    const run = {
      id: runId, assemblyId: prodAssemblyItem.id, assemblyName: prodAssemblyItem.name,
      qtyProduced: prodQty, date: runDate, lotNumber: lotNum,
      notes: prodNotes, createdBy: profile?.email || "", consumed,
    };

    const updParts = [...parts];
    const updAsm = [...assemblies];
    const updLots = [...lots];

    // Consume items from inventory and lots
    for (const c of consumed) {
      const pi = updParts.findIndex(p => p.id === c.partId);
      if (pi >= 0) { updParts[pi] = { ...updParts[pi], qty: updParts[pi].qty - c.qty }; try { await updateItemQty(c.partId, updParts[pi].qty); } catch (e) { console.warn(e.message); } }
      const ai = updAsm.findIndex(a => a.id === c.partId);
      if (ai >= 0) { updAsm[ai] = { ...updAsm[ai], qty: updAsm[ai].qty - c.qty }; try { await updateItemQty(c.partId, updAsm[ai].qty); } catch (e) { console.warn(e.message); } }

      // Deduct from lots (FIFO - oldest first)
      const itemLots = updLots.filter(l => l.itemId === c.partId && l.qty > 0).sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
      let remain = c.qty;
      for (const lot of itemLots) {
        if (remain <= 0) break;
        const deduct = Math.min(lot.qty, remain);
        lot.qty -= deduct;
        remain -= deduct;
        try { await adjustLotQty(c.partId, lot.lotNumber, -deduct, null, null); } catch (e) { console.warn("Lot deduct failed:", e.message); }
      }
    }

    // Add produced item to inventory and lot
    const prodIdx = updAsm.findIndex(a => a.id === prodAssemblyItem.id);
    if (prodIdx >= 0) { updAsm[prodIdx] = { ...updAsm[prodIdx], qty: updAsm[prodIdx].qty + prodQty }; try { await updateItemQty(prodAssemblyItem.id, updAsm[prodIdx].qty); } catch (e) { console.warn(e.message); } }

    // Add lot entry for produced item
    if (lotNum) {
      const existingLot = updLots.find(l => l.itemId === prodAssemblyItem.id && l.lotNumber === lotNum);
      if (existingLot) {
        existingLot.qty += prodQty;
      } else {
        updLots.push({ id: Date.now(), itemId: prodAssemblyItem.id, lotNumber: lotNum, qty: prodQty, productionDate: runDate, sourceRunId: runId });
      }
      try { await adjustLotQty(prodAssemblyItem.id, lotNum, prodQty, runDate, runId); } catch (e) { console.warn("Lot add failed:", e.message); }
    }

    // Remove empty lots
    const cleanLots = updLots.filter(l => l.qty > 0);

    setParts(updParts);
    setAssemblies(updAsm);
    setLots(cleanLots);
    setProdRuns(prev => [{ ...run, createdAt: new Date().toISOString() }, ...prev]);
    try { await createProductionRun(run); } catch (e) { console.warn("Production save failed:", e.message); }
    show(`Produced ${prodQty} × ${prodAssemblyItem.name}${lotNum ? " (Lot: " + lotNum + ")" : ""}`);
    setProdModal(false);
  };

  const renderConsumptionTree = (bom, multiplier, depth = 0) => (
    <div style={{ marginLeft: depth * 24 }}>
      {bom.map((line, i) => {
        const item = allItems.find(x => x.id === line.partId);
        if (!item) return <div key={i} style={{ color: "#ef4444", fontSize: 12 }}>⚠ {line.partId} not found</div>;
        const lvl = getLevel(item.id);
        const hasBom = item.bom && item.bom.length > 0;
        const isChecked = !!prodConsume[item.id];
        const totalNeeded = line.qty * multiplier;
        const sufficient = item.qty >= totalNeeded;
        // Check if any descendant is checked (meaning user drilled down)
        const anyChildChecked = hasBom && item.bom.some(l => prodConsume[l.partId]);
        const showChildren = hasBom && !isChecked;

        return (
          <div key={`${item.id}-${depth}-${i}`} style={{ marginBottom: 2 }}>
            <div
              onClick={() => toggleConsume(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                background: isChecked ? "#1a2a1a" : "transparent",
                border: isChecked ? "1px solid #2a4a2a" : "1px solid transparent",
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: isChecked ? "2px solid #22c55e" : "2px solid #555",
                background: isChecked ? "#22c55e" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isChecked && <span style={{ color: "#000", fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>

              <span style={{ color: LEVELS[lvl]?.color || "#888", fontSize: 11, fontFamily: "monospace", minWidth: 100 }}>{item.id}</span>
              <span style={{ fontSize: 13, color: isChecked ? "#e0e0e0" : "#888", fontWeight: isChecked ? 500 : 400 }}>{item.name}</span>

              {isChecked && (
                <>
                  <span style={{ fontSize: 12, color: "#888" }}>× {totalNeeded.toFixed(3)} {item.unit}</span>
                  <span style={{ fontSize: 11, color: sufficient ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                    ({item.qty} in stock{!sufficient ? " ⚠" : ""})
                  </span>
                </>
              )}

              {!isChecked && hasBom && (
                <span style={{ fontSize: 11, color: "#f59e0b", fontStyle: "italic" }}>↓ using components below</span>
              )}

              {!isChecked && !hasBom && (
                <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ not checked — will not be consumed</span>
              )}
            </div>

            {showChildren && renderConsumptionTree(item.bom, totalNeeded, depth + 1)}
          </div>
        );
      })}
    </div>
  );

  const openManualPO = () => {
    setManualPOForm({ vendor: "", notes: "" });
    setManualPOLines([{ partId: "", name: "", qty: 0, unit: "", unitCost: 0 }]);
    setManualPOModal(true);
  };

  const submitManualPO = async () => {
    if (!manualPOForm.vendor) { show("Vendor is required", "error"); return; }
    const validLines = manualPOLines.filter(l => l.partId && l.qty > 0);
    if (validLines.length === 0) { show("Add at least one item with qty > 0", "error"); return; }
    const vObj = vendors.find(v => v.name === manualPOForm.vendor);
    const pid = `PO-${String(pos.length + 1).padStart(3, "0")}`;
    const total = validLines.reduce((s, l) => s + l.qty * l.unitCost, 0);
    const po = {
      id: pid, vendor: manualPOForm.vendor, vendorId: vObj?.id || "", date: new Date().toISOString().slice(0, 10),
      status: "Draft", total, paymentTerms: vObj?.paymentTerms || "", leadDays: vObj?.leadDays || 0,
      notes: manualPOForm.notes,
      lines: validLines.map(l => ({ partId: l.partId, name: l.name, qty: l.qty, unit: l.unit, unitCost: l.unitCost, total: l.qty * l.unitCost })),
    };
    setPOs(prev => [...prev, po]);
    try { await createPurchaseOrder(po); } catch (e) { console.warn("PO save failed:", e.message); }
    show(`Created ${pid}`);
    setManualPOModal(false);
  };

  // ---- RECEIVING ----
  const openReceiveFromPO = (poId) => {
    const po = pos.find(p => p.id === poId);
    if (!po) return;
    setRcvMode("po");
    setRcvPO(poId);
    setRcvType("PO Receipt");
    setRcvPoAction("received");
    setRcvNotes("");
    setRcvLines(po.lines.map(l => ({ partId: l.partId, name: l.name, qtyExpected: l.qty, qtyReceived: l.qty, unit: l.unit })));
    setRcvModal(true);
  };

  const openReceiveManual = () => {
    setRcvMode("manual");
    setRcvPO("");
    setRcvType("Vendor delivery (no PO)");
    setRcvPoAction("");
    setRcvNotes("");
    setRcvLines([]);
    setRcvModal(true);
  };

  const addManualRcvLine = () => {
    setRcvLines(prev => [...prev, { partId: "", name: "", qtyExpected: 0, qtyReceived: 0, unit: "", location: "" }]);
  };

  const submitReceipt = async () => {
    if (rcvMode === "manual" && !rcvNotes.trim()) { show("Notes/reason required for manual receipts", "error"); return; }
    const validLines = rcvLines.filter(l => l.partId && l.qtyReceived > 0);
    if (validLines.length === 0) { show("No items to receive", "error"); return; }

    const receiptId = `RCV-${new Date().toISOString().slice(0,10)}-${String(receipts.length + 1).padStart(3, "0")}`;
    const receipt = {
      id: receiptId, poId: rcvMode === "po" ? rcvPO : null, type: rcvType,
      date: new Date().toISOString().slice(0, 10), notes: rcvNotes, createdBy: profile?.email || "",
      lines: validLines,
    };

    // Update local inventory quantities
    const updatedParts = [...parts];
    for (const line of validLines) {
      const idx = updatedParts.findIndex(p => p.id === line.partId);
      if (idx >= 0) {
        updatedParts[idx] = { ...updatedParts[idx], qty: updatedParts[idx].qty + line.qtyReceived };
        try { await updateItemQty(line.partId, updatedParts[idx].qty); } catch (e) { console.warn("Qty update failed:", e.message); }
      }
    }
    setParts(updatedParts);

    // Update PO status if receiving from PO
    if (rcvMode === "po" && rcvPO && rcvPoAction) {
      const newStatus = rcvPoAction === "received" ? "Received" : rcvPoAction === "keep" ? undefined : undefined;
      if (newStatus) {
        setPOs(prev => prev.map(p => p.id === rcvPO ? { ...p, status: newStatus } : p));
        try { await updatePOStatus(rcvPO, newStatus); } catch (e) { console.warn("PO status update failed:", e.message); }
      }
    }

    // Save receipt
    setReceipts(prev => [{ ...receipt, createdAt: new Date().toISOString() }, ...prev]);
    try { await createReceipt(receipt); } catch (e) { console.warn("Receipt save failed:", e.message); }

    show(`Received ${validLines.length} items (${receiptId})`);
    setRcvModal(false);
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
    <button onClick={() => { setTab(k); setSearch(""); setLevelFilter([]); setStockFilter("All"); setSortCol(null); }}
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
            <p style={{ fontSize: 16, margin: 0 }}>Loading...</p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* Login / Signup Screen */}
      {!loading && !authUser && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ background: "#1e1e2e", borderRadius: 16, padding: 32, width: "90%", maxWidth: 400, border: "1px solid #333" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <Package size={40} style={{ color: "#6366f1", marginBottom: 8 }} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Dumpling Factory</h1>
              <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>Inventory Management System</p>
              <p style={{ margin: "8px 0 0", color: "#555", fontSize: 10, fontFamily: "monospace" }}>v87</p>
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
              <button onClick={() => { setAuthScreen("login"); setAuthError(""); }} style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: authScreen === "login" ? "#6366f1" : "#2a2a3a", color: authScreen === "login" ? "#fff" : "#888" }}>Log In</button>
              <button onClick={() => { setAuthScreen("signup"); setAuthError(""); }} style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: authScreen === "signup" ? "#6366f1" : "#2a2a3a", color: authScreen === "signup" ? "#fff" : "#888" }}>Sign Up</button>
            </div>

            {authError && <div style={{ background: "#2a1a1a", border: "1px solid #ef444433", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#ef4444" }}>{authError}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {authScreen === "signup" && (
                <div>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Your Name</label>
                  <input value={authName} onChange={e => setAuthName(e.target.value)} placeholder="e.g. Annie" style={IS} />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Email</label>
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@meimeidumpling.com" style={IS} onKeyDown={e => e.key === "Enter" && (authScreen === "login" ? handleLogin() : null)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Password</label>
                <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••" style={IS} onKeyDown={e => e.key === "Enter" && (authScreen === "login" ? handleLogin() : null)} />
              </div>
              {authScreen === "signup" && (
                <div>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Invite Code</label>
                  <input value={authInvite} onChange={e => setAuthInvite(e.target.value)} placeholder="Get this from your admin" style={IS} />
                </div>
              )}
              <button onClick={authScreen === "login" ? handleLogin : handleSignup} disabled={authLoading} style={{ ...B1, width: "100%", justifyContent: "center", padding: "12px", marginTop: 4, opacity: authLoading ? 0.6 : 1 }}>
                {authLoading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : (authScreen === "login" ? <><Lock size={16} /> Log In</> : <><KeyRound size={16} /> Create Account</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== MAIN APP (only when authenticated) ====== */}
      {!loading && authUser && (<>

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: toast.t === "error" ? "#dc2626" : "#16a34a", color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 14, zIndex: 2000, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}><CheckCircle size={16} />{toast.msg}</div>}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><Package size={26} style={{ color: "#6366f1" }} /> Dumpling Factory</h1>
          <p style={{ margin: "2px 0 0", color: "#555", fontSize: 12 }}>Production Inventory • BOM • Purchasing</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <label style={B2}><Upload size={14} /> Import CSV<input type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} /></label>
          <button onClick={exportCSV} style={B2}><Download size={14} /> Export</button>
          <div style={{ height: 20, width: 1, background: "#333", margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#888", textAlign: "right" }}>
              <div style={{ color: "#ccc", fontWeight: 500 }}>{profile?.name || profile?.email}</div>
              <div style={{ fontSize: 10, color: isAdmin ? "#f59e0b" : "#666" }}>{isAdmin ? "Admin" : "User"}</div>
            </div>
            <button onClick={() => { setNewPw(""); setNewPwConfirm(""); setPwModal(true); }} style={{ ...B2, padding: "6px 8px" }} title="Change Password"><KeyRound size={14} /></button>
            {isAdmin && <button onClick={() => { setLocEdit(""); setLocModal(true); }} style={{ ...B2, padding: "6px 8px" }} title="Manage Locations"><MapPin size={14} /></button>}
            <button onClick={handleLogout} style={{ ...B2, padding: "6px 8px", borderColor: "#ef444444", color: "#ef4444" }} title="Log Out"><LogOut size={14} /></button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <Stat icon={<Package size={18} />} label="Total SKUs" value={stats.total} accent="#6366f1" />
        <Stat icon={<AlertTriangle size={18} />} label="Low Stock" value={stats.low} accent={stats.low > 0 ? "#ef4444" : "#22c55e"} />
        <Stat icon={<DollarSign size={18} />} label="Raw Material Value" value={`$${stats.rawVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} accent="#22c55e" />
        <Stat icon={<ShoppingCart size={18} />} label="Open Orders" value={orderStats.pending} accent="#ec4899" />
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("inventory", "Inventory", <Package size={14} />)}
        {tabBtn("items", "Item Master", <Layers size={14} />)}
        {tabBtn("orders", "Orders", <ShoppingCart size={14} />)}
        {tabBtn("vendors", "Vendors", <Building2 size={14} />)}
        {tabBtn("mrp", "Purchase Needs", <ClipboardList size={14} />)}
        {tabBtn("pos", "Purchase Orders", <FileText size={14} />)}
        {tabBtn("receiving", "Receiving", <PackageCheck size={14} />)}
        {tabBtn("production", "Production", <Hammer size={14} />)}
        {tabBtn("log", "Transaction Log", <ScrollText size={14} />)}
        {isAdmin && tabBtn("users", "Users", <Users size={14} />)}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#555" }} />
          <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...IS, paddingLeft: 32 }} />
        </div>
        {tab === "inventory" && <>
          <MultiSelectDropdown
            placeholder="All Levels"
            options={LEVEL_KEYS.map(k => ({ value: k, label: LEVELS[k].label, color: LEVELS[k].color }))}
            selected={levelFilter}
            onChange={setLevelFilter}
          />
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} style={{ ...IS, width: "auto", minWidth: 100 }}>
            <option value="All">All Stock</option>
            <option value="Low">Low Stock</option>
            <option value="OK">In Stock</option>
          </select>
        </>}
        {tab === "items" && <>
          <MultiSelectDropdown
            placeholder="All Levels"
            options={LEVEL_KEYS.map(k => ({ value: k, label: LEVELS[k].label, color: LEVELS[k].color }))}
            selected={levelFilter}
            onChange={setLevelFilter}
          />
          <button onClick={() => openAdd("item")} style={B1}><Plus size={14} /> Add Item</button>
        </>}
        {tab === "orders" && <button onClick={() => openAdd("order")} style={B1}><Plus size={14} /> Order</button>}
        {tab === "vendors" && <button onClick={() => openAdd("vendor")} style={B1}><Plus size={14} /> Vendor</button>}
        {tab === "receiving" && <button onClick={openReceiveManual} style={B1}><Plus size={14} /> Manual Receipt</button>}
        {tab === "pos" && <button onClick={openManualPO} style={B1}><Plus size={14} /> Create PO</button>}
        {tab === "production" && <button onClick={() => { setProdAssembly(""); setProdQty(1); setProdNotes(""); setProdConsume({}); setProdLotNumber(""); setProdModal(true); }} style={B1}><Hammer size={14} /> Run Production</button>}
      </div>

      {/* ================== INVENTORY TABLE ================== */}
      {tab === "inventory" && (
        <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead><tr>
                {[{l:"",k:null},{l:"ProductCode",k:"id"},{l:"Name",k:"name"},{l:"Level",k:"level"},{l:"Costing",k:"costing"},{l:"Qty",k:"qty"},{l:"Min",k:"minStock"},{l:"Unit",k:"unit"},{l:"Avg Cost",k:"avgCost"},{l:"BOM Cost",k:"bomCost"},{l:"Location",k:"location"},{l:"Supplier",k:"supplier"},{l:"",k:null}].map((h,i) => (
                  <th key={i} style={{ ...TH, cursor: h.k ? "pointer" : "default", userSelect: "none" }} onClick={() => { if (!h.k) return; if (sortCol === h.k) { setSortDir(d => d === "asc" ? "desc" : "asc"); } else { setSortCol(h.k); setSortDir("asc"); } }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {h.l}
                      {h.k && (sortCol === h.k ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />)}
                    </div>
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {viewItems.length === 0 ? <tr><td colSpan={13} style={{ ...TD, textAlign: "center", color: "#555", padding: 32 }}>No items found</td></tr> :
                  viewItems.map((p) => {
                    const lvl = getLevel(p.id); const low = p.minStock > 0 && p.qty <= p.minStock; const hasBom = p.bom && p.bom.length > 0; const bc = hasBom ? bomCost(p.bom) : null;
                    const itemLots = (lotsByItem[p.id] || []).filter(l => l.qty > 0);
                    const hasDetail = hasBom || itemLots.length > 0;
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ background: low ? "rgba(239,68,68,0.06)" : "transparent" }}>
                          <td style={TD}>{hasDetail && <button onClick={() => tog(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 2 }}>{expanded[p.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}</td>
                          <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: LEVELS[lvl]?.color || "#888" }}>{p.id}</td>
                          <td style={{ ...TD, fontWeight: 500 }}>{p.name}{low && <AlertTriangle size={13} style={{ color: "#f59e0b", verticalAlign: "middle", marginLeft: 4 }} />}</td>
                          <td style={TD}><LevelBadge level={lvl} /></td>
                          <td style={{ ...TD, fontSize: 11, color: "#888" }}>{p.costing}</td>
                          <td style={{ ...TD, fontWeight: 600, color: low ? "#ef4444" : "#22c55e" }}>
                            {p.qty}
                            {itemLots.length > 0 && <span style={{ fontSize: 10, color: "#888", marginLeft: 4 }}>({itemLots.length} lot{itemLots.length > 1 ? "s" : ""})</span>}
                          </td>
                          <td style={{ ...TD, color: "#666" }}>{p.minStock || "—"}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#999" }}>{p.unit}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{p.avgCost > 0 ? `$${p.avgCost.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#f59e0b" }}>{bc !== null ? `$${bc.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 11, color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.location}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{p.supplier}</td>
                          <td style={TD}>
                            {isAdmin && <button onClick={() => openAdjust(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f59e0b", padding: 3 }} title="Adjust Qty"><Edit2 size={14} /></button>}
                          </td>
                        </tr>
                        {expanded[p.id] && (
                          <tr><td colSpan={13} style={{ ...TD, background: "#16161e", paddingLeft: 48 }}>
                            {itemLots.length > 0 && (
                              <div style={{ marginBottom: hasBom ? 12 : 0 }}>
                                <div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 600 }}>LOT / BATCH BREAKDOWN</div>
                                <table style={{ width: "auto", borderCollapse: "collapse", fontSize: 12 }}>
                                  <thead><tr>
                                    <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Lot #</th>
                                    <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Qty</th>
                                    <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Production Date</th>
                                  </tr></thead>
                                  <tbody>{itemLots.map(l => (
                                    <tr key={l.lotNumber}>
                                      <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, padding: "4px 12px", color: "#a78bfa" }}>{l.lotNumber}</td>
                                      <td style={{ ...TD, fontWeight: 600, fontSize: 12, padding: "4px 12px", color: "#22c55e" }}>{l.qty}</td>
                                      <td style={{ ...TD, fontSize: 12, padding: "4px 12px", color: "#888" }}>{l.productionDate || "—"}</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              </div>
                            )}
                            {hasBom && <><div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 600 }}>BILL OF MATERIALS</div>{renderBom(p.bom)}</>}
                          </td></tr>
                        )}
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

      {/* ================== ITEM MASTER TABLE ================== */}
      {tab === "items" && (
        <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead><tr>
                {[{l:"",k:null},{l:"ProductCode",k:"id"},{l:"Name",k:"name"},{l:"Level",k:"level"},{l:"Category",k:null},{l:"Costing",k:"costing"},{l:"Unit",k:"unit"},{l:"Avg Cost",k:"avgCost"},{l:"BOM Cost",k:"bomCost"},{l:"Supplier",k:"supplier"},{l:"Location",k:"location"},{l:"",k:null}].map((h,i) => (
                  <th key={i} style={{ ...TH, cursor: h.k ? "pointer" : "default", userSelect: "none" }} onClick={() => { if (!h.k) return; if (sortCol === h.k) { setSortDir(d => d === "asc" ? "desc" : "asc"); } else { setSortCol(h.k); setSortDir("asc"); } }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {h.l}
                      {h.k && (sortCol === h.k ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />)}
                    </div>
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {viewItems.length === 0 ? <tr><td colSpan={12} style={{ ...TD, textAlign: "center", color: "#555", padding: 32 }}>No items found</td></tr> :
                  viewItems.map((p) => {
                    const lvl = getLevel(p.id); const hasBom = p.bom && p.bom.length > 0; const bc = hasBom ? bomCost(p.bom) : null;
                    return (
                      <React.Fragment key={p.id}>
                        <tr>
                          <td style={TD}>{hasBom && <button onClick={() => tog(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 2 }}>{expanded[p.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}</td>
                          <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: LEVELS[lvl]?.color || "#888" }}>{p.id}</td>
                          <td style={{ ...TD, fontWeight: 500 }}>{p.name}</td>
                          <td style={TD}><LevelBadge level={lvl} /></td>
                          <td style={{ ...TD, fontSize: 12, color: "#999" }}>{p.category}</td>
                          <td style={{ ...TD, fontSize: 11, color: "#888" }}>{p.costing}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#999" }}>{p.unit}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{p.avgCost > 0 ? `$${p.avgCost.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#f59e0b" }}>{bc !== null ? `$${bc.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{p.supplier}</td>
                          <td style={{ ...TD, fontSize: 11, color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.location}</td>
                          <td style={TD}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => openEdit("item", p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 3 }} title="Edit"><Edit2 size={14} /></button>
                              {isAdmin && <button onClick={() => setDelConfirm(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }} title="Delete"><Trash2 size={14} /></button>}
                            </div>
                          </td>
                        </tr>
                        {hasBom && expanded[p.id] && <tr><td colSpan={12} style={{ ...TD, background: "#16161e", paddingLeft: 48 }}><div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 600 }}>BILL OF MATERIALS</div>{renderBom(p.bom)}</td></tr>}
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
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={<ShoppingCart size={18} />} label="Total Orders" value={orderStats.total} accent="#6366f1" />
            <Stat icon={<ClipboardList size={18} />} label="Pending" value={orderStats.pending} accent="#f59e0b" />
            <Stat icon={<PackageCheck size={18} />} label="Fulfilled" value={orderStats.fulfilled} accent="#22c55e" />
          </div>

          {groupedOrders.length === 0 ? (
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: 40, textAlign: "center", color: "#555" }}>
              <ShoppingCart size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ margin: 0 }}>No orders found</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groupedOrders.map((group, gIdx) => {
                const gKey = `ord-${group.customer}-${group.date}`;
                const isExp = expanded[gKey];
                const allFulfilled = group.lines.every(o => o.status === "Fulfilled" || o.status === "Cancelled");
                const totalItems = group.lines.reduce((s, o) => s + o.qty, 0);
                const unshippedCount = group.lines.filter(o => o.status !== "Fulfilled" && o.status !== "Cancelled").length;
                const statuses = [...new Set(group.lines.map(o => o.status))];
                const notes = group.lines.find(o => o.notes)?.notes || "";

                return (
                  <div key={gKey} style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
                    <div onClick={() => tog(gKey)} style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {isExp ? <ChevronDown size={16} style={{ color: "#888" }} /> : <ChevronRight size={16} style={{ color: "#888" }} />}
                        <div>
                          <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 15 }}>{group.customer}</div>
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                            {group.date} • {group.lines.length} line{group.lines.length > 1 ? "s" : ""} • {totalItems} total units
                            {notes && <span style={{ marginLeft: 8, color: "#666" }}>— {notes.slice(0, 60)}{notes.length > 60 ? "..." : ""}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {statuses.map(s => (
                          <span key={s} style={{ background: sC(s) + "22", color: sC(s), padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{s}</span>
                        ))}
                        {!allFulfilled && (
                          <button onClick={(e) => { e.stopPropagation(); shipAllLines(group.lines); }} style={{ ...B1, padding: "6px 14px", background: "#22c55e", fontSize: 12 }}>
                            <PackageCheck size={13} /> Ship All ({unshippedCount})
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); delOrderGroup(group); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }} title="Delete Order"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>

                    {isExp && (
                      <div style={{ borderTop: "1px solid #2a2a3a" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr>
                            {["Order ID", "Item", "Qty", "Status", "Notes", ""].map(h => <th key={h} style={TH}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {group.lines.map(o => {
                              const it = gi(o.item);
                              const isFulfilled = o.status === "Fulfilled" || o.status === "Cancelled";
                              const stockOk = it ? it.qty >= o.qty : false;
                              return (
                                <tr key={o.id} style={{ opacity: isFulfilled ? 0.5 : 1 }}>
                                  <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#8b8bf5" }}>{o.id}</td>
                                  <td style={TD}>
                                    <div style={{ fontWeight: 500 }}>{it?.name || o.item}</div>
                                    <div style={{ fontSize: 11, color: "#666" }}>{o.item}{it ? ` • ${it.qty} in stock` : ""}</div>
                                  </td>
                                  <td style={{ ...TD, fontWeight: 600, fontSize: 15 }}>{o.qty}</td>
                                  <td style={TD}>
                                    <select value={o.status} onClick={e => e.stopPropagation()} onChange={async (e) => {
                                      const ns = e.target.value;
                                      const updated = { ...o, status: ns };
                                      setOrders(prev => prev.map(x => x.id === o.id ? updated : x));
                                      try { await upsertOrder(updated); } catch (err) { console.warn(err); }
                                    }} style={{ ...IS, width: "auto", padding: "4px 8px", fontSize: 12, background: sC(o.status) + "11", color: sC(o.status), borderColor: sC(o.status) + "44" }}>
                                      {ORD_STATUSES.map(s => <option key={s}>{s}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ ...TD, fontSize: 12, color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.notes || "—"}</td>
                                  <td style={TD}>
                                    <div style={{ display: "flex", gap: 4 }}>
                                      {!isFulfilled && (
                                        <button onClick={(e) => { e.stopPropagation(); shipOrderLine(o); }} style={{ ...B2, padding: "4px 10px", borderColor: "#22c55e44", color: "#22c55e", fontSize: 11 }}>
                                          <PackageCheck size={12} /> Ship
                                        </button>
                                      )}
                                      {isFulfilled && <span style={{ fontSize: 11, color: "#22c55e" }}>✓ Shipped</span>}
                                      <button onClick={(e) => { e.stopPropagation(); openEdit("order", o); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 3 }}><Edit2 size={14} /></button>
                                      {isAdmin && <button onClick={(e) => { e.stopPropagation(); setDelConfirm(o.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Trash2 size={14} /></button>}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                        {po.status !== "Received" && po.status !== "Cancelled" && <button onClick={(e) => { e.stopPropagation(); openReceiveFromPO(po.id); }} style={{ ...B2, padding: "5px 10px", borderColor: "#22c55e", color: "#22c55e" }}><PackageCheck size={13} /></button>}
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

      {/* ================== RECEIVING TAB ================== */}
      {tab === "receiving" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={<PackageCheck size={18} />} label="Total Receipts" value={receipts.length} accent="#22c55e" />
            <Stat icon={<FileText size={18} />} label="From POs" value={receipts.filter(r => r.poId).length} accent="#6366f1" />
            <Stat icon={<ClipboardList size={18} />} label="Manual" value={receipts.filter(r => !r.poId).length} accent="#f59e0b" />
          </div>

          {/* Quick receive from open POs */}
          {pos.filter(p => p.status !== "Received" && p.status !== "Cancelled").length > 0 && (
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Open POs Ready to Receive</div>
              <div style={{ padding: "8px" }}>
                {pos.filter(p => p.status !== "Received" && p.status !== "Cancelled").map(po => (
                  <div key={po.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: "1px solid #1a1a2a" }}>
                    <div>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#e0e0e0", marginRight: 12 }}>{po.id}</span>
                      <span style={{ color: "#888", fontSize: 13 }}>{po.vendor} • {po.lines.length} items • ${po.total.toFixed(2)}</span>
                    </div>
                    <button onClick={() => openReceiveFromPO(po.id)} style={{ ...B1, padding: "6px 14px", background: "#22c55e" }}><PackageCheck size={14} /> Receive</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Receipt history */}
          <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Receipt History</div>
            {receipts.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#555" }}>
                <PackageCheck size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                <p style={{ margin: 0 }}>No receipts yet. Receive against a PO or create a manual receipt.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead><tr>
                    {["Receipt ID", "Date", "Type", "PO #", "Items", "Notes", ""].map(h => <th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {receipts.map(r => {
                      const isExp = expanded[`rcv-${r.id}`];
                      return (
                        <React.Fragment key={r.id}>
                          <tr>
                            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#22c55e", cursor: "pointer" }} onClick={() => tog(`rcv-${r.id}`)}>
                              {isExp ? <ChevronDown size={12} style={{ marginRight: 4 }} /> : <ChevronRight size={12} style={{ marginRight: 4 }} />}
                              {r.id}
                            </td>
                            <td style={{ ...TD, fontSize: 12, color: "#888" }}>{r.date}</td>
                            <td style={TD}><span style={{ background: r.poId ? "#6366f122" : "#f59e0b22", color: r.poId ? "#6366f1" : "#f59e0b", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{r.type}</span></td>
                            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12 }}>{r.poId || "—"}</td>
                            <td style={{ ...TD, fontSize: 12 }}>{r.lines.length} items, {r.lines.reduce((s, l) => s + l.qtyReceived, 0)} units</td>
                            <td style={{ ...TD, fontSize: 12, color: "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes || "—"}</td>
                            <td style={{ ...TD, fontSize: 11, color: "#666" }}>{r.createdBy || ""}</td>
                          </tr>
                          {isExp && (
                            <tr><td colSpan={7} style={{ ...TD, background: "#16161e", paddingLeft: 40 }}>
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr>{["Part ID", "Name", "Expected", "Received", "Unit"].map(h => <th key={h} style={{ ...TH, fontSize: 10 }}>{h}</th>)}</tr></thead>
                                <tbody>{r.lines.map((l, i) => (
                                  <tr key={i}>
                                    <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#6366f1" }}>{l.partId}</td>
                                    <td style={{ ...TD, fontSize: 12 }}>{l.name}</td>
                                    <td style={{ ...TD, fontSize: 12, color: "#888" }}>{l.qtyExpected}</td>
                                    <td style={{ ...TD, fontSize: 12, fontWeight: 600, color: l.qtyReceived < l.qtyExpected ? "#f59e0b" : "#22c55e" }}>{l.qtyReceived}</td>
                                    <td style={{ ...TD, fontSize: 12, color: "#888" }}>{l.unit}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================== PRODUCTION TAB ================== */}
      {tab === "production" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={<Hammer size={18} />} label="Total Runs" value={prodRuns.length} accent="#8b5cf6" />
            <Stat icon={<Layers size={18} />} label="This Week" value={prodRuns.filter(r => { const d = new Date(r.date); const now = new Date(); const weekAgo = new Date(now - 7 * 86400000); return d >= weekAgo; }).length} accent="#6366f1" />
          </div>

          <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Production Log</div>
            {prodRuns.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#555" }}>
                <Hammer size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                <p style={{ margin: 0 }}>No production runs recorded yet.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead><tr>
                    {["Run ID", "Date", "Assembly", "Lot #", "Qty", "Items Consumed", "Notes", ""].map(h => <th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {prodRuns.map(r => {
                      const isExp = expanded[`prod-${r.id}`];
                      return (
                        <React.Fragment key={r.id}>
                          <tr>
                            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#8b5cf6", cursor: "pointer" }} onClick={() => tog(`prod-${r.id}`)}>
                              {isExp ? <ChevronDown size={12} style={{ marginRight: 4 }} /> : <ChevronRight size={12} style={{ marginRight: 4 }} />}
                              {r.id}
                            </td>
                            <td style={{ ...TD, fontSize: 12, color: "#888" }}>{r.date}</td>
                            <td style={TD}>
                              <span style={{ fontWeight: 500 }}>{r.assemblyName}</span>
                              <span style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>({r.assemblyId})</span>
                            </td>
                            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: r.lotNumber ? "#a78bfa" : "#555" }}>{r.lotNumber || "—"}</td>
                            <td style={{ ...TD, fontWeight: 600, color: "#22c55e" }}>+{r.qtyProduced}</td>
                            <td style={{ ...TD, fontSize: 12 }}>{r.consumed.length} items</td>
                            <td style={{ ...TD, fontSize: 12, color: "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes || "—"}</td>
                            <td style={{ ...TD, fontSize: 11, color: "#666" }}>{r.createdBy || ""}</td>
                          </tr>
                          {isExp && (
                            <tr><td colSpan={8} style={{ ...TD, background: "#16161e", paddingLeft: 40 }}>
                              <div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 600 }}>CONSUMED</div>
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr>{["Part ID", "Name", "Qty Used", "Unit"].map(h => <th key={h} style={{ ...TH, fontSize: 10 }}>{h}</th>)}</tr></thead>
                                <tbody>{r.consumed.map((c, i) => (
                                  <tr key={i}>
                                    <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#6366f1" }}>{c.partId}</td>
                                    <td style={{ ...TD, fontSize: 12 }}>{c.name}</td>
                                    <td style={{ ...TD, fontSize: 12, fontWeight: 600, color: "#ef4444" }}>-{c.qty.toFixed(3)}</td>
                                    <td style={{ ...TD, fontSize: 12, color: "#888" }}>{c.unit}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================== PRODUCTION MODAL ================== */}
      <Modal open={prodModal} onClose={() => setProdModal(false)} title="Run Production" wide>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Assembly to Produce *</label>
            <select value={prodAssembly} onChange={e => { const id = e.target.value; setProdAssembly(id); setProdConsume(initConsume(id)); setProdLotNumber(""); }} style={IS}>
              <option value="">Select assembly...</option>
              {assemblies.map(a => <option key={a.id} value={a.id}>[{a.id}] {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Quantity *</label>
            <input type="number" step="any" min="0" value={prodQty} onChange={e => setProdQty(Number(e.target.value))} style={IS} />
          </div>
        </div>

        {/* Lot Number */}
        {prodAssemblyItem && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
              Lot / Batch Number {getLevel(prodAssemblyItem.id) === 200 ? "(new lot)" : "(inherited from 200-level)"}
            </label>
            {getLevel(prodAssemblyItem.id) === 200 ? (
              <input value={prodLotNumber} onChange={e => setProdLotNumber(e.target.value)} placeholder="Enter lot number (e.g. CB-20260315-01)" style={IS} />
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={prodLotNumber} onChange={e => setProdLotNumber(e.target.value)} style={{ ...IS, flex: 1 }}>
                  <option value="">Select lot...</option>
                  {suggestedLots.map(l => (
                    <option key={l.lotNumber} value={l.lotNumber}>{l.lotNumber} ({l.qty} avail, {l.productionDate || "?"})</option>
                  ))}
                </select>
                <input value={prodLotNumber} onChange={e => setProdLotNumber(e.target.value)} placeholder="Or type manually" style={{ ...IS, flex: 1 }} />
              </div>
            )}
            {suggestedLots.length > 0 && getLevel(prodAssemblyItem.id) > 200 && !prodLotNumber && (
              <button onClick={() => setProdLotNumber(suggestedLots[0].lotNumber)} style={{ marginTop: 4, background: "none", border: "none", cursor: "pointer", color: "#6366f1", fontSize: 12, padding: 0 }}>
                Auto-select oldest (FIFO): {suggestedLots[0].lotNumber}
              </button>
            )}
          </div>
        )}

        {prodAssemblyItem && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "#16161e", borderRadius: 6, fontSize: 12, color: "#888", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Current stock: <strong style={{ color: "#e0e0e0" }}>{prodAssemblyItem.qty} {prodAssemblyItem.unit}</strong></span>
            <span>After production: <strong style={{ color: "#22c55e" }}>{prodAssemblyItem.qty + prodQty} {prodAssemblyItem.unit}</strong></span>
          </div>
        )}

        {prodAssemblyItem && prodAssemblyItem.bom && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 4 }}>Materials to Consume</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
              <strong style={{ color: "#22c55e" }}>✓ Checked</strong> = consume from inventory. Click a checked sub-assembly to <strong style={{ color: "#f59e0b" }}>uncheck it</strong> and select its individual components instead.
            </div>
            <div style={{ border: "1px solid #2a2a3a", borderRadius: 8, padding: 12, background: "#16161e", maxHeight: 400, overflow: "auto" }}>
              {renderConsumptionTree(prodAssemblyItem.bom, prodQty)}
            </div>
          </div>
        )}

        {prodAssemblyItem && (() => {
          const consumed = getConsumedItems(prodAssemblyItem.bom, prodQty);
          const valErrors = getValidationErrors(prodAssemblyItem.bom, prodQty);
          const shortages = consumed.filter(c => c.qty > c.currentQty);
          return (
            <>
              {valErrors.length > 0 && (
                <div style={{ background: "#2a1a1a", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>⚠ Incomplete — some materials are not checked:</div>
                  {valErrors.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#f87171" }}>{e}</div>)}
                </div>
              )}
              {valErrors.length === 0 && shortages.length > 0 && (
                <div style={{ background: "#2a2a1a", border: "1px solid #f59e0b33", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>⚠ Insufficient Stock (will go negative)</div>
                  {shortages.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#fbbf24" }}>{s.name}: need {s.qty.toFixed(3)}, have {s.currentQty}</div>)}
                </div>
              )}
              {valErrors.length === 0 && (
                <div style={{ fontSize: 12, color: "#22c55e", marginBottom: 12, fontWeight: 500 }}>
                  ✓ Will consume {consumed.length} items totaling {consumed.reduce((s, c) => s + c.qty, 0).toFixed(2)} units
                </div>
              )}
            </>
          );
        })()}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes (optional)</label>
          <input value={prodNotes} onChange={e => setProdNotes(e.target.value)} placeholder="Batch notes, operator, etc." style={IS} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setProdModal(false)} style={B2}>Cancel</button>
          <button onClick={submitProduction} disabled={!prodAssemblyItem || prodQty <= 0 || (prodAssemblyItem && getValidationErrors(prodAssemblyItem.bom, prodQty).length > 0)} style={{ ...B1, background: "#8b5cf6", opacity: (!prodAssemblyItem || prodQty <= 0 || (prodAssemblyItem && getValidationErrors(prodAssemblyItem.bom, prodQty).length > 0)) ? 0.4 : 1 }}><Hammer size={14} /> Run Production</button>
        </div>
      </Modal>

      {/* ================== TRANSACTION LOG ================== */}
      {tab === "log" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={<ScrollText size={18} />} label="Total Transactions" value={transactionLog.length} accent="#6366f1" />
            <Stat icon={<Hammer size={18} />} label="Production Runs" value={transactionLog.filter(e => e.type === "Production").length} accent="#8b5cf6" />
            <Stat icon={<PackageCheck size={18} />} label="Receipts" value={transactionLog.filter(e => e.type === "Receipt").length} accent="#22c55e" />
            <Stat icon={<Edit2 size={18} />} label="Adjustments" value={transactionLog.filter(e => e.type === "Adjustment").length} accent="#f59e0b" />
          </div>

          <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead><tr>
                  {["Date", "Type", "Description", "Lot #", "Detail", "User"].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {transactionLog.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...TD, textAlign: "center", color: "#555", padding: 32 }}>
                      <ScrollText size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                      <p style={{ margin: 0 }}>No transactions recorded yet.</p>
                    </td></tr>
                  ) : (
                    transactionLog.filter(e => {
                      if (!search) return true;
                      const s = search.toLowerCase();
                      return e.desc.toLowerCase().includes(s) || e.user.toLowerCase().includes(s) || e.type.toLowerCase().includes(s) || (e.lot || "").toLowerCase().includes(s) || (e.detail || "").toLowerCase().includes(s);
                    }).map((e, i) => (
                      <tr key={i}>
                        <td style={{ ...TD, fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{e.date}</td>
                        <td style={TD}>
                          <span style={{ background: e.color + "22", color: e.color, padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{e.type}</span>
                        </td>
                        <td style={{ ...TD, fontSize: 13 }}>{e.desc}</td>
                        <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: e.lot ? "#a78bfa" : "#555" }}>{e.lot || "—"}</td>
                        <td style={{ ...TD, fontSize: 11, color: "#888", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.detail || ""}</td>
                        <td style={{ ...TD, fontSize: 11, color: "#666" }}>{e.user}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", borderTop: "1px solid #2a2a3a", color: "#555", fontSize: 11 }}>
              {transactionLog.length} transactions
            </div>
          </div>
        </div>
      )}

      {/* ================== USERS TAB (Admin only) ================== */}
      {tab === "users" && isAdmin && (() => {
        if (allProfiles.length === 0) { fetchProfiles().then(p => setAllProfiles(p)).catch(() => {}); }
        return (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <Stat icon={<Users size={18} />} label="Total Users" value={allProfiles.length} accent="#6366f1" />
              <Stat icon={<KeyRound size={18} />} label="Admins" value={allProfiles.filter(p => p.role === "admin").length} accent="#f59e0b" />
            </div>

            {/* Invite Code */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "14px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 4 }}>Invite Code</div>
                <div style={{ fontSize: 12, color: "#888" }}>Give this to new team members so they can sign up</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input id="inviteCodeInput" defaultValue="" placeholder="Loading..." style={{ ...IS, width: 180, fontFamily: "monospace", fontSize: 14, textAlign: "center" }}
                  onFocus={async (e) => { if (!e.target.dataset.loaded) { try { const code = await getInviteCode(); e.target.value = code; e.target.dataset.loaded = "1"; } catch {} } }}
                />
                <button onClick={async () => { const input = document.getElementById("inviteCodeInput"); if (input?.value) { try { await setInviteCode(input.value); show("Invite code updated"); } catch (e) { show(e.message, "error"); } } }} style={B1}>Save</button>
              </div>
            </div>

            {/* User list */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Team Members</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Email", "Name", "Role", "Joined", "Actions"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {allProfiles.map(p => (
                      <tr key={p.id}>
                        <td style={{ ...TD, fontWeight: 500 }}>{p.email}</td>
                        <td style={TD}>
                          <input defaultValue={p.name || ""} onBlur={async (e) => { if (e.target.value !== (p.name || "")) { try { await updateProfile(p.id, { name: e.target.value }); setAllProfiles(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x)); show("Name updated"); } catch (err) { show(err.message, "error"); } } }} style={{ ...IS, padding: "4px 8px", fontSize: 13 }} />
                        </td>
                        <td style={TD}>
                          <select value={p.role} onChange={async (e) => { try { await updateProfile(p.id, { role: e.target.value }); setAllProfiles(prev => prev.map(x => x.id === p.id ? { ...x, role: e.target.value } : x)); if (p.id === profile?.id) setProfile(prev => ({ ...prev, role: e.target.value })); show("Role updated"); } catch (err) { show(err.message, "error"); } }} style={{ ...IS, width: "auto", padding: "4px 8px", fontSize: 13, background: p.role === "admin" ? "#2a2a1a" : "#16161e", color: p.role === "admin" ? "#f59e0b" : "#ccc" }}>
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td style={{ ...TD, fontSize: 12, color: "#888" }}>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}</td>
                        <td style={{ ...TD, fontSize: 12, color: "#555" }}>{p.id === profile?.id ? "(you)" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================== MANUAL PO MODAL ================== */}
      <Modal open={manualPOModal} onClose={() => setManualPOModal(false)} title="Create Purchase Order" wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Vendor *</label>
            <select value={manualPOForm.vendor} onChange={e => setManualPOForm(f => ({ ...f, vendor: e.target.value }))} style={IS}>
              <option value="">Select vendor...</option>
              {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label>
            <input value={manualPOForm.notes} onChange={e => setManualPOForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" style={IS} />
          </div>
        </div>

        {manualPOForm.vendor && (() => {
          const vObj = vendors.find(v => v.name === manualPOForm.vendor);
          return vObj ? (
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {vObj.contact && <span>Contact: {vObj.contact}</span>}
              {vObj.paymentTerms && <span>Terms: {vObj.paymentTerms}</span>}
              {vObj.leadDays > 0 && <span>Lead: {vObj.leadDays} days</span>}
            </div>
          ) : null;
        })()}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>Line Items</div>
          <button onClick={() => setManualPOLines(prev => [...prev, { partId: "", name: "", qty: 0, unit: "", unitCost: 0 }])} style={B2}><Plus size={14} /> Add Line</button>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #2a2a3a", borderRadius: 8, marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Item", "Qty", "Unit", "Unit Cost", "Line Total", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {manualPOLines.map((line, i) => (
                <tr key={i}>
                  <td style={TD}>
                    <select value={line.partId} onChange={e => {
                      const p = parts.find(x => x.id === e.target.value);
                      setManualPOLines(prev => prev.map((l, j) => j === i ? { ...l, partId: e.target.value, name: p?.name || "", unit: p?.unit || "", unitCost: p?.avgCost || 0 } : l));
                    }} style={{ ...IS, fontSize: 12, minWidth: 200 }}>
                      <option value="">Select item...</option>
                      {parts.map(p => <option key={p.id} value={p.id}>[{p.id}] {p.name}</option>)}
                    </select>
                  </td>
                  <td style={TD}><input type="number" step="any" min="0" value={line.qty} onChange={e => setManualPOLines(prev => prev.map((l, j) => j === i ? { ...l, qty: Number(e.target.value) } : l))} style={{ ...IS, width: 80, fontSize: 12 }} /></td>
                  <td style={{ ...TD, fontSize: 12, color: "#888" }}>{line.unit}</td>
                  <td style={TD}><input type="number" step="0.01" min="0" value={line.unitCost} onChange={e => setManualPOLines(prev => prev.map((l, j) => j === i ? { ...l, unitCost: Number(e.target.value) } : l))} style={{ ...IS, width: 90, fontSize: 12 }} /></td>
                  <td style={{ ...TD, fontSize: 12, fontWeight: 600, color: "#f59e0b" }}>${(line.qty * line.unitCost).toFixed(2)}</td>
                  <td style={TD}><button onClick={() => setManualPOLines(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Minus size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#f59e0b" }}>
            Total: ${manualPOLines.reduce((s, l) => s + l.qty * l.unitCost, 0).toFixed(2)}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setManualPOModal(false)} style={B2}>Cancel</button>
            <button onClick={submitManualPO} style={B1}><FileText size={14} /> Create PO</button>
          </div>
        </div>
      </Modal>

      {/* ================== RECEIVING MODAL ================== */}
      <Modal open={rcvModal} onClose={() => setRcvModal(false)} title={rcvMode === "po" ? `Receive Against ${rcvPO}` : "Manual Receipt"} wide>
        <div style={{ marginBottom: 16 }}>
          {rcvMode === "po" ? (
            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: "#888" }}>PO: <strong style={{ color: "#e0e0e0" }}>{rcvPO}</strong></div>
              <div style={{ fontSize: 13, color: "#888" }}>Vendor: <strong style={{ color: "#e0e0e0" }}>{pos.find(p => p.id === rcvPO)?.vendor || ""}</strong></div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#888" }}>After receiving:</span>
                <select value={rcvPoAction} onChange={e => setRcvPoAction(e.target.value)} style={{ ...IS, width: "auto", minWidth: 160 }}>
                  <option value="received">Mark PO as Received</option>
                  <option value="keep">Keep PO Open (partial)</option>
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Receipt Type *</label>
                <select value={rcvType} onChange={e => setRcvType(e.target.value)} style={IS}>
                  {RECEIPT_TYPES.filter(t => t !== "PO Receipt").map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Reason / Notes * <span style={{ color: "#ef4444" }}>(required)</span></label>
                <input value={rcvNotes} onChange={e => setRcvNotes(e.target.value)} placeholder="Why is this being received without a PO?" style={{ ...IS, borderColor: !rcvNotes.trim() ? "#ef4444" : "#333" }} />
              </div>
            </div>
          )}

          {rcvMode === "po" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes (optional)</label>
              <input value={rcvNotes} onChange={e => setRcvNotes(e.target.value)} placeholder="Delivery notes, condition, etc." style={IS} />
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>Line Items</div>
          {rcvMode === "manual" && (
            <div style={{ marginBottom: 12 }}>
              <button onClick={addManualRcvLine} style={B2}><Plus size={14} /> Add Item</button>
            </div>
          )}

          <div style={{ overflowX: "auto", border: "1px solid #2a2a3a", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {rcvMode === "manual" ? ["Item", "Qty Received", "Unit", "Location", ""].map(h => <th key={h} style={TH}>{h}</th>) : ["Part ID", "Name", "Ordered", "Receiving", "Unit"].map(h => <th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rcvLines.length === 0 ? <tr><td colSpan={5} style={{ ...TD, textAlign: "center", color: "#555", padding: 20 }}>No items. {rcvMode === "manual" ? "Click Add Item above." : ""}</td></tr> :
                rcvLines.map((line, i) => (
                  <tr key={i}>
                    {rcvMode === "manual" ? (
                      <>
                        <td style={TD}>
                          <select value={line.partId} onChange={e => { const p = parts.find(x => x.id === e.target.value); setRcvLines(prev => prev.map((l, j) => j === i ? { ...l, partId: e.target.value, name: p?.name || "", unit: p?.unit || "", location: p?.location || "" } : l)); }} style={{ ...IS, fontSize: 12 }}>
                            <option value="">Select item...</option>
                            {parts.map(p => <option key={p.id} value={p.id}>[{p.id}] {p.name}</option>)}
                          </select>
                        </td>
                        <td style={TD}><input type="number" step="any" min="0" value={line.qtyReceived} onChange={e => setRcvLines(prev => prev.map((l, j) => j === i ? { ...l, qtyReceived: Number(e.target.value) } : l))} style={{ ...IS, width: 80, fontSize: 12 }} /></td>
                        <td style={{ ...TD, fontSize: 12, color: "#888" }}>{line.unit}</td>
                        <td style={TD}>
                          <select value={line.location || ""} onChange={e => setRcvLines(prev => prev.map((l, j) => j === i ? { ...l, location: e.target.value } : l))} style={{ ...IS, fontSize: 12, minWidth: 120 }}>
                            <option value="">Default</option>
                            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                          </select>
                        </td>
                        <td style={TD}><button onClick={() => setRcvLines(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Minus size={14} /></button></td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#6366f1" }}>{line.partId}</td>
                        <td style={{ ...TD, fontSize: 12 }}>{line.name}</td>
                        <td style={{ ...TD, fontSize: 12, color: "#888" }}>{line.qtyExpected}</td>
                        <td style={TD}><input type="number" step="any" min="0" value={line.qtyReceived} onChange={e => setRcvLines(prev => prev.map((l, j) => j === i ? { ...l, qtyReceived: Number(e.target.value) } : l))} style={{ ...IS, width: 80, fontSize: 12, color: line.qtyReceived < line.qtyExpected ? "#f59e0b" : "#22c55e" }} /></td>
                        <td style={{ ...TD, fontSize: 12, color: "#888" }}>{line.unit}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#888" }}>
            {rcvLines.filter(l => l.qtyReceived > 0).length} items, {rcvLines.reduce((s, l) => s + (l.qtyReceived || 0), 0)} total units
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setRcvModal(false)} style={B2}>Cancel</button>
            <button onClick={submitReceipt} style={{ ...B1, background: "#22c55e" }}>
              <PackageCheck size={14} /> Confirm Receipt
            </button>
          </div>
        </div>
      </Modal>

      {/* ================== MODALS ================== */}

      {/* Unified Item Modal */}
      <Modal open={modal === "item"} onClose={() => setModal(null)} title={editItem ? "Edit Item" : "Create Item"} wide>
        {(() => {
          const formLevel = getLevel(form.id || "100");
          const isRaw = formLevel === 100;
          return (<>
            {/* Level selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6 }}>Item Level</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {LEVEL_KEYS.map(k => (
                  <button key={k} onClick={() => changeItemLevel(k)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: formLevel === k ? `2px solid ${LEVELS[k].color}` : "1px solid #333", background: formLevel === k ? LEVELS[k].color + "22" : "#16161e", color: formLevel === k ? LEVELS[k].color : "#888" }}>
                    {LEVELS[k].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Core fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>ProductCode</label><input value={form.id || ""} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Name</label><input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Category</label><input value={form.category || ""} readOnly style={{ ...IS, opacity: 0.6 }} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Costing Method</label><select value={form.costing || "FIFO"} onChange={(e) => setForm((f) => ({ ...f, costing: e.target.value }))} style={IS}>{COSTING.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Unit of Measure</label><input value={form.unit || ""} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Location</label><select value={form.location || ""} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={IS}><option value="">Select location...</option>{locations.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Qty On Hand</label><input type="number" value={form.qty || 0} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Min Before Reorder</label><input type="number" value={form.minStock || 0} onChange={(e) => setForm((f) => ({ ...f, minStock: Number(e.target.value) }))} style={IS} /></div>
              {isRaw && <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Avg Cost</label><input type="number" step="0.01" value={form.avgCost || 0} onChange={(e) => setForm((f) => ({ ...f, avgCost: Number(e.target.value) }))} style={IS} /></div>}
              {isRaw && <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Supplier</label><select value={form.supplier || ""} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} style={IS}><option value="">None</option>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select></div>}
              {isRaw && <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Supplier Product Code</label><input value={form.supplierCode || ""} onChange={(e) => setForm((f) => ({ ...f, supplierCode: e.target.value }))} style={IS} /></div>}
              <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label><input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={IS} /></div>
            </div>

            {/* BOM section - only for 200+ */}
            {!isRaw && (
              <div style={{ borderTop: "1px solid #2a2a3a", paddingTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ margin: 0, fontSize: 15 }}>Bill of Materials</h3><button onClick={() => setBomForm((p) => [...p, { partId: "", qty: 1 }])} style={B2}><Plus size={14} /> Add Line</button></div>
                {bomForm.length === 0 && <p style={{ color: "#555", fontSize: 13 }}>No components yet. Add lines to define what goes into this item.</p>}
                {bomForm.map((line, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <select value={line.partId} onChange={(e) => setBomForm((p) => p.map((b, j) => j === i ? { ...b, partId: e.target.value } : b))} style={{ ...IS, flex: 2 }}>
                      <option value="">Select component...</option>
                      {bomItemsForLevel(formLevel).map((p) => <option key={p.id} value={p.id}>[{p.id}] {p.name}</option>)}
                    </select>
                    <input type="number" step="any" min="0" placeholder="Qty" value={line.qty} onChange={(e) => setBomForm((p) => p.map((b, j) => j === i ? { ...b, qty: Number(e.target.value) } : b))} style={{ ...IS, flex: 0.5, minWidth: 70 }} />
                    <button onClick={() => setBomForm((p) => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}><Minus size={16} /></button>
                  </div>
                ))}
                {bomForm.filter((b) => b.partId && b.qty > 0).length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#888" }}>BOM Cost: <strong style={{ color: "#22c55e" }}>${bomCost(bomForm.filter((b) => b.partId && b.qty > 0)).toFixed(2)}</strong></div>}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setModal(null)} style={B2}>Cancel</button><button onClick={save} style={B1}>{editItem ? "Update" : "Create"}</button></div>
          </>);
        })()}
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

      {/* Qty Adjustment Modal */}
      <Modal open={adjModal} onClose={() => setAdjModal(false)} title="Adjust Inventory Quantity">
        {adjItem && (
          <div>
            <div style={{ background: "#16161e", borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{adjItem.name}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{adjItem.id} &middot; Current Qty: <strong style={{ color: "#22c55e" }}>{adjItem.qty}</strong> {adjItem.unit}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>New Quantity</label>
                <input type="number" value={adjQty} onChange={e => setAdjQty(Number(e.target.value))} style={IS} />
                {adjQty !== adjItem.qty && (
                  <div style={{ fontSize: 12, marginTop: 4, color: adjQty > adjItem.qty ? "#22c55e" : "#ef4444" }}>
                    {adjQty > adjItem.qty ? "+" : ""}{adjQty - adjItem.qty} {adjItem.unit}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Reason / Notes</label>
                <input value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="e.g. cycle count correction" style={IS} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setAdjModal(false)} style={B2}>Cancel</button>
              <button onClick={submitAdjust} style={{ ...B1, background: "#f59e0b" }}>Confirm Adjustment</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <Modal open={delConfirm !== null} onClose={() => setDelConfirm(null)} title="Confirm Delete">
        <p style={{ color: "#ccc", margin: "0 0 20px", fontSize: 14 }}>Are you sure? This cannot be undone.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setDelConfirm(null)} style={B2}>Cancel</button>
          <button onClick={() => { del(delConfirm); setDelConfirm(null); }} style={{ ...B1, background: "#dc2626" }}>Delete</button>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal open={pwModal} onClose={() => setPwModal(false)} title="Change Password">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>New Password (min 6 chars)</label><input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} style={IS} /></div>
          <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Confirm Password</label><input type="password" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} style={IS} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={() => setPwModal(false)} style={B2}>Cancel</button>
          <button onClick={handleChangePassword} style={B1}>Update Password</button>
        </div>
      </Modal>

      {/* Location Management Modal */}
      <Modal open={locModal} onClose={() => setLocModal(false)} title="Manage Locations">
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={locEdit} onChange={e => setLocEdit(e.target.value)} placeholder="New location name..." style={{ ...IS, flex: 1 }} onKeyDown={e => { if (e.key === "Enter" && locEdit.trim()) { addLocation(locEdit); setLocEdit(""); } }} />
            <button onClick={() => { if (locEdit.trim()) { addLocation(locEdit); setLocEdit(""); } }} style={B1}><Plus size={14} /> Add</button>
          </div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>{locations.length} locations</div>
          {locations.length === 0 ? (
            <p style={{ color: "#555", fontSize: 13 }}>No locations defined yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {locations.map(loc => (
                <div key={loc} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#16161e", borderRadius: 6, border: "1px solid #2a2a3a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MapPin size={14} style={{ color: "#6366f1" }} />
                    <span style={{ fontSize: 13, color: "#e0e0e0" }}>{loc}</span>
                  </div>
                  <button onClick={() => removeLocation(loc)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }} title="Remove"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setLocModal(false)} style={B2}>Close</button>
        </div>
      </Modal>

      </>)}
    </div>
  );
}
