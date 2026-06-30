'use strict';

// ─── Version control persistence ─────────────────────────────────────────────
//
// REST endpoints backed by SQLite for storing named/auto snapshots of editor
// content per collaborative document. Used by the editor's CollabVersionControl
// sub-module in two flows:
//
//   • Real-time mode — mirror writes (best-effort POST) so peers joining
//     without Yjs history can still bootstrap the version list.
//   • Offline mode  — sole source of truth; every save/list/restore call
//     lands directly here.
//
// Table (auto-created on first call to `attachRoutes`):
//   versions(id, doc_id, title, description, snapshot, created_at,
//            author_id, author_name, is_named, source)

const { getDb, ok, bad, generateId } = require('./collab_db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _isNamed(title) {
  return title != null && String(title).trim() !== '' ? 1 : 0;
}

// ─── Route registration ─────────────────────────────────────────────────────

/**
 * Attach the version-control REST endpoints to an Express app.
 *
 * @param {object} app          Express app instance
 * @param {object} [options]
 * @param {string} [options.dbPath='collab.db']  SQLite file path
 */
function attachRoutes(app, options) {
  options = options || {};
  const db = getDb(options.dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      author_id TEXT,
      author_name TEXT,
      is_named INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual'
    );

    CREATE INDEX IF NOT EXISTS idx_versions_doc_id ON versions(doc_id);
  `);

  // List versions for a document (excludes snapshot for list-view performance).
  app.get('/collab/:docId/versions', (req, res) => {
    try {
      const rows = db
        .prepare(`
          SELECT id, doc_id, title, description, created_at,
                 author_id, author_name, is_named, source
          FROM versions
          WHERE doc_id = ?
          ORDER BY created_at DESC
        `)
        .all(req.params.docId);
      ok(res, rows);
    } catch (err) {
      bad(res, 500, err.message);
    }
  });

  // Fetch a single version including the full snapshot.
  app.get('/collab/:docId/versions/:id', (req, res) => {
    try {
      const row = db
        .prepare('SELECT * FROM versions WHERE id = ? AND doc_id = ?')
        .get(req.params.id, req.params.docId);
      if (!row) return bad(res, 404, 'version not found');
      ok(res, row);
    } catch (err) {
      bad(res, 500, err.message);
    }
  });

  // Create a new version. Server fills id if missing; snapshot is required.
  app.post('/collab/:docId/versions', (req, res) => {
    const v = req.body || {};
    if (v.snapshot == null) return bad(res, 400, 'snapshot is required');

    const id = v.id || generateId('rv');
    const title = v.title == null ? null : String(v.title);
    const description = v.description == null ? null : String(v.description);
    const author = v.author || {};
    const source = v.source === 'auto' ? 'auto' : 'manual';

    try {
      const info = db.prepare(`
        INSERT OR IGNORE INTO versions
        (id, doc_id, title, description, snapshot, created_at,
         author_id, author_name, is_named, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.params.docId,
        title,
        description,
        v.snapshot,
        Date.now(),
        author.id || null,
        author.name || null,
        _isNamed(title),
        source
      );
      if (info.changes === 0) return bad(res, 409, 'version already exists');
      ok(res, { id }, 201);
    } catch (err) {
      bad(res, 500, err.message);
    }
  });

  // Update title and/or description. Recomputes is_named when title changes.
  app.patch('/collab/:docId/versions/:id', (req, res) => {
    const body = req.body || {};
    const hasTitle = 'title' in body;
    const hasDesc = 'description' in body;
    if (!hasTitle && !hasDesc) {
      return bad(res, 400, 'title or description required');
    }

    try {
      if (hasTitle) {
        const title = body.title == null ? null : String(body.title);
        db.prepare(`
          UPDATE versions SET title = ?, is_named = ?
          WHERE id = ? AND doc_id = ?
        `).run(title, _isNamed(title), req.params.id, req.params.docId);
      }
      if (hasDesc) {
        const description = body.description == null ? null : String(body.description);
        db.prepare(`
          UPDATE versions SET description = ?
          WHERE id = ? AND doc_id = ?
        `).run(description, req.params.id, req.params.docId);
      }

      const row = db
        .prepare('SELECT * FROM versions WHERE id = ? AND doc_id = ?')
        .get(req.params.id, req.params.docId);
      if (!row) return bad(res, 404, 'version not found');
      ok(res, row);
    } catch (err) {
      bad(res, 500, err.message);
    }
  });

  app.delete('/collab/:docId/versions/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM versions WHERE id = ? AND doc_id = ?')
        .run(req.params.id, req.params.docId);
      res.sendStatus(204);
    } catch (err) {
      bad(res, 500, err.message);
    }
  });
}

// Exported as a named property so server.js can destructure:
//   var VersionControl = FroalaEditor.VersionControl;
exports.VersionControl = { attachRoutes };
