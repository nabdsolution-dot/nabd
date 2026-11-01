import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { seedBase, seedDemo } from './seed.js';
import { hashSecret } from './auth.js';

/** First-start setup for a real deployment: tables, roles, one admin, one store with one till. Safe to run on every start. */
async function main(): Promise<void> {
  const pool = createPool();
  const applied = await migrate(pool);
  if (applied.length) console.log('migrations applied:', applied.join(', '));
  await seedBase(pool);

  if (process.env.SEED_DEMO === '1') {
    await seedDemo(pool);
    console.log('demo data loaded');
  }

  const hasAdmin = (await pool.query("select 1 from users where role_id = 'head_office' and active limit 1")).rowCount;
  if (!hasAdmin) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || password.length < 10) {
      console.error('No admin user yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) and start again.');
      process.exit(1);
    }
    await pool.query(
      "insert into users (name, email, role_id, password_hash) values ('Administrator', $1, 'head_office', $2)",
      [email, hashSecret(password)]
    );
    console.log('admin user created:', email);
  }

  const hasStore = (await pool.query('select 1 from stores limit 1')).rowCount;
  if (!hasStore) {
    const code = (process.env.FIRST_STORE_CODE ?? 'MAIN').toUpperCase();
    const name = process.env.FIRST_STORE_NAME ?? 'Main store';
    const s = await pool.query('insert into stores (code, name) values ($1, $2) returning id', [code, name]);
    await pool.query("insert into tills (store_id, name) values ($1, 'Register 1')", [s.rows[0].id]);
    console.log(`store "${name}" with Register 1 created`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
