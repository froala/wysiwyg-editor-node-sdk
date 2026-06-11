'use strict';

const WebSocket = require('ws');

// ─── Structured logger ────────────────────────────────────────────────────────

function log(level, msg, extra) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
}

// ─── Room registry ────────────────────────────────────────────────────────────
//
// The server is a pure relay: it groups connections by room and broadcasts
// every incoming message to the other members of that room. All collaboration
// logic lives in the browser clients.
//
// Trade-off: a client that joins an empty room receives no historical state
// until another peer reconnects. For an in-memory relay this is acceptable;
// durable state (Redis, LevelDB, etc.) would belong here if persistence is needed.

const rooms = new Map(); // roomName → Set<WebSocket>

// ─── Core connection handler ──────────────────────────────────────────────────

function setupWSConnection(conn, req) {
  const roomName = decodeURIComponent(
    (req.url || '/').replace(/^\//, '').split('?')[0] || 'default-room'
  );

  if (!rooms.has(roomName)) rooms.set(roomName, new Set());
  const room = rooms.get(roomName);
  room.add(conn);

  log('info', 'client connected', { room: roomName, peers: room.size });

  conn.on('message', (message) => {
    // Relay to every other peer in the room — no parsing, no protocol knowledge.
    for (const peer of room) {
      if (peer !== conn && peer.readyState === WebSocket.OPEN) {
        peer.send(message);
      }
    }
  });

  conn.on('close', () => {
    room.delete(conn);
    if (room.size === 0) rooms.delete(roomName);
    log('info', 'client disconnected', { room: roomName, peers: room.size });
  });

  conn.on('error', (err) => {
    log('error', 'socket error', { room: roomName, error: err.message });
    room.delete(conn);
    if (room.size === 0) rooms.delete(roomName);
  });
}

// ─── Stats (for /health) ──────────────────────────────────────────────────────

function getStats() {
  let clients = 0;
  rooms.forEach(room => { clients += room.size; });
  return { rooms: rooms.size, clients };
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
  log('info', 'collaborative relay server attached to existing HTTP server');
  return wss;
}

exports.Collaborative = { setupWSConnection, createServer, attachToServer, getStats };
