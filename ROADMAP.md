# Retail Clothing POS delivery roadmap

The current application is an architectural prototype. The following sprints turn it into a database-backed project that the team can test through GitHub.

## Sprint 0: Stabilise the prototype

**Goal:** Create a maintainable baseline without changing behaviour.

- Separate HTML, CSS, and JavaScript.
- Keep the original single-file prototype as a fallback.
- Confirm owner, cashier, and inventory access.
- Regression-test sale, stock deduction, receipt, report, and refund flows.
- Document demo accounts and known limitations.

**Definition of done:** The refactored version completes the same demonstration workflow as the original with no console errors.

## Sprint 1: Repository and automated testing

**Goal:** Make every change reproducible and testable.

- Initialise the Git repository and connect it to the team's GitHub repository.
- Add `package.json`, formatting rules, and test commands.
- Move business calculations into independently testable modules.
- Test VAT, stock validation, sale totals, refunds, and permissions.
- Add a GitHub Actions workflow that runs tests on every push and pull request.
- Add setup and demonstration instructions to the README.

**Definition of done:** A fresh clone installs successfully and GitHub Actions reports passing tests.

## Sprint 2: PostgreSQL schema and sample data

**Status:** Implemented in the repository. Remote deployment remains pending until a Supabase project is created and linked.

**Goal:** Replace the in-memory data model with a reproducible Supabase database.

- Create tables for profiles, products, product variants, sales, sale items, refunds, and stock movements.
- Add keys, constraints, indexes, and transaction-safe stock rules.
- Store schema changes as numbered SQL migrations in the repository.
- Add realistic seed data for the classroom demonstration.
- Add database tests for constraints and stock integrity.

**Definition of done:** A new Supabase environment can be built entirely from repository migrations and seed data.

## Sprint 3: Persistent application workflows

**Goal:** Make the current screens read and write persistent data.

- Load catalogue and inventory from Supabase.
- Save sales and sale lines as one transaction.
- Record stock movements for sales, deliveries, and refunds.
- Load reports from persisted sales.
- Add visible loading, empty, offline, and error states.
- Prevent duplicate payment submission.

**Definition of done:** A completed sale remains visible after refresh and on another authorised device.

## Sprint 4: Authentication and authorisation

**Goal:** Replace demo credentials with secure accounts and enforce permissions in the database.

- Add Supabase Authentication.
- Map authenticated users to owner, cashier, and inventory roles.
- Enable Row Level Security on every exposed table.
- Add allow-and-deny tests for each role.
- Remove hard-coded PINs from frontend code.
- Keep all secret and service credentials outside the repository.

**Definition of done:** Users cannot bypass role restrictions by editing browser code or calling the API directly.

## Sprint 5: Deployment and final evidence

**Goal:** Provide a lecturer-accessible demo and the required project evidence.

- Deploy the frontend through GitHub Pages.
- Configure the production Supabase project and allowed application URLs.
- Run end-to-end tests against a clean demonstration dataset.
- Prepare architecture, domain model, and sequence diagrams.
- Write the user guide, test report, limitations, and recovery procedure.
- Rehearse a five-minute live demo and retain the offline prototype as backup.

**Definition of done:** The repository URL, deployed application, documentation, and demonstration script work from a second computer.

## Recommended order for the immediate deadline

Complete Sprint 0 first. If time remains, take only the repository setup and core unit tests from Sprint 1. Start the database work after the classroom demo so a rushed integration does not break the working fallback.
