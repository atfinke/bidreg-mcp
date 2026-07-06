import { mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DOWNLOADS_DIR } from "../config.js";
import type { BidRegClient } from "../client/http.js";
import {
  resolveCatalogId,
  fetchSampleSyllabusRef,
  downloadSyllabus,
  parseTermName,
  termOrdinal,
} from "../client/syllabus.js";

export function registerSyllabusTools(server: McpServer, client: BidRegClient): void {
  server.tool(
    "bidreg_get_syllabus",
    "Download a course's sample syllabus PDF to disk and report which term the sample is from. BidReg stores only the most recently uploaded syllabus per course, which is often from a prior term — the response flags staleness relative to an optional target term. Pass forTerm to check whether the sample matches the term you care about.",
    {
      courseName: z.string().describe('Course code, e.g. "MECN-441" or "MECN-441-0".'),
      forTerm: z
        .string()
        .optional()
        .describe('Optional target term, e.g. "Fall 2026". When set, the response flags whether the sample syllabus is older than this term.'),
      destinationDir: z
        .string()
        .optional()
        .describe("Directory to save the PDF. Defaults to ~/Downloads."),
    },
    async (params) => {
      const catalogId = await resolveCatalogId(client, params.courseName);
      const ref = await fetchSampleSyllabusRef(client, catalogId);
      const pdf = await downloadSyllabus(client, ref.fileName);

      const dir = params.destinationDir ?? DOWNLOADS_DIR;
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, basename(ref.fileName));
      writeFileSync(filePath, pdf);

      const syllabusTerm = ref.term?.term ?? null;
      const target = params.forTerm ? parseTermName(params.forTerm) : null;
      const forTermUnparsed = params.forTerm !== undefined && target === null;

      let isStale: boolean | null = null;
      let note: string;
      if (target && ref.term) {
        isStale = termOrdinal(ref.term) < termOrdinal(target);
        note = isStale
          ? `Sample syllabus is from ${syllabusTerm}, older than the requested ${target.term}. Content and policies may change for the target section.`
          : `Sample syllabus is from ${syllabusTerm}, matching or newer than the requested ${target.term}.`;
      } else if (forTermUnparsed) {
        note = `Sample syllabus is from ${syllabusTerm ?? "an unparseable term"}. Requested term "${params.forTerm}" could not be parsed (expected e.g. "Fall 2026"), so staleness was not evaluated.`;
      } else if (syllabusTerm) {
        note = `Sample syllabus is from ${syllabusTerm}. No target term supplied, so staleness was not evaluated.`;
      } else {
        note = "Downloaded the sample syllabus, but its term could not be parsed from the filename.";
      }

      const result = {
        courseName: params.courseName,
        catalogId,
        filePath,
        syllabusTerm,
        forTerm: target?.term ?? params.forTerm ?? null,
        isStale,
        note,
        fileSizeBytes: pdf.length,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
