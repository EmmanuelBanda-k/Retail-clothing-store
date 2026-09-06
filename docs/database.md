# Database design

## Purpose

Sprint 2 provides a reproducible PostgreSQL foundation for the POS. Migrations define the schema and transaction functions. Seed data creates the Lusaka demonstration catalogue. Self-checking SQL scripts verify structure and transaction integrity without Docker or database extensions beyond `pgcrypto`.

## Model

```text
stores
  ├── profiles
  ├── products
  │     └── product_variants
  │              └── inventory
  └── sales
        ├── sale_items → product_variants
        ├── refunds
        └── stock_movements → product_variants
```

Products contain information shared by every size and colour. Product variants represent sellable SKUs. Inventory records each variant's quantity at each store, allowing later multi-branch expansion without redesigning the catalogue.

## Stock integrity

The application must call `complete_sale` instead of inserting a sale and updating inventory through separate browser requests. The function validates the cashier and items, locks inventory rows, checks availability, calculates totals from database prices, records the receipt, deducts inventory, and writes audit records in one transaction.

The database calculates prices rather than trusting values supplied by the browser.

`refund_sale` requires an active owner at the sale's store. It locks the sale, prevents a second refund, restores inventory, creates the refund record, and writes the stock audit entries in one transaction.

## Monetary values

Money uses `numeric(12,2)` rather than floating-point values. Sale totals include VAT at 16 percent. Each sale stores its subtotal, VAT, and total so historical receipts remain unchanged if tax rules change later.

## Audit trail

`stock_movements` explains every quantity change. Opening stock, sales, refunds, deliveries, and manual adjustments have distinct reasons. Reports can reconcile current inventory with its transaction history.

## Security boundary

Row Level Security is enabled on every application table, and transaction functions are not executable by `public`. This deny-by-default state prevents accidental application access before Sprint 4 adds a restricted database role and tested policies.

Both transaction functions use `security definer`, an empty `search_path`, and fully qualified object names. Sprint 4 will grant function execution only to roles allowed to perform each operation.

## Files

- `database/migrations/202609060001_initial_pos_schema.sql`: types, tables, constraints, indexes, triggers, and security baseline
- `database/migrations/202609060002_sales_transactions.sql`: atomic sale and refund functions
- `database/seed.sql`: Lusaka store, demo users, catalogue variants, inventory, and opening audit entries
- `database/tests/schema.test.sql`: structural and RLS checks
- `database/tests/transactions.test.sql`: sale, insufficient-stock, and refund tests

## Local verification

Set a connection string for a new local PostgreSQL database:

```powershell
$env:DATABASE_URL='postgresql://postgres:your-password@127.0.0.1:5432/urban_clothing'
npm run db:setup
npm run db:test
```

GitHub Actions executes the same database tests against a temporary PostgreSQL 14 service.

## Application connection

The browser calls relative `/api` endpoints. `tools/serve.mjs` serves the static frontend and routes API requests to `server/api.js`. `server/pos-service.js` translates database rows into the existing POS view model and performs server-side mutations.

The connection string exists only in the Node process. Start persistent mode with:

```powershell
$env:DATABASE_URL='postgresql://postgres:your-password@127.0.0.1:5432/urban_clothing'
npm start
```

If `DATABASE_URL` is missing, the API responds as unavailable and the browser uses its seeded in-memory fallback. This provides an offline demonstration path without weakening the persistent implementation.

## Authentication and database authorisation

Persistent login compares the submitted PIN with the `pgcrypto` password hash on the server. The API returns a signed session cookie with these protections:

- `HttpOnly` prevents browser JavaScript from reading the token.
- `SameSite=Strict` limits cross-site requests.
- `Secure` is enabled when `NODE_ENV=production`.
- The signed payload expires after eight hours.
- Mutation endpoints reject mismatched browser origins.

The API ignores client-supplied identity fields. It reads the user ID, store ID, and role from the verified cookie.

For each application query, the database connection starts a transaction, assumes the `pos_app` role, and sets transaction-local identity values. Row Level Security limits reads to the signed-in user's store. Cashiers can complete sales. Owners can issue refunds. Owners and inventory managers can add products or receive stock.

Security-definer functions perform the same role and identity checks before changing data. Direct table writes are not granted to `pos_app`, so modifying browser requests cannot bypass the transaction rules.
