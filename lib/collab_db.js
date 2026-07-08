'use strict';

const path = require('path');

const _dbs = new Map();

function _openDb(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

function getDb(dbPath) {
  const key = dbPath || path.join(__dirname, '..', 'collab.db');
  if (!_dbs.has(key)) _dbs.set(key, _openDb(key));
  return _dbs.get(key);
}

process.on('exit', () => { _dbs.forEach(db => db.close()); });

exports.getDb      = getDb;
exports.ok         = (res, body, code) => res.status(code || 200).json(body);
exports.bad        = (res, code, msg) => res.status(code).json({ error: msg });
exports.generateId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
