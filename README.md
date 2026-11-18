[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/wordbadha/btc-race-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/wordbadha/btc-race-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

# Hourly-Trend BTC Bot

A long-only cbBTC/USDC bot for the make.fun bounty [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261118-1444) (agent-fun/bars-replay/v1, 1-minute bars, $1,000 paper USDC).

## Strategy

On a 24-hour window Bitcoin mostly drifts and chops; the durable long-only edge
in the dev window was riding established hourly uptrends and cutting losers
fast:

- **Entry:** the last 60 minutes are up at least +0.50% on each of the last
  two closes (momentum that persists, not a one-bar spike) **and** the close
  is above its 120-minute exponential average. Full size (whole cash balance).
- **Exit:** bank half at +0.80% over the entry close, then let the rest run
  with a take-profit at +2.00%, a stop loss at -0.80%, and a trailing stop
  0.50% below the highest close since entry.
- **Discipline:** deterministic — every decision is a pure function of the
  bars the harness sent. No clock, no environment, no files, no randomness.
  All comparisons are exact integer cross-multiplications on raw price units,
  so two runs on the same data produce identical orders.

## Dev result (replayed locally against the published dev window)

- **Net PnL: +$3.94** (3 round trips, max drawdown 0.84%)
- Deterministic: two runs over the dev bars produce byte-identical replies.

## Files

- `main.ts` — the bot (Node 22, standard library only; no network, no clock,
  no randomness)
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's protocol SDK
