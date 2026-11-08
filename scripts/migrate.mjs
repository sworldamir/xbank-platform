import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from '../server/db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.resolve(here, '../migrations');
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const files = (await fs.readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (existing.rowCount) {
      console.log(`Already applied: ${file}`);
      continue;
    }
    const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
    });
    console.log(`Applied: ${file}`);
  }
} catch (error) {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
