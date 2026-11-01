import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { ZodError } from 'zod';
import type { Pool } from './db.js';
import type { Permission } from './permissions.js';
import { authRoutes } from './routes/auth.js';
import { productRoutes } from './routes/products.js';
import { orgRoutes } from './routes/org.js';
import { salesRoutes } from './routes/sales.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { returnRoutes } from './routes/returns.js';
import { shiftRoutes } from './routes/shifts.js';

export interface AuthUser {
  id: string;
  name: string;
  roleId: string;
  storeId: string | null;
  permissions: Permission[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthUser;
  }
  interface FastifyInstance {
    pool: Pool;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePerm: (...perms: Permission[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AppOptions {
  pool: Pool;
  jwtSecret: string;
  corsOrigin?: string | boolean;
  /** Optional URL rewrite, used by the single-port local build to map /api/... to the routes. */
  rewriteUrl?: (url: string) => string;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, rewriteUrl: opts.rewriteUrl ? (req) => opts.rewriteUrl!(req.url ?? '/') : undefined });
  await app.register(cors, { origin: opts.corsOrigin ?? true });
  await app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: '12h' } });
  app.decorate('pool', opts.pool);

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    let payload: { sub: string };
    try {
      payload = await req.jwtVerify<{ sub: string }>();
    } catch {
      return reply.code(401).send({ error: 'Sign in again: your session is missing or expired.' });
    }
    const u = await opts.pool.query(
      `select u.id, u.name, u.role_id, u.store_id, u.active,
              coalesce(array_agg(rp.permission) filter (where rp.permission is not null), '{}') as perms
         from users u left join role_permissions rp on rp.role_id = u.role_id
        where u.id = $1 group by u.id`,
      [payload.sub]
    );
    const row = u.rows[0];
    if (!row || !row.active) return reply.code(401).send({ error: 'This account is not active.' });
    req.auth = { id: row.id, name: row.name, roleId: row.role_id, storeId: row.store_id, permissions: row.perms };
    opts.pool.query('update users set last_active_at = now() where id = $1', [row.id]).catch(() => undefined);
  });

  app.decorate('requirePerm', (...perms: Permission[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (reply.sent) return;
    if (!perms.some((p) => req.auth.permissions.includes(p))) {
      return reply.code(403).send({ error: 'Your role does not allow this action.' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Check the highlighted fields.', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    const code = (err as { code?: string }).code;
    if (code === '23505') return reply.code(409).send({ error: 'That value already exists.' });
    if (code === '23503') return reply.code(409).send({ error: 'That item is still in use.' });
    if (code === '22P02') return reply.code(400).send({ error: 'A value has the wrong format.' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    console.error(err);
    return reply.code(500).send({ error: 'Something went wrong on the server.' });
  });

  app.get('/health', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(productRoutes);
  await app.register(orgRoutes);
  await app.register(salesRoutes);
  await app.register(dashboardRoutes);
  await app.register(returnRoutes);
  await app.register(shiftRoutes);
  return app;
}
