const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

let pool;

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

function createPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required. Set it to your Supabase PostgreSQL connection string (Project Settings → Database → Connect).'
    );
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

function getPool() {
  if (!pool) {
    pool = createPool();
    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query: (text, params = []) => client.query(text, params),
      queryOne: async (text, params = []) => {
        const result = await client.query(text, params);
        return result.rows[0] || null;
      },
      queryAll: async (text, params = []) => {
        const result = await client.query(text, params);
        return result.rows;
      },
    };
    const value = await fn(tx);
    await client.query('COMMIT');
    return value;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function runMigrations() {
  const client = await getPool().connect();
  try {
    await ensureMigrationsTable(client);
    const appliedRows = await client.query('SELECT id FROM schema_migrations');
    const applied = new Set(appliedRows.rows.map((row) => row.id));
    const files = listMigrationFiles();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

async function connectAndMigrate() {
  const result = await query('SELECT 1 AS ok');
  if (!result.rows[0]?.ok) {
    throw new Error('PostgreSQL connectivity check failed.');
  }
  await runMigrations();
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  getDatabaseUrl,
  query,
  queryOne,
  queryAll,
  withTransaction,
  runMigrations,
  connectAndMigrate,
  closePool,
};
