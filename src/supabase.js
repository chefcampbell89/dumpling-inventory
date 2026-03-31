// SUPABASE VERSION: v101
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// -- ITEMS --

export async function fetchItems() {
  const { data, error } = await supabase.from("items").select("*").order("id")
  if (error) throw error
  return data.map(row => ({
    id: row.id, name: row.name, category: row.category, type: row.type,
    costing: row.costing, location: row.location, supplier: row.supplier,
    supplierCode: row.supplier_code, avgCost: Number(row.avg_cost),
    unit: row.unit, minStock: Number(row.min_stock), qty: Number(row.qty),
    notes: row.notes, status: row.status, lotTracking: !!row.lot_tracking,
    piecesPerUnit: Number(row.pieces_per_unit) || 0,
  }))
}

export async function upsertItem(item) {
  const { error } = await supabase.from("items").upsert({
    id: item.id, name: item.name, category: item.category, type: item.type,
    costing: item.costing, location: item.location, supplier: item.supplier,
    supplier_code: item.supplierCode, avg_cost: item.avgCost,
    unit: item.unit, min_stock: item.minStock, qty: item.qty,
    notes: item.notes, status: item.status || "Active",
    lot_tracking: item.lotTracking || false,
    pieces_per_unit: item.piecesPerUnit || 0,
  })
  if (error) throw error
}

export async function deleteItem(id) {
  const { error } = await supabase.from("items").delete().eq("id", id)
  if (error) throw error
}

// -- BOM LINES --

export async function fetchBomLines() {
  const { data, error } = await supabase.from("bom_lines").select("*")
  if (error) throw error
  return data.map(r => ({ id: r.id, assemblyId: r.assembly_id, partId: r.component_id, qty: Number(r.qty) }))
}

export async function setBomForAssembly(assemblyId, lines) {
  await supabase.from("bom_lines").delete().eq("assembly_id", assemblyId)
  if (lines.length > 0) {
    const { error } = await supabase.from("bom_lines").insert(
      lines.map(l => ({ assembly_id: assemblyId, component_id: l.partId, qty: l.qty }))
    )
    if (error) throw error
  }
}

// -- VENDORS --

export async function fetchVendors() {
  const { data, error } = await supabase.from("vendors").select("*").order("name")
  if (error) throw error
  return data.map(r => ({
    id: r.id, name: r.name, contact: r.contact, email: r.email,
    phone: r.phone, address: r.address, paymentTerms: r.payment_terms,
    leadDays: r.lead_days, notes: r.notes,
  }))
}

export async function upsertVendor(v) {
  const { error } = await supabase.from("vendors").upsert({
    id: v.id, name: v.name, contact: v.contact, email: v.email,
    phone: v.phone, address: v.address, payment_terms: v.paymentTerms,
    lead_days: v.leadDays, notes: v.notes,
  })
  if (error) throw error
}

export async function deleteVendor(id) {
  const { error } = await supabase.from("vendors").delete().eq("id", id)
  if (error) throw error
}

// -- ORDERS --

export async function fetchOrders() {
  const { data, error } = await supabase.from("orders").select("*").order("order_date", { ascending: false })
  if (error) throw error
  return data.map(r => ({
    id: r.id, customer: r.customer, item: r.item_id, qty: Number(r.qty),
    date: r.order_date, status: r.status, notes: r.notes, shipDate: r.ship_date || null,
  }))
}

export async function upsertOrder(o) {
  const { error } = await supabase.from("orders").upsert({
    id: o.id, customer: o.customer, item_id: o.item, qty: o.qty,
    order_date: o.date, status: o.status, notes: o.notes, ship_date: o.shipDate || null,
  })
  if (error) throw error
}

export async function deleteOrder(id) {
  const { error } = await supabase.from("orders").delete().eq("id", id)
  if (error) throw error
}

// -- PURCHASE ORDERS --

