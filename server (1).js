// Super Button Game - serves the game page + matchmaking/room server (WebSocket, no database)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const server = http.createServer((q, r) => {
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    if (e) { r.writeHead(200, { 'content-type': 'text/plain' }); return r.end('ok'); }
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    r.end(d);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 256 });
const rooms = new Map();
let queue = null;

const send = (w, o) => { if (w && w.readyState === 1) w.send(JSON.stringify(o)); };
const newCode = () => { let c; do c = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(c)); return c; };
function pair(a, b) { a.opp = b; b.opp = a; send(a, { t: 'start' }); send(b, { t: 'start' }); }
function leave(w) {
  if (queue === w) queue = null;
  if (w.room && rooms.get(w.room) === w) rooms.delete(w.room);
  w.room = null;
  if (w.opp) { send(w.opp, { t: 'left' }); w.opp.opp = null; w.opp = null; }
}

wss.on('connection', (w) => {
  w.alive = true; w.n = 0; w.opp = null; w.room = null;
  w.on('pong', () => { w.alive = true; });
  w.on('message', (d) => {
    if (++w.n > 40) return;                       // rate limit: 40 msgs/sec
    let m; try { m = JSON.parse(d); } catch (e) { return; }
    if (m.t === 'create' && !w.opp) { leave(w); const c = newCode(); w.room = c; rooms.set(c, w); send(w, { t: 'room', code: c }); }
    else if (m.t === 'join' && !w.opp) {
      const h = rooms.get(String(m.code || '').trim().toUpperCase());
      if (!h || h === w || h.opp) return send(w, { t: 'err', e: 'nojoin' });
      rooms.delete(h.room); h.room = null; pair(h, w);
    }
    else if (m.t === 'find' && !w.opp) {
      if (queue && queue !== w && queue.readyState === 1) { const q = queue; queue = null; pair(q, w); }
      else queue = w;
    }
    else if (m.t === 'cancel') leave(w);
    else if (m.t === 's' && w.opp && Number.isFinite(m.v)) send(w.opp, { t: 's', v: m.v });
  });
  w.on('close', () => leave(w));
  w.on('error', () => {});
});

setInterval(() => wss.clients.forEach((w) => { w.n = 0; }), 1000);
setInterval(() => wss.clients.forEach((w) => { if (!w.alive) return w.terminate(); w.alive = false; w.ping(); }), 30000);

server.listen(process.env.PORT || 8080, () => console.log('server up'));
