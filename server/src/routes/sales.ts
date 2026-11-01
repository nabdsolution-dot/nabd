import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../app.js';

const saleBody = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  tillId: z.string().uuid().nullable().optional(),
  receiptNo: z.string().trim().min(1).max(30),
  soldAt: z.string().datetime(),
  tender: z.enum(['usd', 'lbp', 'card']),
  discountCents: z.number().int().min(0).default(0),
  lbpRate: z.number().int().min(1000).optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.number().int().min(1).max(10_000),
    unitCents: z.number().int().min(0).optional()
  })).min(1).max(500)
});

export async function salesRoutes(app: FastifyInstance): Promise<void> {
  // Idempotent: the till generates the sale id, so retrying an upload never double-counts.
  app.post('/sales', { preHandler: app.requirePerm('sell') }, async (req, reply) => {
    const b = saleBody.parse(req.body);
    const client = await app.pool.connect();
    try {
      await client.query('begin');
      const existing = await client.query('select id from sales where id = $1', [b.id]);
      if (existing.rows[0]) { await client.query('rollback'); return reply.code(200).send({ id: b.id, duplicate: true }); }

      const ids = [...new Set(b.lines.map((l) => l.productId))];
      const prods = (await client.query('select id, name, price_cents, vat_bp from products where id = any($1::uuid[])', [ids])).rows;
      const byId = new Map(prods.map((p) => [p.id as string, p]));
      let subtotal = 0;
      let vatRaw = 0;
      const lines = b.lines.map((l) => {
        const p = byId.get(l.productId);
        if (!p) throw new HttpError(422, 'A product in this sale is not in the catalogue.');
        const unit = l.unitCents ?? (p.price_cents as number);
        const lineTotal = unit * l.qty;
        subtotal += lineTotal;
        vatRaw += lineTotal * (p.vat_bp as number) / 10000;
        return { productId: l.productId, name: p.name as string, qty: l.qty, unit };
      });
      if (b.discountCents > subtotal) throw new HttpError(422, 'The discount is larger than the sale.');
      if (b.discountCents * 20 > subtotal && !req.auth.permissions.includes('discount_over_5')) {
        throw new HttpError(403, 'This cashier cannot give a discount over 5%.');
      }
      const vat = subtotal === 0 ? 0 : Math.round(vatRaw * (subtotal - b.discountCents) / subtotal);
      const total = subtotal - b.discountCents + vat;
      const rate = b.lbpRate ?? Number((await client.query("select value from settings where key = 'lbp_rate'")).rows[0]?.value ?? 89500);

      await client.query(
        `insert into sales (id, store_id, till_id, cashier_id, receipt_no, subtotal_cents, discount_cents, vat_cents, total_cents, tender, lbp_rate, sold_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [b.id, b.storeId, b.tillId ?? null, req.auth.id, b.receiptNo, subtotal, b.discountCents, vat, total, b.tender, rate, b.soldAt]
      );
      for (const l of lines) {
        await client.query('insert into sale_lines (sale_id, product_id, name, qty, unit_cents) values ($1,$2,$3,$4,$5)', [b.id, l.productId, l.name, l.qty, l.unit]);
        await client.query(
          `insert into stock (product_id, store_id, qty) values ($1, $2, $3)
           on conflict (product_id, store_id) do update set qty = stock.qty + excluded.qty`,
          [l.productId, b.storeId, -l.qty]
        );
      }
      await client.query('commit');
      return reply.code(201).send({ id: b.id, duplicate: false, totalCents: total, vatCents: vat });
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  });

  app.get('/sales', { preHandler: app.requirePerm('view_reports') }, async (req) => {
    const q = z.object({ storeId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    const args: unknown[] = [];
    let w = '';
    if (q.storeId) { args.push(q.storeId); w = ' where s.store_id = $1'; }
    args.push(q.limit);
    const r = await app.pool.query(
      `select s.id, s.receipt_no as "receiptNo", st.name as store, s.total_cents as "totalCents", s.tender, s.sold_at as "soldAt"
         from sales s join stores st on st.id = s.store_id${w} order by s.sold_at desc limit $${args.length}`, args);
    return r.rows;
  });
}
