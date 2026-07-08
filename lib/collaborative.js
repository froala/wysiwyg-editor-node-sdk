'use strict';

const WebSocket = require('ws');

// ─── Structured logger ────────────────────────────────────────────────────────

function log(level, msg, extra) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
}

// ─── Room registry ────────────────────────────────────────────────────────────
//
// The server is a pure relay: it groups connections by docId and broadcasts
// every incoming message to the other members of that document. All collaboration
// logic lives in the browser clients.
//
// Trade-off: a client that joins an empty document receives no historical state
// until another peer reconnects. For an in-memory relay this is acceptable;
// durable state (Redis, LevelDB, etc.) would belong here if persistence is needed.

const docs = new Map(); // docId → Set<WebSocket>

const MAX_MESSAGE_BYTES = 1_048_576; // 1 MB

// ─── Core connection handler ──────────────────────────────────────────────────

function setupWSConnection(conn, req) {
  const docId = decodeURIComponent(
    (req.url || '/').replace(/^\//, '').split('?')[0] || 'default-doc'
  );

  if (!docs.has(docId)) docs.set(docId, new Set());
  const doc = docs.get(docId);
  doc.add(conn);

  conn.isAlive = true;
  conn.on('pong', () => { conn.isAlive = true; });

  log('info', 'client connected', { docId, peers: doc.size });

  conn.on('message', (message) => {
    if (message.length > MAX_MESSAGE_BYTES) {
      log('warn', 'oversized message dropped', { docId, size: message.length });
      return;
    }
    // Relay to every other peer in the document — no parsing, no protocol knowledge.
    for (const peer of doc) {
      if (peer !== conn && peer.readyState === WebSocket.OPEN) {
        peer.send(message);
      }
    }
  });

  conn.on('close', () => {
    doc.delete(conn);
    if (doc.size === 0) docs.delete(docId);
    log('info', 'client disconnected', { docId, peers: doc.size });
  });

  conn.on('error', (err) => {
    log('error', 'socket error', { docId, error: err.message });
    doc.delete(conn);
    if (doc.size === 0) docs.delete(docId);
  });
}

// ─── Keepalive heartbeat ──────────────────────────────────────────────────────

function _startKeepalive(wss) {
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);
  wss.on('close', () => clearInterval(interval));
}

// ─── Stats (for /health) ──────────────────────────────────────────────────────

function getStats() {
  let clients = 0;
  docs.forEach(doc => { clients += doc.size; });
  return { docs: docs.size, clients };
}

// ─── Standalone server ────────────────────────────────────────────────────────

function createServer(options = {}) {
  const http = require('http');

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getStats()));
      return;
    }
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('WebSocket connections only');
  });

  const wss = new WebSocket.Server({ server: httpServer });
  wss.on('connection', setupWSConnection);
  _startKeepalive(wss);

  const port = options.port || 3000;
  httpServer.listen(port, () => {
    log('info', 'collaborative relay server started', { port });
  });

  return wss;
}

// ─── Attach to existing HTTP / Express server ─────────────────────────────────

function attachToServer(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });
  wss.on('connection', setupWSConnection);
  _startKeepalive(wss);
  log('info', 'collaborative relay server attached to existing HTTP server');
  return wss;
}

// Exported as a named property so server.js can destructure:
//   var Collaborative = FroalaEditor.Collaborative;
exports.Collaborative = { setupWSConnection, createServer, attachToServer, getStats };
