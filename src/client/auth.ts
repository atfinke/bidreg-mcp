import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BIDREG_BASE_URL } from "../meta.js";
import { BidRegClient } from "./http.js";

const SSO_BASE = "https://www4.kellogg.northwestern.edu";
const BIDREG_BASE = BIDREG_BASE_URL;

function loadEnvFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] as [string, string];
        }),
    );
  } catch {
    return {};
  }
}

export function loadCredentials(): { username: string; password: string } {
  // Prefer process env (set by Claude Desktop MCP config or shell),
  // fall back to ~/.bidreg-mcp/.env for local development.
  const fileEnv = loadEnvFile(join(homedir(), ".bidreg-mcp", ".env"));
  const username = process.env["BIDREG_USERNAME"] ?? fileEnv["BIDREG_USERNAME"] ?? "";
  const password = process.env["BIDREG_PASSWORD"] ?? fileEnv["BIDREG_PASSWORD"] ?? "";
  if (!username || !password) {
    throw new Error(
      "BIDREG_USERNAME and BIDREG_PASSWORD must be set.\n" +
        "  Option 1: add them to ~/.bidreg-mcp/.env\n" +
        "  Option 2: set them in your MCP client config env block",
    );
  }
  return { username, password };
}

function extractHidden(html: string, name: string): string {
  const m =
    html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, "i")) ??
    html.match(new RegExp(`value="([^"]*)"[^>]*name="${name}"`, "i"));
  return m?.[1] ?? "";
}

export async function authenticate(username: string, password: string): Promise<string> {
  const wsParams = new URLSearchParams({
    wa: "wsignin1.0",
    wtrealm: "http://www4.kellogg.northwestern.edu/BidReg",
    wctx: "rm=0&id=passive&ru=%2fbidstats",
    wct: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    wreply: `${BIDREG_BASE}/bidstats`,
  });

  const loginUrl = `${SSO_BASE}/WebSSOExternalAuthSite/Login.aspx?${wsParams}`;

  const getRes = await fetch(loginUrl, { redirect: "follow" });
  if (getRes.status !== 200) throw new Error(`SSO login page returned HTTP ${getRes.status}`);

  const html = await getRes.text();
  const viewstate = extractHidden(html, "__VIEWSTATE");
  if (!viewstate) throw new Error("Could not parse SSO login page — site may have changed");

  const sessionCookies = (getRes.headers.get("set-cookie") ?? "")
    .split(",")
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");

  const postBody = new URLSearchParams();
  postBody.set("__VIEWSTATE", viewstate);
  postBody.set("__VIEWSTATEGENERATOR", extractHidden(html, "__VIEWSTATEGENERATOR"));
  postBody.set("__EVENTVALIDATION", extractHidden(html, "__EVENTVALIDATION"));
  postBody.set("txtUsername", username);
  postBody.set("txtPassword", password);
  postBody.set("btnLogin", "SIGN IN");

  const postRes = await fetch(getRes.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: sessionCookies,
      Referer: getRes.url,
    },
    body: postBody.toString(),
    redirect: "manual",
  });

  const location = postRes.headers.get("location") ?? "";
  if (postRes.status !== 302 || !location.includes("kellogg.northwestern.edu")) {
    throw new Error(
      "SSO login failed — check BIDREG_USERNAME and BIDREG_PASSWORD in ~/.bidreg-mcp/.env",
    );
  }

  // Follow redirects back to BidReg, collecting all session cookies
  const collected = new Map<string, string>();

  const addCookies = (header: string | null) => {
    if (!header) return;
    for (const part of header.split(/,(?=[^;]+=[^;]+;)/)) {
      const nameVal = part.split(";")[0]?.trim() ?? "";
      const eq = nameVal.indexOf("=");
      if (eq > 0) collected.set(nameVal.slice(0, eq).trim(), nameVal.slice(eq + 1).trim());
    }
  };

  addCookies(postRes.headers.get("set-cookie"));
  let nextUrl = location.startsWith("http") ? location : `${SSO_BASE}${location}`;

  for (let hops = 0; hops < 10; hops++) {
    const cookieHeader = [...collected.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(nextUrl, { redirect: "manual", headers: { Cookie: cookieHeader } });
    addCookies(res.headers.get("set-cookie"));
    if (res.status !== 301 && res.status !== 302) break;
    const loc = res.headers.get("location") ?? "";
    nextUrl = loc.startsWith("http") ? loc : new URL(loc, nextUrl).href;
  }

  const cookieHeader = [...collected.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (!cookieHeader) throw new Error("No session cookies received after SSO login");
  return cookieHeader;
}

export async function createClient(): Promise<BidRegClient> {
  const { username, password } = loadCredentials();
  const cookieHeader = await authenticate(username, password);
  return new BidRegClient(cookieHeader);
}
