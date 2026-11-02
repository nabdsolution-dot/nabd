import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../app.js';

const saleBody = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  tillId: z.string().uuid().nullable().optional(),
  receiptNo: z.string().trim().min(1).max(30),
  soldAt: z.string().datetime(),
  tender: z.enum(['usd', 'lbp', 'card', 'account']),
  discountCents: z.number().int().min(0).default(0), // manual discount on the whole sale
  lbpRate: z.number().int().min(1000).optional(),
  customerId: z.string().uuid().nullable().optional(),
  redeemPoints: z.number().int().min(0).default(0),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.number().int().min(1).max(10_000),
    unitCents: z.number().int().min(0).optional(),
    discountCents: z.number().int().min(0).default(0), // manual discount on this line
    promoCents: z.number().int().min(0).default(0),    // taken off by a promotion
    promoId: z.string().uuid().nullable().optional()
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
      const promoIds = [...new Set(b.lines.map((l) => l.promoId).filter((x): x is string => !!x))];
      if (promoIds.length) {
        const found = (await client.query('select id from promotions where id = any($1::uuid[])', [promoIds])).rows.length;
        if (found !== promoIds.length) throw new HttpError(422, 'A promotion on this sale does not exist.');
      }
      let subtotal = 0; let lineOff = 0; let manualLine = 0; let vatRaw = 0;
      const lines = b.lines.map((l) => {
        const p = byId.get(l.productId);
        if (!p) throw new HttpError(422, 'A product in this sale is not in the catalogue.');
        const unit = l.unitCents ?? (p.price_cents as number);
        const gross = unit * l.qty;
        if (l.discountCents + l.promoCents > gross) throw new HttpError(422, 'A line discount is larger than the line.');
        subtotal += gross; lineOff += l.discountCents + l.promoCents; manualLine += l.discountCents;
        vatRaw += (gross - l.discountCents - l.promoCents) * (p.vat_bp as number) / 10000;
        return { productId: l.productId, name: p.name as string, qty: l.qty, unit, discount: l.discountCents, promo: l.promoCents, promoId: l.promoId ?? null };
      });
      // Discounts a person chose count towards the "over 5%" rule. Promotions do not.
      if ((manualLine + b.discountCents) * 20 > subtotal && !req.auth.permissions.includes('discount_over_5')) {
        throw new HttpError(403, 'This cashier cannot give a discount over 5%.');
      }

      // Customer, loyalty points and on-account sales.
      let customer: { id: string; points: number; credit_limit_cents: number; active: boolean } | undefined;
      if (b.customerId) {
        customer = (await client.query('select id, points, credit_limit_cents, active from customers where id = $1', [b.customerId])).rows[0];
        if (!customer || !customer.active) throw new HttpError(422, 'That customer was not found or is switched off.');
      }
      const loy = Object.fromEntries((await client.query("select key, value from settings where key like 'loyalty_%'")).rows.map((r) => [r.key as string, r.value as string]));
      const loyaltyOn = (loy.loyalty_enabled ?? '1') === '1';
      const earnPerUsd = Number(loy.loyalty_earn_per_usd ?? 1);
      const pointValue = Number(loy.loyalty_point_value_cents ?? 1);
      if (b.redeemPoints > 0) {
        if (!customer) throw new HttpError(422, 'Points can only be used by a customer.');
        if (!loyaltyOn) throw new HttpError(422, 'Loyalty points are switched off.');
        if (b.redeemPoints > customer.points) throw new HttpError(422, 'The customer does not have that many points.');
      }
      const pointsDiscount = b.redeemPoints * pointValue;
      const netSub = subtotal - lineOff;
      const orderOff = b.discountCents + pointsDiscount;
      if (orderOff > netSub) throw new HttpError(422, 'The discount is larger than the sale.');
      const vat = netSub === 0 ? 0 : Math.round(vatRaw * (netSub - orderOff) / netSub);
      const total = netSub - orderOff + vat;
      const allOff = lineOff + orderOff;
      const earned = customer && loyaltyOn ? Math.floor(total * earnPerUsd / 100) : 0;
      if (b.tender === 'account') {
        if (!customer) throw new HttpError(422, 'Choose a customer to sell on account.');
        if (customer.credit_limit_cents <= 0) throw new HttpError(422, 'This customer cannot buy on account.');
        const owed = Number((await client.query('select coalesce(sum(amount_cents),0)::bigint as n from customer_ledger where customer_id = $1', [customer.id])).rows[0].n);
        if (owed + total > customer.credit_limit_cents) throw new HttpError(422, 'This sale is over the customer credit limit.');
      }
      const rate = b.lbpRate ?? Number((await client.query("select value from settings where key = 'lbp_rate'")).rows[0]?.value ?? 89500);

      await client.query(
        `insert into sales (id, store_id, till_id, cashier_id, receipt_no, subtotal_cents, discount_cents, order_discount_cents, vat_cents, total_cents, tender, lbp_rate, sold_at,
                            customer_id, points_earned, points_redeemed, points_discount_cents)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [b.id, b.storeId, b.tillId ?? null, req.auth.id, b.receiptNo, subtotal, allOff, orderOff, vat, total, b.tender, rate, b.soldAt,
         customer?.id ?? null, earned, b.redeemPoints, pointsDiscount]
      );
      for (const l of lines) {
        await client.query(
          'insert into sale_lines (sale_id, product_id, name, qty, unit_cents, discount_cents, promo_cents, promo_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',
          [b.id, l.productId, l.name, l.qty, l.unit, l.discount, l.promo, l.promoId]);
        await client.query(
          `insert into stock (product_id, store_id, qty) values ($1, $2, $3)
           on conflict (product_id, store_id) do update set qty = stock.qty + excluded.qty`,
          [l.productId, b.storeId, -l.qty]
        );
      }
      if (customer) {
        const moved = await client.query('update customers set points = points - $2 + $3, updated_at = now() where id = $1 and points >= $2 returning id', [customer.id, b.redeemPoints, earned]);
        if (!moved.rows[0]) throw new HttpError(422, 'The customer does not have that many points.');
        await client.query(
          `insert into customer_ledger (customer_id, kind, amount_cents, points, ref, sale_id, store_id, user_id) values ($1,'sale',$2,$3,$4,$5,$6,$7)`,
          [customer.id, b.tender === 'account' ? total : 0, earned - b.redeemPoints, b.receiptNo, b.id, b.storeId, req.auth.id]);
      }
      await client.query('commit');
      return reply.code(201).send({ id: b.id, duplicate: false, totalCents: total, vatCents: vat, pointsEarned: earned });
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
