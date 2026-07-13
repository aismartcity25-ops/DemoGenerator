'use strict';

/**
 * lancedb.js — Helper di connessione/apertura/tabella LanceDB.
 *
 * Centralizza la gestione del DB vettoriale. Supporta percorso per-demo:
 *   data/lancedb/<kbId>/documents
 *
 * La tabella viene aperta UNA volta e riusata (fix: oggi rag.js apre il DB
 * e ricontrolla tableNames a ogni retrieve).
 */

const lancedb = require('@lancedb/lancedb');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'lancedb');
const DIMENSIONS = 1536;

// Cache delle tabelle aperte per kbId → evita reopen ad ogni query.
const _tableCache = new Map();

function kbDbPath(kbId) {
  return path.join(DATA_DIR, String(kbId));
}

async function connect(dbPath) {
  return lancedb.connect(dbPath);
}

const SCHEMA_ROW = {
  vector: Array(DIMENSIONS).fill(0),
  text: '',
  title: '',
  url: '',
  site: '',
  hash: '',
  chunkIndex: 0,
  chunkCount: 0,
  createdAt: Date.now()
};

async function openOrCreateTable(kbId) {
  if (_tableCache.has(kbId)) return _tableCache.get(kbId);

  const dbPath = kbDbPath(kbId);
  fs.mkdirSync(dbPath, { recursive: true });

  const db = await lancedb.connect(dbPath);
  const tables = await db.tableNames();

  let table;
  if (tables.includes('documents')) {
    try {
      table = await db.openTable('documents');
    } catch (err) {
      if (err.message && err.message.includes('was not found')) {
        await db.dropTable('documents');
      } else {
        throw err;
      }
      table = await db.createTable('documents', [SCHEMA_ROW]);
      await table.delete("hash = ''");
    }
  } else {
    table = await db.createTable('documents', [SCHEMA_ROW]);
    await table.delete("hash = ''");
  }

  _tableCache.set(kbId, table);
  return table;
}

function clearTableCache(kbId) {
  if (kbId) _tableCache.delete(kbId);
  else _tableCache.clear();
}

async function tableExists(kbId) {
  const dbPath = kbDbPath(kbId);
  if (!fs.existsSync(dbPath)) return false;
  try {
    const db = await lancedb.connect(dbPath);
    const tables = await db.tableNames();
    return tables.includes('documents');
  } catch {
    return false;
  }
}

module.exports = {
  DIMENSIONS,
  DATA_DIR,
  SCHEMA_ROW,
  kbDbPath,
  connect,
  openOrCreateTable,
  clearTableCache,
  tableExists
};
