export const BIDREG_CONTEXT = `# Kellogg BidReg System Context

## Bid Phases
Kellogg uses a sealed-bid point auction run in four sequential phases each term:

- **Bid Phase 1**: Main phase. Students submit bids; a uniform clearing price is set at the lowest accepted bid. If a course is undersubscribed (bids ≤ seats), the closing cost is 0 and everyone who bid gets in free.
- **Bid Phase 2**: Remaining seats from Phase 1 go back on offer. Same uniform-price mechanism. Closing costs here are often higher because students bidding in Phase 2 missed Phase 1 and are more motivated.
- **Bid Phase 3**: Same mechanism, remaining seats only.
- **Pay What You Bid (PWYB)**: Final phase. Each admitted student pays their own individual bid (not a uniform price). High variance — a few students pay a lot, others get in cheap. Closing cost shown in bidstats is the lowest accepted bid.

## Interpreting Bid Stats
- **Closing cost = 0**: Course was undersubscribed — everyone who bid was admitted at zero cost. Safe to bid any positive amount.
- **Closing cost > 0**: Course was oversubscribed — bid at or above this to have been admitted.
- **numberOfBids**: How many bids were submitted in that phase for that section.
- **bids/seat ratio < 1**: Undersubscribed (expect closing cost 0). Ratio > 1: oversubscribed.
- A course that closes at 0 in Phase 1 often becomes expensive in Phase 2/3 — students who slept on it compete for remaining seats.

## TCE Ratings (0–6 scale)
- **Instructor Overall**: Most important signal for course quality.
- **Difficulty**: Higher = harder. Above 4.5 is demanding.
- **WorkLoad**: Higher = more time-intensive. Above 3.5 is heavy.
- **Class rating** tracks instructor rating closely; less independent signal.
- Ratings below 20 total responses are noisy — caveat advice accordingly.

## Practical Advice Patterns
- If a course historically clears at 0 in Phase 1 (ratio < 1), bid a small positive amount (e.g. 1–10 pts) — you'll get in and spend almost nothing.
- Phase 2/3 are higher risk/higher cost. Better to commit in Phase 1 for popular courses.
- The \`bidreg_summarize_course\` tool gives historical phase-by-phase medians and instructor TCE in one call — use it first when advising on a course.
- Always check \`_cachedAt\` in tool results — if data is more than a day old during active bid season, suggest the user run \`bidreg_refresh_cache\`.`;
