import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashSecret, verifySecret } from '../auth.js';
import { HttpError } from '../app.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const r = await app.pool.query('select id, password_hash, active from users where lower(email) = lower($1)', [body.email]);
    const u = r.rows[0];
    const ok = u && u.active && verifySecret(body.password, u.password_hash);
    if (!ok) return reply.code(401).send({ error: 'The email or password is not right.' });
    const token = app.jwt.sign({ sub: u.id });
    return { token };
  });

  // Till sign-in with a PIN, scoped to a store.
  app.post('/auth/pin', async (req, reply) => {
    const body = z.object({ storeId: z.string().uuid(), pin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
    const r = await app.pool.query('select id, pin_hash from users where store_id = $1 and active and pin_hash is not null', [body.storeId]);
    const u = r.rows.find((x) => verifySecret(body.pin, x.pin_hash));
    if (!u) return reply.code(401).send({ error: 'That PIN is not right.' });
    return { token: app.jwt.sign({ sub: u.id }) };
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const r = await app.pool.query(
      `select s.name as "storeName", ro.name as "roleName", u.email
         from users u left join stores s on s.id = u.store_id left join roles ro on ro.id = u.role_id where u.id = $1`, [req.auth.id]);
    return { ...req.auth, ...(r.rows[0] ?? {}) };
  });

  // A signed-in user changes their own till PIN. PINs must stay unique within a store, because the till finds the user by PIN.
  app.post('/me/pin', { preHandler: app.authenticate }, async (req) => {
    const b = z.object({ currentPin: z.string().regex(/^\d{4,6}$/), newPin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
    const me = (await app.pool.query('select pin_hash, store_id from users where id = $1', [req.auth.id])).rows[0];
    if (!me?.pin_hash || !verifySecret(b.currentPin, me.pin_hash)) throw new HttpError(403, 'The current PIN is not right.');
    if (b.newPin === b.currentPin) throw new HttpError(422, 'Choose a different PIN.');
    const others = (await app.pool.query('select pin_hash from users where store_id is not distinct from $1 and id <> $2 and pin_hash is not null', [me.store_id, req.auth.id])).rows;
    if (others.some((o) => verifySecret(b.newPin, o.pin_hash))) throw new HttpError(409, 'Another person in this store already uses that PIN.');
    await app.pool.query('update users set pin_hash = $2 where id = $1', [req.auth.id, hashSecret(b.newPin)]);
    return { ok: true };
  });
}
