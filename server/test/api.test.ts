import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createPool, type Pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seedDemo } from '../src/seed.js';
import { buildApp } from '../src/app.js';

const DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/nabd_test';
let pool: Pool;
let app: FastifyInstance;
let admin = '';
let manager = '';
let cashier = '';
let hamra = '';
let register1 = '';

const auth = (t: string) => ({ authorization: 'Bearer ' + t });
async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, token?: string, payload?: unknown) {
  const res = await app.inject({ method, url, headers: token ? auth(token) : {}, payload: payload as object | undefined });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

beforeAll(async () => {
  pool = createPool(DB);
  await pool.query('drop schema public cascade; create schema public;');
  await migrate(pool);
  await seedDemo(pool);
  app = await buildApp({ pool, jwtSecret: 'test-secret-test-secret' });
  admin = (await call('POST', '/auth/login', undefined, { email: 'admin@nabd.local', password: 'ChangeMe123!' })).body.token;
  manager = (await call('POST', '/auth/login', undefined, { email: 'dina@nabd.local', password: 'ChangeMe123!' })).body.token;
  hamra = (await pool.query("select id from stores where code = 'HAM'")).rows[0].id;
  register1 = (await pool.query("select id from tills where store_id = $1 and name = 'Register 1'", [hamra])).rows[0].id;
  cashier = (await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '4321' })).body.token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('sign in', () => {
  it('rejects a wrong password with a plain message', async () => {
    const r = await call('POST', '/auth/login', undefined, { email: 'admin@nabd.local', password: 'nope' });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/not right/);
  });
  it('signs a cashier in with a PIN and rejects a wrong PIN', async () => {
    expect(cashier).toBeTruthy();
    const r = await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '9999' });
    expect(r.status).toBe(401);
  });
  it('requires a token', async () => {
    expect((await call('GET', '/products')).status).toBe(401);
  });
  it('returns the current user with permissions', async () => {
    const r = await call('GET', '/me', cashier);
    expect(r.body.roleId).toBe('cashier');
    expect(r.body.permissions).toContain('sell');
    expect(r.body.permissions).not.toContain('manage_users');
  });
});

describe('roles and users', () => {
  it('shows the permission matrix with Yes, No and PIN', async () => {
    const r = await call('GET', '/roles', admin);
    const ret = r.body.permissions.find((p: { permission: string }) => p.permission === 'process_return');
    expect(ret.access.cashier).toBe('pin');
    expect(ret.access.supervisor).toBe('yes');
    const users = r.body.permissions.find((p: { permission: string }) => p.permission === 'manage_users');
    expect(users.access.store_manager).toBe('no');
  });
  it('blocks a cashier and a manager from managing users', async () => {
    expect((await call('GET', '/users', cashier)).status).toBe(403);
    expect((await call('GET', '/users', manager)).status).toBe(403);
  });
  it('creates, edits and deactivates a user, and protects the signed-in admin', async () => {
    const c = await call('POST', '/users', admin, { name: 'Layal H.', roleId: 'cashier', storeId: hamra, pin: '5555' });
    expect(c.status).toBe(201);
    expect(c.body.signin).toBe('PIN');
    const p = await call('PATCH', '/users/' + c.body.id, admin, { active: false });
    expect(p.body.active).toBe(false);
    expect((await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '5555' })).status).toBe(401);
    const me = (await call('GET', '/me', admin)).body.id;
    expect((await call('PATCH', '/users/' + me, admin, { active: false })).status).toBe(400);
  });
  it('requires a password for an email user', async () => {
    const r = await call('POST', '/users', admin, { name: 'X', email: 'x@nabd.local', roleId: 'supervisor' });
    expect(r.status).toBe(400);
  });
});

