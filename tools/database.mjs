import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const command = process.argv[2];
const supported = new Set(['setup', 'test']);
if (!supported.has(command)) {
  console.error('Usage: node tools/database.mjs <setup|test>');
  process.exit(1);
}

const candidates = [
  process.env.PSQL_PATH,
  'psql',
  'C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe',
  'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe'
].filter(Boolean);

const psql = candidates.find(candidate => candidate === 'psql' || existsSync(candidate));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Set DATABASE_URL to a PostgreSQL connection string before running this command.');
  console.error("PowerShell example: $env:DATABASE_URL='postgresql://postgres:password@127.0.0.1:5432/urban_clothing'");
  process.exit(1);
}

const setupFiles = [
  'database/migrations/202609060001_initial_pos_schema.sql',
  'database/migrations/202609060002_sales_transactions.sql',
  'database/seed.sql'
];
const testFiles = [
  'database/tests/schema.test.sql',
  'database/tests/transactions.test.sql'
];

for (const file of command === 'setup' ? setupFiles : testFiles) {
  console.log(`Running ${file}`);
  const result = spawnSync(psql, [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', file], {
    stdio: 'inherit',
    shell: psql === 'psql'
  });
  if (result.error) {
    console.error(`Unable to run psql: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
