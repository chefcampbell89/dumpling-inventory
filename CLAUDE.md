# Dumpling Genie - Inventory Management System

## Project Overview

Full-stack inventory & production management app for a dumpling restaurant/factory. Manages raw materials, recipes, production runs, vendors, purchase orders, receipts, lot-based inventory tracking, and retail distribution.

Source repo: `dumpling-inventory/`

## Tech Stack

- **Frontend:** React 19 + Vite 8 (JSX, no TypeScript)
- **Database/Auth:** Supabase (PostgreSQL)
- **Icons:** Lucide React
- **Styling:** Inline styles (dark theme, no CSS files or UI library)
- **Package type:** ES Module

## Key Files

- `src/App.jsx` — Main component with all UI & state (~3300 lines, v109)
- `src/supabase.js` — Supabase client & all DB API functions (~460 lines, v100)
- `src/main.jsx` — React entry point

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Environment Variables

Required in `.env` or `.env.local` (never commit these):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Conventions

### Naming
- **Database columns:** snake_case (`item_id`, `lot_number`)
- **JavaScript:** camelCase (`itemId`, `lotNumber`)
- **React components:** PascalCase
- **supabase.js** transforms snake_case DB responses to camelCase for JS

### Code Style
- Functional components with hooks (useState, useEffect, useCallback, useMemo)
- All styling is inline via `style` objects (dark theme: `#1e1e2e` bg, `#e0e0e0` text)
- Modal pattern for dialogs
- Toast notifications for user feedback
- No external UI component library — all custom

### Linting
- ESLint 9 with react-hooks and react-refresh plugins
- `no-unused-vars`: error, but ignores vars starting with `[A-Z_]`

## Data Model

### Inventory Hierarchy (6 levels)
| Level | Type | Example |
|-------|------|---------|
| 100 | Raw Materials | Flour, spices, packaging |
| 200 | Sub-Recipes | CB Dough, CB Fill |
| 250 | Batches (WIP) | CB Batch (432 pcs) |
| 300 | Bulk Storage | CB Bin |
| 400 | Retail Units | CB Pack (14oz), CB Catering Tray |
| 500 | Retail Cases | CB Retail Case (12 packs) |

### Product Lines
CB (Cheeseburger), CH (Cheddar Potato), GC (Ginger Chicken), LG (Lemongrass Pork), TM (Tofu Mushroom)

### Database Tables
`items`, `bom_lines`, `vendors`, `orders`, `purchase_orders`, `po_lines`, `receipts`, `receipt_lines`, `production_runs`, `production_consumed`, `inventory_lots`, `profiles`, `app_settings`, `wishes`

## Features
- Inventory CRUD with search, filter, sort, min/max alerts
- Bill of Materials (BOM) with multi-level assemblies
- Production runs with lot tracking and auto-consumption
- Purchase orders with status workflow (Draft → Sent → Confirmed → Received)
- Vendor management
- Receipts & inbound logistics
- Customer orders
- CSV bulk import/export
- Supabase auth with roles (admin/user) and invite codes
- Admin config panel (levels, statuses, locations, costing methods)
- User wishlist for feature requests
