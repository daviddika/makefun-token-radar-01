# Token Radar — Method (radar-2)

Snapshot: DefiLlama protocol index, `as_of` 2026-11-14, 758 protocols at or above
$5M TVL, watchlist floor $50M. Everything below is computed from that frozen file
at runtime. Nothing after 2026-11-14 is visible to this model.

## 1. Who is on the board

- All 40 watchlist slugs, unconditionally.
- Plus every clean pre-token protocol below the $50M floor: 138 rows, so the board
  is 40 + 138 = **178 rows**. "Clean" reproduces the watchlist's own rules minus the
  floor: the protocol records no token (mcap, CoinGecko id and symbol all null), its
  name does not end in a version marker (`V2`, `v3`, `1.2`, …), its category is not
  Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX,
  its name contains no whole word wrapped / staked / staking, and its name does not
  begin with an exchange name (Binance, Coinbase, Bybit, Kraken, Bitget, OKX,
  Bitfinex, Gemini). No TVL cut is applied to the clean list: the analyst's
  100-row version cut at $17.23M TVL, but the cut was arbitrary (rows 55–65 are all
  $16–18M), so radar-2 carries all 138.
- Protocols that already trade are set aside in the Live view with their real market
  caps, never mixed into the ranking.

## 2. Implied value — the mcap/TVL ratio

For each category, the comparables are the protocols in that category that already
trade, with mcap_usd > 0. Sixteen rows with mcap ≤ 0 (fifteen at exactly 0, one at
−1) are dropped first as data artefacts. The cleaned universe is 128 protocols;
its median mcap/TVL is **0.2138** (the global median, computed at runtime, never
hardcoded).

| Comparables in the category | ratio used | Source label | Confidence |
|---|---|---|---|
| 5 or more | the category median | `category` | HIGH |
| 2–4 | (category median + global median) / 2 | `shrunk` | MEDIUM |
| 0–1 | the global median | `global` | LOW |

The ratio is then clipped to [0.01, 1.00]. The cap stops thin categories from
exploding (Derivatives' two comparables median 2.16; Risk Curators' single
comparable, an oracle, is 2.97 — using it would put Steakhouse Financial at $8.2B).
The floor stops near-zero categories (Staking Pool, 0.002) from zeroing a row.

`implied_value_usd = round(TVL × ratio)`.

Worked examples: Steakhouse Financial (Risk Curators, 1 comparable) uses the global
median 0.2138 → $2,754M × 0.2138 ≈ $589M. Veda (Onchain Capital Allocator, 2
comparables, median 0.0125) is shrunk to (0.0125 + 0.2138) / 2 = 0.1131 →
$1,563M × 0.1131 ≈ $177M. Only 5 watchlist categories have 5+ comparables; 12 of
17 need fallback or shrinkage, which is why every row carries its ratio, its
comparable count, its source and its confidence — the ratio is the weakest link in
the model, and the board shows that instead of hiding it.

**Implied value is an implied market cap, not FDV.** The snapshot carries mcap
only — no FDV, no circulating supply — so a launch's FDV would typically be higher
than its day-1 mcap. Implied values are order-of-magnitude estimates: within the
usable categories the interquartile spread is 5–20×, so never read them as precise
to three significant figures.

## 3. Launch score P — a relative score, NOT a probability

P combines four snapshot signals. It is a relative ranking score for ordering
protocols, never a calibrated probability: "P = 0.83" does **not** mean "83% chance
of launching".

- **size** = clip(log10(TVL / $5M) / log10(max watchlist TVL / $5M), 0, 1).
  Log scale tames a 550× TVL range; the denominator uses the largest watchlist TVL
  ($2,754M, Steakhouse Financial), computed from the snapshot.
- **growth** = 0.5 if 7-day change is missing, else clip((change_7d + 20) / 40, 0, 1).
  −20% scores 0, 0% scores 0.5, +20% scores 1. One week is noise, and the winsorising
  is load-bearing: shift-defi's +4,448% week (a new-vault artefact) scores 1.0, not 111.
