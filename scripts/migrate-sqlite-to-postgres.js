#!/usr/bin/env node
/**
 * One-time SQLite → PostgreSQL data migration.
 * Does not delete the SQLite database file.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { connectAndMigrate, withTransaction, closePool, getDatabaseUrl } = require('../db');

const SQLITE_PATH =
  process.env.SQLITE_MIGRATE_PATH || path.join(__dirname, '..', 'data', 'prabhu.db');

function backupSqlite(sqlitePath) {
  if (!fs.existsSync(sqlitePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${sqlitePath}.backup-${stamp}`;
  fs.copyFileSync(sqlitePath, backupPath);
  return backupPath;
}

function tableExists(sqlite, name) {
  return Boolean(
    sqlite
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name)
  );
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return true;
  return Number(value) !== 0;
}

async function resetIdentity(tx, table) {
  const row = await tx.queryOne(`SELECT MAX(id)::bigint AS max_id FROM ${table}`);
  const maxId = row?.max_id;
  if (maxId == null) {
    await tx.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), 1, false)`, [table]);
  } else {
    await tx.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), $2::bigint, true)`, [
      table,
      maxId,
    ]);
  }
}

async function migrateTable(tx, label, rows, upsertSql, valuesFn) {
  let imported = 0;
  for (const row of rows) {
    const result = await tx.query(upsertSql, valuesFn(row));
    imported += result.rowCount || 0;
  }
  console.log(`${label}: ${imported} row(s) imported/updated (source had ${rows.length})`);
  return imported;
}

async function main() {
  if (!getDatabaseUrl()) {
    console.error('DATABASE_URL is not set. Add it to .env before migrating.');
    process.exit(1);
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`SQLite database not found at ${SQLITE_PATH}`);
    process.exit(1);
  }

  const backupPath = backupSqlite(SQLITE_PATH);
  if (backupPath) {
    console.log(`SQLite backup created: ${backupPath}`);
  }

  console.log('Connecting to PostgreSQL and applying schema migrations...');
  await connectAndMigrate();

  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  try {
    await withTransaction(async (tx) => {
      // settings
      if (tableExists(sqlite, 'settings')) {
        const rows = sqlite.prepare('SELECT id, email, password FROM settings').all();
        await migrateTable(
          tx,
          'settings',
          rows,
          `INSERT INTO settings (id, email, password)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             password = EXCLUDED.password`,
          (row) => [row.id, row.email, row.password]
        );
      } else {
        console.log('settings: skipped (table missing in SQLite)');
      }

      // inventory
      if (tableExists(sqlite, 'inventory')) {
        const rows = sqlite
          .prepare(
            `SELECT id, name, description, image_url, subcategory, sport_type, price, in_stock, created_at
             FROM inventory`
          )
          .all();
        await migrateTable(
          tx,
          'inventory',
          rows,
          `INSERT INTO inventory
             (id, name, description, image_url, subcategory, sport_type, price, in_stock, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             image_url = EXCLUDED.image_url,
             subcategory = EXCLUDED.subcategory,
             sport_type = EXCLUDED.sport_type,
             price = EXCLUDED.price,
             in_stock = EXCLUDED.in_stock,
             created_at = EXCLUDED.created_at`,
          (row) => [
            row.id,
            row.name,
            row.description,
            row.image_url,
            row.subcategory || 'gifts',
            row.sport_type,
            row.price,
            toBool(row.in_stock),
            row.created_at,
          ]
        );
        await resetIdentity(tx, 'inventory');
      } else {
        console.log('inventory: skipped (table missing in SQLite)');
      }

      // contact_submissions + legacy contacts
      const contactRows = [];
      if (tableExists(sqlite, 'contact_submissions')) {
        contactRows.push(
          ...sqlite
            .prepare(
              `SELECT id, name, email, phone, message, created_at FROM contact_submissions`
            )
            .all()
            .map((row) => ({ ...row, _source: 'contact_submissions' }))
        );
      }
      if (tableExists(sqlite, 'contacts')) {
        contactRows.push(
          ...sqlite
            .prepare(`SELECT id, name, email, phone, message, created_at FROM contacts`)
            .all()
            .map((row) => ({ ...row, _source: 'contacts' }))
        );
      }

      // Prefer preserving IDs from contact_submissions; legacy contacts without ID clash insert new.
      let contactImported = 0;
      for (const row of contactRows) {
        if (row._source === 'contact_submissions') {
          const result = await tx.query(
            `INSERT INTO contact_submissions (id, name, email, phone, message, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               email = EXCLUDED.email,
               phone = EXCLUDED.phone,
               message = EXCLUDED.message,
               created_at = EXCLUDED.created_at`,
            [row.id, row.name, row.email, row.phone, row.message, row.created_at]
          );
          contactImported += result.rowCount || 0;
        } else {
          // Avoid duplicate by natural key when re-running
          const existing = await tx.queryOne(
            `SELECT id FROM contact_submissions
             WHERE email = $1 AND message = $2 AND created_at = $3::timestamptz
             LIMIT 1`,
            [row.email, row.message, row.created_at]
          );
          if (existing) continue;
          const result = await tx.query(
            `INSERT INTO contact_submissions (name, email, phone, message, created_at)
             VALUES ($1, $2, $3, $4, $5::timestamptz)`,
            [row.name, row.email, row.phone, row.message, row.created_at]
          );
          contactImported += result.rowCount || 0;
        }
      }
      console.log(
        `contact_submissions: ${contactImported} row(s) imported/updated (sources had ${contactRows.length})`
      );
      await resetIdentity(tx, 'contact_submissions');

      // site_images
      if (tableExists(sqlite, 'site_images')) {
        const rows = sqlite
          .prepare('SELECT key, image_url, updated_at FROM site_images')
          .all();
        await migrateTable(
          tx,
          'site_images',
          rows,
          `INSERT INTO site_images (key, image_url, updated_at)
           VALUES ($1, $2, $3::timestamptz)
           ON CONFLICT (key) DO UPDATE SET
             image_url = EXCLUDED.image_url,
             updated_at = EXCLUDED.updated_at`,
          (row) => [row.key, row.image_url, row.updated_at]
        );
      } else {
        console.log('site_images: skipped (table missing in SQLite)');
      }

      // legacy categories / products
      if (tableExists(sqlite, 'categories')) {
        const rows = sqlite.prepare('SELECT id, slug, name, description FROM categories').all();
        await migrateTable(
          tx,
          'legacy_categories',
          rows,
          `INSERT INTO legacy_categories (id, slug, name, description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             slug = EXCLUDED.slug,
             name = EXCLUDED.name,
             description = EXCLUDED.description`,
          (row) => [row.id, row.slug, row.name, row.description]
        );
        await resetIdentity(tx, 'legacy_categories');
      } else {
        console.log('legacy_categories: skipped (categories missing in SQLite)');
      }

      if (tableExists(sqlite, 'products')) {
        const rows = sqlite
          .prepare(
            `SELECT id, name, category_slug, description, image_url, in_stock, created_at
             FROM products`
          )
          .all();
        await migrateTable(
          tx,
          'legacy_products',
          rows,
          `INSERT INTO legacy_products
             (id, name, category_slug, description, image_url, in_stock, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             category_slug = EXCLUDED.category_slug,
             description = EXCLUDED.description,
             image_url = EXCLUDED.image_url,
             in_stock = EXCLUDED.in_stock,
             created_at = EXCLUDED.created_at`,
          (row) => [
            row.id,
            row.name,
            row.category_slug,
            row.description,
            row.image_url,
            toBool(row.in_stock),
            row.created_at,
          ]
        );
        await resetIdentity(tx, 'legacy_products');
      } else {
        console.log('legacy_products: skipped (products missing in SQLite)');
      }
    });

    console.log('Migration completed successfully.');
    console.log(`SQLite source left intact at: ${SQLITE_PATH}`);
  } finally {
    sqlite.close();
    await closePool();
  }
}

main().catch(async (err) => {
  console.error('Migration failed:', err.message);
  try {
    await closePool();
  } catch {
    // ignore
  }
  process.exit(1);
});
