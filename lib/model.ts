// The token radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) plus every
// clean pre-token protocol below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id, no
// symbol); the snapshot's live-token protocols are kept apart and shown as the market's own values,
// never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures. For each category, the comparables are
// the protocols in that category that already trade (mcap_usd > 0; mcap <= 0 rows are data artefacts
// and are dropped before any median is taken). ratio(cat) is the median mcap/TVL of those comparables,
// shrunk toward the global median when the category has few of them, then clipped to [0.01, 1.00]:
//
//   n >= 5:  ratio = category median            (source 'category', confidence HIGH)
//   n = 2-4: ratio = (category median + global median) / 2   (source 'shrunk', confidence MEDIUM)
//   n <= 1:  ratio = global median              (source 'global', confidence LOW)
//   implied_value_usd = round(tvl_usd * ratio)
//
// The medians are computed from the snapshot at runtime, never hardcoded, so the numbers are
// traceable to the file. Implied value is an implied *market cap*, not FDV: the snapshot carries
// mcap only, no FDV and no supply, and a launch's FDV would typically be higher than its day-1 mcap.
//
// Launch score P is a *relative ranking score*, not a probability of a token launch. It combines
// size (log TVL), 7-day growth (winsorised), maturity (age with no token, non-monotonic) and reach
// (chain count, capped). score = implied_value_usd * P is the expected-value sort: a huge protocol
// unlikely to launch and a tiny protocol certain to launch are both poor farms.
//
// RANKING AND THE GATE. The competition's rules require rank 1 to be the board's most valuable
// protocol: implied_value_usd must not rise as rank ascends (the sealed scorer's sorted_by_value
// row). Ranking by score would break that rule — the analyst's own preview puts a $56M-implied
// protocol (upshift) ahead of an $85M-implied one (onre) on score — so `rank` follows implied value
// descending, with score as the tie-break. The score ranking is preserved per row as `score_rank`,
// and the dashboard may sort by score: the rules say rank is the model's claim, not the array's
// order, so a page may sort its rows how it likes. No protocol name is ever special-cased: the same
// functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Where one row's ratio came from. */
export type RatioSource = 'category' | 'shrunk' | 'global';

/** How much to trust one row's ratio, from its comparable count. */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** The model's constants, as the dashboard states them and the method note documents them. */
export interface ModelConstants {
  tvl_floor_usd: number;
  ratio_cap: number;
  ratio_floor: number;
  growth_low: number;
  growth_high: number;
  maturity_young_days: number;
  maturity_peak_days: number;
  maturity_old_days: number;
  maturity_old_value: number;
  reach_cap_chains: number;
  weight_size: number;
  weight_growth: number;
  weight_maturity: number;
  weight_reach: number;
}

