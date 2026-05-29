// APP VERSION: v171
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  fetchItems, upsertItem, discontinueItem, restoreItem, bulkInsertItems,
  fetchBomLines, setBomForAssembly,
  fetchVendors, upsertVendor, deleteVendor as dbDeleteVendor,
  fetchItemVendors, setItemVendors,
  fetchLaborHours, upsertLaborHours,
  fetchToastJobs, setToastJobCategory,
  fetchOrderLotAllocations, createOrderLotAllocations, deleteOrderLotAllocations, deleteOrderLotAllocation,
  fetchOrders, upsertOrder, deleteOrder as dbDeleteOrder,
  fetchPurchaseOrders, createPurchaseOrder, updatePOStatus, updatePOLines, deletePO as dbDeletePO,
  fetchReceipts, createReceipt, updateItemQty,
  fetchProductionRuns, createProductionRun, updateProductionRun, deleteProductionRuns, fetchDraftRunsForWeek, fetchCompletedRunsForWeek, completeProductionRun, renameProductionRunLot,
  fetchInventoryLots, adjustLotQty,
  zeroAllInventory, bulkUpdateItemQtys,
  fetchWishes, createWish, countUserWishes, grantWish, ungrantWish, acknowledgeWish, fetchPendingGrantedWishes,
  signIn, signUp, signOut, getSession, getProfile, updateProfile, fetchProfiles, deleteProfile as dbDeleteProfile,
  getInviteCode, setInviteCode, getLocations, getConfig, saveConfig, changePassword, supabase, fetchFullBackup,
  DEFAULT_BASE_INGREDIENTS, digitForProductLine, formatLotNumber, padLotNumber, dateToMMDDYY,
} from "./supabase";

// Icons — install lucide-react: npm install lucide-react
import {
  Package, AlertTriangle, Search, Plus, Edit2, Trash2, Download, Upload,
  X, ChevronDown, ChevronRight, DollarSign, CheckCircle, Layers,
  ShoppingCart, ClipboardList, Minus, FileText, Printer, Building2, Loader2, PackageCheck, Hammer, Users, LogOut, Lock, KeyRound,
  ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronsUpDown, ScrollText, Settings, Sparkles, TrendingUp, TrendingDown, ChevronLeft, Calendar, LayoutDashboard, BarChart3, Activity, Minus as MinusIcon, Menu, Truck,
} from "lucide-react";

import { LineChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

// ============================================================
// CONSTANTS
// ============================================================

// Format a Date as YYYY-MM-DD in the USER'S LOCAL TIMEZONE.
// IMPORTANT: never use `todayLocal()` for a date stamp —
// that returns UTC, so records created after ~7-8pm Eastern get tagged with
// tomorrow's date. Use this helper instead for anything that represents a
// calendar date (PO date, receipt date, order date, etc.). Full timestamps
// (createdAt / updatedAt) are still fine as ISO since the browser will display
// them in local time.
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
const DEFAULT_ORD_STATUSES = ["Pending", "Confirmed", "In Production", "Partially Fulfilled", "Fulfilled", "Cancelled"];
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

function Modal({ open, onClose, title, children, wide, hideCloseX }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={hideCloseX ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1e1e2e", borderRadius: 12, padding: 24, width: "95%", maxWidth: wide ? 780 : 520, maxHeight: "88vh", overflow: "auto", border: "1px solid #333" }}>
        {(title || !hideCloseX) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: title ? 20 : 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: "#e0e0e0" }}>{title}</h2>
            {!hideCloseX && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 4 }}><X size={20} /></button>}
          </div>
        )}
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