export async function fetchPurchaseOrders() {
  const { data: poData, error: poErr } = await supabase.from("purchase_orders").select("*").order("po_date", { ascending: false })
  if (poErr) throw poErr
  const { data: lineData, error: lineErr } = await supabase.from("po_lines").select("*")
  if (lineErr) throw lineErr
  return poData.map(po => ({
    id: po.id, vendor: po.vendor_name, vendorId: po.vendor_id,
    date: po.po_date, status: po.status, total: Number(po.total),
    paymentTerms: po.payment_terms, leadDays: po.lead_days, notes: po.notes,
    lines: lineData.filter(l => l.po_id === po.id).map(l => ({
      partId: l.part_id, name: l.name, qty: Number(l.qty),
      unit: l.unit, unitCost: Number(l.unit_cost), total: Number(l.total),
    })),
  }))
}

export async function createPurchaseOrder(po) {
  const { error: poErr } = await supabase.from("purchase_orders").insert({
    id: po.id, vendor_id: po.vendorId, vendor_name: po.vendor,
    po_date: po.date, status: po.status, total: po.total,
    payment_terms: po.paymentTerms, lead_days: po.leadDays, notes: po.notes,
  })
  if (poErr) throw poErr
  if (po.lines.length > 0) {
    const { error: lineErr } = await supabase.from("po_lines").insert(
      po.lines.map(l => ({
        po_id: po.id, part_id: l.partId, name: l.name,
        qty: l.qty, unit: l.unit, unit_cost: l.unitCost, total: l.total,
      }))
    )
    if (lineErr) throw lineErr
  }
}

export async function updatePOStatus(id, status) {
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", id)
  if (error) throw error
}

export async function deletePO(id) {
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id)
  if (error) throw error
}

// -- BULK IMPORT --

export async function bulkInsertItems(items) {
  const rows = items.map(item => ({
    id: item.id, name: item.name, category: item.category, type: item.type,
    costing: item.costing, location: item.location, supplier: item.supplier,
    supplier_code: item.supplierCode, avg_cost: item.avgCost,
    unit: item.unit, min_stock: item.minStock, qty: item.qty,
    notes: item.notes, status: item.status || "Active",
    lot_tracking: item.lotTracking || false,
    pieces_per_unit: item.piecesPerUnit || 0,
  }))
  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from("items").upsert(batch)
    if (error) throw error
  }
}

// -- RECEIPTS --

export async function fetchReceipts() {
  const { data: rcpts, error: rErr } = await supabase.from("receipts").select("*").order("created_at", { ascending: false })
  if (rErr) throw rErr
  const { data: lines, error: lErr } = await supabase.from("receipt_lines").select("*")
  if (lErr) throw lErr
  return rcpts.map(r => ({
    id: r.id, poId: r.po_id, type: r.receipt_type, date: r.receipt_date,
    notes: r.notes, createdBy: r.created_by, createdAt: r.created_at,
    lines: lines.filter(l => l.receipt_id === r.id).map(l => ({
      partId: l.part_id, name: l.part_name, qtyExpected: Number(l.qty_expected),
      qtyReceived: Number(l.qty_received), unit: l.unit,
    })),
  }))
}

export async function createReceipt(receipt) {
  const { error: rErr } = await supabase.from("receipts").insert({
    id: receipt.id, po_id: receipt.poId || null, receipt_type: receipt.type,
    receipt_date: receipt.date, notes: receipt.notes, created_by: receipt.createdBy || "",
  })
  if (rErr) throw rErr
  if (receipt.lines.length > 0) {
    const { error: lErr } = await supabase.from("receipt_lines").insert(
      receipt.lines.map(l => ({
        receipt_id: receipt.id, part_id: l.partId, part_name: l.name,
        qty_expected: l.qtyExpected, qty_received: l.qtyReceived, unit: l.unit,
      }))
    )
    if (lErr) throw lErr
  }
}

export async function updateItemQty(id, newQty) {
  const { error } = await supabase.from("items").update({ qty: newQty }).eq("id", id)
  if (error) throw error
}

// -- PRODUCTION RUNS --

