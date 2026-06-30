'use strict';

// ─── Collab persistence (suggestions + comments) ─────────────────────────────
//
// Plain-JSON REST endpoints backed by SQLite for local dev. The Node SDK has
// anchor positions are stored as opaque JSON arrays
// and never interpreted on the server.
//
// Tables (auto-created on first call to `attachRoutes`):
//   suggestions(id, doc_id, type, author_id, author_name, timestamp,
//               original_text, suggested_text, anchor_start, anchor_end, status)
//   comments(id, doc_id, author_id, author_name, timestamp, text,
//            anchor_start, anchor_end, resolved, replies)

let _db = null;

function _getDb(dbPath) {
  if (_db) return _db;

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    throw new Error(
      '[collab_persistence] better-sqlite3 is required. ' +
      'Install it as a dev dependency: npm install --save-dev better-sqlite3'
    );
  }

  _db = new Database(dbPath || 'collab.db');
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      type TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      timestamp INTEGER,
      original_text TEXT,
      suggested_text TEXT,
      anchor_start TEXT,
      anchor_end TEXT,
      status TEXT DEFAULT 'pending',
      replies TEXT DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_suggestions_doc_id ON suggestions(doc_id);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      timestamp INTEGER,
      text TEXT,
      anchor_start TEXT,
      anchor_end TEXT,
      resolved INTEGER DEFAULT 0,
      replies TEXT DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_comments_doc_id ON comments(doc_id);
  `);

  // Add replies column to existing suggestions tables that predate this change.
  try { _db.exec("ALTER TABLE suggestions ADD COLUMN replies TEXT DEFAULT '[]'"); } catch (_) {}

  return _db;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _stringifyAnchor(anchor) {
  if (anchor == null) return null;
  return typeof anchor === 'string' ? anchor : JSON.stringify(anchor);
}

function _ok(res, body, code) {
  res.status(code || 200).json(body);
}

function _bad(res, code, msg) {
  res.status(code).json({ error: msg });
}

// ─── Route registration ─────────────────────────────────────────────────────

/**
 * Attach the suggestion + comment REST endpoints to an Express app.
 *
 * @param {object} app          Express app instance
 * @param {object} [options]
 * @param {string} [options.dbPath='collab.db']  SQLite file path
 */
function attachRoutes(app, options) {
  options = options || {};
  const db = _getDb(options.dbPath);

  // ── Suggestions ──────────────────────────────────────────────────────────

  app.get('/collab/:docId/suggestions', (req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM suggestions WHERE doc_id = ? ORDER BY timestamp ASC')
        .all(req.params.docId);
      _ok(res, rows);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.post('/collab/:docId/suggestions', (req, res) => {
    const s = req.body || {};
    if (!s.id || !s.type) return _bad(res, 400, 'id and type are required');

    try {
      db.prepare(`
        INSERT OR IGNORE INTO suggestions
        (id, doc_id, type, author_id, author_name, timestamp,
         original_text, suggested_text, anchor_start, anchor_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        s.id,
        req.params.docId,
        s.type,
        s.authorId || null,
        s.authorName || null,
        s.timestamp || Date.now(),
        s.originalText == null ? null : s.originalText,
        s.suggestedText == null ? null : s.suggestedText,
        _stringifyAnchor(s.anchor && s.anchor.start),
        _stringifyAnchor(s.anchor && s.anchor.end),
        s.status || 'pending'
      );
      _ok(res, { id: s.id }, 201);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.patch('/collab/:docId/suggestions/:id', (req, res) => {
    const body = req.body || {};
    const hasStatus = 'status' in body;
    const hasReplies = 'replies' in body;

    if (!hasStatus && !hasReplies) {
      return _bad(res, 400, 'status or replies required');
    }
    if (hasStatus && !['pending', 'accepted', 'rejected'].includes(body.status)) {
      return _bad(res, 400, 'invalid status');
    }

    try {
      if (hasStatus) {
        db.prepare('UPDATE suggestions SET status = ? WHERE id = ? AND doc_id = ?')
          .run(body.status, req.params.id, req.params.docId);
      }
      if (hasReplies) {
        db.prepare('UPDATE suggestions SET replies = ? WHERE id = ? AND doc_id = ?')
          .run(JSON.stringify(body.replies || []), req.params.id, req.params.docId);
      }
      _ok(res, { id: req.params.id, ...(hasStatus ? { status: body.status } : {}) });
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.delete('/collab/:docId/suggestions/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM suggestions WHERE id = ? AND doc_id = ?')
        .run(req.params.id, req.params.docId);
      res.sendStatus(204);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  // ── Comments ─────────────────────────────────────────────────────────────

  app.get('/collab/:docId/comments', (req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM comments WHERE doc_id = ? ORDER BY timestamp ASC')
        .all(req.params.docId);
      _ok(res, rows);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.post('/collab/:docId/comments', (req, res) => {
    const c = req.body || {};
    if (!c.id) return _bad(res, 400, 'id is required');

    try {
      db.prepare(`
        INSERT OR IGNORE INTO comments
        (id, doc_id, author_id, author_name, timestamp, text,
         anchor_start, anchor_end, resolved, replies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        c.id,
        req.params.docId,
        c.authorId || null,
        c.authorName || null,
        c.timestamp || Date.now(),
        c.text || '',
        _stringifyAnchor(c.anchor && c.anchor.start),
        _stringifyAnchor(c.anchor && c.anchor.end),
        c.resolved ? 1 : 0,
        JSON.stringify(c.replies || [])
      );
      _ok(res, { id: c.id }, 201);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.patch('/collab/:docId/comments/:id', (req, res) => {
    const body = req.body || {};
    try {
      if ('resolved' in body) {
        db.prepare('UPDATE comments SET resolved = ? WHERE id = ? AND doc_id = ?')
          .run(body.resolved ? 1 : 0, req.params.id, req.params.docId);
      }
      if ('replies' in body) {
        db.prepare('UPDATE comments SET replies = ? WHERE id = ? AND doc_id = ?')
          .run(JSON.stringify(body.replies || []), req.params.id, req.params.docId);
      }
      _ok(res, { id: req.params.id });
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.delete('/collab/:docId/comments/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM comments WHERE id = ? AND doc_id = ?')
        .run(req.params.id, req.params.docId);
      res.sendStatus(204);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });
}

exports.CollabPersistence = { attachRoutes };
