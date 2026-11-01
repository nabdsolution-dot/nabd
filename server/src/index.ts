import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { seedBase } from './seed.js';
import { buildApp } from './app.js';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 16) {
  console.error('Set JWT_SECRET to a random string of at least 16 characters.');
  process.exit(1);
}
const pool = createPool();
await migrate(pool);
await seedBase(pool);
const app = await buildApp({ pool, jwtSecret: secret, corsOrigin: process.env.CORS_ORIGIN ?? true });
const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Nabd server listening on :${port}`);
