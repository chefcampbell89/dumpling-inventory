// APP VERSION: v128
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  fetchItems, upsertItem, deleteItem as dbDeleteItem, bulkInsertItems,
  fetchBomLines, setBomForAssembly,
  fetchVendors, upsertVendor, deleteVendor as dbDeleteVendor,
  fetchItemVendors, setItemVendors,
  fetchOrders, upsertOrder, deleteOrder as dbDeleteOrder,
  fetchPurchaseOrders, createPurchaseOrder, updatePOStatus, deletePO as dbDeletePO,
  fetchReceipts, createReceipt, updateItemQty,
  fetchProductionRuns, createProductionRun, updateProductionRun, deleteProductionRuns, fetchDraftRunsForWeek, fetchCompletedRunsForWeek, completeProductionRun,
  fetchInventoryLots, adjustLotQty,
  zeroAllInventory, bulkUpdateItemQtys,
  fetchWishes, createWish, countUserWishes,
  signIn, signUp, signOut, getSession, getProfile, updateProfile, fetchProfiles, deleteProfile as dbDeleteProfile,
  getInviteCode, setInviteCode, getLocations, getConfig, saveConfig, changePassword, supabase,
  DEFAULT_BASE_INGREDIENTS, digitForProductLine, formatLotNumber, reserveLotNumbers, dateToMMDDYY,
} from "./supabase";

// Icons — install lucide-react: npm install lucide-react
import {
  Package, AlertTriangle, Search, Plus, Edit2, Trash2, Download, Upload,
  X, ChevronDown, ChevronRight, DollarSign, CheckCircle, Layers,
  ShoppingCart, ClipboardList, Minus, FileText, Printer, Building2, Loader2, PackageCheck, Hammer, Users, LogOut, Lock, KeyRound,
  ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronsUpDown, ScrollText, Settings, Sparkles, TrendingUp, ChevronLeft, Calendar, LayoutDashboard,
} from "lucide-react";

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_LEVELS = {
  100: { label: "100 - Raw Materials", color: "#6366f1", cat: "Raw Material" },
  200: { label: "200 - Sub-Recipe", color: "#a78bfa", cat: "Sub-Recipe" },
  250: { label: "250 - Batch / WIP", color: "#f59e0b", cat: "WIP" },
  300: { label: "300 - Bulk Storage", color: "#22c55e", cat: "Bulk Storage" },
  400: { label: "400 - Retail Unit", color: "#ec4899", cat: "Retail Unit" },
  500: { label: "500 - Retail Case", color: "#f97316", cat: "Retail Case" },
};
const LEVEL_KEYS = [100, 200, 250, 300, 400, 500];
const DEFAULT_COSTING = ["FIFO", "FEFO - Batch"];
const DEFAULT_PO_STATUSES = ["Draft", "Sent", "Confirmed", "Received", "Cancelled"];
const DEFAULT_ORD_STATUSES = ["Pending", "Confirmed", "In Production", "Fulfilled", "Cancelled"];
const DEFAULT_ORDER_TYPES = ["Wholesale", "Retail", "Food Service"];
const DEFAULT_RECEIPT_TYPES = ["PO Receipt", "Vendor delivery (no PO)", "Inventory adjustment", "Return from production", "Found/count correction"];
const DEFAULT_LOCATIONS = ["Dumpling Factory", "Dumpling Factory: Walk-in Freezer", "Dumpling Factory: Dry Storage"];

function getLevel(id) {
  const m = id.match(/^(\d+)-/);
  return m ? Number(m[1]) : 100;
}

function findLotSourceInBom(assemblyId, allItems) {
  const visited = new Set();
  // Stop at the FIRST lot-tracked (or lot-source) item we find while walking
  // the BOM. Lot numbers inherit up the chain, so a 300 should look up its
  // immediate 250 child — NOT recurse all the way past it to a deeper 200.
  const walk = (itemId) => {
    if (visited.has(itemId)) return null;
    visited.add(itemId);
    const item = allItems.find(i => i.id === itemId);
    if (!item) return null;
    if (item.lotTracking || item.lotSource) return item;
    if (!item.bom) return null;
    for (const line of item.bom) {
      const found = walk(line.partId);
      if (found) return found;
    }
    return null;
  };
  const assembly = allItems.find(i => i.id === assemblyId);
  if (!assembly || !assembly.bom) return null;
  for (const line of assembly.bom) {
    const found = walk(line.partId);
    if (found) return found;
  }
  return null;
}

// ============================================================
// SAMPLE / SEED DATA (used as fallback if Supabase is empty)
// ============================================================

const R = (id,name,cost,unit,supplier="",minStock=0,qty=0) => ({id,name,category:"Raw Material",type:"Stock",costing:"FIFO",location:"Dumpling Factory",supplier,supplierCode:"",avgCost:cost,unit,minStock,qty,notes:"",status:"Active",lotTracking:false,piecesPerUnit:0,lotSource:false});
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

const A = (id,name,cat,unit,cost,loc,notes,bom,pcs) => ({id,name,category:cat,type:"Stock",costing:cat==="Raw Material"?"FIFO":"FEFO - Batch",location:loc||"Dumpling Factory",supplier:"",supplierCode:"",avgCost:cost,unit,minStock:0,qty:0,notes:notes||"",status:"Active",lotTracking:true,piecesPerUnit:pcs||0,lotSource:false,bom});
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
  { id: "ORD-001", customer: "Green Grocer Market", item: "400-CB Pack", qty: 48, date: "2026-03-10", status: "Pending", notes: "Weekly standing order", shipDate: null, orderType: "Wholesale" },
  { id: "ORD-002", customer: "Dumpling Festival", item: "400-CB Food Service Case", qty: 10, date: "2026-03-15", status: "Confirmed", notes: "Event — deliver by 8am", shipDate: null, orderType: "Food Service" },
  { id: "ORD-003", customer: "Happy Belly Restaurant", item: "400-LG Food Service Case", qty: 4, date: "2026-03-12", status: "Fulfilled", notes: "", shipDate: null, orderType: "Food Service" },
  { id: "ORD-004", customer: "Whole Foods Northeast", item: "500-CB Retail Case", qty: 20, date: "2026-03-18", status: "Pending", notes: "New account trial", shipDate: null, orderType: "Retail" },
  { id: "ORD-005", customer: "Whole Foods Northeast", item: "500-CH Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial", shipDate: null, orderType: "Retail" },
  { id: "ORD-006", customer: "Whole Foods Northeast", item: "500-GC Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial", shipDate: null, orderType: "Retail" },
  { id: "ORD-007", customer: "Whole Foods Northeast", item: "500-LG Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial", shipDate: null, orderType: "Retail" },
  { id: "ORD-008", customer: "Whole Foods Northeast", item: "500-TM Retail Case", qty: 15, date: "2026-03-18", status: "Pending", notes: "New account trial", shipDate: null, orderType: "Retail" },
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

function GoldenLamp({ active, onClick, size = 28 }) {
  const a = active;
  return (
    <button onClick={a ? onClick : undefined} style={{ background: "none", border: "none", cursor: a ? "pointer" : "default", padding: 2, opacity: a ? 1 : 0.3, filter: a ? "drop-shadow(0 0 6px #fbbf24)" : "none", transition: "all 0.3s" }} title={a ? "Make a wish!" : "Wish used"}>
      <svg width={size} height={size} viewBox="0 0 266 190" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Smoke / vapor wisps when active */}
        {a && <>
          <path d="M52 88 C48 78 40 68 34 58 C30 50 28 40 32 36 C36 32 40 38 42 46 C44 54 48 66 52 76" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.4">
            <animate attributeName="opacity" values="0.4;0.15;0.4" dur="3s" repeatCount="indefinite" />
            <animate attributeName="d" values="M52 88 C48 78 40 68 34 58 C30 50 28 40 32 36 C36 32 40 38 42 46 C44 54 48 66 52 76;M52 88 C46 76 38 64 30 54 C24 46 20 36 26 32 C32 28 38 36 40 44 C42 52 46 64 52 76;M52 88 C48 78 40 68 34 58 C30 50 28 40 32 36 C36 32 40 38 42 46 C44 54 48 66 52 76" dur="3s" repeatCount="indefinite" />
          </path>
          <path d="M48 92 C42 80 36 66 28 56 C22 48 18 38 22 34 C26 30 32 36 34 44 C36 52 40 68 46 80" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3">
            <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2.5s" repeatCount="indefinite" />
          </path>
          <path d="M56 84 C54 72 46 56 42 44 C40 38 42 30 46 28 C50 26 50 34 50 42 C50 52 54 68 56 78" stroke="#fcd34d" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25">
            <animate attributeName="opacity" values="0.25;0.08;0.25" dur="3.5s" repeatCount="indefinite" />
          </path>
          <circle cx="30" cy="34" r="2" fill="#fbbf24" opacity="0.3">
            <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="22" cy="42" r="1.5" fill="#fcd34d" opacity="0.2">
            <animate attributeName="opacity" values="0.2;0;0.2" dur="2.8s" repeatCount="indefinite" />
          </circle>
        </>}
        {/* Base / pedestal */}
        <ellipse cx="160" cy="178" rx="70" ry="8" fill={a ? "#7a5a08" : "#333"} />
        <path d="M95 178 L100 170 L220 170 L225 178 Z" fill={a ? "#96700a" : "#3a3a3a"} />
        {/* Lamp body — wide rounded belly */}
        <ellipse cx="160" cy="142" rx="85" ry="32" fill={a ? "#b8860b" : "#555"} />
        <ellipse cx="160" cy="138" rx="85" ry="32" fill={a ? "#daa520" : "#666"} />
        <ellipse cx="160" cy="134" rx="82" ry="30" fill={a ? "#e8b830" : "#777"} />
        {/* Highlight on body */}
        <ellipse cx="160" cy="126" rx="55" ry="14" fill={a ? "#f0c840" : "#888"} opacity="0.3" />
        {/* Spout — long curved pouring lip */}
        <path d="M75 134 C65 130 50 122 38 112 C28 104 18 92 22 86 C28 78 38 84 46 94 C54 104 62 118 72 130 Z" fill={a ? "#daa520" : "#666"} />
        <path d="M75 130 C67 126 54 118 44 108 C36 100 30 90 34 86 C40 80 48 88 54 96 C60 104 66 118 72 128 Z" fill={a ? "#e8b830" : "#777"} />
        {/* Spout tip */}
        <path d="M22 90 C16 88 14 94 18 100 C20 103 24 100 24 96 Z" fill={a ? "#daa520" : "#666"} />
        {/* Neck / chimney */}
        <path d="M140 108 Q148 88 160 84 Q172 88 180 108 Z" fill={a ? "#c49a1a" : "#555"} />
        <path d="M144 106 Q150 90 160 86 Q170 90 176 106 Z" fill={a ? "#daa520" : "#666"} />
        {/* Lid */}
        <ellipse cx="160" cy="84" rx="22" ry="6" fill={a ? "#96700a" : "#444"} />
        <ellipse cx="160" cy="82" rx="18" ry="5" fill={a ? "#c49a1a" : "#555"} />
        {/* Lid knob */}
        <ellipse cx="160" cy="78" rx="8" ry="3.5" fill={a ? "#daa520" : "#666"} />
        <ellipse cx="160" cy="76" rx="5" ry="2.5" fill={a ? "#e8b830" : "#777"} />
        <circle cx="160" cy="73" r="3" fill={a ? "#f0c840" : "#777"} />
        {/* Handle — ornate curved loop on right */}
        <path d="M230 120 C244 112 258 118 256 132 C254 144 244 150 232 142" stroke={a ? "#96700a" : "#444"} strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M230 120 C244 112 258 118 256 132 C254 144 244 150 232 142" stroke={a ? "#c49a1a" : "#555"} strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Decorative band around belly */}
        <ellipse cx="160" cy="138" rx="85" ry="2" fill={a ? "#96700a" : "#444"} opacity="0.5" />
        <ellipse cx="160" cy="148" rx="80" ry="1.5" fill={a ? "#96700a" : "#444"} opacity="0.3" />
      </svg>
    </button>
  );
}

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