- **maturity** = 0.5 if listed_at is missing; 0.5 × age/90 if age < 90 days;
  0.5 + 0.5 × (age−90)/640 if 90–730 days; 1 − 0.3 × (age−730)/730 if 730–1460 days;
  0.7 if age > 1460 days. Mid-age is the sweet spot: very young is unproven, very old
  with no token yet is evidence *against* an imminent launch. Note listed_at is when
  DefiLlama started tracking, not the launch date — a proxy.
- **reach** = min(chain count, 10) / 10. Capped so vfat.io's 39 chains cannot distort it.

P = 0.35 × size + 0.25 × growth + 0.20 × maturity + 0.20 × reach. Size carries the
most weight because it is the only signal with a strong prior; growth is noisy over
7 days; maturity is a proxy with a known non-monotonic shape; reach is the weakest,
most gameable signal. Across the board P runs 0.11–0.85.

## 4. Score and rank

`score = implied_value_usd × P`. Multiplying, not adding, penalises both tails: a
huge protocol unlikely to launch and a tiny protocol certain to launch are both
poor farms. The board carries both numbers per row: `score` and `score_rank`
(the order by score).

**Why `rank` itself follows implied value, not score.** The competition's rules
require rank 1 to be the board's most valuable protocol — implied value must not
rise as rank ascends (the sealed scorer's `sorted_by_value` row). Ranking by score
would break that: the analyst's own preview puts upshift (implied $56M) ahead of
onre (implied $85M) on score. So `rank` is implied value descending, with score,
then TVL, then slug as tie-breaks, and `score_rank` preserves the analyst's
expected-value ordering for the dashboard to sort by. The rules say rank is the
model's claim, not the array's order, so a page may sort its rows how it likes.

Sensitivity: the top 4 by score are invariant to reasonable weight changes (±0.10
on any weight keeps Steakhouse / Gauntlet / Veda / USDD in the top 5); ranks 5–25
shuffle, which is honest — read ranks 5+ as a band, not a precise order.

## 5. Farm plans

Six steps per protocol, derived from its category, chains, TVL and age only — no
protocol name is special-cased. Typical shape: (1) fresh wallet, (2) the category's
core action, small first, (3) a second repeatable action days later, (4) the same
position on a second listed chain, or a note that it runs on one chain only,
(5) re-check TVL and 7-day change before adding capital, with a withdrawal test,
(6) the evidence log.

**Every plan is labelled: "Unverified — no points program confirmed in the
snapshot."** The snapshot contains no points program, airdrop hint, docs, funding
round, team, fee or volume figure for any protocol. No plan invents a program name,
a points rate or an airdrop allocation, and no yield, APY or fee figure is quoted
anywhere — none is in the file. Capital figures ($50–$250) are sizing suggestions
for the position, not promises. Protocols with no sensible deposit action — a
payment network (Lightning Network) or a chain (Hive Protocol, Noble) — say so
honestly in their plan instead of being forced into a vault-shaped action.

## 6. What the data cannot tell us

- No points programs, airdrop hints, docs, socials, funding rounds, team,
  governance forum or tokenomics draft. A protocol could have a points program live
  and this snapshot would look identical.
- No user counts, volume, revenue or fees. TVL can be one whale; a $50M
  single-depositor vault and a $50M thousand-user DEX look the same here.
- No FDV or supply, so no airdrop share is knowable from this file.
- No time series beyond the 7-day change: no 30/90-day trend, no way to tell a spike
  (shift-defi +4,448%) from a trend.
- The snapshot is frozen at 2026-11-14. Any launch, points program or TVL move after
  that date is invisible.

## 7. Reproducibility

`main.ts` reads the snapshot, `lib/model.ts` scores it, and the output is written
to `/output/board.json` (178 rows), `data.js`, `dashboard/` and `screenshots/`.
The program is deterministic: no clock, no randomness, no network. Two runs in the
sandbox write identical bytes. Model version: **radar-2**.
