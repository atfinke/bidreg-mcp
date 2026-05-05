import { BIDREG_BASE_URL } from "../meta.js";

export class BidRegClient {
  private readonly cookieHeader: string;

  constructor(cookieHeader: string) {
    this.cookieHeader = cookieHeader;
  }

  async get(path: string): Promise<Response> {
    return fetch(`${BIDREG_BASE_URL}${path}`, {
      redirect: "manual",
      headers: {
        Cookie: this.cookieHeader,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  }

  async post(
    path: string,
    body: Record<string, string | string[]>,
  ): Promise<Response> {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(body)) {
      if (Array.isArray(val)) {
        for (const v of val) params.append(key, v);
      } else {
        params.set(key, val);
      }
    }
    return fetch(`${BIDREG_BASE_URL}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: this.cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BIDREG_BASE_URL}/bidstats`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: params.toString(),
    });
  }
}