function LevelBadge({ level, levels }) {
  const lvls = levels || DEFAULT_LEVELS;
  const l = lvls[level];
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
// SKU AUTOCOMPLETE (used in Planning tab)
// ============================================================

const IS_AC = { width: "100%", padding: "5px 8px", fontSize: 12, background: "#16161e", color: "#e0e0e0", border: "1px solid #333", borderRadius: 6, outline: "none", boxSizing: "border-box" };

function SkuAutocomplete({ value, onChange, skuOpts }) {
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen] = useState(false);
  const [userTyping, setUserTyping] = useState(false);

  // Sync display text from value prop (when not actively typing)
  useEffect(() => {
    if (!userTyping) {
      const item = skuOpts.find(i => i.id === value);
      setInputVal(item ? item.id : "");
    }
  }, [value, skuOpts, userTyping]);

  // Filter: when user is typing, filter by their input; when not, show all
  const query = userTyping ? inputVal.toLowerCase() : "";
  const filtered = skuOpts.filter(i => {
    if (!query) return true;
    return i.id.toLowerCase().includes(query) || i.name.toLowerCase().includes(query);
  });

  return (
    <div style={{ position: "relative" }}>
      <input value={inputVal} placeholder="Type SKU..."
        onChange={e => { setInputVal(e.target.value); setUserTyping(true); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => { setOpen(false); setUserTyping(false); }, 200); }}
        style={IS_AC}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, minWidth: 300, zIndex: 100, background: "#1e1e2e", border: "1px solid #444", borderRadius: 6, maxHeight: 300, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          {filtered.map(item => (
            <div key={item.id}
              onMouseDown={() => { onChange(item.id); setInputVal(item.id); setUserTyping(false); setOpen(false); }}
              style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #2a2a3a", color: "#e0e0e0" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#2a2a3a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8b5cf6" }}>{item.id}</span>
              <span style={{ color: "#ccc", marginLeft: 8 }}>{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Generic list editor for admin config (defined outside App to avoid re-creation on render)
function ListEditor({ items, setItems, configKey, label }) {
  const [newVal, setNewVal] = useState("");
  const addItem = async () => {
    if (!newVal.trim()) return;
    const updated = [...items, newVal.trim()];
    setItems(updated);
    try { await saveConfig(configKey, updated); } catch (err) { console.warn(err); }
    setNewVal("");
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder={`New ${label.toLowerCase()}...`} style={{ ...IS, flex: 1 }} onKeyDown={e => { if (e.key === "Enter") addItem(); }} />
        <button onClick={addItem} style={B1}><Plus size={14} /> Add</button>
      </div>
      {items.length === 0 ? <p style={{ color: "#555", fontSize: 13 }}>None defined.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#16161e", borderRadius: 6, border: "1px solid #2a2a3a" }}>
              <span style={{ fontSize: 13, color: "#e0e0e0" }}>{item}</span>
              <button onClick={async () => { const updated = items.filter((_, j) => j !== idx); setItems(updated); try { await saveConfig(configKey, updated); } catch (err) { console.warn(err); } }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>{items.length} items</div>
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
  const [delUserConfirm, setDelUserConfirm] = useState(null);
  const [pwModal, setPwModal] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const isAdmin = profile?.role === "admin";
  const [tab, setTab] = useState("dashboard");
  const [parts, setParts] = useState(SEED_PARTS);
  const [assemblies, setAssemblies] = useState(SEED_ASSEMBLIES);
  const [vendors, setVendors] = useState(SEED_VENDORS);
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [orderLines, setOrderLines] = useState([]);
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
  const [freshLotNumber, setFreshLotNumber] = useState("");
  const [prodDate, setProdDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
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
  // Alternate vendors for the item being edited. Each row: { vendorId, vendorName, supplierCode, unitCost }
  const [vendorAltsForm, setVendorAltsForm] = useState([]);
  // All alternate vendors across all items (mirrors item_vendors table)
  const [itemVendors, setItemVendorsState] = useState([]);
  // Multi-vendor confirmation modal state for PO generation
  const [poVendorPickerOpen, setPoVendorPickerOpen] = useState(false);
  const [poVendorChoices, setPoVendorChoices] = useState({}); // { itemId: chosenVendorName }
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [delConfirm, setDelConfirm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState("items");
  const [importData, setImportData] = useState(null);
  const [importMapping, setImportMapping] = useState({});
  const [importMode, setImportMode] = useState("update_add");
  const [bomColMap, setBomColMap] = useState({ parent: "", component: "", qty: "" });
  const [qtyColMap, setQtyColMap] = useState({ sku: "", qty: "", batch: "", location: "" });
  const [replaceAllConfirm, setReplaceAllConfirm] = useState(false);
  const [adjModal, setAdjModal] = useState(false);
  const [adjItem, setAdjItem] = useState(null);
  const [adjQty, setAdjQty] = useState(0);
  const [adjNotes, setAdjNotes] = useState("");
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [cfgLevels, setCfgLevels] = useState(DEFAULT_LEVELS);
  const [cfgOrdStatuses, setCfgOrdStatuses] = useState(DEFAULT_ORD_STATUSES);
  const [cfgOrderTypes, setCfgOrderTypes] = useState(DEFAULT_ORDER_TYPES);
  const [cfgPriceMatrix, setCfgPriceMatrix] = useState({});
  const [cfgPoStatuses, setCfgPoStatuses] = useState(DEFAULT_PO_STATUSES);
  const [cfgReceiptTypes, setCfgReceiptTypes] = useState(DEFAULT_RECEIPT_TYPES);
  const [cfgCosting, setCfgCosting] = useState(DEFAULT_COSTING);
  const [cfgSection, setCfgSection] = useState("appName");
  const [appName, setAppName] = useState("Dumpling Genie");
  const [wishModal, setWishModal] = useState(false);
  const [wishText, setWishText] = useState("");
  const [wishesUsed, setWishesUsed] = useState(0);
  const [allWishes, setAllWishes] = useState([]);
  const MAX_WISHES = 3;

  // ---- Planning / Forecast State ----
  const [forecastConfig, setForecastConfig] = useState({ horizonWeeks: 4, lookbackWeeks: 8, workDays: ["Mon","Tue","Wed","Thu","Fri"] });
  // ---- Lot Numbering Config ----
  const [baseIngredients, setBaseIngredients] = useState(DEFAULT_BASE_INGREDIENTS);
  const [lotCounter, setLotCounter] = useState(0);
  const [planWeekStart, setPlanWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [planDayRows, setPlanDayRows] = useState({});
  const [weekDrafts, setWeekDrafts] = useState([]);
  const [weekCompleted, setWeekCompleted] = useState([]);
  const [planConfirmModal, setPlanConfirmModal] = useState(false);
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  // Production tab: status filter + draft modals
  const [prodStatusFilter, setProdStatusFilter] = useState("All");
  const [completeDraftModal, setCompleteDraftModal] = useState(false);
  const [draftToComplete, setDraftToComplete] = useState(null);
  const [editDraftModal, setEditDraftModal] = useState(false);
  const [editDraftForm, setEditDraftForm] = useState({});
  // When editing a draft we re-use the prod* states so the same consumption tree
  // and lot picker UI from the Complete modal can be shown. editingDraftId tracks
  // which draft is being edited; null = not editing.
  const [editingDraftId, setEditingDraftId] = useState(null);
  // Snapshot of the lot # the draft had when Edit was opened — used to detect
  // when a source lot changed so we can cascade-clear dependent drafts.
  const [editOriginalLot, setEditOriginalLot] = useState("");

  // ---- Dashboard State ----
  const [dashView, setDashView] = useState("daily");
  const [dailyNote, setDailyNote] = useState({ text: "", updatedAt: null, updatedBy: "" });
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [blockersOpen, setBlockersOpen] = useState(false);

  // Config aliases (so existing JSX references keep working)
  const LEVELS = cfgLevels;
  const ORD_STATUSES = cfgOrdStatuses;
  const ORDER_TYPES = cfgOrderTypes;
  const getUnitPrice = useCallback((orderType, sku) => {
    if (!orderType || !sku) return 0;
    return cfgPriceMatrix[`${orderType}|${sku}`] || 0;
  }, [cfgPriceMatrix]);
  const PO_STATUSES = cfgPoStatuses;
  const RECEIPT_TYPES = cfgReceiptTypes;
  const COSTING = cfgCosting;

  // ---- Helper: load all data from Supabase ----
  const loadAllData = useCallback(async () => {
    try {
      const [dbItems, dbBom, dbVendors, dbOrders, dbPOs] = await Promise.all([
        fetchItems(), fetchBomLines(), fetchVendors(), fetchOrders(), fetchPurchaseOrders(),
      ]);

      // If DB is empty, seed it with all starter data
      if (dbItems.length === 0) {
        console.log("DB empty — seeding items, BOM, and vendors...");
        try {
          // Insert all items (parts + assemblies without bom field)
          const allSeedItems = [...SEED_PARTS, ...SEED_ASSEMBLIES.map(({ bom, ...rest }) => rest)];
          await bulkInsertItems(allSeedItems);
          // Insert BOM lines
          for (const asm of SEED_ASSEMBLIES) {
            if (asm.bom && asm.bom.length > 0) {
              await setBomForAssembly(asm.id, asm.bom.map(b => ({ partId: b.partId, qty: b.qty })));
            }
          }
          // Insert vendors
          for (const v of SEED_VENDORS) { await upsertVendor(v); }
          // Insert orders
          for (const o of SEED_ORDERS) { await upsertOrder(o); }
          console.log("Seed complete — reloading...");
          // Re-fetch everything now that DB is populated
          const [freshItems, freshBom, freshVendors, freshOrders, freshPOs] = await Promise.all([
            fetchItems(), fetchBomLines(), fetchVendors(), fetchOrders(), fetchPurchaseOrders(),
          ]);
          const aIds = new Set(freshBom.map(b => b.assemblyId));
          setParts(freshItems.filter(i => !aIds.has(i.id)));
          setAssemblies(freshItems.filter(i => aIds.has(i.id)).map(a => ({
            ...a, bom: freshBom.filter(b => b.assemblyId === a.id).map(b => ({ partId: b.partId, qty: b.qty })),
          })));
          if (freshVendors.length > 0) setVendors(freshVendors);
          if (freshOrders.length > 0) setOrders(freshOrders);
          if (freshPOs.length > 0) setPOs(freshPOs);
        } catch (seedErr) { console.warn("Auto-seed failed:", seedErr.message); }
      } else {
        const assemblyIds = new Set(dbBom.map((b) => b.assemblyId));
        const rawMats = dbItems.filter((i) => !assemblyIds.has(i.id));
        const asms = dbItems.filter((i) => assemblyIds.has(i.id)).map((a) => ({
          ...a,
          bom: dbBom.filter((b) => b.assemblyId === a.id).map((b) => ({ partId: b.partId, qty: b.qty })),
        }));
        setParts(rawMats); setAssemblies(asms);
        if (dbVendors.length > 0) setVendors(dbVendors);
        if (dbOrders.length > 0) setOrders(dbOrders);
        if (dbPOs.length > 0) setPOs(dbPOs);
      }
      fetchReceipts().then(r => setReceipts(r)).catch(() => {});
      fetchProductionRuns().then(r => setProdRuns(r)).catch(() => {});
      fetchInventoryLots().then(r => setLots(r)).catch(() => {});
      fetchItemVendors().then(r => setItemVendorsState(r)).catch(() => {});
      // Load admin configs
      getLocations().then(r => { if (r && r.length > 0) setLocations(r); }).catch(() => {});
      getConfig("ord_statuses").then(r => { if (r) setCfgOrdStatuses(r); }).catch(() => {});
      getConfig("order_types").then(r => { if (r) setCfgOrderTypes(r); }).catch(() => {});
      getConfig("price_matrix").then(r => { if (r) setCfgPriceMatrix(r); }).catch(() => {});
      getConfig("po_statuses").then(r => { if (r) setCfgPoStatuses(r); }).catch(() => {});
      getConfig("receipt_types").then(r => { if (r) setCfgReceiptTypes(r); }).catch(() => {});
      getConfig("costing_methods").then(r => { if (r) setCfgCosting(r); }).catch(() => {});
      getConfig("sku_levels").then(r => { if (r) setCfgLevels(r); }).catch(() => {});
      getConfig("app_name").then(r => { if (r) setAppName(r); }).catch(() => {});
      getConfig("forecast_config").then(r => { if (r) setForecastConfig(prev => ({ ...prev, ...r })); }).catch(() => {});
      getConfig("daily_note").then(r => { if (r) setDailyNote(r); }).catch(() => {});
      getConfig("lot_base_ingredients").then(r => { if (Array.isArray(r) && r.length === 10) setBaseIngredients(r); }).catch(() => {});
      getConfig("lot_sequence_counter").then(r => { if (typeof r === "number") setLotCounter(r); }).catch(() => {});
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

  // Load wish count when user is authenticated
  useEffect(() => {
    if (authUser) {
      countUserWishes(authUser.id).then(c => setWishesUsed(c)).catch(() => {});
    }
  }, [authUser]);

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

  // Map of itemId -> array of alternate vendor rows. Declared early so it can
  // be referenced by viewItems / openEdit / save / genPOs without TDZ errors.
  const itemVendorsByItem = useMemo(() => {
    const m = new Map();
    for (const v of itemVendors) {
      if (!m.has(v.itemId)) m.set(v.itemId, []);
      m.get(v.itemId).push(v);
    }
    return m;
  }, [itemVendors]);

  // True if the item has 1+ alternate vendor rows
  const hasAlternates = useCallback((itemId) => (itemVendorsByItem.get(itemId)?.length || 0) > 0, [itemVendorsByItem]);

  // All vendor options for an item: primary + alternates, deduped by name
  const vendorOptionsForItem = useCallback((item) => {
    const opts = [];
    if (item?.supplier) opts.push({ vendorName: item.supplier, supplierCode: item.supplierCode || "", unitCost: item.avgCost || 0, primary: true });
    const alts = itemVendorsByItem.get(item?.id) || [];
    for (const a of alts) {
      if (!opts.some(o => o.vendorName === a.vendorName)) {
        opts.push({ vendorName: a.vendorName, supplierCode: a.supplierCode, unitCost: a.unitCost, primary: false });
      }
    }
    return opts;
  }, [itemVendorsByItem]);

  const viewItems = useMemo(() => {
    let d = (tab === "inventory" || tab === "items") ? [...parts, ...assemblies] : [];
    if (search) {
      const s = search.toLowerCase();
      d = d.filter((p) => {
        if (p.name.toLowerCase().includes(s)) return true;
        if (p.id.toLowerCase().includes(s)) return true;
        if ((p.supplier || "").toLowerCase().includes(s)) return true;
        // Match alternate vendor names too
        const alts = itemVendorsByItem.get(p.id) || [];
        return alts.some(a => (a.vendorName || "").toLowerCase().includes(s));
      });
    }
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
  }, [tab, parts, assemblies, search, levelFilter, stockFilter, sortCol, sortDir, bomCost, itemVendorsByItem]);

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
      if (!groups[key]) groups[key] = { customer: o.customer, date: o.date, lines: [], ids: [], orderType: o.orderType || null };
      groups[key].lines.push(o);
      groups[key].ids.push(o.id);
      if (o.orderType && !groups[key].orderType) groups[key].orderType = o.orderType;
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
    const totalRevenue = orders.reduce((s, o) => s + (o.qty * getUnitPrice(o.orderType, o.item)), 0);
    return {
      total: gArr.length,
      pending: gArr.filter(g => g.some(o => o.status === "Pending" || o.status === "Confirmed")).length,
      fulfilled: gArr.filter(g => g.every(o => o.status === "Fulfilled" || o.status === "Cancelled")).length,
      totalRevenue,
    };
  }, [orders, getUnitPrice]);

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
    // Total dumplings: sum qty * piecesPerUnit for all items that have it set
    let totalPcs = 0;
    for (const item of allItems) {
      if (item.piecesPerUnit > 0 && item.qty > 0) {
        totalPcs += item.qty * item.piecesPerUnit;
      }
    }
    return { total: allItems.length, raw: parts.length, asm: assemblies.length, low, rawVal, open, totalPcs: Math.round(totalPcs) };
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

  // ---- Planning Helpers ----
  const fmtDate = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const getMonday = (d) => { const dt = parseDate(typeof d === "string" ? d : fmtDate(d)); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return fmtDate(dt); };
  const addDays = (d, n) => { const dt = parseDate(typeof d === "string" ? d : fmtDate(d)); dt.setDate(dt.getDate() + n); return fmtDate(dt); };
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const productLines = useMemo(() => {
    const lines = [...new Set(assemblies.filter(a => getLevel(a.id) === 250).map(a => {
      const m = a.id.match(/^250-(\w+)/); return m ? m[1] : null;
    }).filter(Boolean))];
    return lines.sort();
  }, [assemblies]);

  // Configurable plan item per product line (defaults to 250-{pl} Batch)
  const planItems = useMemo(() => {
    const map = {};
    for (const pl of productLines) {
      const configured = forecastConfig.planItems?.[pl];
      // Verify configured item still exists
      if (configured && allItems.find(i => i.id === configured)) map[pl] = configured;
      else map[pl] = `250-${pl} Batch`;
    }
    return map;
  }, [productLines, forecastConfig.planItems, allItems]);

  // Auto-forecast: avg units per week from fulfilled order history (in plan item equivalents)
  const autoForecast = useMemo(() => {
    const result = {};
    const lookback = forecastConfig.lookbackWeeks || 8;
    const cutoff = addDays(fmtDate(new Date()), -(lookback * 7));
    const fulfilled = orders.filter(o => o.status === "Fulfilled" && o.date >= cutoff);
    // BOM explosion to plan-item equivalents
    const explodeToTarget = (itemId, qty, targetId) => {
      const walk = (id, mult) => {
        if (id === targetId) return mult;
        const it = allItems.find(i => i.id === id);
        if (!it || !it.bom || it.bom.length === 0) return 0;
        let total = 0;
        for (const l of it.bom) total += walk(l.partId, l.qty * mult);
        return total;
      };
      return walk(itemId, qty);
    };
    for (const pl of productLines) {
      const targetId = planItems[pl];
      const plOrders = fulfilled.filter(o => {
        const m = o.item.match(/^\d+-(\w+)/); return m && m[1] === pl;
      });
      let totalUnits = 0;
      for (const o of plOrders) totalUnits += explodeToTarget(o.item, o.qty, targetId);
      const weeksSet = new Set(plOrders.map(o => getMonday(o.date)));
      const weeks = Math.max(weeksSet.size, 1);
      result[pl] = Math.round((totalUnits / weeks) * 2) / 2;
    }
    return result;
  }, [orders, allItems, productLines, planItems, forecastConfig.lookbackWeeks]);

  // Runway: current stock per product line in plan-item equivalents and weeks until out
  const runwayData = useMemo(() => {
    return productLines.map(pl => {
      const targetId = planItems[pl];
      const targetLevel = getLevel(targetId);
      // Sum stock at target level and higher, converted to plan-item equivalents
      const targetItem = allItems.find(i => i.id === targetId);
      let equiv = targetItem ? targetItem.qty : 0;
      // Add stock from higher levels converted down to plan-item equivalents
      for (const item of allItems) {
        if (item.id === targetId) continue;
        const m = item.id.match(/^\d+-(\w+)/);
        if (!m || m[1] !== pl) continue;
        const lvl = getLevel(item.id);
        if (lvl < targetLevel || item.qty <= 0) continue;
        const walk = (id, mult) => {
          if (id === targetId) return mult;
          const it = allItems.find(i => i.id === id);
          if (!it || !it.bom) return 0;
          let t = 0; for (const l of it.bom) t += walk(l.partId, l.qty * mult); return t;
        };
        const unitsPerItem = walk(item.id, 1);
        if (unitsPerItem > 0) equiv += item.qty * unitsPerItem;
      }
      const demandPerWeek = autoForecast[pl] || 0;
      const weeksLeft = demandPerWeek > 0 ? equiv / demandPerWeek : Infinity;
      const stockoutDate = demandPerWeek > 0 ? addDays(fmtDate(new Date()), Math.round(weeksLeft * 7)) : null;
      return { productLine: pl, itemId: targetId, equiv: Math.round(equiv * 100) / 100, demandPerWeek, weeksLeft: Math.round(weeksLeft * 10) / 10, stockoutDate };
    });
  }, [productLines, planItems, allItems, autoForecast]);

  // ---- Dashboard Computed Data (sourced from draft production runs) ----
  const todayStr = useMemo(() => fmtDate(new Date()), []);

  const todaysDraftRuns = useMemo(() => {
    return prodRuns.filter(r => (r.status || "Complete") === "Draft" && r.plannedDate === todayStr);
  }, [prodRuns, todayStr]);

  const todaysForecast = useMemo(() => {
    const byLine = {};
    for (const r of todaysDraftRuns) {
      const m = r.assemblyId.match(/^\d+-(\w+)/);
      const pl = m ? m[1] : "?";
      if (!byLine[pl]) byLine[pl] = { productLine: pl, plannedQty: 0 };
      byLine[pl].plannedQty += r.qtyProduced;
    }
    return Object.values(byLine);
  }, [todaysDraftRuns]);

  const todaysShipments = useMemo(() => {
    return orders.filter(o => o.shipDate === todayStr);
  }, [orders, todayStr]);

  const weekShipments = useMemo(() => {
    const monday = getMonday(todayStr);
    const sunday = addDays(monday, 6);
    return orders.filter(o => o.shipDate && o.shipDate >= monday && o.shipDate <= sunday);
  }, [orders, todayStr]);

  const weekForecast = useMemo(() => {
    const monday = getMonday(todayStr);
    const sunday = addDays(monday, 6);
    const weekDraftRuns = prodRuns.filter(r => (r.status || "Complete") === "Draft" && r.plannedDate && r.plannedDate >= monday && r.plannedDate <= sunday);
    const weekCompleteRuns = prodRuns.filter(r => (r.status || "Complete") === "Complete" && r.date && r.date >= monday && r.date <= sunday);
    const byLine = {};
    for (const r of weekDraftRuns) {
      const m = r.assemblyId.match(/^\d+-(\w+)/);
      const pl = m ? m[1] : "?";
      if (!byLine[pl]) byLine[pl] = { planned: 0, actual: 0 };
      byLine[pl].planned += r.qtyProduced;
    }
    for (const r of weekCompleteRuns) {
      const m = r.assemblyId.match(/^\d+-(\w+)/);
      const pl = m ? m[1] : "?";
      if (!byLine[pl]) byLine[pl] = { planned: 0, actual: 0 };
      byLine[pl].actual += r.qtyProduced;
    }
    return { byLine };
  }, [prodRuns, todayStr]);

  const todaysBlockers = useMemo(() => {
    if (todaysDraftRuns.length === 0) return [];
    const rawNeeds = {};
    const explodeToRaw = (id, mult) => {
      const it = allItems.find(i => i.id === id);
      if (!it) return;
      if (getLevel(it.id) === 100) {
        if (!rawNeeds[it.id]) rawNeeds[it.id] = { item: it, needed: 0 };
        rawNeeds[it.id].needed += mult;
        return;
      }
      if (it.bom) for (const l of it.bom) explodeToRaw(l.partId, l.qty * mult);
    };
    for (const r of todaysDraftRuns) {
      explodeToRaw(r.assemblyId, r.qtyProduced);
    }
    return Object.values(rawNeeds)
      .filter(r => r.item.qty < r.needed)
      .map(r => ({
        id: r.item.id, name: r.item.name,
        needed: Math.ceil(r.needed * 1000) / 1000,
        onHand: r.item.qty,
        shortfall: Math.ceil((r.needed - r.item.qty) * 1000) / 1000,
        unit: r.item.unit,
      }))
      .sort((a, b) => b.shortfall - a.shortfall);
  }, [todaysDraftRuns, allItems]);

  // Load drafts and completed runs for the currently viewed planning week
  useEffect(() => {
    if (!planWeekStart) return;
    setPlanLoading(true);
    Promise.all([
      fetchDraftRunsForWeek(planWeekStart),
      fetchCompletedRunsForWeek(planWeekStart),
    ]).then(([drafts, completed]) => {
      setWeekDrafts(drafts);
      setWeekCompleted(completed);
      const rows = {};
      for (const d of drafts) {
        const date = d.plannedDate;
        if (!rows[date]) rows[date] = [];
        rows[date].push({ skuId: d.assemblyId, qty: d.qtyProduced, _key: d.id, lotNumber: d.lotNumber });
      }
      setPlanDayRows(rows);
    }).catch(() => {}).finally(() => setPlanLoading(false));
  }, [planWeekStart]);

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
      setForm({ id: `${lvl}-`, name: "", category: LEVELS[lvl]?.cat || "Raw Material", type: "Stock", costing: lvl >= 250 ? "FEFO - Batch" : "FIFO", location: "Dumpling Factory", supplier: "", supplierCode: "", avgCost: 0, unit: "", minStock: 0, qty: 0, notes: "", status: "Active", lotTracking: lvl >= 200, piecesPerUnit: 0, lotSource: false });
      setBomForm([]);
      setVendorAltsForm([]);
    }
    else if (type === "order") {
      setForm({ customer: "", date: fmtDate(new Date()), status: "Pending", notes: "" });
      setOrderLines([{ item: "", qty: 0, notes: "" }]);
    }
    else if (type === "vendor") setForm({ id: `V-${String(vendors.length + 1).padStart(3, "0")}`, name: "", contact: "", email: "", phone: "", address: "", paymentTerms: "Net 30", leadDays: 0, notes: "" });
    setModal(type);
  };

  const openEdit = (type, item) => {
    setEditItem(item);
    setForm({ ...item });
    if (type === "order") setOrderLines([]);
    setBomForm(item.bom ? item.bom.map(b => ({...b})) : []);
    // Load alternate vendors for this item (if editing an item)
    if (type === "item") {
      const alts = itemVendorsByItem.get(item.id) || [];
      setVendorAltsForm(alts.map(a => ({ ...a })));
    } else {
      setVendorAltsForm([]);
    }
    setModal(type);
  };

  const addLinesToOrder = (group) => {
    setEditItem(null);
    setForm({ customer: group.customer, date: group.date, status: group.lines[0]?.status || "Pending", notes: "", orderType: group.orderType || group.lines[0]?.orderType || "" });
    setOrderLines([{ item: "", qty: 0, notes: "" }]);
    setModal("order");
  };

  const setGroupStatus = async (group, newStatus) => {
    const updated = group.lines.map(o => ({ ...o, status: newStatus }));
    setOrders(prev => prev.map(o => {
      const match = updated.find(u => u.id === o.id);
      return match || o;
    }));
    for (const o of updated) {
      try { await upsertOrder(o); } catch (err) { console.warn(err); }
    }
    show(`Set ${updated.length} line(s) to ${newStatus}`);
  };

  const setGroupOrderType = async (group, newType) => {
    const updated = group.lines.map(o => ({ ...o, orderType: newType }));
    setOrders(prev => prev.map(o => {
      const match = updated.find(u => u.id === o.id);
      return match || o;
    }));
    for (const o of updated) {
      try { await upsertOrder(o); } catch (err) { console.warn(err); }
    }
    show(`Order type set to ${newType}`);
  };

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
        // Persist alternate vendors (raw materials only — non-raw items can't have suppliers)
        if (!isAssembly && lvl === 100) {
          const cleanAlts = (vendorAltsForm || []).filter(a => a.vendorName && a.vendorName.trim());
          await setItemVendors(obj.id, cleanAlts);
          // Update local state so UI reflects immediately
          setItemVendorsState(prev => [
            ...prev.filter(p => p.itemId !== obj.id),
            ...cleanAlts.map(a => ({ id: undefined, itemId: obj.id, vendorId: a.vendorId || "", vendorName: a.vendorName, supplierCode: a.supplierCode || "", unitCost: Number(a.unitCost) || 0 })),
          ]);
        } else {
          // Non-raw items shouldn't have alternates — clear any stragglers
          await setItemVendors(obj.id, []);
          setItemVendorsState(prev => prev.filter(p => p.itemId !== obj.id));
        }
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
      if (!form.customer) { show("Customer required", "error"); return; }
      if (editItem) {
        // Editing a single existing line
        if (!form.item) { show("Item required", "error"); return; }
        const obj = { ...form, qty: Number(form.qty) };
        try { await upsertOrder(obj); } catch (e) { console.warn("DB save failed:", e.message); }
        setOrders((p) => p.map((x) => (x.id === editItem.id ? obj : x)));
      } else {
        // Creating new lines (new order or adding to existing)
        const validLines = orderLines.filter(l => l.item && l.qty > 0);
        if (validLines.length === 0) { show("At least one line with item and qty required", "error"); return; }
        const maxOrd = orders.reduce((max, o) => {
          const m = o.id.match(/^ORD-(\d+)$/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        const newOrders = validLines.map((l, i) => ({
          id: `ORD-${String(maxOrd + 1 + i).padStart(3, "0")}`,
          customer: form.customer,
          date: form.date,
          status: form.status,
          item: l.item,
          qty: Number(l.qty),
          notes: l.notes || "",
          shipDate: null,
          orderType: form.orderType || null,
        }));
        for (const o of newOrders) {
          try { await upsertOrder(o); } catch (e) { console.warn("DB save failed:", e.message); }
        }
        setOrders(p => [...p, ...newOrders]);
      }
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

  const delUser = async (userId) => {
    try {
      await dbDeleteProfile(userId);
      setAllProfiles((prev) => prev.filter((x) => x.id !== userId));
      show("User removed");
    } catch (e) {
      show(e.message, "error");
    }
    setDelUserConfirm(null);
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

  const submitWish = async () => {
    if (!wishText.trim()) { show("Tell the Genie your wish!", "error"); return; }
    if (wishesUsed >= MAX_WISHES) { show("You have used all your wishes!", "error"); return; }
    try {
      await createWish({ userId: authUser.id, userEmail: profile?.email || authUser.email, wish: wishText.trim() });
      setWishesUsed(prev => prev + 1);
      setWishText("");
      setWishModal(false);
      show("Your wish has been granted... er, submitted! The Genie will review it.");
    } catch (e) { show("Wish failed: " + e.message, "error"); }
  };

  // Open the multi-vendor picker if any needed lines belong to a multi-vendor item.
  // Otherwise generate POs immediately using each item's primary supplier.
  const genPOs = async () => {
    const allLines = mrp.byVendor.flatMap(vg => vg.lines).filter(l => l.shortfall > 0);
    if (allLines.length === 0) { show("No shortfalls", "error"); return; }
    const multiItems = allLines.filter(l => hasAlternates(l.id));
    if (multiItems.length > 0) {
      // Default each multi-vendor item to its primary supplier
      const choices = {};
      for (const l of multiItems) choices[l.id] = l.supplier || "";
      setPoVendorChoices(choices);
      setPoVendorPickerOpen(true);
      return;
    }
    await generatePOsWithChoices({});
  };

  // Build POs grouping each line by either the user's vendor choice (for multi-vendor items)
  // or the item's primary supplier. `choices` is { itemId: vendorName }.
  const generatePOsWithChoices = async (choices) => {
    const allLines = mrp.byVendor.flatMap(vg => vg.lines).filter(l => l.shortfall > 0);
    if (allLines.length === 0) { show("No shortfalls", "error"); return; }

    // Re-bucket lines by chosen vendor; fall back to line.supplier
    const buckets = {}; // { vendorName: { lines: [], total } }
    for (const l of allLines) {
      const chosenVendor = choices[l.id] || l.supplier || "Unassigned";
      // If a chosen vendor differs from the primary, swap in that vendor's per-line cost
      let unitCost = l.avgCost;
      let supplierCode = l.supplierCode || "";
      if (chosenVendor !== l.supplier) {
        const alt = (itemVendorsByItem.get(l.id) || []).find(a => a.vendorName === chosenVendor);
        if (alt) { unitCost = alt.unitCost || l.avgCost; supplierCode = alt.supplierCode || ""; }
      }
      const total = Math.max(0, Math.ceil(l.shortfall * 1000) / 1000) * unitCost;
      if (!buckets[chosenVendor]) buckets[chosenVendor] = { lines: [], total: 0 };
      buckets[chosenVendor].lines.push({ partId: l.id, name: l.name, qty: l.shortfall, unit: l.unit, unitCost, supplierCode, total });
      buckets[chosenVendor].total += total;
    }

    const npos = [];
    let i = 0;
    for (const vName of Object.keys(buckets)) {
      const vObj = vendors.find((v) => v.name === vName);
      const pid = `PO-${String(pos.length + npos.length + 1 + i).padStart(3, "0")}`;
      const po = { id: pid, vendor: vName, vendorId: vObj?.id || "", date: new Date().toISOString().slice(0, 10), status: "Draft", lines: buckets[vName].lines, total: buckets[vName].total, paymentTerms: vObj?.paymentTerms || "", leadDays: vObj?.leadDays || 0, notes: "" };
      npos.push(po);
      try { await createPurchaseOrder(po); } catch (e) { console.warn("PO save failed:", e.message); }
      i += 1;
    }
    if (npos.length) { setPOs((p) => [...p, ...npos]); show(`Generated ${npos.length} POs`); setTab("pos"); }
    else show("No shortfalls", "error");
    setPoVendorPickerOpen(false);
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

  // Suggested next lot number for the currently-selected production assembly.
  // Pure preview based on current state — does NOT reserve from the counter
  // until production is actually submitted. Includes the production date suffix.
  const suggestedNewLot = useMemo(() => {
    if (!prodAssembly) return "";
    const m = prodAssembly.match(/^\d+-(\w+)/);
    const pl = m ? m[1] : "";
    const digit = digitForProductLine(pl, baseIngredients);
    return formatLotNumber(digit, lotCounter + 1, prodDate);
  }, [prodAssembly, lotCounter, baseIngredients, prodDate]);

  // When the user changes the production date, update the date suffix on any
  // auto-pattern lot # (preserving the counter portion). This is wired into
  // each date input's onChange — NOT a useEffect — so opening a modal with a
  // saved lot # doesn't accidentally overwrite it.
  const handleProdDateChange = useCallback((newDate) => {
    setProdDate(newDate);
    if (!prodAssembly) return;
    const m = prodAssembly.match(/^\d+-(\w+)/);
    const pl = m ? m[1] : "";
    const digit = digitForProductLine(pl, baseIngredients);
    const autoRe = new RegExp(`^${digit}\\d{4}(-\\d{6})?$`);
    const suffix = dateToMMDDYY(newDate);
    const replaceSuffix = (val) => {
      const dashIdx = val.indexOf("-");
      const prefix = dashIdx > 0 ? val.slice(0, dashIdx) : val;
      return suffix ? `${prefix}-${suffix}` : prefix;
    };
    if (prodLotNumber && autoRe.test(prodLotNumber)) {
      setProdLotNumber(replaceSuffix(prodLotNumber));
    }
    if (freshLotNumber && autoRe.test(freshLotNumber)) {
      setFreshLotNumber(replaceSuffix(freshLotNumber));
    }
  }, [prodAssembly, baseIngredients, prodLotNumber, freshLotNumber]);

  // After a fresh lot is created, ensure the global counter is at least as high
  // as the numeric suffix used (so the next suggestion doesn't collide).
  // Accepts both the new "60003-041926" format and the legacy "60003" format.
  const ensureCounterMatchesLot = useCallback(async (lotNum) => {
    if (!lotNum) return;
    let suffix = NaN;
    const dated = lotNum.match(/^\d(\d{4})-\d{6}$/);
    const legacy = lotNum.match(/^\d(\d{4,})$/);
    if (dated) suffix = parseInt(dated[1], 10);
    else if (legacy) suffix = parseInt(legacy[1], 10);
    if (!Number.isFinite(suffix) || suffix <= lotCounter) return;
    try {
      await saveConfig("lot_sequence_counter", suffix);
      setLotCounter(suffix);
    } catch (e) { console.warn("Counter bump failed:", e.message); }
  }, [lotCounter]);

  const lotSourceItem = useMemo(() => {
    if (!prodAssemblyItem) return null;
    if (prodAssemblyItem.lotSource) return null; // Lot source items get manual entry
    const lvl = getLevel(prodAssemblyItem.id);
    if (lvl <= 200) return null; // 200-level = manual entry
    return findLotSourceInBom(prodAssemblyItem.id, allItems);
  }, [prodAssemblyItem, allItems]);

  // Get available lots from the lot source item only.
  // Includes both real inventory lots AND planned (Draft) production runs that
  // will produce that lot source item, so users can pre-select an inheritance
  // chain at planning time.
  const suggestedLots = useMemo(() => {
    if (!lotSourceItem) return [];
    const real = (lotsByItem[lotSourceItem.id] || [])
      .filter(l => l.qty > 0)
      .map(l => ({
        lotNumber: l.lotNumber,
        qty: l.qty,
        productionDate: l.productionDate,
        planned: false,
      }));
    // Avoid duplicating a planned lot if a real lot with the same number already exists
    const existingNums = new Set(real.map(r => r.lotNumber));
    const planned = (prodRuns || [])
      .filter(r => r.status === "Draft" && r.assemblyId === lotSourceItem.id && r.lotNumber && !existingNums.has(r.lotNumber))
      .map(r => ({
        lotNumber: r.lotNumber,
        qty: r.qtyProduced,
        productionDate: r.plannedDate || r.date,
        planned: true,
        sourceRunId: r.id,
      }));
    return [...real, ...planned].sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
  }, [lotSourceItem, lotsByItem, prodRuns]);

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
    const lotNum = (prodLotNumber === "__FRESH__" ? freshLotNumber.trim() : prodLotNumber.trim());
    if (!lotNum) { show("Batch / Lot number is required", "error"); return; }
    const validationErrors = getValidationErrors(prodAssemblyItem.bom, prodQty);
    if (validationErrors.length > 0) { show("Not all materials are accounted for: " + validationErrors[0], "error"); return; }
    const consumed = getConsumedItems(prodAssemblyItem.bom, prodQty);
    if (consumed.length === 0) { show("Nothing to consume", "error"); return; }

    const shortages = consumed.filter(c => c.qty > c.currentQty);
    if (shortages.length > 0) {
      const names = shortages.map(s => `${s.name} (need ${s.qty.toFixed(2)}, have ${s.currentQty})`).join(", ");
      if (!window.confirm(`Warning: insufficient stock for: ${names}. Inventory will go negative. Continue?`)) return;
    }

    const runId = `PROD-${prodDate}-${String(prodRuns.length + 1).padStart(3, "0")}`;
    const runDate = prodDate;
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

      // Deduct from lots (FIFO - oldest first, but prioritize selected lot for lot source item)
      const itemLots = updLots.filter(l => l.itemId === c.partId && l.qty > 0).sort((a, b) => {
        if (lotSourceItem && c.partId === lotSourceItem.id) {
          if (a.lotNumber === lotNum && b.lotNumber !== lotNum) return -1;
          if (b.lotNumber === lotNum && a.lotNumber !== lotNum) return 1;
        }
        return (a.productionDate || "").localeCompare(b.productionDate || "");
      });
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
    await ensureCounterMatchesLot(lotNum);
    show(`Produced ${prodQty} × ${prodAssemblyItem.name}${lotNum ? " (Lot: " + lotNum + ")" : ""}`);
    setProdModal(false);
  };

  // ---- Weekly Plan Submission ----
  const submitWeeklyPlan = async () => {
    setPlanSubmitting(true);
    try {
      // Delete existing draft runs for this week
      if (weekDrafts.length > 0) {
        await deleteProductionRuns(weekDrafts.map(d => d.id));
      }
      const workDays = forecastConfig.workDays || ["Mon","Tue","Wed","Thu","Fri"];
      const selectedWeekDays = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(planWeekStart, i);
        const dayName = DAY_NAMES[parseDate(d).getDay()];
        return { date: d, dayName, isWorkDay: workDays.includes(dayName) };
      }).filter(d => d.isWorkDay);

      // Pre-reserve lot numbers for any 200-level draft (those always create new lots).
      // Walk in the same order we'll create runs so lot numbers are assigned predictably.
      const lotPlan = []; // entries: { day, row, item, productLine, needsLot }
      for (const day of selectedWeekDays) {
        const rows = planDayRows[day.date] || [];
        for (const row of rows) {
          if (!row.skuId || row.qty <= 0) continue;
          const item = allItems.find(i => i.id === row.skuId);
          if (!item) continue;
          const lvl = getLevel(item.id);
          const m = item.id.match(/^\d+-(\w+)/);
          const productLine = m ? m[1] : "";
          lotPlan.push({ day, row, item, productLine, needsLot: lvl === 200 });
        }
      }
      const needLotCount = lotPlan.filter(p => p.needsLot).length;
      let reservedLots = [];
      if (needLotCount > 0) {
        const lotEntries = lotPlan.filter(p => p.needsLot);
        reservedLots = await reserveLotNumbers(
          lotEntries.map(p => p.productLine),
          baseIngredients,
          lotEntries.map(p => p.day.date)
        );
        // Refresh local counter so admin UI reflects latest
        const newCounter = (await getConfig("lot_sequence_counter")) || 0;
        setLotCounter(newCounter);
      }

      let counter = 1;
      let lotIdx = 0;
      const newRuns = [];
      for (const plan of lotPlan) {
        const { day, row, item } = plan;
        const lotNumber = plan.needsLot ? (reservedLots[lotIdx++] || "") : "";
        const runId = `PROD-${day.date}-${String(counter).padStart(3, "0")}-${Math.random().toString(36).slice(2, 8)}`;
        const run = {
          id: runId, assemblyId: row.skuId, assemblyName: item.name,
          qtyProduced: row.qty, date: day.date, lotNumber, plannedDate: day.date,
          sourcePlanWeek: planWeekStart, status: "Draft",
          notes: "", createdBy: profile?.email || "", consumed: [],
        };
        await createProductionRun(run);
        newRuns.push({ ...run, createdAt: new Date().toISOString() });
        counter++;
      }
      // Reload
      const freshDrafts = await fetchDraftRunsForWeek(planWeekStart);
      setWeekDrafts(freshDrafts);
      const freshRuns = await fetchProductionRuns();
      setProdRuns(freshRuns);
      show(`Plan submitted — ${newRuns.length} draft production run${newRuns.length !== 1 ? "s" : ""} created`);
      setPlanConfirmModal(false);
    } catch (e) { show(e.message, "error"); }
    setPlanSubmitting(false);
  };

  // ---- Complete a Draft Run (same consumption logic as submitProduction) ----
  const submitCompleteDraft = async () => {
    const draft = draftToComplete;
    if (!draft) return;
    if (!prodAssemblyItem) { show("Select an assembly", "error"); return; }
    if (prodQty <= 0) { show("Qty must be > 0", "error"); return; }
    const lotNum = (prodLotNumber === "__FRESH__" ? freshLotNumber.trim() : prodLotNumber.trim());
    if (!lotNum) { show("Batch / Lot number is required", "error"); return; }
    const validationErrors = getValidationErrors(prodAssemblyItem.bom, prodQty);
    if (validationErrors.length > 0) { show("Not all materials are accounted for: " + validationErrors[0], "error"); return; }
    const consumed = getConsumedItems(prodAssemblyItem.bom, prodQty);
    if (consumed.length === 0) { show("Nothing to consume", "error"); return; }

    const shortages = consumed.filter(c => c.qty > c.currentQty);
    if (shortages.length > 0) {
      const names = shortages.map(s => `${s.name} (need ${s.qty.toFixed(2)}, have ${s.currentQty})`).join(", ");
      if (!window.confirm(`Warning: insufficient stock for: ${names}. Inventory will go negative. Continue?`)) return;
    }

    const runDate = prodDate;
    const updParts = [...parts];
    const updAsm = [...assemblies];
    const updLots = [...lots];

    // Consume items from inventory and lots (prioritize selected lot for lot source item)
    for (const c of consumed) {
      const pi = updParts.findIndex(p => p.id === c.partId);
      if (pi >= 0) { updParts[pi] = { ...updParts[pi], qty: updParts[pi].qty - c.qty }; try { await updateItemQty(c.partId, updParts[pi].qty); } catch (e) { console.warn(e.message); } }
      const ai = updAsm.findIndex(a => a.id === c.partId);
      if (ai >= 0) { updAsm[ai] = { ...updAsm[ai], qty: updAsm[ai].qty - c.qty }; try { await updateItemQty(c.partId, updAsm[ai].qty); } catch (e) { console.warn(e.message); } }
      const itemLots = updLots.filter(l => l.itemId === c.partId && l.qty > 0).sort((a, b) => {
        if (lotSourceItem && c.partId === lotSourceItem.id) {
          if (a.lotNumber === lotNum && b.lotNumber !== lotNum) return -1;
          if (b.lotNumber === lotNum && a.lotNumber !== lotNum) return 1;
        }
        return (a.productionDate || "").localeCompare(b.productionDate || "");
      });
      let remain = c.qty;
      for (const lot of itemLots) {
        if (remain <= 0) break;
        const deduct = Math.min(lot.qty, remain);
        lot.qty -= deduct; remain -= deduct;
        try { await adjustLotQty(c.partId, lot.lotNumber, -deduct, null, null); } catch (e) { console.warn("Lot deduct failed:", e.message); }
      }
    }

    // Add produced item to inventory and lot
    const prodIdx = updAsm.findIndex(a => a.id === prodAssemblyItem.id);
    if (prodIdx >= 0) { updAsm[prodIdx] = { ...updAsm[prodIdx], qty: updAsm[prodIdx].qty + prodQty }; try { await updateItemQty(prodAssemblyItem.id, updAsm[prodIdx].qty); } catch (e) { console.warn(e.message); } }
    if (lotNum) {
      const existingLot = updLots.find(l => l.itemId === prodAssemblyItem.id && l.lotNumber === lotNum);
      if (existingLot) { existingLot.qty += prodQty; }
      else { updLots.push({ id: Date.now(), itemId: prodAssemblyItem.id, lotNumber: lotNum, qty: prodQty, productionDate: runDate, sourceRunId: draft.id }); }
      try { await adjustLotQty(prodAssemblyItem.id, lotNum, prodQty, runDate, draft.id); } catch (e) { console.warn("Lot add failed:", e.message); }
    }

    const cleanLots = updLots.filter(l => l.qty > 0);
    setParts(updParts); setAssemblies(updAsm); setLots(cleanLots);

    // Update the run in DB
    try {
      await updateProductionRun(draft.id, { qtyProduced: prodQty, date: runDate, lotNumber: lotNum, status: "Complete", assemblyId: prodAssemblyItem.id, assemblyName: prodAssemblyItem.name, notes: prodNotes });
      await completeProductionRun(draft.id, consumed);
    } catch (e) { console.warn("Complete draft DB update failed:", e.message); }

    setProdRuns(prev => prev.map(r => r.id === draft.id ? {
      ...r, status: "Complete", qtyProduced: prodQty, date: runDate, lotNumber: lotNum,
      assemblyId: prodAssemblyItem.id, assemblyName: prodAssemblyItem.name, notes: prodNotes,
      consumed: consumed.map(c => ({ partId: c.partId, name: c.name, qty: c.qty, unit: c.unit })),
    } : r));

    await ensureCounterMatchesLot(lotNum);
    show(`Completed: ${prodQty} × ${prodAssemblyItem.name}`);
    setCompleteDraftModal(false); setDraftToComplete(null);
  };

  // ---- Open Edit Draft Modal ----
  // Populates the same prod* state used by the Complete modal so the Edit modal
  // can reuse the consumption tree + lot source picker. Decides up-front whether
  // the saved lot # corresponds to an inheritable source (real or planned) or
  // to a custom value the user typed.
  const openEditDraft = (r) => {
    setEditingDraftId(r.id);
    setEditOriginalLot(r.lotNumber || "");
    setEditDraftForm({ id: r.id, assemblyId: r.assemblyId, assemblyName: r.assemblyName, qty: r.qtyProduced, plannedDate: r.plannedDate || r.date, lotNumber: r.lotNumber || "", notes: r.notes || "" });
    setProdAssembly(r.assemblyId);
    setProdQty(r.qtyProduced);
    setProdDate(r.plannedDate || r.date);
    setProdNotes(r.notes || "");
    setProdConsume(initConsume(r.assemblyId));

    // Decide initial state of the lot picker
    const lvl = getLevel(r.assemblyId);
    if (lvl <= 200) {
      // 200-level: direct text entry into prodLotNumber
      setProdLotNumber(r.lotNumber || "");
      setFreshLotNumber("");
    } else if (!r.lotNumber) {
      setProdLotNumber("");
      setFreshLotNumber("");
    } else {
      const lotSource = findLotSourceInBom(r.assemblyId, allItems);
      let inheritable = false;
      if (lotSource) {
        const realLot = lots.find(l => l.itemId === lotSource.id && l.lotNumber === r.lotNumber && l.qty > 0);
        const plannedDraft = prodRuns.find(p => p.status === "Draft" && p.id !== r.id && p.assemblyId === lotSource.id && p.lotNumber === r.lotNumber);
        inheritable = !!(realLot || plannedDraft);
      }
      if (inheritable) {
        setProdLotNumber(r.lotNumber);
        setFreshLotNumber("");
      } else {
        setProdLotNumber("__FRESH__");
        setFreshLotNumber(r.lotNumber);
      }
    }
    setEditDraftModal(true);
  };

  const closeEditDraft = () => {
    setEditDraftModal(false);
    setEditingDraftId(null);
    setEditOriginalLot("");
  };

  // Cascade-clear: when a draft's lot # is removed/changed, clear the same
  // lot # off any *other* Draft runs that were inheriting it — UNLESS a real
  // inventory lot with that number still exists.
  const cascadeClearDependentLots = async (oldLot, sourceRunId) => {
    if (!oldLot) return 0;
    const realLotExists = lots.some(l => l.lotNumber === oldLot && l.qty > 0);
    if (realLotExists) return 0;
    const dependents = prodRuns.filter(r => r.id !== sourceRunId && r.status === "Draft" && r.lotNumber === oldLot);
    if (dependents.length === 0) return 0;
    for (const dep of dependents) {
      try { await updateProductionRun(dep.id, { lotNumber: "" }); }
      catch (e) { console.warn("Cascade clear failed for", dep.id, e.message); }
    }
    setProdRuns(prev => prev.map(r => dependents.find(d => d.id === r.id) ? { ...r, lotNumber: "" } : r));
    setWeekDrafts(prev => prev.map(r => dependents.find(d => d.id === r.id) ? { ...r, lotNumber: "" } : r));
    return dependents.length;
  };

  // ---- Draft Edit Save ----
  const saveEditDraft = async () => {
    if (!editingDraftId) return;
    if (!prodAssemblyItem) { show("Select an assembly", "error"); return; }
    if (prodQty <= 0) { show("Qty must be > 0", "error"); return; }
    const lotNum = (prodLotNumber === "__FRESH__" ? freshLotNumber.trim() : (prodLotNumber || "").trim());
    try {
      await updateProductionRun(editingDraftId, {
        assemblyId: prodAssemblyItem.id, assemblyName: prodAssemblyItem.name,
        qtyProduced: prodQty, plannedDate: prodDate, lotNumber: lotNum, notes: prodNotes || "",
      });
      setProdRuns(prev => prev.map(r => r.id === editingDraftId ? {
        ...r, assemblyId: prodAssemblyItem.id, assemblyName: prodAssemblyItem.name,
        qtyProduced: prodQty, plannedDate: prodDate, lotNumber: lotNum, notes: prodNotes || "",
      } : r));
      // If the lot # changed from a previous value, clear dependents inheriting the OLD value
      if (editOriginalLot && editOriginalLot !== lotNum) {
        const cleared = await cascadeClearDependentLots(editOriginalLot, editingDraftId);
        if (cleared > 0) show(`Updated • cleared lot # on ${cleared} dependent draft${cleared === 1 ? "" : "s"}`);
        else show("Draft updated");
      } else {
        show("Draft updated");
      }
      // Refresh planning week drafts list
      const freshDrafts = await fetchDraftRunsForWeek(planWeekStart);
      setWeekDrafts(freshDrafts);
      // Bump global lot counter if a fresh number was assigned
      if (lotNum) await ensureCounterMatchesLot(lotNum);
      closeEditDraft();
    } catch (e) { show(e.message, "error"); }
  };

  // ---- Delete Draft ----
  const deleteDraft = async (run) => {
    if (!window.confirm(`Delete draft run ${run.id}?`)) return;
    try {
      await deleteProductionRuns([run.id]);
      setProdRuns(prev => prev.filter(r => r.id !== run.id));
      setWeekDrafts(prev => prev.filter(d => d.id !== run.id));
      // Cascade-clear dependents that were inheriting this lot #
      if (run.lotNumber) {
        const cleared = await cascadeClearDependentLots(run.lotNumber, run.id);
        if (cleared > 0) show(`Draft deleted • cleared lot # on ${cleared} dependent draft${cleared === 1 ? "" : "s"}`);
        else show("Draft deleted");
      } else {
        show("Draft deleted");
      }
    } catch (e) { show(e.message, "error"); }
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

  // ---- CSV IMPORT SYSTEM (3 workflows) ----
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
    notes: "notes",
    status: "status",
  };

  const BOM_ALIASES = {
    parent: "parent", parentsku: "parent", "parent sku": "parent", assembly: "parent", assemblyid: "parent", "assembly id": "parent", "parent id": "parent", parentid: "parent",
    component: "component", componentsku: "component", "component sku": "component", part: "component", partid: "component", "part id": "component", "component id": "component", child: "component", childsku: "component",
    qty: "qty", quantity: "qty", "qty per": "qty", qtyper: "qty", "qty per assembly": "qty", amount: "qty",
  };

  const QTY_ALIASES = {
    sku: "sku", id: "sku", productcode: "sku", "product code": "sku", itemid: "sku", "item id": "sku", partid: "sku",
    qty: "qty", quantity: "qty", "on hand": "qty", onhand: "qty", stock: "qty", count: "qty",
    batch: "batch", "batch #": "batch", batchnumber: "batch", "batch number": "batch", lot: "batch", "lot #": "batch", lotnumber: "batch", "lot number": "batch", lotno: "batch", batchno: "batch", batchorserialnumber: "batch", "batch or serial number": "batch",
    location: "location", loc: "location", bin: "location", warehouse: "location", "default location": "location", defaultlocation: "location",
  };

  const parseCSVLine = (line) => {
    const cols = [];
    let i = 0, inQuotes = false, field = "";
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
        else if (ch === '"') { inQuotes = false; i++; }
        else { field += ch; i++; }
      } else {
        if (ch === '"') { inQuotes = true; i++; }
        else if (ch === ',') { cols.push(field.trim()); field = ""; i++; }
        else { field += ch; i++; }
      }
    }
    cols.push(field.trim());
    return cols;
  };

  const parseCSVFile = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split("\n").filter((l) => l.trim());
        if (lines.length < 2) { show("CSV has no data rows", "error"); return; }
        const rawHeaders = parseCSVLine(lines[0]);
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length < 2 || cols.every(c => !c)) continue;
          const row = {};
          rawHeaders.forEach((h, idx) => { row[h] = cols[idx] || ""; });
          rows.push(row);
        }
        if (rows.length === 0) { show("No valid rows found", "error"); return; }
        callback({ headers: rawHeaders, rows, fileName: file.name });
      } catch { show("Failed to read CSV", "error"); }
    };
    reader.readAsText(file);
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    parseCSVFile(file, (data) => {
      setImportData(data);
      if (importTab === "items") {
        const autoMap = {};
        data.headers.forEach((h) => {
          const n = h.toLowerCase().trim();
          if (HEADER_ALIASES[n]) autoMap[h] = HEADER_ALIASES[n];
        });
        setImportMapping(autoMap);
      } else if (importTab === "bom") {
        const autoMap = { parent: "", component: "", qty: "" };
        data.headers.forEach((h) => {
          const n = h.toLowerCase().trim();
          if (BOM_ALIASES[n]) autoMap[BOM_ALIASES[n]] = h;
        });
        setBomColMap(autoMap);
      } else if (importTab === "qty") {
        const autoMap = { sku: "", qty: "", batch: "", location: "" };
        data.headers.forEach((h) => {
          const n = h.toLowerCase().trim();
          if (QTY_ALIASES[n]) autoMap[QTY_ALIASES[n]] = h;
        });
        setQtyColMap(autoMap);
      }
    });
    e.target.value = "";
  };

  const clearImportData = () => { setImportData(null); setImportMapping({}); setReplaceAllConfirm(false); };

  const switchImportTab = (t) => { setImportTab(t); clearImportData(); setImportMode(t === "items" ? "update_add" : t === "bom" ? "replace" : "update_listed"); };

  // ---- ITEM MASTER IMPORT ----
  const executeItemImport = async () => {
    if (!importData) return;
    const { rows } = importData;
    const mapping = importMapping;
    const idCol = Object.entries(mapping).find(([_, v]) => v === "id")?.[0];
    const nameCol = Object.entries(mapping).find(([_, v]) => v === "name")?.[0];
    if (!idCol || !nameCol) { show("ProductCode and Name must be mapped", "error"); return; }
    const newItems = [];
    const existingIds = new Set(allItems.map((i) => i.id));
    for (const row of rows) {
      const item = { id: "", name: "", category: "Raw Material", type: "Stock", costing: "FIFO", location: "", supplier: "", supplierCode: "", avgCost: 0, unit: "", minStock: 0, qty: 0, notes: "", status: "Active", lotTracking: false, piecesPerUnit: 0 };
      for (const [csvCol, appField] of Object.entries(mapping)) {
        if (!appField || appField === "skip") continue;
        const val = row[csvCol] || "";
        const fieldDef = APP_FIELDS.find((f) => f.key === appField);
        if (fieldDef?.numeric) { item[appField] = Number(val.replace(/[^0-9.\-]/g, "")) || 0; }
        else { item[appField] = val; }
      }
      if (!item.id || !item.name) continue;
      if (importMode === "add_only" && existingIds.has(item.id)) continue;
      // For update_add: if item exists, preserve qty and lotTracking from DB
      if (importMode === "update_add" && existingIds.has(item.id)) {
        const existing = allItems.find((i) => i.id === item.id);
        if (existing) { item.qty = existing.qty; item.lotTracking = existing.lotTracking; item.piecesPerUnit = existing.piecesPerUnit; }
      }
      newItems.push(item);
    }
    if (newItems.length === 0) { show(importMode === "add_only" ? "No new items (all IDs already exist)" : "No valid items found", "error"); return; }
    try {
      await bulkInsertItems(newItems);
      // Re-split into parts vs assemblies by reloading BOM
      const dbBom = await fetchBomLines();
      const assemblyIds = new Set(dbBom.map((b) => b.assemblyId));
      const updatedIds = new Set(newItems.map((i) => i.id));
      setParts((prev) => [...prev.filter((p) => !updatedIds.has(p.id)), ...newItems.filter((i) => !assemblyIds.has(i.id))]);
      setAssemblies((prev) => [...prev.filter((a) => !updatedIds.has(a.id)), ...newItems.filter((i) => assemblyIds.has(i.id)).map((a) => ({ ...a, bom: dbBom.filter((b) => b.assemblyId === a.id).map((b) => ({ partId: b.partId, qty: b.qty })) }))]);
      show(`Item Master: ${importMode === "add_only" ? "added" : "updated/added"} ${newItems.length} items`);
    } catch (e) { show(`Import failed: ${e.message}`, "error"); return; }
    setImportOpen(false); clearImportData();
  };

  // ---- BOM / ASSEMBLIES IMPORT ----
  const executeBomImport = async () => {
    if (!importData) return;
    const { rows } = importData;
    if (!bomColMap.parent || !bomColMap.component || !bomColMap.qty) { show("All 3 columns must be mapped: Parent, Component, Qty", "error"); return; }
    // Group by parent
    const byParent = {};
    for (const row of rows) {
      const parentId = (row[bomColMap.parent] || "").trim();
      const compId = (row[bomColMap.component] || "").trim();
      const qty = Number((row[bomColMap.qty] || "").replace(/[^0-9.\-]/g, "")) || 0;
      if (!parentId || !compId || qty <= 0) continue;
      if (!byParent[parentId]) byParent[parentId] = [];
      byParent[parentId].push({ partId: compId, qty });
    }
    const parentIds = Object.keys(byParent);
    if (parentIds.length === 0) { show("No valid BOM rows found", "error"); return; }
    // Validate all SKUs exist
    const allIds = new Set(allItems.map((i) => i.id));
    const missing = new Set();
    for (const pid of parentIds) {
      if (!allIds.has(pid)) missing.add(pid);
      for (const line of byParent[pid]) { if (!allIds.has(line.partId)) missing.add(line.partId); }
    }
    if (missing.size > 0) { show(`SKUs not found in Item Master: ${[...missing].slice(0, 5).join(", ")}${missing.size > 5 ? ` +${missing.size - 5} more` : ""}`, "error"); return; }
    try {
      let totalLines = 0;
      // Fetch current BOM for merge mode
      const currentBom = await fetchBomLines();
      for (const parentId of parentIds) {
        if (importMode === "replace") {
          await setBomForAssembly(parentId, byParent[parentId]);
        } else {
          // Merge: keep existing lines, add new component IDs
          const existingLines = currentBom.filter((b) => b.assemblyId === parentId);
          const existingCompIds = new Set(existingLines.map((l) => l.partId));
          const merged = [...existingLines.map((l) => ({ partId: l.partId, qty: l.qty }))];
          for (const newLine of byParent[parentId]) {
            if (existingCompIds.has(newLine.partId)) {
              const idx = merged.findIndex((m) => m.partId === newLine.partId);
              if (idx >= 0) merged[idx].qty = newLine.qty;
            } else { merged.push(newLine); }
          }
          await setBomForAssembly(parentId, merged);
        }
        totalLines += byParent[parentId].length;
      }
      // Reload BOM data and reclassify
      const freshBom = await fetchBomLines();
      const freshAssemblyIds = new Set(freshBom.map((b) => b.assemblyId));
      const allCurrent = [...parts, ...assemblies];
      setParts(allCurrent.filter((i) => !freshAssemblyIds.has(i.id)));
      setAssemblies(allCurrent.filter((i) => freshAssemblyIds.has(i.id)).map((a) => ({ ...a, bom: freshBom.filter((b) => b.assemblyId === a.id).map((b) => ({ partId: b.partId, qty: b.qty })) })));
      show(`BOM: ${importMode === "replace" ? "replaced" : "merged"} ${parentIds.length} assemblies, ${totalLines} lines`);
    } catch (e) { show(`BOM import failed: ${e.message}`, "error"); return; }
    setImportOpen(false); clearImportData();
  };

  // ---- INVENTORY QTY IMPORT ----
  const executeQtyImport = async () => {
    if (!importData) return;
    if (!qtyColMap.sku || !qtyColMap.qty) { show("SKU and Qty columns must be mapped", "error"); return; }
    if (importMode === "full_replace" && !replaceAllConfirm) { show("Please confirm the Full Replace checkbox", "error"); return; }
    const { rows } = importData;
    const lotRows = [];
    const allIds = new Set(allItems.map((i) => i.id));
    const unknownSkus = new Map(); // sku -> first row with name hints
    const touchedSkus = new Set();
    for (const row of rows) {
      const sku = (row[qtyColMap.sku] || "").trim();
      const qty = Number((row[qtyColMap.qty] || "").replace(/[^0-9.\-]/g, "")) || 0;
      const batch = qtyColMap.batch ? (row[qtyColMap.batch] || "").trim() : "";
      const loc = qtyColMap.location ? (row[qtyColMap.location] || "").trim() : "";
      if (!sku) continue;
      if (!allIds.has(sku)) {
        if (!unknownSkus.has(sku)) unknownSkus.set(sku, row);
      }
      touchedSkus.add(sku);
      lotRows.push({ itemId: sku, lotNumber: batch, qty, location: loc });
    }
    if (touchedSkus.size === 0) { show("No valid SKUs found in CSV", "error"); return; }

    // Auto-create unknown SKUs in item master
    if (unknownSkus.size > 0) {
      const newItems = [];
      for (const [sku, row] of unknownSkus) {
        // Try to get a name from a "Name" or "Description" column if present
        const nameCol = importData.headers.find(h => /^(name|description|item.?name|part.?name)$/i.test(h.trim()));
        const name = nameCol ? (row[nameCol] || "").trim() : "";
        newItems.push({
          id: sku, name: name || sku, category: "Raw Material", type: "Stock", costing: "FIFO",
          location: "", supplier: "", supplierCode: "", avgCost: 0, unit: "", minStock: 0, qty: 0,
          notes: "Auto-created from inventory CSV import", status: "Active", lotTracking: false, piecesPerUnit: 0,
        });
      }
      try {
        await bulkInsertItems(newItems);
        // Add to local state
        setParts((prev) => [...prev, ...newItems]);
        show(`Auto-created ${newItems.length} new SKU(s) in Item Master`, "success");
      } catch (e) { show(`Warning: failed to auto-create some SKUs: ${e.message}`, "error"); }
    }

    try {
      if (importMode === "full_replace") {
        await zeroAllInventory();
        setParts((prev) => prev.map((p) => ({ ...p, qty: 0 })));
        setAssemblies((prev) => prev.map((a) => ({ ...a, qty: 0 })));
        setLots([]);
      }

      // Split: lot-tracked items get lot records, others just get qty/location updated
      const lotTrackedIds = new Set(allItems.filter(i => i.lotTracking).map(i => i.id));
      const rawRows = lotRows.filter(r => !lotTrackedIds.has(r.itemId));
      const asmRows = lotRows.filter(r => lotTrackedIds.has(r.itemId));

      // Aggregate raw material qtys and locations per SKU
      const rawQtys = {};
      const rawLocs = {};
      for (const r of rawRows) {
        rawQtys[r.itemId] = (rawQtys[r.itemId] || 0) + r.qty;
        if (r.location) {
          if (!rawLocs[r.itemId]) rawLocs[r.itemId] = new Set();
          rawLocs[r.itemId].add(r.location);
        }
      }
      // Update raw material item qtys and locations directly (no lots)
      const rawUpdates = Object.entries(rawQtys).map(([id, qty]) => ({ id, qty }));
      for (const u of rawUpdates) {
        await updateItemQty(u.id, u.qty);
        const locs = rawLocs[u.id];
        if (locs) {
          const loc = locs.size === 1 ? [...locs][0] : "Multiple";
          await supabase.from("items").update({ location: loc }).eq("id", u.id);
        }
      }

      // Assembly-level items (200+) get lot records
      if (asmRows.length > 0) {
        const asmSkus = [...new Set(asmRows.map(r => r.itemId))];
        await bulkUpdateItemQtys(asmRows, asmSkus);
      }

      // Update local state
      const qtyBySku = {};
      const locsBySku = {};
      for (const r of lotRows) {
        qtyBySku[r.itemId] = (qtyBySku[r.itemId] || 0) + r.qty;
        if (r.location) {
          if (!locsBySku[r.itemId]) locsBySku[r.itemId] = new Set();
          locsBySku[r.itemId].add(r.location);
        }
      }
      const getNewLoc = (id, oldLoc) => {
        const locs = locsBySku[id];
        if (!locs) return oldLoc;
        return locs.size === 1 ? [...locs][0] : "Multiple";
      };
      setParts((prev) => prev.map((p) => qtyBySku[p.id] !== undefined ? { ...p, qty: qtyBySku[p.id], location: getNewLoc(p.id, p.location) } : p));
      setAssemblies((prev) => prev.map((a) => qtyBySku[a.id] !== undefined ? { ...a, qty: qtyBySku[a.id], location: getNewLoc(a.id, a.location) } : a));
      fetchInventoryLots().then((r) => setLots(r)).catch(() => {});
      show(`Inventory: ${importMode === "full_replace" ? "replaced all" : "updated"} ${touchedSkus.size} SKUs`);
    } catch (e) { show(`Qty import failed: ${e.message}`, "error"); return; }
    setImportOpen(false); clearImportData();
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
              <div style={{ fontSize: 48, marginBottom: 4 }}>🧞</div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Ops Genie</h1>
              <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>Your wish is my command</p>
              <p style={{ margin: "8px 0 0", color: "#555", fontSize: 10, fontFamily: "monospace" }}>v97</p>
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
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={26} style={{ color: "#fbbf24" }} />
            <span style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{appName}</span>
          </h1>
          <p style={{ margin: "2px 0 0", color: "#555", fontSize: 12 }}>Powered by Ops Genie</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {/* Golden Lamps */}
          <div style={{ display: "flex", gap: 2, alignItems: "center", marginRight: 4 }}>
            {[0, 1, 2].map(i => (
              <GoldenLamp key={i} active={i >= wishesUsed} onClick={() => { setWishText(""); setWishModal(true); }} size={26} />
            ))}
            <span style={{ fontSize: 10, color: "#b8860b", marginLeft: 4 }}>{Math.max(0, MAX_WISHES - wishesUsed)} wish{MAX_WISHES - wishesUsed !== 1 ? "es" : ""}</span>
          </div>
          <div style={{ height: 20, width: 1, background: "#333", margin: "0 4px" }} />
          <button onClick={() => { setImportOpen(true); setImportTab("items"); clearImportData(); setImportMode("update_add"); }} style={B2}><Upload size={14} /> Import Data</button>
          <button onClick={exportCSV} style={B2}><Download size={14} /> Export</button>
          <div style={{ height: 20, width: 1, background: "#333", margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#888", textAlign: "right" }}>
              <div style={{ color: "#ccc", fontWeight: 500 }}>{profile?.name || profile?.email}</div>
              <div style={{ fontSize: 10, color: isAdmin ? "#f59e0b" : "#666" }}>{isAdmin ? "Admin" : "User"}</div>
            </div>
            <button onClick={() => { setNewPw(""); setNewPwConfirm(""); setPwModal(true); }} style={{ ...B2, padding: "6px 8px" }} title="Change Password"><KeyRound size={14} /></button>
            <button onClick={handleLogout} style={{ ...B2, padding: "6px 8px", borderColor: "#ef444444", color: "#ef4444" }} title="Log Out"><LogOut size={14} /></button>
          </div>
        </div>
      </div>

      {/* Stats (hidden on dashboard) */}
      {tab !== "dashboard" && <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <Stat icon={<Package size={18} />} label="Total SKUs" value={stats.total} accent="#6366f1" />
        <Stat icon={<AlertTriangle size={18} />} label="Low Stock" value={stats.low} accent={stats.low > 0 ? "#ef4444" : "#22c55e"} />
        <Stat icon={<span style={{ fontSize: 18 }}>&#129791;</span>} label="Total Dumplings" value={stats.totalPcs.toLocaleString()} accent="#f59e0b" />
        <Stat icon={<ShoppingCart size={18} />} label="Open Orders" value={orderStats.pending} accent="#ec4899" />
      </div>}

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("dashboard", "Dashboard", <LayoutDashboard size={14} />)}
        {tabBtn("inventory", "Inventory", <Package size={14} />)}
        {tabBtn("items", "Item Master", <Layers size={14} />)}
        {tabBtn("orders", "Orders", <ShoppingCart size={14} />)}
        {tabBtn("vendors", "Vendors", <Building2 size={14} />)}
        {tabBtn("mrp", "Purchase Needs", <ClipboardList size={14} />)}
        {tabBtn("pos", "Purchase Orders", <FileText size={14} />)}
        {tabBtn("receiving", "Receiving", <PackageCheck size={14} />)}
        {tabBtn("production", "Production", <Hammer size={14} />)}
        {tabBtn("planning", "Planning", <TrendingUp size={14} />)}
        {tabBtn("log", "Transaction Log", <ScrollText size={14} />)}
        {isAdmin && tabBtn("admin", "Admin Config", <Settings size={14} />)}
      </div>

      {/* Filters (hidden on dashboard) */}
      {tab !== "dashboard" && <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
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
        {tab === "production" && <button onClick={() => { setProdAssembly(""); setProdQty(1); setProdNotes(""); setProdConsume({}); setProdLotNumber(""); setFreshLotNumber(""); setProdDate(fmtDate(new Date())); setProdModal(true); }} style={B1}><Hammer size={14} /> Manual Production Entry</button>}
      </div>}

      {/* ================== DASHBOARD ================== */}
      {tab === "dashboard" && (() => {
        const todayDisplay = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        const isStale = dailyNote.updatedAt && dailyNote.updatedAt.slice(0, 10) !== todayStr;

        // Group shipments by customer+shipDate
        const shipSource = dashView === "daily" ? todaysShipments : weekShipments;
        const shipGroups = {};
        for (const o of shipSource) {
          const key = `${o.customer}|||${o.shipDate}`;
          if (!shipGroups[key]) shipGroups[key] = { customer: o.customer, shipDate: o.shipDate, lines: [] };
          shipGroups[key].lines.push(o);
        }
        const shipGroupArr = Object.values(shipGroups);

        // Pieces calculator
        const calcPieces = (productLine, batches) => {
          const batchItem = allItems.find(i => i.id === `250-${productLine} Batch`);
          return batchItem && batchItem.piecesPerUnit > 0 ? Math.round(batches * batchItem.piecesPerUnit) : 0;
        };

        // Calculate dumplings per unit for any item by walking BOM tree
        const _dpCache = {};
        const dumplingsPer = (itemId) => {
          if (_dpCache[itemId] !== undefined) return _dpCache[itemId];
          const item = gi(itemId);
          if (!item) return (_dpCache[itemId] = 0);
          if (item.piecesPerUnit > 0) return (_dpCache[itemId] = item.piecesPerUnit);
          if (!item.bom || item.bom.length === 0) return (_dpCache[itemId] = 0);
          let total = 0;
          for (const b of item.bom) total += b.qty * dumplingsPer(b.partId);
          return (_dpCache[itemId] = total);
        };

        // Flavor breakdown: on-order vs in-inventory dumplings
        const flavorBreakdown = productLines.map(pl => {
          // On order (pending + confirmed)
          const onOrderItems = orders.filter(o => {
            if (o.status !== "Pending" && o.status !== "Confirmed") return false;
            const m = o.item.match(/^\d+-(\w+)/);
            return m && m[1] === pl;
          });
          const onOrderPcs = onOrderItems.reduce((s, o) => s + o.qty * dumplingsPer(o.item), 0);

          // In inventory: all items with this product line that have dumplings
          const invPcs = allItems.filter(i => {
            const m = i.id.match(/^\d+-(\w+)/);
            return m && m[1] === pl && i.qty > 0 && dumplingsPer(i.id) > 0;
          }).reduce((s, i) => s + i.qty * dumplingsPer(i.id), 0);

          return { pl, onOrderPcs: Math.round(onOrderPcs), invPcs: Math.round(invPcs) };
        }).filter(fb => fb.onOrderPcs > 0 || fb.invPcs > 0);

        // Tomorrow's shipments
        const tomorrowStr = addDays(todayStr, 1);
        const tomorrowShipments = orders.filter(o => o.shipDate === tomorrowStr);
        const todayShipPcs = todaysShipments.reduce((s, o) => s + o.qty * dumplingsPer(o.item), 0);
        const tomorrowShipPcs = tomorrowShipments.reduce((s, o) => s + o.qty * dumplingsPer(o.item), 0);
        const todayShipGroups = {};
        for (const o of todaysShipments) {
          const key = `${o.customer}|||${o.shipDate}`;
          if (!todayShipGroups[key]) todayShipGroups[key] = { customer: o.customer, shipDate: o.shipDate, lines: [] };
          todayShipGroups[key].lines.push(o);
        }
        const todayShipGroupArr = Object.values(todayShipGroups);
        const tomorrowShipGroups = {};
        for (const o of tomorrowShipments) {
          const key = `${o.customer}|||${o.shipDate}`;
          if (!tomorrowShipGroups[key]) tomorrowShipGroups[key] = { customer: o.customer, shipDate: o.shipDate, lines: [] };
          tomorrowShipGroups[key].lines.push(o);
        }
        const tomorrowShipGroupArr = Object.values(tomorrowShipGroups);

        // Actual production logged today/week (completed runs)
        const todayCompletedRuns = prodRuns.filter(r => (r.status || "Complete") === "Complete" && r.date === todayStr);
        const actualByLine = {};
        for (const r of todayCompletedRuns) {
          const m = r.assemblyId.match(/^\d+-(\w+)/);
          if (m) actualByLine[m[1]] = (actualByLine[m[1]] || 0) + r.qtyProduced;
        }

        // Forecast data from draft runs
        const forecastRows = dashView === "daily"
          ? todaysForecast
          : Object.entries(weekForecast.byLine).sort().map(([pl, d]) => ({ productLine: pl, plannedQty: d.planned, actualQty: d.actual }));
        const totalBatches = dashView === "daily" ? todaysForecast.reduce((s, fd) => s + fd.plannedQty, 0) : Object.values(weekForecast.byLine).reduce((s, v) => s + v.planned, 0);
        const totalPieces = forecastRows.reduce((s, fd) => s + calcPieces(fd.productLine, fd.plannedQty), 0);

        return (
          <div>
            {/* Header + Toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "#e0e0e0" }}>{todayDisplay}</h2>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setDashView("daily")} style={{ ...B2, background: dashView === "daily" ? "#6366f1" : "#2a2a3a", color: dashView === "daily" ? "#fff" : "#ccc", borderColor: dashView === "daily" ? "#6366f1" : "#333", fontSize: 12, padding: "6px 14px" }}>Daily</button>
                <button onClick={() => setDashView("weekly")} style={{ ...B2, background: dashView === "weekly" ? "#6366f1" : "#2a2a3a", color: dashView === "weekly" ? "#fff" : "#ccc", borderColor: dashView === "weekly" ? "#6366f1" : "#333", fontSize: 12, padding: "6px 14px" }}>Weekly</button>
              </div>
            </div>

            {/* Manager's Note */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: isStale ? "1px solid #f59e0b33" : "1px solid #2a2a3a", padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {"Manager's Note"}
                  {isStale && <span style={{ marginLeft: 8, color: "#f59e0b", fontSize: 10, fontWeight: 400 }}>(stale)</span>}
                </div>
                {dailyNote.updatedAt && (
                  <span style={{ fontSize: 10, color: "#555" }}>
                    Updated {new Date(dailyNote.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {dailyNote.updatedBy && ` by ${dailyNote.updatedBy}`}
                  </span>
                )}
              </div>
              {editingNote ? (
                <div>
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} style={{ ...IS, resize: "vertical", fontSize: 14, lineHeight: 1.6 }} autoFocus />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                    <button onClick={() => setEditingNote(false)} style={B2}>Cancel</button>
                    <button onClick={async () => {
                      const note = { text: noteText, updatedAt: new Date().toISOString(), updatedBy: profile?.name || profile?.email || "" };
                      setDailyNote(note);
                      try { await saveConfig("daily_note", note); show("Note saved"); } catch (e) { show(e.message, "error"); }
                      setEditingNote(false);
                    }} style={B1}><Check size={14} /> Save</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => { if (isAdmin) { setNoteText(dailyNote.text || ""); setEditingNote(true); } }} style={{ fontSize: 14, color: "#d0d0d0", lineHeight: 1.6, whiteSpace: "pre-wrap", cursor: isAdmin ? "pointer" : "default", minHeight: 20 }}>
                  {dailyNote.text || (isAdmin ? <span style={{ color: "#555", fontStyle: "italic" }}>Click to add a note...</span> : <span style={{ color: "#555", fontStyle: "italic" }}>No note set.</span>)}
                </div>
              )}
            </div>

            {/* Summary Stats */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <Stat icon={<Hammer size={18} />} label={dashView === "daily" ? "Batches Planned" : "Week Batches"} value={totalBatches} accent="#8b5cf6" />
              <Stat icon={<span style={{ fontSize: 18 }}>&#129791;</span>} label="Expected Pieces" value={totalPieces > 0 ? totalPieces.toLocaleString() : "\u2014"} accent="#f59e0b" />
              <Stat icon={<PackageCheck size={18} />} label={dashView === "daily" ? "Shipments Today" : "Shipments This Week"} value={dashView === "daily" ? todayShipGroupArr.length : shipGroupArr.length} accent="#22c55e" />
              {todaysBlockers.length > 0 && <Stat icon={<AlertTriangle size={18} />} label="Blockers" value={todaysBlockers.length} accent="#ef4444" />}
            </div>

            {/* Dumplings by Flavor */}
            {flavorBreakdown.length > 0 && (
              <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Dumplings by Flavor</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={TH}>Flavor</th>
                    <th style={{ ...TH, textAlign: "center" }}>On Order</th>
                    <th style={{ ...TH, textAlign: "center" }}>In Inventory</th>
                    <th style={{ ...TH, textAlign: "center" }}>Difference</th>
                  </tr></thead>
                  <tbody>
                    {flavorBreakdown.map(fb => {
                      const diff = fb.invPcs - fb.onOrderPcs;
                      return (
                        <tr key={fb.pl}>
                          <td style={{ ...TD, fontWeight: 600, color: "#e0e0e0" }}>{fb.pl}</td>
                          <td style={{ ...TD, textAlign: "center", color: "#f59e0b" }}>{fb.onOrderPcs.toLocaleString()}</td>
                          <td style={{ ...TD, textAlign: "center", color: "#22c55e" }}>{fb.invPcs.toLocaleString()}</td>
                          <td style={{ ...TD, textAlign: "center", fontWeight: 600, color: diff >= 0 ? "#22c55e" : "#ef4444" }}>{diff >= 0 ? "+" : ""}{diff.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Production Plan Table */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>
                {dashView === "daily" ? "Today's Production Plan" : "This Week's Production Plan"}
              </div>
              {forecastRows.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: 13 }}>No production planned. Set up in the Planning tab.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={TH}>Product Line</th>
                    <th style={{ ...TH, textAlign: "center" }}>Planned</th>
                    <th style={{ ...TH, textAlign: "center" }}>Actual</th>
                    <th style={{ ...TH, textAlign: "center" }}>Expected Pcs</th>
                  </tr></thead>
                  <tbody>
                    {forecastRows.map(fd => {
                      const actual = dashView === "daily" ? (actualByLine[fd.productLine] || 0) : (fd.actualQty || 0);
                      const pcs = calcPieces(fd.productLine, fd.plannedQty);
                      return (
                        <tr key={fd.productLine}>
                          <td style={{ ...TD, fontWeight: 600, color: "#e0e0e0" }}>{fd.productLine}</td>
                          <td style={{ ...TD, textAlign: "center", fontWeight: 600 }}>{fd.plannedQty}</td>
                          <td style={{ ...TD, textAlign: "center", color: actual >= fd.plannedQty ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>{actual}</td>
                          <td style={{ ...TD, textAlign: "center", color: "#888" }}>{pcs > 0 ? pcs.toLocaleString() : "\u2014"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Shipments */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", marginBottom: 16 }}>
              {dashView === "daily" ? (<>
                {/* Today */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{"Today's Shipments"}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>
                    {todayShipGroupArr.length} order{todayShipGroupArr.length !== 1 ? "s" : ""}
                    {todayShipPcs > 0 && <span style={{ marginLeft: 6, color: "#f59e0b" }}>{Math.round(todayShipPcs).toLocaleString()} pcs</span>}
                  </span>
                </div>
                {todayShipGroupArr.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "#555", fontSize: 13, borderBottom: "1px solid #2a2a3a" }}>No shipments today.</div>
                ) : (
                  <div style={{ borderBottom: "1px solid #2a2a3a" }}>
                    {todayShipGroupArr.map((sg, i) => {
                      const allDone = sg.lines.every(o => o.status === "Fulfilled" || o.status === "Cancelled");
                      return (
                        <div key={i} style={{ padding: "10px 16px", borderBottom: i < todayShipGroupArr.length - 1 ? "1px solid #1a1a2a" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14 }}>{sg.customer}</div>
                            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                              {sg.lines.map(o => { const it = gi(o.item); return `${o.qty}x ${it?.name || o.item}`; }).join(", ")}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {allDone ? (
                              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Shipped</span>
                            ) : (
                              <button onClick={() => shipAllLines(sg.lines)} style={{ ...B1, padding: "6px 14px", background: "#22c55e", fontSize: 12 }}>
                                <PackageCheck size={13} /> Ship All
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Tomorrow */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a3a", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1a1a28" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{"Tomorrow's Shipments"}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>
                    {tomorrowShipGroupArr.length} order{tomorrowShipGroupArr.length !== 1 ? "s" : ""}
                    {tomorrowShipPcs > 0 && <span style={{ marginLeft: 6, color: "#f59e0b" }}>{Math.round(tomorrowShipPcs).toLocaleString()} pcs</span>}
                  </span>
                </div>
                {tomorrowShipGroupArr.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "#555", fontSize: 13 }}>No shipments tomorrow.</div>
                ) : (
                  <div>
                    {tomorrowShipGroupArr.map((sg, i) => {
                      const allDone = sg.lines.every(o => o.status === "Fulfilled" || o.status === "Cancelled");
                      return (
                        <div key={i} style={{ padding: "10px 16px", borderBottom: i < tomorrowShipGroupArr.length - 1 ? "1px solid #1a1a2a" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14 }}>{sg.customer}</div>
                            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                              {sg.lines.map(o => { const it = gi(o.item); return `${o.qty}x ${it?.name || o.item}`; }).join(", ")}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {allDone ? (
                              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Shipped</span>
                            ) : (
                              <span style={{ fontSize: 11, color: "#888" }}>Upcoming</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>) : (<>
                {/* Weekly view */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>
                  {"This Week's Shipments"}
                  {shipGroupArr.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>({shipGroupArr.length} order{shipGroupArr.length !== 1 ? "s" : ""})</span>}
                </div>
                {shipGroupArr.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: 13 }}>No shipments this week.</div>
                ) : (
                  <div>
                    {shipGroupArr.map((sg, i) => {
                      const allDone = sg.lines.every(o => o.status === "Fulfilled" || o.status === "Cancelled");
                      return (
                        <div key={i} style={{ padding: "10px 16px", borderBottom: i < shipGroupArr.length - 1 ? "1px solid #1a1a2a" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14 }}>{sg.customer}</div>
                            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                              {sg.lines.map(o => { const it = gi(o.item); return `${o.qty}x ${it?.name || o.item}`; }).join(", ")}
                            </div>
                            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Ship: {sg.shipDate}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {allDone ? (
                              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Shipped</span>
                            ) : (
                              <button onClick={() => shipAllLines(sg.lines)} style={{ ...B1, padding: "6px 14px", background: "#22c55e", fontSize: 12 }}>
                                <PackageCheck size={13} /> Ship All
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>)}
            </div>

            {/* Runway (weekly only) */}
            {dashView === "weekly" && runwayData.length > 0 && (
              <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Inventory Runway</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {runwayData.map(r => {
                    const color = r.weeksLeft === Infinity ? "#6366f1" : r.weeksLeft < 1 ? "#ef4444" : r.weeksLeft < 2 ? "#f59e0b" : r.weeksLeft < 4 ? "#22c55e" : "#6366f1";
                    return (
                      <div key={r.productLine} style={{ flex: "1 1 120px", padding: "14px 18px", borderRight: "1px solid #2a2a3a", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{r.productLine}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color }}>{r.weeksLeft === Infinity ? "\u221E" : r.weeksLeft.toFixed(1)}</div>
                        <div style={{ fontSize: 10, color: "#666" }}>weeks</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Production Blockers (collapsible) */}
            {todaysBlockers.length > 0 && (
              <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #ef444433", overflow: "hidden" }}>
                <div onClick={() => setBlockersOpen(o => !o)} style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {blockersOpen ? <ChevronDown size={14} style={{ color: "#888" }} /> : <ChevronRight size={14} style={{ color: "#888" }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>
                      <AlertTriangle size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
                      Production Blockers
                    </span>
                  </div>
                  <span style={{ background: "#ef444422", color: "#ef4444", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{todaysBlockers.length}</span>
                </div>
                {blockersOpen && (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={TH}>Material</th>
                      <th style={{ ...TH, textAlign: "center" }}>Needed</th>
                      <th style={{ ...TH, textAlign: "center" }}>On Hand</th>
                      <th style={{ ...TH, textAlign: "center" }}>Short</th>
                    </tr></thead>
                    <tbody>
                      {todaysBlockers.map(b => (
                        <tr key={b.id}>
                          <td style={{ ...TD, fontWeight: 500 }}>{b.name}</td>
                          <td style={{ ...TD, textAlign: "center" }}>{b.needed} {b.unit}</td>
                          <td style={{ ...TD, textAlign: "center", color: "#f59e0b" }}>{b.onHand} {b.unit}</td>
                          <td style={{ ...TD, textAlign: "center", color: "#ef4444", fontWeight: 600 }}>{b.shortfall} {b.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
                    const itemLots = p.lotTracking ? (lotsByItem[p.id] || []).filter(l => l.qty > 0) : [];
                    const hasDetail = hasBom || itemLots.length > 0;
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ background: low ? "rgba(239,68,68,0.06)" : "transparent" }}>
                          <td style={TD}>{hasDetail && <button onClick={() => tog(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 2 }}>{expanded[p.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}</td>
                          <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: LEVELS[lvl]?.color || "#888" }}>{p.id}</td>
                          <td style={{ ...TD, fontWeight: 500 }}>{p.name}{low && <AlertTriangle size={13} style={{ color: "#f59e0b", verticalAlign: "middle", marginLeft: 4 }} />}</td>
                          <td style={TD}><LevelBadge level={lvl} levels={LEVELS} /></td>
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
                          <td style={{ ...TD, fontSize: 12 }}>
                            {hasAlternates(p.id)
                              ? <span style={{ color: "#a78bfa", fontWeight: 500 }} title={`${(itemVendorsByItem.get(p.id)?.length || 0) + 1} vendors — click row to view`}>Multiple</span>
                              : p.supplier}
                          </td>
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
                                    <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Location</th>
                                    <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Production Date</th>
                                  </tr></thead>
                                  <tbody>{itemLots.map((l, li) => (
                                    <tr key={l.lotNumber + "-" + li}>
                                      <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, padding: "4px 12px", color: l.lotNumber ? "#a78bfa" : "#555" }}>{l.lotNumber || "\u2014"}</td>
                                      <td style={{ ...TD, fontWeight: 600, fontSize: 12, padding: "4px 12px", color: "#22c55e" }}>{l.qty}</td>
                                      <td style={{ ...TD, fontSize: 12, padding: "4px 12px", color: l.location ? "#38bdf8" : "#555" }}>{l.location || "\u2014"}</td>
                                      <td style={{ ...TD, fontSize: 12, padding: "4px 12px", color: "#888" }}>{l.productionDate || "\u2014"}</td>
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
                          <td style={TD}><LevelBadge level={lvl} levels={LEVELS} /></td>
                          <td style={{ ...TD, fontSize: 12, color: "#999" }}>{p.category}</td>
                          <td style={{ ...TD, fontSize: 11, color: "#888" }}>{p.costing}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#999" }}>{p.unit}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{p.avgCost > 0 ? `$${p.avgCost.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 12, color: "#f59e0b" }}>{bc !== null ? `$${bc.toFixed(2)}` : ""}</td>
                          <td style={{ ...TD, fontSize: 12 }}>
                            {hasAlternates(p.id)
                              ? <span style={{ color: "#a78bfa", fontWeight: 500 }} title={`${(itemVendorsByItem.get(p.id)?.length || 0) + 1} vendors — click row to view`}>Multiple</span>
                              : p.supplier}
                          </td>
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
            {orderStats.totalRevenue > 0 && <Stat icon={<DollarSign size={18} />} label="Total Revenue" value={`$${orderStats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent="#22c55e" />}
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
                const groupOrderType = group.orderType || "";
                const orderTotal = group.lines.reduce((s, o) => s + (o.qty * getUnitPrice(groupOrderType, o.item)), 0);

                return (
                  <div key={gKey} style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
                    <div onClick={() => tog(gKey)} style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {isExp ? <ChevronDown size={16} style={{ color: "#888" }} /> : <ChevronRight size={16} style={{ color: "#888" }} />}
                        <div>
                          <input
                            type="text"
                            defaultValue={group.customer}
                            onClick={e => e.stopPropagation()}
                            onBlur={async (e) => {
                              e.target.style.borderColor = "transparent"; e.target.style.background = "transparent";
                              const nv = e.target.value.trim();
                              if (!nv || nv === group.customer) { e.target.value = group.customer; return; }
                              const updated = group.lines.map(o => ({ ...o, customer: nv }));
                              setOrders(prev => prev.map(o => { const m = updated.find(u => u.id === o.id); return m || o; }));
                              for (const o of updated) { try { await upsertOrder(o); } catch (err) { console.warn(err); } }
                              show(`Renamed to ${nv}`);
                            }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                            style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 15, background: "transparent", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", outline: "none", width: "100%", maxWidth: 300, cursor: "text" }}
                            onFocus={e => { e.target.style.borderColor = "#6366f144"; e.target.style.background = "#16161e"; }}
                            onMouseLeave={e => { if (document.activeElement !== e.target) { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; } }}
                            onMouseEnter={e => { if (document.activeElement !== e.target) { e.target.style.borderColor = "#333"; } }}
                          />
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                            {group.date} • {group.lines.length} line{group.lines.length > 1 ? "s" : ""} • {totalItems} total units
                            {orderTotal > 0 && <span style={{ marginLeft: 8, color: "#22c55e", fontWeight: 600 }}>${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                            {notes && <span style={{ marginLeft: 8, color: "#666" }}>— {notes.slice(0, 60)}{notes.length > 60 ? "..." : ""}</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: "#666" }}>Ship:</span>
                            <input type="date" value={group.lines[0]?.shipDate || ""} onClick={e => e.stopPropagation()} onChange={async (e) => {
                              e.stopPropagation();
                              const nd = e.target.value || null;
                              const updated = group.lines.map(o => ({ ...o, shipDate: nd }));
                              setOrders(prev => prev.map(o => { const m = updated.find(u => u.id === o.id); return m || o; }));
                              let saveErr = null;
                              for (const o of updated) { try { await upsertOrder(o); } catch (err) { saveErr = err; console.warn(err); } }
                              if (saveErr) show("Ship date save failed — run: ALTER TABLE orders ADD COLUMN ship_date DATE;", "error");
                              else show(nd ? `Ship date set to ${nd}` : "Ship date cleared");
                            }} style={{ ...IS, width: "auto", padding: "2px 6px", fontSize: 11, background: "#16161e" }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <select value={groupOrderType} onClick={e => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); setGroupOrderType(group, e.target.value); }} style={{ ...IS, width: "auto", padding: "4px 8px", fontSize: 12, background: groupOrderType ? "#6366f111" : "#1a1a2a", color: groupOrderType ? "#a78bfa" : "#888", borderColor: groupOrderType ? "#6366f144" : "#333" }}>
                          <option value="">Type...</option>
                          {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={statuses.length === 1 ? statuses[0] : ""} onClick={e => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); setGroupStatus(group, e.target.value); }} style={{ ...IS, width: "auto", padding: "4px 8px", fontSize: 12, background: statuses.length === 1 ? sC(statuses[0]) + "11" : "#1a1a2a", color: statuses.length === 1 ? sC(statuses[0]) : "#888", borderColor: statuses.length === 1 ? sC(statuses[0]) + "44" : "#333" }}>
                          {statuses.length > 1 && <option value="">Mixed...</option>}
                          {ORD_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                        <button onClick={(e) => { e.stopPropagation(); addLinesToOrder(group); }} style={{ ...B2, padding: "5px 12px", fontSize: 12, borderColor: "#6366f144", color: "#6366f1" }}>
                          <Plus size={12} /> Add Line
                        </button>
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
                            {["Order ID", "Item", "Qty", "Unit Price", "Line Total", "Status", "Notes", ""].map(h => <th key={h} style={TH}>{h}</th>)}
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
                                  <td style={{ ...TD, fontSize: 13, color: "#888" }}>{(() => { const up = getUnitPrice(groupOrderType, o.item); return up > 0 ? `$${up.toFixed(2)}` : "—"; })()}</td>
                                  <td style={{ ...TD, fontSize: 13, fontWeight: 600, color: "#22c55e" }}>{(() => { const up = getUnitPrice(groupOrderType, o.item); const lt = o.qty * up; return lt > 0 ? `$${lt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"; })()}</td>
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
      {tab === "production" && (() => {
        const draftCount = prodRuns.filter(r => (r.status || "Complete") === "Draft").length;
        const completeCount = prodRuns.filter(r => (r.status || "Complete") === "Complete").length;
        const filteredRuns = prodStatusFilter === "All" ? prodRuns
          : prodRuns.filter(r => (r.status || "Complete") === prodStatusFilter);
        const isDraft = (r) => (r.status || "Complete") === "Draft";

        return (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <Stat icon={<Hammer size={18} />} label="Total Runs" value={prodRuns.length} accent="#8b5cf6" />
              <Stat icon={<ClipboardList size={18} />} label="Draft" value={draftCount} accent="#f59e0b" />
              <Stat icon={<CheckCircle size={18} />} label="Complete" value={completeCount} accent="#22c55e" />
            </div>

            {/* Status filter */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {["All", "Draft", "Complete"].map(s => (
                <button key={s} onClick={() => setProdStatusFilter(s)}
                  style={{ ...B2, background: prodStatusFilter === s ? "#6366f1" : "#2a2a3a", color: prodStatusFilter === s ? "#fff" : "#ccc", borderColor: prodStatusFilter === s ? "#6366f1" : "#333", fontSize: 12, padding: "6px 14px" }}>
                  {s}{s === "Draft" ? ` (${draftCount})` : s === "Complete" ? ` (${completeCount})` : ""}
                </button>
              ))}
            </div>

            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Production Log</div>
              {filteredRuns.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#555" }}>
                  <Hammer size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p style={{ margin: 0 }}>No {prodStatusFilter !== "All" ? prodStatusFilter.toLowerCase() + " " : ""}production runs found.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                    <thead><tr>
                      {["Run ID", "Status", "Planned", "Date", "Assembly", "Lot #", "Qty", "Consumed", "Actions"].map(h => <th key={h} style={TH}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {filteredRuns.map(r => {
                        const isExp = expanded[`prod-${r.id}`];
                        const draft = isDraft(r);
                        return (
                          <React.Fragment key={r.id}>
                            <tr style={{ background: draft ? "#1a1a10" : undefined }}>
                              <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#8b5cf6", cursor: "pointer" }} onClick={() => tog(`prod-${r.id}`)}>
                                {isExp ? <ChevronDown size={12} style={{ marginRight: 4 }} /> : <ChevronRight size={12} style={{ marginRight: 4 }} />}
                                {r.id}
                              </td>
                              <td style={TD}>
                                <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                                  background: draft ? "#f59e0b22" : "#22c55e22", color: draft ? "#f59e0b" : "#22c55e",
                                  border: `1px solid ${draft ? "#f59e0b44" : "#22c55e44"}` }}>
                                  {draft ? "Draft" : "Complete"}
                                </span>
                              </td>
                              <td style={{ ...TD, fontSize: 12, color: "#888" }}>{r.plannedDate || "—"}</td>
                              <td style={{ ...TD, fontSize: 12, color: "#888" }}>{r.date}</td>
                              <td style={TD}>
                                <span style={{ fontWeight: 500 }}>{r.assemblyName}</span>
                                <span style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>({r.assemblyId})</span>
                              </td>
                              <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: r.lotNumber ? "#a78bfa" : "#555" }}>{r.lotNumber || "—"}</td>
                              <td style={{ ...TD, fontWeight: 600, color: draft ? "#f59e0b" : "#22c55e" }}>{draft ? "" : "+"}{r.qtyProduced}</td>
                              <td style={{ ...TD, fontSize: 12 }}>{r.consumed?.length || 0} items</td>
                              <td style={{ ...TD, whiteSpace: "nowrap" }}>
                                {draft && (
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button onClick={() => {
                                      setDraftToComplete(r);
                                      setProdAssembly(r.assemblyId); setProdQty(r.qtyProduced);
                                      setProdDate(r.plannedDate || r.date); setProdLotNumber(r.lotNumber || ""); setFreshLotNumber("");
                                      setProdNotes(r.notes || ""); setProdConsume(initConsume(r.assemblyId));
                                      setCompleteDraftModal(true);
                                    }} style={{ ...B2, fontSize: 11, padding: "3px 8px", color: "#22c55e", borderColor: "#22c55e44" }}>
                                      <Check size={12} /> Complete
                                    </button>
                                    <button onClick={() => openEditDraft(r)} style={{ ...B2, fontSize: 11, padding: "3px 8px", color: "#6366f1", borderColor: "#6366f144" }}>
                                      <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => deleteDraft(r)} style={{ ...B2, fontSize: 11, padding: "3px 8px", color: "#ef4444", borderColor: "#ef444444" }}>
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                            {isExp && r.consumed && r.consumed.length > 0 && (
                              <tr><td colSpan={9} style={{ ...TD, background: "#16161e", paddingLeft: 40 }}>
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
        );
      })()}

      {/* ================== PRODUCTION MODAL ================== */}
      <Modal open={prodModal} onClose={() => setProdModal(false)} title="Manual Production Entry" wide>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Assembly to Produce *</label>
            <select value={prodAssembly} onChange={e => {
              const id = e.target.value;
              setProdAssembly(id); setProdConsume(initConsume(id)); setProdLotNumber(""); setFreshLotNumber("");
              // Auto-fill suggested lot for 200-level items — they always create a new lot,
              // and they have no lotSource so prodLotNumber is the direct text input.
              if (id && getLevel(id) === 200) {
                const m = id.match(/^\d+-(\w+)/); const pl = m ? m[1] : "";
                setProdLotNumber(formatLotNumber(digitForProductLine(pl, baseIngredients), lotCounter + 1, prodDate));
              }
            }} style={IS}>
              <option value="">Select assembly...</option>
              {assemblies.map(a => <option key={a.id} value={a.id}>[{a.id}] {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Quantity *</label>
            <input type="number" step="any" min="0" value={prodQty} onChange={e => setProdQty(Number(e.target.value))} style={IS} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Production Date</label>
            <input type="date" value={prodDate} onChange={e => handleProdDateChange(e.target.value)} style={IS} />
          </div>
        </div>

        {/* Lot Number */}
        {prodAssemblyItem && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
              Lot / Batch Number <span style={{ color: "#ef4444" }}>*</span>
              {lotSourceItem
                ? ` (inherited from ${lotSourceItem.name})`
                : (prodAssemblyItem.lotSource || getLevel(prodAssemblyItem.id) <= 200)
                  ? " (new lot)"
                  : " (manual — no lot source in BOM)"}
            </label>
            {lotSourceItem ? (
              <div>
                <select value={prodLotNumber} onChange={e => {
                    const v = e.target.value;
                    setProdLotNumber(v);
                    if (v === "__FRESH__") setFreshLotNumber(suggestedNewLot);
                    else setFreshLotNumber("");
                  }}
                  style={{ ...IS, borderColor: !prodLotNumber ? "#ef4444" : "#f59e0b", background: "#1a1a2e" }}>
                  <option value="">Select lot from {lotSourceItem.name}...</option>
                  {suggestedLots.map(l => (
                    <option key={l.lotNumber} value={l.lotNumber}>
                      {l.lotNumber} {l.planned ? `(PLANNED — ${l.qty} on ${l.productionDate || "?"})` : `(${l.qty} avail, ${l.productionDate || "?"})`}
                    </option>
                  ))}
                  <option value="__FRESH__">⊕ Make from fresh raw materials (new lot)</option>
                </select>
                {prodLotNumber === "__FRESH__" && (
                  <input value={freshLotNumber} onChange={e => setFreshLotNumber(e.target.value)}
                    placeholder={`Enter new lot number (e.g. ${suggestedNewLot || "60001-041926"})`} style={{ ...IS, marginTop: 6, borderColor: !freshLotNumber.trim() ? "#ef4444" : "#f59e0b" }} />
                )}
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                  🔒 Lot number inherited from {lotSourceItem.name}
                </div>
              </div>
            ) : (
              <input value={prodLotNumber} onChange={e => setProdLotNumber(e.target.value)}
                placeholder={`Enter lot number (e.g. ${suggestedNewLot || "60001-041926"})`}
                style={{ ...IS, borderColor: !prodLotNumber.trim() ? "#ef4444" : undefined }} />
            )}
            {(lotSourceItem ? (prodLotNumber === "__FRESH__" ? !freshLotNumber.trim() : !prodLotNumber) : !prodLotNumber.trim()) && (
              <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>Required — enter or select a batch number</div>
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
          <button onClick={submitProduction} disabled={!prodAssemblyItem || prodQty <= 0 || !(prodLotNumber === "__FRESH__" ? freshLotNumber.trim() : prodLotNumber.trim()) || (prodAssemblyItem && getValidationErrors(prodAssemblyItem.bom, prodQty).length > 0)} style={{ ...B1, background: "#8b5cf6", opacity: (!prodAssemblyItem || prodQty <= 0 || !(prodLotNumber === "__FRESH__" ? freshLotNumber.trim() : prodLotNumber.trim()) || (prodAssemblyItem && getValidationErrors(prodAssemblyItem.bom, prodQty).length > 0)) ? 0.4 : 1 }}><Hammer size={14} /> Submit</button>
        </div>
      </Modal>

      {/* ================== PLANNING (Weekly Production Plan) ================== */}
      {tab === "planning" && (() => {
        const workDays = forecastConfig.workDays || ["Mon","Tue","Wed","Thu","Fri"];
        const _todayStr = fmtDate(new Date());

        const selectedWeekDays = Array.from({ length: 7 }, (_, i) => {
          const d = addDays(planWeekStart, i);
          const dayName = DAY_NAMES[parseDate(d).getDay()];
          return { date: d, dayName, isWorkDay: workDays.includes(dayName) };
        }).filter(d => d.isWorkDay);

        // SKU options for autocomplete (levels 200-500, sorted by ID ascending)
        const skuOptions = allItems.filter(i => getLevel(i.id) >= 200).sort((a, b) => a.id.localeCompare(b.id));

        // Plan totals by product line
        const planTotals = {};
        for (const [, rows] of Object.entries(planDayRows)) {
          for (const row of rows) {
            if (!row.skuId || row.qty <= 0) continue;
            const m = row.skuId.match(/^\d+-(\w+)/);
            const pl = m ? m[1] : "?";
            planTotals[pl] = (planTotals[pl] || 0) + row.qty;
          }
        }

        const totalPlanRows = Object.values(planDayRows).reduce((s, rows) => s + rows.filter(r => r.skuId && r.qty > 0).length, 0);

        return (
          <div>
            {/* Week Navigator */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <button onClick={() => setPlanWeekStart(addDays(planWeekStart, -7))} style={{ ...B2, padding: "6px 10px" }}><ChevronLeft size={14} /></button>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>Week of {new Date(planWeekStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              <button onClick={() => setPlanWeekStart(addDays(planWeekStart, 7))} style={{ ...B2, padding: "6px 10px" }}><ChevronRight size={14} /></button>
              <button onClick={() => setPlanWeekStart(getMonday(_todayStr))} style={{ ...B2, fontSize: 11, padding: "5px 10px" }}>Today</button>
              {weekDrafts.length > 0 && <span style={{ fontSize: 11, color: "#f59e0b", marginLeft: 8 }}>{weekDrafts.length} draft run{weekDrafts.length !== 1 ? "s" : ""} submitted</span>}
            </div>

            {/* Suggested Quantities + Plan Totals */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Suggested vs Planned (weekly)</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {productLines.map(pl => {
                  const suggested = autoForecast[pl] || 0;
                  const planned = planTotals[pl] || 0;
                  const met = suggested > 0 && planned >= suggested;
                  return (
                    <div key={pl} style={{ minWidth: 100, padding: "6px 12px", borderRadius: 8, background: "#16161e", border: "1px solid #2a2a3a" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", marginBottom: 2 }}>{pl}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>Suggested: <strong style={{ color: "#ccc" }}>{suggested}</strong>/wk</div>
                      <div style={{ fontSize: 11, color: met ? "#22c55e" : planned > 0 ? "#f59e0b" : "#555" }}>
                        Planned: <strong>{planned}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Runway summary row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {runwayData.filter(r => r.weeksLeft !== Infinity && r.weeksLeft < 3).map(r => (
                <div key={r.productLine} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: r.weeksLeft < 1 ? "#2a1a1a" : "#2a2a1a", border: `1px solid ${r.weeksLeft < 1 ? "#ef444433" : "#f59e0b33"}`, color: r.weeksLeft < 1 ? "#ef4444" : "#f59e0b" }}>
                  <AlertTriangle size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  {r.productLine}: {r.weeksLeft} wks runway
                </div>
              ))}
            </div>

            {planLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#888" }}><Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} /> Loading plan...</div>
            ) : (
              <>
                {/* Day Grid */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${selectedWeekDays.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
                  {selectedWeekDays.map(day => {
                    const rows = planDayRows[day.date] || [];
                    const isToday = day.date === _todayStr;
                    return (
                      <div key={day.date} style={{ background: "#1e1e2e", borderRadius: 10, border: isToday ? "2px solid #6366f1" : "1px solid #2a2a3a" }}>
                        <div style={{ padding: "8px 12px", borderBottom: "1px solid #2a2a3a", background: isToday ? "#1a1a3a" : "#16161e" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>{day.dayName}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                        </div>
                        <div style={{ padding: 8, minHeight: 100 }}>
                          {rows.map((row, idx) => (
                            <div key={row._key || idx} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <SkuAutocomplete value={row.skuId} skuOpts={skuOptions} onChange={val => {
                                  setPlanDayRows(prev => {
                                    const updated = [...(prev[day.date] || [])];
                                    updated[idx] = { ...updated[idx], skuId: val };
                                    return { ...prev, [day.date]: updated };
                                  });
                                }} />
                              </div>
                              <input type="number" min={0} step={1} value={row.qty || ""} placeholder="Qty"
                                onChange={e => {
                                  setPlanDayRows(prev => {
                                    const updated = [...(prev[day.date] || [])];
                                    updated[idx] = { ...updated[idx], qty: Number(e.target.value) || 0 };
                                    return { ...prev, [day.date]: updated };
                                  });
                                }}
                                style={{ ...IS, width: 60, textAlign: "center", padding: "5px 6px", fontSize: 13, fontWeight: 600, flexShrink: 0 }}
                              />
                              <button onClick={() => {
                                setPlanDayRows(prev => ({
                                  ...prev, [day.date]: (prev[day.date] || []).filter((_, i) => i !== idx)
                                }));
                              }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2 }}>
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => {
                            setPlanDayRows(prev => ({
                              ...prev, [day.date]: [...(prev[day.date] || []), { skuId: "", qty: 0, _key: Date.now() + Math.random() }]
                            }));
                          }} style={{ ...B2, width: "100%", fontSize: 11, padding: "4px 8px", color: "#888" }}>
                            <Plus size={12} /> Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Submit Button */}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <button onClick={() => {
                    if (totalPlanRows === 0) { show("Add at least one SKU row to the plan", "error"); return; }
                    // Check for incomplete rows
                    for (const [, rows] of Object.entries(planDayRows)) {
                      for (const row of rows) {
                        if (row.skuId && row.qty <= 0) { show("All rows must have a quantity > 0", "error"); return; }
                        if (!row.skuId && row.qty > 0) { show("All rows must have a SKU selected", "error"); return; }
                      }
                    }
                    setPlanConfirmModal(true);
                  }} disabled={totalPlanRows === 0}
                    style={{ ...B1, fontSize: 14, padding: "12px 32px", background: "#6366f1", opacity: totalPlanRows === 0 ? 0.4 : 1, borderRadius: 10 }}>
                    <Calendar size={16} /> Submit Plan for Week ({totalPlanRows} run{totalPlanRows !== 1 ? "s" : ""})
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Plan Confirm Modal */}
      <Modal open={planConfirmModal} onClose={() => setPlanConfirmModal(false)} title="Submit Weekly Plan">
        <div style={{ marginBottom: 16 }}>
          {weekCompleted.length > 0 && (
            <div style={{ background: "#2a1a1a", border: "1px solid #ef444433", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>
                <AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
                This week already has {weekCompleted.length} completed production run{weekCompleted.length !== 1 ? "s" : ""}.
              </div>
              <div style={{ fontSize: 12, color: "#ccc" }}>
                Completed runs will <strong>not be affected</strong>. This plan will create additional draft runs alongside the existing completed production.
              </div>
            </div>
          )}
          {weekDrafts.length > 0 ? (
            <div style={{ background: "#2a2a1a", border: "1px solid #f59e0b33", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>
                <AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
                This week already has {weekDrafts.length} drafted production run{weekDrafts.length !== 1 ? "s" : ""}.
              </div>
              <div style={{ fontSize: 12, color: "#ccc" }}>
                Submitting will <strong>replace all Draft runs</strong> for this week. Completed runs are not affected.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#ccc" }}>
              This will create draft production runs for each planned item. You can then complete them during the week from the Production tab.
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setPlanConfirmModal(false)} style={B2}>Cancel</button>
          <button onClick={submitWeeklyPlan} disabled={planSubmitting}
            style={{ ...B1, background: "#6366f1", opacity: planSubmitting ? 0.5 : 1 }}>
            {planSubmitting ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Submitting...</> : <><Check size={14} /> Confirm &amp; Submit</>}
          </button>
        </div>
      </Modal>

      {/* Complete Draft Modal */}
      <Modal open={completeDraftModal} onClose={() => { setCompleteDraftModal(false); setDraftToComplete(null); }} title="Complete Production Run" wide>
        {draftToComplete && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "#1a2a1a", borderRadius: 6, fontSize: 12, color: "#22c55e", border: "1px solid #22c55e33" }}>
            Completing draft: <strong>{draftToComplete.id}</strong> — {draftToComplete.assemblyName}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Assembly to Produce *</label>
            <select value={prodAssembly} onChange={e => {
              const id = e.target.value;
              setProdAssembly(id); setProdConsume(initConsume(id)); setProdLotNumber(""); setFreshLotNumber("");
              if (id && getLevel(id) === 200) {
                const m = id.match(/^\d+-(\w+)/); const pl = m ? m[1] : "";
                setProdLotNumber(formatLotNumber(digitForProductLine(pl, baseIngredients), lotCounter + 1, prodDate));
              }
            }} style={IS}>
              <option value="">Select assembly...</option>
              {assemblies.map(a => <option key={a.id} value={a.id}>[{a.id}] {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Quantity *</label>
            <input type="number" step="any" min="0" value={prodQty} onChange={e => setProdQty(Number(e.target.value))} style={IS} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Production Date</label>
            <input type="date" value={prodDate} onChange={e => handleProdDateChange(e.target.value)} style={IS} />
          </div>
        </div>
        {prodAssemblyItem && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
              Lot / Batch Number <span style={{ color: "#ef4444" }}>*</span>
              {lotSourceItem
                ? ` (inherited from ${lotSourceItem.name})`
                : (prodAssemblyItem.lotSource || getLevel(prodAssemblyItem.id) <= 200)
                  ? " (new lot)"
                  : " (manual — no lot source in BOM)"}
            </label>
            {lotSourceItem ? (
              <div>
                <select value={prodLotNumber} onChange={e => {
                    const v = e.target.value;
                    setProdLotNumber(v);
                    if (v === "__FRESH__") setFreshLotNumber(suggestedNewLot);
                    else setFreshLotNumber("");
                  }}
                  style={{ ...IS, borderColor: !prodLotNumber ? "#ef4444" : "#f59e0b", background: "#1a1a2e" }}>
                  <option value="">Select lot from {lotSourceItem.name}...</option>
                  {suggestedLots.map(l => (
                    <option key={l.lotNumber} value={l.lotNumber}>
                      {l.lotNumber} {l.planned ? `(PLANNED — ${l.qty} on ${l.productionDate || "?"})` : `(${l.qty} avail, ${l.productionDate || "?"})`}
                    </option>
                  ))}
                  <option value="__FRESH__">⊕ Make from fresh raw materials (new lot)</option>
                </select>
                {prodLotNumber === "__FRESH__" && (
                  <input value={freshLotNumber} onChange={e => setFreshLotNumber(e.target.value)}
                    placeholder={`Enter new lot number (e.g. ${suggestedNewLot || "60001-041926"})`} style={{ ...IS, marginTop: 6, borderColor: !freshLotNumber.trim() ? "#ef4444" : "#f59e0b" }} />
                )}
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                  🔒 Lot number inherited from {lotSourceItem.name}
                </div>
              </div>
            ) : (
              <input value={prodLotNumber} onChange={e => setProdLotNumber(e.target.value)}
                placeholder={`Enter lot number (e.g. ${suggestedNewLot || "60001-041926"})`}
                style={{ ...IS, borderColor: !prodLotNumber.trim() ? "#ef4444" : undefined }} />
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
                  <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>Incomplete — some materials are not checked:</div>
                  {valErrors.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#f87171" }}>{e}</div>)}
                </div>
              )}
              {valErrors.length === 0 && shortages.length > 0 && (
                <div style={{ background: "#2a2a1a", border: "1px solid #f59e0b33", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>Insufficient Stock (will go negative)</div>
                  {shortages.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#fbbf24" }}>{s.name}: need {s.qty.toFixed(3)}, have {s.currentQty}</div>)}
                </div>
              )}
              {valErrors.length === 0 && (<div style={{ fontSize: 12, color: "#22c55e", marginBottom: 12, fontWeight: 500 }}>Will consume {consumed.length} items</div>)}
            </>
          );
        })()}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes (optional)</label>
          <input value={prodNotes} onChange={e => setProdNotes(e.target.value)} placeholder="Batch notes" style={IS} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => { setCompleteDraftModal(false); setDraftToComplete(null); }} style={B2}>Cancel</button>
          <button onClick={submitCompleteDraft} disabled={!prodAssemblyItem || prodQty <= 0 || !(prodLotNumber === "__FRESH__" ? freshLotNumber.trim() : prodLotNumber.trim()) || (prodAssemblyItem && getValidationErrors(prodAssemblyItem.bom, prodQty).length > 0)}
            style={{ ...B1, background: "#22c55e", opacity: (!prodAssemblyItem || prodQty <= 0 || !(prodLotNumber === "__FRESH__" ? freshLotNumber.trim() : prodLotNumber.trim()) || (prodAssemblyItem && getValidationErrors(prodAssemblyItem.bom, prodQty).length > 0)) ? 0.4 : 1 }}>
            <Check size={14} /> Complete Run
          </button>
        </div>
      </Modal>

      {/* PO Vendor Picker — opens before generating POs whenever any needed
          item has alternate vendors. User picks one vendor per multi-vendor
          item; single-source items use their primary supplier silently. */}
      <Modal open={poVendorPickerOpen} onClose={() => setPoVendorPickerOpen(false)} title="Choose vendor for multi-source items" wide>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>The following items can be purchased from multiple vendors. Pick which vendor to use for this PO run.</p>
        <div style={{ background: "#16161e", borderRadius: 8, border: "1px solid #2a2a3a", overflow: "hidden", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#1a1a2e", color: "#888", fontSize: 11, textTransform: "uppercase" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Item</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Need</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Vendor</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(poVendorChoices).map(itemId => {
                const item = allItems.find(i => i.id === itemId);
                if (!item) return null;
                const need = mrp.rows.find(r => r.id === itemId)?.shortfall || 0;
                const opts = vendorOptionsForItem(item);
                return (
                  <tr key={itemId} style={{ borderTop: "1px solid #2a2a3a" }}>
                    <td style={{ padding: "8px 12px", fontSize: 12 }}>
                      <div style={{ color: "#e0e0e0", fontWeight: 500 }}>{item.name}</div>
                      <div style={{ color: "#666", fontSize: 11, fontFamily: "monospace" }}>{item.id}</div>
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "#fbbf24", textAlign: "right", whiteSpace: "nowrap" }}>{need} {item.unit}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <select value={poVendorChoices[itemId]} onChange={e => setPoVendorChoices(c => ({ ...c, [itemId]: e.target.value }))} style={{ ...IS, width: "100%" }}>
                        {opts.map(o => (
                          <option key={o.vendorName} value={o.vendorName}>
                            {o.vendorName}{o.primary ? " ★" : ""} — ${(o.unitCost || 0).toFixed(2)}/{item.unit}{o.supplierCode ? ` (code: ${o.supplierCode})` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setPoVendorPickerOpen(false)} style={B2}>Cancel</button>
          <button onClick={() => generatePOsWithChoices(poVendorChoices)} style={{ ...B1, background: "#f59e0b", color: "#000" }}><FileText size={14} /> Continue & Generate POs</button>
        </div>
      </Modal>

      {/* Edit Draft Modal — mirrors Complete modal so user can preview the
          consumption tree, drill into sub-assemblies, and pick a lot source
          (real inventory or planned draft). Only the lot # and metadata are
          persisted; the tree state is for preview/planning only. */}
      <Modal open={editDraftModal} onClose={closeEditDraft} title="Edit Draft Run" wide>
        {editingDraftId && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "#1a1a2a", borderRadius: 6, fontSize: 12, color: "#6366f1", border: "1px solid #6366f133" }}>
            Editing draft: <strong>{editingDraftId}</strong> — adjust qty, date, and lot source. Tree below previews consumption (not yet committed).
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Assembly *</label>
            <select value={prodAssembly} onChange={e => {
              const id = e.target.value;
              setProdAssembly(id); setProdConsume(initConsume(id)); setProdLotNumber(""); setFreshLotNumber("");
              if (id && getLevel(id) === 200) {
                const m = id.match(/^\d+-(\w+)/); const pl = m ? m[1] : "";
                setProdLotNumber(formatLotNumber(digitForProductLine(pl, baseIngredients), lotCounter + 1, prodDate));
              }
            }} style={IS}>
              <option value="">Select assembly...</option>
              {assemblies.map(a => <option key={a.id} value={a.id}>[{a.id}] {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Quantity *</label>
            <input type="number" step="any" min="0" value={prodQty} onChange={e => setProdQty(Number(e.target.value))} style={IS} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Planned Date</label>
            <input type="date" value={prodDate} onChange={e => handleProdDateChange(e.target.value)} style={IS} />
          </div>
        </div>

        {prodAssemblyItem && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
              Lot / Batch Number
              {lotSourceItem
                ? ` (inherited from ${lotSourceItem.name})`
                : (prodAssemblyItem.lotSource || getLevel(prodAssemblyItem.id) <= 200)
                  ? " (new lot)"
                  : " (manual — no lot source in BOM)"}
            </label>
            {lotSourceItem ? (
              <div>
                <select value={prodLotNumber} onChange={e => {
                    const v = e.target.value;
                    setProdLotNumber(v);
                    if (v === "__FRESH__") setFreshLotNumber(suggestedNewLot);
                    else setFreshLotNumber("");
                  }}
                  style={{ ...IS, background: "#1a1a2e" }}>
                  <option value="">— leave blank, choose at completion —</option>
                  {suggestedLots.map(l => (
                    <option key={l.lotNumber} value={l.lotNumber}>
                      {l.lotNumber} {l.planned ? `(PLANNED — ${l.qty} on ${l.productionDate || "?"})` : `(${l.qty} avail, ${l.productionDate || "?"})`}
                    </option>
                  ))}
                  <option value="__FRESH__">⊕ Make from fresh raw materials (new lot)</option>
                </select>
                {prodLotNumber === "__FRESH__" && (
                  <input value={freshLotNumber} onChange={e => setFreshLotNumber(e.target.value)}
                    placeholder={`Enter new lot number (e.g. ${suggestedNewLot || "60001-041926"})`} style={{ ...IS, marginTop: 6, borderColor: "#f59e0b" }} />
                )}
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                  🔒 Lot number inherited from {lotSourceItem.name}
                </div>
              </div>
            ) : (
              <input value={prodLotNumber} onChange={e => setProdLotNumber(e.target.value)}
                placeholder={`Enter lot number (e.g. ${suggestedNewLot || "60001-041926"})`} style={IS} />
            )}
          </div>
        )}

        {prodAssemblyItem && prodAssemblyItem.bom && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 4 }}>Materials Preview (consumption happens at completion)</div>
            <div style={{ border: "1px solid #2a2a3a", borderRadius: 8, padding: 12, background: "#16161e", maxHeight: 400, overflow: "auto" }}>
              {renderConsumptionTree(prodAssemblyItem.bom, prodQty)}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes (optional)</label>
          <input value={prodNotes} onChange={e => setProdNotes(e.target.value)} placeholder="Batch notes" style={IS} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={closeEditDraft} style={B2}>Cancel</button>
          <button onClick={saveEditDraft} disabled={!prodAssemblyItem || prodQty <= 0}
            style={{ ...B1, opacity: (!prodAssemblyItem || prodQty <= 0) ? 0.4 : 1 }}>
            <Check size={14} /> Save
          </button>
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

      {/* ================== ADMIN CONFIG ================== */}
      {tab === "admin" && isAdmin && (() => {
        if (allProfiles.length === 0) { fetchProfiles().then(p => setAllProfiles(p)).catch(() => {}); }

        const cfgSections = [
          { id: "appName", label: "App Name", icon: <Sparkles size={14} /> },
          { id: "users", label: "Users", icon: <Users size={14} /> },
          { id: "locations", label: "Locations", icon: <Package size={14} /> },
          { id: "levels", label: "SKU Levels", icon: <Layers size={14} /> },
          { id: "orderTypes", label: "Order Types", icon: <ShoppingCart size={14} /> },
          { id: "pricing", label: "Pricing Matrix", icon: <DollarSign size={14} /> },
          { id: "ordStatuses", label: "Order Statuses", icon: <ShoppingCart size={14} /> },
          { id: "poStatuses", label: "PO Statuses", icon: <FileText size={14} /> },
          { id: "receiptTypes", label: "Receipt Types", icon: <PackageCheck size={14} /> },
          { id: "costing", label: "Costing Methods", icon: <DollarSign size={14} /> },
          { id: "planning", label: "Planning", icon: <TrendingUp size={14} /> },
          { id: "lotNumbering", label: "Lot Numbering", icon: <KeyRound size={14} /> },
          { id: "wishes", label: "Wishes", icon: <Sparkles size={14} /> },
        ];

        return (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* Sidebar */}
            <div style={{ minWidth: 180, background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", flexShrink: 0 }}>
              {cfgSections.map(s => (
                <button key={s.id} onClick={() => { setCfgSection(s.id); setCfgNewItem(""); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 16px", background: cfgSection === s.id ? "#6366f122" : "transparent", border: "none", borderLeft: cfgSection === s.id ? "3px solid #6366f1" : "3px solid transparent", cursor: "pointer", color: cfgSection === s.id ? "#e0e0e0" : "#888", fontSize: 13, textAlign: "left" }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* App Name */}
              {cfgSection === "appName" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>App Name</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Your company name followed by "Genie". This appears in the header.</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input id="appNameInput" defaultValue={appName} placeholder="e.g. Dumpling Genie" style={{ ...IS, flex: 1, fontSize: 16, fontWeight: 600 }} />
                    <button onClick={async () => { const input = document.getElementById("appNameInput"); if (input?.value.trim()) { const name = input.value.trim(); setAppName(name); try { await saveConfig("app_name", name); show("App name updated!"); } catch (e) { show(e.message, "error"); } } }} style={{ ...B1, background: "linear-gradient(135deg, #fbbf24, #d97706)", color: "#000" }}>
                      <Sparkles size={14} /> Save
                    </button>
                  </div>
                  <div style={{ marginTop: 16, padding: 16, background: "#16161e", borderRadius: 8, border: "1px solid #2a2a3a" }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>PREVIEW</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Sparkles size={22} style={{ color: "#fbbf24" }} />
                      <span style={{ fontSize: 20, fontWeight: 700, background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{appName}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Powered by Ops Genie</div>
                  </div>
                </div>
              )}

              {/* Users */}
              {cfgSection === "users" && (
                <div>
                  <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#e0e0e0" }}>User Management</h3>

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

                  <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Team Members ({allProfiles.length})</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>{["Email", "Name", "Role", "Joined", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
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
                              <td style={{ ...TD, fontSize: 12, color: "#555" }}>
                                {p.id === profile?.id
                                  ? "(you)"
                                  : <button onClick={() => setDelUserConfirm(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }} title="Remove user"><Trash2 size={14} /></button>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Locations */}
              {cfgSection === "locations" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Inventory Locations</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Storage locations, bins, and slots used across inventory and receiving.</p>
                  <ListEditor items={locations} setItems={setLocations} configKey="locations" label="Location" />
                </div>
              )}

              {/* SKU Levels */}
              {cfgSection === "levels" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>SKU Levels</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Define what each level prefix means in your product hierarchy.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {LEVEL_KEYS.map(k => {
                      const lvl = LEVELS[k] || { label: `${k}`, color: "#888", cat: "" };
                      return (
                        <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", background: "#16161e", borderRadius: 8, border: `1px solid ${lvl.color}33` }}>
                          <span style={{ width: 50, fontWeight: 700, color: lvl.color, fontSize: 16 }}>{k}</span>
                          <input defaultValue={lvl.label} onBlur={async (e) => { const updated = { ...LEVELS, [k]: { ...lvl, label: e.target.value } }; setCfgLevels(updated); try { await saveConfig("sku_levels", updated); } catch (err) { console.warn(err); } }} placeholder="Label" style={{ ...IS, flex: 1 }} />
                          <input defaultValue={lvl.cat} onBlur={async (e) => { const updated = { ...LEVELS, [k]: { ...lvl, cat: e.target.value } }; setCfgLevels(updated); try { await saveConfig("sku_levels", updated); } catch (err) { console.warn(err); } }} placeholder="Category name" style={{ ...IS, flex: 1 }} />
                          <input type="color" defaultValue={lvl.color} onChange={async (e) => { const updated = { ...LEVELS, [k]: { ...lvl, color: e.target.value } }; setCfgLevels(updated); try { await saveConfig("sku_levels", updated); } catch (err) { console.warn(err); } }} style={{ width: 36, height: 36, padding: 2, background: "none", border: "1px solid #333", borderRadius: 6, cursor: "pointer" }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order Types */}
              {cfgSection === "orderTypes" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Order Types</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Types of orders (e.g. Wholesale, Retail). Used to determine pricing.</p>
                  <ListEditor items={cfgOrderTypes} setItems={setCfgOrderTypes} configKey="order_types" label="Order Type" />
                </div>
              )}

              {/* Pricing Matrix */}
              {cfgSection === "pricing" && (() => {
                const pricingItems = [...parts, ...assemblies].filter(a => getLevel(a.id) >= 300).sort((a, b) => a.id.localeCompare(b.id));
                const totalPricesSet = Object.keys(cfgPriceMatrix).filter(k => k.includes("|")).length;
                return (
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Pricing Matrix</h3>
                    <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Set unit prices per order type and SKU.</p>
                    {ORDER_TYPES.length === 0 ? (
                      <p style={{ color: "#f59e0b", fontSize: 13 }}>Add order types first in the Order Types config.</p>
                    ) : pricingItems.length === 0 ? (
                      <p style={{ color: "#555", fontSize: 13 }}>No items at level 300+ found.</p>
                    ) : (
                      <>
                        <div style={{ maxHeight: 500, overflowY: "auto", border: "1px solid #2a2a3a", borderRadius: 8 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ position: "sticky", top: 0, zIndex: 1, background: "#1e1e2e" }}>
                                <th style={{ ...TH, textAlign: "left", minWidth: 100 }}>SKU</th>
                                <th style={{ ...TH, textAlign: "left", minWidth: 120 }}>Item</th>
                                {ORDER_TYPES.map(t => (
                                  <th key={t} style={{ ...TH, textAlign: "right", minWidth: 100 }}>{t}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pricingItems.map(item => (
                                <tr key={item.id}>
                                  <td style={{ ...TD, fontSize: 11, color: "#888", fontFamily: "monospace" }}>{item.id}</td>
                                  <td style={{ ...TD, fontSize: 13, color: "#e0e0e0" }}>{item.name}</td>
                                  {ORDER_TYPES.map(t => {
                                    const key = `${t}|${item.id}`;
                                    return (
                                      <td key={t} style={{ ...TD, padding: "4px 6px" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                                          <span style={{ fontSize: 12, color: "#555" }}>$</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={cfgPriceMatrix[key] || ""}
                                            placeholder="0.00"
                                            onChange={(e) => {
                                              const val = e.target.value === "" ? "" : Number(e.target.value);
                                              setCfgPriceMatrix(prev => {
                                                const next = { ...prev, [key]: val };
                                                if (val === "" || val === 0) delete next[key];
                                                return next;
                                              });
                                            }}
                                            onBlur={async () => {
                                              try { await saveConfig("price_matrix", cfgPriceMatrix); } catch (err) { console.warn(err); }
                                            }}
                                            style={{ ...IS, width: 80, textAlign: "right", fontSize: 13 }}
                                          />
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                          {pricingItems.length} SKUs × {ORDER_TYPES.length} types • {totalPricesSet} prices set
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Order Statuses */}
              {cfgSection === "ordStatuses" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Order Statuses</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Status options available on customer orders.</p>
                  <ListEditor items={cfgOrdStatuses} setItems={setCfgOrdStatuses} configKey="ord_statuses" label="Status" />
                </div>
              )}

              {/* PO Statuses */}
              {cfgSection === "poStatuses" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Purchase Order Statuses</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Status options available on purchase orders.</p>
                  <ListEditor items={cfgPoStatuses} setItems={setCfgPoStatuses} configKey="po_statuses" label="Status" />
                </div>
              )}

              {/* Receipt Types */}
              {cfgSection === "receiptTypes" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Receipt Types</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Categories for inventory receipts (PO, adjustment, etc).</p>
                  <ListEditor items={cfgReceiptTypes} setItems={setCfgReceiptTypes} configKey="receipt_types" label="Receipt Type" />
                </div>
              )}

              {/* Costing Methods */}
              {cfgSection === "costing" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Costing Methods</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Inventory costing methods available on items.</p>
                  <ListEditor items={cfgCosting} setItems={setCfgCosting} configKey="costing_methods" label="Method" />
                </div>
              )}

              {/* Planning Config */}
              {cfgSection === "planning" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Planning Settings</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Configure forecast horizon, lookback period, and production days.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "14px 18px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>Forecast Horizon (weeks)</div>
                      <input type="number" min={1} max={52} value={forecastConfig.horizonWeeks} onChange={e => setForecastConfig(prev => ({ ...prev, horizonWeeks: Number(e.target.value) || 4 }))} style={{ ...IS, width: 80 }} />
                    </div>
                    <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "14px 18px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>History Lookback (weeks)</div>
                      <input type="number" min={1} max={52} value={forecastConfig.lookbackWeeks} onChange={e => setForecastConfig(prev => ({ ...prev, lookbackWeeks: Number(e.target.value) || 8 }))} style={{ ...IS, width: 80 }} />
                    </div>
                    <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "14px 18px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>Production Days</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                          <label key={d} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: forecastConfig.workDays.includes(d) ? "#e0e0e0" : "#666", cursor: "pointer" }}>
                            <input type="checkbox" checked={forecastConfig.workDays.includes(d)} onChange={e => {
                              setForecastConfig(prev => ({
                                ...prev, workDays: e.target.checked ? [...prev.workDays, d] : prev.workDays.filter(x => x !== d),
                              }));
                            }} />
                            {d}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button onClick={async () => {
                      try { await saveConfig("forecast_config", forecastConfig); show("Planning settings saved"); } catch (e) { show(e.message, "error"); }
                    }} style={{ ...B1, alignSelf: "flex-start" }}><Check size={14} /> Save Settings</button>
                  </div>
                </div>
              )}

              {/* Lot Numbering Config */}
              {cfgSection === "lotNumbering" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Lot Numbering</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
                    Lot numbers are auto-generated as <code style={{ color: "#fbbf24" }}>[base ingredient digit][4-digit global sequence]-MMDDYY</code> — e.g.&nbsp;
                    <code style={{ color: "#fbbf24" }}>60003-041926</code>. The first digit identifies the base ingredient, the next four are a global counter that increments with each new lot across all flavors, and the date suffix is the production date.
                  </p>

                  <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "14px 18px", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>Current Sequence Counter</div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>The next lot will be assigned counter <strong style={{ color: "#fbbf24" }}>{lotCounter + 1}</strong>.</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          id="lotCounterInput" type="number" min={0} defaultValue={lotCounter}
                          style={{ ...IS, width: 110, textAlign: "right" }}
                        />
                        <button onClick={async () => {
                          const input = document.getElementById("lotCounterInput");
                          const val = parseInt(input?.value, 10);
                          if (!Number.isFinite(val) || val < 0) { show("Counter must be a non-negative integer", "error"); return; }
                          if (!confirm(`Set lot sequence counter to ${val}? The next lot will use counter ${val + 1}.`)) return;
                          try { await saveConfig("lot_sequence_counter", val); setLotCounter(val); show(`Counter set to ${val}`); }
                          catch (e) { show(e.message, "error"); }
                        }} style={B1}><Check size={14} /> Set</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "14px 18px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 4 }}>Base Ingredient → Digit Mapping</div>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>Each digit (0–9) maps to a base ingredient. List the product line codes (e.g. CB, GC) that use that base ingredient — one per row. Comma-separated.</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#16161e", color: "#888", fontSize: 11, textTransform: "uppercase" }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 60 }}>Digit</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Base Ingredient Label</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Product Line Codes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {baseIngredients.map((bi, idx) => (
                          <tr key={bi.digit} style={{ borderBottom: "1px solid #2a2a3a" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", fontSize: 14 }}>{bi.digit}</td>
                            <td style={{ padding: "8px 10px" }}>
                              <input value={bi.label} onChange={e => {
                                const v = e.target.value;
                                setBaseIngredients(prev => prev.map((x, i) => i === idx ? { ...x, label: v } : x));
                              }} style={{ ...IS, width: "100%" }} />
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <input value={(bi.productLines || []).join(", ")} onChange={e => {
                                const codes = e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
                                setBaseIngredients(prev => prev.map((x, i) => i === idx ? { ...x, productLines: codes } : x));
                              }} placeholder="e.g. CB, KB" style={{ ...IS, width: "100%" }} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button onClick={async () => {
                        try { await saveConfig("lot_base_ingredients", baseIngredients); show("Lot numbering saved"); }
                        catch (e) { show(e.message, "error"); }
                      }} style={B1}><Check size={14} /> Save Mapping</button>
                      <button onClick={() => {
                        if (!confirm("Reset to default mapping? Unsaved edits will be lost.")) return;
                        setBaseIngredients(DEFAULT_BASE_INGREDIENTS);
                      }} style={B2}>Reset to Default</button>
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 10, paddingTop: 10, borderTop: "1px solid #2a2a3a" }}>
                      Product lines not mapped to any digit will default to digit <strong>8 (MEI MEI SPECIAL/TEST)</strong>.
                    </div>
                  </div>
                </div>
              )}

              {/* Wishes */}
              {cfgSection === "wishes" && (() => {
                if (allWishes.length === 0) { fetchWishes().then(w => setAllWishes(w)).catch(() => {}); }
                return (
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>
                      <span style={{ marginRight: 8 }}>🧞</span>User Wishes
                    </h3>
                    <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>Feature requests from your team. Each user gets {MAX_WISHES} wishes.</p>
                    {allWishes.length === 0 ? (
                      <div style={{ padding: 40, textAlign: "center", color: "#555", background: "#16161e", borderRadius: 10 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🧞</div>
                        <p style={{ margin: 0 }}>No wishes yet. Your team has not rubbed the lamp!</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {allWishes.map(w => (
                          <div key={w.id} style={{ background: "#16161e", borderRadius: 8, border: "1px solid #2a2a3a", padding: "14px 16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, color: "#e0e0e0", marginBottom: 6, lineHeight: 1.5 }}>{w.wish}</div>
                                <div style={{ fontSize: 11, color: "#666" }}>
                                  From <span style={{ color: "#888" }}>{w.userEmail}</span> on {new Date(w.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                              <span style={{ fontSize: 24 }}>🪔</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 11, color: "#666" }}>{allWishes.length} wish{allWishes.length !== 1 ? "es" : ""} total</div>
                  </div>
                );
              })()}
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
              {isAdmin && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "end", paddingBottom: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: form.lotTracking ? "#a78bfa" : "#888" }}>
                    <input type="checkbox" checked={form.lotTracking || false} onChange={(e) => setForm((f) => ({ ...f, lotTracking: e.target.checked }))} style={{ accentColor: "#a78bfa", width: 15, height: 15 }} />
                    Lot Tracking
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: form.lotSource ? "#f59e0b" : "#888" }}>
                    <input type="checkbox" checked={form.lotSource || false} onChange={(e) => setForm((f) => ({ ...f, lotSource: e.target.checked }))} style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                    Lot Source
                  </label>
                </div>
              )}
              {!isRaw && (
                <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Pcs / Unit <span style={{ fontSize: 10, color: "#555" }}>(dumplings per unit)</span></label><input type="number" min="0" value={form.piecesPerUnit || 0} onChange={(e) => setForm((f) => ({ ...f, piecesPerUnit: Number(e.target.value) }))} style={IS} /></div>
              )}
              <div style={{ gridColumn: "1/-1" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label><input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={IS} /></div>
            </div>

            {/* Alternate Vendors — raw materials only. Primary vendor lives on the
                Supplier field above; alternates here let the same raw material be
                ordered from multiple sources. */}
            {isRaw && (
              <div style={{ borderTop: "1px solid #2a2a3a", paddingTop: 16, marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Alternate Vendors</h3>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>Other vendors who supply this same item. The Supplier field above is the primary.</p>
                  </div>
                  <button onClick={() => setVendorAltsForm(p => [...p, { vendorName: "", supplierCode: "", unitCost: 0 }])} style={B2}><Plus size={14} /> Add Alternate Vendor</button>
                </div>
                {vendorAltsForm.length === 0 && (
                  <p style={{ color: "#555", fontSize: 12, margin: "8px 0" }}>No alternate vendors. This item is single-source.</p>
                )}
                {vendorAltsForm.map((alt, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <select value={alt.vendorName || ""} onChange={(e) => {
                      const v = e.target.value;
                      const vObj = vendors.find(x => x.name === v);
                      setVendorAltsForm(p => p.map((x, j) => j === i ? { ...x, vendorName: v, vendorId: vObj?.id || "" } : x));
                    }} style={IS}>
                      <option value="">Select vendor...</option>
                      {vendors.filter(v => v.name !== form.supplier).map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                    </select>
                    <input value={alt.supplierCode || ""} placeholder="Supplier code" onChange={(e) => setVendorAltsForm(p => p.map((x, j) => j === i ? { ...x, supplierCode: e.target.value } : x))} style={IS} />
                    <input type="number" step="0.01" value={alt.unitCost || 0} placeholder="Unit cost" onChange={(e) => setVendorAltsForm(p => p.map((x, j) => j === i ? { ...x, unitCost: Number(e.target.value) } : x))} style={IS} />
                    <button onClick={() => {
                      // Make Primary: swap this row with the primary vendor fields on the form
                      const oldPrimary = { vendorName: form.supplier || "", supplierCode: form.supplierCode || "", unitCost: form.avgCost || 0 };
                      setForm(f => ({ ...f, supplier: alt.vendorName, supplierCode: alt.supplierCode || "", avgCost: Number(alt.unitCost) || 0 }));
                      setVendorAltsForm(p => p.map((x, j) => j === i ? (oldPrimary.vendorName ? oldPrimary : null) : x).filter(Boolean));
                    }} title="Make Primary" style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>★ Make Primary</button>
                    <button onClick={() => setVendorAltsForm(p => p.filter((_, j) => j !== i))} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}><Minus size={16} /></button>
                  </div>
                ))}
              </div>
            )}

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
      <Modal open={modal === "order"} onClose={() => setModal(null)} title={editItem ? "Edit Order Line" : (form.customer ? `Add Lines — ${form.customer}` : "New Order")} wide>
        {editItem ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Order ID</label><input value={form.id || ""} readOnly style={{ ...IS, opacity: 0.5 }} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Customer</label><input value={form.customer || ""} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Item</label><select value={form.item || ""} onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))} style={IS}><option value="">Select...</option>{assemblies.filter((a) => getLevel(a.id) >= 300).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Qty</label><input type="number" value={form.qty || 0} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Date</label><input type="date" value={form.date || ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Status</label><select value={form.status || "Pending"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={IS}>{ORD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Order Type</label><select value={form.orderType || ""} onChange={(e) => setForm((f) => ({ ...f, orderType: e.target.value }))} style={IS}><option value="">Select...</option>{ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Unit Price</label><input value={form.orderType && form.item ? `$${getUnitPrice(form.orderType, form.item).toFixed(2)}` : "—"} readOnly style={{ ...IS, opacity: 0.6 }} /></div>
              <div style={{ gridColumn: "1/3" }}><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label><input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={IS} /></div>
            </div>
            {form.orderType && form.item && getUnitPrice(form.orderType, form.item) > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#22c55e11", borderRadius: 8, border: "1px solid #22c55e33", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#888" }}>Line Total</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>${(Number(form.qty || 0) * getUnitPrice(form.orderType, form.item)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setModal(null)} style={B2}>Cancel</button><button onClick={save} style={B1}>Update</button></div>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Customer</label><input value={form.customer || ""} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} style={IS} placeholder="Customer name" /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Date</label><input type="date" value={form.date || ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Order Type</label><select value={form.orderType || ""} onChange={(e) => setForm((f) => ({ ...f, orderType: e.target.value }))} style={IS}><option value="">Select...</option>{ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Status</label><select value={form.status || "Pending"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={IS}>{ORD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ borderTop: "1px solid #2a2a3a", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>Order Lines</span>
                <button onClick={() => setOrderLines(prev => [...prev, { item: "", qty: 0, notes: "" }])} style={{ ...B2, padding: "4px 12px", fontSize: 12, borderColor: "#6366f144", color: "#6366f1" }}><Plus size={12} /> Add Line</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...TH, width: "35%" }}>Item</th>
                  <th style={{ ...TH, width: "10%" }}>Qty</th>
                  <th style={{ ...TH, width: "10%" }}>Price</th>
                  <th style={{ ...TH, width: "10%" }}>Total</th>
                  <th style={{ ...TH, width: "25%" }}>Notes</th>
                  <th style={{ ...TH, width: "10%" }}></th>
                </tr></thead>
                <tbody>
                  {orderLines.map((line, idx) => {
                    const linePrice = getUnitPrice(form.orderType, line.item);
                    const lineTotal = (Number(line.qty) || 0) * linePrice;
                    return (
                      <tr key={idx}>
                        <td style={TD}><select value={line.item} onChange={(e) => setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, item: e.target.value } : l))} style={{ ...IS, fontSize: 13 }}><option value="">Select item...</option>{assemblies.filter((a) => getLevel(a.id) >= 300).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}</select></td>
                        <td style={TD}><input type="number" value={line.qty || ""} onChange={(e) => setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: Number(e.target.value) } : l))} style={{ ...IS, fontSize: 13 }} min="0" /></td>
                        <td style={{ ...TD, fontSize: 12, color: "#888" }}>{linePrice > 0 ? `$${linePrice.toFixed(2)}` : "—"}</td>
                        <td style={{ ...TD, fontSize: 12, fontWeight: 600, color: lineTotal > 0 ? "#22c55e" : "#555" }}>{lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : "—"}</td>
                        <td style={TD}><input value={line.notes || ""} onChange={(e) => setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, notes: e.target.value } : l))} style={{ ...IS, fontSize: 13 }} placeholder="Optional" /></td>
                        <td style={TD}>{orderLines.length > 1 && <button onClick={() => setOrderLines(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }}><Trash2 size={14} /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {form.orderType && (() => {
                const grandTotal = orderLines.reduce((s, l) => s + ((Number(l.qty) || 0) * getUnitPrice(form.orderType, l.item)), 0);
                return grandTotal > 0 ? (
                  <div style={{ marginTop: 10, padding: "10px 14px", background: "#22c55e11", borderRadius: 8, border: "1px solid #22c55e33", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#888" }}>Order Total</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ) : null;
              })()}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setModal(null)} style={B2}>Cancel</button><button onClick={save} style={B1}>{orderLines.filter(l => l.item && l.qty > 0).length > 1 ? `Add ${orderLines.filter(l => l.item && l.qty > 0).length} Lines` : "Add Order"}</button></div>
          </>
        )}
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

      {/* Data Import Modal (3 workflows) */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); clearImportData(); }} title="Import Data" wide>
        <div style={{ marginBottom: 16 }}>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #2a2a3a", paddingBottom: 8 }}>
            {[["items", "Item Master"], ["bom", "Assemblies / BOM"], ["qty", "Inventory Qty"]].map(([k, lbl]) => (
              <button key={k} onClick={() => switchImportTab(k)} style={{ ...B2, background: importTab === k ? "#6366f1" : "#2a2a3a", color: importTab === k ? "#fff" : "#999", borderColor: importTab === k ? "#6366f1" : "#333", fontSize: 12, padding: "6px 14px" }}>{lbl}</button>
            ))}
          </div>

          {/* File upload (shared) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <label style={{ ...B2, cursor: "pointer", fontSize: 12 }}><Upload size={12} /> {importData ? importData.fileName : "Choose CSV File"}<input type="file" accept=".csv" onChange={handleImportFile} style={{ display: "none" }} /></label>
            {importData && <span style={{ fontSize: 12, color: "#888" }}>{importData.rows.length} rows found</span>}
          </div>

          {/* ===== ITEM MASTER TAB ===== */}
          {importTab === "items" && (
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Upload SKUs with metadata (name, category, cost, supplier, etc). Quantities are <strong style={{ color: "#f59e0b" }}>not</strong> updated here - use the Inventory Qty tab for that.</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#888" }}>Mode:</span>
                <select value={importMode} onChange={(e) => setImportMode(e.target.value)} style={{ ...IS, width: "auto", minWidth: 180 }}>
                  <option value="update_add">Update existing + add new</option>
                  <option value="add_only">Add new SKUs only (skip existing)</option>
                </select>
              </div>
              {importData && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>Column Mapping</div>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>Match CSV columns to item fields. Unmapped columns will be skipped.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "6px 12px", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: "#555", fontWeight: 600 }}>CSV COLUMN</div>
                    <div></div>
                    <div style={{ fontSize: 10, color: "#555", fontWeight: 600 }}>MAPS TO</div>
                    {importData.headers.map((h) => (
                      <React.Fragment key={h}>
                        <div style={{ fontSize: 12, color: "#e0e0e0", padding: "4px 8px", background: "#16161e", borderRadius: 4, fontFamily: "monospace" }}>{h}</div>
                        <div style={{ color: "#555", fontSize: 13 }}>&#8594;</div>
                        <select value={importMapping[h] || "skip"} onChange={(e) => setImportMapping((prev) => ({ ...prev, [h]: e.target.value }))} style={{ ...IS, padding: "5px 8px", fontSize: 12, background: importMapping[h] && importMapping[h] !== "skip" ? "#1a2a1a" : "#16161e", borderColor: importMapping[h] && importMapping[h] !== "skip" ? "#2a4a2a" : "#333" }}>
                          <option value="skip">-- Skip --</option>
                          {APP_FIELDS.map((f) => (<option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>))}
                        </select>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>Preview (first 5 rows)</div>
                  <div style={{ overflowX: "auto", border: "1px solid #2a2a3a", borderRadius: 8, marginBottom: 12 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr>{APP_FIELDS.filter((f) => Object.values(importMapping).includes(f.key)).map((f) => (<th key={f.key} style={{ ...TH, fontSize: 10, padding: "5px 6px" }}>{f.label}</th>))}</tr></thead>
                      <tbody>{importData.rows.slice(0, 5).map((row, i) => (<tr key={i}>{APP_FIELDS.filter((f) => Object.values(importMapping).includes(f.key)).map((f) => { const csvCol = Object.entries(importMapping).find(([_, v]) => v === f.key)?.[0]; return <td key={f.key} style={{ ...TD, fontSize: 11, padding: "5px 6px", color: row[csvCol] ? "#ccc" : "#555" }}>{row[csvCol] || "\u2014"}</td>; })}</tr>))}</tbody>
                    </table>
                  </div>
                  {!Object.values(importMapping).includes("id") && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>&#9888; ProductCode (ID) must be mapped</div>}
                  {!Object.values(importMapping).includes("name") && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>&#9888; Name must be mapped</div>}
                </>
              )}
            </div>
          )}

          {/* ===== BOM / ASSEMBLIES TAB ===== */}
          {importTab === "bom" && (
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Upload assembly structures. CSV should have columns for Parent SKU, Component SKU, and Qty per assembly.</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#888" }}>Mode:</span>
                <select value={importMode} onChange={(e) => setImportMode(e.target.value)} style={{ ...IS, width: "auto", minWidth: 220 }}>
                  <option value="replace">Replace BOM for parents in file</option>
                  <option value="merge">Merge / add components to existing BOM</option>
                </select>
              </div>
              {importData && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>Map Columns</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {[["parent", "Parent SKU"], ["component", "Component SKU"], ["qty", "Qty Per Assembly"]].map(([k, lbl]) => (
                      <div key={k}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>{lbl}</label>
                        <select value={bomColMap[k] || ""} onChange={(e) => setBomColMap((p) => ({ ...p, [k]: e.target.value }))} style={{ ...IS, fontSize: 12, background: bomColMap[k] ? "#1a2a1a" : "#16161e", borderColor: bomColMap[k] ? "#2a4a2a" : "#333" }}>
                          <option value="">-- Select --</option>
                          {importData.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {bomColMap.parent && bomColMap.component && bomColMap.qty && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>Preview (first 8 rows)</div>
                      <div style={{ overflowX: "auto", border: "1px solid #2a2a3a", borderRadius: 8, marginBottom: 12 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead><tr><th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>Parent SKU</th><th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>Component SKU</th><th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>Qty</th></tr></thead>
                          <tbody>{importData.rows.slice(0, 8).map((row, i) => (<tr key={i}><td style={{ ...TD, fontSize: 11, padding: "5px 8px" }}>{row[bomColMap.parent] || "\u2014"}</td><td style={{ ...TD, fontSize: 11, padding: "5px 8px" }}>{row[bomColMap.component] || "\u2014"}</td><td style={{ ...TD, fontSize: 11, padding: "5px 8px" }}>{row[bomColMap.qty] || "\u2014"}</td></tr>))}</tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {(!bomColMap.parent || !bomColMap.component || !bomColMap.qty) && <div style={{ color: "#f59e0b", fontSize: 12 }}>&#9888; All 3 columns must be mapped</div>}
                </>
              )}
            </div>
          )}

          {/* ===== INVENTORY QTY TAB ===== */}
          {importTab === "qty" && (
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Mass-update inventory quantities by SKU. CSV should have columns for SKU, Qty, and optionally Batch/Lot # and Location. Multiple rows per SKU are supported and will be aggregated. Unknown SKUs will be auto-added to Item Master.</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#888" }}>Mode:</span>
                <select value={importMode} onChange={(e) => { setImportMode(e.target.value); setReplaceAllConfirm(false); }} style={{ ...IS, width: "auto", minWidth: 240 }}>
                  <option value="update_listed">Update listed SKUs only</option>
                  {isAdmin && <option value="full_replace">Full replace (zero ALL, CSV is truth)</option>}
                </select>
              </div>
              {importMode === "full_replace" && (
                <div style={{ background: "#3a1a1a", border: "1px solid #ef4444", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>&#9888; Full Replace Mode</div>
                  <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10, lineHeight: 1.5 }}>This will <strong>zero out ALL inventory quantities and lots</strong> for every SKU, then set only the quantities from this CSV. SKUs not in the CSV will have qty = 0. No item master data or BOM structures are affected.</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={replaceAllConfirm} onChange={(e) => setReplaceAllConfirm(e.target.checked)} style={{ accentColor: "#ef4444", width: 16, height: 16 }} />
                    <span style={{ fontSize: 12, color: "#fca5a5" }}>I understand all existing quantities will be zeroed and replaced</span>
                  </label>
                </div>
              )}
              {importData && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 8 }}>Map Columns</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {[["sku", "SKU / Product Code *"], ["qty", "Quantity *"], ["batch", "Batch / Lot # (optional)"], ["location", "Location (optional)"]].map(([k, lbl]) => (
                      <div key={k}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>{lbl}</label>
                        <select value={qtyColMap[k] || ""} onChange={(e) => setQtyColMap((p) => ({ ...p, [k]: e.target.value }))} style={{ ...IS, fontSize: 12, background: qtyColMap[k] ? "#1a2a1a" : "#16161e", borderColor: qtyColMap[k] ? "#2a4a2a" : "#333" }}>
                          <option value="">{k === "batch" || k === "location" ? "-- None --" : "-- Select --"}</option>
                          {importData.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {!qtyColMap.batch && <div style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>No lot # column mapped - inventory will be recorded without lot numbers.</div>}
                  {qtyColMap.sku && qtyColMap.qty && (() => {
                    const previewRows = importData.rows.slice(0, 10).map((row) => {
                      const sku = (row[qtyColMap.sku] || "").trim();
                      const qty = Number((row[qtyColMap.qty] || "").replace(/[^0-9.\-]/g, "")) || 0;
                      const batch = qtyColMap.batch ? (row[qtyColMap.batch] || "").trim() : "";
                      const loc = qtyColMap.location ? (row[qtyColMap.location] || "").trim() : "";
                      const existing = allItems.find((i) => i.id === sku);
                      return { sku, qty, batch, loc, name: existing?.name || "", found: !!existing };
                    });
                    return (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>Preview (first 10 rows)</div>
                        <div style={{ overflowX: "auto", border: "1px solid #2a2a3a", borderRadius: 8, marginBottom: 12 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr>
                              <th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>SKU</th>
                              <th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>Name</th>
                              {qtyColMap.batch && <th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>Batch #</th>}
                              {qtyColMap.location && <th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>Location</th>}
                              <th style={{ ...TH, fontSize: 10, padding: "5px 8px" }}>Qty</th>
                            </tr></thead>
                            <tbody>{previewRows.map((r, i) => (
                              <tr key={i}>
                                <td style={{ ...TD, fontSize: 11, padding: "5px 8px", fontFamily: "monospace" }}>{r.sku}</td>
                                <td style={{ ...TD, fontSize: 11, padding: "5px 8px", color: r.found ? "#ccc" : "#f59e0b" }}>{r.found ? r.name : "NEW"}</td>
                                {qtyColMap.batch && <td style={{ ...TD, fontSize: 11, padding: "5px 8px", color: r.batch ? "#a78bfa" : "#555" }}>{r.batch || "\u2014"}</td>}
                                {qtyColMap.location && <td style={{ ...TD, fontSize: 11, padding: "5px 8px", color: r.loc ? "#38bdf8" : "#555" }}>{r.loc || "\u2014"}</td>}
                                <td style={{ ...TD, fontSize: 11, padding: "5px 8px", fontWeight: 600, color: "#22c55e" }}>{r.qty}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                  {(!qtyColMap.sku || !qtyColMap.qty) && <div style={{ color: "#f59e0b", fontSize: 12 }}>&#9888; Both SKU and Qty columns must be mapped</div>}
                </>
              )}
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #2a2a3a", paddingTop: 12 }}>
          <span style={{ fontSize: 11, color: "#666" }}>
            {importTab === "items" && importData ? `${Object.values(importMapping).filter((v) => v && v !== "skip").length} of ${importData.headers.length} columns mapped` : ""}
            {importTab === "bom" && importData ? `${bomColMap.parent && bomColMap.component && bomColMap.qty ? "3/3" : Object.values(bomColMap).filter(Boolean).length + "/3"} columns mapped` : ""}
            {importTab === "qty" && importData ? `${[qtyColMap.sku, qtyColMap.qty].filter(Boolean).length}/2 required mapped${qtyColMap.batch ? " + batch" : ""}${qtyColMap.location ? " + location" : ""}` : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setImportOpen(false); clearImportData(); }} style={B2}>Cancel</button>
            {importTab === "items" && (
              <button onClick={executeItemImport} disabled={!importData || !Object.values(importMapping).includes("id") || !Object.values(importMapping).includes("name")} style={{ ...B1, opacity: (!importData || !Object.values(importMapping).includes("id") || !Object.values(importMapping).includes("name")) ? 0.4 : 1 }}>Import Items</button>
            )}
            {importTab === "bom" && (
              <button onClick={executeBomImport} disabled={!importData || !bomColMap.parent || !bomColMap.component || !bomColMap.qty} style={{ ...B1, opacity: (!importData || !bomColMap.parent || !bomColMap.component || !bomColMap.qty) ? 0.4 : 1 }}>Import BOM</button>
            )}
            {importTab === "qty" && (
              <button onClick={executeQtyImport} disabled={!importData || !qtyColMap.sku || !qtyColMap.qty || (importMode === "full_replace" && !replaceAllConfirm)} style={{ ...B1, background: importMode === "full_replace" ? "#dc2626" : undefined, borderColor: importMode === "full_replace" ? "#dc2626" : undefined, opacity: (!importData || !qtyColMap.sku || !qtyColMap.qty || (importMode === "full_replace" && !replaceAllConfirm)) ? 0.4 : 1 }}>{importMode === "full_replace" ? "Replace All Qty" : "Update Quantities"}</button>
            )}
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

      {/* Delete User Confirm */}
      <Modal open={delUserConfirm !== null} onClose={() => setDelUserConfirm(null)} title="Remove User">
        <p style={{ color: "#ccc", margin: "0 0 20px", fontSize: 14 }}>
          Remove <strong>{delUserConfirm?.email}</strong>{delUserConfirm?.name ? ` (${delUserConfirm.name})` : ""}? They will no longer be able to use this app. This cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setDelUserConfirm(null)} style={B2}>Cancel</button>
          <button onClick={() => delUser(delUserConfirm.id)} style={{ ...B1, background: "#dc2626" }}>Remove</button>
        </div>
      </Modal>

      {/* Wish Modal */}
      <Modal open={wishModal} onClose={() => setWishModal(false)} title="">
        <div style={{ textAlign: "center", paddingTop: 8 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🧞</div>
          <h2 style={{ margin: "0 0 4px", fontSize: 20, background: "linear-gradient(135deg, #fbbf24, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>What do you wish for?</h2>
          <p style={{ color: "#888", fontSize: 12, margin: "0 0 20px" }}>
            You have {MAX_WISHES - wishesUsed} wish{MAX_WISHES - wishesUsed !== 1 ? "es" : ""} remaining. Describe a feature or capability you would love to see.
          </p>
          <textarea value={wishText} onChange={e => setWishText(e.target.value)} placeholder="I wish for..." rows={4} style={{ ...IS, resize: "vertical", fontSize: 14, lineHeight: 1.5, textAlign: "left" }} />
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button onClick={() => setWishModal(false)} style={B2}>Nevermind</button>
            <button onClick={submitWish} disabled={!wishText.trim()} style={{ ...B1, background: "linear-gradient(135deg, #fbbf24, #d97706)", color: "#000", opacity: wishText.trim() ? 1 : 0.4 }}>
              <Sparkles size={14} /> Grant My Wish
            </button>
          </div>
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

      </>)}
    </div>
  );
}
