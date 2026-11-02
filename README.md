# Nabd POS - server, back office and web till

Monorepo:
- `server/` - TypeScript API (Fastify, PostgreSQL, zod, JWT).
- `backoffice/` - React + Vite web app for head office and store managers.
- `cashier/` - Flutter cashier app (landscape till). See `cashier/README.md`. Written but not yet compiled by me (Flutter was unreachable in my workspace).

## Requirements
Node 20+, PostgreSQL 14+.

## Deploying
See DEPLOY.md (docker compose, HTTPS, and cloud-built Android/Windows cashier app).

## Quickest way (local, Node.js only)
Install Node.js 20+, then:
- Windows: double-click `start.bat`
- Mac/Linux: `./start.sh`

No database to install. Data lives in `server/data`. Open:
- Back office: http://localhost:4000/  (admin@nabd.local / ChangeMe123!)
- Web till: http://localhost:4000/till  (pick Hamra / Register 1, PIN 4321; supervisor PIN 1234 approves returns)

The web till saves sales on the device first and uploads them when the server answers.
Set `NABD_EMPTY=1` before the first start for no demo data, and `PORT` to change the port.

## Run it step by step
```bash
createdb nabd
cd server
npm install
export DATABASE_URL=postgres://postgres@localhost:5432/nabd
export JWT_SECRET=change-this-to-a-long-random-string   # 16+ chars
npm run migrate
npm run seed            # demo stores, tills, products, users
npm run dev             # API on :4000

cd ../backoffice
npm install
npm run dev             # http://localhost:5173 (proxies /api to :4000)
```
Optional: `npx tsx scripts/demo-sales.ts` in `server/` uploads demo sales.

## Demo sign-ins (development only, change before any real use)
| Who | Email | Password / PIN | Role |
|---|---|---|---|
| Admin | admin@nabd.local | ChangeMe123! (or `ADMIN_PASSWORD`) | head_office |
| Dina | dina@nabd.local | ChangeMe123! | store_manager |
| Karim | karim@nabd.local | PIN 1234 | supervisor |
| Nour A. | - | PIN 4321 | cashier |

## Tests
```bash
createdb nabd_test
cd server && npm test        # 22 tests
cd backoffice && npm test    # 7 tests
```

## Design notes
- Money is integer cents in USD; the LBP rate lives in settings.
- Sales are idempotent (client-generated UUID) so the cashier app can upload offline sales safely.
- Roles and permissions are checked on the server for every request.

## Known gaps
- Server-generated alert texts on the dashboard (for example "Hamra Register 2 is offline") are English only.
- Cashier app has not been compiled or run on a device yet; expect small fixes on first run.

## Customers, loyalty and promotions (v1.4)

- **Customers** (back office → Customers): name, phone, credit limit, points, statement. At the till tap *Customer* to pick or add one (needs a connection).
- **Loyalty**: points are earned on every sale to a customer and can be used as a discount. Rates are in Settings.
- **On account**: choose the *On account* tender. The sale is refused if it passes the customer's credit limit. Receive payments from the Customer screen. A sale made offline can still be rejected by the server if the limit was passed meanwhile; it is parked in the rejected list.
- **Promotions** (back office → Promotions): mix and match bundles ("any 2 for $4"), percent off when buying N, and buy N get the cheapest free. They apply automatically at the till.
- **Line discounts**: each cart line has its own %. Over 5% needs a supervisor.

## Building with AI helpers

`.claude/skills/` holds the brainstorming, writing-plans and test-driven-development skills (adapted from the Superpowers collection). `.claude/agents/` holds three agents: `nabd-planner`, `nabd-designer`, `nabd-tester`. Designs go in `docs/specs/`, plans in `docs/plans/`.
