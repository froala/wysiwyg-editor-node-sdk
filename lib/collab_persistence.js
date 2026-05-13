'use strict';

// ─── Collab persistence (suggestions + comments) ─────────────────────────────
//
// Plain-JSON REST endpoints backed by SQLite for local dev. The Node SDK has
// anchor positions are stored as opaque JSON arrays
// and never interpreted on the server.
//
// Tables (auto-created on first call to `attachRoutes`):
//   suggestions(id, room, type, author_id, author_name, timestamp,
//               original_text, suggested_text, anchor_start, anchor_end, status)
//   comments(id, room, author_id, author_name, timestamp, text,
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
      room TEXT NOT NULL,
      type TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      timestamp INTEGER,
      original_text TEXT,
      suggested_text TEXT,
      anchor_start TEXT,
      anchor_end TEXT,
      status TEXT DEFAULT 'pending'
    );

    CREATE INDEX IF NOT EXISTS idx_suggestions_room ON suggestions(room);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      timestamp INTEGER,
      text TEXT,
      anchor_start TEXT,
      anchor_end TEXT,
      resolved INTEGER DEFAULT 0,
      replies TEXT DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_comments_room ON comments(room);
  `);

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

  app.get('/collab/:room/suggestions', (req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM suggestions WHERE room = ? ORDER BY timestamp ASC')
        .all(req.params.room);
      _ok(res, rows);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.post('/collab/:room/suggestions', (req, res) => {
    const s = req.body || {};
    if (!s.id || !s.type) return _bad(res, 400, 'id and type are required');

    try {
      db.prepare(`
        INSERT OR IGNORE INTO suggestions
        (id, room, type, author_id, author_name, timestamp,
         original_text, suggested_text, anchor_start, anchor_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        s.id,
        req.params.room,
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

  app.patch('/collab/:room/suggestions/:id', (req, res) => {
    const status = req.body && req.body.status;
    if (!status || !['pending', 'accepted', 'rejected'].includes(status)) {
      return _bad(res, 400, 'invalid status');
    }
    try {
      db.prepare(`
        UPDATE suggestions SET status = ?
        WHERE id = ? AND room = ?
      `).run(status, req.params.id, req.params.room);
      _ok(res, { id: req.params.id, status });
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.delete('/collab/:room/suggestions/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM suggestions WHERE id = ? AND room = ?')
        .run(req.params.id, req.params.room);
      res.sendStatus(204);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  // ── Comments ─────────────────────────────────────────────────────────────

  app.get('/collab/:room/comments', (req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM comments WHERE room = ? ORDER BY timestamp ASC')
        .all(req.params.room);
      _ok(res, rows);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.post('/collab/:room/comments', (req, res) => {
    const c = req.body || {};
    if (!c.id) return _bad(res, 400, 'id is required');

    try {
      db.prepare(`
        INSERT OR IGNORE INTO comments
        (id, room, author_id, author_name, timestamp, text,
         anchor_start, anchor_end, resolved, replies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        c.id,
        req.params.room,
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

  app.patch('/collab/:room/comments/:id', (req, res) => {
    const body = req.body || {};
    try {
      if ('resolved' in body) {
        db.prepare('UPDATE comments SET resolved = ? WHERE id = ? AND room = ?')
          .run(body.resolved ? 1 : 0, req.params.id, req.params.room);
      }
      if ('replies' in body) {
        db.prepare('UPDATE comments SET replies = ? WHERE id = ? AND room = ?')
          .run(JSON.stringify(body.replies || []), req.params.id, req.params.room);
      }
      _ok(res, { id: req.params.id });
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });

  app.delete('/collab/:room/comments/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM comments WHERE id = ? AND room = ?')
        .run(req.params.id, req.params.room);
      res.sendStatus(204);
    } catch (err) {
      _bad(res, 500, err.message);
    }
  });
}

exports.CollabPersistence = { attachRoutes };
