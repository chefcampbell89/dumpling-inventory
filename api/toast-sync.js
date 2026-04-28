// Vercel serverless function — Toast labor sync.
//
// Modes (query string):
//   ?mode=refresh-jobs    Pull jobs list from Toast → upsert into toast_jobs table.
//   ?mode=sync-labor      Pull last 4 weeks of time entries → group by week+category
//                         using the toast_jobs mapping → upsert into labor_hours.
//   ?mode=full            Refresh jobs THEN sync labor. (Used by Vercel cron.)
//
// Required env vars: TOAST_API_HOST, TOAST_CLIENT_ID, TOAST_CLIENT_SECRET,
//                    TOAST_RESTAURANT_GUID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

const HOST = process.env.TOAST_API_HOST;
const CLIENT_ID = process.env.TOAST_CLIENT_ID;
const CLIENT_SECRET = process.env.TOAST_CLIENT_SECRET;
const RESTAURANT_GUID = process.env.TOAST_RESTAURANT_GUID;

function envCheck() {
  const missing = ["TOAST_API_HOST","TOAST_CLIENT_ID","TOAST_CLIENT_SECRET","TOAST_RESTAURANT_GUID","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]
    .filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

async function getToastToken() {
  const r = await fetch(`${HOST}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, userAccessType: "TOAST_MACHINE_CLIENT" }),
  });
  if (!r.ok) throw new Error(`Toast auth failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.token?.accessToken;
}

function toastHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Toast-Restaurant-External-ID": RESTAURANT_GUID,
  };
}

// Find the Monday (YYYY-MM-DD) for any date.
function mondayOf(dateStr) {
  const d = new Date(dateStr);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function refreshJobs(supabase, token) {
  const r = await fetch(`${HOST}/labor/v1/jobs`, { headers: toastHeaders(token) });
  if (!r.ok) throw new Error(`Toast jobs failed: ${r.status} ${await r.text()}`);
  const jobs = await r.json();
  const rows = (Array.isArray(jobs) ? jobs : []).filter(j => j.guid).map(j => ({
    job_guid: j.guid,
    job_title: j.title || j.name || "(untitled)",
    last_seen: new Date().toISOString(),
  }));
  if (rows.length === 0) return { jobsUpserted: 0 };
  // Upsert without overwriting category (preserve existing mapping)
  const { data: existing } = await supabase.from("toast_jobs").select("job_guid, category");
  const existingMap = new Map((existing || []).map(e => [e.job_guid, e.category]));
  const payload = rows.map(r => ({
    ...r,
    category: existingMap.get(r.job_guid) || "excluded",
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("toast_jobs").upsert(payload);
  if (error) throw new Error(`toast_jobs upsert failed: ${error.message}`);
  return { jobsUpserted: payload.length };
}

async function syncLabor(supabase, token, lookbackWeeks = 4) {
  // Load category mapping
  const { data: jobsData, error: je } = await supabase.from("toast_jobs").select("job_guid, category");
  if (je) throw new Error(`toast_jobs read failed: ${je.message}`);
  const cat = new Map((jobsData || []).map(j => [j.job_guid, j.category || "excluded"]));

  // Toast's timeEntries endpoint caps each call at 30 days. Chunk the lookback
  // window into <=29-day slices and merge.
  const MAX_DAYS_PER_REQUEST = 29;
  const now = new Date();
  const totalStart = new Date(now);
  totalStart.setUTCDate(totalStart.getUTCDate() - lookbackWeeks * 7);

  const entries = [];
  let chunkStart = new Date(totalStart);
  while (chunkStart < now) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + MAX_DAYS_PER_REQUEST);
    const sliceEnd = chunkEnd > now ? now : chunkEnd;
    const r = await fetch(
      `${HOST}/labor/v1/timeEntries?startDate=${encodeURIComponent(chunkStart.toISOString())}&endDate=${encodeURIComponent(sliceEnd.toISOString())}`,
      { headers: toastHeaders(token) }
    );
    if (!r.ok) throw new Error(`Toast timeEntries failed: ${r.status} ${await r.text()}`);
    const slice = await r.json();
    if (Array.isArray(slice)) entries.push(...slice);
    chunkStart = sliceEnd;
  }

  // Bucket by week_start → { manufacturing, other }
  const buckets = new Map(); // weekStart → { mfg, other }
  for (const te of (entries || [])) {
    const inDate = te.inDate;
    if (!inDate) continue;
    const wk = mondayOf(inDate);
    const guid = te.jobReference?.guid;
    const category = cat.get(guid) || "excluded";
    const hrs = (Number(te.regularHours) || 0) + (Number(te.overtimeHours) || 0);
    if (category === "excluded") continue;
    if (!buckets.has(wk)) buckets.set(wk, { mfg: 0, other: 0 });
    if (category === "manufacturing") buckets.get(wk).mfg += hrs;
    else buckets.get(wk).other += hrs;
  }

  // Upsert each week
  const upserts = [];
  for (const [weekStart, b] of buckets.entries()) {
    upserts.push({
      week_start: weekStart,
      manufacturing_hours: Math.round(b.mfg * 100) / 100,
      all_in_hours: Math.round((b.mfg + b.other) * 100) / 100,
      notes: "auto-synced from Toast",
      updated_at: new Date().toISOString(),
    });
  }
  if (upserts.length > 0) {
    const { error } = await supabase.from("labor_hours").upsert(upserts);
    if (error) throw new Error(`labor_hours upsert failed: ${error.message}`);
  }

  return {
    timeEntriesProcessed: entries.length,
    weeksUpdated: upserts.length,
    weeks: upserts.map(u => ({ week: u.week_start, mfg: u.manufacturing_hours, allIn: u.all_in_hours })),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    envCheck();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const mode = url.searchParams.get("mode") || "full";

    const token = await getToastToken();
    const result = { mode, ok: true };

    if (mode === "refresh-jobs" || mode === "full") {
      Object.assign(result, await refreshJobs(supabase, token));
    }
    if (mode === "sync-labor" || mode === "full") {
      const lookback = parseInt(url.searchParams.get("weeks") || "4", 10);
      Object.assign(result, await syncLabor(supabase, token, lookback));
    }
    res.status(200).json(result);
  } catch (e) {
    console.error("toast-sync error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
