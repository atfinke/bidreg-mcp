import { mkdirSync, writeFileSync } from "node:fs";
import { CACHE_DIR, DOWNLOADS_DIR } from "../src/config.js";
import { createClient } from "../src/client/auth.js";
import { createCache } from "../src/client/cache.js";
import {
  getAllBidStats,
  deriveBidStatsFilters,
  filterBidStatRows,
  getRawBidStatsCsv,
} from "../src/client/bidstats.js";
import { getAllTce, filterTceRows } from "../src/client/tce.js";
import { getScheduleTerms, getSchedule } from "../src/client/schedule.js";
import { getMyClasses } from "../src/client/myclass.js";

async function check(label: string, fn: () => Promise<void>) {
  process.stdout.write(`[smoke] ${label}... `);
  await fn();
  process.stdout.write("✓\n");
}

async function main() {
  const client = await createClient();
  const cache = createCache(CACHE_DIR);

  // Clear cache to test cache-miss download path
  cache.clearAll();

  await check("BidStats cache miss → download", async () => {
    const rows = await getAllBidStats(client);
    if (rows.length === 0) throw new Error("0 rows");
    console.log(`\n         ${rows.length} rows`);
    const filters = deriveBidStatsFilters(rows);
    console.log(`         Terms: ${filters.terms.slice(0, 3).join(", ")} ...`);
    console.log(`         Subjects: ${filters.subjects.slice(0, 5).join(", ")} ...`);
  });

  await check("BidStats cache hit (fast re-read)", async () => {
    const t0 = Date.now();
    const rows = await getAllBidStats(client);
    const ms = Date.now() - t0;
    console.log(`\n         ${rows.length} rows in ${ms}ms (cache hit)`);
    if (ms > 500) throw new Error(`Cache read took ${ms}ms — expected <500ms`);
  });

  await check("BidStats offline filter (FINC)", async () => {
    const rows = await getAllBidStats(client);
    const finc = filterBidStatRows(rows, { subject: "FINC" });
    console.log(`\n         ${finc.length} FINC rows`);
    if (finc.length > 0) {
      const f = finc[0];
      console.log(`         ${f.courseName} | ${f.phase} | ${f.numberOfBids} bids | ${f.closingCost} closing`);
    }
  });

  await check("BidStats export to disk", async () => {
    const csv = await getRawBidStatsCsv(client);
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
    const path = `${DOWNLOADS_DIR}/bidreg-smoke-test.csv`;
    writeFileSync(path, csv, "utf8");
    console.log(`\n         Saved to ${path}`);
  });

  await check("TCE cache miss → download", async () => {
    const rows = await getAllTce(client);
    console.log(`\n         ${rows.length} TCE rows`);
    const top = filterTceRows(rows, { minInstructorRating: 5.8 });
    console.log(`         ${top.length} rows with instructor >= 5.8`);
  });

  await check("Schedule terms", async () => {
    const terms = await getScheduleTerms(client);
    console.log(`\n         ${terms.length} terms. Latest: ${terms[terms.length - 1]?.key}`);
  });

  await check("Schedule cache miss → download (latest term)", async () => {
    const terms = await getScheduleTerms(client);
    const latest = terms[terms.length - 1];
    if (!latest) throw new Error("No terms available");
    const rows = await getSchedule(client, latest.value);
    console.log(`\n         ${rows.length} courses for ${latest.key}`);
  });

  await check("Schedule cache hit", async () => {
    const terms = await getScheduleTerms(client);
    const latest = terms[terms.length - 1]!;
    const t0 = Date.now();
    await getSchedule(client, latest.value);
    const ms = Date.now() - t0;
    console.log(`\n         ${ms}ms (cache hit)`);
    if (ms > 500) throw new Error(`Cache read took ${ms}ms`);
  });

  await check("My classes (always-fresh)", async () => {
    const classes = await getMyClasses(client);
    console.log(`\n         ${classes.length} enrolled classes`);
    if (classes.length > 0) console.log(`         First: ${classes[0]!.courseName} — ${classes[0]!.courseTitle}`);
  });

  console.log(`\n[smoke] Cached keys: ${cache.listKeys().join(", ")}`);
  console.log("[smoke] All checks passed ✓");
}

main().catch((err: unknown) => {
  console.error("\n[smoke] FAILED:", err);
  process.exit(1);
});
