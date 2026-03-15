import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ---- ITEMS ----

export async function fetchItems() {
  const { data, error } = await supabase.from('items').select('*').order('id')
  if (error) throw error
  return data.map(row => ({
    id: row.id, name: row.name, category: row.category, type: row.type,
    costing: row.costing, location: row.location, supplier: row.supplier,
    supplierCode: row.supplier_code, avgCost: Number(row.avg_cost),
    unit: row.unit, minStock: Number(row.min_stock), qty: Number(row.qty),
    notes: row.notes, status: row.status,
  }))
}

export async function upsertItem(item) {
  const { error } = await supabase.from('items').upsert({
    id: item.id, name: item.name, category: item.category, type: item.type,
    costing: item.costing, location: item.location, supplier: item.supplier,
    supplier_code: item.supplierCode, avg_cost: item.avgCost,
    unit: item.unit, min_stock: item.minStock, qty: item.qty,
    notes: item.notes, status: item.status || 'Active',
  })
  if (error) throw error
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id)
  if (error) throw error
}

// ---- BOM LINES ----

export async function fetchBomLines() {
  const { data, error } = await supabase.from('bom_lines').select('*')
  if (error) throw error
  return data.map(r => ({ id: r.id, assemblyId: r.assembly_id, partId: r.component_id, qty: Number(r.qty) }))
}

export async function setBomForAssembly(assemblyId, lines) {
  await supabase.from('bom_lines').delete().eq('assembly_id', assemblyId)
  if (lines.length > 0) {
    const { error } = await supabase.from('bom_lines').insert(
      lines.map(l => ({ assembly_id: assemblyId, component_id: l.partId, qty: l.qty }))
    )
    if (error) throw error
  }
}

// ---- VENDORS ----

export async function fetchVendors() {
  const { data, error } = await supabase.from('vendors').select('*').order('name')
  if (error) throw error
  return data.map(r => ({
    id: r.id, name: r.name, contact: r.contact, email: r.email,
    phone: r.phone, address: r.address, paymentTerms: r.payment_terms,
    leadDays: r.lead_days, notes: r.notes,
  }))
}

export async function upsertVendor(v) {
  const { error } = await supabase.from('vendors').upsert({
    id: v.id, name: v.name, contact: v.contact, email: v.email,
    phone: v.phone, address: v.address, payment_terms: v.paymentTerms,
    lead_days: v.leadDays, notes: v.notes,
  })
  if (error) throw error
}

export async function deleteVendor(id) {
  const { error } = await supabase.from('vendors').delete().eq('id', id)
  if (error) throw error
}

// ---- ORDERS ----

export async function fetchOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('order_date', { ascending: false })
  if (error) throw error
  return data.map(r => ({
    id: r.id, customer: r.customer, item: r.item_id, qty: Number(r.qty),
    date: r.order_date, status: r.status, notes: r.notes,
  }))
}

export async function upsertOrder(o) {
  const { error } = await supabase.from('orders').upsert({
    id: o.id, customer: o.customer, item_id: o.item, qty: o.qty,
    order_date: o.date, status: o.status, notes: o.notes,
  })
  if (error) throw error
}

export async function deleteOrder(id) {
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) throw error
}

// ---- PURCHASE ORDERS ----

export async function fetchPurchaseOrders() {
  const { data: poData, error: poErr } = await supabase.from('purchase_orders').select('*').order('po_date', { ascending: false })
  if (poErr) throw poErr
  const { data: lineData, error: lineErr } = await supabase.from('po_lines').select('*')
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
  const { error: poErr } = await supabase.from('purchase_orders').insert({
    id: po.id, vendor_id: po.vendorId, vendor_name: po.vendor,
    po_date: po.date, status: po.status, total: po.total,
    payment_terms: po.paymentTerms, lead_days: po.leadDays, notes: po.notes,
  })
  if (poErr) throw poErr
  if (po.lines.length > 0) {
    const { error: lineErr } = await supabase.from('po_lines').insert(
      po.lines.map(l => ({
        po_id: po.id, part_id: l.partId, name: l.name,
        qty: l.qty, unit: l.unit, unit_cost: l.unitCost, total: l.total,
      }))
    )
    if (lineErr) throw lineErr
  }
}

