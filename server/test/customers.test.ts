import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createPool, type Pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seedDemo } from '../src/seed.js';
import { buildApp } from '../src/app.js';
import { applyPromos, type Promo } from '../src/promo.js';

const DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/nabd_test';
let pool: Pool; let app: FastifyInstance;
let admin = ''; let cashier = ''; let hamra = ''; let register1 = '';
let maya = ''; let georges = ''; let cheese = ''; let zaatar = ''; let latte = '';

const auth = (t: string) => ({ authorization: 'Bearer ' + t });
async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown) {
  const res = await app.inject({ method, url, headers: token ? auth(token) : {}, payload: payload as object | undefined });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}
const sale = (over: Record<string, unknown>) => ({
  id: randomUUID(), storeId: hamra, tillId: register1, receiptNo: 'T-' + Math.random().toString(36).slice(2, 8),
  soldAt: new Date().toISOString(), tender: 'usd', ...over
});

beforeAll(async () => {
  pool = createPool(DB);
  await pool.query('drop schema public cascade; create schema public;');
  await migrate(pool); await seedDemo(pool);
  app = await buildApp({ pool, jwtSecret: 'test-secret-test-secret' });
  admin = (await call('POST', '/auth/login', undefined, { email: 'admin@nabd.local', password: 'ChangeMe123!' })).body.token;
  hamra = (await pool.query("select id from stores where code = 'HAM'")).rows[0].id;
  register1 = (await pool.query("select id from tills where store_id = $1 and name = 'Register 1'", [hamra])).rows[0].id;
  cashier = (await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '4321' })).body.token;
  maya = (await pool.query("select id from customers where name = 'Maya Khoury'")).rows[0].id;
  georges = (await pool.query("select id from customers where name = 'Georges Haddad'")).rows[0].id;
  const pid = async (n: string) => (await pool.query('select id from products where name = $1', [n])).rows[0].id as string;
  cheese = await pid('Cheese manousheh'); zaatar = await pid('Zaatar manousheh'); latte = await pid('Iced latte');
});
afterAll(async () => { await app.close(); await pool.end(); });

describe('promotion engine', () => {
  const bundle: Promo = { id: 'b', name: '2 for 4', kind: 'bundle', productIds: ['a', 'b'], qty: 2, priceCents: 400, percent: null };
  it('prices any mix of two items as a bundle', () => {
    const r = applyPromos([{ productId: 'a', qty: 1, unitCents: 250 }, { productId: 'b', qty: 1, unitCents: 175 }], [bundle]);
    expect(r.promoCents.reduce((x, y) => x + y, 0)).toBe(25);
  });
  it('leaves an odd extra item at full price and ignores cases that save nothing', () => {
    const r = applyPromos([{ productId: 'a', qty: 3, unitCents: 250 }], [bundle]);
    expect(r.promoCents[0]).toBe(100); // one pair: 500 -> 400
    expect(applyPromos([{ productId: 'a', qty: 2, unitCents: 150 }], [bundle]).promoCents[0]).toBe(0);
  });
  it('makes the cheapest of each group free', () => {
    const p: Promo = { id: 'g', name: '3rd free', kind: 'buy_get', productIds: ['a'], qty: 3, priceCents: null, percent: 100 };
    expect(applyPromos([{ productId: 'a', qty: 6, unitCents: 300 }], [p]).promoCents[0]).toBe(600);
  });
  it('takes a percent off once enough are bought', () => {
    const p: Promo = { id: 'p', name: '10%', kind: 'percent', productIds: ['a'], qty: 2, priceCents: null, percent: 10 };
    expect(applyPromos([{ productId: 'a', qty: 2, unitCents: 250 }], [p]).promoCents[0]).toBe(50);
    expect(applyPromos([{ productId: 'a', qty: 1, unitCents: 250 }], [p]).promoCents[0]).toBe(0);
  });
});

describe('customers', () => {
  it('lets a cashier find and add customers, but not set a credit limit', async () => {
    const found = await call('GET', '/customers?search=maya', cashier);
    expect(found.body[0].name).toBe('Maya Khoury');
    const made = await call('POST', '/customers', cashier, { name: 'Test Person', phone: '+961 1 000 111' });
    expect(made.status).toBe(201);
    expect((await call('POST', '/customers', cashier, { name: 'Dup', phone: '+961 1 000 111' })).status).toBe(409);
    expect((await call('POST', '/customers', cashier, { name: 'Rich', creditLimitCents: 5000 })).status).toBe(403);
    expect((await call('PATCH', '/customers/' + made.body.id, cashier, { creditLimitCents: 100 })).status).toBe(403);
    expect((await call('PATCH', '/customers/' + made.body.id, admin, { creditLimitCents: 10000 })).status).toBe(200);
  });
});

