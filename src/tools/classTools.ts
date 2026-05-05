import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMyClasses } from "../client/myclass.js";
import type { BidRegClient } from "../client/http.js";

export function registerClassTools(server: McpServer, client: BidRegClient): void {
  server.tool(
    "bidreg_get_my_classes",
    "Fetch all enrolled courses from /myclass across recent terms (current and past semesters). Always fetches fresh — not cached. Each result includes a 'term' field (e.g. 'Spring 2026') indicating which term the enrollment belongs to.",
    {},
    async () => {
      const classes = await getMyClasses(client);
      const result = { count: classes.length, classes };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
