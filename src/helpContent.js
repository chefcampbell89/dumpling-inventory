// HELP CONTENT VERSION: v6
// ============================================================
// Ops Genie — Static Help Knowledge Base
// ============================================================
//
// This file is the entire "brain" of the free, in-app help genie.
// It is pure data: there are NO database calls, NO network requests,
// and NO ability to change anything in the app. The genie can only
// READ from this file and display the matching answer. That is by
// design — the help bot is structurally incapable of altering data,
// logic, or configuration.
//
// HOW TO MAINTAIN:
//  - Each topic is one entry in TOPICS below.
//  - `answer` may be a plain string, OR a function (ctx) => string
//    where ctx carries a little live app state for interpolation
//    (e.g. ctx.lowStockCount, ctx.isAdmin, ctx.appName).
//  - `keywords` drive search matching — add the words/phrases a user
//    might actually type. More synonyms = better matching.
//  - `steps` (optional) renders as a numbered how-to list.
//  - `related` (optional) lists other topic ids to suggest next.
//  - When the app changes, update the relevant topic's text here.
// ============================================================

// Display order + labels for the category browser.
export const CATEGORIES = [
  { id: "start", label: "Getting Started" },
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "items", label: "Item Master" },
  { id: "orders", label: "Orders" },
  { id: "vendors", label: "Vendors" },
  { id: "mrp", label: "Purchase Needs" },
  { id: "pos", label: "Purchase Orders" },
  { id: "receiving", label: "Receiving" },
  { id: "production", label: "Production" },
  { id: "planning", label: "Planning" },
  { id: "performance", label: "Performance" },
  { id: "lottracking", label: "Lot Tracking" },
  { id: "log", label: "Transaction Log" },
  { id: "admin", label: "Admin Config" },
  { id: "general", label: "Tips & Concepts" },
];

