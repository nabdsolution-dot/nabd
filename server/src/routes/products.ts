import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../app.js';

const productBody = z.object({
  name: z.string().trim().min(1).max(120),
  barcode: z.string().trim().min(1).max(40).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_00),
  vatBp: z.number().int().min(0).max(10000).default(1100),
  reorderLevel: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  image: z.string().max(150000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).nullable().optional()
});

const select = `
  select p.id, p.name, p.barcode, p.category_id as "categoryId", c.name as category,
         p.price_cents as "priceCents", p.vat_bp as "vatBp", p.reorder_level as "reorderLevel", p.active, p.image,
         coalesce((select sum(qty) from stock s where s.product_id = p.id), 0)::int as stock
    from products p left join categories c on c.id = p.category_id`;

export async function productRoutes(app: FastifyInstance): Promise<void> {
  const view = app.requirePerm('view_reports', 'manage_products', 'manage_prices', 'sell');

  app.get('/categories', { preHandler: view }, async () => (await app.pool.query('select id, name from categories order by name')).rows);

  app.post('/categories', { preHandler: app.requirePerm('manage_products') }, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    const r = await app.pool.query('insert into categories (name) values ($1) returning id, name', [name]);
    return reply.code(201).send(r.rows[0]);
  });

  app.get('/products', { preHandler: view }, async (req) => {
    const q = z.object({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(25)
    }).parse(req.query);
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.search) { args.push('%' + q.search.replace(/[%_]/g, '') + '%'); where.push(`(p.name ilike $${args.length} or p.barcode ilike $${args.length})`); }
    if (q.categoryId) { args.push(q.categoryId); where.push(`p.category_id = $${args.length}`); }
    const w = where.length ? ' where ' + where.join(' and ') : '';
    const total = (await app.pool.query('select count(*)::int as n from products p' + w, args)).rows[0].n as number;
    args.push(q.limit, (q.page - 1) * q.limit);
    const rows = (await app.pool.query(`${select}${w} order by p.name limit $${args.length - 1} offset $${args.length}`, args)).rows;
    return { items: rows, total, page: q.page, limit: q.limit };
  });

  app.get('/products/:id', { preHandler: view }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await app.pool.query(`${select} where p.id = $1`, [id]);
    if (!r.rows[0]) throw new HttpError(404, 'That product does not exist.');
    return r.rows[0];
  });

  app.post('/products', { preHandler: app.requirePerm('manage_products') }, async (req, reply) => {
    const b = productBody.parse(req.body);
    const r = await app.pool.query(
      'insert into products (name, barcode, category_id, price_cents, vat_bp, reorder_level, active, image) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [b.name, b.barcode ?? null, b.categoryId ?? null, b.priceCents, b.vatBp, b.reorderLevel, b.active, b.image ?? null]
    );
    await app.pool.query('insert into audit_log (user_id, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5)', [req.auth.id, 'create', 'product', r.rows[0].id, JSON.stringify({ ...b, image: b.image ? '(picture)' : null })]);
    return reply.code(201).send((await app.pool.query(`${select} where p.id = $1`, [r.rows[0].id])).rows[0]);
  });

  app.patch('/products/:id', { preHandler: app.requirePerm('manage_products', 'manage_prices') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = productBody.partial().parse(req.body);
    const canProducts = req.auth.permissions.includes('manage_products');
    const canPrices = req.auth.permissions.includes('manage_prices');
    const keys = Object.keys(b) as (keyof typeof b)[];
    const priceOnly = keys.every((k) => k === 'priceCents');
    if (!canProducts && !(canPrices && priceOnly)) throw new HttpError(403, 'Your role can change prices only.');
    if (b.priceCents !== undefined && !canPrices) throw new HttpError(403, 'Your role does not allow price changes.');
    const cols: Record<string, string> = { name: 'name', barcode: 'barcode', categoryId: 'category_id', priceCents: 'price_cents', vatBp: 'vat_bp', reorderLevel: 'reorder_level', active: 'active', image: 'image' };
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const k of keys) {
      args.push(b[k] === undefined ? null : b[k]);
      sets.push(`${cols[k]} = $${args.length}`);
    }
    if (!sets.length) throw new HttpError(400, 'Nothing to change.');
    args.push(id);
    const r = await app.pool.query(`update products set ${sets.join(', ')}, updated_at = now() where id = $${args.length} returning id`, args);
    if (!r.rows[0]) throw new HttpError(404, 'That product does not exist.');
    await app.pool.query('insert into audit_log (user_id, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5)', [req.auth.id, 'update', 'product', id, JSON.stringify({ ...b, image: b.image ? '(picture)' : b.image })]);
    return (await app.pool.query(`${select} where p.id = $1`, [id])).rows[0];
  });

  const loyaltySettings = async () => {
    const r = await app.pool.query("select key, value from settings where key like 'loyalty_%'");
    const m = new Map(r.rows.map((x) => [x.key as string, x.value as string]));
    return {
      enabled: (m.get('loyalty_enabled') ?? '1') === '1',
      earnPerUsd: Number(m.get('loyalty_earn_per_usd') ?? 1),
      pointValueCents: Number(m.get('loyalty_point_value_cents') ?? 1)
    };
  };

  app.get('/settings', { preHandler: app.authenticate }, async () => {
    const r = await app.pool.query("select value from settings where key = 'lbp_rate'");
    return { lbpRate: Number(r.rows[0]?.value ?? 89500), loyalty: await loyaltySettings() };
  });

  app.put('/settings/loyalty', { preHandler: app.requirePerm('manage_promotions') }, async (req) => {
    const b = z.object({ enabled: z.boolean(), earnPerUsd: z.number().min(0).max(1000), pointValueCents: z.number().int().min(1).max(10000) }).parse(req.body);
    const set = (k: string, v: string) => app.pool.query('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [k, v]);
    await set('loyalty_enabled', b.enabled ? '1' : '0');
    await set('loyalty_earn_per_usd', String(b.earnPerUsd));
    await set('loyalty_point_value_cents', String(b.pointValueCents));
    return loyaltySettings();
  });

  app.put('/settings/lbp-rate', { preHandler: app.requirePerm('manage_prices') }, async (req) => {
    const { lbpRate } = z.object({ lbpRate: z.number().int().min(1000).max(10_000_000) }).parse(req.body);
    await app.pool.query("insert into settings (key, value) values ('lbp_rate', $1) on conflict (key) do update set value = excluded.value", [String(lbpRate)]);
    await app.pool.query('insert into audit_log (user_id, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5)', [req.auth.id, 'update', 'setting', 'lbp_rate', JSON.stringify({ lbpRate })]);
    return { lbpRate };
  });
}
