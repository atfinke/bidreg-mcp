import { parse } from "csv-parse/sync";
import { CACHE_DIR } from "../config.js";
import { createCache } from "./cache.js";
import type { BidRegClient } from "./http.js";
import { TceRowSchema } from "./types.js";
import type { TceRow } from "./types.js";

const cache = createCache(CACHE_DIR, 7 * 24);
const CACHE_KEY = "tce";

async function getCachedCsv(client: BidRegClient): Promise<string> {
  let csv = cache.read(CACHE_KEY);
  if (!csv) {
    csv = await downloadTceCsv(client);
    cache.write(CACHE_KEY, csv);
  }
  return csv;
}

export async function getAllTce(client: BidRegClient): Promise<TceRow[]> {
  return parseTceCsv(await getCachedCsv(client));
}

export async function refreshTce(client: BidRegClient): Promise<TceRow[]> {
  cache.clear(CACHE_KEY);
  return getAllTce(client);
}

async function downloadTceCsv(client: BidRegClient): Promise<string> {
  const postRes = await client.post("/tce/tcesearch", {});
  await postRes.text();
  if (postRes.status !== 200 && postRes.status !== 302) {
    throw new Error(`TCE search trigger failed: HTTP ${postRes.status}`);
  }
  const res = await client.get("/tce/exporttcesearch");
  if (res.status !== 200) throw new Error(`TCE export failed: HTTP ${res.status}`);
  return res.text();
}

export function parseTceCsv(csvText: string): TceRow[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  const rows: TceRow[] = [];
  for (const r of records) {
    try {
      rows.push(
        TceRowSchema.parse({
          term: r["Term"] ?? "",
          courseTitle: r["Course Title"] ?? "",
          courseName: r["CourseName"] ?? "",
          sectionName: r["SectionName"] ?? "",
          courseOwner: r["CourseOwner"] ?? "",
          faculty: r["Faculty"] ?? "",
          campus: r["Campus"] ?? "",
          meetingPattern: (r["Meeting Pattern"] ?? "").replace(/<br\/?>/gi, "\n"),
          classRating: r["Class"] ?? "0",
          instructorOverall: r["Instructor Overall"] ?? "0",
          learning: r["Learning"] ?? "0",
          difficulty: r["Difficulty"] ?? "0",
          global: r["Global"] ?? "0",
          examples: r["Examples"] ?? "0",
          workLoad: r["WorkLoad"] ?? "0",
          totalResponses: r["Total Responses"] ?? "0",
          numberOfEnrollees: r["Number Of Enrollees"] ?? "0",
        }),
      );
    } catch {
      // Skip malformed rows — TCE CSV may contain header notes or partial rows
    }
  }
  return rows;
}

export function filterTceRows(
  rows: TceRow[],
  params: {
    term?: string;
    subject?: string;
    courseName?: string;
    faculty?: string;
    campus?: string;
    courseOwner?: string;
    minInstructorRating?: number;
    minClassRating?: number;
    maxDifficulty?: number;
    maxWorkLoad?: number;
    minTotalResponses?: number;
  },
): TceRow[] {
  const lc = (s: string) => s.toLowerCase();
  return rows.filter((row) => {
    if (params.term && !lc(row.term).includes(lc(params.term))) return false;
    if (params.subject && !lc(row.courseName).startsWith(lc(params.subject))) return false;
    if (params.courseName && !lc(row.courseName).includes(lc(params.courseName))) return false;
    if (params.faculty && !lc(row.faculty).includes(lc(params.faculty))) return false;
    if (params.campus && !lc(row.campus).includes(lc(params.campus))) return false;
    if (params.courseOwner && !lc(row.courseOwner).includes(lc(params.courseOwner))) return false;
    if (params.minInstructorRating !== undefined && row.instructorOverall < params.minInstructorRating) return false;
    if (params.minClassRating !== undefined && row.classRating < params.minClassRating) return false;
    if (params.maxDifficulty !== undefined && row.difficulty > params.maxDifficulty) return false;
    if (params.maxWorkLoad !== undefined && row.workLoad > params.maxWorkLoad) return false;
    if (params.minTotalResponses !== undefined && row.totalResponses < params.minTotalResponses) return false;
    return true;
  });
}
