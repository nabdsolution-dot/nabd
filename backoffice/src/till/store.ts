import type { Product } from '../api';

/** Web till state. Sales are saved on this device first and uploaded when the server answers, so selling never waits for the network. */

export interface CartLine { product: Product; qty: number }
export interface Totals { subtotal: number; discount: number; vat: number; total: number }
export interface Sale {
  id: string; storeId: string; tillId: string; receiptNo: string; soldAt: string;
  tender: 'usd' | 'lbp' | 'card'; discountCents: number; lbpRate: number;
  lines: { productId: string; qty: number }[];
  display: { total: number; subtotal: number; vat: number; cashier: string; lines: { name: string; qty: number; unit: number }[] };
  reason?: string;
}
export interface Cfg { storeId: string; tillId: string; storeName: string; tillName: string }
export interface Me { name: string; roleId: string; permissions: string[] }
export interface ShiftInfo { id: string; openedAt: string; cashier: string; floatUsdCents: number; expected: { usdCents: number; lbp: number; cardCents: number } }

export class TillApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export class TillOffline extends Error { constructor() { super('Cannot reach the server.'); } }

const K = { cfg: 'nabd.till.cfg', token: 'nabd.till.token', me: 'nabd.till.me', queue: 'nabd.till.queue', rejected: 'nabd.till.rejected', products: 'nabd.till.products', rate: 'nabd.till.rate', counter: 'nabd.till.counter' };

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { if (value === null || value === undefined) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = (globalThis.crypto as Crypto).getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Same arithmetic as the server, so the till and the back office agree to the cent. */
export function computeTotals(lines: CartLine[], discountCents: number): Totals {
  let subtotal = 0; let vatRaw = 0;
  for (const l of lines) { const lt = l.product.priceCents * l.qty; subtotal += lt; vatRaw += lt * l.product.vatBp / 10000; }
  const vat = subtotal === 0 ? 0 : Math.round(vatRaw * (subtotal - discountCents) / subtotal);
  return { subtotal, discount: discountCents, vat, total: subtotal - discountCents + vat };
}

export interface State {
  cfg: Cfg | null; token: string | null; me: Me | null;
  products: Product[]; lbpRate: number; online: boolean;
  queue: Sale[]; rejected: Sale[];
  shift: ShiftInfo | null;
  cart: CartLine[]; discountPct: number;
  syncMessage: string | null;
}

let state: State = {
  cfg: read<Cfg | null>(K.cfg, null), token: read<string | null>(K.token, null), me: read<Me | null>(K.me, null),
  products: read<Product[]>(K.products, []), lbpRate: read<number>(K.rate, 89500), online: false,
  queue: read<Sale[]>(K.queue, []), rejected: read<Sale[]>(K.rejected, []),
  shift: null, cart: [], discountPct: 0, syncMessage: null
};
const listeners = new Set<() => void>();
export const getState = (): State => state;
export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
function set(patch: Partial<State>): void { state = { ...state, ...patch }; listeners.forEach((l) => l()); }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(state.token ? { authorization: 'Bearer ' + state.token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch { throw new TillOffline(); }
  const text = await res.text();
  let data: { error?: string } | null = null;
  try { data = text ? JSON.parse(text) : null; } catch { throw new TillOffline(); }
  if (!res.ok) throw new TillApiError(res.status, data?.error ?? 'Something went wrong.');
  return data as T;
}

// ---- setup and sign-in ----
export const loadStores = () => call<{ id: string; name: string; tills: { id: string; name: string }[] }[]>('GET', '/public/stores');

export function saveSetup(cfg: Cfg): void { write(K.cfg, cfg); set({ cfg }); }
export function resetSetup(): void { write(K.cfg, null); signOut(); set({ cfg: null }); }

export async function signIn(pin: string): Promise<void> {
  const cfg = state.cfg!;
  const r = await call<{ token: string }>('POST', '/auth/pin', { storeId: cfg.storeId, pin });
  state = { ...state, token: r.token };
  const me = await call<Me & { id: string }>('GET', '/me');
  const slim: Me = { name: me.name, roleId: me.roleId, permissions: me.permissions };
  write(K.token, r.token); write(K.me, slim);
  set({ token: r.token, me: slim, online: true });
  void sync();
}

export function signOut(): void {
  write(K.token, null); write(K.me, null);
  set({ token: null, me: null, cart: [], discountPct: 0, shift: null });
}

// ---- cart ----
export function addProduct(p: Product): void {
  const cart = state.cart.map((l) => ({ ...l }));
  const hit = cart.find((l) => l.product.id === p.id);
  if (hit) hit.qty += 1; else cart.push({ product: p, qty: 1 });
  set({ cart });
}
export function changeQty(id: string, delta: number): void {
  set({ cart: state.cart.map((l) => (l.product.id === id ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0) });
}
export function clearCart(): void { set({ cart: [], discountPct: 0 }); }
export function setDiscount(pct: number): void { set({ discountPct: pct }); }
export function currentTotals(): Totals {
  const sub = state.cart.reduce((a, l) => a + l.product.priceCents * l.qty, 0);
  return computeTotals(state.cart, Math.round(sub * state.discountPct / 100));
}

// ---- sale ----
function nextReceipt(prefix: string): string {
  const n = read<number>(K.counter, 0) + 1;
  write(K.counter, n);
  return `${prefix}${state.cfg!.tillId.replace(/-/g, '').slice(0, 4).toUpperCase()}-${String(n).padStart(5, '0')}`;
}

export function completeSale(tender: Sale['tender']): Sale {
  const t = currentTotals();
  const sale: Sale = {
    id: uuid(), storeId: state.cfg!.storeId, tillId: state.cfg!.tillId, receiptNo: nextReceipt(''),
    soldAt: new Date().toISOString(), tender, discountCents: t.discount, lbpRate: state.lbpRate,
    lines: state.cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
    display: { total: t.total, subtotal: t.subtotal, vat: t.vat, cashier: state.me?.name ?? '', lines: state.cart.map((l) => ({ name: l.product.name, qty: l.qty, unit: l.product.priceCents })) }
  };
  const queue = [...state.queue, sale];
  write(K.queue, queue);
  set({ queue, cart: [], discountPct: 0 });
  void sync();
  return sale;
}

// ---- sync ----
let syncing = false;
export async function sync(): Promise<void> {
  if (syncing || !state.token || !state.cfg) return;
  syncing = true;
  try {
    for (const sale of [...state.queue]) {
      const { display: _d, reason: _r, ...body } = sale;
      try {
        await call('POST', '/sales', body); // 201 created and 200 duplicate both mean saved
        set({ queue: state.queue.filter((s) => s.id !== sale.id) });
      } catch (e) {
        if (e instanceof TillApiError && e.status !== 401) {
          // The server understood and refused it. Park it so it cannot block the others.
          set({ queue: state.queue.filter((s) => s.id !== sale.id), rejected: [...state.rejected, { ...sale, reason: e.message }] });
        } else throw e;
      }
      write(K.queue, state.queue); write(K.rejected, state.rejected);
    }
    const all: Product[] = [];
    for (let page = 1; ; page++) {
      const r = await call<{ items: Product[]; total: number }>('GET', `/products?limit=200&page=${page}`);
      all.push(...r.items.filter((p) => p.active));
      if (page * 200 >= r.total) break;
    }
    const s = await call<{ lbpRate: number }>('GET', '/settings');
    write(K.products, all); write(K.rate, s.lbpRate);
    await call('POST', `/tills/${state.cfg.tillId}/heartbeat`, { appVersion: 'web-1.0.0', queuedSales: state.queue.length });
    set({ products: all, lbpRate: s.lbpRate, online: true, syncMessage: null });
  } catch (e) {
    if (e instanceof TillOffline) set({ online: false });
    else if (e instanceof TillApiError && e.status === 401) { signOut(); set({ syncMessage: 'Signed out. Sign in again to upload waiting sales.' }); }
    else set({ syncMessage: e instanceof Error ? e.message : 'Something went wrong.' });
  } finally { syncing = false; }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function start(): () => void {
  void sync();
  timer = setInterval(() => void sync(), 20000);
  const onOnline = () => void sync();
  window.addEventListener('online', onOnline);
  return () => { if (timer) clearInterval(timer); window.removeEventListener('online', onOnline); };
}

// ---- shifts and returns (online) ----
export async function loadShift(): Promise<void> {
  const r = await call<{ open: boolean } & Partial<ShiftInfo>>('GET', `/shifts/current?tillId=${state.cfg!.tillId}`);
  set({ shift: r.open ? (r as unknown as ShiftInfo) : null });
}
export async function openShift(floatUsdCents: number): Promise<void> {
  await call('POST', '/shifts/open', { tillId: state.cfg!.tillId, floatUsdCents });
  await loadShift();
}
export async function closeShift(c: { usdCents: number; lbp: number; cardCents: number; note: string }) {
  const r = await call<{ difference: { usdCents: number; lbp: number; cardCents: number } }>('POST', `/shifts/${state.shift!.id}/close`, {
    countedUsdCents: c.usdCents, countedLbp: c.lbp, countedCardCents: c.cardCents, ...(c.note.trim() ? { note: c.note.trim() } : {})
  });
  set({ shift: null });
  return r;
}
export interface SaleLookup { id: string; receiptNo: string; tender: Sale['tender']; totalCents: number; lines: { productId: string; name: string; sold: number; returned: number; returnable: number; unitCents: number }[] }
export const lookupSale = (receiptNo: string) => call<SaleLookup>('GET', `/sales/lookup?storeId=${state.cfg!.storeId}&receiptNo=${encodeURIComponent(receiptNo.trim())}`);
export async function submitReturn(a: { saleId: string; tender: Sale['tender']; lines: { productId: string; qty: number }[]; reason?: string; approverPin?: string }): Promise<number> {
  const r = await call<{ refundCents: number }>('POST', '/returns', {
    id: uuid(), saleId: a.saleId, tillId: state.cfg!.tillId, receiptNo: nextReceipt('R'), tender: a.tender, lines: a.lines,
    ...(a.reason?.trim() ? { reason: a.reason.trim() } : {}), ...(a.approverPin ? { approverPin: a.approverPin } : {})
  });
  return r.refundCents;
}