export const TOPICS = [
  // ---------------------------------------------------------
  // GETTING STARTED
  // ---------------------------------------------------------
  {
    id: "what-is-this",
    category: "start",
    title: "What does this app do?",
    keywords: ["what is this", "overview", "what does the app do", "purpose", "about", "help", "get started", "getting started", "intro"],
    answer: (ctx) =>
      `${ctx.appName} is your end-to-end inventory and production manager for the dumpling factory. It tracks raw materials, recipes, production runs, purchase orders, receiving, lot numbers, customer orders, and retail distribution — all the way from flour to finished cases.\n\nUse the left sidebar to move between areas. A typical day flows like this: take orders → plan production → check stock → order what's short → receive goods → run production → fulfill orders.`,
    related: ["navigation", "daily-flow", "levels"],
  },
  {
    id: "daily-flow",
    category: "start",
    title: "What's the typical workflow, start to finish?",
    keywords: ["workflow", "daily flow", "process", "steps", "where do i start", "how do i use this", "order of operations", "end to end"],
    answer: "Here's the end-to-end flow most days follow:",
    steps: [
      "Orders — record what customers want and their ship dates.",
      "Planning — schedule production runs by flavor and day for the week.",
      "Inventory — check what's on hand and what's running low.",
      "Purchase Needs (MRP) — see what raw materials you're short on, then generate POs.",
      "Purchase Orders — send POs to vendors and track their status.",
      "Receiving — log goods as they arrive (against a PO or manually).",
      "Production — mark scheduled runs complete and record what was consumed.",
      "Orders — allocate lots and ship the finished orders.",
    ],
    related: ["what-is-this", "navigation"],
  },
  {
    id: "navigation",
    category: "start",
    title: "How do I get around the app?",
    keywords: ["navigation", "navigate", "sidebar", "menu", "tabs", "where is", "find a page", "move around", "switch tabs"],
    answer: (ctx) =>
      `Everything lives in the left sidebar. Click any item to switch areas: Dashboard, Inventory, Item Master, Orders, Vendors, Purchase Needs, Purchase Orders, Receiving, Production, Planning, Performance, Lot Tracking, and Transaction Log.${ctx.isAdmin ? " As an admin you also see Admin Config at the bottom." : " (Admin Config is only visible to admins.)"}\n\nOn a narrow screen the sidebar collapses — tap the menu (☰) button to open it. Most tabs also have a search bar at the top to filter what you're looking at.`,
    related: ["search", "what-is-this"],
  },

  // ---------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------
  {
    id: "dashboard-overview",
    category: "dashboard",
    title: "What's on the Dashboard?",
    keywords: ["dashboard", "home", "overview screen", "main screen", "summary", "landing page"],
    answer: "The Dashboard is your read-only command center. It pulls together five things:",
    steps: [
      "Production Plan — a 3-week grid of scheduled batches (B) and fills (F) by day, from your draft production runs.",
      "Inventory by Flavor — bins, retail packs, food-service cases, retail cases, and total dumplings per flavor, plus what's on order.",
      "POs Awaiting — purchase orders that are Sent or Confirmed and not yet received.",
      "Weekly Outgoing Orders — orders shipping this week, grouped by customer and type, with estimated revenue.",
      "Demand Chart — a 13-week stacked bar chart of fulfilled dumpling orders by flavor.",
    ],
    related: ["dashboard-period", "revenue", "inventory-overview"],
  },
  {
    id: "dashboard-period",
    category: "dashboard",
    title: "What time period does the Dashboard show?",
    keywords: ["dashboard week", "change week", "which week", "time period", "this week", "rolling", "previous week", "next week", "navigate dashboard", "date range dashboard"],
    answer: "The Dashboard is fixed to the current period — there's no week selector on it. The Production Plan shows a rolling 3-week view (this week plus the next two), and the Inventory-by-Flavor, POs Awaiting, and Weekly Outgoing Orders sections reflect the current week and live data. The demand chart covers the last 13 weeks. If you want to pick a specific week to plan, use the Planning tab, which does have a week navigator (‹ ›, Today).",
    related: ["dashboard-overview", "planning-overview"],
  },
  {
    id: "dashboard-colors",
    category: "dashboard",
    title: "What do the colors mean on the Dashboard?",
    keywords: ["dashboard colors", "green amber red", "color meaning", "dimmed orders", "difference column"],
    answer: "On the Inventory-by-Flavor table, green means you're in good shape, amber means partial coverage, and red flags a shortfall versus demand. Estimated revenue shows in bright green. In the weekly orders list, fulfilled lines are dimmed (faded) so the open ones you still need to ship stand out.",
    related: ["dashboard-overview", "colors-general"],
  },

  // ---------------------------------------------------------
  // INVENTORY
  // ---------------------------------------------------------
  {
    id: "inventory-overview",
    category: "inventory",
    title: "What's on the Inventory tab?",
    keywords: ["inventory", "stock", "stock levels", "on hand", "quantities", "what do i have"],
    answer: "The Inventory tab is your master stock view. Each row is an item showing its product code, name, level, costing method, quantity on hand, minimum, unit, average cost, BOM cost, location, and supplier. Click the chevron on a row to expand it and see the lot/batch breakdown and the item's bill of materials.",
    related: ["inventory-lowstock", "inventory-filter", "inventory-expand", "edit-qty"],
  },
  {
    id: "inventory-lowstock",
    category: "inventory",
    title: "Why is a row highlighted red / what's the low-stock alert?",
    keywords: ["red", "red row", "highlighted", "low stock", "below minimum", "min stock", "alert", "warning triangle", "attention badge", "running low"],
    answer: (ctx) => {
      const base =
        "A row turns light red and its quantity shows in red when the on-hand quantity is at or below the item's minimum stock level. You'll also see an amber warning triangle next to the item's name. The red badge on the Inventory button in the sidebar counts how many items currently need attention.";
      if (typeof ctx.lowStockCount === "number") {
        return base + `\n\nRight now you have ${ctx.lowStockCount} item${ctx.lowStockCount === 1 ? "" : "s"} at or below minimum.`;
      }
      return base;
    },
    related: ["inventory-filter", "min-stock-set", "colors-general"],
  },
  {
    id: "inventory-filter",
    category: "inventory",
    title: "How do I filter or search inventory?",
    keywords: ["filter inventory", "search inventory", "level filter", "stock filter", "show only low", "find item", "sort inventory", "filter by level"],
    answer: "You have three tools on the Inventory tab:",
    steps: [
      "Search bar — type part of an item's code or name to narrow the list.",
      "Level filter — check the boxes (100–500) to show only certain hierarchy levels.",
      "Stock filter — switch between All, Low, and OK to focus on items that need ordering.",
      "Click any column header to sort by it; click again to reverse the order.",
    ],
    related: ["inventory-overview", "levels", "search"],
  },
  {
    id: "inventory-expand",
    category: "inventory",
    title: "How do I see an item's lots or recipe?",
    keywords: ["expand row", "lot breakdown", "see lots", "bill of materials", "bom", "recipe", "chevron", "ingredients"],
    answer: "Click the chevron (›) at the start of any row that has lots or a recipe. The expanded panel shows two things when available: the LOT / BATCH BREAKDOWN (each lot number, its quantity, location, and production date) and the BILL OF MATERIALS (the item's ingredients and quantities).",
    related: ["inventory-overview", "lot-what", "bom-what"],
  },
  {
    id: "edit-qty",
    category: "inventory",
    title: "How do I adjust an item's quantity?",
    keywords: ["edit quantity", "adjust qty", "change stock", "fix count", "correct quantity", "edit qty", "manual adjustment"],
    answer: (ctx) =>
      (ctx.isAdmin
        ? "Click the pencil (Edit Qty) icon on the item's row to open the adjustment modal and set the corrected quantity. "
        : "Adjusting quantities is an admin-only action, so you won't see the edit button. Ask an admin to make the correction. ") +
      "For received goods, prefer recording a receipt on the Receiving tab so there's a proper audit trail; use a direct adjustment only for corrections.",
    related: ["inventory-overview", "receiving-manual", "admin-only"],
  },

  // ---------------------------------------------------------
  // ITEM MASTER
  // ---------------------------------------------------------
  {
    id: "items-overview",
    category: "items",
    title: "What's the Item Master tab for?",
    keywords: ["item master", "items", "catalog", "create item", "edit item", "sku list", "products"],
    answer: "Item Master is the full catalog of every SKU. From here you can create and edit items, manage their recipes (bill of materials), set alternate vendors, toggle lot tracking, and discontinue or restore items. Click the chevron on a row to view its recipe; click the pencil to edit everything about the item.",
    related: ["items-add", "items-discontinue", "bom-edit"],
  },
  {
    id: "items-add",
    category: "items",
    title: "How do I add or edit an item?",
    keywords: ["add item", "new item", "create sku", "edit item", "new product", "add product"],
    answer: "From the Item Master tab, use the Add button to create a new item, or click the blue pencil on any row to edit one. The form lets you set the code, name, level, category, costing method, unit, minimum stock, default location, supplier(s), lot-tracking flag, and the bill of materials.",
    related: ["items-overview", "bom-edit", "levels"],
  },
  {
    id: "items-discontinue",
    category: "items",
    title: "How do I delete or restore an item?",
    keywords: ["delete item", "discontinue", "remove item", "restore item", "deactivate", "obsolete", "bring back item", "discontinued section"],
    answer: (ctx) =>
      (ctx.isAdmin
        ? "Deleting an item from Item Master is a soft-delete: click the red trash icon and it moves to the Discontinued section at the bottom of the tab. To bring it back, expand that section and click Restore on the item. Nothing is ever truly erased, so historical records stay intact."
        : "Deleting and restoring items is admin-only. Discontinued items collect in a collapsible section at the bottom of the Item Master tab; an admin can restore them from there."),
    related: ["items-overview", "admin-only"],
  },

  // ---------------------------------------------------------
  // ORDERS
  // ---------------------------------------------------------
  {
    id: "orders-overview",
    category: "orders",
    title: "How do customer orders work?",
    keywords: ["orders", "customer order", "sales order", "create order", "order tab", "outgoing"],
    answer: "The Orders tab tracks what customers want and how it's fulfilled. Orders are grouped into cards; each card has a customer, date, type (e.g. Wholesale / Retail / Food Service), status, and ship date, plus line items. The top of the tab shows an On-Order Snapshot — see the \"On-Order Snapshot\" topic — instead of plain count tiles.",
    related: ["orders-snapshot", "orders-add", "orders-fulfill", "orders-shipall"],
  },
  {
    id: "orders-snapshot",
    category: "orders",
    title: "On-Order Snapshot (top of the Orders tab)",
    keywords: ["on order", "on-order", "snapshot", "at risk", "short", "shortfall", "dumplings on order", "flavors at risk", "by flavor", "finished good", "open orders", "grid", "matrix", "tight"],
    answer: "The top of the Orders tab shows a live snapshot of open demand — every unshipped order, i.e. any status except Fulfilled and Cancelled (Pending, Confirmed, In Production, Partially Fulfilled). Three cards summarize it: Open Orders, Dumplings On Order, and Flavors At Risk. Below them, per-flavor chips and a grid break it down — finished-good type (Pack, Food Service Case, Retail Case, Catering Tray, …) down the rows and dumpling flavor across the columns, with each cell showing the units on order. A footer row totals the units and the dumplings on order per flavor.\n\nRisk colors compare dumplings on order against what's in stock for that flavor: red = not enough inventory to cover the orders, yellow/Tight = covered but with less than a 5% cushion, green/OK = comfortable. (Stock is counted in dumplings by walking each item's recipe, so it matches the Dashboard's Dumplings-by-Flavor panel.)",
    related: ["orders-overview", "dashboard-overview", "dashboard-colors"],
  },
  {
    id: "orders-add",
    category: "orders",
    title: "How do I create an order or add a line?",
    keywords: ["create order", "new order", "add line", "add item to order", "place order", "order line"],
    answer: "Use the Order button (top of the tab) to start a new order. On an order card, the Add Line button adds an item — pick the SKU and enter a quantity. You can rename the customer inline by clicking the name, and set the ship date with the date picker.",
    related: ["orders-overview", "orders-fulfill"],
  },
  {
    id: "orders-fulfill",
    category: "orders",
    title: "How do I fulfill / ship an order?",
    keywords: ["fulfill order", "ship order", "mark fulfilled", "allocate lots", "complete order", "shipped", "lot allocation"],
    answer: "Change a line's status to Fulfilled (or use Ship All on the card to do every open line at once). For lot-tracked items this opens a lot-allocation step where you pick which lots the shipment draws from — that's what makes recall traceability possible. A partly shipped order shows an amber \"Partial (X/Y)\" indicator.",
    related: ["orders-shipall", "lot-what", "lottracking-overview"],
  },
  {
    id: "orders-shipall",
    category: "orders",
    title: "What does \"Ship All\" do?",
    keywords: ["ship all", "bulk fulfill", "fulfill all lines", "ship everything"],
    answer: "Ship All marks every unfulfilled line on that order card as Fulfilled in one go, running the lot allocation for each lot-tracked item. Use it when an entire order is going out together.",
    related: ["orders-fulfill"],
  },

  // ---------------------------------------------------------
  // VENDORS
  // ---------------------------------------------------------
  {
    id: "vendors-overview",
    category: "vendors",
    title: "How do I manage vendors?",
    keywords: ["vendors", "suppliers", "add vendor", "edit vendor", "vendor list", "contact", "lead time", "payment terms"],
    answer: "The Vendors tab is your supplier list. Each row shows the vendor's ID, name, contact, email, phone, payment terms, lead time (days), and how many parts you source from them. Use Vendor (top) to add one, the pencil to edit details, and the red trash to remove a vendor. Lead time feeds purchase planning, so keep it accurate.",
    related: ["mrp-overview", "items-add"],
  },

  // ---------------------------------------------------------
  // PURCHASE NEEDS (MRP)
  // ---------------------------------------------------------
  {
    id: "mrp-overview",
    category: "mrp",
    title: "What is the Purchase Needs (MRP) tab?",
    keywords: ["purchase needs", "mrp", "material requirements", "what to order", "shortfall", "what do i need to buy", "explosion"],
    answer: "Purchase Needs runs a material requirements calculation: it takes your demand, explodes it through the recipes down to raw materials, subtracts what's on hand and already on order, and shows what you still need to buy. The header tiles summarize how much is still to PO, on order, covered, and the total purchase cost.",
    related: ["mrp-source", "mrp-generate", "mrp-colors"],
  },
  {
    id: "mrp-source",
    category: "mrp",
    title: "Where does Purchase Needs get its demand from?",
    keywords: ["mrp source", "demand source", "from orders", "from production", "scheduled production", "open orders toggle"],
    answer: "Use the toggle at the top to choose the demand source:",
    steps: [
      "From Open Orders — demand comes from your pending/confirmed customer orders.",
      "From Scheduled Production — demand comes from your draft production runs; check which runs to include in the picker (Select All / Clear All help).",
      "If the production picker is empty, schedule runs on the Planning tab first.",
    ],
    related: ["mrp-overview", "mrp-generate", "planning-overview"],
  },
  {
    id: "mrp-generate",
    category: "mrp",
    title: "How do I generate purchase orders from Purchase Needs?",
    keywords: ["generate po", "create po from mrp", "generate purchase orders", "order shortfalls", "by vendor"],
    answer: "Once the table shows your shortfalls, click Generate POs by Vendor at the bottom. It groups the needed materials by their supplier and creates a draft PO for each vendor. You can then review and send them from the Purchase Orders tab.",
    related: ["mrp-overview", "pos-overview"],
  },
  {
    id: "mrp-colors",
    category: "mrp",
    title: "What do the row colors mean in Purchase Needs?",
    keywords: ["mrp colors", "coverage bar", "net need", "still to po", "pending receipt", "covered", "blue row mrp", "red row mrp"],
    answer: "Each material row is color-coded by coverage:",
    steps: [
      "Red (Still to PO) — you have a net need; this still needs to be ordered.",
      "Blue (Pending Receipt) — it's short on hand but already covered by an open PO that just hasn't arrived yet.",
      "Green (Covered) — no shortfall.",
      "The coverage bar fills green at 100%+, amber at 50%+, and red below 50%.",
    ],
    related: ["mrp-overview", "colors-general"],
  },

  // ---------------------------------------------------------
  // PURCHASE ORDERS
  // ---------------------------------------------------------
  {
    id: "pos-overview",
    category: "pos",
    title: "How do purchase orders work?",
    keywords: ["purchase orders", "po", "pos", "create po", "po status", "send po", "buy materials"],
    answer: "The Purchase Orders tab manages inbound POs to vendors. Each PO card shows its ID, status, vendor, line count, date, expected receipt date, and total. Create one manually with Create PO, or generate them from Purchase Needs. Print a PO to send to a vendor, edit it while it's open, and Receive it when goods arrive.",
    related: ["po-status", "po-receive", "mrp-generate"],
  },
  {
    id: "po-status",
    category: "pos",
    title: "What are the PO statuses?",
    keywords: ["po status", "draft sent confirmed received", "status workflow", "cancelled po", "po locked", "change po status"],
    answer: "A PO moves through Draft → Sent → Confirmed → Received, and can be Cancelled. Change status with the dropdown on the card. Once a PO is Received it locks (you can't reverse the status) — if something received was wrong, correct it with an inventory adjustment on the Receiving tab rather than un-receiving the PO.",
    related: ["pos-overview", "po-receive", "receiving-manual"],
  },
  {
    id: "po-receive",
    category: "pos",
    title: "How do I receive against a PO?",
    keywords: ["receive po", "receive against po", "po arrived", "log delivery", "receive goods"],
    answer: "Click the green Receive button on an open PO (or use the Quick Receive panel on the Receiving tab). This opens a receiving form pre-filled from the PO; confirm the quantities actually received. Submitting creates a receipt and updates inventory, and marks the PO Received.",
    related: ["po-status", "receiving-overview"],
  },

  // ---------------------------------------------------------
  // RECEIVING
  // ---------------------------------------------------------
  {
    id: "receiving-overview",
    category: "receiving",
    title: "What's the Receiving tab for?",
    keywords: ["receiving", "receive", "inbound", "deliveries", "receipts", "goods in"],
    answer: "Receiving logs everything coming into inventory. The header tiles count total receipts, those from POs, and manual ones. The Quick Receive panel lists open POs you can receive in one click, and the Receipt History table records every receipt — expand a row to see line-level expected-vs-received quantities.",
    related: ["po-receive", "receiving-manual", "receiving-types"],
  },
  {
    id: "receiving-manual",
    category: "receiving",
    title: "How do I record a receipt without a PO (manual / adjustment)?",
    keywords: ["manual receipt", "no po", "inventory adjustment", "found goods", "return from production", "count correction", "manual receive"],
    answer: "Use the Manual Receipt button on the Receiving tab. This covers vendor deliveries with no PO, inventory adjustments, returns from production, and found/count corrections. Pick the right type so the audit trail is clear, then enter the items and quantities.",
    related: ["receiving-overview", "receiving-types"],
  },
  {
    id: "receiving-types",
    category: "receiving",
    title: "What do the receipt types mean?",
    keywords: ["receipt types", "po receipt", "vendor delivery", "inventory adjustment type", "return from production", "found correction"],
    answer: "Receipts are tagged by type and color: PO Receipt (blue, received against a purchase order), Vendor delivery / no PO (amber), Inventory adjustment (orange), Return from production (purple), and Found / count correction (gray). The type tells you why stock changed.",
    related: ["receiving-overview", "receiving-manual"],
  },

  // ---------------------------------------------------------
  // PRODUCTION
  // ---------------------------------------------------------
  {
    id: "production-overview",
    category: "production",
    title: "How do production runs work?",
    keywords: ["production", "production runs", "make dumplings", "complete run", "draft run", "manufacturing", "produce"],
    answer: "The Production tab is the log of production runs. A run starts as a Draft (usually created from the Planning tab) and becomes Complete once you record it. The header tiles count total, draft, and complete runs. Filter by All / Draft / Complete, and expand any run to see the materials it consumed.",
    related: ["production-complete", "planning-overview", "production-lot"],
  },
  {
    id: "production-complete",
    category: "production",
    title: "How do I complete a production run?",
    keywords: ["complete run", "finish production", "mark complete", "record production", "consumed materials", "finalize run"],
    answer: "On a Draft run, click the green Complete button. The modal lets you set the actual quantity produced, the date, and the lot number, and record the materials consumed. Completing the run adds the finished goods to inventory (with their lot) and deducts the consumed ingredients.",
    related: ["production-overview", "production-lot", "production-edit"],
  },
  {
    id: "production-edit",
    category: "production",
    title: "Can I edit or delete a production run?",
    keywords: ["edit run", "delete run", "change production", "fix run", "remove draft"],
    answer: "Draft runs can be edited (blue pencil) or deleted (red trash) freely. Completed runs are part of the inventory record, so they aren't edited the same way — the main fix available is renaming the lot number (admin-only). If a completed run is genuinely wrong, handle the stock side with an inventory adjustment on Receiving.",
    related: ["production-overview", "production-lot", "receiving-manual"],
  },
  {
    id: "production-lot",
    category: "production",
    title: "How are lot numbers assigned in production?",
    keywords: ["lot number production", "rename lot", "fix lot", "lot assignment", "lot numbering", "change lot"],
    answer: (ctx) =>
      "When you complete a run, it gets a lot number (auto-generated from the lot-numbering scheme set up in Admin, or one you enter). The lot follows the finished goods through inventory and shipments. " +
      (ctx.isAdmin
        ? "If you need to correct a completed run's lot, use the purple Lot # button on that run — it updates the inventory lots and any order allocations to match."
        : "Correcting a completed run's lot number is an admin action."),
    related: ["production-complete", "lot-what", "lottracking-overview"],
  },

  // ---------------------------------------------------------
  // PLANNING
  // ---------------------------------------------------------
  {
    id: "planning-overview",
    category: "planning",
    title: "What is the Planning tab?",
    keywords: ["planning", "schedule production", "weekly plan", "production schedule", "plan the week", "day grid"],
    answer: "Planning is where you schedule production for the week. A day grid (Mon–Fri by default) lets you add SKUs and quantities to each day. The Suggested vs Planned panel compares what you've scheduled against forecast suggestions per flavor, and a runway alert warns when a flavor has less than ~3 weeks of stock left.",
    related: ["planning-submit", "planning-suggested", "mrp-source"],
  },
  {
    id: "planning-submit",
    category: "planning",
    title: "How do I submit a production plan?",
    keywords: ["submit plan", "submit production", "create draft runs", "schedule runs", "submit week"],
    answer: "Add rows to the days you want (pick a SKU in the autocomplete and enter a quantity), then click Submit Plan for Week at the bottom. After you confirm, each row becomes a Draft production run on the Production tab, ready to be completed when you actually make it.",
    related: ["planning-overview", "production-complete"],
  },
  {
    id: "planning-suggested",
    category: "planning",
    title: "What is \"Suggested vs Planned\" and the runway alert?",
    keywords: ["suggested vs planned", "forecast", "runway", "weeks of stock", "runway alert", "suggested quantity"],
    answer: "Suggested vs Planned shows, per flavor, how much the forecast suggests making this week versus how much you've actually scheduled (green = you've met it, amber = under). The runway alert flags flavors with low weeks-of-stock remaining — red for under ~1 week, amber for under ~3 — so you don't run out.",
    related: ["planning-overview", "planning-submit"],
  },

  // ---------------------------------------------------------
  // PERFORMANCE
  // ---------------------------------------------------------
  {
    id: "performance-overview",
    category: "performance",
    title: "What's on the Performance tab?",
    keywords: ["performance", "kpi", "productivity", "dumplings per hour", "trends", "sales trends", "metrics", "labor efficiency"],
    answer: "Performance shows 13-week rolling trends. The top tiles track Dumplings/hr (Manufacturing), Dumplings/hr (All-In, including packing/delivery), and total 13-week production. Below are a sales-trend chart by flavor, a flavor comparison of recent vs prior 4 weeks, and a weekly productivity table (dumplings, revenue, hours, and rates).",
    related: ["performance-rate", "dashboard-overview"],
  },
  {
    id: "performance-rate",
    category: "performance",
    title: "What does \"dumplings per hour\" mean?",
    keywords: ["dumplings per hour", "rate", "mfg rate", "all-in rate", "labor", "efficiency metric"],
    answer: "It's a labor-efficiency measure: dumplings produced divided by hours worked. The Manufacturing rate uses only manufacturing hours; the All-In rate also includes packing and delivery hours, so it's lower. Labor hours come from your Toast job mapping configured in Admin.",
    related: ["performance-overview", "admin-overview"],
  },

  // ---------------------------------------------------------
  // LOT TRACKING
  // ---------------------------------------------------------
  {
    id: "lottracking-overview",
    category: "lottracking",
    title: "How do I trace a lot (recall lookup)?",
    keywords: ["lot tracking", "trace lot", "recall", "lot history", "lot lookup", "where did lot go", "audit lot", "find lot"],
    answer: "The Lot Tracking tab is your recall and audit tool. Search by lot number or SKU (e.g. 60003, or 300-CB Bin) and you'll get a card per matching lot showing how much was produced, consumed, shipped, and remaining — plus a full movement history (date, action, quantity, and the run or order it ties to). This works for historical lots too, even at zero quantity.",
    related: ["lot-what", "orders-fulfill", "log-overview"],
  },

  // ---------------------------------------------------------
  // TRANSACTION LOG
  // ---------------------------------------------------------
  {
    id: "log-overview",
    category: "log",
    title: "What is the Transaction Log?",
    keywords: ["transaction log", "log", "audit trail", "history", "movements", "what changed", "export transactions"],
    answer: "The Transaction Log is the complete audit trail of every inventory movement — production, receipts, shipments, and adjustments. The header tiles count each type. Search across all fields, expand a row to see line-level before/after quantities per lot, and use the From/To date filters with Export CSV to pull a movement report for any date range.",
    related: ["log-export", "lottracking-overview"],
  },
  {
    id: "log-export",
    category: "log",
    title: "How do I export transactions to CSV?",
    keywords: ["export csv log", "download transactions", "export log", "date range export", "report"],
    answer: "At the top of the Transaction Log, set the From and To dates to bound the range (the count updates to show how many transactions fall in it), then click Export CSV. Use Clear to reset the range. The export includes line-item detail rows.",
    related: ["log-overview", "csv-export"],
  },

  // ---------------------------------------------------------
  // ADMIN
  // ---------------------------------------------------------
  {
    id: "admin-overview",
    category: "admin",
    title: "What's in Admin Config?",
    keywords: ["admin", "admin config", "settings", "configuration", "users", "pricing", "locations", "lot numbering", "backup"],
    answer: (ctx) =>
      (ctx.isAdmin
        ? "Admin Config (sidebar, left column) is where you configure the system: App Name, Users & roles, Locations, SKU Levels, Order Types, Pricing Matrix, Order/PO/Receipt Statuses, Costing Methods, Planning (MRP demand levels & work days), Lot Numbering, Toast Labor Mapping, Wishes, and Backup & Restore."
        : "Admin Config is only available to admins. It controls system-wide settings like users, pricing, locations, lot numbering, and backups. If you need a setting changed, ask an admin."),
    related: ["admin-users", "admin-pricing", "admin-backup", "admin-only"],
  },
  {
    id: "admin-users",
    category: "admin",
    title: "How do I manage users and the invite code?",
    keywords: ["users", "manage users", "invite code", "add user", "roles", "make admin", "team members", "permissions"],
    answer: (ctx) =>
      ctx.isAdmin
        ? "In Admin Config → Users: set the Invite Code that new people use to sign up, and manage the Team Members table — edit a person's name and role (User or Admin) inline, or remove them. New signups join as regular users until you promote them."
        : "Managing users and invite codes is admin-only. Ask an admin to add someone or change a role.",
    related: ["admin-overview", "admin-only"],
  },
  {
    id: "admin-pricing",
    category: "admin",
    title: "How do I set pricing?",
    keywords: ["pricing", "prices", "pricing matrix", "unit price", "set price", "cost by order type"],
    answer: (ctx) =>
      ctx.isAdmin
        ? "In Admin Config → Pricing Matrix you get a grid of SKU × Order Type. Type a unit price into any cell and it auto-saves when you click away. This is what drives the revenue estimates on orders and the dashboard."
        : "Pricing is configured by admins in the Admin Config → Pricing Matrix.",
    related: ["admin-overview", "orders-overview"],
  },
  {
    id: "admin-backup",
    category: "admin",
    title: "How do I back up or restore the data?",
    keywords: ["backup", "restore", "download backup", "export database", "data safety", "snapshot"],
    answer: (ctx) =>
      ctx.isAdmin
        ? "In Admin Config → Backup & Restore: Download Full Backup saves a JSON snapshot of every table. Restore from backup uploads a snapshot and replaces the database — so use restore with great care, ideally after taking a fresh backup first."
        : "Backups and restores are admin-only, found in Admin Config → Backup & Restore.",
    related: ["admin-overview", "admin-only"],
  },

  // ---------------------------------------------------------
  // GENERAL / CONCEPTS
  // ---------------------------------------------------------
  {
    id: "levels",
    category: "general",
    title: "What do the inventory levels (100–500) mean?",
    keywords: ["levels", "100 200 250 300 400 500", "hierarchy", "level meaning", "what is a level", "sku level", "raw sub recipe batch bulk retail case"],
    answer: "Items are organized into six hierarchy levels, from raw ingredient to finished case:",
    steps: [
      "100 — Raw Materials (flour, spices, packaging).",
      "200 — Sub-Recipes (e.g. CB Dough, CB Fill).",
      "250 — Batches / WIP (e.g. a CB Batch of 432 pieces).",
      "300 — Bulk Storage (e.g. CB Bin).",
      "400 — Retail Units (e.g. a 14oz pack, a catering tray).",
      "500 — Retail Cases (e.g. a case of 12 packs).",
    ],
    related: ["bom-what", "product-lines", "inventory-filter"],
  },
  {
    id: "product-lines",
    category: "general",
    title: "What are the product lines / flavor codes?",
    keywords: ["product lines", "flavors", "cb ch gc lg tm", "flavor codes", "what is cb", "cheeseburger"],
    answer: "There are five product lines, abbreviated by a two-letter code: CB (Cheeseburger), CH (Cheddar Potato), GC (Ginger Chicken), LG (Lemongrass Pork), and TM (Tofu Mushroom). You'll see these codes throughout item names, the dashboard, and planning.",
    related: ["levels"],
  },
  {
    id: "bom-what",
    category: "general",
    title: "What is a Bill of Materials (BOM)?",
    keywords: ["bom", "bill of materials", "recipe", "ingredients", "what goes into", "components", "assembly"],
    answer: "A bill of materials is an item's recipe — the list of components and how much of each it takes to make one unit. BOMs can be multi-level (a case contains packs, a pack contains dumplings from a batch, a batch contains dough and fill, and so on). The app uses BOMs to roll up costs and to explode demand into raw-material needs in Purchase Needs.",
    related: ["bom-edit", "levels", "mrp-overview"],
  },
  {
    id: "bom-edit",
    category: "general",
    title: "How do I edit a recipe (BOM)?",
    keywords: ["edit bom", "edit recipe", "change ingredients", "set recipe", "add ingredient"],
    answer: "Open the item on the Item Master tab (blue pencil) — the edit form includes its bill of materials, where you add components and set the quantity of each. To just view a recipe without editing, expand the item's row with the chevron.",
    related: ["bom-what", "items-add"],
  },
  {
    id: "lot-what",
    category: "general",
    title: "What is a lot / lot number?",
    keywords: ["lot", "lot number", "what is a lot", "batch number", "traceability", "lot tracking concept"],
    answer: "A lot is a tracked batch of product, identified by a lot number assigned when it's produced or received. Lots let you trace exactly which batch went into which shipment — essential for recalls and quality control. Lot-tracked items show their lots when you expand them in Inventory, and you can follow a lot's full history on the Lot Tracking tab.",
    related: ["lottracking-overview", "production-lot", "inventory-expand"],
  },
  {
    id: "search",
    category: "general",
    title: "How does the search bar work?",
    keywords: ["search", "search bar", "find", "filter results", "how to search"],
    answer: "Most tabs have a search bar at the top that filters the rows on that tab as you type. It matches the relevant fields for that area — for example item code and name on Inventory, customer/item/notes on Orders, or lot number on Production and Lot Tracking. Searching never changes data; it only narrows what's shown.",
    related: ["inventory-filter", "navigation"],
  },
  {
    id: "csv-export",
    category: "general",
    title: "How do I export data to CSV?",
    keywords: ["csv", "export", "download", "spreadsheet", "export inventory", "excel", "lot", "lot number", "lot column", "per lot", "lot rows"],
    answer: "Two places export CSV: the Inventory tab's Export button and the Transaction Log's date-range export. The Inventory Export button opens a small menu with two choices — 'By SKU' gives one row per item (the plain list: codes, names, costs, quantities), and 'By SKU + Lot #' breaks lot-tracked items out to one row per lot, adding LotNumber, LotQty, ProductionDate, and LotLocation columns (items with no lots still export as a single row, and each SKU's LotQty values sum to its Qty). The Transaction Log exports inventory movements for a chosen date range. Files download straight to your computer.",
    related: ["log-export", "inventory-overview"],
  },
  {
    id: "revenue",
    category: "general",
    title: "Where do I see sales / revenue?",
    keywords: ["revenue", "sales", "money", "income", "how much did i sell", "sales last week", "total revenue", "earnings", "dollars", "sales figures", "weekly revenue"],
    answer: "I can point you to where revenue lives, but I can't pull the figure itself — open one of these to read the actual number. Revenue is calculated as fulfilled order quantity × unit price, so prices must be set in the Admin Pricing Matrix for it to show. The three places to look:",
    steps: [
      "Performance tab — the weekly productivity table has a Revenue column showing revenue from orders fulfilled each week over the last 13 weeks. This is the best place to see a specific week like last week.",
      "Dashboard — the Weekly Outgoing Orders section shows estimated revenue for orders shipping the current week.",
      "Orders tab — the header tiles show Total Revenue across your orders.",
    ],
    related: ["performance-overview", "dashboard-overview", "admin-pricing"],
  },
  {
    id: "colors-general",
    category: "general",
    title: "What do the colors mean across the app?",
    keywords: ["colors", "color meaning", "red green amber blue purple", "what does red mean", "badges", "color code"],
    answer: "Colors are consistent everywhere:",
    steps: [
      "Red — urgent or negative (below minimum, shortfall, deletions, outgoing quantities).",
      "Amber — a warning or something needing attention (drafts, partial fulfillment, purchase needed).",
      "Green — positive or complete (in stock, fulfilled, received, revenue).",
      "Blue — informational or links (sent POs, pending receipt).",
      "Purple — special items like lot numbers and admin/production references.",
    ],
    related: ["inventory-lowstock", "mrp-colors"],
  },
  {
    id: "admin-only",
    category: "general",
    title: "Why can't I see / do something (admin-only actions)?",
    keywords: ["can't see", "missing button", "permission", "admin only", "not allowed", "greyed out", "no access", "why can't i"],
    answer: (ctx) =>
      (ctx.isAdmin
        ? "You're an admin, so you have full access. A few actions are still guarded for data safety (like the locked status on a Received PO) — those are intentional, not permission issues."
        : "Some actions are limited to admins: adjusting inventory quantities, deleting items/orders/POs, renaming completed lot numbers, managing users, and everything in Admin Config. If you need one of these done, ask an admin on your team.") +
      "",
    related: ["admin-overview", "admin-users"],
  },
  {
    id: "password",
    category: "general",
    title: "How do I change my password?",
    keywords: ["password", "change password", "reset password", "account", "login", "security"],
    answer: "Use the Change Password option from your account menu (your name/email area). Enter a new password (at least 6 characters) and confirm it.",
    related: [],
  },
  {
    id: "wishes",
    category: "general",
    title: "How do I request a new feature (wishes)?",
    keywords: ["wish", "feature request", "suggestion", "request feature", "grant my wish", "idea", "want a feature"],
    answer: "Use the wish feature (the Grant My Wish / Sparkles option) to describe a capability you'd love to see. You have a limited number of wishes; an admin reviews and grants them. This is the right place for bigger ideas — things beyond what the app does today.",
    related: ["admin-overview"],
  },
];
