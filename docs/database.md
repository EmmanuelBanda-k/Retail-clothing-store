# Database design

## Purpose

Sprint 2 provides a reproducible PostgreSQL foundation for the POS. Migrations define the schema and transaction functions. Seed data creates the Lusaka demonstration catalogue. pgTAP tests verify structure and transaction integrity.

## Model

```text
stores
  ├── profiles → auth.users
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

Row Level Security is enabled on every exposed table. Grants are revoked from `anon` and `authenticated`, and transaction functions are not executable by browser roles yet. This deny-by-default state prevents accidental public access before Sprint 4 adds tested role policies.

Both transaction functions use `security definer`, an empty `search_path`, and fully qualified object names. Sprint 4 will grant function execution only to roles allowed to perform each operation.

## Files

- `supabase/migrations/202609060001_initial_pos_schema.sql`: types, tables, constraints, indexes, triggers, and security baseline
- `supabase/migrations/202609060002_sales_transactions.sql`: atomic sale and refund functions
- `supabase/seed.sql`: Lusaka store, catalogue variants, inventory, and opening audit entries
- `supabase/tests/schema.test.sql`: structural and RLS checks
- `supabase/tests/transactions.test.sql`: sale, insufficient-stock, and refund tests

## Local verification

The Supabase CLI requires a Docker-compatible runtime:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

GitHub Actions executes the same database tests in a clean environment.
