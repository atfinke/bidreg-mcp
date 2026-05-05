import { homedir } from "node:os";
import { join } from "node:path";

const BIDREG_DIR = join(homedir(), ".bidreg-mcp");
export const CACHE_DIR = join(BIDREG_DIR, "cache");
export const DOWNLOADS_DIR = join(homedir(), "Downloads");
