'use strict';

// ─── Async editor content persistence ────────────────────────────────────────
//
// REST endpoints backed by SQLite for storing the latest editor HTML per document.
// Called by the Froala save plugin (POST with body key "body") when the editor
// runs in async/offline mode — i.e. when realTimeConfig.syncUrl is not set.
//
// Table (auto-created on first call to `attachRoutes`):
//   async_content(id, doc_id, content, author_id, author_name, saved_at)
//
// Each document has exactly one row — a POST always upserts the current content.

let _db = null;

function _getDb(dbPath) {
  if (_db) return _db;

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    throw new Error(
      '[async_save] better-sqlite3 is required. ' +
      'Install it as a dev dependency: npm install --save-dev better-sqlite3'
    );
  }

  _db = new Database(dbPath || 'collab.db');
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS async_content (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      saved_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_async_content_doc_id ON async_content(doc_id);
  `);

  return _db;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _ok(res, body, code) {
  res.status(code || 200).json(body);
}

function _bad(res, code, msg) {
  res.status(code).json({ error: msg });
}

function _generateId() {
  return (
    'ac-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 7)
  );
}

// ─── Route registration ───────────────────────────────────────────────────────

/**
 * Attach the async-save REST endpoints to an Express app.
 *
 * @param {object} app          Express app instance
 * @param {object} [options]
 * @param {string} [options.dbPath='collab.db']  SQLite file path
 */
function attachRoutes(app, options) {
  options = options || {};
  const db = _getDb(options.dbPath);

  // Save (upsert) the current editor content for a document.
  // Called by the Froala save plugin — body key is "body" (saveParam default).
  app.post('/collab/:docId/content', (req, res) => {
    const body = req.body || {};
    const content = body.body;
    if (content == null) return _bad(res, 400, '"body" field is required');

    const docId = req.params.docId;
    const savedAt = Date.now();

    try {
      const existing = db
        .prepare('SELECT id FROM async_content WHERE doc_id = ?')
        .get(docId);

      const id = (existing && existing.id) || _generateId();

      db.prepare(`
        INSERT INTO async_content (id, doc_id, content, author_id, author_name, saved_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(doc_id) DO UPDATE SET
          content    = excluded.content,
          author_id  = excluded.author_id,
          author_name = excluded.author_name,
          saved_at   = excluded.saved_at
      `).run(
        id,
        docId,
        content,
        body.authorId || null,
        body.authorName || null,
        savedAt
      );

      _ok(res, { doc_id: docId, saved_at: savedAt });
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  // Fetch the latest saved content for a document.
  app.get('/collab/:docId/content', (req, res) => {
    try {
      const row = db
        .prepare('SELECT doc_id, content, author_id, author_name, saved_at FROM async_content WHERE doc_id = ?')
        .get(req.params.docId);

      if (!row) return _bad(res, 404, 'no content saved for this document');
      _ok(res, row);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });
}

exports.AsyncSave = { attachRoutes };
