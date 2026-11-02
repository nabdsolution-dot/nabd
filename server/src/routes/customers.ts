import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../app.js';

const text = (n: number) => z.string().trim().max(n).nullable().optional();
const info = z.object({
  name: z.string().trim().min(1).max(100),
  phone: text(30), email: text(100), address: text(200), notes: text(300),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});
const SELECT = `
  select c.id, c.code, c.name, c.phone, c.email, c.address, c.notes, to_char(c.birthday, 'YYYY-MM-DD') as birthday,
         c.credit_limit_cents as "creditLimitCents", c.points, c.active,
         coalesce((select sum(l.amount_cents) from customer_ledger l where l.customer_id = c.id), 0)::int as "balanceCents"
    from customers c`;

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  const use = app.requirePerm('use_customers', 'manage_customers');
  const manage = app.requirePerm('manage_customers');
  const canManage = (req: { auth: { permissions: string[] } }) => req.auth.permissions.includes('manage_customers');

  async function load(id: string) {
    const c = (await app.pool.query(`${SELECT} where c.id = $1`, [id])).rows[0];
    if (!c) throw new HttpError(404, 'That customer was not found.');
    return c;
  }
  async function phoneFree(phone: string | null | undefined, except?: string) {
    if (!phone) return;
    const r = await app.pool.query('select id from customers where phone = $1 and ($2::uuid is null or id <> $2)', [phone, except ?? null]);
    if (r.rows[0]) throw new HttpError(409, 'A customer with that phone number already exists.');
  }

  app.get('/customers', { preHandler: use }, async (req) => {
    const q = z.object({ search: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(30), all: z.string().optional() }).parse(req.query);
    const args: unknown[] = [];
    const w: string[] = [];
    if (!(q.all === '1' && canManage(req))) w.push('c.active');
    if (q.search) { args.push('%' + q.search.replace(/[%_]/g, '') + '%'); w.push(`(c.name ilike $${args.length} or c.phone ilike $${args.length} or c.code ilike $${args.length})`); }
    args.push(q.limit);
    return (await app.pool.query(`${SELECT}${w.length ? ' where ' + w.join(' and ') : ''} order by c.name limit $${args.length}`, args)).rows;
  });

  app.get('/customers/:id', { preHandler: use }, async (req) => load(z.object({ id: z.string().uuid() }).parse(req.params).id));

  app.post('/customers', { preHandler: use }, async (req, reply) => {
    const b = info.extend({ creditLimitCents: z.number().int().min(0).max(100_000_000).optional() }).parse(req.body);
    if (b.creditLimitCents && !canManage(req)) throw new HttpError(403, 'Only a manager can give a credit limit.');
    await phoneFree(b.phone);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const r = await app.pool.query(
      `insert into customers (code, name, phone, email, address, notes, birthday, credit_limit_cents) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [code, b.name, b.phone || null, b.email || null, b.address || null, b.notes || null, b.birthday || null, b.creditLimitCents ?? 0]);
    return reply.code(201).send(await load(r.rows[0].id));
  });

  app.patch('/customers/:id', { preHandler: use }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = info.partial().extend({ creditLimitCents: z.number().int().min(0).max(100_000_000).optional(), active: z.boolean().optional() }).parse(req.body);
    if ((b.creditLimitCents !== undefined || b.active !== undefined) && !canManage(req)) throw new HttpError(403, 'Only a manager can change the credit limit or switch a customer off.');
    await load(id);
    if (b.phone !== undefined) await phoneFree(b.phone, id);
    const cols: Record<string, string> = { name: 'name', phone: 'phone', email: 'email', address: 'address', notes: 'notes', birthday: 'birthday', creditLimitCents: 'credit_limit_cents', active: 'active' };
    const sets: string[] = []; const args: unknown[] = [id];
    for (const [k, v] of Object.entries(b)) { args.push(v === '' ? null : v); sets.push(`${cols[k]} = $${args.length}`); }
    if (!sets.length) throw new HttpError(400, 'Nothing to change.');
    await app.pool.query(`update customers set ${sets.join(', ')}, updated_at = now() where id = $1`, args);
    return load(id);
  });

  // Money received against what the customer owes.
  app.post('/customers/:id/payments', { preHandler: use }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ amountCents: z.number().int().min(1).max(100_000_000), method: z.enum(['cash', 'card', 'transfer', 'other']).default('cash'), note: text(200) }).parse(req.body);
    await load(id);
    await app.pool.query(
      `insert into customer_ledger (customer_id, kind, amount_cents, store_id, user_id, method, note, ref) values ($1,'payment',$2,$3,$4,$5,$6,'Payment')`,
      [id, -b.amountCents, req.auth.storeId, req.auth.id, b.method, b.note || null]);
    return reply.code(201).send(await load(id));
  });

  app.post('/customers/:id/adjust', { preHandler: manage }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ amountCents: z.number().int().min(-100_000_000).max(100_000_000).default(0), points: z.number().int().min(-1_000_000).max(1_000_000).default(0), note: z.string().trim().min(3).max(200) }).parse(req.body);
    if (!b.amountCents && !b.points) throw new HttpError(400, 'Enter an amount or points to adjust.');
    const c = await load(id);
    if (c.points + b.points < 0) throw new HttpError(422, 'That would take the points below zero.');
    await app.pool.query('update customers set points = points + $2, updated_at = now() where id = $1', [id, b.points]);
    await app.pool.query(
      `insert into customer_ledger (customer_id, kind, amount_cents, points, store_id, user_id, note, ref) values ($1,'adjustment',$2,$3,$4,$5,$6,'Adjustment')`,
      [id, b.amountCents, b.points, req.auth.storeId, req.auth.id, b.note]);
    return reply.code(201).send(await load(id));
  });

  // The account statement: opening balance, every movement with a running balance, and the closing balance.
  app.get('/customers/:id/statement', { preHandler: use }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
    const customer = await load(id);
    const open = (await app.pool.query(
      `select coalesce(sum(amount_cents),0)::int as bal, coalesce(sum(points),0)::int as pts from customer_ledger where customer_id = $1 and ($2::date is not null and created_at < $2::date)`,
      [id, q.from ?? null])).rows[0];
    const rows = (await app.pool.query(
      `select l.id, l.created_at as "at", l.kind, l.ref, l.method, l.note, l.amount_cents as "amountCents", l.points, u.name as "by"
         from customer_ledger l left join users u on u.id = l.user_id
        where l.customer_id = $1 and ($2::date is null or l.created_at >= $2::date) and ($3::date is null or l.created_at < ($3::date + 1))
        order by l.created_at, l.id`, [id, q.from ?? null, q.to ?? null])).rows;
    let bal = open.bal as number; let pts = open.pts as number;
    const lines = rows.map((r) => { bal += r.amountCents; pts += r.points; return { ...r, balanceCents: bal, pointsBalance: pts }; });
    return { customer, from: q.from ?? null, to: q.to ?? null, openingCents: open.bal, openingPoints: open.pts, lines, closingCents: bal, closingPoints: pts };
  });
}
