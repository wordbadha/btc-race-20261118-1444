// Hourly-trend rider for the make.fun BTC race (cbBTC, 1-minute bars, $1,000 paper).
//
// Idea: on a 24-hour window Bitcoin mostly drifts and chops; the only durable
// long-only edge in the dev window was riding established hourly uptrends and
// cutting losers fast. This bot does exactly one thing:
//
//   - ENTER when the last 60 minutes are up at least +0.50% on each of the last
//     two closes (momentum that persists, not a one-bar spike) AND the close is
//     above its 120-minute exponential average (the hourly trend is up).
//   - Size: 100% of cash on every entry (one position at most, long only).
//   - EXIT: take half off at +0.80% (bank the move), then let the rest run with
//     a take-profit at +2.00%, a stop at -0.80% from entry, and a trailing stop
//     0.50% below the highest close since entry.
//
// Nothing here reads the clock, the environment, or any file: every decision is
// a pure function of the bars the harness sent. All comparisons are exact
// integer cross-multiplications on the raw price units, so two runs on the same
// data produce the same orders byte for byte.

import { runBars } from "./vendor/makefun-bars.ts";
import type { BarsState, Batch, OrderInput } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";

// Entry: 60-minute return, in basis points, must clear this on each of the
// last CONFIRM closes.
const ENTRY_R60_BPS = 50n; // +0.50%
const CONFIRM = 2;
// Trend filter: close above this EMA length (minutes).
const EMA_LEN = 120;
// Exits, in basis points from the entry close (partial / take-profit / stop).
const PARTIAL_BPS = 80n; // +0.80%: sell half
const TAKE_PROFIT_BPS = 200n; // +2.00%: sell the rest
const STOP_BPS = 80n; // -0.80%: sell the rest
// Trailing stop: sell the rest once the close falls this far below the peak
// close since entry.
const TRAIL_BPS = 50n; // 0.50%
// Orders must clear the modelled fill (2 bps slippage + ~7 bps impact on a
// full-size trade) with room: 100 bps is a wide, safe bound.
const MAX_SLIPPAGE_BPS = 100;

// Close history, raw price units (price_scale 5), oldest first.
const closes: bigint[] = [];
// EMA state, seeded on the first close.
let ema: number | null = null;
const EMA_K = 2 / (EMA_LEN + 1);
// The open position, when held: entry close, highest close since entry, and
// whether the half has been banked.
let entry: bigint | null = null;
let peak: bigint | null = null;
let halfBanked = false;

function r60Bps(back: number): bigint | null {
  // 60-minute return ending `back` bars ago, in bps (truncated).
  const now = closes[closes.length - 1 - back];
  const then = closes[closes.length - 61 - back];
  if (now === undefined || then === undefined) return null;
  return (now * 10000n) / then - 10000n;
}

function onBatch(state: BarsState, _batch: Batch): OrderInput[] {
  const close = state.close(SYMBOL);
  if (close === null || state.warmingUp) return [];
  closes.push(close);
  ema = ema === null ? Number(close) : Number(close) * EMA_K + ema * (1 - EMA_K);

  const held = state.positions.get(SYMBOL);
  const qty = held?.qty ?? 0n;

  if (qty > 0n && entry !== null && peak !== null) {
    if (close > peak) peak = close;
    // Bank half at +0.80% (once per position).
    if (!halfBanked && close * 10000n >= entry * (10000n + PARTIAL_BPS)) {
      halfBanked = true;
      const half = qty / 2n;
      if (half > 0n) {
        return [{ side: "sell", symbol: SYMBOL, qty: half, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    // Take profit, stop loss, trailing stop: sell everything left.
    if (
      close * 10000n >= entry * (10000n + TAKE_PROFIT_BPS) ||
      close * 10000n <= entry * (10000n - STOP_BPS) ||
      close * 10000n <= peak * (10000n - TRAIL_BPS)
    ) {
      entry = null;
      peak = null;
      halfBanked = false;
      return [{ side: "sell", symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  // Flat: look for an entry. Need 121 closes (120 for the EMA, 61 for r60).
  if (qty === 0n && closes.length >= 121 && ema !== null) {
    const aboveTrend = Number(close) > ema;
    let confirmed = aboveTrend;
    for (let back = 0; back < CONFIRM; back++) {
      const r = r60Bps(back);
      if (r === null || r < ENTRY_R60_BPS) {
        confirmed = false;
        break;
      }
    }
    if (confirmed) {
      entry = close;
      peak = close;
      halfBanked = false;
      const spend = state.cash;
      if (spend > 0n) {
        return [{ side: "buy", symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
  }
  return [];
}

await runBars({ onBatch });
