import { fileURLToPath } from 'node:url';
import type { Pool } from './db.js';
import { createPool } from './db.js';
import { hashSecret } from './auth.js';
import { ROLES } from './permissions.js';

export async function seedBase(pool: Pool): Promise<void> {
  for (const r of ROLES) {
    await pool.query('insert into roles (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name', [r.id, r.name]);
    await pool.query('delete from role_permissions where role_id = $1', [r.id]);
    for (const [perm, opts] of Object.entries(r.permissions)) {
      await pool.query('insert into role_permissions (role_id, permission, requires_pin) values ($1, $2, $3)', [r.id, perm, !!opts?.pin]);
    }
  }
  await pool.query("insert into settings (key, value) values ('lbp_rate', '89500') on conflict (key) do nothing");
}

export async function seedDemo(pool: Pool): Promise<void> {
  await seedBase(pool);
  const stores: Record<string, string> = {};
  for (const [code, name] of [['HAM', 'Hamra'], ['VER', 'Verdun'], ['JOU', 'Jounieh']]) {
    const r = await pool.query(
      'insert into stores (code, name) values ($1, $2) on conflict (code) do update set name = excluded.name returning id',
      [code, name]
    );
    stores[code!] = r.rows[0].id;
    for (const t of ['Register 1', 'Register 2', 'Register 3']) {
      await pool.query('insert into tills (store_id, name, app_version) values ($1, $2, $3) on conflict (store_id, name) do nothing', [stores[code!], t, '1.0.0']);
    }
  }
  const cats: Record<string, string> = {};
  for (const c of ['Coffee', 'Bakery', 'Dairy', 'Drinks']) {
    const r = await pool.query('insert into categories (name) values ($1) on conflict (name) do update set name = excluded.name returning id', [c]);
    cats[c] = r.rows[0].id;
  }
  const products: [string, string, string, number, number][] = [
    ['Turkish coffee', '6111113000024', 'Coffee', 150, 40],
    ['Cappuccino', '6111113000017', 'Coffee', 300, 40],
    ['Iced latte', '6111113000031', 'Coffee', 350, 40],
    ['Cheese manousheh', '6111112000014', 'Bakery', 250, 24],
    ['Zaatar manousheh', '6111112000021', 'Bakery', 175, 24],
    ['Croissant', '6111112000038', 'Bakery', 225, 24],
    ["Ka'ak", '6111112000045', 'Bakery', 125, 24],
    ['Labneh 250 g', '6111114000012', 'Dairy', 320, 12],
    ['Halloumi 200 g', '6111114000029', 'Dairy', 480, 12],
    ['Jallab', '6111115000026', 'Drinks', 200, 20],
    ['Sparkling water', '6111115000033', 'Drinks', 100, 20],
    ['Orange juice', '6111115000019', 'Drinks', 300, 20]
  ];
  for (const [name, barcode, cat, price, reorder] of products) {
    const r = await pool.query(
      `insert into products (name, barcode, category_id, price_cents, reorder_level) values ($1, $2, $3, $4, $5)
       on conflict (barcode) do update set name = excluded.name returning id`,
      [name, barcode, cats[cat!], price, reorder]
    );
    for (const sid of Object.values(stores)) {
      await pool.query('insert into stock (product_id, store_id, qty) values ($1, $2, $3) on conflict do nothing', [r.rows[0].id, sid, reorder * 3]);
    }
  }
  // Demo customers and promotions, so the new features can be tried straight away.
  if (!(await pool.query('select 1 from customers limit 1')).rows[0]) {
    await pool.query(
      `insert into customers (code, name, phone, email, address, credit_limit_cents, points) values
         ('100001', 'Maya Khoury', '+961 70 123 456', 'maya@example.com', 'Hamra, Beirut', 20000, 120),
         ('100002', 'Georges Haddad', '+961 3 555 010', null, 'Verdun, Beirut', 0, 40)`);
    const id = async (name: string) => (await pool.query('select id from products where name = $1', [name])).rows[0].id as string;
    await pool.query(
      `insert into promotions (name, kind, product_ids, qty, price_cents, percent) values
         ('Any 2 manousheh for $4.00', 'bundle', $1, 2, 400, null),
         ('Coffee: buy 3, cheapest free', 'buy_get', $2, 3, null, 100)`,
      [[await id('Cheese manousheh'), await id('Zaatar manousheh')], [await id('Turkish coffee'), await id('Cappuccino'), await id('Iced latte')]]);
  }
  const pw = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
  const users: [string, string | null, string, string | null, string | null][] = [
    ['Head Office Admin', 'admin@nabd.local', 'head_office', null, null],
    ['Dina M.', 'dina@nabd.local', 'store_manager', 'VER', null],
    ['Karim S.', 'karim@nabd.local', 'supervisor', 'HAM', '1234'],
    ['Nour A.', null, 'cashier', 'HAM', '4321']
  ];
  for (const [name, email, role, store, pin] of users) {
    const exists = email
      ? (await pool.query('select 1 from users where email = $1', [email])).rowCount
      : (await pool.query('select 1 from users where name = $1', [name])).rowCount;
    if (exists) continue;
    await pool.query('insert into users (name, email, role_id, store_id, password_hash, pin_hash) values ($1, $2, $3, $4, $5, $6)', [
      name, email, role, store ? stores[store] : null, email ? hashSecret(pw) : null, pin ? hashSecret(pin) : null
    ]);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  seedDemo(pool).then(() => { console.log('seeded demo data'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}
