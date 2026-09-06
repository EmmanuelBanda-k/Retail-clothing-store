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

The application is suitable for a classroom demonstration. The PostgreSQL schema, migrations, seed catalogue, transaction functions, and database tests are implemented. The browser UI still uses its in-memory adapter until Sprint 3 connects it through a Node API.

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

The database enables Row Level Security by default. Sprint 4 will create a restricted application role and operation-specific policies after authentication is connected. Never commit a database password or connection string.

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
- The UI is not connected to the database yet, so browser data still resets after refresh.
- Database access policies and production backup configuration remain future work.
- Customer accounts, exchanges, discounts, barcode devices, and supplier orders remain outside the current prototype.

See [ROADMAP.md](ROADMAP.md) for the database, security, testing, and deployment plan.
