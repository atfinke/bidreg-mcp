import { parse } from "csv-parse/sync";
import { CACHE_DIR } from "../config.js";
import { createCache } from "./cache.js";
import type { BidRegClient } from "./http.js";
import { BidStatRowSchema, BidStatsFiltersSchema } from "./types.js";
import type { BidStatRow, BidStatsFilters } from "./types.js";

const cache = createCache(CACHE_DIR, 7 * 24);
const CACHE_KEY = "bidstats";

async function getCachedCsv(client: BidRegClient): Promise<string> {
  let csv = cache.read(CACHE_KEY);
  if (!csv) {
    csv = await downloadBidStatsCsv(client);
    cache.write(CACHE_KEY, csv);
  }
  return csv;
}

export async function getAllBidStats(client: BidRegClient): Promise<BidStatRow[]> {
  return parseBidStatsCsv(await getCachedCsv(client));
}

export async function refreshBidStats(client: BidRegClient): Promise<BidStatRow[]> {
  cache.clear(CACHE_KEY);
  return getAllBidStats(client);
}

export async function getRawBidStatsCsv(client: BidRegClient): Promise<string> {
  return getCachedCsv(client);
}

async function downloadBidStatsCsv(client: BidRegClient): Promise<string> {
  const postRes = await client.post("/bidstats/bidstatssearch", { SortCriteria: "Term|ASC" });
  await postRes.text(); // drain body to free TCP connection
  if (postRes.status !== 200 && postRes.status !== 302) {
    throw new Error(`BidStats search trigger failed: HTTP ${postRes.status}`);
  }
  const res = await client.get("/bidstats/exportbidstatssearch");
  if (res.status !== 200) throw new Error(`BidStats export failed: HTTP ${res.status}`);
  return res.text();
}

export function parseBidStatsCsv(csvText: string): BidStatRow[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  return records.map((r) =>
    BidStatRowSchema.parse({
      term: r["Term"] ?? "",
      courseTitle: r["Course Title"] ?? "",
      courseName: r["CourseName"] ?? "",
      sectionName: r["SectionName"] ?? "",
      program: r["Program"] ?? "",
      phase: r["Phase"] ?? "",
      faculty: r["Faculty"] ?? "",
      campus: r["Campus"] ?? "",
      meetingPattern: (r["Meeting Pattern"] ?? "").replace(/<br\/?>/gi, "\n"),
      numberOfBids: r["Number of Bids"] ?? "0",
      closingCost: r["Closing Cost"] ?? "0",
      seatsAvailable: r["Seats Available"] ?? "0",
      totalSeats: r["Total Seats"] ?? "0",
      enrolled: r["Enrolled"] ?? "0",
      waitlist: r["Waitlist"] ?? "0",
      openSeats: r["Open Seats"] ?? "0",
    }),
  );
}

export function deriveBidStatsFilters(rows: BidStatRow[]): BidStatsFilters {
  const unique = (arr: string[]): string[] =>
    [...new Set(arr)].filter(Boolean).sort();

  return BidStatsFiltersSchema.parse({
    terms: unique(rows.map((r) => r.term)),
    subjects: unique(rows.map((r) => r.courseName.split("-")[0] ?? "")),
    programs: unique(rows.flatMap((r) => r.program.split(",").map((p) => p.trim()))),
    phases: unique(rows.map((r) => r.phase)),
    campuses: unique(rows.map((r) => r.campus)),
    faculty: unique(rows.map((r) => r.faculty)),
  });
}

export function filterBidStatRows(
  rows: BidStatRow[],
  params: {
    term?: string;
    subject?: string;
    courseName?: string;
    program?: string;
    phase?: string;
    faculty?: string;
    campus?: string;
  },
): BidStatRow[] {
  const lc = (s: string) => s.toLowerCase();
  return rows.filter((row) => {
    if (params.term && !lc(row.term).includes(lc(params.term))) return false;
    if (params.subject && !lc(row.courseName).startsWith(lc(params.subject))) return false;
    if (params.courseName && !lc(row.courseName).includes(lc(params.courseName))) return false;
    if (params.program && !lc(row.program).includes(lc(params.program))) return false;
    if (params.phase && !lc(row.phase).includes(lc(params.phase))) return false;
    if (params.faculty && !lc(row.faculty).includes(lc(params.faculty))) return false;
    if (params.campus && !lc(row.campus).includes(lc(params.campus))) return false;
    return true;
  });
}
