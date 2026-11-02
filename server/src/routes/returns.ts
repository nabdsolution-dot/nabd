import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../app.js';
import { verifySecret } from '../auth.js';

const returnBody = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  tillId: z.string().uuid().nullable().optional(),
  receiptNo: z.string().trim().min(1).max(30),
  tender: z.enum(['usd', 'lbp', 'card', 'account']),
  reason: z.string().trim().max(200).optional(),
  approverPin: z.string().regex(/^\d{4,6}$/).optional(),
  lines: z.array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(10_000) })).min(1).max(500)
});

export async function returnRoutes(app: FastifyInstance): Promise<void> {
  // Find a sale by receipt number so the till can start a return. Shows what is still returnable.
  app.get('/sales/lookup', { preHandler: app.requirePerm('process_return') }, async (req) => {
    const q = z.object({ receiptNo: z.string().trim().min(1), storeId: z.string().uuid() }).parse(req.query);
    if (req.auth.storeId && req.auth.storeId !== q.storeId) throw new HttpError(403, 'That receipt belongs to another store.');
    const sale = (await app.pool.query(
      `select id, receipt_no as "receiptNo", total_cents as "totalCents", sold_at as "soldAt", tender
         from sales where store_id = $1 and upper(receipt_no) = upper($2)`, [q.storeId, q.receiptNo])).rows[0];
    if (!sale) throw new HttpError(404, 'No sale with that receipt number in this store.');
    const lines = (await app.pool.query(
      `select sl.product_id as "productId", sl.name, sum(sl.qty)::int as sold, max(sl.unit_cents) as "unitCents",
              coalesce((select sum(rl.qty) from return_lines rl join returns r on r.id = rl.return_id
                         where r.sale_id = $1 and rl.product_id = sl.product_id), 0)::int as returned
         from sale_lines sl where sl.sale_id = $1 group by sl.product_id, sl.name`, [sale.id])).rows;
    return { ...sale, lines: lines.map((l) => ({ ...l, returnable: l.sold - l.returned })) };
  });

  app.post('/returns', { preHandler: app.requirePerm('process_return') }, async (req, reply) => {
    const b = returnBody.parse(req.body);

    const sale = (await app.pool.query('select id, store_id, subtotal_cents, order_discount_cents, total_cents, tender, customer_id, points_earned, lbp_rate from sales where id = $1', [b.saleId])).rows[0];
    if (!sale) throw new HttpError(404, 'That sale was not found.');
    if (req.auth.storeId && req.auth.storeId !== sale.store_id) throw new HttpError(403, 'That sale belongs to another store.');

    // A cashier needs a supervisor's PIN. A role that can return without a PIN does not.
    const mine = await app.pool.query('select requires_pin from role_permissions where role_id = $1 and permission = $2', [req.auth.roleId, 'process_return']);
    let approvedBy: string = req.auth.id;
    if (mine.rows[0]?.requires_pin) {
      if (!b.approverPin) throw new HttpError(403, 'A supervisor PIN is needed for a return.');
      const cands = (await app.pool.query(
        `select u.id, u.pin_hash from users u join role_permissions rp on rp.role_id = u.role_id
          where u.store_id = $1 and u.active and u.pin_hash is not null and rp.permission = 'process_return' and not rp.requires_pin`,
        [sale.store_id])).rows;
      const ok = cands.find((c) => verifySecret(b.approverPin as string, c.pin_hash));
      if (!ok) throw new HttpError(403, 'That supervisor PIN is not right.');
      approvedBy = ok.id;
    }

    if (b.tender === 'account' && sale.tender !== 'account') throw new HttpError(422, 'Only a sale made on account can be refunded to the account.');
    const refundTender: string = sale.tender === 'account' ? 'account' : b.tender;

    const client = await app.pool.connect();
    try {
      await client.query('begin');
      if ((await client.query('select 1 from returns where id = $1', [b.id])).rows[0]) {
        await client.query('rollback');
        return reply.code(200).send({ id: b.id, duplicate: true });
      }
      const sold = (await client.query(
        `select product_id, sum(qty)::int as qty, max(unit_cents) as unit, max(name) as name, sum(discount_cents + promo_cents)::int as off from sale_lines where sale_id = $1 group by product_id`, [sale.id])).rows;
      const back = (await client.query(
        `select rl.product_id, sum(rl.qty)::int as qty from return_lines rl join returns r on r.id = rl.return_id where r.sale_id = $1 group by rl.product_id`, [sale.id])).rows;
      const vatRows = (await client.query('select id, vat_bp from products where id = any($1::uuid[])', [b.lines.map((l) => l.productId)])).rows;
      const vatBp = new Map(vatRows.map((p) => [p.id as string, p.vat_bp as number]));

      let sub = 0;
      let vatRaw = 0;
      const saleLineOff = sold.reduce((a, x) => a + (x.off as number), 0);
      const lines = b.lines.map((l) => {
        const s = sold.find((x) => x.product_id === l.productId);
        if (!s) throw new HttpError(422, 'A product in this return was not on the sale.');
        const already = back.find((x) => x.product_id === l.productId)?.qty ?? 0;
        if (l.qty > s.qty - already) throw new HttpError(422, `Only ${s.qty - already} of "${s.name}" can still be returned.`);
        // What was really paid for these units: the price less any line discount or promotion on them.
        const total = (s.unit as number) * l.qty - Math.round((s.off as number) * l.qty / (s.qty as number));
        sub += total;
        vatRaw += total * (vatBp.get(l.productId) ?? 0) / 10000;
        return { productId: l.productId, name: s.name as string, qty: l.qty, unit: s.unit as number };
      });
      const saleNet = (sale.subtotal_cents as number) - saleLineOff;
      const discountShare = saleNet <= 0 ? 0 : Math.round((sale.order_discount_cents as number) * sub / saleNet);
      const vat = sub === 0 ? 0 : Math.round(vatRaw * (sub - discountShare) / sub);
      const refund = sub - discountShare + vat;

      await client.query(
        `insert into returns (id, sale_id, store_id, till_id, cashier_id, approved_by, receipt_no, refund_cents, tender, lbp_rate, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [b.id, sale.id, sale.store_id, b.tillId ?? null, req.auth.id, approvedBy, b.receiptNo, refund, refundTender, sale.lbp_rate, b.reason ?? null]);
      for (const l of lines) {
        await client.query('insert into return_lines (return_id, product_id, name, qty, unit_cents) values ($1,$2,$3,$4,$5)', [b.id, l.productId, l.name, l.qty, l.unit]);
        await client.query('update stock set qty = qty + $3 where product_id = $1 and store_id = $2', [l.productId, sale.store_id, l.qty]);
      }
      if (sale.customer_id) {
        // The customer's account and points follow the refund.
        const back = sale.total_cents > 0 ? Math.floor((sale.points_earned as number) * refund / (sale.total_cents as number)) : 0;
        await client.query('update customers set points = greatest(points - $2, 0), updated_at = now() where id = $1', [sale.customer_id, back]);
        await client.query(
          `insert into customer_ledger (customer_id, kind, amount_cents, points, ref, sale_id, store_id, user_id) values ($1,'refund',$2,$3,$4,$5,$6,$7)`,
          [sale.customer_id, sale.tender === 'account' ? -refund : 0, -back, b.receiptNo, sale.id, sale.store_id, req.auth.id]);
      }
      await client.query(
        `insert into audit_log (user_id, action, entity, entity_id, detail) values ($1, 'return', 'sale', $2, $3)`,
        [req.auth.id, sale.id, JSON.stringify({ refundCents: refund, approvedBy })]);
      await client.query('commit');
      return reply.code(201).send({ id: b.id, duplicate: false, refundCents: refund });
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  });
}
