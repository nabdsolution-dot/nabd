/**
 * Promotion engine. The same rules run on the server, the web till and the Android app,
 * so the price on the screen is the price that is saved. Money is integer cents.
 */
export interface Promo {
  id: string; name: string; kind: 'bundle' | 'percent' | 'buy_get';
  productIds: string[]; qty: number; priceCents: number | null; percent: number | null;
}
export interface PromoInput { productId: string; qty: number; unitCents: number }
export interface PromoResult { promoCents: number[]; promoIds: (string | null)[]; names: string[] }

/**
 * Returns, for each input line, the cents taken off by promotions.
 * Each line takes part in at most one promotion (the first one, in the order given, that saves money).
 */
export function applyPromos(lines: PromoInput[], promos: Promo[]): PromoResult {
  const promoCents = lines.map(() => 0);
  const promoIds: (string | null)[] = lines.map(() => null);
  const names: string[] = [];
  const free = lines.map((l) => l.qty); // units not yet used by an earlier promotion

  for (const p of promos) {
    const pool: { i: number; unit: number }[] = [];
    lines.forEach((l, i) => {
      if (!p.productIds.includes(l.productId)) return;
      for (let k = 0; k < free[i]!; k++) pool.push({ i, unit: l.unitCents });
    });
    if (pool.length < p.qty) continue;
    pool.sort((a, b) => b.unit - a.unit); // dearest first, so the customer gets the best deal
    const saved = lines.map(() => 0);
    const used = lines.map(() => 0);
    let total = 0;

    if (p.kind === 'bundle' && p.priceCents !== null) {
      for (let g = 0; g + p.qty <= pool.length; g += p.qty) {
        const group = pool.slice(g, g + p.qty);
        const sum = group.reduce((a, x) => a + x.unit, 0);
        const off = sum - p.priceCents;
        if (off <= 0) continue;
        // Spread the saving over the group in proportion to price, keeping the cents exact.
        let left = off;
        group.forEach((x, k) => {
          const share = k === group.length - 1 ? left : Math.floor(off * x.unit / sum);
          left -= share; saved[x.i]! += share; used[x.i]!++;
        });
        total += off;
      }
    } else if (p.kind === 'percent' && p.percent !== null) {
      for (const x of pool) { const off = Math.round(x.unit * p.percent / 100); saved[x.i]! += off; used[x.i]!++; total += off; }
    } else if (p.kind === 'buy_get' && p.percent !== null) {
      for (let g = 0; g + p.qty <= pool.length; g += p.qty) {
        const group = pool.slice(g, g + p.qty);
        const cheapest = group[group.length - 1]!;
        const off = Math.round(cheapest.unit * p.percent / 100);
        saved[cheapest.i]! += off; total += off;
        for (const x of group) used[x.i]!++;
      }
    }
    if (total <= 0) continue;
    names.push(p.name);
    lines.forEach((_, i) => {
      if (saved[i]! > 0 || used[i]! > 0) { promoCents[i]! += saved[i]!; if (saved[i]! > 0) promoIds[i] = p.id; free[i]! -= used[i]!; }
    });
  }
  return { promoCents, promoIds, names };
}
