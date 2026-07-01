'use strict';

// ─── Collab persistence (suggestions + comments) ─────────────────────────────
//
// Plain-JSON REST endpoints backed by SQLite for local dev.
// Anchor positions are stored as opaque JSON arrays
// and never interpreted on the server.
//
// Tables (auto-created on first call to `attachRoutes`):
//   suggestions(id, doc_id, type, author_id, author_name, timestamp,
//               original_text, suggested_text, anchor_start, anchor_end, status, replies)
//   comments(id, doc_id, author_id, author_name, timestamp, text,
//            anchor_start, anchor_end, resolved, replies)

const { getDb, ok, bad } = require('./collab_db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _stringifyAnchor(anchor) {
  if (anchor == null) return null;
  return typeof anchor === 'string' ? anchor : JSON.stringify(anchor);
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
  const db = getDb(options.dbPath);
  const auth = options.authMiddleware || function(req, res, next) { next(); };
  app.use('/collab', auth);

  db.exec(`
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
  const sugCols = db.pragma('table_info(suggestions)').map(r => r.name);
  if (!sugCols.includes('replies')) {
    db.exec("ALTER TABLE suggestions ADD COLUMN replies TEXT DEFAULT '[]'");
  }

  // ── Suggestions ──────────────────────────────────────────────────────────

  app.get('/collab/:docId/suggestions', (req, res) => {
    try {
      const rows = db
        .prepare(`
          SELECT id, doc_id, type, author_id, author_name, timestamp,
                 original_text, suggested_text, anchor_start, anchor_end, status, replies
          FROM suggestions WHERE doc_id = ? ORDER BY timestamp ASC
        `)
        .all(req.params.docId);
      ok(res, rows);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  app.post('/collab/:docId/suggestions', (req, res) => {
    const s = req.body || {};
    if (!s.id || !s.type) return bad(res, 400, 'id and type are required');

    try {
      const info = db.prepare(`
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
      if (info.changes === 0) return bad(res, 409, 'suggestion already exists');
      ok(res, { id: s.id }, 201);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  app.patch('/collab/:docId/suggestions/:id', (req, res) => {
    const body = req.body || {};
    const hasStatus = 'status' in body;
    const hasReplies = 'replies' in body;

    if (!hasStatus && !hasReplies) {
      return bad(res, 400, 'status or replies required');
    }
    if (hasStatus && !['pending', 'accepted', 'rejected'].includes(body.status)) {
      return bad(res, 400, 'invalid status');
    }

    try {
      const sets = [], params = [];
      if (hasStatus) { sets.push('status = ?'); params.push(body.status); }
      if (hasReplies) { sets.push('replies = ?'); params.push(JSON.stringify(body.replies || [])); }
      params.push(req.params.id, req.params.docId);
      db.prepare(`UPDATE suggestions SET ${sets.join(', ')} WHERE id = ? AND doc_id = ?`)
        .run(...params);
      ok(res, { id: req.params.id, ...(hasStatus ? { status: body.status } : {}) });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  app.delete('/collab/:docId/suggestions/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM suggestions WHERE id = ? AND doc_id = ?')
        .run(req.params.id, req.params.docId);
      res.sendStatus(204);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  // ── Comments ─────────────────────────────────────────────────────────────

  app.get('/collab/:docId/comments', (req, res) => {
    try {
      const rows = db
        .prepare(`
          SELECT id, doc_id, author_id, author_name, timestamp,
                 text, anchor_start, anchor_end, resolved, replies
          FROM comments WHERE doc_id = ? ORDER BY timestamp ASC
        `)
        .all(req.params.docId);
      ok(res, rows);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  app.post('/collab/:docId/comments', (req, res) => {
    const c = req.body || {};
    if (!c.id) return bad(res, 400, 'id is required');

    try {
      const info = db.prepare(`
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
      if (info.changes === 0) return bad(res, 409, 'comment already exists');
      ok(res, { id: c.id }, 201);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  app.patch('/collab/:docId/comments/:id', (req, res) => {
    const body = req.body || {};
    const hasResolved = 'resolved' in body;
    const hasReplies = 'replies' in body;

    if (!hasResolved && !hasReplies) {
      return bad(res, 400, 'resolved or replies required');
    }

    try {
      const sets = [], params = [];
      if (hasResolved) { sets.push('resolved = ?'); params.push(body.resolved ? 1 : 0); }
      if (hasReplies) { sets.push('replies = ?'); params.push(JSON.stringify(body.replies || [])); }
      params.push(req.params.id, req.params.docId);
      const info = db.prepare(`UPDATE comments SET ${sets.join(', ')} WHERE id = ? AND doc_id = ?`)
        .run(...params);
      if (info.changes === 0) return bad(res, 404, 'comment not found');
      ok(res, { id: req.params.id });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  app.delete('/collab/:docId/comments/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM comments WHERE id = ? AND doc_id = ?')
        .run(req.params.id, req.params.docId);
      res.sendStatus(204);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });
}

// Exported as a named property so server.js can destructure:
//   var CollabPersistence = FroalaEditor.CollabPersistence;
exports.CollabPersistence = { attachRoutes };
