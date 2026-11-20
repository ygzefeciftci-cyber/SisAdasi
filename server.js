// Sis Adası — çok oyunculu hikaye oyunu sunucusu.
// Bağımlılık yok: sadece Node.js (18+). Statik dosyaları sunar ve el yazması bir WebSocket sunucusu içerir.
// Sunucu "otoriter": oylar, kilitler ve sahne geçişleri burada hesaplanır; istemci sadece gösterir.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const story = require('./story');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

// ---------- HTTP (statik) ----------
const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (urlPath === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC, path.normalize(urlPath));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bulunamadı'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

// ---------- WebSocket (RFC 6455, yalnızca metin çerçeveleri) ----------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 8192;

function frame(op, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

function parseFrames(c) {
  while (c.buf.length >= 2) {
    const b0 = c.buf[0], b1 = c.buf[1];
    const fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80);
    let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    else if (len === 127) {
      if (c.buf.length < 10) return;
      const big = c.buf.readBigUInt64BE(2);
      if (big > BigInt(MAX_FRAME)) { c.socket.destroy(); return; }
      len = Number(big); off = 10;
    }
    if (len > MAX_FRAME || !masked) { c.socket.destroy(); return; } // istemci çerçeveleri maskeli olmalı
    if (c.buf.length < off + 4 + len) return;
    const mask = c.buf.subarray(off, off + 4);
    const data = Buffer.from(c.buf.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(off + 4 + len);

    if (op === 0x8) { try { c.socket.end(frame(0x8, data.subarray(0, 2))); } catch {} return; }
    if (op === 0x9) { c.socket.write(frame(0xA, data)); continue; }
    if (op === 0xA) { c.alive = true; continue; }
    if (op === 0x1 || op === 0x0) {
      c.frag = op === 0x1 ? [data] : (c.frag || []).concat([data]);
      if (fin) { const msg = Buffer.concat(c.frag).toString('utf8'); c.frag = null; onMessage(c, msg); }
    }
  }
}

function send(c, obj) {
  if (!c.socket.writable) return;
  try { c.socket.write(frame(0x1, Buffer.from(JSON.stringify(obj)))); } catch {}
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  const c = { socket, buf: Buffer.alloc(0), frag: null, alive: true, player: null, room: null, msgs: 0 };
  socket.on('data', (d) => { c.buf = Buffer.concat([c.buf, d]); parseFrames(c); });
  socket.on('close', () => onClose(c));
  socket.on('error', () => socket.destroy());
});

// Proxy'lerin boşta bağlantıyı kesmemesi için ping; cevap vermeyenleri at.
setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players) {
      const c = p.conn;
      if (!c) continue;
      if (!c.alive) { c.socket.destroy(); continue; }
      c.alive = false;
      try { c.socket.write(frame(0x9, Buffer.alloc(0))); } catch {}
    }
  }
}, 25000).unref();
setInterval(() => { for (const c of allConns()) c.msgs = 0; }, 1000).unref();
function* allConns() { for (const r of rooms.values()) for (const p of r.players) if (p.conn) yield p.conn; }

// ---------- Oyun mantığı ----------
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVYZ';