export async function fetchProductionRuns() {
  const { data: runs, error: rErr } = await supabase.from("production_runs").select("*").order("created_at", { ascending: false })
  if (rErr) throw rErr
  const { data: consumed, error: cErr } = await supabase.from("production_consumed").select("*")
  if (cErr) throw cErr
  return runs.map(r => ({
    id: r.id, assemblyId: r.assembly_id, assemblyName: r.assembly_name,
    qtyProduced: Number(r.qty_produced), date: r.run_date, notes: r.notes,
    createdBy: r.created_by, createdAt: r.created_at, lotNumber: r.lot_number || "",
    status: r.status || "Complete", plannedDate: r.planned_date || null,
    sourcePlanWeek: r.source_plan_week || null,
    consumed: consumed.filter(c => c.run_id === r.id).map(c => ({
      partId: c.part_id, name: c.part_name, qty: Number(c.qty_consumed), unit: c.unit,
    })),
  }))
}

export async function createProductionRun(run) {
  const { error: rErr } = await supabase.from("production_runs").insert({
    id: run.id, assembly_id: run.assemblyId, assembly_name: run.assemblyName,
    qty_produced: run.qtyProduced, run_date: run.date, notes: run.notes,
    created_by: run.createdBy || "", lot_number: run.lotNumber || "",
    status: run.status || "Complete", planned_date: run.plannedDate || null,
    source_plan_week: run.sourcePlanWeek || null,
  })
  if (rErr) throw rErr
  if (run.consumed && run.consumed.length > 0) {
    const { error: cErr } = await supabase.from("production_consumed").insert(
      run.consumed.map(c => ({
        run_id: run.id, part_id: c.partId, part_name: c.name,
        qty_consumed: c.qty, unit: c.unit,
      }))
    )
    if (cErr) throw cErr
  }
}

export async function updateProductionRun(runId, updates) {
  const row = {}
  if (updates.qtyProduced !== undefined) row.qty_produced = updates.qtyProduced
  if (updates.date !== undefined) row.run_date = updates.date
  if (updates.lotNumber !== undefined) row.lot_number = updates.lotNumber
  if (updates.status !== undefined) row.status = updates.status
  if (updates.plannedDate !== undefined) row.planned_date = updates.plannedDate
  if (updates.notes !== undefined) row.notes = updates.notes
  if (updates.assemblyId !== undefined) row.assembly_id = updates.assemblyId
  if (updates.assemblyName !== undefined) row.assembly_name = updates.assemblyName
  const { error } = await supabase.from("production_runs").update(row).eq("id", runId)
  if (error) throw error
}

export async function deleteProductionRuns(runIds) {
  const { error: cErr } = await supabase.from("production_consumed").delete().in("run_id", runIds)
  if (cErr) throw cErr
  const { error } = await supabase.from("production_runs").delete().in("id", runIds)
  if (error) throw error
}

export async function fetchDraftRunsForWeek(weekStart) {
  const { data, error } = await supabase.from("production_runs")
    .select("*").eq("source_plan_week", weekStart).eq("status", "Draft")
    .order("planned_date")
  if (error) throw error
  return data.map(r => ({
    id: r.id, assemblyId: r.assembly_id, assemblyName: r.assembly_name,
    qtyProduced: Number(r.qty_produced), date: r.run_date, notes: r.notes,
    createdBy: r.created_by, createdAt: r.created_at, lotNumber: r.lot_number || "",
    status: r.status, plannedDate: r.planned_date, sourcePlanWeek: r.source_plan_week,
    consumed: [],
  }))
}

export async function completeProductionRun(runId, consumed) {
  const { error: sErr } = await supabase.from("production_runs")
    .update({ status: "Complete" }).eq("id", runId)
  if (sErr) throw sErr
  if (consumed.length > 0) {
    const { error: cErr } = await supabase.from("production_consumed").insert(
      consumed.map(c => ({
        run_id: runId, part_id: c.partId, part_name: c.name,
        qty_consumed: c.qty, unit: c.unit,
      }))
    )
    if (cErr) throw cErr
  }
}

// -- INVENTORY QTY BULK UPDATES --

export async function zeroAllInventory() {
  // Delete all inventory lots
  const { error: lotErr } = await supabase.from("inventory_lots").delete().not("id", "is", null)
  if (lotErr) throw lotErr
  // Set all item qtys to 0
  const { error } = await supabase.from("items").update({ qty: 0 }).not("id", "is", null)
  if (error) throw error
}

