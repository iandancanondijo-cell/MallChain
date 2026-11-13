import { useEffect, useMemo, useState } from 'react';
import { LineChart, fmtMoney } from '../../components/ui';
import { usePerformance } from '../../services/performanceApi';
import { fetchMarketPrice, type MarketPriceResponse, type PriceWindowName } from '../../services/marketPriceApi';
import { useCurrencyConverter } from '../../services/currency';
import type { Currency } from '../../services/currency';

/** Days of wallet flow to chart. PRICE_WINDOW must name the same span. */
const WINDOW_DAYS = 7;
/** The backend window this chart draws: '7d' (see PRICE_WINDOWS_MS). */
const PRICE_WINDOW: PriceWindowName = '7d';
/** Downsample the week to at most this many points. */
const WINDOW_POINTS = 90;
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
 * The price half is read with `?window=7d`, which the backend answers from its
 * durable one-sample-per-minute store (models/MarketPriceSample.js) downsampled
 * to WINDOW_POINTS rows, so the line is priced per day rather than at today's
 * rate. Two limits that remain true are surfaced in the caption rather than
 * papered over: a backend whose store has not been running a week yet values
 * the earliest days at the current rate, and movement older than the window is
 * invisible to the holdings walk, which can push an early point below zero.
 */
export default function WalletFlowChart({ address, balanceCoins, midKes, currency, height = 150 }: Props) {
  const { data: perf, error: perfError } = usePerformance(address, WINDOW_DAYS);
  const [market, setMarket] = useState<MarketPriceResponse | null>(null);
  const toDisplay = useCurrencyConverter(currency);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Ask for the window the chart actually draws, so the backend answers
      // with its durable one-minute-per-bucket history downsampled to fit
      // rather than with however many 15s samples this process has collected.
      const next = await fetchMarketPrice({ window: PRICE_WINDOW, points: WINDOW_POINTS });
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
  const formatPoint = priced ? (v: number) => fmtMoney(v, currency) : (v: number) => `${Math.round(v * 100) / 100} MALL`;

  const labels = model.points.map((p) => new Date(`${p.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }));

  // The trend chip is the backend's own aggregate for the window this chart
  // draws. It used to be recomputed here from the raw samples, because
  // aggregateChangeForRange fell back to the oldest sample it had: a backend
  // that started ten seconds ago reported ten seconds of drift as a weekly
  // trend, and the only way to avoid printing that was to ignore the field.
  // The endpoint now answers `null` when a range is not covered, so `null`
  // means "not recorded" and is said out loud instead of worked around.
  const aggregate = market?.aggregates?.[PRICE_WINDOW] ?? null;
  const win = market?.window ?? null;
  const spanMs = win && win.firstTs != null && win.lastTs != null ? win.lastTs - win.firstTs : 0;
  const coveredLabel = win?.covered
    ? PRICE_WINDOW
    : spanMs > 0 ? humanSpan(spanMs) : 'no samples yet';
  const trendText = aggregate === null
    ? `No ${PRICE_WINDOW} trend recorded`
    : `${aggregate.pct >= 0 ? '+' : ''}${aggregate.pct.toFixed(2)}% MALL · ${coveredLabel}`;

  const notes: string[] = [];
  if (!priced) notes.push('No MALL rate for every day in the window — the line shows your coin balance, not its value.');
  else if (aggregate === null) notes.push(samples.length === 0
    ? 'The backend has no recorded MALL price samples yet, so no trend can be stated.'
    : `Recorded MALL price history covers ${coveredLabel}, not the full ${WINDOW_DAYS} days, so no weekly trend is stated.`);
  else if (model.daysUsingHistory < WINDOW_DAYS) notes.push(`Rate samples reach back ${humanSpan(spanMs)}, so the other ${WINDOW_DAYS - model.daysUsingHistory} day(s) are valued at the current rate.`);
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
        <span className={'dash-flow-trend' + (aggregate === null ? '' : aggregate.pct >= 0 ? ' up' : ' down')}>{trendText}</span>
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
