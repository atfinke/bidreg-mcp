import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_DIR, DOWNLOADS_DIR } from "../config.js";
import { createCache } from "../client/cache.js";
import {
  getAllBidStats,
  getRawBidStatsCsv,
  refreshBidStats,
  deriveBidStatsFilters,
  filterBidStatRows,
} from "../client/bidstats.js";
import { refreshTce } from "../client/tce.js";
import { refreshSchedule, getScheduleTerms } from "../client/schedule.js";
import type { BidRegClient } from "../client/http.js";

export function registerBidstatsTools(
  server: McpServer,
  client: BidRegClient,
): void {
  server.tool(
    "bidreg_list_filters",
    "Load the cached bid-stats dataset (downloading if missing) and return unique filter values: terms, subject codes, programs, phases, campuses, faculty.",
    {},
    async () => {
      const rows = await getAllBidStats(client);
      const filters = deriveBidStatsFilters(rows);
      const _cachedAt = createCache(CACHE_DIR).stat("bidstats")?.cachedAt ?? null;
      const scheduleTerms = await getScheduleTerms(client);
      const result = { ...filters, scheduleTerms, _cachedAt };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );

  server.tool(
    "bidreg_search_bidstats",
    "Load cached bid-stats and filter offline. All params are optional, case-insensitive substring matches. 'subject' matches the leading course code prefix (e.g. 'FINC').",
    {
      term: z.string().optional().describe('Term substring, e.g. "Spring 2026"'),
      subject: z.string().optional().describe('Subject prefix, e.g. "FINC"'),
      courseName: z.string().optional().describe('Course name substring, e.g. "FINC-430"'),
      program: z.string().optional().describe('Program substring, e.g. "Full-Time"'),
      phase: z.string().optional().describe('Phase substring, e.g. "Bid Phase 1"'),
      faculty: z.string().optional().describe('Faculty name substring'),
      campus: z.string().optional().describe('Campus substring, e.g. "Chicago"'),
    },
    async (params) => {
      const rows = await getAllBidStats(client);
      const filtered = filterBidStatRows(rows, params);
      const _cachedAt = createCache(CACHE_DIR).stat("bidstats")?.cachedAt ?? null;
      const result = { totalRows: filtered.length, rows: filtered, _cachedAt };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );

  server.tool(
    "bidreg_export_to_disk",
    "Save the cached bid-stats CSV to ~/Downloads. Returns the absolute file path, row count, file size, and column list.",
    {
      filename: z.string().optional().describe("Base filename without extension. Defaults to bidreg-YYYY-MM-DD."),
    },
    async (params) => {
      const csvText = await getRawBidStatsCsv(client);
      const lines = csvText.split("\n").filter((l) => l.trim().length > 0);
      const rowCount = lines.length - 1;
      const columns = (lines[0] ?? "").split(",").map((c) => c.trim());
      const dateStr = new Date().toISOString().slice(0, 10);
      const base = params.filename ?? `bidreg-${dateStr}`;
      mkdirSync(DOWNLOADS_DIR, { recursive: true });
      const filePath = `${DOWNLOADS_DIR}/${base}.csv`;
      writeFileSync(filePath, csvText, "utf8");
      const result = { filePath, rowCount, fileSizeBytes: Buffer.byteLength(csvText, "utf8"), columns };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );

  server.tool(
    "bidreg_refresh_cache",
    "Force re-download of cached CSV files from BidReg. Omit 'datasets' to refresh bidstats and TCE. Schedule requires a term code.",
    {
      datasets: z
        .array(z.enum(["bidstats", "tce", "schedule"]))
        .optional()
        .describe("Which datasets to refresh. Omit to refresh all (bidstats + tce)."),
      scheduleTermCode: z
        .string()
        .optional()
        .describe("Required when refreshing schedule. Numeric term code, e.g. '200667'."),
    },
    async (params) => {
      const toRefresh = params.datasets ?? ["bidstats", "tce"];
      const results: Record<string, string> = {};
      const cache = createCache(CACHE_DIR);

      if (toRefresh.includes("bidstats")) {
        const rows = await refreshBidStats(client);
        results.bidstats = `${rows.length} rows`;
      }
      if (toRefresh.includes("tce")) {
        const rows = await refreshTce(client);
        results.tce = `${rows.length} rows`;
      }
      if (toRefresh.includes("schedule")) {
        if (!params.scheduleTermCode) {
          throw new Error("scheduleTermCode is required when refreshing schedule. Call bidreg_list_filters to see available term codes.");
        }
        const rows = await refreshSchedule(client, params.scheduleTermCode);
        results[`schedule-${params.scheduleTermCode}`] = `${rows.length} rows`;
      }

      results._cachedKeys = cache.listKeys().join(", ");

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        structuredContent: results,
      };
    },
  );
}