export async function bulkUpdateItemQtys(lotRows, skuIds) {
  // lotRows = [{itemId, lotNumber, qty, location}, ...]
  // skuIds = [string, ...]  (all unique SKU IDs being touched)
  const batchSize = 50

  // 0. Aggregate duplicate rows (same itemId+lotNumber+location → sum qty)
  const aggKey = (r) => `${r.itemId}|||${r.lotNumber}|||${r.location || ""}`
  const aggMap = {}
  for (const r of lotRows) {
    const k = aggKey(r)
    if (aggMap[k]) { aggMap[k].qty += r.qty }
    else { aggMap[k] = { ...r } }
  }
  const aggregated = Object.values(aggMap)

  // 1. Delete existing lots for all affected SKUs
  for (let i = 0; i < skuIds.length; i += batchSize) {
    const batch = skuIds.slice(i, i + batchSize)
    await Promise.all(batch.map(id =>
      supabase.from("inventory_lots").delete().eq("item_id", id)
    ))
  }

  // 2. Insert new lot rows (one per unique SKU+batch+location)
  const insertRows = aggregated.filter(r => r.qty > 0).map(r => ({
    item_id: r.itemId, lot_number: r.lotNumber, qty: r.qty,
    production_date: new Date().toISOString().slice(0, 10),
    location: r.location || "",
  }))
  if (insertRows.length > 0) {
    for (let i = 0; i < insertRows.length; i += 500) {
      const batch = insertRows.slice(i, i + 500)
      const { error } = await supabase.from("inventory_lots").insert(batch)
      if (error) throw error
    }
  }

  // 3. Update item-level qty (sum of all lots per SKU)
  const qtyBySku = {}
  for (const id of skuIds) qtyBySku[id] = 0
  for (const r of aggregated) qtyBySku[r.itemId] = (qtyBySku[r.itemId] || 0) + r.qty
  const qtyUpdates = Object.entries(qtyBySku).map(([id, qty]) => ({ id, qty }))
  for (let i = 0; i < qtyUpdates.length; i += batchSize) {
    const batch = qtyUpdates.slice(i, i + batchSize)
    await Promise.all(batch.map(u =>
      supabase.from("items").update({ qty: u.qty }).eq("id", u.id)
    ))
  }

  // 4. Update item-level location (single location or "Multiple")
  const locsBySku = {}
  for (const r of aggregated) {
    if (!r.location) continue
    if (!locsBySku[r.itemId]) locsBySku[r.itemId] = new Set()
    locsBySku[r.itemId].add(r.location)
  }
  const locUpdates = Object.entries(locsBySku).map(([id, locs]) => ({
    id, location: locs.size === 1 ? [...locs][0] : "Multiple",
  }))
  for (let i = 0; i < locUpdates.length; i += batchSize) {
    const batch = locUpdates.slice(i, i + batchSize)
    await Promise.all(batch.map(u =>
      supabase.from("items").update({ location: u.location }).eq("id", u.id)
    ))
  }
}

// -- AUTH --

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()
  if (error) throw error
  return { id: data.id, email: data.email, name: data.name, role: data.role }
}

export async function updateProfile(userId, updates) {
  const { error } = await supabase.from("profiles").update(updates).eq("id", userId)
  if (error) throw error
}

export async function fetchProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at")
  if (error) throw error
  return data.map(r => ({ id: r.id, email: r.email, name: r.name, role: r.role, createdAt: r.created_at }))
}

export async function deleteProfile(userId) {
  const { error } = await supabase.from("profiles").delete().eq("id", userId)
  if (error) throw error
}

// ---- Forecast / Planning ----

export async function fetchForecastWeeks(startDate, endDate) {
  const { data, error } = await supabase.from("forecast_weeks").select("*")
    .gte("week_start", startDate).lte("week_start", endDate).order("week_start")
  if (error) throw error
  return data.map(r => ({
    id: r.id, weekStart: r.week_start, productLine: r.product_line, itemId: r.item_id,
    forecastQty: Number(r.forecast_qty), autoQty: Number(r.auto_qty),
    notes: r.notes || "", createdBy: r.created_by || "", updatedAt: r.updated_at,
  }))
}

