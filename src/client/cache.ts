import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export interface Cache {
  read(key: string): string | null;
  write(key: string, csv: string): void;
  clear(key: string): void;
  clearAll(): void;
  listKeys(): string[];
  stat(key: string): { cachedAt: string } | null;
}

export function createCache(cacheDir: string, maxAgeHours?: number): Cache {
  function pathFor(key: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error(`Invalid cache key: ${key}`);
    return join(cacheDir, `${key}.csv`);
  }

  return {
    read(key) {
      try {
        const p = pathFor(key);
        if (maxAgeHours !== undefined) {
          const mtime = statSync(p).mtime;
          const ageMs = Date.now() - mtime.getTime();
          if (ageMs > maxAgeHours * 60 * 60 * 1000) return null;
        }
        return readFileSync(p, "utf8");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    write(key, csv) {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(pathFor(key), csv, "utf8");
    },

    clear(key) {
      const p = pathFor(key);
      if (existsSync(p)) rmSync(p);
    },

    clearAll() {
      if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true });
    },

    listKeys() {
      if (!existsSync(cacheDir)) return [];
      return readdirSync(cacheDir)
        .filter((f) => f.endsWith(".csv"))
        .map((f) => f.slice(0, -4));
    },

    stat(key) {
      try {
        return { cachedAt: statSync(pathFor(key)).mtime.toISOString() };
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
  };
}