describe('products', () => {
  it('lists with search and category filter and total stock', async () => {
    const all = await call('GET', '/products', manager);
    expect(all.body.total).toBe(12);
    const s = await call('GET', '/products?search=halloumi', manager);
    expect(s.body.items).toHaveLength(1);
    expect(s.body.items[0].stock).toBeGreaterThan(0);
  });
  it('lets a manager change a price and records it', async () => {
    const p = (await call('GET', '/products?search=croissant', manager)).body.items[0];
    const r = await call('PATCH', '/products/' + p.id, manager, { priceCents: 240 });
    expect(r.body.priceCents).toBe(240);
    const log = await pool.query("select * from audit_log where entity = 'product' and entity_id = $1", [p.id]);
    expect(log.rowCount).toBe(1);
  });
  it('stops a cashier changing a product', async () => {
    const p = (await call('GET', '/products?search=jallab', manager)).body.items[0];
    expect((await call('PATCH', '/products/' + p.id, cashier, { priceCents: 1 })).status).toBe(403);
  });
  it('rejects a duplicate barcode and a bad price', async () => {
    const dup = await call('POST', '/products', admin, { name: 'Copy', barcode: '6111113000024', priceCents: 100 });
    expect(dup.status).toBe(409);
    const bad = await call('POST', '/products', admin, { name: 'Bad', priceCents: -5 });
    expect(bad.status).toBe(400);
  });
  it('reads and changes the LBP rate', async () => {
    expect((await call('GET', '/settings', cashier)).body.lbpRate).toBe(89500);
    expect((await call('PUT', '/settings/lbp-rate', cashier, { lbpRate: 90000 })).status).toBe(403);
    expect((await call('PUT', '/settings/lbp-rate', admin, { lbpRate: 90000 })).body.lbpRate).toBe(90000);
    await call('PUT', '/settings/lbp-rate', admin, { lbpRate: 89500 });
  });
});

describe('sales upload', () => {
  async function two() {
    const items = (await call('GET', '/products?limit=200', manager)).body.items as { id: string; name: string; priceCents: number }[];
    return { cm: items.find((i) => i.name === 'Cheese manousheh')!, jl: items.find((i) => i.name === 'Jallab')! };
  }
  it('stores a sale, computes VAT and takes stock', async () => {
    const { cm, jl } = await two();
    const before = (await call('GET', '/products/' + cm.id, manager)).body.stock;
    const id = randomUUID();
    const r = await call('POST', '/sales', cashier, {
      id, storeId: hamra, tillId: register1, receiptNo: 'R1-0001', soldAt: new Date().toISOString(), tender: 'usd',
      lines: [{ productId: cm.id, qty: 2 }, { productId: jl.id, qty: 1 }]
    });
    expect(r.status).toBe(201);
    expect(r.body.totalCents).toBe(Math.round(700 * 1.11));
    expect((await call('GET', '/products/' + cm.id, manager)).body.stock).toBe(before - 2);
  });
  it('is idempotent: a retried upload does not double count', async () => {
    const { cm } = await two();
    const payload = { id: randomUUID(), storeId: hamra, receiptNo: 'R1-0002', soldAt: new Date().toISOString(), tender: 'card', lines: [{ productId: cm.id, qty: 1 }] };
    const stockBefore = (await call('GET', '/products/' + cm.id, manager)).body.stock;
    const a = await call('POST', '/sales', cashier, payload);
    const b = await call('POST', '/sales', cashier, payload);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.duplicate).toBe(true);
    expect((await call('GET', '/products/' + cm.id, manager)).body.stock).toBe(stockBefore - 1);
  });
  it('blocks a cashier discount over 5% and an unknown product, and leaves stock alone', async () => {
    const { cm } = await two();
    const before = (await call('GET', '/products/' + cm.id, manager)).body.stock;
    const d = await call('POST', '/sales', cashier, { id: randomUUID(), storeId: hamra, receiptNo: 'R1-0003', soldAt: new Date().toISOString(), tender: 'usd', discountCents: 100, lines: [{ productId: cm.id, qty: 1 }] });
    expect(d.status).toBe(403);
    const u = await call('POST', '/sales', cashier, { id: randomUUID(), storeId: hamra, receiptNo: 'R1-0004', soldAt: new Date().toISOString(), tender: 'usd', lines: [{ productId: randomUUID(), qty: 1 }] });
    expect(u.status).toBe(422);
    expect((await call('GET', '/products/' + cm.id, manager)).body.stock).toBe(before);
  });
  it('rejects an empty sale and a duplicate receipt number', async () => {
    const { cm } = await two();
    expect((await call('POST', '/sales', cashier, { id: randomUUID(), storeId: hamra, receiptNo: 'R1-0005', soldAt: new Date().toISOString(), tender: 'usd', lines: [] })).status).toBe(400);
    const dup = await call('POST', '/sales', cashier, { id: randomUUID(), storeId: hamra, receiptNo: 'R1-0001', soldAt: new Date().toISOString(), tender: 'usd', lines: [{ productId: cm.id, qty: 1 }] });
    expect(dup.status).toBe(409);
  });
});

