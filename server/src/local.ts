import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { seedBase, seedDemo } from './seed.js';
import { buildApp } from './app.js';

/**
 * Everything on one address for a single computer: the API under /api, the back office and the web till as pages.
 * Needs only Node.js. Data lives in the ./data folder.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.NABD_DATA ?? join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const pool = createPool(process.env.DATABASE_URL ?? 'pglite:' + join(dataDir, 'db'));
await migrate(pool);
await seedBase(pool);
if (process.env.NABD_EMPTY !== '1' && !(await pool.query('select 1 from users limit 1')).rowCount) {
  await seedDemo(pool);
  console.log('Demo data loaded (stores, products, users).');
}

const secretFile = join(dataDir, 'jwt.secret');
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('hex'));
const jwtSecret = readFileSync(secretFile, 'utf8').trim();

const web = join(root, '..', 'backoffice', 'dist');
if (!existsSync(join(web, 'index.html'))) {
  console.error('The web app is not built yet. Run: cd backoffice && npm install && npm run build');
  process.exit(1);
}

const app = await buildApp({
  pool,
  jwtSecret,
  rewriteUrl: (url) => {
    if (url.startsWith('/api/')) return url.slice(4);
    const path = url.split('?')[0]!;
    if (path.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(path)) return url; // a real file
    return '/index.html'; // any page route: the web app decides what to show
  }
});
await app.register(fastifyStatic, { root: web });

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
console.log(`\nNabd is running.\n  Back office: http://localhost:${port}/\n  Web till:    http://localhost:${port}/till\n  Sign in:     admin@nabd.local / ChangeMe123!   (till PIN 4321)\n`);