export async function updatePOStatus(id, status) {
  const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deletePO(id) {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
  if (error) throw error
}

// ---- BULK IMPORT ----

export async function bulkInsertItems(items) {
  const rows = items.map(item => ({
    id: item.id, name: item.name, category: item.category, type: item.type,
    costing: item.costing, location: item.location, supplier: item.supplier,
    supplier_code: item.supplierCode, avg_cost: item.avgCost,
    unit: item.unit, min_stock: item.minStock, qty: item.qty,
    notes: item.notes, status: item.status || 'Active',
  }))
  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from('items').upsert(batch)
    if (error) throw error
  }
}

// ---- RECEIPTS ----

export async function fetchReceipts() {
  const { data: rcpts, error: rErr } = await supabase.from('receipts').select('*').order('created_at', { ascending: false })
  if (rErr) throw rErr
  const { data: lines, error: lErr } = await supabase.from('receipt_lines').select('*')
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
  const { error: rErr } = await supabase.from('receipts').insert({
    id: receipt.id, po_id: receipt.poId || null, receipt_type: receipt.type,
    receipt_date: receipt.date, notes: receipt.notes, created_by: receipt.createdBy || '',
  })
  if (rErr) throw rErr
  if (receipt.lines.length > 0) {
    const { error: lErr } = await supabase.from('receipt_lines').insert(
      receipt.lines.map(l => ({
        receipt_id: receipt.id, part_id: l.partId, part_name: l.name,
        qty_expected: l.qtyExpected, qty_received: l.qtyReceived, unit: l.unit,
      }))
    )
    if (lErr) throw lErr
  }
}

export async function updateItemQty(id, newQty) {
  const { error } = await supabase.from('items').update({ qty: newQty }).eq('id', id)
  if (error) throw error
}

// ---- PRODUCTION RUNS ----

export async function fetchProductionRuns() {
  const { data: runs, error: rErr } = await supabase.from('production_runs').select('*').order('created_at', { ascending: false })
  if (rErr) throw rErr
  const { data: consumed, error: cErr } = await supabase.from('production_consumed').select('*')
  if (cErr) throw cErr
  return runs.map(r => ({
    id: r.id, assemblyId: r.assembly_id, assemblyName: r.assembly_name,
    qtyProduced: Number(r.qty_produced), date: r.run_date, notes: r.notes,
    createdBy: r.created_by, createdAt: r.created_at,
    consumed: consumed.filter(c => c.run_id === r.id).map(c => ({
      partId: c.part_id, name: c.part_name, qty: Number(c.qty_consumed), unit: c.unit,
    })),
  }))
}

export async function createProductionRun(run) {
  const { error: rErr } = await supabase.from('production_runs').insert({
    id: run.id, assembly_id: run.assemblyId, assembly_name: run.assemblyName,
    qty_produced: run.qtyProduced, run_date: run.date, notes: run.notes,
    created_by: run.createdBy || '',
  })
  if (rErr) throw rErr
  if (run.consumed.length > 0) {
    const { error: cErr } = await supabase.from('production_consumed').insert(
      run.consumed.map(c => ({
        run_id: run.id, part_id: c.partId, part_name: c.name,
        qty_consumed: c.qty, unit: c.unit,
      }))
    )
    if (cErr) throw cErr
  }
}

// ---- AUTH ----

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
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw error
  return { id: data.id, email: data.email, name: data.name, role: data.role }
}

export async function updateProfile(userId, updates) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
  if (error) throw error
}

export async function fetchProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at')
  if (error) throw error
  return data.map(r => ({ id: r.id, email: r.email, name: r.name, role: r.role, createdAt: r.created_at }))
}

export async function getInviteCode() {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'invite_code').single()
  if (error) throw error
  return data.value
}

export async function setInviteCode(code) {
  const { error } = await supabase.from('app_settings').upsert({ key: 'invite_code', value: code })
  if (error) throw error
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
