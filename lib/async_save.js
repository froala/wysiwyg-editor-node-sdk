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

const { getDb, ok, bad, generateId } = require('./collab_db');

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
  const db = getDb(options.dbPath);
  const auth = options.authMiddleware || function(req, res, next) { next(); };
  app.use('/collab', auth);

  db.exec(`
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

  // Save (upsert) the current editor content for a document.
  // Called by the Froala save plugin — body key is "body" (saveParam default).
  app.post('/collab/:docId/content', (req, res) => {
    const body = req.body || {};
    const content = body.body;
    if (content == null) return bad(res, 400, '"body" field is required');

    const docId = req.params.docId;
    const savedAt = Date.now();

    try {
      const id = generateId('ac');

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

      ok(res, { doc_id: docId, saved_at: savedAt });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });

  // Fetch the latest saved content for a document.
  // Content is returned verbatim; sanitization is the caller's responsibility.
  app.get('/collab/:docId/content', (req, res) => {
    try {
      const row = db
        .prepare('SELECT doc_id, content, author_id, author_name, saved_at FROM async_content WHERE doc_id = ?')
        .get(req.params.docId);

      if (!row) return bad(res, 404, 'no content saved for this document');
      ok(res, row);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[collab] db error:', err);
      bad(res, 500, 'internal server error');
    }
  });
}

// Exported as a named property so server.js can destructure:
//   var AsyncSave = FroalaEditor.AsyncSave;
exports.AsyncSave = { attachRoutes };
