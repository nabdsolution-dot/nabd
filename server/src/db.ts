import pg from 'pg';
import { PGlite, types } from '@electric-sql/pglite';

/** The small part of a database pool the server uses. Both PostgreSQL (pg) and the built-in local database satisfy it. */
export interface Client {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  release(): void;
}
export interface Pool {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  connect(): Promise<Client>;
  end(): Promise<void>;
}

/** Built-in PostgreSQL (WebAssembly) stored in a folder. One connection, so work is queued one transaction at a time. */
class LitePool implements Pool {
  private db: PGlite;
  private tail: Promise<void> = Promise.resolve();

  constructor(dataDir?: string) {
    // Return bigint as text, exactly like the pg driver, so both databases behave the same.
    this.db = new PGlite(dataDir, { parsers: { [types.INT8]: (v: string) => v } });
  }

  private async lock(): Promise<() => void> {
    let release!: () => void;
    const prev = this.tail;
    this.tail = new Promise<void>((r) => { release = r; });
    await prev;
    return release;
  }

  private async run(text: string, params?: unknown[]) {
    if (!params || params.length === 0) {
      const results = await this.db.exec(text); // allows several statements in one string
      const last = results[results.length - 1];
      const rows = (last?.rows ?? []) as any[];
      return { rows, rowCount: rows.length || last?.affectedRows || 0 };
    }
    const r = await this.db.query(text, params as any[]);
    return { rows: r.rows as any[], rowCount: r.rows.length || r.affectedRows || 0 };
  }

  async query(text: string, params?: unknown[]) {
    const release = await this.lock();
    try { return await this.run(text, params); } finally { release(); }
  }

  async connect(): Promise<Client> {
    const release = await this.lock();
    return { query: (t, p) => this.run(t, p), release };
  }

  async end() { await this.db.close(); }
}

/**
 * url "pglite:<folder>" (or "pglite:memory") uses the built-in database; any postgres:// URL uses PostgreSQL.
 */
export function createPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('DATABASE_URL is not set');
  if (url.startsWith('pglite:')) {
    const dir = url.slice('pglite:'.length);
    return new LitePool(dir === 'memory' ? undefined : dir);
  }
  return new pg.Pool({ connectionString: url, max: 10 }) as unknown as Pool;
}
