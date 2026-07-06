import { parse as parseHtml } from "node-html-parser";
import { CACHE_DIR } from "../config.js";
import { createCache } from "./cache.js";
import { getScheduleTerms } from "./schedule.js";
import type { BidRegClient } from "./http.js";

const SEASON_INDEX: Record<string, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  fall: 3,
};

export interface ParsedTerm {
  term: string; // normalized, e.g. "Fall 2026"
  year: number;
  seasonIndex: number;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function build(season: string, yearStr: string): ParsedTerm {
  const lc = season.toLowerCase();
  const year = Number(yearStr);
  return { term: `${cap(lc)} ${year}`, year, seasonIndex: SEASON_INDEX[lc]! };
}

// Parse a human term name like "Fall 2026" (single space).
export function parseTermName(term: string): ParsedTerm | null {
  const m = term.trim().match(/^(Fall|Winter|Spring|Summer)\s+(\d{4})$/i);
  return m ? build(m[1]!, m[2]!) : null;
}

// Parse the term embedded in a syllabus filename tail. Tolerant of the observed
// spacing inconsistency: "Summer2026" (no space) vs "Summer 2026".
export function parseSyllabusFileNameTerm(fileName: string): ParsedTerm | null {
  const m = fileName.match(/_(Fall|Winter|Spring|Summer)\s?(\d{4})\.pdf$/i);
  return m ? build(m[1]!, m[2]!) : null;
}

// Chronological ordinal so Summer 2026 < Fall 2026 and Fall 2025 < Fall 2026.
export function termOrdinal(t: ParsedTerm): number {
  return t.year * 4 + t.seasonIndex;
}

export interface CourseNameEntry {
  Key: string;
  Value: string;
}

// Flatten BidReg's advanceschedulesearchfilters CourseNames[] into a two-column
// CSV so it fits the existing CSV cache with no changes to cache.ts.
export function flattenCatalogCsv(courseNames: CourseNameEntry[]): string {
  const lines = ["courseName,catalogId"];
  for (const e of courseNames) {
    if (e.Key && e.Value) lines.push(`${e.Key},${e.Value}`);
  }
  return lines.join("\n");
}

export function parseCatalogCsv(csv: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(",");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim();
    const id = line.slice(idx + 1).trim();
    if (name && id) map.set(name, id);
  }
  return map;
}

// Tolerant lookup: exact course-code match first, then a unique "SUBJ-NNN" input
// against a "SUBJ-NNN-S" catalog key. Returns null if absent or ambiguous.
export function lookupCatalogId(map: Map<string, string>, courseName: string): string | null {
  const q = courseName.trim().toUpperCase();
  const exact: string[] = [];
  const prefix: string[] = [];
  for (const [name, id] of map) {
    const upper = name.toUpperCase();
    if (upper === q) exact.push(id);
    else if (upper.startsWith(`${q}-`)) prefix.push(id);
  }
  if (exact.length === 1) return exact[0]!;
  const uniquePrefix = [...new Set(prefix)];
  if (exact.length === 0 && uniquePrefix.length === 1) return uniquePrefix[0]!;
  return null;
}

// Extract the sample-syllabus FileName from a coursedetail page. The link looks
// like: <a class="log-sample-syllabus-link" href="../coursecatalog/downloadsyllabus?FileName=...">
// Returns the (decoded) FileName, or null if no sample syllabus link exists.
export function extractSampleSyllabusFileName(html: string): string | null {
  const root = parseHtml(html);
  const link = root.querySelector("a.log-sample-syllabus-link");
  if (!link) return null;
  const href = link.getAttribute("href");
  if (!href) return null;
  const m = href.match(/[?&]FileName=([^&]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1]!);
}

// Build the authenticated download path, URL-encoding the filename so a space
// becomes %20 (matching the browser's observed request).
export function buildSyllabusDownloadPath(fileName: string): string {
  return `/coursecatalog/downloadsyllabus?FileName=${encodeURIComponent(fileName)}`;
}

