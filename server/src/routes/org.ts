import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../app.js';
import { hashSecret } from '../auth.js';
import { PERMISSIONS, PERMISSION_LABELS } from '../permissions.js';

export const TZ = 'Asia/Beirut';
export const ONLINE_WINDOW = "interval '10 minutes'";

export async function orgRoutes(app: FastifyInstance): Promise<void> {
  const see = app.requirePerm('view_reports', 'manage_tills');

  app.get('/stores', { preHandler: see }, async () => {
    const r = await app.pool.query(`
      select s.id, s.code, s.name,
             (select count(*) from tills t where t.store_id = s.id)::int as tills,
             (select count(*) from tills t where t.store_id = s.id and t.last_sync_at > now() - ${ONLINE_WINDOW})::int as "tillsOnline",
             (select coalesce(sum(queued_sales), 0) from tills t where t.store_id = s.id)::int as waiting,
             (select coalesce(sum(total_cents), 0) from sales x
               where x.store_id = s.id and (x.sold_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date)::int as "salesTodayCents"
        from stores s order by s.name`);
    return r.rows;
  });

  // A till has to know its store before anyone can sign in, so this list is public (names and ids only).
  app.get('/public/stores', async () => {
    const stores = (await app.pool.query('select id, name from stores order by name')).rows;
    const tills = (await app.pool.query('select id, store_id, name from tills order by name')).rows;
    return stores.map((s) => ({ id: s.id, name: s.name, tills: tills.filter((t) => t.store_id === s.id).map((t) => ({ id: t.id, name: t.name })) }));
  });

  app.post('/stores', { preHandler: app.requirePerm('manage_tills') }, async (req, reply) => {
    const b = z.object({ code: z.string().trim().min(2).max(10).transform((s) => s.toUpperCase()), name: z.string().trim().min(1).max(80) }).parse(req.body);
    const r = await app.pool.query('insert into stores (code, name) values ($1, $2) returning id, code, name', [b.code, b.name]);
    return reply.code(201).send(r.rows[0]);
  });

  app.get('/tills', { preHandler: see }, async () => {
    const r = await app.pool.query(`
      select t.id, t.name, t.store_id as "storeId", s.name as store, t.app_version as "appVersion",
             t.last_sync_at as "lastSyncAt", t.queued_sales as "queuedSales",
             (t.last_sync_at is not null and t.last_sync_at > now() - ${ONLINE_WINDOW}) as online
        from tills t join stores s on s.id = t.store_id order by s.name, t.name`);
    return r.rows;
  });

  app.post('/tills', { preHandler: app.requirePerm('manage_tills') }, async (req, reply) => {
    const b = z.object({ storeId: z.string().uuid(), name: z.string().trim().min(1).max(60) }).parse(req.body);
    const r = await app.pool.query('insert into tills (store_id, name) values ($1, $2) returning id', [b.storeId, b.name]);
    return reply.code(201).send({ id: r.rows[0].id });
  });

  app.post('/tills/:id/heartbeat', { preHandler: app.requirePerm('sell') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ appVersion: z.string().max(20).optional(), queuedSales: z.number().int().min(0).default(0) }).parse(req.body ?? {});
    const r = await app.pool.query(
      'update tills set last_sync_at = now(), queued_sales = $2, app_version = coalesce($3, app_version) where id = $1 returning id',
      [id, b.queuedSales, b.appVersion ?? null]
    );
    if (!r.rows[0]) throw new HttpError(404, 'That till is not registered.');
    return { ok: true };
  });

  const manage = app.requirePerm('manage_users');

  app.get('/roles', { preHandler: app.requirePerm('manage_users', 'view_reports') }, async () => {
    const rows = (await app.pool.query('select role_id, permission, requires_pin from role_permissions')).rows;
    const roles = (await app.pool.query('select id, name from roles order by case id when \'cashier\' then 1 when \'supervisor\' then 2 when \'store_manager\' then 3 else 4 end')).rows;
    return {
      roles,
      permissions: PERMISSIONS.map((p) => ({
        permission: p,
        label: PERMISSION_LABELS[p],
        access: Object.fromEntries(roles.map((r) => {
          const hit = rows.find((x) => x.role_id === r.id && x.permission === p);
          return [r.id, hit ? (hit.requires_pin ? 'pin' : 'yes') : 'no'];
        }))
      }))
    };
  });

  const userSelect = `select u.id, u.name, u.email, u.role_id as "roleId", r.name as role, u.store_id as "storeId",
      coalesce(s.name, 'All stores') as store, u.active, u.last_active_at as "lastActiveAt",
      case when u.password_hash is not null and u.pin_hash is not null then 'Email and PIN'
           when u.password_hash is not null then 'Email and password' else 'PIN' end as signin
    from users u join roles r on r.id = u.role_id left join stores s on s.id = u.store_id`;

  app.get('/users', { preHandler: manage }, async () => (await app.pool.query(userSelect + ' order by u.name')).rows);

  const userBody = z.object({
    name: z.string().trim().min(1).max(80),
    email: z.string().email().nullable().optional(),
    roleId: z.string().min(1),
    storeId: z.string().uuid().nullable().optional(),
    password: z.string().min(8).max(100).optional(),
    pin: z.string().regex(/^\d{4,6}$/).optional(),
    active: z.boolean().optional()
  });

  app.post('/users', { preHandler: manage }, async (req, reply) => {
    const b = userBody.parse(req.body);
    if (!b.email && !b.pin) throw new HttpError(400, 'Give the user an email with a password, or a PIN.');
    if (b.email && !b.password) throw new HttpError(400, 'A user with an email needs a password.');
    const r = await app.pool.query(
      'insert into users (name, email, role_id, store_id, password_hash, pin_hash, active) values ($1,$2,$3,$4,$5,$6,$7) returning id',
      [b.name, b.email ?? null, b.roleId, b.storeId ?? null, b.password ? hashSecret(b.password) : null, b.pin ? hashSecret(b.pin) : null, b.active ?? true]
    );
    await app.pool.query('insert into audit_log (user_id, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5)', [req.auth.id, 'create', 'user', r.rows[0].id, JSON.stringify({ name: b.name, roleId: b.roleId })]);
    return reply.code(201).send((await app.pool.query(userSelect + ' where u.id = $1', [r.rows[0].id])).rows[0]);
  });

  app.patch('/users/:id', { preHandler: manage }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = userBody.partial().parse(req.body);
    if (id === req.auth.id && (b.active === false || (b.roleId && b.roleId !== req.auth.roleId))) {
      throw new HttpError(400, 'You cannot deactivate yourself or change your own role.');
    }
    const sets: string[] = [];
    const args: unknown[] = [];
    const add = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); };
    if (b.name !== undefined) add('name', b.name);
    if (b.email !== undefined) add('email', b.email);
    if (b.roleId !== undefined) add('role_id', b.roleId);
    if (b.storeId !== undefined) add('store_id', b.storeId);
    if (b.active !== undefined) add('active', b.active);
    if (b.password !== undefined) add('password_hash', hashSecret(b.password));
    if (b.pin !== undefined) add('pin_hash', hashSecret(b.pin));
    if (!sets.length) throw new HttpError(400, 'Nothing to change.');
    args.push(id);
    const r = await app.pool.query(`update users set ${sets.join(', ')} where id = $${args.length} returning id`, args);
    if (!r.rows[0]) throw new HttpError(404, 'That user does not exist.');
    await app.pool.query('insert into audit_log (user_id, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5)', [req.auth.id, 'update', 'user', id, JSON.stringify({ ...b, password: b.password ? '***' : undefined, pin: b.pin ? '***' : undefined })]);
    return (await app.pool.query(userSelect + ' where u.id = $1', [id])).rows[0];
  });
}