function newCode() {
  for (let i = 0; i < 50; i++) {
    let code = '';
    for (let j = 0; j < 4; j++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Oda kodu üretilemedi');
}

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
}
function cleanPid(s) { return /^[a-z0-9]{6,40}$/i.test(String(s)) ? String(s) : null; }

function makeRoom() {
  return {
    code: newCode(), phase: 'lobby', players: [], hostId: null,
    sceneId: story.start, flags: {}, step: 0, lastResult: null, history: [], picked: null, touched: Date.now(),
  };
}

function freeRole(room) {
  return story.roleOrder.find((r) => !room.players.some((p) => p.role === r)) || null;
}

function connectedPlayers(room) { return room.players.filter((p) => p.connected); }

function ensureHost(room) {
  const host = room.players.find((p) => p.id === room.hostId);
  if (host && host.connected) return;
  const next = connectedPlayers(room)[0];
  if (next) room.hostId = next.id;
}

function lockInfo(room, choice) {
  const parts = [];
  if (choice.needs && !connectedPlayers(room).some((p) => p.role === choice.needs)) parts.push(story.roles[choice.needs].name);
  if (choice.needsFlag && !room.flags[choice.needsFlag]) parts.push(story.flagHints[choice.needsFlag] || choice.needsFlag);
  return parts.length ? parts.join(' + ') + ' gerekli' : null;
}

function sceneParagraphs(room, scene) {
  const paras = scene.text.split('\n\n');
  for (const e of scene.extra || []) if (room.flags[e.flag]) paras.push(e.text);
  return paras.map((t) => t.replaceAll('{kalan}', room.picked || 'Biri'));
}

function view(room, me) {
  const out = {
    t: 'state', code: room.code, phase: room.phase, hostId: room.hostId, you: me.id, step: room.step,
    roles: story.roles, maxPlayers: story.maxPlayers,
    players: room.players.map((p) => ({ id: p.id, name: p.name, role: p.role, connected: p.connected, voted: p.vote != null })),
  };
  if (room.phase !== 'lobby') {
    const scene = story.scenes[room.sceneId];
    const counts = (scene.choices || []).map(() => 0);
    for (const p of connectedPlayers(room)) if (p.vote != null) counts[p.vote]++;
    out.scene = {
      id: room.sceneId, title: scene.title, paragraphs: sceneParagraphs(room, scene),
      ending: !!scene.ending, endingTitle: scene.endingTitle || null,
      choices: (scene.choices || []).map((c, i) => {
        const reason = lockInfo(room, c);
        return { i, text: c.text, locked: !!reason, reason, votes: counts[i], mine: me.vote === i };
      }),
    };
    out.lastResult = room.lastResult;
    out.history = room.history;
  }
  return out;
}

function broadcast(room) {
  ensureHost(room);
  room.touched = Date.now();
  for (const p of room.players) if (p.conn) send(p.conn, view(room, p));
}

// Rol kilidi değişince (biri düşünce) artık seçilemeyen oyları temizle.
function sanitizeVotes(room) {
  const scene = story.scenes[room.sceneId];
  for (const p of room.players) {
    if (p.vote != null && (!scene.choices || !scene.choices[p.vote] || lockInfo(room, scene.choices[p.vote]))) p.vote = null;
  }
}

function resolve(room) {
  const scene = story.scenes[room.sceneId];
  if (!scene.choices) return;
  const voters = connectedPlayers(room).filter((p) => p.vote != null);
  if (!voters.length) return;
  const counts = scene.choices.map(() => 0);
  voters.forEach((p) => counts[p.vote]++);
  const max = Math.max(...counts);
  const top = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
  let pick, tie = null;
  if (top.length > 1) {
    const cap = voters.find((p) => p.role === 'kaptan');
    if (cap && top.includes(cap.vote)) { pick = cap.vote; tie = 'kaptan'; }
    else { pick = top[crypto.randomInt(top.length)]; tie = 'sans'; }
  } else pick = top[0];

  const choice = scene.choices[pick];
  const tally = counts.filter((c) => c > 0).sort((a, b) => b - a).join('–');
  room.lastResult = { choice: choice.text, narration: choice.result || '', tally, tie };
  room.history.push({ scene: scene.title, choice: choice.text });
  for (const f of choice.set || []) room.flags[f] = true;
  for (const p of room.players) p.vote = null;
  enterScene(room, choice.to);
}

function enterScene(room, id) {
  const scene = story.scenes[id];
  room.sceneId = id;
  room.step++;
  const alive = connectedPlayers(room);
  if (scene.pickPlayer && alive.length) room.picked = alive[crypto.randomInt(alive.length)].name;
  for (const f of scene.set || []) room.flags[f] = true;
  if (scene.ending) room.phase = 'end';
}

function maybeResolve(room) {
  if (room.phase !== 'play') return;
  sanitizeVotes(room);
  const alive = connectedPlayers(room);
  if (alive.length && alive.every((p) => p.vote != null)) resolve(room);
}

function resetToLobby(room) {
  room.phase = 'lobby'; room.sceneId = story.start; room.flags = {}; room.step = 0;
  room.lastResult = null; room.history = []; room.picked = null;
  for (const p of room.players) p.vote = null;
  // oyunda kopmuş oyuncuları lobiye dönerken temizle
  room.players = room.players.filter((p) => p.connected);
}

function err(c, code, msg) { send(c, { t: 'error', code, msg }); }

function onMessage(c, raw) {
  if (++c.msgs > 20) return; // basit hız sınırı
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m.t !== 'string') return;
  const room = c.room, me = c.player;

  if (m.t === 'create' || m.t === 'join') {
    if (room) return;
    const name = cleanName(m.name), pid = cleanPid(m.pid);
    if (!name || !pid) return err(c, 'bad', 'İsim gerekli.');
    let r;
    if (m.t === 'create') r = makeRoom();
    else {
      r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return err(c, m.silent ? 'nojoin' : 'noroom', 'Böyle bir oda yok.');
    }
    let p = r.players.find((x) => x.id === pid);
    if (p) {
      if (p.conn && p.conn !== c) { try { p.conn.socket.destroy(); } catch {} }
      p.name = name;
    } else {
      if (r.phase !== 'lobby') return err(c, m.silent ? 'nojoin' : 'started', 'Oyun çoktan başladı.');
      if (r.players.length >= story.maxPlayers) return err(c, 'full', 'Oda dolu.');
      p = { id: pid, name, role: freeRole(r), vote: null, conn: null, connected: false };
      r.players.push(p);
      if (!rooms.has(r.code)) rooms.set(r.code, r);
    }
    p.conn = c; p.connected = true;
    c.player = p; c.room = r;
    if (!r.hostId) r.hostId = p.id;
    broadcast(r);
    return;
  }

  if (!room || !me) return;

  if (m.t === 'start') {
    if (me.id !== room.hostId || room.phase !== 'lobby') return;
    room.phase = 'play';
    enterScene(room, story.start);
    room.step = 0;
    return broadcast(room);
  }

  if (m.t === 'vote') {
    if (room.phase !== 'play') return;
    const scene = story.scenes[room.sceneId];
    const i = Number(m.i);
    const choice = scene.choices && scene.choices[i];
    if (!Number.isInteger(i) || !choice) return;
    if (lockInfo(room, choice)) return err(c, 'locked', 'Bu seçenek kilitli.');
    me.vote = i;
    maybeResolve(room);
    return broadcast(room);
  }

  if (m.t === 'force') {
    if (me.id !== room.hostId || room.phase !== 'play') return;
    sanitizeVotes(room);
    resolve(room);
    return broadcast(room);
  }

  if (m.t === 'restart') {
    if (me.id !== room.hostId || room.phase !== 'end') return;
    resetToLobby(room);
    return broadcast(room);
  }

  if (m.t === 'leave') {
    leave(c);
    send(c, { t: 'left' });
  }
}

function leave(c) {
  const room = c.room, p = c.player;
  if (!room || !p) return;
  c.room = null; c.player = null;
  p.conn = null; p.connected = false;
  if (room.phase === 'lobby') room.players = room.players.filter((x) => x !== p);
  afterDisconnect(room);
}

function afterDisconnect(room) {
  if (!connectedPlayers(room).length) { room.touched = Date.now(); return; }
  maybeResolve(room);
  broadcast(room);
}

function onClose(c) {
  const room = c.room, p = c.player;
  if (!room || !p || p.conn !== c) return;
  p.conn = null; p.connected = false;
  if (room.phase === 'lobby') room.players = room.players.filter((x) => x !== p);
  afterDisconnect(room);
}

// Boş odaları 30 dakika sonra temizle.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!connectedPlayers(room).length && now - room.touched > 30 * 60 * 1000) rooms.delete(code);
  }
}, 5 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Sis Adası hazır → http://0.0.0.0:${PORT}`));
}
module.exports = { server };