export async function upsertForecastWeek(fw) {
  const { data, error } = await supabase.from("forecast_weeks").upsert({
    ...(fw.id ? { id: fw.id } : {}), week_start: fw.weekStart, product_line: fw.productLine,
    item_id: fw.itemId, forecast_qty: fw.forecastQty, auto_qty: fw.autoQty,
    notes: fw.notes || "", created_by: fw.createdBy || "", updated_at: new Date().toISOString(),
  }, { onConflict: "week_start,product_line" }).select()
  if (error) throw error
  return data?.[0]
}

export async function fetchForecastDays(startDate, endDate) {
  const { data, error } = await supabase.from("forecast_days").select("*")
    .gte("day_date", startDate).lte("day_date", endDate).order("day_date")
  if (error) throw error
  return data.map(r => ({
    id: r.id, forecastWeekId: r.forecast_week_id, dayDate: r.day_date,
    productLine: r.product_line, plannedQty: Number(r.planned_qty),
    actualQty: r.actual_qty !== null ? Number(r.actual_qty) : null, notes: r.notes || "",
  }))
}

export async function upsertForecastDays(days) {
  const rows = days.map(d => ({
    ...(d.id ? { id: d.id } : {}), forecast_week_id: d.forecastWeekId, day_date: d.dayDate,
    product_line: d.productLine, planned_qty: d.plannedQty,
    actual_qty: d.actualQty, notes: d.notes || "",
  }))
  const { error } = await supabase.from("forecast_days").upsert(rows, { onConflict: "day_date,product_line" })
  if (error) throw error
}

export async function getInviteCode() {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "invite_code").single()
  if (error) throw error
  return data.value
}

export async function setInviteCode(code) {
  const { error } = await supabase.from("app_settings").upsert({ key: "invite_code", value: code })
  if (error) throw error
}

export async function getConfig(key) {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle()
  if (error) throw error
  if (!data || !data.value) return null
  try { return JSON.parse(data.value) } catch { return data.value }
}

export async function saveConfig(key, value) {
  const { error } = await supabase.from("app_settings").upsert({ key, value: JSON.stringify(value) })
  if (error) throw error
}

// Backward compat
export async function getLocations() { return (await getConfig("locations")) || [] }
export async function saveLocations(locs) { return saveConfig("locations", locs) }

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// -- INVENTORY LOTS --

export async function fetchInventoryLots() {
  const { data, error } = await supabase.from("inventory_lots").select("*").order("production_date")
  if (error) throw error
  return data.map(r => ({
    id: r.id, itemId: r.item_id, lotNumber: r.lot_number,
    qty: Number(r.qty), productionDate: r.production_date,
    sourceRunId: r.source_run_id, createdAt: r.created_at,
    location: r.location || "",
  }))
}

export async function adjustLotQty(itemId, lotNumber, delta, productionDate, sourceRunId, location) {
  const { data: existing, error: fetchErr } = await supabase.from("inventory_lots")
    .select("*").eq("item_id", itemId).eq("lot_number", lotNumber).maybeSingle()
  if (fetchErr) throw fetchErr

  if (existing) {
    const newQty = Math.max(0, Number(existing.qty) + delta)
    if (newQty <= 0) {
      const { error } = await supabase.from("inventory_lots").delete().eq("id", existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from("inventory_lots").update({ qty: newQty }).eq("id", existing.id)
      if (error) throw error
    }
  } else if (delta > 0) {
    const { error } = await supabase.from("inventory_lots").insert({
      item_id: itemId, lot_number: lotNumber, qty: delta,
      production_date: productionDate || null, source_run_id: sourceRunId || null,
      location: location || "",
    })
    if (error) throw error
  }
}

// -- WISHES --

export async function fetchWishes() {
  const { data, error } = await supabase.from("wishes").select("*").order("created_at", { ascending: false })
  if (error) throw error
  return data.map(r => ({
    id: r.id, userId: r.user_id, userEmail: r.user_email,
    wish: r.wish_text, createdAt: r.created_at,
  }))
}

export async function createWish(wish) {
  const { error } = await supabase.from("wishes").insert({
    user_id: wish.userId, user_email: wish.userEmail, wish_text: wish.wish,
  })
  if (error) throw error
}

export async function countUserWishes(userId) {
  const { count, error } = await supabase.from("wishes").select("*", { count: "exact", head: true }).eq("user_id", userId)
  if (error) throw error
  return count || 0
}
