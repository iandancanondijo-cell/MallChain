import { useEffect, useMemo, useState } from 'react';
import { LineChart, fmtMoney } from '../../components/ui';
import { usePerformance } from '../../services/performanceApi';
import { fetchMarketPrice, type MarketPriceResponse } from '../../services/marketPriceApi';
import { useCurrencyConverter } from '../../services/currency';
import type { Currency } from '../../services/currency';

const WINDOW_DAYS = 7;
/** Chain amounts in /api/history/performance are raw base units, 1e6 per coin. */
const MLCNS_DECIMALS = 6;
const PRICE_POLL_MS = 60 * 1000;

/** UTC YYYY-MM-DD, oldest first — matches how history.js buckets its days. */
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
  return out;
}

/** How long a set of samples actually spans, for labelling a trend honestly. */
function humanSpan(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  if (d >= 1) return `${d}d ${Math.floor((ms % 86_400_000) / 3_600_000)}h`;
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.round(ms / 60_000))}m`;
}

interface Props {
  address: string;
  /** Current MLCNS balance in whole coins (store.balances.MALL). */
  balanceCoins: number;
  /** Current mid price in KES, from useLivePrice — the one canonical rate. */
  midKes: number | null;
  currency: Currency;
  height?: number;
}

/**
 * The dashboard's 7-day line: what this wallet's MLCNS holdings were worth on
 * each of the last seven days, derived from two real sources —
 *   GET /api/history/performance  (on-chain inflow/outflow per day)
 *   GET /api/market/price         (the backend's on-chain price samples)
 *
 * The holdings walk is anchored on the *current* balance and stepped backwards
 * by the net flow that happened after each day, so the line's last point always
 * equals the balance shown next to it. Where a day has no recorded flow the
 * line is flat — that is the truth, not a gap.
 *
 * Two honest limits, surfaced in the caption rather than papered over:
 * /api/market/price returns at most its last 500 samples (~2h of a 15s poll), so
 * the earlier days of the window are valued at the current rate; and movement
 * older than the window is invisible to the walk, which can push an early point
 * below zero.
 */
export default function WalletFlowChart({ address, balanceCoins, midKes, currency, height = 150 }: Props) {
  const { data: perf, error: perfError } = usePerformance(address, WINDOW_DAYS);
  const [market, setMarket] = useState<MarketPriceResponse | null>(null);
  const toDisplay = useCurrencyConverter(currency);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchMarketPrice();
      if (!cancelled) setMarket(next);
    };
    load();
    const id = window.setInterval(load, PRICE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const series = perf?.series ?? [];
  const samples = market?.history ?? [];
  const currentMid = midKes ?? market?.market_price?.mid ?? null;

  const model = useMemo(() => {
    const days = lastNDays(WINDOW_DAYS);
    const netByDay = new Map(series.map((p) => [p.date, p.net]));
    const flowTotal = series.reduce((a, p) => a + p.net, 0);

    let running = 0;
    let floored = 0;
    let daysUsingHistory = 0;
    const points = days.map((day) => {
      running += netByDay.get(day) ?? 0;
      // coins held at the end of this day = today's balance minus whatever
      // moved in or out after it
      const coins = balanceCoins - (flowTotal - running) / 10 ** MLCNS_DECIMALS;
      const clamped = Math.max(coins, 0);
      if (clamped !== coins) floored += 1;

      // last price sample at or before the end of this UTC day
      const dayEnd = Date.parse(`${day}T23:59:59.999Z`);
      let price = currentMid;
      for (let i = samples.length - 1; i >= 0; i--) {
        if (samples[i].ts <= dayEnd) {
          price = samples[i].mid;
          daysUsingHistory += 1;
          break;
        }
      }
      return { day, coins: clamped, kes: price === null ? null : clamped * price };
    });

    return { points, floored, daysUsingHistory, flowTotal };
  }, [series, samples, balanceCoins, currentMid]);

  const valuesKes = model.points.map((p) => p.kes);
  const priced = valuesKes.every((v) => v !== null);
  // No rate for a day means its value can't be stated in money — plot the
  // coin balance instead and say so, rather than inventing a rate.
  const plotValues: number[] = model.points.map((p) => {
    if (!priced || p.kes === null) return p.coins;
    return toDisplay(p.kes, 'KES') ?? p.kes;
  });
  const formatPoint = priced ? (v: number) => fmtMoney(v, currency) : (v: number) => `${Math.round(v * 100) / 100} MLCNS`;

  const labels = model.points.map((p) => new Date(`${p.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }));

  // The backend's aggregateChangeForRange (controllers/marketController.js) falls
  // back to its OLDEST sample whenever nothing reaches into the requested window,
  // so `aggregates['7d']` comes back non-null from a process that started seconds
  // ago and reports minutes of drift as a weekly trend. The chip is therefore
  // computed here from the same samples the line is drawn from, and labelled with
  // the span they actually cover.
  const first = samples[0];
  const last = samples[samples.length - 1];
  const spanMs = samples.length > 1 ? last.ts - first.ts : 0;
  const trend = samples.length > 1 && first.mid > 0
    ? { pct: ((last.mid - first.mid) / first.mid) * 100, label: humanSpan(spanMs) }
    : null;
  const trendText = trend === null
    ? 'Price history unavailable'
    : `${trend.pct >= 0 ? '+' : ''}${trend.pct.toFixed(2)}% MLCNS · ${trend.label}`;

  const notes: string[] = [];
  if (!priced) notes.push('No MLCNS rate for every day in the window — the line shows your coin balance, not its value.');
  else if (model.daysUsingHistory < WINDOW_DAYS) notes.push(`Rate samples reach back ${humanSpan(spanMs)} (the endpoint returns its last 500), so the other ${WINDOW_DAYS - model.daysUsingHistory} day(s) are valued at the current rate.`);
  if (model.floored > 0) notes.push(`${model.floored} day(s) sat before this window's flow, so their balance is floored at zero.`);
  if (perfError) notes.push(`Wallet flow unavailable (${perfError}).`);

  if (!address) {
    return (
      <div className="dash-flow dash-flow-empty">
        <span className="dash-flow-title">7-day balance trend</span>
        <span className="tiny">Connect a wallet to chart your balance.</span>
      </div>
    );
  }

  return (
    <div className="dash-flow">
      <div className="dash-flow-head">
        <span className="dash-flow-title">7-day balance trend</span>
        <span className={'dash-flow-trend' + (trend === null ? '' : trend.pct >= 0 ? ' up' : ' down')}>{trendText}</span>
      </div>
      {plotValues.length > 0 ? (
        <LineChart data={plotValues} labels={labels} height={height} color={priced ? 'var(--cyan)' : 'var(--txt-3)'} formatValue={formatPoint} />
      ) : (
        <div className="dash-flow-empty-plot" style={{ height }} role="img" aria-label="7-day balance trend: loading">
          <span className="tiny">{perfError ? 'No flow data' : 'Reading your on-chain flow…'}</span>
        </div>
      )}
      {notes.length > 0 && <div className="tiny dash-flow-note">{notes.join(' ')}</div>}
    </div>
  );
}
