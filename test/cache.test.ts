import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCache } from "../src/client/cache.js";

test("readCache returns null for missing key", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir);
    assert.equal(cache.read("bidstats"), null);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("write then read round-trips correctly", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir);
    cache.write("bidstats", "Term,CourseName\nFall 2023,ACCT-430-0");
    const result = cache.read("bidstats");
    assert.equal(result, "Term,CourseName\nFall 2023,ACCT-430-0");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("clear removes a specific key", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir);
    cache.write("bidstats", "some csv");
    cache.clear("bidstats");
    assert.equal(cache.read("bidstats"), null);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("clearAll removes all keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir);
    cache.write("bidstats", "csv1");
    cache.write("tce", "csv2");
    cache.clearAll();
    assert.equal(cache.read("bidstats"), null);
    assert.equal(cache.read("tce"), null);
    assert.deepEqual(cache.listKeys(), []);
  } finally {
    try {
      rmSync(dir, { recursive: true });
    } catch {
      // directory may have been removed by clearAll
    }
  }
});

test("listKeys returns all cached keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir);
    cache.write("bidstats", "csv1");
    cache.write("tce", "csv2");
    const keys = cache.listKeys();
    assert.ok(keys.includes("bidstats"));
    assert.ok(keys.includes("tce"));
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("maxAgeHours: returns content when file is fresh", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir, 24);
    cache.write("bidstats", "csv data");
    assert.equal(cache.read("bidstats"), "csv data");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("maxAgeHours: returns null when file is older than TTL", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir, 24);
    cache.write("bidstats", "csv data");
    // Backdate the file mtime to 25 hours ago
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const filePath = join(dir, "bidstats.csv");
    utimesSync(filePath, staleTime, staleTime);
    assert.equal(cache.read("bidstats"), null);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("clear on non-existent key does not throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "bidreg-cache-test-"));
  try {
    const cache = createCache(dir);
    assert.doesNotThrow(() => cache.clear("nonexistent"));
  } finally {
    rmSync(dir, { recursive: true });
  }
});
