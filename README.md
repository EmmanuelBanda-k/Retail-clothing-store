# Urban Clothing POS

Urban Clothing POS is a browser-based architectural prototype for a retail clothing store. It demonstrates role-based access, till operations, inventory by size, receipts, sales reporting, and refunds.

## Group 2

This project was developed for the Group 2 class project.

1. Vernon N. Longwani
2. Arthur Franklin Chipeta
3. Orsterd Zulu
4. Shumba N. David
5. Emmanuel Banda

## Current status

The application supports PostgreSQL persistence through its Node API and automatically retains an in-memory fallback for an offline classroom demonstration.

## Requirements

- Node.js 20 or newer
- A modern web browser
- PostgreSQL 14 or newer for database development

No third-party packages are required for the current prototype.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:8765`.

If port 8765 is already being used, choose another port in PowerShell:

```powershell
$env:PORT=8766; npm start
```

Do not open `index.html` directly from the filesystem. The application uses JavaScript modules, which browsers expect to load through a local web server.

When `DATABASE_URL` is absent, the server starts in offline demonstration mode. To use persistent mode, configure the database first and start the same command with `DATABASE_URL` set:

```powershell
$env:DATABASE_URL='postgresql://postgres:your-password@127.0.0.1:5432/urban_clothing'
$env:SESSION_SECRET='replace-this-with-at-least-32-random-characters'
npm start
```

The terminal prints either `Persistence: PostgreSQL` or `Persistence: in-memory demonstration fallback` so the presenter can confirm the active mode.

## Demo accounts

| Username | PIN | Role |
| --- | --- | --- |
| `nkosinathi` | `1234` | Store owner |
| `vernon` | `1234` | Cashier |
| `emmanuel` | `1234` | Inventory manager |

These credentials are public demonstration data. They must be replaced by server-side authentication before the application handles real information.

## Automated checks

```bash
npm run check
npm test
```

The tests cover VAT calculations, stock totals, reorder thresholds, permissions, sale completion, insufficient stock, and refund reversal. GitHub Actions runs the same checks on pushes and pull requests.

## Database development

The `database` directory contains the complete PostgreSQL definition. Create an empty development database and provide its connection string:

```powershell
$env:DATABASE_URL='postgresql://postgres:your-password@127.0.0.1:5432/urban_clothing'
npm run db:setup
npm run db:test
```

`db:setup` applies the versioned migrations and loads `database/seed.sql`. Run it against a new local database. The initial migration creates project objects but does not erase an existing database.

The Node server owns the PostgreSQL connection; browser code never receives database credentials. Login creates a signed, HTTP-only, SameSite session cookie. Protected endpoints derive the user, store, and role from that cookie rather than request data. PostgreSQL repeats role and store checks through the restricted `pos_app` role and Row Level Security. Never commit a database password, connection string, or session secret.

Copy `.env.example` only as a reference. The server does not automatically load `.env`; set secrets in the terminal or deployment platform. Generate a different random `SESSION_SECRET` for every deployed environment.

See [Database design](docs/database.md) for the model and transaction behaviour.

## Suggested demonstration

1. Sign in as the cashier and complete a sale.
2. Show the generated receipt and updated stock quantity.
3. Sign in as the owner and open sales history.
4. Refund the sale and show that the stock returns.
5. Open reports to demonstrate that completed and refunded sales are distinguished.

Avoid refreshing during the demonstration because the current in-memory dataset will reset.

## Project structure

```text
.
├── index.html                 Page structure
├── css/styles.css             Application styling
├── js/app.js                  UI rendering and event handling
├── js/core.js                 Testable business rules
├── js/api.js                  Browser-to-server data adapter
├── server/                    PostgreSQL API and persistence services
├── test/core.test.js          Unit tests
├── database/                  PostgreSQL migrations, seed, and SQL tests
├── .github/workflows/test.yml Continuous integration
├── tools/serve.mjs            Dependency-free development server
├── ROADMAP.md                 Delivery sprints
└── urban-clothing-pos.html    Original emergency fallback
```

## Known limitations

- Data resets after a refresh.
- Usernames and PINs are hard-coded for demonstration purposes.
- Payment choices do not contact real payment providers.
- Offline demonstration mode resets after refresh; PostgreSQL mode persists.
- Demo users still share the classroom PIN `1234`; production accounts need individual strong passwords and a password-change flow.
- Production backup configuration remains future work.
- Customer accounts, exchanges, discounts, barcode devices, and supplier orders remain outside the current prototype.

See [ROADMAP.md](ROADMAP.md) for the database, security, testing, and deployment plan.
