import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CACHE_DIR } from "./config.js";
import { createClient } from "./client/auth.js";
import { getAllBidStats } from "./client/bidstats.js";
import { getAllTce } from "./client/tce.js";
import { getScheduleTerms, getSchedule } from "./client/schedule.js";
import { createServer } from "./server.js";

async function main() {
  const client = await createClient();

  // Pre-warm bidstats and TCE caches in parallel so first tool calls are instant.
  // Also pre-warm schedule for any term in the current year or later (educated guess
  // for upcoming terms — e.g. Fall 2026, Spring 2027). Failures are non-fatal.
  const currentYear = new Date().getFullYear();
  const scheduleWarmPromise = getScheduleTerms(client)
    .then((terms) => {
      const upcoming = terms.filter((t) => {
        const m = t.key.match(/\d{4}/);
        return m !== null && parseInt(m[0]) >= currentYear;
      });
      return Promise.allSettled(upcoming.map((t) => getSchedule(client, t.value)));
    })
    .catch(() => {});

  await Promise.allSettled([getAllBidStats(client), getAllTce(client), scheduleWarmPromise]);

  const server = createServer(client);
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  process.stderr.write(`[bidreg-mcp] Fatal: ${String(err)}\n`);
  process.exit(1);
});