describe('selling to a customer', () => {
  it('earns points, applies a line discount and a promotion, and keeps totals exact', async () => {
    // 1 cheese (250) + 1 zaatar (175) bundle -> 400, plus a 50c line discount on a latte (350)
    const r = await call('POST', '/sales', cashier, sale({
      customerId: maya,
      lines: [
        { productId: cheese, qty: 1, promoCents: 15 }, { productId: zaatar, qty: 1, promoCents: 10 },
        { productId: latte, qty: 1, discountCents: 10 }
      ]
    }));
    expect(r.status).toBe(201);
    const row = (await pool.query('select subtotal_cents, discount_cents, total_cents, points_earned from sales where id = $1', [(r.body as { id: string }).id])).rows[0];
    expect(row.subtotal_cents).toBe(775);
    expect(row.discount_cents).toBe(35);
    expect(row.total_cents).toBeGreaterThan(740);
    expect(row.points_earned).toBe(Math.floor(row.total_cents / 100));
    expect((await call('GET', '/customers/' + maya, cashier)).body.points).toBe(120 + row.points_earned);
  });

  it('spends points as a discount, and refuses more than the customer has', async () => {
    const ok = await call('POST', '/sales', cashier, sale({ customerId: maya, redeemPoints: 100, lines: [{ productId: latte, qty: 1 }] }));
    expect(ok.status).toBe(201);
    expect((await call('POST', '/sales', cashier, sale({ customerId: georges, redeemPoints: 500, lines: [{ productId: latte, qty: 1 }] }))).status).toBe(422);
    expect((await call('POST', '/sales', cashier, sale({ redeemPoints: 5, lines: [{ productId: latte, qty: 1 }] }))).status).toBe(422);
  });

  it('sells on account within the credit limit and builds a statement', async () => {
    expect((await call('POST', '/sales', cashier, sale({ customerId: georges, tender: 'account', lines: [{ productId: latte, qty: 1 }] }))).status).toBe(422); // no credit
    expect((await call('POST', '/sales', cashier, sale({ tender: 'account', lines: [{ productId: latte, qty: 1 }] }))).status).toBe(422); // no customer
    const before = (await call('GET', '/customers/' + maya, cashier)).body.balanceCents as number;
    const a = await call('POST', '/sales', cashier, sale({ customerId: maya, tender: 'account', lines: [{ productId: latte, qty: 2 }] }));
    expect(a.status).toBe(201);
    const after = (await call('GET', '/customers/' + maya, cashier)).body.balanceCents as number;
    expect(after - before).toBe(a.body.totalCents);
    const big = await call('POST', '/sales', cashier, sale({ customerId: maya, tender: 'account', lines: [{ productId: latte, qty: 9000 }] }));
    expect(big.status).toBe(422);
    const pay = await call('POST', '/customers/' + maya + '/payments', cashier, { amountCents: 500, method: 'cash' });
    expect(pay.status).toBe(201);
    expect(pay.body.balanceCents).toBe(after - 500);
    const st = await call('GET', '/customers/' + maya + '/statement', admin);
    expect(st.status).toBe(200);
    expect(st.body.closingCents).toBe(after - 500);
    expect(st.body.lines.at(-1).kind).toBe('payment');
    expect(st.body.lines.at(-1).balanceCents).toBe(st.body.closingCents);
  });

  it('refunds an account sale back to the account and takes back points', async () => {
    const s = await call('POST', '/sales', cashier, sale({ customerId: maya, tender: 'account', lines: [{ productId: latte, qty: 1 }] }));
    const before = (await call('GET', '/customers/' + maya, cashier)).body;
    const sup = (await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '1234' })).body.token;
    const ret = await call('POST', '/returns', cashier, { id: randomUUID(), saleId: s.body.id, tillId: register1, receiptNo: 'R-' + Math.random().toString(36).slice(2, 7), tender: 'usd', lines: [{ productId: latte, qty: 1 }], approverPin: '1234' });
    expect(ret.status).toBe(201);
    const after = (await call('GET', '/customers/' + maya, cashier)).body;
    expect(before.balanceCents - after.balanceCents).toBe(ret.body.refundCents);
    expect(after.points).toBeLessThanOrEqual(before.points);
    void sup;
  });

  it('only managers can adjust points', async () => {
    expect((await call('POST', '/customers/' + maya + '/adjust', cashier, { points: 10, note: 'gift' })).status).toBe(403);
    expect((await call('POST', '/customers/' + maya + '/adjust', admin, { points: 10, note: 'gift' })).status).toBe(201);
  });
});

describe('promotions and loyalty settings', () => {
  it('tills read the live promotions; only managers change them', async () => {
    const live = await call('GET', '/promotions', cashier);
    expect(live.body.length).toBeGreaterThanOrEqual(2);
    expect((await call('POST', '/promotions', cashier, { name: 'x', kind: 'percent', productIds: [latte], qty: 1, percent: 5 })).status).toBe(403);
    const made = await call('POST', '/promotions', admin, { name: '10% off lattes', kind: 'percent', productIds: [latte], qty: 2, percent: 10 });
    expect(made.status).toBe(201);
    expect((await call('POST', '/promotions', admin, { name: 'bad', kind: 'bundle', productIds: [latte], qty: 2 })).status).toBe(400);
    expect((await call('DELETE', '/promotions/' + made.body.id, admin)).status).toBe(200);
    const live2 = await call('GET', '/promotions', cashier);
    expect(live2.body.find((p: { id: string }) => p.id === made.body.id)).toBeUndefined();
  });
  it('shows and changes the loyalty rules', async () => {
    expect((await call('GET', '/settings', cashier)).body.loyalty.enabled).toBe(true);
    const r = await call('PUT', '/settings/loyalty', admin, { enabled: true, earnPerUsd: 2, pointValueCents: 2 });
    expect(r.body.earnPerUsd).toBe(2);
    expect((await call('PUT', '/settings/loyalty', cashier, { enabled: false, earnPerUsd: 1, pointValueCents: 1 })).status).toBe(403);
  });
});
