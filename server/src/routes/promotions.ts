import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../app.js';

const body = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['bundle', 'percent', 'buy_get']),
  productIds: z.array(z.string().uuid()).min(1).max(200),
  qty: z.number().int().min(1).max(100),
  priceCents: z.number().int().min(0).nullable().optional(),
  percent: z.number().int().min(1).max(100).nullable().optional(),
  active: z.boolean().default(true),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
}).superRefine((b, ctx) => {
  if (b.kind === 'bundle' && (b.priceCents === null || b.priceCents === undefined)) ctx.addIssue({ code: 'custom', message: 'A bundle needs a price.', path: ['priceCents'] });
  if (b.kind !== 'bundle' && (b.percent === null || b.percent === undefined)) ctx.addIssue({ code: 'custom', message: 'This promotion needs a percent.', path: ['percent'] });
  if (b.kind === 'bundle' && b.qty < 2) ctx.addIssue({ code: 'custom', message: 'A bundle needs at least 2 items.', path: ['qty'] });
});

export const PROMO_SELECT = `select id, name, kind, product_ids as "productIds", qty, price_cents as "priceCents", percent, active,
  to_char(starts_on, 'YYYY-MM-DD') as "startsOn", to_char(ends_on, 'YYYY-MM-DD') as "endsOn" from promotions`;

/** Promotions that are switched on and inside their dates today. */
export const LIVE = `active and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date)`;

export async function promotionRoutes(app: FastifyInstance): Promise<void> {
  const manage = app.requirePerm('manage_promotions');

  // Tills read the live list on every sync and work out promotions locally, so selling works offline.
  app.get('/promotions', { preHandler: app.requirePerm('sell', 'manage_promotions') }, async (req) => {
    const all = (req.query as { all?: string }).all === '1' && req.auth.permissions.includes('manage_promotions');
    return (await app.pool.query(`${PROMO_SELECT}${all ? '' : ` where ${LIVE}`} order by created_at`)).rows;
  });

  app.post('/promotions', { preHandler: manage }, async (req, reply) => {
    const b = body.parse(req.body);
    const r = await app.pool.query(
      `insert into promotions (name, kind, product_ids, qty, price_cents, percent, active, starts_on, ends_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [b.name, b.kind, b.productIds, b.qty, b.priceCents ?? null, b.percent ?? null, b.active, b.startsOn ?? null, b.endsOn ?? null]);
    return reply.code(201).send((await app.pool.query(`${PROMO_SELECT} where id = $1`, [r.rows[0].id])).rows[0]);
  });

  app.put('/promotions/:id', { preHandler: manage }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = body.parse(req.body);
    const r = await app.pool.query(
      `update promotions set name=$2, kind=$3, product_ids=$4, qty=$5, price_cents=$6, percent=$7, active=$8, starts_on=$9, ends_on=$10 where id=$1 returning id`,
      [id, b.name, b.kind, b.productIds, b.qty, b.priceCents ?? null, b.percent ?? null, b.active, b.startsOn ?? null, b.endsOn ?? null]);
    if (!r.rows[0]) throw new HttpError(404, 'That promotion does not exist.');
    return (await app.pool.query(`${PROMO_SELECT} where id = $1`, [id])).rows[0];
  });

  app.delete('/promotions/:id', { preHandler: manage }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    // Old sales keep the promotion id for reports, so a promotion is switched off, not erased.
    const r = await app.pool.query('update promotions set active = false where id = $1 returning id', [id]);
    if (!r.rows[0]) throw new HttpError(404, 'That promotion does not exist.');
    return { ok: true };
  });
}
