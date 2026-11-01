import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tells cashier apps which version is the newest, so they can show an update banner.
 * Order of precedence: `app-version.json` in the data folder, then APP_LATEST_VERSION / APP_DOWNLOAD_URL / APP_NOTES,
 * then the newest GitHub release of APP_REPO (default nabdsolution-dot/nabd), checked at most every 30 minutes.
 * Set APP_REPO=off to turn the GitHub check off.
 */
interface Info { latest: string; url: string; notes: string }

let cache: { at: number; info: Info } | null = null;

async function fromGithub(): Promise<Info | null> {
  const repo = process.env.APP_REPO ?? 'nabdsolution-dot/nabd';
  if (repo === 'off') return null;
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.info;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'nabd-server' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error('status ' + res.status);
    const r = (await res.json()) as { tag_name?: string; body?: string; assets?: { name: string; browser_download_url: string }[] };
    const apk = r.assets?.find((a) => a.name.endsWith('.apk'));
    const info: Info = { latest: (r.tag_name ?? '').replace(/^v/, ''), url: apk?.browser_download_url ?? '', notes: r.body ?? '' };
    cache = { at: Date.now(), info };
    return info;
  } catch {
    // Offline or rate limited: keep the last answer, or say nothing.
    if (cache) { cache.at = Date.now() - 25 * 60_000; return cache.info; }
    return null;
  }
}

export async function appInfoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/app/version', async () => {
    let out: Info = { latest: process.env.APP_LATEST_VERSION ?? '', url: process.env.APP_DOWNLOAD_URL ?? '', notes: process.env.APP_NOTES ?? '' };
    try {
      const f = JSON.parse(readFileSync(join(process.env.NABD_DATA ?? 'data', 'app-version.json'), 'utf8')) as Partial<Info>;
      if (typeof f.latest === 'string') out.latest = f.latest;
      if (typeof f.url === 'string') out.url = f.url;
      if (typeof f.notes === 'string') out.notes = f.notes;
    } catch { /* no file */ }
    if (!out.latest) {
      const g = await fromGithub();
      if (g) out = g;
    }
    return out;
  });
}
