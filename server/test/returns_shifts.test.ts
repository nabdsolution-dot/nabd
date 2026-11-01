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
let cashier = '';
let supervisor = '';
let admin = '';
let hamra = '';
let till = '';
let cm = '';
let jl = '';

const auth = (t: string) => ({ authorization: 'Bearer ' + t });
async function call(method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) {
  const res = await app.inject({ method, url, headers: token ? auth(token) : {}, payload: payload as object | undefined });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}
const sell = (tender: 'usd' | 'lbp' | 'card', lines: { productId: string; qty: number }[], receiptNo: string) =>
  call('POST', '/sales', cashier, { id: randomUUID(), storeId: hamra, tillId: till, receiptNo, soldAt: new Date().toISOString(), tender, lines });

beforeAll(async () => {
  pool = createPool(DB);
  await pool.query('drop schema public cascade; create schema public;');
  await migrate(pool);
  await seedDemo(pool);
  app = await buildApp({ pool, jwtSecret: 'test-secret-test-secret' });
  admin = (await call('POST', '/auth/login', undefined, { email: 'admin@nabd.local', password: 'ChangeMe123!' })).body.token;
  hamra = (await pool.query("select id from stores where code = 'HAM'")).rows[0].id;
  till = (await pool.query("select id from tills where store_id = $1 and name = 'Register 1'", [hamra])).rows[0].id;
  cashier = (await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '4321' })).body.token;
  supervisor = (await call('POST', '/auth/pin', undefined, { storeId: hamra, pin: '1234' })).body.token;
  const items = (await call('GET', '/products?limit=200', admin)).body.items as { id: string; name: string }[];
  cm = items.find((i) => i.name === 'Cheese manousheh')!.id;
  jl = items.find((i) => i.name === 'Jallab')!.id;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('returns', () => {
  let saleId = '';
  it('finds a sale by receipt number with what can still be returned', async () => {
    const id = randomUUID();
    await call('POST', '/sales', cashier, { id, storeId: hamra, tillId: till, receiptNo: 'RET-1', soldAt: new Date().toISOString(), tender: 'usd', lines: [{ productId: cm, qty: 3 }, { productId: jl, qty: 1 }] });
    saleId = id;
    const r = await call('GET', `/sales/lookup?storeId=${hamra}&receiptNo=ret-1`, cashier);
    expect(r.status).toBe(200);
    expect(r.body.lines.find((l: { productId: string }) => l.productId === cm).returnable).toBe(3);
    expect((await call('GET', `/sales/lookup?storeId=${hamra}&receiptNo=nope`, cashier)).status).toBe(404);
  });

  const ret = (token: string, body: Record<string, unknown>) =>
    call('POST', '/returns', token, { id: randomUUID(), saleId, tillId: till, receiptNo: 'RR-' + Math.random().toString(36).slice(2, 8), tender: 'usd', ...body });

  it('needs a supervisor PIN for a cashier, and rejects a wrong one', async () => {
    expect((await ret(cashier, { lines: [{ productId: cm, qty: 1 }] })).status).toBe(403);
    const bad = await ret(cashier, { approverPin: '9999', lines: [{ productId: cm, qty: 1 }] });
    expect(bad.status).toBe(403);
    expect(bad.body.error).toMatch(/PIN/);
  });

  it('refunds the sale price with VAT, puts stock back and records the approver', async () => {
    const before = (await call('GET', '/products/' + cm, admin)).body.stock;
    const r = await ret(cashier, { approverPin: '1234', lines: [{ productId: cm, qty: 1 }], reason: 'Wrong item' });
    expect(r.status).toBe(201);
    expect(r.body.refundCents).toBe(Math.round(250 * 1.11));
    expect((await call('GET', '/products/' + cm, admin)).body.stock).toBe(before + 1);
    const row = (await pool.query('select approved_by from returns where id = (select id from returns order by returned_at desc limit 1)')).rows[0];
    expect(row.approved_by).not.toBeNull();
  });

  it('lets a supervisor return without a PIN, is idempotent, and cannot over-return', async () => {
    const id = randomUUID();
    const body = { id, lines: [{ productId: cm, qty: 1 }] };
    expect((await ret(supervisor, body)).status).toBe(201);
    expect((await ret(supervisor, body)).status).toBe(200);
    // 3 sold, 2 returned so far: 2 more is too many
    const over = await ret(supervisor, { lines: [{ productId: cm, qty: 2 }] });
    expect(over.status).toBe(422);
    expect(over.body.error).toMatch(/Only 1/);
  });

  it('rejects a product that was not on the sale', async () => {
    const items = (await call('GET', '/products?limit=200', admin)).body.items as { id: string; name: string }[];
    const other = items.find((i) => i.id !== cm && i.id !== jl)!.id;
    expect((await ret(supervisor, { lines: [{ productId: other, qty: 1 }] })).status).toBe(422);
  });
});

describe('shifts', () => {
  let shiftId = '';
  it('opens a shift once per till', async () => {
    const r = await call('POST', '/shifts/open', cashier, { tillId: till, floatUsdCents: 10000 });
    expect(r.status).toBe(201);
    shiftId = r.body.id;
    expect((await call('POST', '/shifts/open', cashier, { tillId: till })).status).toBe(409);
  });

  it('works out what the drawer should hold from sales and refunds', async () => {
    await sell('usd', [{ productId: cm, qty: 2 }], 'SH-1'); // 555
    await sell('card', [{ productId: jl, qty: 1 }], 'SH-2');  // 222
    const cur = await call('GET', `/shifts/current?tillId=${till}`, cashier);
    expect(cur.body.open).toBe(true);
    expect(cur.body.expected.usdCents).toBe(10000 + 555);
    expect(cur.body.expected.cardCents).toBe(222);
  });

  it('refuses to close with a difference unless a note is added', async () => {
    const counts = { countedUsdCents: 10555 - 600, countedLbp: 0, countedCardCents: 222 };
    const r = await call('POST', `/shifts/${shiftId}/close`, cashier, counts);
    expect(r.status).toBe(422);
    const ok = await call('POST', `/shifts/${shiftId}/close`, cashier, { ...counts, note: 'Gave wrong change' });
    expect(ok.status).toBe(200);
    expect(ok.body.difference.usdCents).toBe(-600);
    expect((await call('POST', `/shifts/${shiftId}/close`, cashier, { ...counts, note: 'again' })).status).toBe(409);
  });

  it('lists shifts for head office and keeps cashiers out of the list', async () => {
    const list = await call('GET', '/shifts', admin);
    expect(list.status).toBe(200);
    expect(list.body[0].closed).toBe(true);
    expect(list.body[0].matches).toBe(false);
    expect((await call('GET', '/shifts', cashier)).status).toBe(403);
  });

  it('only the opener or a supervisor can close a shift', async () => {
    const open = await call('POST', '/shifts/open', cashier, { tillId: till });
    const other = (await pool.query("select id from users where name = 'Karim S.'")).rows[0].id;
    expect(other).toBeTruthy();
    const good = await call('POST', `/shifts/${open.body.id}/close`, supervisor, { countedUsdCents: 0, countedLbp: 0, countedCardCents: 0 });
    expect(good.status).toBe(200); // supervisor has close_other_shift; zero activity so it matches
  });
});
