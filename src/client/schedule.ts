import { parse } from "csv-parse/sync";
import { parse as parseHtml } from "node-html-parser";
import { CACHE_DIR } from "../config.js";
import { createCache } from "./cache.js";
import type { BidRegClient } from "./http.js";
import { ScheduleRowSchema } from "./types.js";
import type { ScheduleRow } from "./types.js";

const cache = createCache(CACHE_DIR, 7 * 24);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// Terms are embedded in the schedule search screen HTML as <select><option value="CODE">Name</option>...
export async function getScheduleTerms(
  client: BidRegClient,
): Promise<Array<{ key: string; value: string }>> {
  const res = await client.get("/coursecatalog/advanceschedulesearchscreen");
  if (res.status !== 200) throw new Error(`Schedule screen failed: HTTP ${res.status}`);
  const html = await res.text();
  const root = parseHtml(html);
  const termSelect = root.querySelector('select[name="AdvanceScheduleSearchParameters.Terms"]');
  if (!termSelect) throw new Error("Schedule terms dropdown not found in page HTML");
  return termSelect
    .querySelectorAll("option")
    .filter((o) => o.getAttribute("value"))
    .map((o) => ({ key: o.text.trim(), value: o.getAttribute("value")! }));
}

export async function getSchedule(
  client: BidRegClient,
  termCode: string,
): Promise<ScheduleRow[]> {
  const cacheKey = `schedule-${termCode}`;
  let csv = cache.read(cacheKey);
  if (!csv) {
    csv = await downloadScheduleCsv(client, termCode);
    cache.write(cacheKey, csv);
  }
  return parseScheduleCsv(csv);
}

export async function refreshSchedule(
  client: BidRegClient,
  termCode: string,
): Promise<ScheduleRow[]> {
  cache.clear(`schedule-${termCode}`);
  return getSchedule(client, termCode);
}

// BidReg's schedule export is a two-step session-stateful flow: POST sets the
// search criteria server-side, GET pulls the export of the last search. Two
// concurrent downloads for different terms can interleave so the GET returns
// the other term's data. Serialize all downloads on a single chain.
let downloadChain: Promise<unknown> = Promise.resolve();

async function downloadScheduleCsv(
  client: BidRegClient,
  termCode: string,
): Promise<string> {
  const result = downloadChain.then(() => doDownloadScheduleCsv(client, termCode));
  downloadChain = result.catch(() => undefined);
  return result;
}

async function doDownloadScheduleCsv(
  client: BidRegClient,
  termCode: string,
): Promise<string> {
  const body: Record<string, string> = {
    "AdvanceScheduleSearchParameters.Terms": termCode,
    "AdvanceScheduleSearchParameters.ExperientialLearning": "false",
    "AdvanceScheduleSearchParameters.RequiresApp": "false",
    "AdvanceScheduleSearchParameters.PNCEligible": "false",
    "AdvanceScheduleSearchParameters.FirstClassMandatory": "false",
    "AdvanceScheduleSearchParameters.Weekend": "false",
  };
  const postRes = await client.post("/coursecatalog/scheduleadvancesearch", body);
  await postRes.text();
  if (postRes.status !== 200 && postRes.status !== 302) {
    throw new Error(`Schedule search trigger failed: HTTP ${postRes.status}`);
  }
  const res = await client.get("/coursecatalog/exportadvanceschedulesearch");
  if (res.status !== 200) throw new Error(`Schedule export failed: HTTP ${res.status}`);
  return res.text();
}

export function parseScheduleCsv(csvText: string): ScheduleRow[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  const rows: ScheduleRow[] = [];
  for (const r of records) {
    try {
      rows.push(
        ScheduleRowSchema.parse({
          courseName: r["Course Name"] ?? "",
          courseTitle: r["Course Title"] ?? "",
          credits: r["Credits"] ?? "0",
          academicYear: r["Academic Year"] ?? "",
          term: r["Term"] ?? "",
          session: r["Session"] ?? "",
          section: r["Section"] ?? "",
          // Schedule uses "|" as session separator (not <br/>)
          meetingPattern: (r["Meeting Pattern"] ?? "").replace(/\|/g, "\n").trim(),
          instructor: r["Instructor"] ?? "",
          campus: r["Campus"] ?? "",
          location: r["Location"] ?? "",
          // Exam field contains raw HTML — strip it
          exam: stripHtml(r["Exam"] ?? ""),
        }),
      );
    } catch {
      // Skip rows that don't match the schema — real-world CSV may have header notes or footer rows
    }
  }
  return rows;
}