// Searchable SKU picker. Replaces native <select> for any item dropdown so users
// can type a few letters and pick from a filtered list instead of scrolling.
//
// Props:
//   value     — currently selected item id (string)
//   onChange  — called with the picked item id
//   skuOpts   — array of items to choose from. Each item must have { id, name }.
//   placeholder, style, inputStyle, disabled — optional cosmetics
function SkuAutocomplete({ value, onChange, skuOpts, placeholder = "Type to search SKU…", style, inputStyle, disabled }) {
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
    <div style={{ position: "relative", ...(style || {}) }}>
      <input value={inputVal} placeholder={placeholder} disabled={disabled}
        onChange={e => { setInputVal(e.target.value); setUserTyping(true); setOpen(true); }}
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        onBlur={() => { setTimeout(() => { setOpen(false); setUserTyping(false); }, 200); }}
        style={{ ...IS_AC, ...(inputStyle || {}) }}
      />
      {open && filtered.length > 0 && !disabled && (
        <div style={{ position: "absolute", top: "100%", left: 0, minWidth: 320, maxWidth: "min(500px, 90vw)", zIndex: 100, background: "#1e1e2e", border: "1px solid #444", borderRadius: 6, maxHeight: 300, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          {filtered.slice(0, 100).map(item => (
            <div key={item.id}
              onMouseDown={() => { onChange(item.id); setInputVal(item.id); setUserTyping(false); setOpen(false); }}
              style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #2a2a3a", color: "#e0e0e0" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#2a2a3a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8b5cf6" }}>{item.id}</span>
              <span style={{ color: "#ccc", marginLeft: 8 }}>{item.name}</span>
            </div>
          ))}
          {filtered.length > 100 && (
            <div style={{ padding: "6px 10px", fontSize: 11, color: "#666", fontStyle: "italic" }}>{filtered.length - 100} more — keep typing to narrow</div>
          )}
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
  // Items with status="Discontinued" — soft-deleted but kept in DB so historical
  // BOMs, receipts, production runs, etc. still reference a valid row.
  const [discontinuedItems, setDiscontinuedItems] = useState([]);
  const [showDiscontinued, setShowDiscontinued] = useState(false);
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
  const [manualPOForm, setManualPOForm] = useState({ vendor: "", notes: "", expectedReceiptDate: "" });
  const [manualPOLines, setManualPOLines] = useState([]);
  // Edit existing (unreceived) PO: add / remove / change line items
  const [editPOModal, setEditPOModal] = useState(null); // PO object or null
  const [editPOLines, setEditPOLines] = useState([]);
  const [editPONotes, setEditPONotes] = useState("");
  const [editPOExpectedDate, setEditPOExpectedDate] = useState("");
  const [editPOSubmitting, setEditPOSubmitting] = useState(false);
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

  // Labor hours per week (admin-entered) for the Performance tab
  const [laborHours, setLaborHours] = useState([]); // [{ weekStart, manufacturingHours, allInHours, notes }]
  // Toast job → category mapping for auto-pulled labor
  const [toastJobs, setToastJobs] = useState([]); // [{ jobGuid, jobTitle, category }]
  const [toastSyncing, setToastSyncing] = useState(false);

  // Lot allocations linking customer order lines to specific inventory lots
  const [orderLotAllocations, setOrderLotAllocations] = useState([]);
  // Fulfillment modal state
  const [fulfillModal, setFulfillModal] = useState(null); // { lines: [order lines], orderId? }
  const [fulfillRows, setFulfillRows] = useState([]); // [{ orderId, itemId, lineQty, allocations: [{lotNumber, qty}] }]
  const [fulfillSubmitting, setFulfillSubmitting] = useState(false);
  // Lot Tracking tab state
  const [lotSearchQuery, setLotSearchQuery] = useState("");
  const [lotAllocateForm, setLotAllocateForm] = useState({ lotNumber: "", itemId: "", orderId: "", qty: 0 });
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState({});
  // Transaction log: per-row drill-down toggle + CSV export date range
  const [txExpanded, setTxExpanded] = useState({});
  const [txExportFrom, setTxExportFrom] = useState("");
  const [txExportTo, setTxExportTo] = useState("");
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
  // Celebration: list of unacknowledged granted wishes for this user. When non-empty,
  // the WishGrantedModal pops up automatically with a carousel.
  const [grantedWishes, setGrantedWishes] = useState([]);
  const [grantedIdx, setGrantedIdx] = useState(0);
  const [allWishes, setAllWishes] = useState([]);
  const MAX_WISHES = 3;

  // ---- Planning / Forecast State ----
  const [forecastConfig, setForecastConfig] = useState({ horizonWeeks: 4, lookbackWeeks: 8, workDays: ["Mon","Tue","Wed","Thu","Fri"], mrpDemandLevels: [250] });
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
  // Admin-only: edit lot # on a completed run (typo / wrong lot correction)
  const [editLotModal, setEditLotModal] = useState(null);   // run object or null
  const [editLotValue, setEditLotValue] = useState("");
  const [editLotSubmitting, setEditLotSubmitting] = useState(false);
  // Admin-only: full DB backup
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupProgress, setBackupProgress] = useState({ table: "", rows: 0, done: 0 });
  const [lastBackupAt, setLastBackupAt] = useState(null);
  // When editing a draft we re-use the prod* states so the same consumption tree
  // and lot picker UI from the Complete modal can be shown. editingDraftId tracks
  // which draft is being edited; null = not editing.
  const [editingDraftId, setEditingDraftId] = useState(null);
  // Snapshot of the lot # the draft had when Edit was opened — used to detect
  // when a source lot changed so we can cascade-clear dependent drafts.
  const [editOriginalLot, setEditOriginalLot] = useState("");

  // ---- Dashboard State ----
  const [dailyNote, setDailyNote] = useState({ text: "", updatedAt: null, updatedBy: "" });
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(typeof window !== "undefined" ? window.innerWidth < 900 : false);
  // Col 1 (Production Plan + Inventory) drives the dashboard row height via
  // align-items:stretch on the grid; cols 2 and 3 use position:absolute children
  // so they don't contribute to row sizing — pure CSS, no measurement needed.
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
        // Split discontinued items into a separate bucket so they stay hidden
        // from active lists/dropdowns. They're still in the DB so historical
        // records (BOMs, runs, receipts) continue pointing to a valid row.
        const activeItems = dbItems.filter(i => i.status !== "Discontinued");
        const discontinued = dbItems.filter(i => i.status === "Discontinued").map(a => assemblyIds.has(a.id) ? {
          ...a, bom: dbBom.filter(b => b.assemblyId === a.id).map(b => ({ partId: b.partId, qty: b.qty })),
        } : a);
        const rawMats = activeItems.filter((i) => !assemblyIds.has(i.id));
        const asms = activeItems.filter((i) => assemblyIds.has(i.id)).map((a) => ({
          ...a,
          bom: dbBom.filter((b) => b.assemblyId === a.id).map((b) => ({ partId: b.partId, qty: b.qty })),
        }));
        setParts(rawMats); setAssemblies(asms); setDiscontinuedItems(discontinued);
        if (dbVendors.length > 0) setVendors(dbVendors);
        if (dbOrders.length > 0) setOrders(dbOrders);
        if (dbPOs.length > 0) setPOs(dbPOs);
      }
      fetchReceipts().then(r => setReceipts(r)).catch(() => {});
      fetchProductionRuns().then(r => setProdRuns(r)).catch(() => {});
      fetchInventoryLots().then(r => setLots(r)).catch(() => {});
      fetchItemVendors().then(r => setItemVendorsState(r)).catch(() => {});
      fetchLaborHours().then(r => setLaborHours(r)).catch(() => {});
      fetchToastJobs().then(r => setToastJobs(r)).catch(() => {});
      fetchOrderLotAllocations().then(r => setOrderLotAllocations(r)).catch(() => {});
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
      getConfig("last_backup_at").then(r => { if (r) setLastBackupAt(r); }).catch(() => {});
      getConfig("lot_base_ingredients").then(r => { if (Array.isArray(r) && r.length > 0) setBaseIngredients(r); }).catch(() => {});
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

  // Admins: load all wishes on login so we can show a count badge on the
  // Admin Config tab when there are ungranted wishes waiting for review.
  useEffect(() => {
    if (isAdmin) {
      fetchWishes().then(w => setAllWishes(w)).catch(() => {});
    }
  }, [isAdmin]);

  // Count of wishes still awaiting an admin decision (no grantedAt set).
  const pendingWishesCount = useMemo(
    () => allWishes.filter(w => !w.grantedAt).length,
    [allWishes],
  );

  // Wish-granted celebration: pop up the modal when this user has any granted
  // wishes that haven't been acknowledged. Triggered by:
  //   1) On-load query when authUser changes
  //   2) Supabase Realtime push from the wishes table (fires within ~1s of the
  //      admin clicking "Grant")
  //   3) Tab visibility change (safety net for stale tabs / dropped sockets)
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const pending = await fetchPendingGrantedWishes(authUser.id);
        if (cancelled) return;
        if (pending.length > 0) {
          setGrantedWishes(pending);
          setGrantedIdx(0);
        }
      } catch (e) { console.warn("pending wishes fetch failed:", e.message); }
    };

    // 1) Initial check on auth
    refresh();

    // 2) Realtime: subscribe to wish updates for this user
    const channel = supabase
      .channel(`wishes-granted-${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wishes", filter: `user_id=eq.${authUser.id}` },
        () => { refresh(); }
      )
      .subscribe();

    // 3) When tab becomes visible again, re-check (in case the websocket dropped)
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [authUser]);

  // Acknowledge the current wish in the celebration carousel and advance.
  // Closes the modal when all are acknowledged.
  const acknowledgeCurrentWish = async () => {
    const cur = grantedWishes[grantedIdx];
    if (!cur) return;
    try { await acknowledgeWish(cur.id); } catch (e) { console.warn("acknowledge failed:", e.message); }
    if (grantedIdx + 1 >= grantedWishes.length) {
      setGrantedWishes([]);
      setGrantedIdx(0);
    } else {
      setGrantedIdx(prev => prev + 1);
    }
  };

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
  // Open the fulfillment modal pre-populated with FIFO-suggested allocations.
  // `lines` may be one (single-line ship) or many (whole-group ship).
  const openFulfillModal = (lines) => {
    const unshipped = lines.filter(o => o.status !== "Fulfilled" && o.status !== "Cancelled");
    if (unshipped.length === 0) { show("All lines already fulfilled", "error"); return; }
    // Build FIFO-suggested allocations for each line. Subtract previously-allocated
    // qty from already-saved allocations (in case partial fulfillment exists).
    const rows = unshipped.map(line => {
      const item = allItems.find(i => i.id === line.item);
      const isLotTracked = !!item?.lotTracking;
      const remaining = line.qty - allocatedQtyForLine(line.id);
      const allocations = [];
      if (isLotTracked && remaining > 0) {
        // FIFO: sort lots by oldest production date first
        const candidateLots = (lotsByItem[line.item] || [])
          .filter(l => l.qty > 0)
          .sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
        let need = remaining;
        for (const lot of candidateLots) {
          if (need <= 0) break;
          const take = Math.min(lot.qty, need);
          allocations.push({
            lotNumber: lot.lotNumber,
            qty: take,
            productionDate: lot.productionDate || "",
            availableInLot: lot.qty,
          });
          need -= take;
        }
      }
      // How much of this line can't be covered by existing lots — that's what
      // a backfill production would need to make up. (Non-lot-tracked items
      // never need backfill.)
      const allocatedAfterFIFO = allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
      const shortfall = isLotTracked ? Math.max(0, remaining - allocatedAfterFIFO) : 0;
      // Pre-compute a backfill chain for the shortfall qty; null if no path
      // through existing lots exists (or if not lot-tracked / no shortage).
      const backfillChain = (isLotTracked && shortfall > 0) ? findBackfillChain(line.item, shortfall) : null;
      return {
        line,
        item,
        isLotTracked,
        remaining,
        allocations,
        backfillChain,
        backfill: backfillChain ? {
          enabled: false,
          sourceLot: "",
          date: line.shipDate || todayLocal(),
        } : null,
      };
    });
    setFulfillRows(rows);
    setFulfillModal({ orderId: lines[0]?.id, lines: unshipped });
  };

  // Toggle / update the backfill subsection on a fulfill row.
  const updateFulfillBackfill = (rowIdx, patch) => {
    setFulfillRows(prev => prev.map((r, i) => {
      if (i !== rowIdx || !r.backfill) return r;
      return { ...r, backfill: { ...r.backfill, ...patch } };
    }));
  };

  const updateFulfillAllocation = (rowIdx, allocIdx, patch) => {
    setFulfillRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      return { ...r, allocations: r.allocations.map((a, j) => j === allocIdx ? { ...a, ...patch } : a) };
    }));
  };

  const addFulfillAllocation = (rowIdx) => {
    setFulfillRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      return { ...r, allocations: [...r.allocations, { lotNumber: "", qty: 0, productionDate: "", availableInLot: 0 }] };
    }));
  };

  const removeFulfillAllocation = (rowIdx, allocIdx) => {
    setFulfillRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      return { ...r, allocations: r.allocations.filter((_, j) => j !== allocIdx) };
    }));
  };

  // Save allocations + decrement lot inventory + decrement item.qty + mark
  // lines fulfilled. Lines that weren't fully allocated stay open (the order
  // group will read as "Partially Fulfilled" via computeGroupStatus).
  //
  // Backfill-at-ship: if a row has row.backfill.enabled, we first execute the
  // backfill production chain (deepest-first) using the user-picked source lot
  // and inheriting that lot # all the way up. Then we add a new allocation to
  // the row pointing at the just-produced lot. Phase B (existing allocation
  // logic) then runs against the post-backfill local mirrors.
  const confirmFulfillment = async () => {
    setFulfillSubmitting(true);
    try {
      // Local mirrors. Everything mutates these; setState at the very end.
      let updParts = [...parts];
      let updAsm = [...assemblies];
      const updLots = lots.map(l => ({ ...l }));
      const newProdRuns = [];
      let rowsForUpdate = [...fulfillRows];

      // ==== PHASE A — Backfill production ====
      for (let rowIdx = 0; rowIdx < rowsForUpdate.length; rowIdx += 1) {
        const row = rowsForUpdate[rowIdx];
        if (!row.backfill?.enabled || !row.backfillChain || !row.backfill.sourceLot) continue;
        const chain = row.backfillChain;
        const inheritedLot = row.backfill.sourceLot;
        const runDate = row.backfill.date || todayLocal();
        // Validate deepest source has enough on hand
        const deepest = chain[0];
        const srcLot = updLots.find(l => l.itemId === deepest.consumedId && l.lotNumber === inheritedLot);
        if (!srcLot || srcLot.qty < deepest.consumedQty) {
          throw new Error(`Backfill failed for ${row.item?.name || row.line.item}: lot ${inheritedLot} of ${deepest.consumedId} has ${srcLot?.qty || 0} on hand, need ${deepest.consumedQty}.`);
        }
        // Execute each step deepest-first. Each step produces `step.producedQty`
        // of `step.producedId`, consuming its full BOM. The same-flavor primary
        // is deducted specifically from `inheritedLot`; other lot-tracked
        // components fall back to FIFO.
        for (const step of chain) {
          const stepItem = allItems.find(i => i.id === step.producedId);
          if (!stepItem) throw new Error(`Backfill: assembly ${step.producedId} not found.`);
          const consumed = [];
          for (const bom of (stepItem.bom || [])) {
            const cQty = bom.qty * step.producedQty;
            const bomItem = allItems.find(i => i.id === bom.partId);
            consumed.push({ partId: bom.partId, name: bomItem?.name || bom.partId, qty: cQty, unit: bomItem?.unit || "" });
            // Deduct part / asm qty
            const pi = updParts.findIndex(p => p.id === bom.partId);
            if (pi >= 0) { updParts[pi] = { ...updParts[pi], qty: updParts[pi].qty - cQty }; try { await updateItemQty(bom.partId, updParts[pi].qty); } catch (e) { console.warn(e.message); } }
            const ai = updAsm.findIndex(a => a.id === bom.partId);
            if (ai >= 0) { updAsm[ai] = { ...updAsm[ai], qty: updAsm[ai].qty - cQty }; try { await updateItemQty(bom.partId, updAsm[ai].qty); } catch (e) { console.warn(e.message); } }
            // Deduct lot
            if (flavorOfId(bom.partId) === flavorOfId(step.producedId)) {
              const lotRow = updLots.find(l => l.itemId === bom.partId && l.lotNumber === inheritedLot);
              if (lotRow) {
                lotRow.qty = Math.max(0, lotRow.qty - cQty);
                try { await adjustLotQty(bom.partId, inheritedLot, -cQty, null, null); } catch (e) { console.warn("Lot deduct failed:", e.message); }
              }
            } else if (bomItem?.lotTracking) {
              const candidates = updLots.filter(l => l.itemId === bom.partId && l.qty > 0).sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
              let remain = cQty;
              for (const lot of candidates) {
                if (remain <= 0) break;
                const take = Math.min(lot.qty, remain);
                lot.qty -= take;
                remain -= take;
                try { await adjustLotQty(bom.partId, lot.lotNumber, -take, null, null); } catch (e) { console.warn("Lot deduct failed:", e.message); }
              }
            }
          }
          // Add produced item to qty + lot
          const prodAi = updAsm.findIndex(a => a.id === step.producedId);
          if (prodAi >= 0) {
            updAsm[prodAi] = { ...updAsm[prodAi], qty: updAsm[prodAi].qty + step.producedQty };
            try { await updateItemQty(step.producedId, updAsm[prodAi].qty); } catch (e) { console.warn(e.message); }
          }
          const existingLot = updLots.find(l => l.itemId === step.producedId && l.lotNumber === inheritedLot);
          if (existingLot) existingLot.qty += step.producedQty;
          else updLots.push({ id: Date.now() + Math.random(), itemId: step.producedId, lotNumber: inheritedLot, qty: step.producedQty, productionDate: runDate, sourceRunId: null });
          try { await adjustLotQty(step.producedId, inheritedLot, step.producedQty, runDate, null); } catch (e) { console.warn("Lot add failed:", e.message); }
          // Create production_run record
          const runId = `PROD-${runDate}-${String(prodRuns.length + newProdRuns.length + 1).padStart(3, "0")}`;
          const run = {
            id: runId, assemblyId: step.producedId, assemblyName: stepItem.name,
            qtyProduced: step.producedQty, date: runDate, lotNumber: inheritedLot,
            notes: `Backfill at ship time for order line ${row.line.id}`,
            createdBy: profile?.email || "", consumed, status: "Complete",
          };
          newProdRuns.push({ ...run, createdAt: new Date().toISOString() });
          try { await createProductionRun(run); } catch (e) { console.warn("Prod save failed:", e.message); }
        }
        // After the chain finishes, the produced top-level item has a fresh lot
        // entry in updLots. Add an allocation for the row's shortfall so Phase B
        // sees it as a regular pre-allocated line.
        const allocatedSoFar = row.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
        const shortfall = Math.max(0, row.remaining - allocatedSoFar);
        rowsForUpdate[rowIdx] = {
          ...row,
          allocations: [
            ...row.allocations,
            { lotNumber: inheritedLot, qty: shortfall, productionDate: runDate, availableInLot: shortfall },
          ],
        };
      }
      if (newProdRuns.length > 0) setProdRuns(prev => [...newProdRuns, ...prev]);

      // ==== PHASE B — Allocations + ship (existing logic, now reading from rowsForUpdate + updLots) ====
      const allocRowsToInsert = [];
      const lineUpdates = []; // { line, fullyAllocated }
      for (const row of rowsForUpdate) {
        const totalAllocated = row.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
        const isFullyAllocated = totalAllocated >= row.line.qty;
        for (const alloc of row.allocations) {
          if (alloc.lotNumber && alloc.qty > 0) {
            allocRowsToInsert.push({
              orderId: row.line.id,
              itemId: row.line.item,
              lotNumber: alloc.lotNumber,
              qtyAllocated: Number(alloc.qty),
              locationFrom: row.item?.location || "Dumpling Factory",
              allocatedBy: profile?.email || "",
            });
          }
        }
        lineUpdates.push({ line: row.line, fullyAllocated: isFullyAllocated, totalAllocated });
      }

      // 1) Insert allocation rows
      let inserted = [];
      if (allocRowsToInsert.length > 0) {
        try { inserted = await createOrderLotAllocations(allocRowsToInsert); }
        catch (e) { throw new Error(`Allocation save failed: ${e.message}`); }
        setOrderLotAllocations(prev => [...prev, ...inserted]);
      }

      // 2) Decrement inventory_lots qty (mutate updLots in place)
      for (const a of allocRowsToInsert) {
        const lot = updLots.find(l => l.itemId === a.itemId && l.lotNumber === a.lotNumber);
        if (lot) {
          lot.qty = Math.max(0, lot.qty - a.qtyAllocated);
          try { await adjustLotQty(a.itemId, a.lotNumber, -a.qtyAllocated, null, null); }
          catch (e) { console.warn("Lot deduct failed:", e.message); }
        }
      }
      setLots(updLots.filter(l => l.qty > 0));

      // 3) Decrement item.qty for fully-allocated lines (matches old ship behavior).
      //    Apply against the post-backfill local mirrors so we don't lose the
      //    backfill's qty changes when setState fires.
      for (const u of lineUpdates) {
        if (!u.fullyAllocated) continue;
        const it = allItems.find(i => i.id === u.line.item);
        if (!it) continue;
        const pi = updParts.findIndex(p => p.id === it.id);
        if (pi >= 0) { updParts[pi] = { ...updParts[pi], qty: updParts[pi].qty - u.line.qty }; try { await updateItemQty(it.id, updParts[pi].qty); } catch (e) { console.warn(e.message); } }
        const ai = updAsm.findIndex(a => a.id === it.id);
        if (ai >= 0) { updAsm[ai] = { ...updAsm[ai], qty: updAsm[ai].qty - u.line.qty }; try { await updateItemQty(it.id, updAsm[ai].qty); } catch (e) { console.warn(e.message); } }
      }
      setParts(updParts);
      setAssemblies(updAsm);

      // 4) Mark fully-allocated lines as Fulfilled
      for (const u of lineUpdates) {
        if (!u.fullyAllocated) continue;
        const updated = { ...u.line, status: "Fulfilled" };
        setOrders(prev => prev.map(x => x.id === u.line.id ? updated : x));
        try { await upsertOrder(updated); } catch (e) { console.warn("Order update failed:", e.message); }
      }

      // 5) Log the shipment to the transaction log (one receipt per order line).
      // Receipt lines mirror the lot allocations so each lot consumed shows up as
      // its own movement in the transaction log drill-down.
      const shippedLines = lineUpdates.filter(u => u.fullyAllocated);
      for (let si = 0; si < shippedLines.length; si += 1) {
        const u = shippedLines[si];
        const it = allItems.find(i => i.id === u.line.item);
        const customer = u.line.customer || "?";
        // Build receipt lines from the row's allocations so each lot is its own
        // line. Use rowsForUpdate (post-backfill) so a backfill-produced lot
        // shows up in the receipt's lot trace.
        const row = rowsForUpdate.find(r => r.line.id === u.line.id);
        const allocLines = (row?.allocations || [])
          .filter(a => a.lotNumber && Number(a.qty) > 0)
          .map(a => ({
            partId: u.line.item, name: it?.name || u.line.item,
            qtyExpected: Number(a.qty), qtyReceived: Number(a.qty),
            unit: it?.unit || "", lotNumber: a.lotNumber,
          }));
        // Fallback for non-lot-tracked items (no allocations) — one summary line.
        const lines = allocLines.length > 0 ? allocLines : [{
          partId: u.line.item, name: it?.name || u.line.item,
          qtyExpected: u.line.qty, qtyReceived: u.line.qty,
          unit: it?.unit || "", lotNumber: "",
        }];
        const lotSummary = allocLines.length > 0
          ? ` from lot${allocLines.length === 1 ? "" : "s"} ${allocLines.map(l => l.lotNumber).join(", ")}`
          : "";
        const shipReceipt = {
          id: `SHIP-${Date.now()}-${si}`,
          poId: null,
          type: "Shipment",
          date: todayLocal(),
          notes: `Shipped ${u.line.qty} ${it?.name || u.line.item} to ${customer}${lotSummary}`,
          createdBy: profile?.email || "",
          lines,
        };
        setReceipts(prev => [{ ...shipReceipt, createdAt: new Date().toISOString() }, ...prev]);
        try { await createReceipt(shipReceipt); } catch (e) { console.warn("Shipment log failed:", e.message); }
      }

      const fulfilledCount = lineUpdates.filter(u => u.fullyAllocated).length;
      const partialCount = lineUpdates.filter(u => !u.fullyAllocated && u.totalAllocated > 0).length;
      let msg = `Fulfilled ${fulfilledCount} line${fulfilledCount === 1 ? "" : "s"}`;
      if (partialCount > 0) msg += ` (${partialCount} partial)`;
      show(msg);
      setFulfillModal(null);
      setFulfillRows([]);
    } catch (e) {
      show(e.message, "error");
    }
    setFulfillSubmitting(false);
  };

  // Reverse fulfillment for a single line: delete its allocations, restore
  // lot inventory + item.qty, set line status back to "In Production".
  const unfulfillOrderLine = async (line) => {
    const allocs = (allocationsByOrder.get(line.id) || []);
    if (!window.confirm(`Un-fulfill this line? This will restore ${allocs.length} lot allocation${allocs.length === 1 ? "" : "s"} back to inventory.`)) return;
    try {
      // Restore lot qty
      const updLots = [...lots];
      for (const a of allocs) {
        const lot = updLots.find(l => l.itemId === a.itemId && l.lotNumber === a.lotNumber);
        if (lot) lot.qty += a.qtyAllocated;
        else updLots.push({ id: Date.now() + Math.random(), itemId: a.itemId, lotNumber: a.lotNumber, qty: a.qtyAllocated, productionDate: null });
        try { await adjustLotQty(a.itemId, a.lotNumber, a.qtyAllocated, null, null); }
        catch (e) { console.warn("Lot restore failed:", e.message); }
      }
      setLots(updLots);
      // Restore item.qty (only if the line was fully fulfilled)
      if (line.status === "Fulfilled") {
        const it = allItems.find(i => i.id === line.item);
        if (it) {
          const newQty = it.qty + line.qty;
          const isPart = parts.some(p => p.id === it.id);
          if (isPart) setParts(prev => prev.map(p => p.id === it.id ? { ...p, qty: newQty } : p));
          else setAssemblies(prev => prev.map(a => a.id === it.id ? { ...a, qty: newQty } : a));
          try { await updateItemQty(it.id, newQty); } catch (e) { console.warn(e.message); }
        }
      }
      // Delete allocations
      try { await deleteOrderLotAllocations(line.id); } catch (e) { console.warn(e.message); }
      setOrderLotAllocations(prev => prev.filter(a => a.orderId !== line.id));
      // Revert line status
      const updated = { ...line, status: "In Production" };
      setOrders(prev => prev.map(x => x.id === line.id ? updated : x));
      try { await upsertOrder(updated); } catch (e) { console.warn(e.message); }
      // Log the reversal — one receipt line per restored lot so lot tracing
      // works end-to-end (the transaction log drill-down shows each lot).
      const it = allItems.find(i => i.id === line.item);
      const allocLines = allocs
        .filter(a => a.lotNumber && Number(a.qtyAllocated) > 0)
        .map(a => ({
          partId: line.item, name: it?.name || line.item,
          qtyExpected: Number(a.qtyAllocated), qtyReceived: Number(a.qtyAllocated),
          unit: it?.unit || "", lotNumber: a.lotNumber,
        }));
      const revLines = allocLines.length > 0 ? allocLines : [{
        partId: line.item, name: it?.name || line.item,
        qtyExpected: line.qty, qtyReceived: line.qty,
        unit: it?.unit || "", lotNumber: "",
      }];
      const lotSummary = allocLines.length > 0
        ? ` (lot${allocLines.length === 1 ? "" : "s"} ${allocLines.map(l => l.lotNumber).join(", ")} restored)`
        : "";
      const reversalReceipt = {
        id: `UNSHIP-${Date.now()}`,
        poId: null,
        type: "Shipment Reversal",
        date: todayLocal(),
        notes: `Un-fulfilled line for ${line.customer || "?"}${lotSummary}`,
        createdBy: profile?.email || "",
        lines: revLines,
      };
      setReceipts(prev => [{ ...reversalReceipt, createdAt: new Date().toISOString() }, ...prev]);
      try { await createReceipt(reversalReceipt); } catch (e) { console.warn("Reversal log failed:", e.message); }
      show("Line un-fulfilled and inventory restored");
    } catch (e) { show(e.message, "error"); }
  };

  // Legacy aliases — call sites still use these names.
  const shipOrderLine = (order) => openFulfillModal([order]);
  const shipAllLines = (lines) => openFulfillModal(lines);

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

  // ---- Backfill-production-at-ship-time helper ----
  // Walks down the BOM from `itemId` looking for a chain of "produce X from Y"
  // steps where the deepest source has an existing lot # with enough on-hand to
  // cover production. Returns the chain (deepest-first) or null if no path
  // through pre-existing lots exists.
  //
  // The "primary" BOM line at each level is the upstream component that shares
  // the produced item's flavor prefix (e.g. 400-LG Pack → 300-LG Bin). This is
  // the only path that preserves lot # identity. Non-flavor BOM lines (wrappers,
  // labels, raw materials) are consumed normally during the run but don't carry
  // a lot.
  const flavorOfId = useCallback((id) => (id?.match(/^\d+-(\w+)/)?.[1] || ""), []);
  const findBackfillChain = useCallback((itemId, qty) => {
    const item = allItems.find(i => i.id === itemId);
    if (!item || !item.bom || item.bom.length === 0) return null;
    const flavor = flavorOfId(itemId);
    if (!flavor) return null;
    // Find the same-flavor BOM line (the "primary" lot-bearing upstream).
    const primary = item.bom.find(b => flavorOfId(b.partId) === flavor);
    if (!primary) return null;
    const needed = primary.qty * qty;
    // Are any existing lots of the primary big enough to supply this step?
    const direct = (lotsByItem[primary.partId] || [])
      .filter(l => l.qty >= needed)
      .sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
    if (direct.length > 0) {
      // Base case — deepest source. User picks one of these lots.
      return [{
        producedId: itemId, producedQty: qty,
        consumedId: primary.partId, consumedQty: needed,
        eligibleLots: direct,         // user-selectable at the deepest step only
        inherited: false,
      }];
    }
    // Recurse: try chasing further down through this primary.
    const child = findBackfillChain(primary.partId, needed);
    if (!child) return null;
    return [
      ...child,
      {
        producedId: itemId, producedQty: qty,
        consumedId: primary.partId, consumedQty: needed,
        eligibleLots: null,           // inherits from deepest step
        inherited: true,
      },
    ];
  }, [allItems, lotsByItem, flavorOfId]);

  // Allocations indexed by orderId for fast per-line/per-group lookups.
  const allocationsByOrder = useMemo(() => {
    const m = new Map();
    for (const a of orderLotAllocations) {
      if (!m.has(a.orderId)) m.set(a.orderId, []);
      m.get(a.orderId).push(a);
    }
    return m;
  }, [orderLotAllocations]);

  // Allocations indexed by lot # for the recall-trace view.
  const allocationsByLot = useMemo(() => {
    const m = new Map();
    for (const a of orderLotAllocations) {
      if (!m.has(a.lotNumber)) m.set(a.lotNumber, []);
      m.get(a.lotNumber).push(a);
    }
    return m;
  }, [orderLotAllocations]);

  // Sum of qty allocated for one order line — drives "fully allocated" checks.
  const allocatedQtyForLine = useCallback((orderId) => {
    return (allocationsByOrder.get(orderId) || []).reduce((s, a) => s + (a.qtyAllocated || 0), 0);
  }, [allocationsByOrder]);

  // Group-level rollup status for an order group. Returns "Fulfilled",
  // "Partially Fulfilled", or null (let existing line statuses speak).
  const computeGroupStatus = useCallback((lines) => {
    if (!lines || lines.length === 0) return null;
    const allFulfilled = lines.every(l => l.status === "Fulfilled" || l.status === "Cancelled");
    if (allFulfilled) return "Fulfilled";
    const someAllocated = lines.some(l => allocatedQtyForLine(l.id) > 0);
    const someUnallocated = lines.some(l => l.status !== "Fulfilled" && l.status !== "Cancelled" && allocatedQtyForLine(l.id) === 0);
    if (someAllocated && someUnallocated) return "Partially Fulfilled";
    if (someAllocated && !someUnallocated) return "Partially Fulfilled"; // some lines partially allocated within
    return null;
  }, [allocatedQtyForLine]);

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

  // Unified transaction log from existing data.
  // Each entry includes a `lines` array of granular part movements for drill-down.
  const transactionLog = useMemo(() => {
    const entries = [];
    const unitOf = (id) => allItems.find(i => i.id === id)?.unit || "";

    // Production runs — only completed runs; drafts haven't moved any inventory yet
    for (const r of prodRuns) {
      if ((r.status || "Complete") !== "Complete") continue;
      const lotPad = padLotNumber(r.lotNumber || "");
      const lines = [
        // Output (the produced assembly enters inventory at this lot)
        {
          sign: "+", qty: Number(r.qtyProduced) || 0, unit: unitOf(r.assemblyId),
          itemId: r.assemblyId, itemName: r.assemblyName, lotNumber: lotPad,
        },
        // Consumed (each input part deducted from inventory)
        ...(r.consumed || []).map(c => ({
          sign: "-", qty: Number(c.qty) || 0, unit: c.unit || unitOf(c.partId),
          itemId: c.partId, itemName: c.name, lotNumber: "",
        })),
      ];
      entries.push({
        id: r.id,
        date: r.date, time: r.createdAt || r.date, type: "Production",
        desc: `Produced ${r.qtyProduced} x ${r.assemblyName}`,
        lot: lotPad, user: r.createdBy || "",
        detail: (r.consumed || []).map(c => `-${c.qty.toFixed(3)} ${c.name}`).join(", "),
        notes: r.notes || "",
        color: "#8b5cf6",
        lines,
      });
    }

    // Receipts (PO receipts, adjustments, manual, shipments, reversals)
    for (const r of receipts) {
      const totalUnits = r.lines.reduce((s, l) => s + (l.qtyReceived || 0), 0);
      let logType = "Receipt";
      let color = "#22c55e";
      let desc = `${r.type}: ${r.lines.length} items, ${totalUnits} units`;
      let direction = "+"; // default: receipts add to inventory
      if (r.type === "Inventory adjustment") {
        logType = "Adjustment"; color = "#f59e0b";
        desc = r.notes || "Inventory adjustment";
        // qtyReceived sign reflects direction for adjustments
      } else if (r.type === "Shipment") {
        logType = "Shipment"; color = "#ef4444";
        desc = r.notes || `Shipment: ${r.lines.length} items, ${totalUnits} units`;
        direction = "-";
      } else if (r.type === "Shipment Reversal") {
        logType = "Reversal"; color = "#6366f1";
        desc = r.notes || `Reversal: ${r.lines.length} items, ${totalUnits} units`;
        direction = "+";
      }
      const lines = r.lines.map(l => {
        // For adjustments, qtyReceived can be negative — reflect that in sign
        const q = Number(l.qtyReceived) || 0;
        const sign = logType === "Adjustment" ? (q >= 0 ? "+" : "-") : direction;
        const lotPad = l.lotNumber ? padLotNumber(l.lotNumber) : "";
        return {
          sign, qty: Math.abs(q), unit: l.unit || unitOf(l.partId),
          itemId: l.partId, itemName: l.name, lotNumber: lotPad,
        };
      });
      // If every line shares the same lot # (or there's only one), surface it
      // in the row-level `lot` column for at-a-glance scanning.
      const uniqueLots = Array.from(new Set(r.lines.map(l => l.lotNumber || "").filter(Boolean)));
      const headerLot = uniqueLots.length === 1 ? padLotNumber(uniqueLots[0])
        : uniqueLots.length > 1 ? `${uniqueLots.length} lots` : "";
      entries.push({
        id: r.id,
        date: r.date, time: r.createdAt || r.date, type: logType,
        desc,
        lot: headerLot, user: r.createdBy || "",
        detail: r.lines.map(l => {
          const lotSfx = l.lotNumber ? ` [lot ${padLotNumber(l.lotNumber)}]` : "";
          return `${l.name}: ${l.qtyReceived} ${l.unit}${lotSfx}`;
        }).join(", "),
        notes: r.notes || "",
        color,
        lines,
      });
    }

    // Sort newest first
    entries.sort((a, b) => (b.time || b.date || "").localeCompare(a.time || a.date || ""));

    // Compute before / after qty for every line move. Walk backwards from each
    // item's current on-hand: the most recent transaction's `after` == current
    // qty, and each older transaction's `after` == the next newer one's `before`.
    const movesByItem = new Map(); // itemId -> [{ entryIdx, lineIdx }, …] newest first
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      for (let j = 0; j < (e.lines || []).length; j += 1) {
        const ln = e.lines[j];
        if (!ln.itemId) continue;
        if (!movesByItem.has(ln.itemId)) movesByItem.set(ln.itemId, []);
        movesByItem.get(ln.itemId).push({ entryIdx: i, lineIdx: j });
      }
    }
    for (const [itemId, moves] of movesByItem.entries()) {
      const item = allItems.find(x => x.id === itemId);
      // If the item has been deleted, fall back to 0 so the math still works.
      let currentAfter = item ? (Number(item.qty) || 0) : 0;
      for (const m of moves) {
        const ln = entries[m.entryIdx].lines[m.lineIdx];
        const signedDelta = ln.sign === "+" ? Number(ln.qty) : -Number(ln.qty);
        ln.afterQty = currentAfter;
        ln.beforeQty = currentAfter - signedDelta;
        currentAfter = ln.beforeQty;
      }
    }

    return entries;
  }, [prodRuns, receipts, allItems]);

  // ---- Transaction Log: CSV export (one row per line move) ----
  const exportTransactionLogCSV = useCallback(() => {
    const from = txExportFrom || "0000-00-00";
    const to = txExportTo || "9999-99-99";
    const inRange = transactionLog.filter(e => (e.date || "") >= from && (e.date || "") <= to);
    if (inRange.length === 0) {
      show("No transactions in that date range", "error");
      return;
    }
    const escape = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Date", "Type", "TransactionID", "Description", "ItemID", "ItemName", "Direction", "Qty", "Unit", "BeforeQty", "AfterQty", "Lot", "User", "Notes"];
    const rows = [header.join(",")];
    let lineCount = 0;
    for (const e of inRange) {
      for (const ln of (e.lines || [])) {
        rows.push([
          e.date || "", e.type, e.id || "", e.desc || "",
          ln.itemId || "", ln.itemName || "",
          ln.sign, ln.qty, ln.unit || "",
          ln.beforeQty == null ? "" : ln.beforeQty,
          ln.afterQty == null ? "" : ln.afterQty,
          ln.lotNumber || e.lot || "",
          e.user || "", e.notes || "",
        ].map(escape).join(","));
        lineCount += 1;
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const fromTag = txExportFrom || "all";
    const toTag = txExportTo || "all";
    a.download = `transaction_log_${fromTag}_to_${toTag}.csv`;
    a.click();
    show(`Exported ${lineCount} line${lineCount === 1 ? "" : "s"} from ${inRange.length} transaction${inRange.length === 1 ? "" : "s"}`);
  }, [transactionLog, txExportFrom, txExportTo, show]);

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
  // Two input modes:
  //   - "orders":     demand = open customer orders (Pending / Confirmed / In Production)
  //   - "production": demand = user-selected draft (scheduled) production runs
  // Both modes explode BOMs down to level 100 raw materials, subtract on-hand,
  // and bucket shortfalls by vendor for PO generation.
  const [mrpSource, setMrpSource] = useState("orders"); // "orders" | "production"
  const [mrpSelectedRunIds, setMrpSelectedRunIds] = useState([]);
  const mrp = useMemo(() => {
    // Build the demand row list (what we need to make, and how many).
    let demandRows = [];
    if (mrpSource === "production") {
      const selected = new Set(mrpSelectedRunIds);
      const allowedLevels = forecastConfig.mrpDemandLevels?.length ? forecastConfig.mrpDemandLevels : [250];
      demandRows = prodRuns
        .filter(r => (r.status || "Complete") === "Draft" && selected.has(r.id) && allowedLevels.includes(getLevel(r.assemblyId)))
        .map(r => ({ item: r.assemblyId, qty: Number(r.qtyProduced) || 0, runId: r.id }));
    } else {
      const oo = orders.filter(o => o.status === "Pending" || o.status === "Confirmed" || o.status === "In Production");
      demandRows = oo.map(o => ({ item: o.item, qty: Number(o.qty) || 0, orderId: o.id }));
    }
    const needs = {};
    const explode = (id, mult) => {
      const it = allItems.find(i => i.id === id);
      if (!it) return;
      if (getLevel(it.id) === 100) { if (!needs[it.id]) needs[it.id] = { ...it, required: 0 }; needs[it.id].required += mult; return; }
      if (it.bom) for (const l of it.bom) explode(l.partId, l.qty * mult);
    };
    for (const d of demandRows) explode(d.item, d.qty);

    // Sum quantity on OPEN purchase orders for each part. "Open" = the PO is
    // expected to arrive (Draft / Sent / Confirmed) but has not yet been
    // Received or Cancelled. This becomes "On Order" in the table so users
    // see that a shortfall is already covered by a pending receipt vs. truly
    // needing a new PO.
    const openPOStatuses = new Set(["Draft", "Sent", "Confirmed"]);
    const onOrderByPart = {};
    for (const po of pos) {
      if (!openPOStatuses.has(po.status)) continue;
      for (const l of (po.lines || [])) {
        onOrderByPart[l.partId] = (onOrderByPart[l.partId] || 0) + (Number(l.qty) || 0);
      }
    }

    const rows = Object.values(needs).map((r) => {
      const required = Math.ceil(r.required * 1000) / 1000;
      const shortfall = Math.max(0, Math.ceil((required - r.qty) * 1000) / 1000);
      const onOrder = Math.round((onOrderByPart[r.id] || 0) * 1000) / 1000;
      // netNeed = what user still has to PO after accounting for what's already on order.
      const netNeed = Math.max(0, Math.ceil((shortfall - onOrder) * 1000) / 1000);
      return {
        ...r, required, shortfall, onOrder, netNeed,
        coverage: required > 0 ? Math.min(100, Math.round((r.qty / required) * 100)) : 100,
        purchaseCost: netNeed * r.avgCost,
      };
    }).sort((a, b) => b.netNeed - a.netNeed || b.shortfall - a.shortfall);
    const byVendor = {};
    for (const r of rows) {
      if (r.netNeed <= 0) continue;
      const vid = r.supplier || "Unassigned";
      if (!byVendor[vid]) byVendor[vid] = { vendor: vid, lines: [], total: 0 };
      byVendor[vid].lines.push(r);
      byVendor[vid].total += r.purchaseCost;
    }
    return {
      source: mrpSource,
      demandRows,
      // Keep `oo` for backward compat with the existing stat label/count.
      oo: demandRows,
      rows,
      byVendor: Object.values(byVendor),
      totalCost: rows.reduce((s, r) => s + r.purchaseCost, 0),
      critical: rows.filter((r) => r.netNeed > 0).length,
      covered: rows.filter((r) => r.shortfall === 0).length,
      pendingReceipt: rows.filter((r) => r.shortfall > 0 && r.netNeed === 0).length,
    };
  }, [orders, allItems, mrpSource, mrpSelectedRunIds, prodRuns, forecastConfig.mrpDemandLevels, pos]);

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

  // ---- Dashboard helpers ----
  const todayStr = useMemo(() => fmtDate(new Date()), []);

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
    // Intercept "Fulfilled" — must go through lot allocation flow.
    if (newStatus === "Fulfilled") {
      openFulfillModal(group.lines);
      return;
    }
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
    // Figure out what kind of entity this is so we can route to the right
    // delete path and surface real errors (Promise.allSettled used to swallow
    // them, which caused deleted items to silently re-appear after refresh).
    const matchedItem = parts.find(x => x.id === id) || assemblies.find(x => x.id === id);
    const matchedOrder = orders.find(x => x.id === id);
    const matchedVendor = vendors.find(x => x.id === id);
    const matchedPO = pos.find(x => x.id === id);

    if (matchedItem) {
      // Items aren't hard-deleted — historical records (BOMs, receipts,
      // production runs, orders) need a valid item to point to. Instead we
      // mark the item as Discontinued so it disappears from active lists,
      // dropdowns, and search. Reversible via the Discontinued panel.
      try {
        await discontinueItem(id);
      } catch (e) {
        show(`Discontinue failed: ${e.message}`, "error");
        return;
      }
      const discontinued = { ...matchedItem, status: "Discontinued" };
      setParts((p) => p.filter((x) => x.id !== id));
      setAssemblies((p) => p.filter((x) => x.id !== id));
      setDiscontinuedItems((p) => [...p.filter(x => x.id !== id), discontinued]);
      show("Discontinued");
      return;
    }

    if (matchedOrder) {
      try { await dbDeleteOrder(id); } catch (e) { show(`Delete failed: ${e.message}`, "error"); return; }
      setOrders((p) => p.filter((x) => x.id !== id));
      show("Deleted");
      return;
    }
    if (matchedVendor) {
      try { await dbDeleteVendor(id); } catch (e) { show(`Delete failed: ${e.message}`, "error"); return; }
      setVendors((p) => p.filter((x) => x.id !== id));
      show("Deleted");
      return;
    }
    if (matchedPO) {
      try { await dbDeletePO(id); } catch (e) { show(`Delete failed: ${e.message}`, "error"); return; }
      setPOs((p) => p.filter((x) => x.id !== id));
      show("Deleted");
      return;
    }
    // Unknown id — fall back to old behaviour just in case
    show("Nothing to delete", "error");
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
      id: rcptId, poId: null, type: "Inventory adjustment", date: todayLocal(),
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
    // Use netNeed (shortfall minus already-on-order) so we don't re-PO things
    // already on an open Draft/Sent/Confirmed PO.
    const allLines = mrp.byVendor.flatMap(vg => vg.lines).filter(l => l.netNeed > 0);
    if (allLines.length === 0) { show("Nothing left to PO — all shortfalls are already on order or covered.", "error"); return; }
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
    // Order only what's NOT already on an open PO. netNeed = max(0, shortfall - onOrder).
    const allLines = mrp.byVendor.flatMap(vg => vg.lines).filter(l => l.netNeed > 0);
    if (allLines.length === 0) { show("Nothing left to PO — all shortfalls are already on order or covered.", "error"); return; }

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
      const orderQty = Math.max(0, Math.ceil(l.netNeed * 1000) / 1000);
      const total = orderQty * unitCost;
      if (!buckets[chosenVendor]) buckets[chosenVendor] = { lines: [], total: 0 };
      buckets[chosenVendor].lines.push({ partId: l.id, name: l.name, qty: orderQty, unit: l.unit, unitCost, supplierCode, total });
      buckets[chosenVendor].total += total;
    }

    const npos = [];
    let i = 0;
    for (const vName of Object.keys(buckets)) {
      const vObj = vendors.find((v) => v.name === vName);
      const pid = `PO-${String(pos.length + npos.length + 1 + i).padStart(3, "0")}`;
      const po = { id: pid, vendor: vName, vendorId: vObj?.id || "", date: todayLocal(), status: "Draft", lines: buckets[vName].lines, total: buckets[vName].total, paymentTerms: vObj?.paymentTerms || "", leadDays: vObj?.leadDays || 0, notes: "" };
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

      // Build the list of runs to create. Lot numbers are NOT pre-assigned for
      // 200-level drafts anymore — a plan made 3 weeks out shouldn't burn lot
      // numbers that might be edited before production. The lot # gets reserved
      // at completion time using the then-current counter + completion date,
      // so the run reflects what was actually produced and when.
      const lotPlan = []; // entries: { day, row, item }
      for (const day of selectedWeekDays) {
        const rows = planDayRows[day.date] || [];
        for (const row of rows) {
          if (!row.skuId || row.qty <= 0) continue;
          const item = allItems.find(i => i.id === row.skuId);
          if (!item) continue;
          lotPlan.push({ day, row, item });
        }
      }

      let counter = 1;
      const newRuns = [];
      for (const plan of lotPlan) {
        const { day, row, item } = plan;
        const runId = `PROD-${day.date}-${String(counter).padStart(3, "0")}-${Math.random().toString(36).slice(2, 8)}`;
        const run = {
          id: runId, assemblyId: row.skuId, assemblyName: item.name,
          qtyProduced: row.qty, date: day.date, lotNumber: "", plannedDate: day.date,
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

  // Admin-only: download a full DB snapshot as a single JSON file. After a
  // successful download we record the timestamp in app_settings so the
  // dashboard can show admins a "last backup N days ago" badge.
  const downloadFullBackup = async () => {
    setBackupRunning(true);
    setBackupProgress({ table: "starting", rows: 0, done: 0 });
    try {
      let done = 0;
      const totalTables = 20;
      const snapshot = await fetchFullBackup((table, rows) => {
        done += 1;
        setBackupProgress({ table, rows, done });
      });
      const payload = {
        _meta: {
          appVersion: "v163",
          takenAt: new Date().toISOString(),
          takenBy: profile?.email || "",
          totalTables,
          successfulTables: Object.keys(snapshot).filter(k => k !== "_failed").length,
          failed: snapshot._failed || [],
        },
        ...snapshot,
      };
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dumpling-genie-backup-${ts}.json`;
      a.click();
      // Record success.
      const at = new Date().toISOString();
      setLastBackupAt(at);
      try { await saveConfig("last_backup_at", at); } catch (e) { console.warn("Failed to record backup timestamp:", e.message); }
      const rowCount = Object.entries(snapshot).filter(([k]) => k !== "_failed").reduce((s, [, v]) => s + v.length, 0);
      if (payload._meta.failed.length) {
        show(`Backup saved (${rowCount} rows) but ${payload._meta.failed.length} table(s) failed — see _meta.failed inside the file`, "error");
      } else {
        show(`Backup saved — ${rowCount} rows across ${payload._meta.successfulTables} tables`);
      }
    } catch (e) {
      show(`Backup failed: ${e.message}`, "error");
    }
    setBackupRunning(false);
  };

  // Days since last backup, or null if never backed up. Used for the stale-backup
  // banner on the Dashboard for admins.
  const daysSinceBackup = useMemo(() => {
    if (!lastBackupAt) return null;
    const ms = Date.now() - new Date(lastBackupAt).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }, [lastBackupAt]);

  // Admin-only: fix an incorrect lot # on a completed production run.
  // Renames inventory_lots, remaps order_lot_allocations, updates the run.
  const submitEditLot = async () => {
    const run = editLotModal;
    if (!run) return;
    const newLot = String(editLotValue || "").trim();
    if (!newLot) { show("New lot # is required", "error"); return; }
    if (newLot === (run.lotNumber || "")) { setEditLotModal(null); return; }
    setEditLotSubmitting(true);
    try {
      await renameProductionRunLot(run.id, run.assemblyId, run.lotNumber || "", newLot);
      // Update local state
      setProdRuns(prev => prev.map(r => r.id === run.id ? { ...r, lotNumber: newLot } : r));
      setLots(prev => {
        const oldKey = `${run.assemblyId}|${run.lotNumber}`;
        const newKey = `${run.assemblyId}|${newLot}`;
        // Find old + existing new lot rows
        const oldIdx = prev.findIndex(l => l.itemId === run.assemblyId && l.lotNumber === run.lotNumber);
        const newIdx = prev.findIndex(l => l.itemId === run.assemblyId && l.lotNumber === newLot);
        if (oldIdx === -1) return prev;
        if (newIdx !== -1 && newIdx !== oldIdx) {
          // Merge old qty into new, drop old
          const merged = [...prev];
          merged[newIdx] = { ...merged[newIdx], qty: Number(merged[newIdx].qty) + Number(merged[oldIdx].qty) };
          merged.splice(oldIdx, 1);
          return merged;
        }
        // Simple rename
        return prev.map((l, i) => i === oldIdx ? { ...l, lotNumber: newLot } : l);
      });
      // Update allocations in local state
      setOrderLotAllocations(prev => prev.map(a => a.itemId === run.assemblyId && a.lotNumber === run.lotNumber ? { ...a, lotNumber: newLot } : a));
      show(`Lot # updated: ${run.lotNumber || "(blank)"} → ${newLot}`);
      setEditLotModal(null);
      setEditLotValue("");
    } catch (e) {
      show(e.message, "error");
    }
    setEditLotSubmitting(false);
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
    setManualPOForm({ vendor: "", notes: "", expectedReceiptDate: "" });
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
      id: pid, vendor: manualPOForm.vendor, vendorId: vObj?.id || "", date: todayLocal(),
      status: "Draft", total, paymentTerms: vObj?.paymentTerms || "", leadDays: vObj?.leadDays || 0,
      notes: manualPOForm.notes,
      expectedReceiptDate: manualPOForm.expectedReceiptDate || null,
      lines: validLines.map(l => ({ partId: l.partId, name: l.name, qty: l.qty, unit: l.unit, unitCost: l.unitCost, total: l.qty * l.unitCost })),
    };
    setPOs(prev => [...prev, po]);
    try { await createPurchaseOrder(po); } catch (e) { console.warn("PO save failed:", e.message); }
    show(`Created ${pid}`);
    setManualPOModal(false);
  };

  // ---- EDIT EXISTING (UNRECEIVED) PO ----
  const openEditPO = (po) => {
    setEditPOModal(po);
    setEditPOLines(po.lines.map(l => ({ ...l })));
    setEditPONotes(po.notes || "");
    setEditPOExpectedDate(po.expectedReceiptDate || "");
  };

  const submitEditPO = async () => {
    if (!editPOModal) return;
    const valid = editPOLines.filter(l => l.partId && Number(l.qty) > 0);
    if (valid.length === 0) { show("PO needs at least one line with qty > 0", "error"); return; }
    const lines = valid.map(l => ({
      partId: l.partId, name: l.name,
      qty: Number(l.qty), unit: l.unit,
      unitCost: Number(l.unitCost),
      total: Number(l.qty) * Number(l.unitCost),
    }));
    const total = lines.reduce((s, l) => s + l.total, 0);
    setEditPOSubmitting(true);
    try {
      await updatePOLines(editPOModal.id, lines, total, editPONotes, editPOExpectedDate || null);
      setPOs(prev => prev.map(p => p.id === editPOModal.id ? { ...p, lines, total, notes: editPONotes, expectedReceiptDate: editPOExpectedDate || null } : p));
      show(`Updated ${editPOModal.id}`);
      setEditPOModal(null);
    } catch (e) {
      show(e.message, "error");
    }
    setEditPOSubmitting(false);
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

    const receiptId = `RCV-${todayLocal()}-${String(receipts.length + 1).padStart(3, "0")}`;
    const receipt = {
      id: receiptId, poId: rcvMode === "po" ? rcvPO : null, type: rcvType,
      date: todayLocal(), notes: rcvNotes, createdBy: profile?.email || "",
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

  const sideBtn = (k, lbl, ico, badge) => {
    const active = tab === k;
    return (
      <button
        onClick={() => { setTab(k); setSearch(""); setLevelFilter([]); setStockFilter("All"); setSortCol(null); setSidebarOpen(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "10px 14px", marginBottom: 2,
          background: active ? "#6366f1" : "transparent",
          color: active ? "#fff" : "#bbb",
          border: "none", borderRadius: 8,
          fontSize: 13, fontWeight: active ? 600 : 500,
          cursor: "pointer", textAlign: "left",
          transition: "background 120ms",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#23233355"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ display: "inline-flex", width: 16, justifyContent: "center", position: "relative" }}>
          {ico}
          {badge > 0 && (
            <span
              title={`${badge} item${badge === 1 ? "" : "s"} need attention`}
              style={{
                position: "absolute", top: -6, right: -10,
                background: "#ef4444", color: "#fff",
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                padding: "2px 5px", borderRadius: 8,
                minWidth: 14, textAlign: "center",
                border: "1px solid #12121c",
              }}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        <span>{lbl}</span>
      </button>
    );
  };

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
      {!loading && authUser && (<div style={{ display: "flex", alignItems: "flex-start", gap: 0, minHeight: "100vh", margin: "-16px -20px" }}>

      {/* ===== SIDEBAR ===== */}
      {(!isNarrow || sidebarOpen) && (
        <>
          {isNarrow && (
            <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} />
          )}
          <aside style={{
            width: 220,
            background: "#16161e",
            borderRight: "1px solid #2a2a3a",
            padding: "18px 12px",
            position: isNarrow ? "fixed" : "sticky",
            top: 0,
            left: 0,
            height: "100vh",
            overflowY: "auto",
            zIndex: 100,
            flexShrink: 0,
            boxShadow: isNarrow ? "2px 0 20px rgba(0,0,0,0.5)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, padding: "0 6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={20} style={{ color: "#fbbf24" }} />
                <span style={{ fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{appName}</span>
              </div>
              {isNarrow && (
                <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4 }}><X size={16} /></button>
              )}
            </div>
            <nav>
              {sideBtn("dashboard", "Dashboard", <LayoutDashboard size={14} />)}
              {sideBtn("inventory", "Inventory", <Package size={14} />)}
              {sideBtn("items", "Item Master", <Layers size={14} />)}
              {sideBtn("orders", "Orders", <ShoppingCart size={14} />)}
              {sideBtn("vendors", "Vendors", <Building2 size={14} />)}
              {sideBtn("mrp", "Purchase Needs", <ClipboardList size={14} />)}
              {sideBtn("pos", "Purchase Orders", <FileText size={14} />)}
              {sideBtn("receiving", "Receiving", <PackageCheck size={14} />)}
              {sideBtn("production", "Production", <Hammer size={14} />)}
              {sideBtn("planning", "Planning", <TrendingUp size={14} />)}
              {sideBtn("performance", "Performance", <BarChart3 size={14} />)}
              {sideBtn("lottracking", "Lot Tracking", <Layers size={14} />)}
              {sideBtn("log", "Transaction Log", <ScrollText size={14} />)}
              {isAdmin && sideBtn("admin", "Admin Config", <Settings size={14} />, pendingWishesCount)}
            </nav>
          </aside>
        </>
      )}

      {/* ===== MAIN ===== */}
      <div style={{ flex: 1, minWidth: 0, padding: "16px 20px" }}>

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: toast.t === "error" ? "#dc2626" : "#16a34a", color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 14, zIndex: 2000, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}><CheckCircle size={16} />{toast.msg}</div>}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isNarrow && (
            <button onClick={() => setSidebarOpen(true)} style={{ ...B2, padding: "6px 8px" }} title="Menu"><Menu size={16} /></button>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              <Sparkles size={26} style={{ color: "#fbbf24" }} />
              <span style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{appName}</span>
            </h1>
            <p style={{ margin: "2px 0 0", color: "#555", fontSize: 12 }}>Powered by Ops Genie</p>
          </div>
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

      {/* Filters (hidden on dashboard / performance / lottracking) */}
      {tab !== "dashboard" && tab !== "performance" && tab !== "lottracking" && <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
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

        // ===== Production Plan: this week + next week (Sunday flips week 1 forward) =====
        const dow = new Date().getDay(); // 0=Sun ... 6=Sat
        const weekRefDate = dow === 0 ? addDays(todayStr, 1) : todayStr;
        const planWeekMonday = getMonday(weekRefDate);
        const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        // Only Fills (200-level with "Fill" in id) and Batches (250-level) are relevant.
        const isPlanRun = (r) => {
          const id = r.assemblyId || "";
          const lvl = getLevel(id);
          return lvl === 250 || (lvl === 200 && /fill/i.test(id));
        };
        const typeOf = (r) => (getLevel(r.assemblyId) === 250 ? "B" : "F");

        const runDateOf = (r) => r.plannedDate || r.date;
        const buildWeek = (mondayStr) => {
          const satDate = addDays(mondayStr, 5);
          const days = [0, 1, 2, 3, 4, 5].map(off => addDays(mondayStr, off));
          const runsByDate = {};
          for (const r of prodRuns) {
            if (!isPlanRun(r)) continue;
            const rd = runDateOf(r);
            if (!rd || rd < mondayStr || rd > satDate) continue;
            if (!runsByDate[rd]) runsByDate[rd] = [];
            const m = (r.assemblyId || "").match(/^\d+-(\w+)/);
            runsByDate[rd].push({ pl: m ? m[1] : "?", qty: r.qtyProduced || 0, type: typeOf(r) });
          }
          const cells = days.map((d, i) => {
            const runs = runsByDate[d] || [];
            const byKey = {};
            for (const r of runs) {
              const k = `${r.pl}|${r.type}`;
              if (!byKey[k]) byKey[k] = { pl: r.pl, type: r.type, qty: 0 };
              byKey[k].qty += r.qty;
            }
            const lines = Object.values(byKey).sort((a, b) => {
              if (a.type !== b.type) return a.type === "B" ? -1 : 1; // batches first
              return b.qty - a.qty;
            });
            return { date: d, label: dayLabels[i], lines };
          });
          return { mondayStr, cells };
        };
        const week1Full = buildWeek(planWeekMonday);
        const week2Full = buildWeek(addDays(planWeekMonday, 7));
        const week3Full = buildWeek(addDays(planWeekMonday, 14));
        const showSat = week1Full.cells[5].lines.length > 0 || week2Full.cells[5].lines.length > 0 || week3Full.cells[5].lines.length > 0;
        const nCols = showSat ? 6 : 5;
        const week1 = { ...week1Full, cells: week1Full.cells.slice(0, nCols) };
        const week2 = { ...week2Full, cells: week2Full.cells.slice(0, nCols) };
        const week3 = { ...week3Full, cells: week3Full.cells.slice(0, nCols) };
        const headerLabels = dayLabels.slice(0, nCols);

        // ===== Inventory by flavor =====
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
        const flavorOfId = (id) => { const m = (id || "").match(/^\d+-(\w+)/); return m ? m[1] : null; };
        const flavorRows = productLines.filter(pl => pl !== "PKL").map(pl => {
          const has = (id) => allItems.find(i => i.id === id);
          const sumQty = (filterFn) => allItems.filter(filterFn).reduce((s, i) => s + (i.qty || 0), 0);
          const bins = sumQty(i => getLevel(i.id) === 300 && flavorOfId(i.id) === pl);
          const packItem = has(`400-${pl} Pack`);
          const packs = packItem ? (packItem.qty || 0) : 0;
          const fsItem = has(`400-${pl} Food Service Case`);
          const fsCases = fsItem ? (fsItem.qty || 0) : 0;
          const retailCaseItem = has(`500-${pl} Retail Case`);
          const retailCases = retailCaseItem ? (retailCaseItem.qty || 0) : 0;
          const totalDumplings = allItems.filter(i => flavorOfId(i.id) === pl && (i.qty || 0) > 0 && dumplingsPer(i.id) > 0)
            .reduce((s, i) => s + i.qty * dumplingsPer(i.id), 0);
          const onOrder = orders
            .filter(o => (o.status === "Pending" || o.status === "Confirmed") && flavorOfId(o.item) === pl)
            .reduce((s, o) => s + (o.qty || 0) * dumplingsPer(o.item), 0);
          return {
            pl, bins, packs, fsCases, retailCases,
            totalDumplings: Math.round(totalDumplings),
            onOrder: Math.round(onOrder),
            diff: Math.round(totalDumplings - onOrder),
          };
        });

        // ===== POs Awaiting =====
        const awaitingPOs = pos
          .filter(p => p.status === "Sent" || p.status === "Confirmed")
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        // ===== Outgoing orders by type (upcoming week ship dates) =====
        const weekEndDate = addDays(planWeekMonday, 6); // Sunday
        const lineDollars = (o) => (o.qty || 0) * getUnitPrice(o.orderType, o.item);
        const isDone = (o) => o.status === "Fulfilled";
        const weekOrders = orders.filter(o =>
          o.status !== "Cancelled" &&
          o.shipDate && o.shipDate >= planWeekMonday && o.shipDate <= weekEndDate
        );
        const ordersByType = {};
        const typeTotals = {};
        for (const t of ORDER_TYPES) { ordersByType[t] = {}; typeTotals[t] = 0; }
        ordersByType.__other = {};
        typeTotals.__other = 0;
        let grandTotal = 0;
        for (const o of weekOrders) {
          const t = ORDER_TYPES.includes(o.orderType) ? o.orderType : "__other";
          if (!ordersByType[t][o.customer]) ordersByType[t][o.customer] = [];
          ordersByType[t][o.customer].push(o);
          const v = lineDollars(o);
          typeTotals[t] += v;
          grandTotal += v;
        }
        // Per type, split each customer's lines into open + done entries (done sorted last).
        const customerEntriesFor = (t) => {
          const group = ordersByType[t];
          if (!group) return [];
          const entries = [];
          for (const [cust, lines] of Object.entries(group)) {
            const openLines = lines.filter(o => !isDone(o));
            const doneLines = lines.filter(isDone);
            if (openLines.length) entries.push({ cust, lines: openLines, done: false });
            if (doneLines.length) entries.push({ cust, lines: doneLines, done: true });
          }
          return entries.sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return a.cust.localeCompare(b.cust);
          });
        };
        const fmtDollars = (n) => `$${Math.round(n).toLocaleString()}`;
        const shortType = (t) => t.length > 14 ? t.split(" ")[0] : t;

        // ===== Demand chart =====
        const currentMonday = getMonday(todayStr);
        const weeks = [];
        for (let i = 12; i >= 0; i -= 1) {
          const ws = addDays(currentMonday, -7 * i);
          const we = addDays(ws, 6);
          const m = parseDate(ws);
          weeks.push({ weekStart: ws, weekEnd: we, label: `${m.toLocaleString("en-US", { month: "short" })} ${m.getDate()}` });
        }
        const weekIndexFor = (dateStr) => {
          if (!dateStr) return -1;
          const d = parseDate(dateStr);
          for (let i = 0; i < weeks.length; i += 1) {
            const s = parseDate(weeks[i].weekStart);
            const e = parseDate(weeks[i].weekEnd);
            if (d >= s && d <= e) return i;
          }
          return -1;
        };
        const flavorsSeen = new Set();
        const flavorWeekTotals = {};
        for (const o of orders) {
          if ((o.status || "").toLowerCase() !== "fulfilled") continue;
          const wi = weekIndexFor(o.shipDate || o.date);
          if (wi < 0) continue;
          const item = allItems.find(i => i.id === o.item);
          if (!item) continue;
          const ppu = item.piecesPerUnit || 0;
          if (ppu <= 0) continue;
          const fl = flavorOfId(item.id) || "—";
          flavorsSeen.add(fl);
          if (!flavorWeekTotals[fl]) flavorWeekTotals[fl] = Array(weeks.length).fill(0);
          flavorWeekTotals[fl][wi] += (Number(o.qty) || 0) * ppu;
        }
        const flavors = [...flavorsSeen].sort();
        const flavorChartData = weeks.map((w, i) => {
          const row = { week: w.label };
          for (const fl of flavors) row[fl] = (flavorWeekTotals[fl] || [])[i] || 0;
          return row;
        });
        const flavorPalette = ["#fbbf24", "#a78bfa", "#22c55e", "#ef4444", "#06b6d4", "#f97316", "#ec4899", "#84cc16"];

        const panel = { background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" };
        const panelHead = { padding: "12px 16px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc", display: "flex", alignItems: "center", justifyContent: "space-between" };
        const dashGrid = {
          display: "grid",
          gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.3fr)",
          alignItems: isNarrow ? "start" : "stretch",
          gap: 14,
          marginBottom: 14,
        };
        const colStack = { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 };
        // Wrappers for cols 2 and 3: position:relative cell with min-height 0 so the
        // cell's natural height contributes 0 to the grid row; absolute children fill
        // the cell, which gets stretched to col 1's natural height by align-items:stretch.
        const overlayCellStyle = isNarrow ? null : { position: "relative", minHeight: 0, minWidth: 0 };
        const overlayChildStyle = isNarrow ? null : { position: "absolute", inset: 0 };

        return (
          <div>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, color: "#e0e0e0" }}>{todayDisplay}</h2>
            </div>

            {/* Stale-backup nudge for admins only */}
            {isAdmin && (daysSinceBackup === null || daysSinceBackup > 7) && (
              <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #f59e0b66", padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#f59e0b" }}>
                  <AlertTriangle size={14} />
                  <span>
                    {daysSinceBackup === null
                      ? "No database backup has been taken yet. Free plan doesn't include automatic backups."
                      : `Last database backup was ${daysSinceBackup} days ago. Consider taking a fresh one.`}
                  </span>
                </div>
                <button onClick={() => { setTab("admin"); setCfgSection("backup"); }}
                  style={{ ...B2, fontSize: 11, padding: "5px 12px", color: "#f59e0b", borderColor: "#f59e0b66" }}>
                  <Download size={12} /> Take backup
                </button>
              </div>
            )}

            {/* Manager's Note */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: isStale ? "1px solid #f59e0b33" : "1px solid #2a2a3a", padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
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
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} style={{ ...IS, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} autoFocus />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
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
                <div onClick={() => { if (isAdmin) { setNoteText(dailyNote.text || ""); setEditingNote(true); } }} style={{ fontSize: 13, color: "#d0d0d0", lineHeight: 1.5, whiteSpace: "pre-wrap", cursor: isAdmin ? "pointer" : "default", minHeight: 18 }}>
                  {dailyNote.text || (isAdmin ? <span style={{ color: "#555", fontStyle: "italic" }}>Click to add a note...</span> : <span style={{ color: "#555", fontStyle: "italic" }}>No note set.</span>)}
                </div>
              )}
            </div>

            {/* ===== 6-Panel Grid ===== */}
            <div style={dashGrid}>

              {/* ===== Col 1: Production Plan + Inventory by Flavor ===== */}
              <div style={colStack}>

              {/* #1 Production Plan */}
              <div style={{ ...panel }}>
                <div style={panelHead}>
                  <span>Production Plan</span>
                  <span style={{ fontSize: 11, color: "#666", fontWeight: 400 }}>Fills &amp; Batches only</span>
                </div>
                {/* Shared day-of-week header */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${nCols}, 1fr)`, gap: 1, background: "#2a2a3a", borderBottom: "1px solid #2a2a3a" }}>
                  {headerLabels.map((lbl, i) => (
                    <div key={i} style={{ background: "#16161e", padding: "5px 6px", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", textAlign: "center", letterSpacing: "0.05em" }}>{lbl}</div>
                  ))}
                </div>
                {[
                  { label: "This Week", w: week1, showLabel: false },
                  { label: "Next Week", w: week2, showLabel: true },
                  { label: "Week After", w: week3, showLabel: true },
                ].map((row, ri) => (
                  <React.Fragment key={ri}>
                    {row.showLabel && (
                      <div style={{ padding: "3px 12px", background: "#16161e", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#a78bfa", letterSpacing: "0.05em", display: "flex", justifyContent: "space-between", borderTop: "1px solid #2a2a3a", borderBottom: "1px solid #2a2a3a" }}>
                        <span>{row.label}</span>
                        <span style={{ color: "#555", fontWeight: 500 }}>Wk of {row.w.mondayStr}</span>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${nCols}, 1fr)`, gap: 1, background: "#2a2a3a" }}>
                      {row.w.cells.map((c, i) => (
                        <div key={i} style={{ background: "#1e1e2e", padding: "5px 6px 7px" }}>
                          <div style={{ fontSize: 8, color: "#555", fontWeight: 400, marginBottom: 3, textAlign: "right" }}>{c.date.slice(5)}</div>
                          {c.lines.length === 0 ? (
                            <div style={{ fontSize: 10, color: "#3a3a4a" }}>—</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              {c.lines.map((ln, j) => (
                                <div key={j} style={{ fontSize: 12, color: "#e0e0e0", fontWeight: 600, display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1.15 }}>
                                  <span style={{ color: "#fbbf24" }}>{ln.qty}</span>
                                  <span style={{ color: "#a78bfa" }}>{ln.pl}</span>
                                  <span style={{ fontSize: 8, color: ln.type === "B" ? "#22c55e" : "#06b6d4", fontWeight: 700 }}>{ln.type}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* #2 Inventory by Flavor */}
              <div style={{ ...panel, display: "flex", flexDirection: "column", maxHeight: 400, flex: "0 0 auto" }}>
                <div style={panelHead}><span>Inventory by Flavor</span></div>
                {flavorRows.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: "#555", fontSize: 12 }}>No flavors found.</div>
                ) : (() => {
                  const totals = flavorRows.reduce((t, r) => ({
                    bins: t.bins + r.bins, packs: t.packs + r.packs, fsCases: t.fsCases + r.fsCases,
                    retailCases: t.retailCases + r.retailCases, totalDumplings: t.totalDumplings + r.totalDumplings,
                    onOrder: t.onOrder + r.onOrder, diff: t.diff + r.diff,
                  }), { bins: 0, packs: 0, fsCases: 0, retailCases: 0, totalDumplings: 0, onOrder: 0, diff: 0 });
                  // Format counts to at most 1 decimal, strip trailing zero, and keep integers integer-looking.
                  const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
                  const stickyTH = { ...TH, position: "sticky", top: 0, background: "#1e1e2e", zIndex: 1 };
                  const totalTD = { ...TD, fontWeight: 700, background: "#16161e", borderTop: "1px solid #2a2a3a", position: "sticky", bottom: 0 };
                  return (
                    <div style={{ overflow: "auto", flex: 1 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={stickyTH}>Flavor</th>
                            <th style={{ ...stickyTH, textAlign: "center" }}>Bins</th>
                            <th style={{ ...stickyTH, textAlign: "center" }}>Packs</th>
                            <th style={{ ...stickyTH, textAlign: "center" }}>FS Cases</th>
                            <th style={{ ...stickyTH, textAlign: "center" }}>Retail Cs</th>
                            <th style={{ ...stickyTH, textAlign: "right" }}>Total Dumplings</th>
                            <th style={{ ...stickyTH, textAlign: "right" }}>On Order</th>
                            <th style={{ ...stickyTH, textAlign: "right" }}>Diff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flavorRows.map(r => (
                            <tr key={r.pl}>
                              <td style={{ ...TD, fontWeight: 700, color: "#a78bfa" }}>{r.pl}</td>
                              <td style={{ ...TD, textAlign: "center" }}>{r.bins ? fmt1(r.bins) : "—"}</td>
                              <td style={{ ...TD, textAlign: "center" }}>{r.packs ? fmt1(r.packs) : "—"}</td>
                              <td style={{ ...TD, textAlign: "center" }}>{r.fsCases ? fmt1(r.fsCases) : "—"}</td>
                              <td style={{ ...TD, textAlign: "center" }}>{r.retailCases ? fmt1(r.retailCases) : "—"}</td>
                              <td style={{ ...TD, textAlign: "right", fontWeight: 600, color: "#22c55e" }}>{r.totalDumplings.toLocaleString()}</td>
                              <td style={{ ...TD, textAlign: "right", color: "#f59e0b" }}>{r.onOrder.toLocaleString()}</td>
                              <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: r.diff >= 0 ? "#22c55e" : "#ef4444" }}>
                                {r.diff >= 0 ? "+" : ""}{r.diff.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td style={{ ...totalTD, color: "#ccc" }}>Total</td>
                            <td style={{ ...totalTD, textAlign: "center" }}>{totals.bins ? fmt1(totals.bins) : "—"}</td>
                            <td style={{ ...totalTD, textAlign: "center" }}>{totals.packs ? fmt1(totals.packs) : "—"}</td>
                            <td style={{ ...totalTD, textAlign: "center" }}>{totals.fsCases ? fmt1(totals.fsCases) : "—"}</td>
                            <td style={{ ...totalTD, textAlign: "center" }}>{totals.retailCases ? fmt1(totals.retailCases) : "—"}</td>
                            <td style={{ ...totalTD, textAlign: "right", color: "#22c55e" }}>{totals.totalDumplings.toLocaleString()}</td>
                            <td style={{ ...totalTD, textAlign: "right", color: "#f59e0b" }}>{totals.onOrder.toLocaleString()}</td>
                            <td style={{ ...totalTD, textAlign: "right", color: totals.diff >= 0 ? "#22c55e" : "#ef4444" }}>
                              {totals.diff >= 0 ? "+" : ""}{totals.diff.toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })()}
              </div>

              </div>{/* end Col 1 */}

              {/* ===== Col 2: Genie + POs Awaiting ===== */}
              <div style={isNarrow ? colStack : overlayCellStyle}>
              <div style={isNarrow ? null : { ...overlayChildStyle, ...colStack }}>

              {/* #4 Genie image */}
              <div style={{ ...panel, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #1e1e2e, #2a1e3e)", padding: 0, height: 200, flex: "0 0 auto" }}>
                <img
                  src="/genie.png"
                  alt="Dumpling Genie"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => { e.currentTarget.outerHTML = '<div style="font-size:64px;padding:30px;text-align:center">🧞‍♂️</div>'; }}
                />
              </div>

              {/* #5 POs Awaiting */}
              <div style={{ ...panel, display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
                <div style={panelHead}>
                  <span>POs Awaiting</span>
                  <span style={{ fontSize: 11, color: "#666", fontWeight: 400 }}>{awaitingPOs.length}</span>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {awaitingPOs.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#555", fontSize: 12 }}>None awaiting.</div>
                  ) : (
                    awaitingPOs.map((p, i) => (
                      <div key={p.id} onClick={() => setTab("pos")} style={{ padding: "10px 14px", borderBottom: i < awaitingPOs.length - 1 ? "1px solid #2a2a3a" : "none", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#6366f1" }}>{p.id}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: p.status === "Confirmed" ? "#22c55e22" : "#f59e0b22", color: p.status === "Confirmed" ? "#22c55e" : "#f59e0b" }}>{p.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#e0e0e0", marginTop: 3, fontWeight: 500 }}>{p.vendor}</div>
                        <div style={{ fontSize: 10, color: "#666", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                          <span>{p.lines.length} item{p.lines.length !== 1 ? "s" : ""} • {p.date}</span>
                          <span style={{ color: "#f59e0b", fontWeight: 600 }}>${(p.total || 0).toFixed(0)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              </div>{/* end Col 2 inner */}
              </div>{/* end Col 2 cell */}

              {/* ===== Col 3: Outgoing Orders ===== */}
              <div style={isNarrow ? null : overlayCellStyle}>
              {/* #6 Outgoing Orders */}
              <div style={{ ...panel, display: "flex", flexDirection: "column", ...(isNarrow ? { maxHeight: 500 } : overlayChildStyle), minHeight: 0 }}>
                <div style={panelHead}>
                  <span>Outgoing Orders <span style={{ color: "#666", fontWeight: 400, fontSize: 11 }}>· upcoming week</span></span>
                  <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>{fmtDollars(grandTotal)}</span>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {weekOrders.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#555", fontSize: 12 }}>No orders shipping this week.</div>
                  ) : (
                    [...ORDER_TYPES, "__other"].map(t => {
                      const group = ordersByType[t];
                      if (!group || Object.keys(group).length === 0) return null;
                      const totalCustomers = Object.keys(group).length;
                      const entries = customerEntriesFor(t);
                      return (
                        <div key={t}>
                          <div style={{ padding: "8px 14px", background: "#16161e", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#a78bfa", letterSpacing: "0.05em", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #2a2a3a" }}>
                            <span>{t === "__other" ? "Other" : shortType(t)} <span style={{ color: "#555", fontWeight: 500 }}>({totalCustomers})</span></span>
                            <span style={{ color: "#22c55e", fontSize: 11 }}>{fmtDollars(typeTotals[t])}</span>
                          </div>
                          {entries.map((e, idx) => {
                            const custTotal = e.lines.reduce((s, o) => s + lineDollars(o), 0);
                            const nameColor = e.done ? "#666" : "#e0e0e0";
                            const itemColor = e.done ? "#555" : "#888";
                            const dollarColor = e.done ? "#3f6f4f" : "#22c55e";
                            const decoration = e.done ? "line-through" : "none";
                            return (
                              <div key={`${e.cust}-${idx}-${e.done ? "d" : "o"}`} style={{ padding: "8px 14px", borderBottom: "1px solid #1a1a2a", opacity: e.done ? 0.7 : 1 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: nameColor, textDecoration: decoration }}>
                                    {e.cust}
                                    {e.done && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#3f6f4f", textDecoration: "none", letterSpacing: "0.05em" }}>SHIPPED</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: dollarColor, fontWeight: 600, whiteSpace: "nowrap", textDecoration: decoration }}>{fmtDollars(custTotal)}</div>
                                </div>
                                <div style={{ fontSize: 10, color: itemColor, marginTop: 2, textDecoration: decoration }}>
                                  {e.lines.map(o => {
                                    const m = o.item.match(/^\d+-(\w+)/);
                                    const it = gi(o.item);
                                    return `${o.qty} ${m ? m[1] : (it?.name || o.item)}`;
                                  }).join(", ")}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              </div>{/* end Col 3 cell */}

            </div>

            {/* #3 Dumpling Demand Over Time */}
            <div style={panel}>
              <div style={panelHead}>
                <span>Dumpling Demand Over Time</span>
                <span style={{ fontSize: 11, color: "#666", fontWeight: 400 }}>Fulfilled orders, last 13 weeks</span>
              </div>
              <div style={{ padding: "14px 16px" }}>
                {flavors.length === 0 ? (
                  <p style={{ color: "#555", fontSize: 12, textAlign: "center", margin: "30px 0" }}>No fulfilled orders in the last 13 weeks.</p>
                ) : (
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer>
                      <LineChart data={flavorChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
                        <XAxis dataKey="week" stroke="#666" fontSize={11} />
                        <YAxis stroke="#666" fontSize={11} />
                        <ChartTooltip contentStyle={{ background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 6, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {flavors.map((fl, idx) => (
                          <Line key={fl} type="monotone" dataKey={fl} stroke={flavorPalette[idx % flavorPalette.length]} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
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
                                      <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, padding: "4px 12px", color: l.lotNumber ? "#a78bfa" : "#555" }}>{l.lotNumber ? padLotNumber(l.lotNumber) : "\u2014"}</td>
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

      {/* Discontinued items panel (Item Master only) — collapsible list of
          soft-deleted items with a Restore button per row. */}
      {tab === "items" && discontinuedItems.length > 0 && (
        <div style={{ marginTop: 16, background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
          <div onClick={() => setShowDiscontinued(s => !s)} style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {showDiscontinued ? <ChevronDown size={14} style={{ color: "#888" }} /> : <ChevronRight size={14} style={{ color: "#888" }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: "#888" }}>Discontinued Items</span>
            </div>
            <span style={{ background: "#2a2a3a", color: "#aaa", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{discontinuedItems.length}</span>
          </div>
          {showDiscontinued && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={TH}>ProductCode</th>
                <th style={TH}>Name</th>
                <th style={TH}>Level</th>
                <th style={TH}>Category</th>
                <th style={{ ...TH, textAlign: "right" }}>Action</th>
              </tr></thead>
              <tbody>
                {discontinuedItems.map((p) => {
                  const lvl = getLevel(p.id);
                  return (
                    <tr key={p.id} style={{ opacity: 0.75 }}>
                      <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: LEVELS[lvl]?.color || "#888" }}>{p.id}</td>
                      <td style={{ ...TD, fontWeight: 500 }}>{p.name}</td>
                      <td style={TD}><LevelBadge level={lvl} levels={LEVELS} /></td>
                      <td style={{ ...TD, fontSize: 12, color: "#999" }}>{p.category}</td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        {isAdmin && (
                          <button
                            onClick={async () => {
                              try { await restoreItem(p.id); } catch (e) { show(`Restore failed: ${e.message}`, "error"); return; }
                              setDiscontinuedItems(prev => prev.filter(x => x.id !== p.id));
                              const restored = { ...p, status: "Active" };
                              if (restored.bom && restored.bom.length > 0) setAssemblies(prev => [...prev, restored]);
                              else setParts(prev => [...prev, restored]);
                              show("Restored");
                            }}
                            style={{ background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44", padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                          >
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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
                        {(() => {
                          const groupRollup = computeGroupStatus(group.lines);
                          if (groupRollup === "Partially Fulfilled") {
                            return (
                              <span style={{ background: "#f59e0b11", color: "#f59e0b", borderRadius: 4, padding: "4px 10px", fontSize: 12, border: "1px solid #f59e0b44", fontWeight: 600 }}>
                                Partially Fulfilled
                              </span>
                            );
                          }
                          return (
                            <select value={statuses.length === 1 ? statuses[0] : ""} onClick={e => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); setGroupStatus(group, e.target.value); }} style={{ ...IS, width: "auto", padding: "4px 8px", fontSize: 12, background: statuses.length === 1 ? sC(statuses[0]) + "11" : "#1a1a2a", color: statuses.length === 1 ? sC(statuses[0]) : "#888", borderColor: statuses.length === 1 ? sC(statuses[0]) + "44" : "#333" }}>
                              {statuses.length > 1 && <option value="">Mixed...</option>}
                              {ORD_STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          );
                        })()}
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
                              const lineAllocs = allocationsByOrder.get(o.id) || [];
                              const lineAllocTotal = lineAllocs.reduce((s, a) => s + a.qtyAllocated, 0);
                              const isPartial = lineAllocTotal > 0 && lineAllocTotal < o.qty && !isFulfilled;
                              return (
                                <tr key={o.id} style={{ opacity: isFulfilled ? 0.6 : 1 }}>
                                  <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#8b8bf5" }}>{o.id}</td>
                                  <td style={TD}>
                                    <div style={{ fontWeight: 500 }}>{it?.name || o.item}</div>
                                    <div style={{ fontSize: 11, color: "#666" }}>{o.item}{it ? ` • ${it.qty} in stock` : ""}</div>
                                    {lineAllocs.length > 0 && (
                                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                        {lineAllocs.map(a => (
                                          <span key={a.id} title={`Lot ${a.lotNumber} • ${a.qtyAllocated} units • allocated ${a.allocatedAt ? new Date(a.allocatedAt).toLocaleDateString() : ""}`}
                                            style={{ fontSize: 10, fontFamily: "monospace", background: "#fbbf2422", color: "#fbbf24", padding: "2px 6px", borderRadius: 4, border: "1px solid #fbbf2444" }}>
                                            {a.lotNumber} ×{a.qtyAllocated}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ ...TD, fontWeight: 600, fontSize: 15 }}>{o.qty}</td>
                                  <td style={{ ...TD, fontSize: 13, color: "#888" }}>{(() => { const up = getUnitPrice(groupOrderType, o.item); return up > 0 ? `$${up.toFixed(2)}` : "—"; })()}</td>
                                  <td style={{ ...TD, fontSize: 13, fontWeight: 600, color: "#22c55e" }}>{(() => { const up = getUnitPrice(groupOrderType, o.item); const lt = o.qty * up; return lt > 0 ? `$${lt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"; })()}</td>
                                  <td style={TD}>
                                    {isPartial ? (
                                      <span style={{ background: "#f59e0b11", color: "#f59e0b", borderRadius: 4, padding: "4px 8px", fontSize: 11, border: "1px solid #f59e0b44" }}>
                                        Partial ({lineAllocTotal}/{o.qty})
                                      </span>
                                    ) : (
                                      <select value={o.status} onClick={e => e.stopPropagation()} onChange={async (e) => {
                                        const ns = e.target.value;
                                        // Intercept Fulfilled — must go through lot allocation flow
                                        if (ns === "Fulfilled" && o.status !== "Fulfilled") {
                                          openFulfillModal([o]);
                                          return;
                                        }
                                        const updated = { ...o, status: ns };
                                        setOrders(prev => prev.map(x => x.id === o.id ? updated : x));
                                        try { await upsertOrder(updated); } catch (err) { console.warn(err); }
                                      }} style={{ ...IS, width: "auto", padding: "4px 8px", fontSize: 12, background: sC(o.status) + "11", color: sC(o.status), borderColor: sC(o.status) + "44" }}>
                                        {ORD_STATUSES.map(s => <option key={s}>{s}</option>)}
                                      </select>
                                    )}
                                  </td>
                                  <td style={{ ...TD, fontSize: 12, color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.notes || "—"}</td>
                                  <td style={TD}>
                                    <div style={{ display: "flex", gap: 4 }}>
                                      {!isFulfilled && (
                                        <button onClick={(e) => { e.stopPropagation(); openFulfillModal([o]); }} style={{ ...B2, padding: "4px 10px", borderColor: "#22c55e44", color: "#22c55e", fontSize: 11 }}>
                                          <PackageCheck size={12} /> {isPartial ? "Continue" : "Ship"}
                                        </button>
                                      )}
                                      {isFulfilled && lineAllocs.length > 0 && (
                                        <button onClick={(e) => { e.stopPropagation(); unfulfillOrderLine(o); }} title="Un-fulfill (restores inventory)" style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 3, fontSize: 10 }}>
                                          ⤺
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
      {tab === "mrp" && (() => {
        // Which SKU levels count as "demand" for production-mode MRP? Admin-configurable
        // (Admin → Planning → MRP Demand Levels). Default = [250] (batches only) so we
        // don't double-count batches AND their fills.
        const mrpDemandLevels = forecastConfig.mrpDemandLevels?.length ? forecastConfig.mrpDemandLevels : [250];
        const draftRuns = prodRuns
          .filter(r => (r.status || "Complete") === "Draft")
          .filter(r => mrpDemandLevels.includes(getLevel(r.assemblyId)))
          .sort((a, b) => (a.plannedDate || a.date || "").localeCompare(b.plannedDate || b.date || ""));
        const selectedSet = new Set(mrpSelectedRunIds);
        const allDraftIds = draftRuns.map(r => r.id);
        const allSelected = draftRuns.length > 0 && draftRuns.every(r => selectedSet.has(r.id));
        const toggleRun = (id) => {
          setMrpSelectedRunIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        };
        const demandLabel = mrpSource === "production" ? "Selected Runs" : "Open Orders";
        return (
        <div>
          {/* Source selector */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {[
              { k: "orders", label: "From Open Orders", icon: <ShoppingCart size={13} /> },
              { k: "production", label: "From Scheduled Production", icon: <Hammer size={13} /> },
            ].map(opt => (
              <button key={opt.k} onClick={() => setMrpSource(opt.k)}
                style={{ ...B2, background: mrpSource === opt.k ? "#6366f1" : "#2a2a3a", color: mrpSource === opt.k ? "#fff" : "#ccc", borderColor: mrpSource === opt.k ? "#6366f1" : "#333", fontSize: 12, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {/* Draft-run picker (only in production mode) */}
          {mrpSource === "production" && (
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #2a2a3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>Scheduled Production Runs (Drafts)</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setMrpSelectedRunIds(allSelected ? [] : allDraftIds)}
                    disabled={draftRuns.length === 0}
                    style={{ ...B2, fontSize: 11, padding: "4px 10px", opacity: draftRuns.length === 0 ? 0.4 : 1 }}>
                    {allSelected ? "Clear All" : "Select All"}
                  </button>
                  <span style={{ fontSize: 11, color: "#888", alignSelf: "center", marginLeft: 6 }}>
                    {mrpSelectedRunIds.length} of {draftRuns.length} selected
                  </span>
                </div>
              </div>
              {draftRuns.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: 12 }}>
                  No draft production runs. Schedule production on the Planning tab first.
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ position: "sticky", top: 0, background: "#1e1e2e", zIndex: 1 }}>
                      <th style={{ ...TH, width: 28 }}></th>
                      {["Run ID", "Planned", "Assembly", "Qty", "Lot #"].map(h => <th key={h} style={TH}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {draftRuns.map(r => {
                        const checked = selectedSet.has(r.id);
                        return (
                          <tr key={r.id} onClick={() => toggleRun(r.id)}
                            style={{ cursor: "pointer", background: checked ? "rgba(99,102,241,0.08)" : undefined }}>
                            <td style={TD}>
                              <input type="checkbox" checked={checked} onChange={() => toggleRun(r.id)}
                                onClick={(e) => e.stopPropagation()} style={{ cursor: "pointer" }} />
                            </td>
                            <td style={{ ...TD, fontFamily: "monospace", fontSize: 11, color: "#8b5cf6" }}>{r.id}</td>
                            <td style={{ ...TD, color: "#888" }}>{r.plannedDate || r.date || "—"}</td>
                            <td style={TD}>{r.assemblyName} <span style={{ color: "#888", fontSize: 10 }}>({r.assemblyId})</span></td>
                            <td style={{ ...TD, fontWeight: 600, color: "#f59e0b" }}>{r.qtyProduced}</td>
                            <td style={{ ...TD, fontFamily: "monospace", fontSize: 11, color: r.lotNumber ? "#a78bfa" : "#555" }}>{r.lotNumber ? padLotNumber(r.lotNumber) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={mrpSource === "production" ? <Hammer size={18} /> : <ShoppingCart size={18} />} label={demandLabel} value={mrp.demandRows.length} accent="#6366f1" />
            <Stat icon={<AlertTriangle size={18} />} label="Still to PO" value={mrp.critical} accent={mrp.critical > 0 ? "#ef4444" : "#22c55e"} />
            <Stat icon={<Truck size={18} />} label="On Order" value={mrp.pendingReceipt} accent="#38bdf8" />
            <Stat icon={<CheckCircle size={18} />} label="Covered" value={mrp.covered} accent="#22c55e" />
            <Stat icon={<DollarSign size={18} />} label="Purchase Needed" value={`$${mrp.totalCost.toFixed(2)}`} accent="#f59e0b" />
          </div>
          {mrp.demandRows.length === 0 ? <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: 40, textAlign: "center", color: "#555" }}><p>{mrpSource === "production" ? "Select one or more scheduled production runs to plan against." : "No open orders to plan for."}</p></div> : <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button onClick={genPOs} style={{ ...B1, background: "#f59e0b", color: "#000" }}><FileText size={15} /> Generate POs by Vendor</button></div>
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Raw Material Requirements (exploded from open orders)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead><tr>{["ProductCode", "Material", "Required", "On Hand", "Shortfall", "On Order", "Net Need", "Coverage", "Avg Cost", "Purchase $", "Supplier"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {mrp.rows.map((r) => {
                      // Visual states:
                      //  - netNeed > 0          → still need to PO (red)
                      //  - shortfall > 0 & netNeed = 0 → pending receipt, fully covered by existing PO (sky blue)
                      //  - shortfall === 0      → covered by on-hand (green / dim)
                      const pendingReceipt = r.shortfall > 0 && r.netNeed === 0;
                      const stillToPO = r.netNeed > 0;
                      const rowBg = stillToPO ? "rgba(239,68,68,0.06)" : pendingReceipt ? "rgba(56,189,248,0.06)" : "transparent";
                      const shortfallColor = stillToPO ? "#ef4444" : pendingReceipt ? "#38bdf8" : "#22c55e";
                      return (
                        <tr key={r.id} style={{ background: rowBg }}>
                          <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: "#6366f1" }}>{r.id}</td>
                          <td style={{ ...TD, fontWeight: 500 }}>
                            {r.name}
                            {stillToPO && <AlertTriangle size={13} style={{ color: "#ef4444", verticalAlign: "middle", marginLeft: 4 }} />}
                            {pendingReceipt && <Truck size={13} style={{ color: "#38bdf8", verticalAlign: "middle", marginLeft: 4 }} title="Covered by an open PO — pending receipt" />}
                          </td>
                          <td style={{ ...TD, fontWeight: 600 }}>{r.required} {r.unit}</td>
                          <td style={{ ...TD, color: r.qty >= r.required ? "#22c55e" : "#f59e0b" }}>{r.qty}</td>
                          <td style={{ ...TD, fontWeight: 700, color: shortfallColor }}>{r.shortfall > 0 ? r.shortfall : "—"}</td>
                          <td style={{ ...TD, fontWeight: 600, color: r.onOrder > 0 ? "#38bdf8" : "#555" }}>{r.onOrder > 0 ? r.onOrder : "—"}</td>
                          <td style={{ ...TD, fontWeight: 700, color: stillToPO ? "#ef4444" : "#555" }}>{stillToPO ? r.netNeed : "—"}</td>
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
                      );
                    })}
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
        );
      })()}

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
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                            {po.vendor} • {po.lines.length} items • {po.date}
                            {po.expectedReceiptDate && (
                              <span style={{ marginLeft: 8, color: "#a78bfa" }}>
                                • Expected {po.expectedReceiptDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>${po.total.toFixed(2)}</span>
                        <button onClick={(e) => { e.stopPropagation(); printPO(po); }} style={{ ...B2, padding: "5px 10px" }}><Printer size={13} /></button>
                        {po.status !== "Received" && po.status !== "Cancelled" && <button onClick={(e) => { e.stopPropagation(); openEditPO(po); }} style={{ ...B2, padding: "5px 10px", borderColor: "#6366f1", color: "#6366f1" }} title="Edit line items"><Edit2 size={13} /></button>}
                        {po.status !== "Received" && po.status !== "Cancelled" && <button onClick={(e) => { e.stopPropagation(); openReceiveFromPO(po.id); }} style={{ ...B2, padding: "5px 10px", borderColor: "#22c55e", color: "#22c55e" }}><PackageCheck size={13} /></button>}
                        <select value={po.status} onClick={(e) => e.stopPropagation()}
                          disabled={po.status === "Received"}
                          title={po.status === "Received" ? "Received POs are locked. Create an Inventory Adjustment receipt to correct." : ""}
                          onChange={async (e) => {
                          e.stopPropagation();
                          const ns = e.target.value;
                          // Block setting "Received" via the dropdown — it skips the receive
                          // flow so no receipt is created and no inventory moves. Force user
                          // through the Receive button instead.
                          if (ns === "Received" && po.status !== "Received") {
                            show("Use the green Receive button to record items received. Setting status directly would skip inventory updates.", "error");
                            return;
                          }
                          // Lock once received: silently reverting the status leaves inventory
                          // already added, which is misleading. Require an inventory adjustment
                          // to correct over-receipts. (`disabled` above prevents reaching here.)
                          if (po.status === "Received" && ns !== "Received") {
                            show("Received POs are locked. Create an Inventory Adjustment receipt to correct over- or under-counts.", "error");
                            return;
                          }
                          setPOs((p) => p.map((x) => x.id === po.id ? { ...x, status: ns } : x));
                          try { await updatePOStatus(po.id, ns); } catch (err) { console.warn(err); }
                        }} style={{ ...IS, width: "auto", minWidth: 90, padding: "4px 8px", fontSize: 12, opacity: po.status === "Received" ? 0.7 : 1, cursor: po.status === "Received" ? "not-allowed" : "pointer" }}>
                          {PO_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        {po.status === "Received" && (
                          <Lock size={12} style={{ color: "#888" }} title="Status locked — use Inventory Adjustment to correct" />
                        )}
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
      {tab === "receiving" && (() => {
        // Receipts table also stores Shipment / Shipment Reversal rows for the
        // transaction log — those belong to outbound flow, not this tab.
        const inboundReceipts = receipts.filter(r => r.type !== "Shipment" && r.type !== "Shipment Reversal");
        const searchedReceipts = !search ? inboundReceipts : inboundReceipts.filter(r => {
          const s = search.toLowerCase();
          if ((r.id || "").toLowerCase().includes(s)) return true;
          if ((r.type || "").toLowerCase().includes(s)) return true;
          if ((r.poId || "").toLowerCase().includes(s)) return true;
          if ((r.notes || "").toLowerCase().includes(s)) return true;
          if ((r.createdBy || "").toLowerCase().includes(s)) return true;
          return (r.lines || []).some(l => (l.name || "").toLowerCase().includes(s) || (l.partId || "").toLowerCase().includes(s));
        });
        return (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={<PackageCheck size={18} />} label="Total Receipts" value={inboundReceipts.length} accent="#22c55e" />
            <Stat icon={<FileText size={18} />} label="From POs" value={inboundReceipts.filter(r => r.poId).length} accent="#6366f1" />
            <Stat icon={<ClipboardList size={18} />} label="Manual" value={inboundReceipts.filter(r => !r.poId).length} accent="#f59e0b" />
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
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", fontSize: 13, fontWeight: 600, color: "#ccc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Receipt History</span>
              {search && <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>{searchedReceipts.length} of {inboundReceipts.length} match "{search}"</span>}
            </div>
            {searchedReceipts.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#555" }}>
                <PackageCheck size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                <p style={{ margin: 0 }}>{search ? "No receipts match your search." : "No receipts yet. Receive against a PO or create a manual receipt."}</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead><tr>
                    {["Receipt ID", "Date", "Type", "PO #", "Items", "Notes", ""].map(h => <th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {searchedReceipts.map(r => {
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
        );
      })()}

      {/* ================== PRODUCTION TAB ================== */}
      {tab === "production" && (() => {
        const draftCount = prodRuns.filter(r => (r.status || "Complete") === "Draft").length;
        const completeCount = prodRuns.filter(r => (r.status || "Complete") === "Complete").length;
        // Status filter first, then free-text search across run id, assembly id/name,
        // lot #, notes, and dates so the top search bar actually does something here.
        const statusFiltered = prodStatusFilter === "All" ? prodRuns
          : prodRuns.filter(r => (r.status || "Complete") === prodStatusFilter);
        const s = search.trim().toLowerCase();
        const filteredRuns = !s ? statusFiltered : statusFiltered.filter(r => {
          return [
            r.id, r.assemblyId, r.assemblyName, r.lotNumber, r.notes,
            r.date, r.plannedDate, r.status, r.createdBy,
          ].some(v => typeof v === "string" && v.toLowerCase().includes(s));
        });
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
                  <p style={{ margin: 0 }}>
                    No {prodStatusFilter !== "All" ? prodStatusFilter.toLowerCase() + " " : ""}production runs
                    {search ? <> matching <strong style={{ color: "#888" }}>"{search}"</strong></> : null}.
                  </p>
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
                              <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: r.lotNumber ? "#a78bfa" : "#555" }}>{r.lotNumber ? padLotNumber(r.lotNumber) : "—"}</td>
                              <td style={{ ...TD, fontWeight: 600, color: draft ? "#f59e0b" : "#22c55e" }}>{draft ? "" : "+"}{r.qtyProduced}</td>
                              <td style={{ ...TD, fontSize: 12 }}>{r.consumed?.length || 0} items</td>
                              <td style={{ ...TD, whiteSpace: "nowrap" }}>
                                {draft ? (
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button onClick={() => {
                                      setDraftToComplete(r);
                                      setProdAssembly(r.assemblyId); setProdQty(r.qtyProduced);
                                      const completionDate = r.plannedDate || r.date;
                                      setProdDate(completionDate);
                                      // Drafts no longer carry a pre-reserved lot #. For 200-level assemblies
                                      // (which need a new lot at completion), suggest one based on the
                                      // current counter + actual completion date. The user can edit it
                                      // before submitting. For higher levels, leave blank so the lot
                                      // source picker can drive selection.
                                      const lvl = getLevel(r.assemblyId);
                                      let suggested = r.lotNumber || "";
                                      if (!suggested && lvl <= 200) {
                                        const m = r.assemblyId.match(/^\d+-(\w+)/);
                                        const pl = m ? m[1] : "";
                                        suggested = formatLotNumber(digitForProductLine(pl, baseIngredients), lotCounter + 1, completionDate);
                                      }
                                      setProdLotNumber(suggested); setFreshLotNumber("");
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
                                ) : (
                                  isAdmin && (
                                    <button onClick={() => { setEditLotModal(r); setEditLotValue(r.lotNumber || ""); }}
                                      style={{ ...B2, fontSize: 11, padding: "3px 8px", color: "#a78bfa", borderColor: "#a78bfa44" }}
                                      title="Fix lot # (admin)">
                                      <Edit2 size={12} /> Lot #
                                    </button>
                                  )
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
            <SkuAutocomplete value={prodAssembly}
              onChange={(id) => {
                setProdAssembly(id); setProdConsume(initConsume(id)); setProdLotNumber(""); setFreshLotNumber("");
                // Auto-fill suggested lot for 200-level items — they always create a new lot,
                // and they have no lotSource so prodLotNumber is the direct text input.
                if (id && getLevel(id) === 200) {
                  const m = id.match(/^\d+-(\w+)/); const pl = m ? m[1] : "";
                  setProdLotNumber(formatLotNumber(digitForProductLine(pl, baseIngredients), lotCounter + 1, prodDate));
                }
              }}
              skuOpts={assemblies}
              placeholder="Type to search assembly…" />
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
                      {padLotNumber(l.lotNumber)} {l.planned ? `(PLANNED — ${l.qty} on ${l.productionDate || "?"})` : `(${l.qty} avail, ${l.productionDate || "?"})`}
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
            <SkuAutocomplete value={prodAssembly}
              onChange={(id) => {
                setProdAssembly(id); setProdConsume(initConsume(id)); setProdLotNumber(""); setFreshLotNumber("");
                if (id && getLevel(id) === 200) {
                  const m = id.match(/^\d+-(\w+)/); const pl = m ? m[1] : "";
                  setProdLotNumber(formatLotNumber(digitForProductLine(pl, baseIngredients), lotCounter + 1, prodDate));
                }
              }}
              skuOpts={assemblies}
              placeholder="Type to search assembly…" />
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
                      {padLotNumber(l.lotNumber)} {l.planned ? `(PLANNED — ${l.qty} on ${l.productionDate || "?"})` : `(${l.qty} avail, ${l.productionDate || "?"})`}
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
            <SkuAutocomplete value={prodAssembly}
              onChange={(id) => {
                setProdAssembly(id); setProdConsume(initConsume(id)); setProdLotNumber(""); setFreshLotNumber("");
                if (id && getLevel(id) === 200) {
                  const m = id.match(/^\d+-(\w+)/); const pl = m ? m[1] : "";
                  setProdLotNumber(formatLotNumber(digitForProductLine(pl, baseIngredients), lotCounter + 1, prodDate));
                }
              }}
              skuOpts={assemblies}
              placeholder="Type to search assembly…" />
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
                      {padLotNumber(l.lotNumber)} {l.planned ? `(PLANNED — ${l.qty} on ${l.productionDate || "?"})` : `(${l.qty} avail, ${l.productionDate || "?"})`}
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

      {/* ================== EDIT LOT # ON COMPLETED RUN (admin) ================== */}
      <Modal open={!!editLotModal} onClose={() => { if (!editLotSubmitting) { setEditLotModal(null); setEditLotValue(""); } }} title="Fix Lot # on Completed Run">
        {editLotModal && (() => {
          const run = editLotModal;
          const oldLot = run.lotNumber || "";
          const lotRow = lots.find(l => l.itemId === run.assemblyId && l.lotNumber === oldLot);
          const onHand = lotRow ? Number(lotRow.qty) : 0;
          const allocsForLot = orderLotAllocations.filter(a => a.itemId === run.assemblyId && a.lotNumber === oldLot);
          const newLot = String(editLotValue || "").trim();
          const newLotRow = newLot ? lots.find(l => l.itemId === run.assemblyId && l.lotNumber === newLot) : null;
          const wouldMerge = !!newLotRow && newLot !== oldLot;
          return (
            <div>
              <div style={{ background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12, color: "#bbb", lineHeight: 1.5 }}>
                <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>Run:</span> <span style={{ fontFamily: "monospace", color: "#8b5cf6" }}>{run.id}</span></div>
                <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>Item:</span> {run.assemblyName} <span style={{ color: "#666" }}>({run.assemblyId})</span></div>
                <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>Current Lot #:</span> <span style={{ fontFamily: "monospace", color: "#a78bfa" }}>{oldLot ? padLotNumber(oldLot) : "(blank)"}</span></div>
                <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>On hand in this lot:</span> <span style={{ color: "#22c55e", fontWeight: 600 }}>{onHand}</span></div>
                <div><span style={{ color: "#888" }}>Allocations referencing this lot:</span> <span style={{ color: "#f59e0b", fontWeight: 600 }}>{allocsForLot.length}</span></div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>New Lot # *</label>
                <input value={editLotValue} onChange={e => setEditLotValue(e.target.value)}
                  placeholder="Correct lot #" style={IS} autoFocus />
                {wouldMerge && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>
                    ⚠ Lot <span style={{ fontFamily: "monospace" }}>{padLotNumber(newLot)}</span> already exists for this item with on-hand <b>{Number(newLotRow.qty)}</b>. Submitting will <b>merge</b> the {onHand} from the old lot into it (new total: {onHand + Number(newLotRow.qty)}) and delete the old lot row.
                  </div>
                )}
                {!wouldMerge && newLot && newLot !== oldLot && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                    Will rename the lot row in inventory and remap any allocations. Production-run record will reflect the new lot #.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => { setEditLotModal(null); setEditLotValue(""); }} disabled={editLotSubmitting} style={B2}>Cancel</button>
                <button onClick={submitEditLot}
                  disabled={editLotSubmitting || !newLot || newLot === oldLot}
                  style={{ ...B1, opacity: (editLotSubmitting || !newLot || newLot === oldLot) ? 0.4 : 1 }}>
                  <Check size={14} /> {editLotSubmitting ? "Saving…" : (wouldMerge ? "Merge & Update" : "Update Lot #")}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ================== PERFORMANCE ================== */}
      {tab === "performance" && (() => {
        // Helpers (use existing fmtDate / parseDate / addDays / getMonday)
        const today = fmtDate(new Date());
        const currentMonday = getMonday(today);
        // Build a rolling 13-week window (oldest → newest)
        const weeks = [];
        for (let i = 12; i >= 0; i -= 1) {
          const ws = addDays(currentMonday, -7 * i);
          const we = addDays(ws, 6);
          const m = parseDate(ws);
          weeks.push({
            weekStart: ws,
            weekEnd: we,
            label: `${m.toLocaleString("en-US", { month: "short" })} ${m.getDate()}`,
          });
        }
        const weekIndexFor = (dateStr) => {
          if (!dateStr) return -1;
          const d = parseDate(dateStr);
          for (let i = 0; i < weeks.length; i += 1) {
            const s = parseDate(weeks[i].weekStart);
            const e = parseDate(weeks[i].weekEnd);
            if (d >= s && d <= e) return i;
          }
          return -1;
        };

        // ---------- Sales trends (Fulfilled orders by flavor) ----------
        const flavorOf = (itemId) => { const m = (itemId || "").match(/^\d+-(\w+)/); return m ? m[1] : "—"; };
        const flavorsSeen = new Set();
        const flavorWeekTotals = {}; // flavor -> [13 weekly dumpling totals]
        for (const o of orders) {
          if ((o.status || "").toLowerCase() !== "fulfilled") continue;
          const wi = weekIndexFor(o.shipDate || o.date);
          if (wi < 0) continue;
          const item = allItems.find(i => i.id === o.item);
          if (!item) continue;
          const ppu = item.piecesPerUnit || 0;
          if (ppu <= 0) continue; // skip non-dumpling line items
          const fl = flavorOf(item.id);
          flavorsSeen.add(fl);
          if (!flavorWeekTotals[fl]) flavorWeekTotals[fl] = Array(weeks.length).fill(0);
          flavorWeekTotals[fl][wi] += (Number(o.qty) || 0) * ppu;
        }
        const flavors = [...flavorsSeen].sort();
        const flavorTotals = flavors.map(fl => {
          const series = flavorWeekTotals[fl] || Array(weeks.length).fill(0);
          const recent4 = series.slice(-4).reduce((s, v) => s + v, 0);
          const prior4 = series.slice(-8, -4).reduce((s, v) => s + v, 0);
          const total13 = series.reduce((s, v) => s + v, 0);
          const pct = prior4 > 0 ? Math.round(((recent4 - prior4) / prior4) * 100) : (recent4 > 0 ? 100 : 0);
          return { flavor: fl, series, total13, recent4, prior4, pct };
        });

        // ---------- Productivity (300-Bin dumplings produced per labor hour) ----------
        const binProductionByWeek = Array(weeks.length).fill(0);
        for (const r of prodRuns) {
          if (r.status !== "Complete") continue;
          if (getLevel(r.assemblyId) !== 300) continue;
          const wi = weekIndexFor(r.date || r.plannedDate);
          if (wi < 0) continue;
          const item = allItems.find(i => i.id === r.assemblyId);
          if (!item) continue;
          const ppu = item.piecesPerUnit || 0;
          if (ppu <= 0) continue;
          binProductionByWeek[wi] += (Number(r.qtyProduced) || 0) * ppu;
        }
        const laborByWeek = {}; // weekStart -> { mfg, allIn }
        for (const lh of laborHours) {
          laborByWeek[lh.weekStart] = { mfg: lh.manufacturingHours, allIn: lh.allInHours };
        }
        const productivityRows = weeks.map((w, i) => {
          const lh = laborByWeek[w.weekStart] || { mfg: 0, allIn: 0 };
          const dumplings = binProductionByWeek[i];
          return {
            ...w,
            dumplings,
            mfgHours: lh.mfg || 0,
            allInHours: lh.allIn || 0,
            mfgRate: lh.mfg > 0 ? Math.round(dumplings / lh.mfg) : null,
            allInRate: lh.allIn > 0 ? Math.round(dumplings / lh.allIn) : null,
          };
        });
        const currentWeekRow = productivityRows[productivityRows.length - 1];
        const totalDumplings13 = binProductionByWeek.reduce((s, v) => s + v, 0);
        const flavorChartData = weeks.map((w, i) => {
          const row = { week: w.label };
          for (const fl of flavors) row[fl] = (flavorWeekTotals[fl] || [])[i] || 0;
          return row;
        });
        const flavorPalette = ["#fbbf24", "#a78bfa", "#22c55e", "#ef4444", "#06b6d4", "#f97316", "#ec4899", "#84cc16"];

        return (
          <div>
            {/* Header / KPI tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
              <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  <Activity size={14} /> Dumplings/hr — Manufacturing
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: currentWeekRow.mfgRate ? "#22c55e" : "#555" }}>
                  {currentWeekRow.mfgRate ? currentWeekRow.mfgRate.toLocaleString() : "—"}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }} title="Manufacturing = people making fill, batches, and folding dumplings">
                  current week • {currentWeekRow.dumplings.toLocaleString()} dumplings ÷ {currentWeekRow.mfgHours || 0} hrs
                </div>
              </div>
              <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  <Activity size={14} /> Dumplings/hr — All-In
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: currentWeekRow.allInRate ? "#a78bfa" : "#555" }}>
                  {currentWeekRow.allInRate ? currentWeekRow.allInRate.toLocaleString() : "—"}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }} title="All-in = manufacturing PLUS packing retail packs, deliveries, etc.">
                  current week • {currentWeekRow.dumplings.toLocaleString()} dumplings ÷ {currentWeekRow.allInHours || 0} hrs
                </div>
              </div>
              <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  <Sparkles size={14} /> 13-Week Production
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#fbbf24" }}>
                  {totalDumplings13.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>total dumplings produced (300-bin)</div>
              </div>
            </div>

            {/* Sales trends */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "16px 18px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Sales Trends by Flavor</h3>
                <span style={{ fontSize: 11, color: "#666" }}>Fulfilled orders, last 13 weeks</span>
              </div>
              {flavors.length === 0 ? (
                <p style={{ color: "#555", fontSize: 13, margin: "20px 0", textAlign: "center" }}>No fulfilled orders in the last 13 weeks.</p>
              ) : (
                <>
                  <div style={{ height: 220, marginBottom: 14 }}>
                    <ResponsiveContainer>
                      <LineChart data={flavorChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
                        <XAxis dataKey="week" stroke="#666" fontSize={11} />
                        <YAxis stroke="#666" fontSize={11} />
                        <ChartTooltip contentStyle={{ background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 6, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {flavors.map((fl, idx) => (
                          <Line key={fl} type="monotone" dataKey={fl} stroke={flavorPalette[idx % flavorPalette.length]} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#16161e", color: "#888", fontSize: 10, textTransform: "uppercase" }}>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Flavor</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>Last 4 wks</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>Prior 4 wks</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>Trend</th>
                          <th style={{ padding: "8px 10px", textAlign: "right" }}>13-Wk Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flavorTotals.map((fr, idx) => {
                          const TrendIcon = fr.pct > 0 ? TrendingUp : (fr.pct < 0 ? TrendingDown : MinusIcon);
                          const trendColor = fr.pct > 5 ? "#22c55e" : (fr.pct < -5 ? "#ef4444" : "#888");
                          return (
                            <tr key={fr.flavor} style={{ borderTop: "1px solid #2a2a3a" }}>
                              <td style={{ padding: "10px", fontWeight: 600, color: flavorPalette[idx % flavorPalette.length] }}>{fr.flavor}</td>
                              <td style={{ padding: "10px", textAlign: "right", color: "#e0e0e0" }}>{fr.recent4.toLocaleString()}</td>
                              <td style={{ padding: "10px", textAlign: "right", color: "#888" }}>{fr.prior4.toLocaleString()}</td>
                              <td style={{ padding: "10px", textAlign: "right", color: trendColor, whiteSpace: "nowrap" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <TrendIcon size={12} /> {fr.pct > 0 ? "+" : ""}{fr.pct}%
                                </span>
                              </td>
                              <td style={{ padding: "10px", textAlign: "right", color: "#e0e0e0", fontWeight: 500 }}>{fr.total13.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Productivity history */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Productivity by Week</h3>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#666" }}>Dumplings produced (300-bin) ÷ labor hours</span>
                  {isAdmin && (
                    <button onClick={async () => {
                      setToastSyncing(true);
                      try {
                        const resp = await fetch("/api/toast-sync?mode=full&weeks=13");
                        const j = await resp.json();
                        if (!resp.ok || !j.ok) throw new Error(j.error || "sync failed");
                        const fresh = await fetchLaborHours();
                        setLaborHours(fresh);
                        const freshJobs = await fetchToastJobs();
                        setToastJobs(freshJobs);
                        show(`Synced from Toast — ${j.weeksUpdated || 0} weeks updated`);
                      } catch (e) { show(e.message, "error"); }
                      setToastSyncing(false);
                    }} disabled={toastSyncing} style={{ ...B2, fontSize: 11, padding: "5px 10px" }}>
                      {toastSyncing ? <Loader2 size={12} className="spin" /> : <Activity size={12} />}
                      {toastSyncing ? " Syncing..." : " Sync from Toast"}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#16161e", color: "#888", fontSize: 10, textTransform: "uppercase" }}>
                      <th style={{ padding: "8px 10px", textAlign: "left" }}>Week</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>Dumplings Made</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }} title="Manufacturing hours: people making fill, batches, folding">Mfg Hrs</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }} title="All-in hours: manufacturing + packing, deliveries, etc.">All-In Hrs</th>
                      <th style={{ padding: "8px 10px", textAlign: "right", color: "#22c55e" }}>D/Hr Mfg</th>
                      <th style={{ padding: "8px 10px", textAlign: "right", color: "#a78bfa" }}>D/Hr All-In</th>
                      {isAdmin && <th style={{ padding: "8px 10px", textAlign: "center" }}>Edit</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {productivityRows.slice().reverse().map((row) => (
                      <tr key={row.weekStart} style={{ borderTop: "1px solid #2a2a3a" }}>
                        <td style={{ padding: "10px", color: "#e0e0e0" }}>{row.label} <span style={{ color: "#555", fontSize: 10 }}>({row.weekStart})</span></td>
                        <td style={{ padding: "10px", textAlign: "right", color: row.dumplings > 0 ? "#fbbf24" : "#555", fontWeight: 500 }}>{row.dumplings.toLocaleString()}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: row.mfgHours > 0 ? "#e0e0e0" : "#555" }}>{row.mfgHours || "—"}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: row.allInHours > 0 ? "#e0e0e0" : "#555" }}>{row.allInHours || "—"}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: row.mfgRate ? "#22c55e" : "#555", fontWeight: 600 }}>{row.mfgRate ? row.mfgRate.toLocaleString() : "—"}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: row.allInRate ? "#a78bfa" : "#555", fontWeight: 600 }}>{row.allInRate ? row.allInRate.toLocaleString() : "—"}</td>
                        {isAdmin && (
                          <td style={{ padding: "10px", textAlign: "center" }}>
                            <button onClick={async () => {
                              const mfg = window.prompt(`Manufacturing hours for week of ${row.label} (${row.weekStart}):`, String(row.mfgHours || 0));
                              if (mfg === null) return;
                              const allIn = window.prompt(`All-in hours for week of ${row.label} (${row.weekStart}):`, String(row.allInHours || 0));
                              if (allIn === null) return;
                              const mfgN = Number(mfg) || 0;
                              const allInN = Number(allIn) || 0;
                              try {
                                await upsertLaborHours({ weekStart: row.weekStart, manufacturingHours: mfgN, allInHours: allInN, notes: "" });
                                setLaborHours(prev => {
                                  const filtered = prev.filter(p => p.weekStart !== row.weekStart);
                                  return [...filtered, { weekStart: row.weekStart, manufacturingHours: mfgN, allInHours: allInN, notes: "" }];
                                });
                                show("Hours saved");
                              } catch (e) { show(e.message, "error"); }
                            }} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 3 }} title="Edit hours"><Edit2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!isAdmin && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 10, paddingTop: 10, borderTop: "1px solid #2a2a3a" }}>
                  Labor hours are entered by admins.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ================== LOT TRACKING ================== */}
      {tab === "lottracking" && (() => {
        const q = lotSearchQuery.trim().toLowerCase();
        // Find lot rows that match the search. Search hits both lot number and SKU id/name.
        const matchedLots = lots.filter(l => {
          if (!q) return false;
          if ((l.lotNumber || "").toLowerCase().includes(q)) return true;
          const item = allItems.find(i => i.id === l.itemId);
          if (!item) return false;
          return item.id.toLowerCase().includes(q) || (item.name || "").toLowerCase().includes(q);
        });
        // Also include any historical lots that may have qty=0 but had production runs / allocations
        const historicalLotNums = new Set();
        if (q) {
          for (const r of prodRuns) {
            if (r.lotNumber && (r.lotNumber.toLowerCase().includes(q) || (r.assemblyId || "").toLowerCase().includes(q) || (r.assemblyName || "").toLowerCase().includes(q))) {
              historicalLotNums.add(`${r.assemblyId}|${r.lotNumber}`);
            }
          }
          for (const a of orderLotAllocations) {
            if ((a.lotNumber || "").toLowerCase().includes(q)) historicalLotNums.add(`${a.itemId}|${a.lotNumber}`);
          }
        }
        const knownPairs = new Set(matchedLots.map(l => `${l.itemId}|${l.lotNumber}`));
        const extraHistorical = [...historicalLotNums].filter(k => !knownPairs.has(k)).map(k => {
          const [itemId, lotNumber] = k.split("|");
          return { itemId, lotNumber, qty: 0, productionDate: null };
        });
        const lotResults = q ? [...matchedLots, ...extraHistorical] : [];

        // Build the audit history for one lot: production, consumed-by-production, customer allocations.
        const buildLotHistory = (itemId, lotNumber) => {
          const events = [];
          // Created via production
          for (const r of prodRuns) {
            if (r.assemblyId === itemId && r.lotNumber === lotNumber && r.status === "Complete") {
              events.push({ kind: "create", date: r.date || r.createdAt, qty: r.qtyProduced, label: `Produced via ${r.id}`, ref: r.id });
            }
          }
          // Consumed in higher-level production runs (this lot was used as a raw material)
          for (const r of prodRuns) {
            if (!r.consumed) continue;
            for (const c of r.consumed) {
              if (c.partId === itemId && c.lotNumber === lotNumber) {
                events.push({ kind: "consume", date: r.date || r.createdAt, qty: -c.qty, label: `Consumed in ${r.id} (${r.assemblyName || r.assemblyId})`, ref: r.id });
              }
            }
          }
          // Allocated to customer orders
          for (const a of orderLotAllocations) {
            if (a.itemId === itemId && a.lotNumber === lotNumber) {
              const orderRow = orders.find(o => o.id === a.orderId);
              events.push({ kind: "ship", date: a.allocatedAt ? a.allocatedAt.slice(0, 10) : "", qty: -a.qtyAllocated, label: `→ ${orderRow?.customer || "Customer"} (Order ${a.orderId})`, ref: a.orderId, allocId: a.id });
            }
          }
          // Sort events by date
          events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          return events;
        };

        // SKU-first allocation flow:
        //   1. Pick a lot-tracked SKU
        //   2. Pick from lots available for that SKU
        //   3. Pick from open customer orders for that SKU
        //   4. Set qty

        // SKUs with at least one available lot
        const itemsWithLots = (() => {
          const ids = new Set(lots.filter(l => l.qty > 0).map(l => l.itemId));
          return allItems
            .filter(i => ids.has(i.id))
            .sort((a, b) => (a.id || "").localeCompare(b.id || ""));
        })();

        // Available lots for the selected SKU (FIFO order)
        const availableLotsForSelectedItem = lotAllocateForm.itemId
          ? (lotsByItem[lotAllocateForm.itemId] || [])
              .filter(l => l.qty > 0)
              .sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""))
          : [];

        // Selected lot record (if any)
        const selectedLot = lotAllocateForm.itemId && lotAllocateForm.lotNumber
          ? lots.find(l => l.itemId === lotAllocateForm.itemId && l.lotNumber === lotAllocateForm.lotNumber)
          : null;

        // Open customer orders with unfulfilled lines for the selected SKU
        const candidateOrders = lotAllocateForm.itemId
          ? orders
              .filter(o => o.item === lotAllocateForm.itemId && o.status !== "Fulfilled" && o.status !== "Cancelled")
              .map(o => ({
                ...o,
                alreadyAllocated: allocatedQtyForLine(o.id),
                remaining: o.qty - allocatedQtyForLine(o.id),
              }))
              .filter(o => o.remaining > 0)
          : [];

        const allActiveLots = lots
          .filter(l => l.qty > 0)
          .sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));

        return (
          <div>
            {/* Search bar */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "16px 18px", marginBottom: 14 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 15, color: "#e0e0e0", display: "flex", alignItems: "center", gap: 8 }}>
                <Search size={16} /> Lot Audit / Recall Lookup
              </h3>
              <input
                value={lotSearchQuery}
                onChange={(e) => setLotSearchQuery(e.target.value)}
                placeholder="Search by lot # or SKU (e.g. 60003, 300-CB Bin)..."
                style={{ ...IS, fontSize: 14 }}
              />
              {q && lotResults.length === 0 && (
                <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>No lots match "{lotSearchQuery}".</p>
              )}
            </div>

            {/* Search results */}
            {lotResults.map(l => {
              const item = allItems.find(i => i.id === l.itemId);
              const events = buildLotHistory(l.itemId, l.lotNumber);
              const totalProduced = events.filter(e => e.kind === "create").reduce((s, e) => s + e.qty, 0);
              const totalConsumed = -events.filter(e => e.kind === "consume").reduce((s, e) => s + e.qty, 0);
              const totalShipped = -events.filter(e => e.kind === "ship").reduce((s, e) => s + e.qty, 0);
              return (
                <div key={`${l.itemId}|${l.lotNumber}`} style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #fbbf2444", padding: "16px 18px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>{l.lotNumber}</div>
                      <div style={{ fontSize: 13, color: "#e0e0e0", marginTop: 2 }}>{item?.name || l.itemId} <span style={{ color: "#666", fontSize: 11 }}>({l.itemId})</span></div>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
                      <div><span style={{ color: "#666" }}>Produced:</span> <strong style={{ color: "#22c55e" }}>{totalProduced}</strong></div>
                      <div><span style={{ color: "#666" }}>Consumed:</span> <strong style={{ color: "#a78bfa" }}>{totalConsumed}</strong></div>
                      <div><span style={{ color: "#666" }}>Shipped:</span> <strong style={{ color: "#fbbf24" }}>{totalShipped}</strong></div>
                      <div><span style={{ color: "#666" }}>Remaining:</span> <strong style={{ color: l.qty > 0 ? "#e0e0e0" : "#888" }}>{l.qty}</strong></div>
                    </div>
                  </div>
                  {/* Movement timeline */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Movement History</div>
                    {events.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>No movement records for this lot.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {events.map((ev, idx) => {
                          const isCreate = ev.kind === "create";
                          const isShip = ev.kind === "ship";
                          const isConsume = ev.kind === "consume";
                          const color = isCreate ? "#22c55e" : isShip ? "#fbbf24" : "#a78bfa";
                          const icon = isCreate ? "📦" : isShip ? "🚚" : "🔨";
                          return (
                            <div key={idx} style={{ display: "grid", gridTemplateColumns: "30px 100px 1fr 80px", gap: 10, alignItems: "center", padding: "6px 10px", background: "#16161e", borderRadius: 6, borderLeft: `3px solid ${color}`, fontSize: 12 }}>
                              <span style={{ fontSize: 14 }}>{icon}</span>
                              <span style={{ color: "#888", fontFamily: "monospace" }}>{ev.date || "—"}</span>
                              <span style={{ color: "#e0e0e0" }}>{ev.label}</span>
                              <span style={{ color, fontWeight: 600, textAlign: "right" }}>{ev.qty > 0 ? `+${ev.qty}` : ev.qty}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Allocate Lot form — SKU first, then lot, then destination */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "16px 18px", marginBottom: 14 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 15, color: "#e0e0e0", display: "flex", alignItems: "center", gap: 8 }}>
                <PackageCheck size={16} /> Allocate a Lot
              </h3>
              <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
                Push a specific lot to a customer order. Useful for backfilling historical orders or hand-picking when FIFO isn't right.
              </p>

              {/* Step 1: SKU */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>1.</span> SKU
                </label>
                <select
                  value={lotAllocateForm.itemId}
                  onChange={(e) => setLotAllocateForm({ itemId: e.target.value, lotNumber: "", orderId: "", qty: 0 })}
                  style={IS}
                >
                  <option value="">Select SKU...</option>
                  {itemsWithLots.map(it => (
                    <option key={it.id} value={it.id}>[{it.id}] {it.name}</option>
                  ))}
                </select>
                {itemsWithLots.length === 0 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>No lot-tracked SKUs with available inventory.</div>
                )}
              </div>

              {/* Step 2: Lot */}
              {lotAllocateForm.itemId && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
                    <span style={{ color: "#fbbf24", fontWeight: 700 }}>2.</span> Available Lots
                    <span style={{ color: "#666", marginLeft: 6, fontWeight: 400 }}>(oldest first)</span>
                  </label>
                  {availableLotsForSelectedItem.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#ef4444", padding: "8px 0" }}>No active lots for this SKU.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {availableLotsForSelectedItem.map(l => {
                        const isSelected = lotAllocateForm.lotNumber === l.lotNumber;
                        return (
                          <label key={l.lotNumber}
                            style={{ display: "grid", gridTemplateColumns: "20px 1fr 100px 100px", alignItems: "center", gap: 8,
                              padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                              background: isSelected ? "#fbbf2422" : "#16161e",
                              border: `1px solid ${isSelected ? "#fbbf24" : "#2a2a3a"}` }}>
                            <input type="radio" name="alloc-lot" checked={isSelected}
                              onChange={() => setLotAllocateForm(f => ({ ...f, lotNumber: l.lotNumber, qty: 0 }))}
                              style={{ accentColor: "#fbbf24" }} />
                            <span style={{ fontFamily: "monospace", color: isSelected ? "#fbbf24" : "#e0e0e0", fontWeight: isSelected ? 700 : 500 }}>{l.lotNumber}</span>
                            <span style={{ fontSize: 12, color: "#888", textAlign: "right" }}>{l.qty} avail</span>
                            <span style={{ fontSize: 11, color: "#666", textAlign: "right" }}>made {l.productionDate || "?"}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Destination */}
              {lotAllocateForm.itemId && lotAllocateForm.lotNumber && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
                    <span style={{ color: "#fbbf24", fontWeight: 700 }}>3.</span> Where is this going?
                  </label>
                  {candidateOrders.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#888", padding: "8px 0" }}>
                      No open customer orders with a line for this SKU.
                    </div>
                  ) : (
                    <select
                      value={lotAllocateForm.orderId}
                      onChange={(e) => setLotAllocateForm(f => ({ ...f, orderId: e.target.value, qty: 0 }))}
                      style={IS}
                    >
                      <option value="">Select customer order...</option>
                      {candidateOrders.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.customer} • {o.date} • need {o.remaining} more (Order {o.id})
                        </option>
                      ))}
                    </select>
                  )}
                  <div style={{ fontSize: 10, color: "#555", marginTop: 4, fontStyle: "italic" }}>
                    Internal-location transfers coming in a future update.
                  </div>
                </div>
              )}

              {/* Step 4: Qty + Allocate */}
              {lotAllocateForm.itemId && lotAllocateForm.lotNumber && lotAllocateForm.orderId && (() => {
                const o = candidateOrders.find(c => c.id === lotAllocateForm.orderId);
                const max = o ? Math.min(selectedLot?.qty || 0, o.remaining) : 0;
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "flex-end" }}>
                    <div>
                      <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>
                        <span style={{ color: "#fbbf24", fontWeight: 700 }}>4.</span> Quantity
                        <span style={{ color: "#666", marginLeft: 6, fontWeight: 400 }}>(max {max})</span>
                      </label>
                      <input
                        type="number" min={0} max={max} step="any"
                        value={lotAllocateForm.qty || 0}
                        onChange={(e) => setLotAllocateForm(f => ({ ...f, qty: Math.min(max, Number(e.target.value) || 0) }))}
                        style={IS}
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!selectedLot || !o) return;
                        if (lotAllocateForm.qty <= 0) { show("Quantity must be > 0", "error"); return; }
                        if (lotAllocateForm.qty > max) { show(`Quantity exceeds available (max ${max})`, "error"); return; }
                        try {
                          const inserted = await createOrderLotAllocations([{
                            orderId: o.id, itemId: o.item, lotNumber: lotAllocateForm.lotNumber,
                            qtyAllocated: lotAllocateForm.qty,
                            locationFrom: allItems.find(i => i.id === o.item)?.location || "Dumpling Factory",
                            allocatedBy: profile?.email || "",
                          }]);
                          setOrderLotAllocations(prev => [...prev, ...inserted]);
                          try { await adjustLotQty(o.item, lotAllocateForm.lotNumber, -lotAllocateForm.qty, null, null); } catch (e) { console.warn(e.message); }
                          setLots(prev => prev.map(l => l.itemId === o.item && l.lotNumber === lotAllocateForm.lotNumber ? { ...l, qty: l.qty - lotAllocateForm.qty } : l).filter(l => l.qty > 0));
                          const newTotal = allocatedQtyForLine(o.id) + lotAllocateForm.qty;
                          if (newTotal >= o.qty) {
                            const updated = { ...o, status: "Fulfilled" };
                            setOrders(prev => prev.map(x => x.id === o.id ? updated : x));
                            try { await upsertOrder(updated); } catch (e) { console.warn(e.message); }
                            const it = allItems.find(i => i.id === o.item);
                            if (it) {
                              const newQty = it.qty - o.qty;
                              const isPart = parts.some(p => p.id === it.id);
                              if (isPart) setParts(prev => prev.map(p => p.id === it.id ? { ...p, qty: newQty } : p));
                              else setAssemblies(prev => prev.map(a => a.id === it.id ? { ...a, qty: newQty } : a));
                              try { await updateItemQty(it.id, newQty); } catch (e) { console.warn(e.message); }
                            }
                          }
                          show(`Allocated ${lotAllocateForm.qty} of ${lotAllocateForm.lotNumber} to ${o.customer}`);
                          setLotAllocateForm({ itemId: "", lotNumber: "", orderId: "", qty: 0 });
                        } catch (e) { show(e.message, "error"); }
                      }}
                      style={{ ...B1, height: 36, padding: "0 18px" }}
                      disabled={lotAllocateForm.qty <= 0 || lotAllocateForm.qty > max}
                    >
                      <PackageCheck size={14} /> Allocate
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* All active lots */}
            <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 14, color: "#ccc" }}>All Active Lots</h3>
                <span style={{ fontSize: 11, color: "#666" }}>{allActiveLots.length} active</span>
              </div>
              {allActiveLots.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "#555" }}>No active lots in inventory.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#16161e", color: "#888", fontSize: 10, textTransform: "uppercase" }}>
                        <th style={{ padding: "8px 12px", textAlign: "left" }}>Lot #</th>
                        <th style={{ padding: "8px 12px", textAlign: "left" }}>SKU</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "8px 12px", textAlign: "left" }}>Made</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allActiveLots.map(l => {
                        const item = allItems.find(i => i.id === l.itemId);
                        return (
                          <tr key={`${l.itemId}|${l.lotNumber}`} onClick={() => setLotSearchQuery(l.lotNumber)} style={{ borderTop: "1px solid #2a2a3a", cursor: "pointer" }}>
                            <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#fbbf24" }}>{l.lotNumber}</td>
                            <td style={{ padding: "8px 12px", color: "#e0e0e0" }}>{item?.name || l.itemId}<span style={{ color: "#666", fontSize: 10, marginLeft: 6 }}>{l.itemId}</span></td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#22c55e" }}>{l.qty}</td>
                            <td style={{ padding: "8px 12px", color: "#888" }}>{l.productionDate || "—"}</td>
                          </tr>
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

      {/* ================== TRANSACTION LOG ================== */}
      {tab === "log" && (() => {
        const filteredLog = transactionLog.filter(e => {
          if (!search) return true;
          const s = search.toLowerCase();
          return e.desc.toLowerCase().includes(s) || (e.user || "").toLowerCase().includes(s) || e.type.toLowerCase().includes(s) || (e.lot || "").toLowerCase().includes(s) || (e.detail || "").toLowerCase().includes(s) || (e.lines || []).some(ln => (ln.itemName || "").toLowerCase().includes(s) || (ln.itemId || "").toLowerCase().includes(s));
        });
        return (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <Stat icon={<ScrollText size={18} />} label="Total Transactions" value={transactionLog.length} accent="#6366f1" />
            <Stat icon={<Hammer size={18} />} label="Production Runs" value={transactionLog.filter(e => e.type === "Production").length} accent="#8b5cf6" />
            <Stat icon={<PackageCheck size={18} />} label="Receipts" value={transactionLog.filter(e => e.type === "Receipt").length} accent="#22c55e" />
            <Stat icon={<ShoppingCart size={18} />} label="Shipments" value={transactionLog.filter(e => e.type === "Shipment").length} accent="#ef4444" />
            <Stat icon={<Edit2 size={18} />} label="Adjustments" value={transactionLog.filter(e => e.type === "Adjustment").length} accent="#f59e0b" />
          </div>

          {/* Export controls */}
          <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "10px 14px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>Export CSV</span>
            <label style={{ fontSize: 11, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
              From
              <input type="date" value={txExportFrom} onChange={e => setTxExportFrom(e.target.value)} style={{ ...IS, padding: "4px 8px", fontSize: 12, width: 140 }} />
            </label>
            <label style={{ fontSize: 11, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
              To
              <input type="date" value={txExportTo} onChange={e => setTxExportTo(e.target.value)} style={{ ...IS, padding: "4px 8px", fontSize: 12, width: 140 }} />
            </label>
            <button onClick={exportTransactionLogCSV} style={B1}><Download size={14} /> Export CSV</button>
            {(txExportFrom || txExportTo) && (
              <button onClick={() => { setTxExportFrom(""); setTxExportTo(""); }} style={{ ...B2, fontSize: 11 }}>Clear</button>
            )}
            <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>
              {(() => {
                const from = txExportFrom || "0000-00-00";
                const to = txExportTo || "9999-99-99";
                const n = transactionLog.filter(e => (e.date || "") >= from && (e.date || "") <= to).length;
                return `${n} transaction${n === 1 ? "" : "s"} in range`;
              })()}
            </span>
          </div>

          <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead><tr>
                  <th style={{ ...TH, width: 28 }}></th>
                  {["Date", "Type", "Description", "Lot #", "Detail", "User"].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filteredLog.length === 0 ? (
                    <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: "#555", padding: 32 }}>
                      <ScrollText size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                      <p style={{ margin: 0 }}>No transactions recorded yet.</p>
                    </td></tr>
                  ) : (
                    filteredLog.map((e, i) => {
                      const key = `${e.id || ""}-${e.type}-${i}`;
                      const isOpen = !!txExpanded[key];
                      const hasLines = (e.lines || []).length > 0;
                      return (
                        <React.Fragment key={key}>
                          <tr style={{ cursor: hasLines ? "pointer" : "default" }} onClick={() => { if (hasLines) setTxExpanded(prev => ({ ...prev, [key]: !prev[key] })); }}>
                            <td style={TD}>
                              {hasLines && (
                                <button onClick={(ev) => { ev.stopPropagation(); setTxExpanded(prev => ({ ...prev, [key]: !prev[key] })); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 2 }} title={isOpen ? "Collapse" : "Expand"}>
                                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              )}
                            </td>
                            <td style={{ ...TD, fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{e.date}</td>
                            <td style={TD}>
                              <span style={{ background: e.color + "22", color: e.color, padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{e.type}</span>
                            </td>
                            <td style={{ ...TD, fontSize: 13 }}>{e.desc}</td>
                            <td style={{ ...TD, fontFamily: "monospace", fontSize: 12, color: e.lot ? "#a78bfa" : "#555" }}>{e.lot || "—"}</td>
                            <td style={{ ...TD, fontSize: 11, color: "#888", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.detail || ""}</td>
                            <td style={{ ...TD, fontSize: 11, color: "#666" }}>{e.user}</td>
                          </tr>
                          {isOpen && hasLines && (
                            <tr>
                              <td colSpan={7} style={{ ...TD, background: "#16161e", padding: "10px 14px 12px 48px" }}>
                                <div style={{ fontSize: 10, color: "#666", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Line-Level Movements</div>
                                <table style={{ width: "auto", borderCollapse: "collapse", fontSize: 12 }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Direction</th>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Qty</th>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Unit</th>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Item ID</th>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Item Name</th>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px", textAlign: "right" }}>Before</th>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px", textAlign: "right" }}>After</th>
                                      <th style={{ ...TH, fontSize: 10, padding: "4px 12px" }}>Lot #</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {e.lines.map((ln, li) => {
                                      const lvl = getLevel(ln.itemId);
                                      const sColor = ln.sign === "+" ? "#22c55e" : "#ef4444";
                                      const fmtQ = (q) => q === undefined || q === null ? "—" : (Math.round(q * 1000) / 1000);
                                      return (
                                        <tr key={li}>
                                          <td style={{ ...TD, padding: "4px 12px", color: sColor, fontWeight: 700, textAlign: "center" }}>{ln.sign}</td>
                                          <td style={{ ...TD, padding: "4px 12px", color: sColor, fontWeight: 600 }}>{ln.qty}</td>
                                          <td style={{ ...TD, padding: "4px 12px", color: "#888", fontSize: 11 }}>{ln.unit || "—"}</td>
                                          <td style={{ ...TD, padding: "4px 12px", fontFamily: "monospace", fontSize: 11, color: LEVELS[lvl]?.color || "#888" }}>{ln.itemId}</td>
                                          <td style={{ ...TD, padding: "4px 12px" }}>{ln.itemName}</td>
                                          <td style={{ ...TD, padding: "4px 12px", textAlign: "right", color: "#888", fontSize: 11 }}>{fmtQ(ln.beforeQty)}</td>
                                          <td style={{ ...TD, padding: "4px 12px", textAlign: "right", fontWeight: 600, color: "#e0e0e0" }}>{fmtQ(ln.afterQty)}</td>
                                          <td style={{ ...TD, padding: "4px 12px", fontFamily: "monospace", fontSize: 11, color: ln.lotNumber ? "#a78bfa" : "#555" }}>{ln.lotNumber || "—"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                {e.notes && <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}><span style={{ color: "#666", fontWeight: 600 }}>Notes:</span> {e.notes}</div>}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", borderTop: "1px solid #2a2a3a", color: "#555", fontSize: 11 }}>
              {filteredLog.length} of {transactionLog.length} transactions
            </div>
          </div>
        </div>
        );
      })()}

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
          { id: "toastLabor", label: "Toast Labor Mapping", icon: <Activity size={14} /> },
          { id: "wishes", label: "Wishes", icon: <Sparkles size={14} /> },
          { id: "backup", label: "Backup & Restore", icon: <Download size={14} /> },
        ];

        return (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* Sidebar */}
            <div style={{ minWidth: 180, background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden", flexShrink: 0 }}>
              {cfgSections.map(s => (
                <button key={s.id} onClick={() => setCfgSection(s.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 16px", background: cfgSection === s.id ? "#6366f122" : "transparent", border: "none", borderLeft: cfgSection === s.id ? "3px solid #6366f1" : "3px solid transparent", cursor: "pointer", color: cfgSection === s.id ? "#e0e0e0" : "#888", fontSize: 13, textAlign: "left" }}>
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
                    <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", padding: "14px 18px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 4 }}>MRP Demand Levels</div>
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
                        Which SKU levels count as demand on the Purchase Needs tab when planning from scheduled production. Default = 250 (Batches) so you don't double-count batches and their sub-recipes.
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {LEVEL_KEYS.map(lvl => {
                          const enabled = (forecastConfig.mrpDemandLevels || []).includes(lvl);
                          return (
                            <label key={lvl} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: enabled ? "#e0e0e0" : "#666", cursor: "pointer", padding: "4px 10px", borderRadius: 6, border: `1px solid ${enabled ? (LEVELS[lvl]?.color || "#6366f1") : "#2a2a3a"}`, background: enabled ? `${(LEVELS[lvl]?.color || "#6366f1")}11` : "transparent" }}>
                              <input type="checkbox" checked={enabled} onChange={e => {
                                setForecastConfig(prev => {
                                  const cur = prev.mrpDemandLevels || [];
                                  return { ...prev, mrpDemandLevels: e.target.checked ? [...cur, lvl] : cur.filter(x => x !== lvl) };
                                });
                              }} />
                              <span style={{ color: LEVELS[lvl]?.color || "#888", fontWeight: 600 }}>{lvl}</span>
                              <span>{LEVELS[lvl]?.cat || ""}</span>
                            </label>
                          );
                        })}
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
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 80 }}>Digit</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Base Ingredient Label</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Product Line Codes</th>
                          <th style={{ padding: "8px 10px", width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {baseIngredients.map((bi, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #2a2a3a" }}>
                            <td style={{ padding: "8px 10px" }}>
                              <input
                                type="number" min={0} value={bi.digit}
                                onChange={e => {
                                  const v = e.target.value === "" ? "" : parseInt(e.target.value, 10);
                                  setBaseIngredients(prev => prev.map((x, i) => i === idx ? { ...x, digit: v } : x));
                                }}
                                style={{ ...IS, width: "100%", fontFamily: "monospace", color: "#fbbf24", fontWeight: 700, fontSize: 14, textAlign: "center" }}
                              />
                            </td>
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
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              <button
                                onClick={() => {
                                  if (!confirm(`Delete digit ${bi.digit} (${bi.label || "unnamed"})? Existing lots that already use this digit are NOT affected.`)) return;
                                  setBaseIngredients(prev => prev.filter((_, i) => i !== idx));
                                }}
                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4 }}
                                title="Remove row"
                              ><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                      <button onClick={() => {
                        const usedDigits = new Set(baseIngredients.map(b => Number(b.digit)));
                        let nextDigit = 0;
                        while (usedDigits.has(nextDigit)) nextDigit += 1;
                        setBaseIngredients(prev => [...prev, { digit: nextDigit, label: "", productLines: [] }]);
                      }} style={B2}><Plus size={14} /> Add Row</button>
                      <button onClick={async () => {
                        const seen = new Set();
                        for (const b of baseIngredients) {
                          if (b.digit === "" || !Number.isFinite(Number(b.digit))) { show("Each row needs a numeric digit", "error"); return; }
                          if (seen.has(Number(b.digit))) { show(`Duplicate digit ${b.digit}`, "error"); return; }
                          seen.add(Number(b.digit));
                        }
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

              {/* Toast Labor Mapping */}
              {cfgSection === "toastLabor" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Toast Labor Mapping</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
                    Map each Toast job title to a labor bucket. Hours are auto-pulled every Monday at 8am UTC.
                    <br /><strong style={{ color: "#22c55e" }}>Manufacturing</strong> = makers (fill, batches, folding) — counts toward both KPIs.
                    <strong style={{ color: "#a78bfa", marginLeft: 8 }}>Other</strong> = packing, deliveries, FOH — counts only toward All-In.
                    <strong style={{ color: "#888", marginLeft: 8 }}>Excluded</strong> = doesn't count toward either.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button onClick={async () => {
                      setToastSyncing(true);
                      try {
                        const resp = await fetch("/api/toast-sync?mode=refresh-jobs");
                        const j = await resp.json();
                        if (!resp.ok || !j.ok) throw new Error(j.error || "sync failed");
                        const fresh = await fetchToastJobs();
                        setToastJobs(fresh);
                        show(`Refreshed ${j.jobsUpserted} jobs from Toast`);
                      } catch (e) { show(e.message, "error"); }
                      setToastSyncing(false);
                    }} disabled={toastSyncing} style={B1}>
                      {toastSyncing ? <Loader2 size={14} className="spin" /> : <Activity size={14} />}
                      {toastSyncing ? " Syncing..." : " Refresh Jobs from Toast"}
                    </button>
                  </div>
                  {toastJobs.length === 0 ? (
                    <p style={{ color: "#555", fontSize: 13, padding: 20, textAlign: "center", background: "#16161e", borderRadius: 8 }}>
                      No Toast jobs loaded yet. Click "Refresh Jobs from Toast" to pull them.
                    </p>
                  ) : (
                    <div style={{ background: "#1e1e2e", borderRadius: 10, border: "1px solid #2a2a3a", overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#16161e", color: "#888", fontSize: 11, textTransform: "uppercase" }}>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>Toast Job Title</th>
                            <th style={{ padding: "10px 12px", textAlign: "left", width: 200 }}>Labor Bucket</th>
                          </tr>
                        </thead>
                        <tbody>
                          {toastJobs.map(j => (
                            <tr key={j.jobGuid} style={{ borderTop: "1px solid #2a2a3a" }}>
                              <td style={{ padding: "10px 12px", color: "#e0e0e0" }}>{j.jobTitle}</td>
                              <td style={{ padding: "10px 12px" }}>
                                <select value={j.category} onChange={async (e) => {
                                  const newCat = e.target.value;
                                  setToastJobs(prev => prev.map(x => x.jobGuid === j.jobGuid ? { ...x, category: newCat } : x));
                                  try { await setToastJobCategory(j.jobGuid, newCat); }
                                  catch (err) { show(err.message, "error"); }
                                }} style={{ ...IS, width: "100%", color: j.category === "manufacturing" ? "#22c55e" : (j.category === "other" ? "#a78bfa" : "#888") }}>
                                  <option value="manufacturing" style={{ color: "#22c55e" }}>Manufacturing</option>
                                  <option value="other" style={{ color: "#a78bfa" }}>Other</option>
                                  <option value="excluded" style={{ color: "#888" }}>Excluded</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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
                        {allWishes.map(w => {
                          const isGranted = !!w.grantedAt;
                          const isAcked = !!w.acknowledgedAt;
                          return (
                            <div key={w.id} style={{ background: "#16161e", borderRadius: 8, border: `1px solid ${isGranted ? "#fbbf24aa" : "#2a2a3a"}`, padding: "14px 16px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, color: "#e0e0e0", marginBottom: 6, lineHeight: 1.5 }}>{w.wish}</div>
                                  <div style={{ fontSize: 11, color: "#666" }}>
                                    From <span style={{ color: "#888" }}>{w.userEmail}</span> on {new Date(w.createdAt).toLocaleDateString()}
                                    {isGranted && <span style={{ color: "#fbbf24", marginLeft: 8 }}>• Granted {new Date(w.grantedAt).toLocaleDateString()}{isAcked ? ` • Seen ${new Date(w.acknowledgedAt).toLocaleDateString()}` : " • Awaiting view"}</span>}
                                  </div>
                                  {w.grantedNote && (
                                    <div style={{ marginTop: 8, padding: "8px 10px", background: "#1a2a1a", border: "1px solid #22c55e33", borderRadius: 6, fontSize: 12, color: "#86efac" }}>
                                      <span style={{ color: "#22c55e", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 6 }}>Note:</span>
                                      {w.grantedNote}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                  <span style={{ fontSize: 24 }}>{isGranted ? "✨" : "🪔"}</span>
                                  {!isGranted ? (
                                    <button onClick={async () => {
                                      const note = window.prompt("Optional: describe what was built (shown to the user). Leave blank for none.", "");
                                      if (note === null) return; // user cancelled
                                      try {
                                        await grantWish(w.id, note);
                                        setAllWishes(prev => prev.map(x => x.id === w.id ? { ...x, grantedAt: new Date().toISOString(), grantedNote: note, acknowledgedAt: null } : x));
                                        show("Wish granted ✨");
                                      } catch (e) { show(e.message, "error"); }
                                    }} style={{ background: "linear-gradient(135deg, #fbbf24, #d97706)", color: "#000", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                      Grant ✨
                                    </button>
                                  ) : (
                                    <button onClick={async () => {
                                      if (!window.confirm("Ungrant this wish? The user will lose the celebration if they haven't seen it yet.")) return;
                                      try {
                                        await ungrantWish(w.id);
                                        setAllWishes(prev => prev.map(x => x.id === w.id ? { ...x, grantedAt: null, grantedNote: "", acknowledgedAt: null } : x));
                                        show("Wish ungranted");
                                      } catch (e) { show(e.message, "error"); }
                                    }} style={{ ...B2, fontSize: 10, padding: "3px 8px", color: "#888" }}>
                                      Ungrant
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 11, color: "#666" }}>{allWishes.length} wish{allWishes.length !== 1 ? "es" : ""} total • {allWishes.filter(w => w.grantedAt).length} granted</div>
                  </div>
                );
              })()}

              {/* Backup & Restore */}
              {cfgSection === "backup" && (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e0e0e0" }}>Backup &amp; Restore</h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px", lineHeight: 1.6 }}>
                    Download a complete snapshot of every table as a single JSON file. Save it somewhere safe — local disk, cloud drive, email to a sysadmin — so you can recover if the database is lost or corrupted. This works on the free Supabase plan, which doesn&apos;t include automatic backups.
                  </p>

                  {/* Status panel */}
                  <div style={{ background: "#16161e", borderRadius: 10, border: `1px solid ${daysSinceBackup === null || daysSinceBackup > 7 ? "#f59e0b66" : "#2a2a3a"}`, padding: "14px 18px", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      {daysSinceBackup === null ? (
                        <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
                      ) : daysSinceBackup > 7 ? (
                        <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
                      ) : (
                        <CheckCircle size={16} style={{ color: "#22c55e" }} />
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>
                        {lastBackupAt
                          ? `Last backup: ${new Date(lastBackupAt).toLocaleString()}`
                          : "No backup has been taken yet."}
                      </span>
                    </div>
                    {lastBackupAt && (
                      <div style={{ fontSize: 11, color: daysSinceBackup > 7 ? "#f59e0b" : "#888", marginLeft: 26 }}>
                        {daysSinceBackup === 0
                          ? "Taken today."
                          : daysSinceBackup === 1
                            ? "Taken yesterday."
                            : `${daysSinceBackup} days ago.${daysSinceBackup > 7 ? " Consider taking a new one." : ""}`}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                    <button onClick={downloadFullBackup} disabled={backupRunning}
                      style={{ ...B1, opacity: backupRunning ? 0.5 : 1, cursor: backupRunning ? "wait" : "pointer", background: "#22c55e", color: "#000", fontWeight: 700 }}>
                      {backupRunning ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Backing up…</> : <><Download size={14} /> Download Full Backup</>}
                    </button>
                    <a href={`mailto:?subject=Dumpling Genie backup&body=Attached is the latest Dumpling Genie database backup from ${new Date().toLocaleDateString()}.%0A%0AKeep it somewhere safe — restoring requires this file plus access to the Supabase project.`}
                      style={{ ...B2, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <FileText size={14} /> Compose email to sysadmin
                    </a>
                  </div>

                  {backupRunning && (
                    <div style={{ background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#bbb" }}>
                      Backing up: <span style={{ fontFamily: "monospace", color: "#22c55e" }}>{backupProgress.table}</span> ({backupProgress.rows} rows) — {backupProgress.done} of 20 tables done
                    </div>
                  )}

                  <div style={{ background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 8, padding: "14px 18px", fontSize: 12, color: "#bbb", lineHeight: 1.7 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0", marginBottom: 8 }}>How to use this</div>
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      <li>Click <strong>Download Full Backup</strong>. The file lands in your Downloads folder named <code style={{ color: "#fbbf24" }}>dumpling-genie-backup-YYYY-MM-DD…json</code>.</li>
                      <li>Email it (or upload it to a shared drive) using the <em>Compose email</em> button — your mail client opens with a draft. Attach the downloaded file and send.</li>
                      <li>To restore, the recipient needs Supabase access — they can re-import the JSON via a custom script. Restoring is a manual process; reach out to support if needed.</li>
                    </ol>
                    <div style={{ marginTop: 12, fontSize: 11, color: "#666" }}>
                      Recommended cadence: <strong>weekly</strong>, or after any major data import. This panel will show a yellow warning once a backup is more than 7 days old.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ================== MANUAL PO MODAL ================== */}
      <Modal open={manualPOModal} onClose={() => setManualPOModal(false)} title="Create Purchase Order" wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Vendor *</label>
            <select value={manualPOForm.vendor} onChange={e => setManualPOForm(f => ({ ...f, vendor: e.target.value }))} style={IS}>
              <option value="">Select vendor...</option>
              {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Expected Receipt</label>
            <input type="date" value={manualPOForm.expectedReceiptDate} onChange={e => setManualPOForm(f => ({ ...f, expectedReceiptDate: e.target.value }))} style={IS} />
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
                    <SkuAutocomplete value={line.partId}
                      onChange={(id) => {
                        const p = parts.find(x => x.id === id);
                        setManualPOLines(prev => prev.map((l, j) => j === i ? { ...l, partId: id, name: p?.name || "", unit: p?.unit || "", unitCost: p?.avgCost || 0 } : l));
                      }}
                      skuOpts={parts}
                      placeholder="Type to search item…"
                      style={{ minWidth: 240 }}
                      inputStyle={{ fontSize: 12 }} />
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

      {/* ================== EDIT PO MODAL ================== */}
      <Modal open={!!editPOModal} onClose={() => { if (!editPOSubmitting) setEditPOModal(null); }} title={editPOModal ? `Edit ${editPOModal.id}` : "Edit PO"} wide>
        {editPOModal && (
          <div>
            <div style={{ background: "#16161e", border: "1px solid #2a2a3a", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: "#bbb", display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div><span style={{ color: "#888" }}>Vendor:</span> <strong style={{ color: "#e0e0e0" }}>{editPOModal.vendor}</strong></div>
              <div><span style={{ color: "#888" }}>Status:</span> <span style={{ color: sC(editPOModal.status) }}>{editPOModal.status}</span></div>
              <div><span style={{ color: "#888" }}>Date:</span> {editPOModal.date}</div>
              {editPOModal.paymentTerms && <div><span style={{ color: "#888" }}>Terms:</span> {editPOModal.paymentTerms}</div>}
              {editPOModal.leadDays > 0 && <div><span style={{ color: "#888" }}>Lead:</span> {editPOModal.leadDays} days</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Expected Receipt</label>
                <input type="date" value={editPOExpectedDate} onChange={e => setEditPOExpectedDate(e.target.value)} style={IS} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Notes</label>
                <input value={editPONotes} onChange={e => setEditPONotes(e.target.value)} placeholder="Optional notes" style={IS} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>Line Items</div>
              <button onClick={() => setEditPOLines(prev => [...prev, { partId: "", name: "", qty: 0, unit: "", unitCost: 0 }])} style={B2}><Plus size={14} /> Add Line</button>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid #2a2a3a", borderRadius: 8, marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Item", "Qty", "Unit", "Unit Cost", "Line Total", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {editPOLines.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...TD, textAlign: "center", color: "#555", padding: 20 }}>No lines. Click "Add Line" to add one.</td></tr>
                  ) : editPOLines.map((line, i) => (
                    <tr key={i}>
                      <td style={TD}>
                        <SkuAutocomplete value={line.partId}
                          onChange={(id) => {
                            const p = parts.find(x => x.id === id);
                            setEditPOLines(prev => prev.map((l, j) => j === i ? { ...l, partId: id, name: p?.name || l.name, unit: p?.unit || l.unit, unitCost: l.unitCost > 0 ? l.unitCost : (p?.avgCost || 0) } : l));
                          }}
                          skuOpts={parts}
                          placeholder="Type to search item…"
                          style={{ minWidth: 240 }}
                          inputStyle={{ fontSize: 12 }} />
                      </td>
                      <td style={TD}><input type="number" step="any" min="0" value={line.qty} onChange={e => setEditPOLines(prev => prev.map((l, j) => j === i ? { ...l, qty: Number(e.target.value) } : l))} style={{ ...IS, width: 80, fontSize: 12 }} /></td>
                      <td style={{ ...TD, fontSize: 12, color: "#888" }}>{line.unit}</td>
                      <td style={TD}><input type="number" step="0.01" min="0" value={line.unitCost} onChange={e => setEditPOLines(prev => prev.map((l, j) => j === i ? { ...l, unitCost: Number(e.target.value) } : l))} style={{ ...IS, width: 90, fontSize: 12 }} /></td>
                      <td style={{ ...TD, fontSize: 12, fontWeight: 600, color: "#f59e0b" }}>${(Number(line.qty) * Number(line.unitCost)).toFixed(2)}</td>
                      <td style={TD}><button onClick={() => setEditPOLines(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 3 }} title="Remove line"><Minus size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#f59e0b" }}>
                New Total: ${editPOLines.reduce((s, l) => s + Number(l.qty) * Number(l.unitCost), 0).toFixed(2)}
                <span style={{ fontSize: 11, fontWeight: 400, color: "#666", marginLeft: 10 }}>(was ${editPOModal.total.toFixed(2)})</span>
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditPOModal(null)} disabled={editPOSubmitting} style={B2}>Cancel</button>
                <button onClick={submitEditPO} disabled={editPOSubmitting} style={{ ...B1, opacity: editPOSubmitting ? 0.4 : 1 }}><Check size={14} /> {editPOSubmitting ? "Saving…" : "Save Changes"}</button>
              </div>
            </div>
          </div>
        )}
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
                          <SkuAutocomplete value={line.partId}
                            onChange={(id) => { const p = parts.find(x => x.id === id); setRcvLines(prev => prev.map((l, j) => j === i ? { ...l, partId: id, name: p?.name || "", unit: p?.unit || "", location: p?.location || "" } : l)); }}
                            skuOpts={parts}
                            placeholder="Type to search item…"
                            inputStyle={{ fontSize: 12 }} />
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
                    <SkuAutocomplete value={line.partId}
                      onChange={(id) => setBomForm((p) => p.map((b, j) => j === i ? { ...b, partId: id } : b))}
                      skuOpts={bomItemsForLevel(formLevel)}
                      placeholder="Type to search component…"
                      style={{ flex: 2 }} />
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
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Item</label>
                <SkuAutocomplete value={form.item || ""}
                  onChange={(id) => setForm((f) => ({ ...f, item: id }))}
                  skuOpts={assemblies.filter((a) => getLevel(a.id) >= 300)}
                  placeholder="Type to search item…" />
              </div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Qty</label><input type="number" value={form.qty || 0} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Date</label><input type="date" value={form.date || ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={IS} /></div>
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Status <span style={{ color: "#666", fontSize: 10 }}>(use Ship to fulfill)</span></label><select value={form.status || "Pending"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={IS}>{ORD_STATUSES.filter(s => s !== "Fulfilled" && s !== "Partially Fulfilled").map((s) => <option key={s}>{s}</option>)}{form.status === "Fulfilled" && <option>Fulfilled</option>}</select></div>
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
              <div><label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 3 }}>Status <span style={{ color: "#666", fontSize: 10 }}>(use Ship to fulfill)</span></label><select value={form.status || "Pending"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={IS}>{ORD_STATUSES.filter(s => s !== "Fulfilled" && s !== "Partially Fulfilled").map((s) => <option key={s}>{s}</option>)}{form.status === "Fulfilled" && <option>Fulfilled</option>}</select></div>
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
                        <td style={TD}>
                          <SkuAutocomplete value={line.item}
                            onChange={(id) => setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, item: id } : l))}
                            skuOpts={assemblies.filter((a) => getLevel(a.id) >= 300)}
                            placeholder="Type to search item…"
                            inputStyle={{ fontSize: 13 }} />
                        </td>
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

      {/* Delete / Discontinue Confirm — items are soft-deleted (Discontinue),
          orders/vendors/POs are still hard-deleted. */}
      {(() => {
        const isItem = delConfirm && (parts.some(x => x.id === delConfirm) || assemblies.some(x => x.id === delConfirm));
        return (
          <Modal open={delConfirm !== null} onClose={() => setDelConfirm(null)} title={isItem ? "Discontinue Item" : "Confirm Delete"}>
            <p style={{ color: "#ccc", margin: "0 0 20px", fontSize: 14 }}>
              {isItem
                ? "This item will be marked Discontinued and hidden from active lists, dropdowns, and search. Historical records (BOMs, receipts, production runs, orders) will keep referencing it. You can restore it later from the Discontinued Items panel."
                : "Are you sure? This cannot be undone."}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setDelConfirm(null)} style={B2}>Cancel</button>
              <button onClick={() => { del(delConfirm); setDelConfirm(null); }} style={{ ...B1, background: isItem ? "#f59e0b" : "#dc2626" }}>
                {isItem ? "Discontinue" : "Delete"}
              </button>
            </div>
          </Modal>
        );
      })()}

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

      {/* Fulfillment / Allocation Modal — opens on Ship/Fulfill button click.
          For each unfulfilled line, FIFO-suggests lot allocations the user can
          edit. Lines fully allocated get marked Fulfilled; partial lines stay
          open and the order group reads as "Partially Fulfilled". */}
      <Modal open={!!fulfillModal} onClose={() => { setFulfillModal(null); setFulfillRows([]); }} title="Fulfill Order — Allocate Lots" wide>
        {fulfillModal && (() => {
          // Compute summary
          const fullyCount = fulfillRows.filter(r => {
            const total = r.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
            return total >= r.line.qty;
          }).length;
          const partialCount = fulfillRows.filter(r => {
            const total = r.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
            return total > 0 && total < r.line.qty;
          }).length;
          const noneCount = fulfillRows.filter(r => r.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0) === 0).length;
          const anyOverallocated = fulfillRows.some(r => r.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0) > r.line.qty);
          // "Any allocated" enables the confirm button. A row that has the
          // backfill subsection enabled + a source lot picked counts as
          // allocated for this purpose — its allocation gets added inside
          // confirmFulfillment Phase A.
          const anyAllocated = fulfillRows.some(r =>
            r.allocations.some(a => a.lotNumber && a.qty > 0) ||
            (r.backfill?.enabled && r.backfill?.sourceLot)
          );
          // Also block submit if a backfill row is enabled without a source lot picked.
          const backfillMissingSource = fulfillRows.some(r => r.backfill?.enabled && !r.backfill?.sourceLot);
          // Detect double-allocation: same lot used multiple times in same modal (legal but requires totals to fit lot avail)
          const lotUsage = new Map();
          for (const r of fulfillRows) {
            for (const a of r.allocations) {
              if (!a.lotNumber || !a.qty) continue;
              const key = `${r.line.item}|${a.lotNumber}`;
              lotUsage.set(key, (lotUsage.get(key) || 0) + Number(a.qty));
            }
          }
          const overdrawnLots = [];
          for (const [key, used] of lotUsage.entries()) {
            const [itemId, lotNumber] = key.split("|");
            const lot = (lotsByItem[itemId] || []).find(l => l.lotNumber === lotNumber);
            if (lot && used > lot.qty) overdrawnLots.push(`${lotNumber} (need ${used}, have ${lot.qty})`);
          }
          const customer = fulfillModal.lines[0]?.customer || "";
          return (
            <>
              <div style={{ marginBottom: 14, padding: "10px 14px", background: "#1a1a2a", borderRadius: 8, border: "1px solid #6366f133", fontSize: 12, color: "#a78bfa" }}>
                <strong>{customer}</strong> • {fulfillRows.length} line{fulfillRows.length === 1 ? "" : "s"} •
                <span style={{ color: "#22c55e", marginLeft: 6 }}>{fullyCount} fully allocated</span>
                {partialCount > 0 && <span style={{ color: "#f59e0b", marginLeft: 6 }}>• {partialCount} partial</span>}
                {noneCount > 0 && <span style={{ color: "#888", marginLeft: 6 }}>• {noneCount} no lots assigned</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                {fulfillRows.map((row, rowIdx) => {
                  const totalAlloc = row.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
                  const isFull = totalAlloc >= row.line.qty;
                  const isOver = totalAlloc > row.line.qty;
                  const remaining = row.line.qty - totalAlloc;
                  const availableLots = (lotsByItem[row.line.item] || [])
                    .filter(l => l.qty > 0)
                    .sort((a, b) => (a.productionDate || "").localeCompare(b.productionDate || ""));
                  return (
                    <div key={row.line.id} style={{ background: "#16161e", borderRadius: 10, border: `1px solid ${isOver ? "#ef4444" : isFull ? "#22c55e44" : (totalAlloc > 0 ? "#f59e0b44" : "#2a2a3a")}`, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>
                            {row.line.qty}× {row.item?.name || row.line.item}
                          </div>
                          <div style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}>{row.line.item}</div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isOver ? "#ef4444" : isFull ? "#22c55e" : (totalAlloc > 0 ? "#f59e0b" : "#888") }}>
                          {isOver ? "⚠ over-allocated" : isFull ? "✓ fully allocated" : (totalAlloc > 0 ? `⚠ ${remaining} short` : "no allocation")}
                          <span style={{ color: "#888", marginLeft: 8, fontWeight: 400 }}>{totalAlloc} / {row.line.qty}</span>
                        </div>
                      </div>
                      {!row.isLotTracked ? (
                        <div style={{ fontSize: 12, color: "#888", fontStyle: "italic", padding: "8px 0" }}>
                          This item is not lot-tracked. Confirm fulfillment to mark complete without allocation.
                        </div>
                      ) : availableLots.length === 0 && row.allocations.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#ef4444", padding: "8px 0" }}>
                          No lots in inventory. Cannot allocate this line.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {row.allocations.map((alloc, allocIdx) => (
                            <div key={allocIdx} style={{ display: "grid", gridTemplateColumns: "2fr 100px 80px 30px", gap: 8, alignItems: "center" }}>
                              <select value={alloc.lotNumber} onChange={(e) => {
                                const lot = availableLots.find(l => l.lotNumber === e.target.value);
                                updateFulfillAllocation(rowIdx, allocIdx, {
                                  lotNumber: e.target.value,
                                  productionDate: lot?.productionDate || "",
                                  availableInLot: lot?.qty || 0,
                                });
                              }} style={{ ...IS, fontSize: 12 }}>
                                <option value="">Select lot...</option>
                                {availableLots.map(l => (
                                  <option key={l.lotNumber} value={l.lotNumber}>
                                    {l.lotNumber} ({l.qty} avail{l.productionDate ? `, made ${l.productionDate}` : ""})
                                  </option>
                                ))}
                              </select>
                              <input type="number" min={0} step="any" value={alloc.qty || 0} onChange={(e) => updateFulfillAllocation(rowIdx, allocIdx, { qty: Number(e.target.value) || 0 })} style={{ ...IS, fontSize: 12 }} />
                              <span style={{ fontSize: 11, color: "#666" }}>{alloc.availableInLot ? `of ${alloc.availableInLot}` : ""}</span>
                              <button onClick={() => removeFulfillAllocation(rowIdx, allocIdx)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2 }}><X size={14} /></button>
                            </div>
                          ))}
                          <button onClick={() => addFulfillAllocation(rowIdx)} style={{ ...B2, fontSize: 11, padding: "4px 10px", alignSelf: "flex-start", marginTop: 4 }}>
                            <Plus size={12} /> Split across another lot
                          </button>
                        </div>
                      )}
                      {/* Backfill production — shown if there's a viable chain
                          through pre-existing lots and the row still has a
                          shortfall after existing allocations. */}
                      {row.isLotTracked && row.backfillChain && (() => {
                        const allocatedSoFar = row.allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);
                        const shortfall = Math.max(0, row.remaining - allocatedSoFar);
                        const bf = row.backfill;
                        if (!bf) return null;
                        const chain = row.backfillChain;
                        const deepest = chain[0];
                        const eligibleLots = deepest.eligibleLots || [];
                        // Recompute shortfall-relative consumed qtys for the chain summary
                        const scale = shortfall / row.backfillChain[row.backfillChain.length - 1].producedQty;
                        return (
                          <div style={{ marginTop: 10, padding: "10px 12px", background: "#16161e", border: `1px solid ${bf.enabled ? "#6366f1aa" : "#2a2a3a"}`, borderRadius: 8 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: bf.enabled ? "#a78bfa" : "#888", fontWeight: 600 }}>
                              <input type="checkbox" checked={bf.enabled}
                                onChange={(e) => updateFulfillBackfill(rowIdx, { enabled: e.target.checked })} />
                              <Hammer size={13} /> Backfill production for shortfall of {shortfall} {row.item?.unit || ""}
                              {shortfall <= 0 && <span style={{ color: "#666", fontWeight: 400, marginLeft: 4 }}>(no shortfall — fully covered by existing lots)</span>}
                            </label>
                            {bf.enabled && (
                              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Source Lot * (existing only)</div>
                                  <select value={bf.sourceLot} onChange={(e) => updateFulfillBackfill(rowIdx, { sourceLot: e.target.value })} style={{ ...IS, fontSize: 12, width: "100%" }}>
                                    <option value="">Select existing lot…</option>
                                    {eligibleLots.map(l => (
                                      <option key={l.lotNumber} value={l.lotNumber}>
                                        Lot {padLotNumber(l.lotNumber)} — {l.qty} of {deepest.consumedId}{l.productionDate ? ` (made ${l.productionDate})` : ""}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Production Date</div>
                                  <input type="date" value={bf.date} onChange={(e) => updateFulfillBackfill(rowIdx, { date: e.target.value })} style={{ ...IS, fontSize: 12, width: "100%" }} />
                                </div>
                              </div>
                            )}
                            {bf.enabled && (
                              <div style={{ marginTop: 10, padding: 10, background: "#1a1a2a", borderRadius: 6, fontSize: 11, color: "#a78bfa", fontFamily: "monospace" }}>
                                <div style={{ fontSize: 10, color: "#666", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "system-ui" }}>Production steps (deepest first)</div>
                                {chain.map((step, si) => {
                                  const scaledProduced = Math.ceil(step.producedQty * scale * 1000) / 1000;
                                  const scaledConsumed = Math.ceil(step.consumedQty * scale * 1000) / 1000;
                                  return (
                                    <div key={si} style={{ marginBottom: 2 }}>
                                      {si + 1}. Produce <span style={{ color: "#22c55e" }}>{scaledProduced}</span> {step.producedId}
                                      {" ← consume "}<span style={{ color: "#ef4444" }}>{scaledConsumed}</span> {step.consumedId}
                                      {bf.sourceLot && <span style={{ color: "#fbbf24" }}> (lot {padLotNumber(bf.sourceLot)})</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              {overdrawnLots.length > 0 && (
                <div style={{ background: "#2a1a1a", border: "1px solid #ef444466", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#fca5a5" }}>
                  <strong style={{ color: "#ef4444" }}>Cannot save — over-allocated lots:</strong>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    {overdrawnLots.map(l => <li key={l}>{l}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => { setFulfillModal(null); setFulfillRows([]); }} style={B2}>Cancel</button>
                <button onClick={confirmFulfillment} disabled={fulfillSubmitting || !anyAllocated || anyOverallocated || overdrawnLots.length > 0 || backfillMissingSource}
                  title={backfillMissingSource ? "Pick a source lot for each enabled backfill" : ""}
                  style={{ ...B1, background: fullyCount === fulfillRows.length ? "#22c55e" : "#f59e0b", color: "#000", opacity: (fulfillSubmitting || !anyAllocated || anyOverallocated || overdrawnLots.length > 0 || backfillMissingSource) ? 0.4 : 1 }}>
                  {fulfillSubmitting ? <Loader2 size={14} className="spin" /> : <PackageCheck size={14} />}
                  {fullyCount === fulfillRows.length ? " Confirm & Mark Fulfilled" : " Confirm Partial Fulfillment"}
                </button>
              </div>
            </>
          );
        })()}
      </Modal>

      {/* Wish Granted Celebration Modal — appears when this user has any
          unacknowledged granted wishes. Carousel walks through them one-by-one.
          Triggered by load-check, Supabase Realtime, or visibility change. */}
      {grantedWishes.length > 0 && (() => {
        const cur = grantedWishes[grantedIdx];
        const isLast = grantedIdx + 1 >= grantedWishes.length;
        const fmt = (s) => s ? new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
        return (
          <Modal open={true} onClose={() => { /* no-op: must acknowledge */ }} title="" hideCloseX>
            {/* Sparkle CSS — scoped via inline keyframes injected once */}
            <style>{`
              @keyframes wgFloat { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-8px) rotate(6deg)} }
              @keyframes wgSparkle { 0%,100%{opacity:0;transform:scale(0.6)} 50%{opacity:1;transform:scale(1)} }
              @keyframes wgGlow { 0%,100%{box-shadow:0 0 20px 2px rgba(251,191,36,0.25)} 50%{box-shadow:0 0 40px 6px rgba(251,191,36,0.55)} }
              @keyframes wgFadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
              .wg-genie { display:inline-block; animation: wgFloat 2.5s ease-in-out infinite; }
              .wg-spark { position:absolute; font-size:18px; pointer-events:none; animation: wgSparkle 1.6s ease-in-out infinite; }
              .wg-card { animation: wgFadeUp 0.45s ease-out, wgGlow 3s ease-in-out infinite; }
            `}</style>
            <div className="wg-card" style={{ textAlign: "center", padding: "16px 4px 4px", position: "relative", borderRadius: 12 }}>
              {/* Carousel pip count */}
              {grantedWishes.length > 1 && (
                <div style={{ position: "absolute", top: -4, left: 8, fontSize: 11, color: "#fbbf24", fontWeight: 600, letterSpacing: 0.5 }}>
                  Wish {grantedIdx + 1} of {grantedWishes.length}
                </div>
              )}
              {/* Sparkle decorations */}
              <span className="wg-spark" style={{ top: 8, left: "20%", animationDelay: "0s", color: "#fbbf24" }}>✨</span>
              <span className="wg-spark" style={{ top: 18, right: "18%", animationDelay: "0.5s", color: "#a78bfa" }}>✨</span>
              <span className="wg-spark" style={{ top: 60, left: "10%", animationDelay: "0.9s", color: "#22c55e" }}>⭐</span>
              <span className="wg-spark" style={{ top: 70, right: "10%", animationDelay: "0.3s", color: "#f59e0b" }}>✨</span>

              <div className="wg-genie" style={{ fontSize: 64, marginBottom: 8, lineHeight: 1 }}>🧞✨</div>
              <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Your wish has been granted!
              </h2>
              <p style={{ color: "#888", fontSize: 12, margin: "0 0 20px" }}>The Genie listened and made it real.</p>

              {/* Original wish quoted */}
              <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16161e 100%)", border: "1px solid #fbbf2466", borderRadius: 10, padding: "16px 18px", marginBottom: 14, position: "relative" }}>
                <div style={{ position: "absolute", top: -10, left: 14, background: "#1e1e2e", padding: "0 8px", fontSize: 10, color: "#fbbf24", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>You wished for</div>
                <div style={{ fontSize: 14, fontStyle: "italic", color: "#e0e0e0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>"{cur.wish}"</div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 8 }}>
                  Submitted {fmt(cur.createdAt)} • Granted {fmt(cur.grantedAt)}
                </div>
              </div>

              {/* Optional admin note about what was built */}
              {cur.grantedNote && (
                <div style={{ background: "#1a2a1a", border: "1px solid #22c55e44", borderRadius: 10, padding: "12px 14px", marginBottom: 16, textAlign: "left" }}>
                  <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>Here's what we built</div>
                  <div style={{ fontSize: 13, color: "#e0e0e0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{cur.grantedNote}</div>
                </div>
              )}

              {/* Navigation: prev arrow if not first; main button advances/closes */}
              <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center", marginTop: 8 }}>
                {grantedWishes.length > 1 && grantedIdx > 0 && (
                  <button onClick={() => setGrantedIdx(prev => Math.max(0, prev - 1))}
                    style={{ background: "none", border: "1px solid #444", color: "#888", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
                    ← Back
                  </button>
                )}
                <button onClick={acknowledgeCurrentWish}
                  style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)", color: "#000", border: "none", borderRadius: 8, padding: "12px 28px", cursor: "pointer", fontSize: 15, fontWeight: 700, boxShadow: "0 4px 16px rgba(251,191,36,0.4)", letterSpacing: 0.3 }}>
                  {isLast ? "All done ✨" : "Got it ✨"}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

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

      </div>
      </div>)}
    </div>
  );
}
