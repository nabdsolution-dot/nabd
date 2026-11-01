import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ONLINE_WINDOW, TZ } from './org.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', { preHandler: app.requirePerm('view_reports') }, async (req) => {
    const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), storeId: z.string().uuid().optional() }).parse(req.query);
    const dateExpr = q.date ? '$1::date' : `(now() at time zone '${TZ}')::date`;
    const base: unknown[] = q.date ? [q.date] : [];
    const storeArg = q.storeId ? (base.push(q.storeId), `and s.store_id = $${base.length}`) : '';
    const day = `(s.sold_at at time zone '${TZ}')::date = ${dateExpr}`;

    const k = (await app.pool.query(
      `select coalesce(sum(total_cents),0)::int as sales, count(*)::int as count from sales s where ${day} ${storeArg}`, base)).rows[0];
    const prev = (await app.pool.query(
      `select coalesce(sum(total_cents),0)::int as sales, count(*)::int as count from sales s
        where (s.sold_at at time zone '${TZ}')::date = ${dateExpr} - 7 ${storeArg}`, base)).rows[0];
    const hourly = (await app.pool.query(
      `select extract(hour from s.sold_at at time zone '${TZ}')::int as hour, sum(total_cents)::int as cents
         from sales s where ${day} ${storeArg} group by 1 order by 1`, base)).rows;
    const top = (await app.pool.query(
      `select l.name, coalesce(c.name, '') as category, sum(l.qty)::int as units, sum(l.qty * l.unit_cents)::int as "salesCents"
         from sale_lines l join sales s on s.id = l.sale_id
         left join products p on p.id = l.product_id left join categories c on c.id = p.category_id
        where ${day} ${storeArg} group by l.name, c.name order by "salesCents" desc limit 5`, base)).rows;

    const tillArgs: unknown[] = [];
    const tillStore = q.storeId ? (tillArgs.push(q.storeId), 'where t.store_id = $1') : '';
    const tills = (await app.pool.query(
      `select t.name, st.name as store, t.queued_sales as queued, t.last_sync_at as "lastSyncAt",
              (t.last_sync_at is not null and t.last_sync_at > now() - ${ONLINE_WINDOW}) as online
         from tills t join stores st on st.id = t.store_id ${tillStore}`, tillArgs)).rows;
    const low = (await app.pool.query(
      `select p.name, st.name as store, s.qty, p.reorder_level as "reorderLevel"
         from stock s join products p on p.id = s.product_id join stores st on st.id = s.store_id
        where p.active and p.reorder_level > 0 and s.qty <= p.reorder_level ${q.storeId ? 'and s.store_id = $1' : ''}
        order by s.qty limit 10`, tillArgs)).rows;

    const alerts = [
      ...tills.filter((t) => !t.online).map((t) => ({
        kind: 'till_offline', severity: 'warning',
        title: `${t.store}, ${t.name} is offline`,
        body: t.queued > 0 ? `${t.queued} sales waiting to upload.` : 'No recent sync from this till.'
      })),
      ...low.map((p) => ({
        kind: 'low_stock', severity: 'warning',
        title: `${p.name} is low at ${p.store}`,
        body: `${p.qty} left, reorder level is ${p.reorderLevel}.`
      }))
    ];
    const pct = (now: number, then: number) => (then === 0 ? null : Math.round(((now - then) / then) * 100));
    return {
      date: q.date ?? null,
      salesCents: k.sales,
      transactions: k.count,
      averageBasketCents: k.count ? Math.round(k.sales / k.count) : 0,
      salesVsLastWeekPct: pct(k.sales, prev.sales),
      transactionsVsLastWeekPct: pct(k.count, prev.count),
      tillsOnline: tills.filter((t) => t.online).length,
      tillsTotal: tills.length,
      hourly,
      top,
      alerts
    };
  });
}
