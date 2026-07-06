# bidreg-mcp

MCP server for Kellogg BidReg, reverse-engineered from observed web app traffic.

Built entirely by Claude Sonnet 4.6 via Claude Code.

## Overview

Exposes Kellogg BidReg bid statistics, course schedule, and enrollment data through MCP tools. Downloads full CSV exports from BidReg and filters in memory rather than using the slow server-side filter endpoints.

- `bidreg_summarize_course` — bid history and TCE ratings for a course across all phases and instructors
- `bidreg_search_bidstats` — filter bid stats by term, subject, course, program, phase, faculty, or campus
- `bidreg_list_filters` — available filter values derived from the cached CSV
- `bidreg_refresh_cache` — force re-download of bid stats, TCE, or schedule CSV
- `bidreg_export_bidstats` — save filtered bid stats to a local CSV file
- `bidreg_search_schedule` — search the course schedule by term, subject, course, instructor, or campus
- `bidreg_get_my_classes` — scrape enrolled courses from the My Classes page
- `bidreg_get_syllabus` — download a course's sample syllabus PDF to disk and report its term plus staleness vs an optional target term

## Setup

```bash
npm install
npm run build
```

Create `~/.bidreg-mcp/.env` with your Northwestern credentials:

```
BIDREG_USERNAME=netid@u.northwestern.edu
BIDREG_PASSWORD=your-password
```

The server authenticates automatically on startup using the WS-Federation SSO endpoint. No browser or manual login required.

Cached CSVs are stored in `~/.bidreg-mcp/` and expire after 7 days.

## Notes

- Credentials are read from `BIDREG_USERNAME` / `BIDREG_PASSWORD` environment variables, then from `~/.bidreg-mcp/.env`.
- `bidreg_summarize_course` is the best starting point when advising on a specific course — it returns median closing costs per phase plus instructor TCE ratings in one call.
- Bid stats, TCE, and schedule CSVs are each cached separately. Call `bidreg_refresh_cache` if data looks stale during active bid season.
- `bidreg_get_my_classes` scrapes the My Classes HTML page and is not cached.
