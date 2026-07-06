import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSyllabusFileNameTerm,
  parseTermName,
  termOrdinal,
  lookupCatalogId,
  extractSampleSyllabusFileName,
  buildSyllabusDownloadPath,
  assertPdfResponse,
} from "../src/client/syllabus.js";

test("parseSyllabusFileNameTerm tolerates missing and present spaces", () => {
  assert.deepEqual(parseSyllabusFileNameTerm("BLAW-435-0-81_Summer2026.pdf"), {
    term: "Summer 2026",
    year: 2026,
    seasonIndex: 2,
  });
  assert.deepEqual(parseSyllabusFileNameTerm("MECN-441-0-81_Summer 2026.pdf"), {
    term: "Summer 2026",
    year: 2026,
    seasonIndex: 2,
  });
  assert.equal(parseSyllabusFileNameTerm("weird.pdf"), null);
});

test("termOrdinal orders across seasons and years", () => {
  const summer26 = parseSyllabusFileNameTerm("X_Summer 2026.pdf")!;
  const fall26 = parseTermName("Fall 2026")!;
  const fall25 = parseTermName("Fall 2025")!;
  assert.ok(termOrdinal(summer26) < termOrdinal(fall26));
  assert.ok(termOrdinal(fall25) < termOrdinal(fall26));
});

test("lookupCatalogId matches exact and unique SUBJ-NNN prefix", () => {
  const map = new Map([["MECN-441-0", "205268"], ["BLAW-435-0", "204701"]]);
  assert.equal(lookupCatalogId(map, "MECN-441-0"), "205268");
  assert.equal(lookupCatalogId(map, "mecn-441"), "205268");
  assert.equal(lookupCatalogId(map, "ZZZ-999"), null);
});

test("extractSampleSyllabusFileName reads the link, or null when absent", () => {
  const withLink = `<div><a class="log-sample-syllabus-link" href="../coursecatalog/downloadsyllabus?FileName=MECN-441-0-81_Summer 2026.pdf"><img/></a></div>`;
  const noLink = `<div><a class="log-course-tce" href="/tce?coursecatalogid=1">TCE</a></div>`;
  assert.equal(extractSampleSyllabusFileName(withLink), "MECN-441-0-81_Summer 2026.pdf");
  assert.equal(extractSampleSyllabusFileName(noLink), null);
});

test("buildSyllabusDownloadPath URL-encodes spaces", () => {
  assert.equal(
    buildSyllabusDownloadPath("MECN-441-0-81_Summer 2026.pdf"),
    "/coursecatalog/downloadsyllabus?FileName=MECN-441-0-81_Summer%202026.pdf",
  );
});

test("assertPdfResponse passes for a 200 PDF and throws otherwise", () => {
  assert.doesNotThrow(() => assertPdfResponse(200, "application/pdf"));
  assert.throws(() => assertPdfResponse(404, "application/pdf"), /HTTP 404/);
  assert.throws(() => assertPdfResponse(200, "text/html"), /did not return a PDF/);
});

test("lookupCatalogId returns null on an ambiguous prefix but exact still resolves", () => {
  const map = new Map([["MECN-441-0", "205268"], ["MECN-441-5", "999999"]]);
  assert.equal(lookupCatalogId(map, "MECN-441"), null);
  assert.equal(lookupCatalogId(map, "MECN-441-0"), "205268");
});
