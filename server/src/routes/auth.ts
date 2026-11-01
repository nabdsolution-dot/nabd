import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifySecret } from '../auth.js';

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

  app.get('/me', { preHandler: app.authenticate }, async (req) => req.auth);
}