describe('stores, tills and dashboard', () => {
  it('marks a till online after a heartbeat and counts waiting sales', async () => {
    const hb = await call('POST', `/tills/${register1}/heartbeat`, cashier, { appVersion: '1.4.2', queuedSales: 3 });
    expect(hb.status).toBe(200);
    const tills = (await call('GET', '/tills', manager)).body as { id: string; online: boolean; queuedSales: number }[];
    const t = tills.find((x) => x.id === register1)!;
    expect(t.online).toBe(true);
    expect(t.queuedSales).toBe(3);
    expect(tills.filter((x) => !x.online).length).toBe(8);
  });
  it('summarises stores with sales today', async () => {
    const stores = (await call('GET', '/stores', manager)).body as { name: string; salesTodayCents: number; tillsOnline: number; waiting: number }[];
    const h = stores.find((s) => s.name === 'Hamra')!;
    expect(h.salesTodayCents).toBeGreaterThan(0);
    expect(h.tillsOnline).toBe(1);
    expect(h.waiting).toBe(3);
  });
  it('builds the dashboard from uploaded sales', async () => {
    const d = (await call('GET', '/dashboard', manager)).body;
    expect(d.transactions).toBe(2);
    expect(d.salesCents).toBe(Math.round(700 * 1.11) + Math.round(250 * 1.11));
    expect(d.averageBasketCents).toBe(Math.round(d.salesCents / 2));
    expect(d.top[0].name).toBe('Cheese manousheh');
    expect(d.hourly.reduce((a: number, h: { cents: number }) => a + h.cents, 0)).toBe(d.salesCents);
    expect(d.tillsOnline).toBe(1);
    expect(d.alerts.some((a: { kind: string }) => a.kind === 'till_offline')).toBe(true);
  });
  it('raises a low stock alert when stock falls to the reorder level', async () => {
    const p = (await call('GET', '/products?search=halloumi', manager)).body.items[0];
    await pool.query('update stock set qty = 6 where product_id = $1 and store_id = $2', [p.id, hamra]);
    const d = (await call('GET', '/dashboard', manager)).body;
    expect(d.alerts.some((a: { title: string }) => a.title.startsWith('Halloumi 200 g is low at Hamra'))).toBe(true);
  });
  it('keeps the dashboard away from cashiers', async () => {
    expect((await call('GET', '/dashboard', cashier)).status).toBe(403);
  });
});

describe('product pictures and app version', () => {
  const dot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  it('saves a picture on a product and returns it to the tills', async () => {
    const list = await call('GET', '/products?limit=1', cashier);
    const id = list.body.items[0].id as string;
    const r = await call('PATCH', '/products/' + id, admin, { image: dot });
    expect(r.status).toBe(200);
    expect(r.body.image).toBe(dot);
    const again = await call('GET', '/products?limit=200', cashier);
    expect(again.body.items.find((p: { id: string }) => p.id === id).image).toBe(dot);
    expect((await call('PATCH', '/products/' + id, admin, { image: null })).body.image).toBeNull();
  });
  it('rejects something that is not a picture', async () => {
    const id = (await call('GET', '/products?limit=1', admin)).body.items[0].id as string;
    expect((await call('PATCH', '/products/' + id, admin, { image: 'http://evil.example/x.png' })).status).toBe(400);
  });
  it('reads the newest release from GitHub when nothing is set by hand', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ tag_name: 'v9.8.7', body: 'x', assets: [{ name: 'nabd-cashier.apk', browser_download_url: 'https://example.test/a.apk' }] }))) as typeof fetch;
    try {
      const r = await call('GET', '/app/version');
      expect(r.body.latest).toBe('9.8.7');
      expect(r.body.url).toBe('https://example.test/a.apk');
    } finally { globalThis.fetch = real; }
  });
  it('shows the newest app version without signing in', async () => {
    const r = await call('GET', '/app/version');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('latest');
  });
});

describe('profile', () => {
  it('shows store and role names, and lets a cashier change their PIN', async () => {
    const me = await call('GET', '/me', cashier);
    expect(me.body.storeName).toBe('Hamra');
    expect(me.body.roleName).toBeTruthy();
    expect((await call('POST', '/me/pin', cashier, { currentPin: '0000', newPin: '6666' })).status).toBe(403);
    expect((await call('POST', '/me/pin', cashier, { currentPin: '4321', newPin: '1234' })).status).toBe(409);
    expect((await call('POST', '/me/pin', cashier, { currentPin: '4321', newPin: '6666' })).status).toBe(200);
    expect((await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '6666' })).status).toBe(200);
    expect((await call('POST', '/me/pin', cashier, { currentPin: '6666', newPin: '4321' })).status).toBe(200);
  });
});
