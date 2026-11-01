# Deploying Nabd

Everything below was prepared but I could not run it on a public server myself (no hosting account, and my workspace is temporary).

## 1. Server + back office on the internet (one machine)
You need a Linux server (a VPS with 1 GB RAM is enough) with Docker, and a domain name pointed at it.

```bash
git clone <your repo>  # or unzip nabd.zip
cd nabd
cp .env.example .env   # fill in DB_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build
```
- The back office opens on port 80 of that machine; sign in with ADMIN_EMAIL / ADMIN_PASSWORD.
- First start creates the tables, roles, your admin, one store and Register 1. Set SEED_DEMO=1 only for testing.
- **HTTPS:** put Caddy or Cloudflare in front. Caddy example (`Caddyfile`): `pos.yourshop.com { reverse_proxy localhost:80 }`
- **Backups:** `docker compose exec db pg_dump -U postgres nabd > backup.sql` on a schedule.
- Never expose the database port. Change the demo passwords if you loaded demo data.

Hosted alternatives: Render, Railway or Fly.io can run the two Dockerfiles (`server/`, `backoffice/`) plus a managed PostgreSQL; set the same variables.

## 2. Android and Windows cashier app (built in the cloud)
Flutter could not be installed in my workspace, so GitHub builds it for you:
1. Create a private GitHub repository and upload this folder (or `git push`).
2. Open the repository's **Actions** tab, choose **Build cashier app**, press **Run workflow**.
3. When it finishes, open the run and download **nabd-cashier-android-apk** (and **nabd-cashier-windows**).
4. Android: copy `app-release.apk` to the tablet, allow "install unknown apps", open it.
5. First launch: server address (`https://pos.yourshop.com/api`), Store ID, Till ID (back office > Stores and tills > Copy setup).

The first build may show Dart errors, because the app has never been compiled. Send me the log and I will fix them.
Play Store release later needs a proper signing key; the APK above is for installing directly.

## 3. Per-shop checklist
- Back office: add each till (Stores and tills > Register a till). The app asks for its Store ID and Till ID.
- Create cashier PINs and supervisors in Users and roles.
- Set the LBP rate (Products screen, via the API for now) and add products.
- Test with a real receipt printer and barcode scanner before opening.
