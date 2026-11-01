const TOKEN_KEY = 'nabd.token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null): void {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public issues?: { path: string; message: string }[]) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('nabd:signed-out')); }
    throw new ApiError(res.status, data?.error ?? 'Something went wrong.', data?.issues);
  }
  return data as T;
}

export interface Me { id: string; name: string; roleId: string; storeId: string | null; permissions: string[] }
export interface Product { id: string; name: string; barcode: string | null; categoryId: string | null; category: string | null; priceCents: number; vatBp: number; reorderLevel: number; active: boolean; stock: number; image: string | null }
export interface Category { id: string; name: string }
export interface StoreRow { id: string; code: string; name: string; tills: number; tillsOnline: number; waiting: number; salesTodayCents: number }
export interface TillRow { id: string; name: string; storeId: string; store: string; appVersion: string | null; lastSyncAt: string | null; queuedSales: number; online: boolean }
export interface ShiftRow { id: string; store: string; till: string; cashier: string; openedAt: string; closedAt: string | null; closed: boolean; matches: boolean; note: string | null; expectedUsdCents: number | null; countedUsdCents: number | null; expectedLbp: number | null; countedLbp: number | null; expectedCardCents: number | null; countedCardCents: number | null }
export interface UserRow { id: string; name: string; email: string | null; roleId: string; role: string; storeId: string | null; store: string; active: boolean; lastActiveAt: string | null; signin: string }
export interface RolesResponse { roles: { id: string; name: string }[]; permissions: { permission: string; label: string; access: Record<string, 'yes' | 'no' | 'pin'> }[] }
export interface Dashboard {
  salesCents: number; transactions: number; averageBasketCents: number;
  salesVsLastWeekPct: number | null; transactionsVsLastWeekPct: number | null;
  tillsOnline: number; tillsTotal: number;
  hourly: { hour: number; cents: number }[];
  top: { name: string; category: string; units: number; salesCents: number }[];
  alerts: { kind: string; severity: string; title: string; body: string }[];
}
