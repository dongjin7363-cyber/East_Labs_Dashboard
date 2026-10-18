import type { Snapshot } from "./model";

type Price = NonNullable<Snapshot["research"]>["prices"][number];
const DAY = 86400000;
const shift = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

// A holiday-shortened trading week still belongs to the following Saturday.
function priceWeek(date: string) {
  return shift(date, (6 - new Date(date).getUTCDay() + 7) % 7);
}
function byWeek(prices: Price[]) {
  const result = new Map<string, Price>();
  for (const price of prices) {
    const week = priceWeek(price.date);
    if (!result.has(week) || result.get(week)!.date < price.date)
      result.set(week, price);
  }
  return result;
}
const change = (end?: Price, start?: Price) =>
  end && start && Number.isFinite(end.close) && start.close > 0
    ? (end.close / start.close - 1) * 100
    : null;

export function recentRawRows(snapshot: Snapshot, history: Snapshot[], benchmarkPrices: Price[] = []) {
  const raw = snapshot.research;
  if (!raw) return [];
  const eligible = history.filter(h => h.ticker === snapshot.ticker && h.week_date <= snapshot.week_date
    && h.research?.origin === raw.origin).sort((a, b) => a.week_date.localeCompare(b.week_date));
  // Newer snapshots override older copies, but never import a future snapshot.
  const prices = new Map<string, Price>();
  const spy = new Map<string, Price>();
  for (const p of benchmarkPrices) if (p.date < snapshot.week_date) spy.set(p.date, p);
  for (const h of [...eligible, snapshot]) {
    for (const p of h.research?.prices ?? []) if (p.date < snapshot.week_date) prices.set(p.date, p);
    for (const p of h.research?.spy_prices ?? []) if (p.date < snapshot.week_date) spy.set(p.date, p);
  }
  const weekly = byWeek([...prices.values()]);
  const scores = new Map(eligible.map(h => [h.week_date, h]));
  scores.set(snapshot.week_date, snapshot);
  return Array.from({ length: 5 }, (_, i) => {
    const week = shift(snapshot.week_date, (i - 4) * 7);
    const price = weekly.get(week);
    const previousPrice = weekly.get(shift(week, -7));
    const fourWeekPrice = weekly.get(shift(week, -28));
    const return1w = change(price, previousPrice);
    const return4w = change(price, fourWeekPrice);
    // Both assets must use exactly the same start/end trading dates.
    const spyReturn4w = price && fourWeekPrice ? change(spy.get(price.date), spy.get(fourWeekPrice.date)) : null;
    const score = scores.get(week);
    const recorded = score?.research;
    const sameDates = recorded?.prices[0]?.date === price?.date
      && recorded?.prices.some(p => p.date === fourWeekPrice?.date);
    const benchmark = spyReturn4w ?? (sameDates ? recorded?.spy_return_4w ?? null : null);
    return { week, price, previousPrice, score, previousScore: scores.get(shift(week, -7)),
      return1w, return4w, spyReturn4w: benchmark,
      excess4w: return4w !== null && benchmark !== null ? return4w - benchmark : null };
  });
}

export function scoreAxis(values: number[], fullScale = false) {
  const finite = values.filter(Number.isFinite);
  if (fullScale || !finite.length) return { min: 0, max: 40, ticks: Array.from({ length: 9 }, (_, i) => i * 5) };
  const low = Math.min(...finite), high = Math.max(...finite);
  const padding = Math.max(1, (high - low) * 0.08);
  const min = Math.max(0, Math.floor(low - padding));
  const max = Math.min(40, Math.ceil(high + padding));
  const span = max - min;
  const step = span <= 5 ? 1 : span <= 20 ? 2 : 5;
  const ticks = [min];
  for (let v = Math.ceil(min / step) * step; v < max; v += step)
    if (v > min) ticks.push(v);
  if (max - ticks[ticks.length - 1] < step * 0.6 && ticks.length > 1) ticks.pop();
  ticks.push(max);
  return { min, max, ticks };
}
