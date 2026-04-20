/**
 * S1 스파이크 — 단일 프로세스 HTTP + WebSocket 서버
 *
 * 기존 쌤도구 패턴(liveMultiSurvey.ts 등) 미니어처:
 *   - http.createServer가 정적 HTML 한 장 서빙 (인라인 HTML 패턴)
 *   - 같은 서버에 ws 업그레이드하여 y-websocket 프로토콜 수락
 *   - Excalidraw/React/Y.js는 CDN에서 로드 (extraResources/Vite 불필요 증명)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { setupWSConnection } = require('y-websocket/bin/utils');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4444);

const htmlPath = path.join(__dirname, 'board.html');

const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/board.html') {
    // 스파이크 편의: 매 요청마다 파일 다시 읽기 (편집 후 재시작 불필요)
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: [...rooms.keys()] }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true });
const rooms = new Map(); // room name → client count (for observability)

httpServer.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const room = url.pathname.slice(1) || 'default';
  rooms.set(room, (rooms.get(room) || 0) + 1);
  console.log(`[ws] connect: room=${room} total=${rooms.get(room)}`);
  ws.on('close', () => {
    rooms.set(room, (rooms.get(room) || 1) - 1);
    console.log(`[ws] disconnect: room=${room} remaining=${rooms.get(room)}`);
  });
  setupWSConnection(ws, req, { gc: true });
});

httpServer.listen(PORT, () => {
  console.log(`Spike S1 running:`);
  console.log(`  HTTP  http://localhost:${PORT}`);
  console.log(`  WSS   ws://localhost:${PORT}`);
  console.log(`Open the URL in 2 browser tabs to verify real-time sync.`);
});
