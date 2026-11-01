import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tells cashier apps which version is the newest, so they can show an update banner.
 * Edit `app-version.json` in the data folder (or set APP_LATEST_VERSION / APP_DOWNLOAD_URL / APP_NOTES) when you release a new APK.
 */
export async function appInfoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/app/version', async () => {
    const out = {
      latest: process.env.APP_LATEST_VERSION ?? '',
      url: process.env.APP_DOWNLOAD_URL ?? '',
      notes: process.env.APP_NOTES ?? ''
    };
    try {
      const f = JSON.parse(readFileSync(join(process.env.NABD_DATA ?? 'data', 'app-version.json'), 'utf8')) as Partial<typeof out>;
      if (typeof f.latest === 'string') out.latest = f.latest;
      if (typeof f.url === 'string') out.url = f.url;
      if (typeof f.notes === 'string') out.notes = f.notes;
    } catch { /* no file: use the environment values */ }
    return out;
  });
}
