import type { FastifyInstance } from 'fastify';
import type { Pool } from '../db.js';
import { z } from 'zod';
import { HttpError } from '../app.js';

interface Expected { usdCents: number; lbp: number; cardCents: number }

/** What the drawer should hold: opening float plus cash sales, minus cash refunds, for this till since the shift opened. */
async function expectedFor(pool: Pool, shift: { till_id: string; opened_at: Date; float_usd_cents: number }, until: Date): Promise<Expected> {
  const args = [shift.till_id, shift.opened_at, until];
  const sales = (await pool.query(
    `select tender, coalesce(sum(total_cents),0)::bigint as cents, coalesce(sum(round(total_cents::numeric * lbp_rate / 100)),0)::bigint as lbp
       from sales where till_id = $1 and sold_at >= $2 and sold_at <= $3 group by tender`, args)).rows;
  const refunds = (await pool.query(
    `select tender, coalesce(sum(refund_cents),0)::bigint as cents, coalesce(sum(round(refund_cents::numeric * lbp_rate / 100)),0)::bigint as lbp
       from returns where till_id = $1 and returned_at >= $2 and returned_at <= $3 group by tender`, args)).rows;
  const pick = (rows: { tender: string; cents: string; lbp: string }[], t: string, f: 'cents' | 'lbp') => Number(rows.find((r) => r.tender === t)?.[f] ?? 0);
  return {
    usdCents: shift.float_usd_cents + pick(sales, 'usd', 'cents') - pick(refunds, 'usd', 'cents'),
    lbp: pick(sales, 'lbp', 'lbp') - pick(refunds, 'lbp', 'lbp'),
    cardCents: pick(sales, 'card', 'cents') - pick(refunds, 'card', 'cents')
  };
}

export async function shiftRoutes(app: FastifyInstance): Promise<void> {
  app.post('/shifts/open', { preHandler: app.requirePerm('sell') }, async (req, reply) => {
    const b = z.object({ tillId: z.string().uuid(), floatUsdCents: z.number().int().min(0).default(0) }).parse(req.body);
    const till = (await app.pool.query('select id, store_id from tills where id = $1', [b.tillId])).rows[0];
    if (!till) throw new HttpError(404, 'That till is not registered.');
    if (req.auth.storeId && req.auth.storeId !== till.store_id) throw new HttpError(403, 'That till belongs to another store.');
    const open = (await app.pool.query('select id, cashier_id from shifts where till_id = $1 and closed_at is null', [b.tillId])).rows[0];
    if (open) throw new HttpError(409, 'A shift is already open on this till.');
    const r = await app.pool.query(
      'insert into shifts (store_id, till_id, cashier_id, float_usd_cents) values ($1,$2,$3,$4) returning id, opened_at as "openedAt"',
      [till.store_id, b.tillId, req.auth.id, b.floatUsdCents]);
    return reply.code(201).send(r.rows[0]);
  });

  app.get('/shifts/current', { preHandler: app.requirePerm('sell') }, async (req) => {
    const q = z.object({ tillId: z.string().uuid() }).parse(req.query);
    const s = (await app.pool.query(
      `select s.id, s.till_id, s.opened_at, s.float_usd_cents, s.cashier_id, u.name as cashier
         from shifts s join users u on u.id = s.cashier_id where s.till_id = $1 and s.closed_at is null`, [q.tillId])).rows[0];
    if (!s) return { open: false };
    const e = await expectedFor(app.pool, s, new Date());
    return { open: true, id: s.id, openedAt: s.opened_at, cashier: s.cashier, floatUsdCents: s.float_usd_cents, expected: e };
  });

  app.post('/shifts/:id/close', { preHandler: app.requirePerm('sell') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({
      countedUsdCents: z.number().int().min(0),
      countedLbp: z.number().int().min(0),
      countedCardCents: z.number().int().min(0),
      note: z.string().trim().max(300).optional()
    }).parse(req.body);
    const s = (await app.pool.query('select * from shifts where id = $1', [id])).rows[0];
    if (!s) throw new HttpError(404, 'That shift was not found.');
    if (s.closed_at) throw new HttpError(409, 'That shift is already closed.');
    if (s.cashier_id !== req.auth.id && !req.auth.permissions.includes('close_other_shift')) {
      throw new HttpError(403, "Only the cashier who opened the shift, or a supervisor, can close it.");
    }
    const now = new Date();
    const e = await expectedFor(app.pool, s, now);
    const differs = b.countedUsdCents !== e.usdCents || b.countedLbp !== e.lbp || b.countedCardCents !== e.cardCents;
    if (differs && !b.note) throw new HttpError(422, 'The drawer does not match. Add a note before closing.');
    await app.pool.query(
      `update shifts set closed_at = $2, closed_by = $3, expected_usd_cents = $4, expected_lbp = $5, expected_card_cents = $6,
              counted_usd_cents = $7, counted_lbp = $8, counted_card_cents = $9, note = $10 where id = $1`,
      [id, now, req.auth.id, e.usdCents, e.lbp, e.cardCents, b.countedUsdCents, b.countedLbp, b.countedCardCents, b.note ?? null]);
    return {
      id, expected: e,
      counted: { usdCents: b.countedUsdCents, lbp: b.countedLbp, cardCents: b.countedCardCents },
      difference: { usdCents: b.countedUsdCents - e.usdCents, lbp: b.countedLbp - e.lbp, cardCents: b.countedCardCents - e.cardCents }
    };
  });

  app.get('/shifts', { preHandler: app.requirePerm('view_reports') }, async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    const r = await app.pool.query(
      `select s.id, st.name as store, t.name as till, u.name as cashier, s.opened_at as "openedAt", s.closed_at as "closedAt", s.note,
              s.expected_usd_cents as "expectedUsdCents", s.counted_usd_cents as "countedUsdCents",
              s.expected_lbp as "expectedLbp", s.counted_lbp as "countedLbp",
              s.expected_card_cents as "expectedCardCents", s.counted_card_cents as "countedCardCents"
         from shifts s join stores st on st.id = s.store_id join tills t on t.id = s.till_id join users u on u.id = s.cashier_id
        order by s.opened_at desc limit $1`, [q.limit]);
    return r.rows.map((x) => ({
      ...x,
      expectedLbp: x.expectedLbp === null ? null : Number(x.expectedLbp),
      countedLbp: x.countedLbp === null ? null : Number(x.countedLbp),
      closed: x.closedAt !== null,
      matches: x.closedAt !== null && x.expectedUsdCents === x.countedUsdCents && Number(x.expectedLbp) === Number(x.countedLbp) && x.expectedCardCents === x.countedCardCents
    }));
  });
}
