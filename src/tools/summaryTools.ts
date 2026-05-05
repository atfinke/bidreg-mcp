import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BidRegClient } from "../client/http.js";
import { summarizeCourse } from "../client/summary.js";
import { getScheduleTerms } from "../client/schedule.js";

export function registerSummaryTools(server: McpServer, client: BidRegClient): void {
  server.tool(
    "bidreg_summarize_course",
    "Summarize historical bid costs and TCE ratings for a specific course across all available terms. Phases are split by program pool (e.g. Full-Time vs E&W) so closing cost medians are never mixed across separate auctions. Use this before deciding what to bid on a course.",
    {
      courseName: z.string().describe('Exact or partial course name, e.g. "MECN-452-0" or "FINC-430"'),
      program: z.string().default("Full-Time").describe('Program pool filter. Defaults to "Full-Time" (FT MBA). Pass an empty string to see all pools including E&W.'),
      upcomingTerm: z.string().optional().describe('Term name to include upcoming schedule for, e.g. "Fall 2026". Resolves to a term code via the schedule terms list.'),
    },
    async (params) => {
      let scheduleTermCode: string | undefined;
      if (params.upcomingTerm !== undefined) {
        const terms = await getScheduleTerms(client);
        const match = terms.find((t) => t.key.toLowerCase() === params.upcomingTerm!.toLowerCase());
        if (!match) {
          const available = terms.map((t) => t.key).join(", ");
          throw new Error(`Term "${params.upcomingTerm}" not found. Available terms: ${available}`);
        }
        scheduleTermCode = match.value;
      }
      const result = await summarizeCourse(client, params.courseName, scheduleTermCode, params.program);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    },
  );
}