// Guard a syllabus download response before writing bytes to disk. Prevents
// silently saving an HTML login/error page with a .pdf extension.
export function assertPdfResponse(status: number, contentType: string | null): void {
  if (status !== 200) {
    throw new Error(`Syllabus download failed: HTTP ${status}`);
  }
  if (!contentType || !contentType.toLowerCase().includes("application/pdf")) {
    throw new Error(
      `Syllabus download did not return a PDF (Content-Type: ${contentType ?? "none"}). ` +
        "The session may have expired or the file is unavailable.",
    );
  }
}

const catalogCache = createCache(CACHE_DIR, 7 * 24);
const CATALOG_KEY = "coursecatalog-ids";

interface FiltersResponse {
  CourseNames?: CourseNameEntry[];
}

// Load the course-name -> catalog-id map, downloading and caching on a miss.
// Catalog IDs are stable across terms, so any recent term's filter list works.
async function loadCatalogMap(client: BidRegClient): Promise<Map<string, string>> {
  let csv = catalogCache.read(CATALOG_KEY);
  if (!csv) {
    const terms = await getScheduleTerms(client);
    if (terms.length === 0) {
      throw new Error("No schedule terms available to resolve catalog IDs.");
    }
    // The filters endpoint's CourseNames list is term-scoped, so merge across
    // every term to cover courses offered only in some terms (including future
    // ones). Catalog IDs are stable across terms, so first-seen wins on collision.
    const merged = new Map<string, string>();
    for (const term of terms) {
      const res = await client.post("/coursecatalog/advanceschedulesearchfilters", {
        "AdvanceScheduleSearchParameters.Terms": term.value,
        "AdvanceScheduleSearchParameters.ExperientialLearning": "false",
        "AdvanceScheduleSearchParameters.RequiresApp": "false",
        "AdvanceScheduleSearchParameters.PNCEligible": "false",
        "AdvanceScheduleSearchParameters.FirstClassMandatory": "false",
        "AdvanceScheduleSearchParameters.WeekendFormat": "false",
        "AdvanceScheduleSearchParameters.HideCoursesTaken": "false",
      });
      if (res.status !== 200) continue; // skip a failing term; others still populate the map
      const json = (await res.json()) as FiltersResponse;
      for (const e of json.CourseNames ?? []) {
        if (e.Key && e.Value && !merged.has(e.Key)) merged.set(e.Key, e.Value);
      }
    }
    if (merged.size === 0) {
      throw new Error("No courses returned from BidReg catalog filters across any term.");
    }
    const entries: CourseNameEntry[] = [...merged].map(([Key, Value]) => ({ Key, Value }));
    csv = flattenCatalogCsv(entries);
    catalogCache.write(CATALOG_KEY, csv);
  }
  return parseCatalogCsv(csv);
}

export async function resolveCatalogId(
  client: BidRegClient,
  courseName: string,
): Promise<string> {
  const map = await loadCatalogMap(client);
  const id = lookupCatalogId(map, courseName);
  if (!id) {
    throw new Error(`Unknown course "${courseName}". Check the course code (e.g. "MECN-441").`);
  }
  return id;
}

export interface SyllabusRef {
  fileName: string;
  term: ParsedTerm | null;
}

export async function fetchSampleSyllabusRef(
  client: BidRegClient,
  catalogId: string,
): Promise<SyllabusRef> {
  const res = await client.get(`/coursecatalog/coursedetail?coursecatalogid=${catalogId}`);
  if (res.status !== 200) {
    throw new Error(`Course detail request failed: HTTP ${res.status}`);
  }
  const html = await res.text();
  const fileName = extractSampleSyllabusFileName(html);
  if (!fileName) {
    throw new Error("No syllabus has ever been uploaded for this course.");
  }
  return { fileName, term: parseSyllabusFileNameTerm(fileName) };
}

export async function downloadSyllabus(
  client: BidRegClient,
  fileName: string,
): Promise<Buffer> {
  const res = await client.get(buildSyllabusDownloadPath(fileName));
  assertPdfResponse(res.status, res.headers.get("content-type"));
  return Buffer.from(await res.arrayBuffer());
}
