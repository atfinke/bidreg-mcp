import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllTce, filterTceRows } from "../client/tce.js";
import { createCache } from "../client/cache.js";
import { CACHE_DIR } from "../config.js";
import type { BidRegClient } from "../client/http.js";

export function registerTceTools(server: McpServer, client: BidRegClient): void {
  server.tool(
    "bidreg_search_tce",
    "Load cached TCE (Teaching Course Evaluations) and filter offline. All rating fields are on a 0–6 scale.",
    {
      term: z.string().optional().describe('Term substring, e.g. "Fall 2024"'),
      subject: z.string().optional().describe('Subject prefix, e.g. "FINC"'),
      courseName: z.string().optional().describe('Course name substring, e.g. "FINC-430"'),
      faculty: z.string().optional().describe("Faculty name substring"),
      campus: z.string().optional().describe('Campus substring, e.g. "Evanston"'),
      courseOwner: z.string().optional().describe('Program track, e.g. "FTPT"'),
      minInstructorRating: z
        .number()
        .optional()
        .describe("Minimum Instructor Overall rating (0–6)"),
      minClassRating: z
        .number()
        .optional()
        .describe("Minimum Class rating (0–6)"),
      maxDifficulty: z
        .number()
        .optional()
        .describe("Maximum difficulty rating (0–6). Below 3.5 is lighter."),
      maxWorkLoad: z
        .number()
        .optional()
        .describe("Maximum workload rating (0–6). Below 3.0 is lighter."),
      minTotalResponses: z
        .number()
        .int()
        .optional()
        .describe("Minimum total responses — filters out low-sample ratings"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(50)
        .describe("Max rows to return, sorted by instructorOverall descending (default 50)"),
    },
    async (params) => {
      const rows = await getAllTce(client);
      const filtered = filterTceRows(rows, params);
      filtered.sort((a, b) => b.instructorOverall - a.instructorOverall);
      const limited = filtered.slice(0, params.limit);
      const _cachedAt = createCache(CACHE_DIR).stat("tce")?.cachedAt ?? null;
      const result = { totalRows: filtered.length, rows: limited, _cachedAt };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