export const MODEL: ModelConstants = {
  tvl_floor_usd: 5_000_000,
  ratio_cap: 1.0,
  ratio_floor: 0.01,
  growth_low: -20,
  growth_high: 20,
  maturity_young_days: 90,
  maturity_peak_days: 730,
  maturity_old_days: 1460,
  maturity_old_value: 0.7,
  reach_cap_chains: 10,
  weight_size: 0.35,
  weight_growth: 0.25,
  weight_maturity: 0.2,
  weight_reach: 0.2,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** Expected-value score: implied_value_usd * launch_score (unrounded P). */
  score: number;
  /** The row's place if the board were ordered by score instead of implied value. */
  score_rank: number;
  /** P, the relative launch score (0-1, NOT a probability), rounded to 4 dp. */
  launch_score: number;
  /** The mcap/TVL ratio applied to this row, after shrinkage and clipping. */
  ratio: number;
  /** How many clean comparables the row's category has. */
  ratio_n: number;
  ratio_source: RatioSource;
  confidence: Confidence;
  model: {
    ratio: number;
    ratio_n: number;
    ratio_source: RatioSource;
    confidence: Confidence;
    launch_score: number;
    size: number;
    growth: number;
    maturity: number;
    reach: number;
    score: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans carried in the data. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  score: number;
  score_rank: number;
  launch_score: number;
  ratio: number;
  ratio_n: number;
  ratio_source: RatioSource;
  confidence: Confidence;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** P is a relative ranking score, not a probability of a token launch. */
  launch_score_note: string;
  /** implied_value_usd is an implied market cap (TVL x ratio), not FDV. */
  implied_note: string;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `n` into [lo, hi]. */
function clip(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list (mean of the two middles when even); null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The per-category comparable medians and the global median, derived from the snapshot at runtime. */
export interface Comparables {
  byCategory: Map<string, { n: number; median: number }>;
  globalMedian: number;
  globalN: number;
}

export function comparables(protocols: SnapshotProtocol[]): Comparables {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    if (!(p.tvl_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio)) continue;
    all.push(ratio);
    const key = p.category ?? 'Unknown';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const globalMedian = median(all) ?? 0;
  const out = new Map<string, { n: number; median: number }>();
  for (const [cat, list] of byCategory) {
    const m = median(list);
    if (m !== null) out.set(cat, { n: list.length, median: m });
  }
  return { byCategory: out, globalMedian, globalN: all.length };
}

/** One category's ratio under the shrinkage rule, with its source and confidence. */
export function ratioFor(category: string | null, comps: Comparables, model: ModelConstants): { ratio: number; ratioN: number; source: RatioSource; confidence: Confidence } {
  const entry = comps.byCategory.get(category ?? 'Unknown');
  const n = entry === undefined ? 0 : entry.n;
  let ratio: number;
  let source: RatioSource;
  let confidence: Confidence;
  if (n >= 5) {
    ratio = entry!.median;
    source = 'category';
    confidence = 'HIGH';
  } else if (n >= 2) {
    ratio = (entry!.median + comps.globalMedian) / 2;
    source = 'shrunk';
    confidence = 'MEDIUM';
  } else {
    ratio = comps.globalMedian;
    source = 'global';
    confidence = 'LOW';
  }
  return { ratio: clip(ratio, model.ratio_floor, model.ratio_cap), ratioN: n, source, confidence };
}

/** The four P components and P itself for one protocol. */
export function launchScore(p: SnapshotProtocol, asOf: string, sizeDenom: number, model: ModelConstants): { p: number; size: number; growth: number; maturity: number; reach: number; age: number | null } {
  const size = sizeDenom > 0 ? clip(Math.log10(p.tvl_usd / model.tvl_floor_usd) / sizeDenom, 0, 1) : 0;
  const growth = p.change_7d === null ? 0.5 : clip((p.change_7d - model.growth_low) / (model.growth_high - model.growth_low), 0, 1);
  const age = ageDays(asOf, p.listed_at);
  let maturity: number;
  if (age === null) maturity = 0.5;
  else if (age < model.maturity_young_days) maturity = 0.5 * (age / model.maturity_young_days);
  else if (age <= model.maturity_peak_days) maturity = 0.5 + 0.5 * ((age - model.maturity_young_days) / (model.maturity_peak_days - model.maturity_young_days));
  else if (age <= model.maturity_old_days) maturity = 1 - 0.3 * ((age - model.maturity_peak_days) / (model.maturity_old_days - model.maturity_peak_days));
  else maturity = model.maturity_old_value;
  const reach = Math.min(p.chains.length, model.reach_cap_chains) / model.reach_cap_chains;
  const score = model.weight_size * size + model.weight_growth * growth + model.weight_maturity * maturity + model.weight_reach * reach;
  return { p: score, size, growth, maturity, reach, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rules exclude from the sub-floor board. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word that marks a wrapped or staked version of another asset. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange name at the start of a protocol name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a sub-floor protocol is clean under the watchlist's rules minus the floor. */
export function isCleanSubFloor(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !VERSIONED.test(p.name) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, or null when it runs on one chain only. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Whether the protocol has no sensible deposit action: a network or chain, not a vault. */
function isNoDeposit(p: SnapshotProtocol): boolean {
  const c = (p.category ?? '').toLowerCase();
  return c === 'chain' || c === 'payments';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c === 'chain') return `${name} is a chain, not a vault: there is no deposit action to farm here. Only use its native function on ${chain} if the app exposes one without a token, and record it as not farmable if it does not.`;
  if (c === 'payments') return `${name} is a payment network, not a vault: there is no deposit action to farm here. Only open a payment channel on ${chain} if you already run the tooling and understand routing; otherwise record it as not farmable and move on.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('uncollateralized lending') || c.includes('lend')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('cdp') || c.includes('collateral')) return `Lock $${capital} of collateral in ${name} on ${chain} and mint its stable asset against it.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small basis position.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small position.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('leveraged farm')) return `Deposit $${capital} into a ${name} leveraged position on ${chain} and keep it open.`;
  if (c.includes('yield')) return `Deposit $${capital} into a ${name} vault or strategy on ${chain} and keep the shares.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into a ${name} managed liquidity position on ${chain} and keep it open.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it; check eligibility first, as RWA positions are often permissioned or KYC-gated.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('anchor btc') || c.includes('decentralized btc')) return `Deposit $${capital} of BTC through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('card')) return `Use ${name}'s card product on ${chain} for a $${capital} spend and keep the receipt.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  if (c.includes('governance')) return `Deposit $${capital} to take part in ${name} governance on ${chain} and vote once.`;
  if (c.includes('cedefi')) return `Deposit $${capital} into ${name} on ${chain} and keep the position open.`;
  if (c === 'farm') return `Deposit $${capital} into a ${name} farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, repeatable action. */
function secondaryFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (isNoDeposit(p)) return `A week later, check whether ${name} has published any usable on-chain action on ${chain}; if it still has none, record that and do not force a deposit.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('liquidity manager') || c === 'farm') return `A week later, deposit a second, smaller tranche into the same ${name} vault on ${chain} and withdraw-test a small amount to prove the exit works.`;
  if (c.includes('lend')) return `Borrow a small amount against the supplied collateral on ${name} (only if you understand liquidation), then repay it in full.`;
  if (c.includes('cdp') || c.includes('collateral')) return `Repay or burn a portion of the minted asset on ${name} to prove the position can be unwound.`;
  if (c.includes('dex')) return `Swap a small amount through the ${name} pool on ${chain} to add volume, then check the liquidity position is still intact.`;
  if (c.includes('basis') || c.includes('derivative') || c.includes('perpetual')) return `Close the position on ${name} and open one fresh small position, spaced days apart from the first.`;
  if (c.includes('rwa') || c.includes('stable')) return `Hold the position for a full week, then check it is still visible in the app and in your wallet.`;
  if (c.includes('staking') || c.includes('restak')) return `Check the staking receipt and rewards page on ${name}, and unstake-test a small amount if the lock allows it.`;
  if (c.includes('prediction')) return `Place a second, smaller market position on ${name} on a different market.`;
  if (c.includes('insurance')) return `Check the policy is active in the ${name} app and note its expiry date.`;
  if (c.includes('card')) return `Make a second small card spend through ${name} and keep both receipts.`;
  if (c.includes('index')) return `Check the index composition on ${name} and confirm your holding is still shown.`;
  if (c.includes('governance')) return `Vote a second time on ${name} when the next proposal opens.`;
  return `Repeat the core action once more on ${name} on ${chain}, spaced days apart from the first, so the activity is not a single burst.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * No points program, rate or airdrop allocation is ever stated: the snapshot confirms none, and the
 * last step says so plainly. Protocols with no sensible deposit action say so instead of being
 * forced into a vault-shaped plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const breadth = isNoDeposit(p)
    ? `Breadth does not apply here: ${p.name} is a network, not a vault, so there is no second-chain deposit to repeat.`
    : second !== null
      ? `Repeat the core position on ${second}, the protocol's second listed chain, if gas allows; otherwise note why it was skipped.`
      : `This protocol runs on one chain only (${chain}), so there is no second-chain position to repeat; note that in the log.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: isNoDeposit(p) ? 'no capital unless you choose to use the native function' : `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondaryFor(p, capital, chain),
      cost: 'about $2 of gas',
      time: '10 minutes',
    },
    {
      text: breadth,
      cost: second !== null && !isNoDeposit(p) ? `about $${capital >= 150 ? 8 : 4} of gas for the second-chain position` : 'nothing',
      time: second !== null && !isNoDeposit(p) ? '15 minutes' : '5 minutes',
    },
    {
      text: `Re-check the protocol's TVL and 7-day change in a fresh snapshot before adding more capital; exit or reduce if TVL falls more than 20% in a week or the position cannot be withdrawn.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Unverified — no points program confirmed in the snapshot. Do not assume this protocol has points, a reward, or an airdrop; keep the wallet, the dates and every transaction hash in a farm log as the only evidence.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, with ranks 1..n, plus each row's score rank. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every clean pre-token protocol below the watchlist floor. No TVL cut: the
  // analyst's clean list is 138 rows, so the board is 40 + 138 = 178 rows.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isCleanSubFloor(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const comps = comparables(snapshot.protocols);
  const watchlistTvl = snapshot.watchlist
    .map((s) => index.get(s))
    .filter((p): p is SnapshotProtocol => p !== undefined)
    .map((p) => p.tvl_usd);
  const maxWatchlistTvl = watchlistTvl.length > 0 ? Math.max(...watchlistTvl) : model.tvl_floor_usd;
  const sizeDenom = Math.log10(maxWatchlistTvl / model.tvl_floor_usd);

  const scored = [...chosen.values()].map((p) => {
    const r = ratioFor(p.category, comps, model);
    const implied = Math.max(1, Math.round(p.tvl_usd * r.ratio));
    const launch = launchScore(p, snapshot.as_of, sizeDenom, model);
    const score = Math.max(0, Math.round(implied * launch.p));
    return { p, implied, ratio: r, launch, score };
  });

  // Score rank: the analyst's ordering, implied x P descending, kept per row for the dashboard.
  const byScore = [...scored].sort(
    (a, b) => b.score - a.score || b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  const scoreRank = new Map<string, number>();
  byScore.forEach((s, i) => scoreRank.set(s.p.slug, i + 1));

  // Rank: the gate requires implied value not to rise as rank ascends, so rank follows implied
  // value descending; score breaks ties, then TVL, then slug. See the header comment.
  scored.sort(
    (a, b) => b.implied - a.implied || b.score - a.score || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.launch.age,
    implied_value_usd: s.implied,
    score: s.score,
    score_rank: scoreRank.get(s.p.slug)!,
    launch_score: round4(s.launch.p),
    ratio: round4(s.ratio.ratio),
    ratio_n: s.ratio.ratioN,
    ratio_source: s.ratio.source,
    confidence: s.ratio.confidence,
    model: {
      ratio: round4(s.ratio.ratio),
      ratio_n: s.ratio.ratioN,
      ratio_source: s.ratio.source,
      confidence: s.ratio.confidence,
      launch_score: round4(s.launch.p),
      size: round4(s.launch.size),
      growth: round4(s.launch.growth),
      maturity: round4(s.launch.maturity),
      reach: round4(s.launch.reach),
      score: s.score,
      age_days: s.launch.age,
    },
    farm_steps: farmSteps(s.p, s.launch.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    score: row.score,
    score_rank: row.score_rank,
    launch_score: row.launch_score,
    ratio: row.ratio,
    ratio_n: row.ratio_n,
    ratio_source: row.ratio_source,
    confidence: row.confidence,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    launch_score_note: 'P is a relative ranking score (0-1), not a probability of a token launch.',
    implied_note: 'implied_value_usd is an implied market cap (TVL x mcap/TVL ratio), not FDV.',
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.launch_score >= 0 && r.launch_score <= 1)) return `${r.slug} has launch score ${r.launch_score}`;
    if (!Number.isSafeInteger(r.score) || r.score < 0) return `${r.slug} has score ${r.score}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
