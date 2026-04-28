// One-off test script to verify Toast API credentials work.
// Run from project root: node scripts/test-toast.mjs
//
// Reads TOAST_API_HOST, TOAST_CLIENT_ID, TOAST_CLIENT_SECRET, TOAST_RESTAURANT_GUID
// from .env.local. Prints token, jobs list, and sample time entries.

import { readFileSync } from "node:fs";

// Manually load .env.local (no external deps needed)
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const HOST = process.env.TOAST_API_HOST;
const CLIENT_ID = process.env.TOAST_CLIENT_ID;
const CLIENT_SECRET = process.env.TOAST_CLIENT_SECRET;
const RESTAURANT_GUID = process.env.TOAST_RESTAURANT_GUID;

console.log("=== Toast API Test ===");
console.log("Host:", HOST);
console.log("Client ID:", CLIENT_ID?.slice(0, 8) + "...");
console.log("Restaurant GUID:", RESTAURANT_GUID);
console.log("");

// 1) Authenticate
console.log("1) POST /authentication/v1/authentication/login");
const authResp = await fetch(`${HOST}/authentication/v1/authentication/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    userAccessType: "TOAST_MACHINE_CLIENT",
  }),
});
const authData = await authResp.json();
if (!authResp.ok) {
  console.error("  ❌ Auth failed:", authResp.status, JSON.stringify(authData, null, 2));
  process.exit(1);
}
const token = authData.token?.accessToken;
console.log("  ✅ Got token:", token?.slice(0, 20) + "...");
console.log("  Expires in:", authData.token?.expiresIn, "seconds");
console.log("");

const headers = {
  "Authorization": `Bearer ${token}`,
  "Toast-Restaurant-External-ID": RESTAURANT_GUID,
};

// 1.5) Try to discover the actual restaurant GUID via partner API.
//      This works when credentials have partner-level access.
console.log("1.5) GET /partners/v1/restaurants  (discover real GUID)");
try {
  const partResp = await fetch(`${HOST}/partners/v1/restaurants`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (partResp.ok) {
    const partData = await partResp.json();
    console.log(`     ✅ Found ${Array.isArray(partData) ? partData.length : 0} restaurant(s):`);
    for (const r of (partData || [])) {
      console.log(`        - restaurantGuid: ${r.restaurantGuid}`);
      console.log(`          locationName:   ${r.locationName || r.restaurantName || "?"}`);
      console.log(`          managementGroupGuid: ${r.managementGroupGuid || "?"}`);
      console.log(`          externalGroupRef:    ${r.externalGroupRef || "(none)"}`);
      console.log(`          externalRestaurantRef: ${r.externalRestaurantRef || "(none)"}`);
    }
    console.log("\n   👉 Use the restaurantGuid above as TOAST_RESTAURANT_GUID in .env.local");
  } else {
    const txt = await partResp.text();
    console.log(`     ⚠️ Partner endpoint returned ${partResp.status}: ${txt.slice(0, 200)}`);
  }
} catch (e) { console.log("     ⚠️ Partner endpoint error:", e.message); }
console.log("");

// 2) List jobs
console.log("2) GET /labor/v1/jobs");
const jobsResp = await fetch(`${HOST}/labor/v1/jobs`, { headers });
const jobsData = await jobsResp.json();
if (!jobsResp.ok) {
  console.error("  ❌ Jobs failed:", jobsResp.status, JSON.stringify(jobsData, null, 2));
  process.exit(1);
}
console.log(`  ✅ Got ${Array.isArray(jobsData) ? jobsData.length : 0} jobs:`);
for (const j of jobsData.slice(0, 30)) {
  console.log(`     - ${j.title || j.name} ${j.guid ? `(${j.guid})` : ""} ${j.deleted ? "[DELETED]" : ""}`);
}
console.log("");

// 3) Sample time entries (last 7 days)
const end = new Date();
const start = new Date(end);
start.setDate(start.getDate() - 7);
const startISO = start.toISOString();
const endISO = end.toISOString();

console.log(`3) GET /labor/v1/timeEntries?startDate=${startISO}&endDate=${endISO}`);
const teResp = await fetch(
  `${HOST}/labor/v1/timeEntries?startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(endISO)}`,
  { headers }
);
const teData = await teResp.json();
if (!teResp.ok) {
  console.error("  ❌ Time entries failed:", teResp.status, JSON.stringify(teData, null, 2));
  process.exit(1);
}
console.log(`  ✅ Got ${Array.isArray(teData) ? teData.length : 0} time entries in the last 7 days`);
if (Array.isArray(teData) && teData.length > 0) {
  console.log("  Sample entry:");
  console.log("  ", JSON.stringify(teData[0], null, 2).slice(0, 600));
  // Sum hours
  let totalHours = 0;
  const byJob = {};
  for (const te of teData) {
    const hrs = (Number(te.regularHours) || 0) + (Number(te.overtimeHours) || 0);
    totalHours += hrs;
    const jobGuid = te.jobReference?.guid || te.jobGuid || "unknown";
    byJob[jobGuid] = (byJob[jobGuid] || 0) + hrs;
  }
  console.log(`  Total hours last 7 days: ${totalHours.toFixed(2)}`);
  console.log("  By job GUID:");
  for (const [guid, hrs] of Object.entries(byJob)) {
    const job = jobsData.find(j => j.guid === guid);
    console.log(`    ${job?.title || guid}: ${hrs.toFixed(2)} hrs`);
  }
}

console.log("\n✅ All tests passed.");
