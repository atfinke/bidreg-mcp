import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BidRegClient } from "../client/http.js";
import { registerBidstatsTools } from "./bidstatsTools.js";
import { registerTceTools } from "./tceTools.js";
import { registerScheduleTools } from "./scheduleTools.js";
import { registerClassTools } from "./classTools.js";
import { registerSummaryTools } from "./summaryTools.js";
import { registerSyllabusTools } from "./syllabusTools.js";

export function registerTools(server: McpServer, client: BidRegClient): void {
  registerBidstatsTools(server, client);
  registerTceTools(server, client);
  registerScheduleTools(server, client);
  registerClassTools(server, client);
  registerSummaryTools(server, client);
  registerSyllabusTools(server, client);
}
