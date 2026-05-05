import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getScheduleTerms, getSchedule } from "../client/schedule.js";
import { getAllTce } from "../client/tce.js";
import type { TceRow } from "../client/types.js";
import { createCache } from "../client/cache.js";
import { CACHE_DIR } from "../config.js";
import type { BidRegClient } from "../client/http.js";

type InstructorTce = {
  instructorOverall: number;
  classRating: number;
  difficulty: number;
  workLoad: number;
  totalResponses: number;
  sectionCount: number;
};

function buildInstructorTceMap(tceRows: TceRow[]): Map<string, InstructorTce> {
  const lc = (s: string) => s.toLowerCase().trim();
  const raw = new Map<string, { ovSum: number; classSum: number; diffSum: number; wlSum: number; totalResponses: number; sectionCount: number }>();
  for (const row of tceRows) {
    const key = lc(row.faculty);
    if (!key) continue;
    const existing = raw.get(key);
    if (existing) {
      existing.ovSum += row.instructorOverall;
      existing.classSum += row.classRating;
      existing.diffSum += row.difficulty;
      existing.wlSum += row.workLoad;
      existing.totalResponses += row.totalResponses;
      existing.sectionCount += 1;
    } else {
      raw.set(key, { ovSum: row.instructorOverall, classSum: row.classRating, diffSum: row.difficulty, wlSum: row.workLoad, totalResponses: row.totalResponses, sectionCount: 1 });
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const result = new Map<string, InstructorTce>();
  for (const [key, d] of raw) {
    result.set(key, {
      instructorOverall: r2(d.ovSum / d.sectionCount),
      classRating: r2(d.classSum / d.sectionCount),
      difficulty: r2(d.diffSum / d.sectionCount),
      workLoad: r2(d.wlSum / d.sectionCount),
      totalResponses: d.totalResponses,
      sectionCount: d.sectionCount,
    });
  }
  return result;
}

function lookupInstructorTce(name: string, map: Map<string, InstructorTce>): InstructorTce | null {
  const key = name.toLowerCase().trim();
  if (!key) return null;
  const exact = map.get(key);
  if (exact) return exact;
  for (const [k, v] of map) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

export function registerScheduleTools(server: McpServer, client: BidRegClient): void {
  server.tool(
    "bidreg_search_schedule",
    "Load cached schedule for a term and return matching courses with instructor TCE ratings joined in. Supports filtering by TCE quality, difficulty, and workload.",
    {
      term: z
        .string()
        .describe('Term name (e.g. "Spring 2026") or numeric code. Pass an invalid value to see available terms.'),
      subject: z.string().optional().describe('Subject code filter, e.g. "DECS"'),
      keyword: z.string().optional().describe("Keyword to match in course name or title"),
      campus: z.string().optional().describe('Campus filter, e.g. "Chicago"'),
      instructor: z.string().optional().describe('Instructor name substring, e.g. "Saraniti"'),
      minInstructorRating: z
        .number()
        .optional()
        .describe("Minimum instructor TCE rating (0–6). Courses with no TCE data are excluded when this is set."),
      maxDifficulty: z
        .number()
        .optional()
        .describe("Maximum difficulty TCE rating (0–6). Courses with no TCE data are excluded when this is set."),
      maxWorkLoad: z
        .number()
        .optional()
        .describe("Maximum workload TCE rating (0–6). Courses with no TCE data are excluded when this is set."),
      minClassRating: z
        .number()
        .optional()
        .describe("Minimum class TCE rating (0–6). Courses with no TCE data are excluded when this is set."),
      minTotalResponses: z
        .number()
        .int()
        .optional()
        .describe("Minimum total TCE responses for the instructor — filters out low-sample ratings"),
    },
    async (params) => {
      const terms = await getScheduleTerms(client);

      let termCode = params.term;
      if (!/^\d+$/.test(params.term)) {
        const match = terms.find((t) => t.key.toLowerCase() === params.term.toLowerCase());
        if (!match) {
          const available = terms.map((t) => `${t.key} (${t.value})`).join(", ");
          throw new Error(`Unknown term "${params.term}". Available: ${available}`);
        }
        termCode = match.value;
      }

      // Resolve the human-readable term name for client-side row filtering.
      // BidReg's CSV export may include rows from adjacent terms.
      const termName = terms.find((t) => t.value === termCode)?.key;

      let rows = await getSchedule(client, termCode);
      const lc = (s: string) => s.toLowerCase();

      if (termName) rows = rows.filter((r) => r.term === termName);
      if (params.subject) rows = rows.filter((r) => lc(r.courseName).startsWith(lc(params.subject!)));
      if (params.keyword) rows = rows.filter((r) => lc(r.courseName).includes(lc(params.keyword!)) || lc(r.courseTitle).includes(lc(params.keyword!)));
      if (params.campus) rows = rows.filter((r) => lc(r.campus).includes(lc(params.campus!)));
      if (params.instructor) rows = rows.filter((r) => lc(r.instructor).includes(lc(params.instructor!)));

      const tceRows = await getAllTce(client);
      const tceMap = buildInstructorTceMap(tceRows);

      const hasTceFilter =
        params.minInstructorRating !== undefined ||
        params.minClassRating !== undefined ||
        params.maxDifficulty !== undefined ||
        params.maxWorkLoad !== undefined ||
        params.minTotalResponses !== undefined;

      const rowsWithTce = rows
        .map((r) => ({ ...r, instructorTce: lookupInstructorTce(r.instructor, tceMap) }))
        .filter((r) => {
          if (!hasTceFilter) return true;
          if (!r.instructorTce) return false;
          if (params.minInstructorRating !== undefined && r.instructorTce.instructorOverall < params.minInstructorRating) return false;
          if (params.minClassRating !== undefined && r.instructorTce.classRating < params.minClassRating) return false;
          if (params.maxDifficulty !== undefined && r.instructorTce.difficulty > params.maxDifficulty) return false;
          if (params.maxWorkLoad !== undefined && r.instructorTce.workLoad > params.maxWorkLoad) return false;
          if (params.minTotalResponses !== undefined && r.instructorTce.totalResponses < params.minTotalResponses) return false;
          return true;
        });

      const _cachedAt = createCache(CACHE_DIR).stat(`schedule-${termCode}`)?.cachedAt ?? null;
      const result = { totalRows: rowsWithTce.length, rows: rowsWithTce, _cachedAt };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
