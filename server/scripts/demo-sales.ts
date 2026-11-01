// Uploads demo sales through the real API, so the dashboard has data. Dev only.
import { randomUUID } from 'node:crypto';

const base = process.env.API ?? 'http://localhost:4000';
const j = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const res = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(init.token ? { authorization: 'Bearer ' + init.token } : {}) } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const admin = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@nabd.local', password: process.env.ADMIN_PASSWORD ?? 'ChangeMe123!' }) })).body.token as string;
const stores = (await j('/stores', { token: admin })).body as { id: string; name: string }[];
const hamra = stores.find((s) => s.name === 'Hamra')!;
const cashier = (await j('/auth/pin', { method: 'POST', body: JSON.stringify({ storeId: hamra.id, pin: '4321' }) })).body.token as string;
const products = ((await j('/products?limit=200', { token: admin })).body.items) as { id: string }[];
const tills = (await j('/tills', { token: admin })).body as { id: string; store: string; name: string }[];

const today = new Date().toISOString().slice(0, 10);
const weights = [1, 3, 4, 3, 5, 5, 3, 2, 3, 4, 4, 2];
let n = 1;
for (let i = 0; i < weights.length; i++) {
  for (let k = 0; k < weights[i]!; k++) {
    const lines = Array.from({ length: 1 + (k % 3) }, (_, x) => ({ productId: products[(i + k + x * 3) % products.length]!.id, qty: 1 + ((i + x) % 2) }));
    const hourUtc = 6 + i; // Beirut is UTC+2 in winter, so 08:00 local and onwards
    const r = await j('/sales', { method: 'POST', token: cashier, body: JSON.stringify({
      id: randomUUID(), storeId: hamra.id, receiptNo: 'R-' + String(n++).padStart(4, '0'), tender: ['usd', 'lbp', 'card'][k % 3],
      soldAt: `${today}T${String(hourUtc).padStart(2, '0')}:${String(10 + k * 9).padStart(2, '0')}:00.000Z`, lines
    }) });
    if (r.status !== 201) console.error('sale failed', r.status, r.body);
  }
}
for (const t of tills.filter((x) => x.store !== 'Verdun' || x.name !== 'Register 3')) {
  await j(`/tills/${t.id}/heartbeat`, { method: 'POST', token: cashier, body: JSON.stringify({ appVersion: '1.4.2', queuedSales: 0 }) });
}
console.log('uploaded', n - 1, 'sales');
