import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { APP_NAME, APP_VERSION } from "./meta.js";
import { registerTools } from "./tools/index.js";
import { BIDREG_CONTEXT } from "./prompts.js";
import type { BidRegClient } from "./client/http.js";

const INSTRUCTIONS = `Kellogg BidReg is a sealed-bid point auction. Courses run through up to 4 phases: Phase 1 sets a uniform clearing price (the lowest accepted bid); Phases 2–3 auction remaining seats at higher cost; PWYB (Pay What You Bid) has each student pay their own individual bid. A closing cost of 0 means the course was undersubscribed — everyone who bid got in free. TCE ratings are 0–6; Instructor Overall is the most important quality signal. Always call bidreg_summarize_course first when advising on a specific course. For full system context call the bidreg_context prompt.`;

export function createServer(client: BidRegClient): McpServer {
  const server = new McpServer({ name: APP_NAME, version: APP_VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, client);

  server.prompt(
    "bidreg_context",
    "Background on the Kellogg BidReg point auction system — read this before giving bid advice",
    () => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: BIDREG_CONTEXT } }],
    }),
  );

  return server;
}
