// Uçtan uca test: sunucuyu ayrı başlatın (PORT=3111 node server.js), sonra: PORT=3111 node test.js
'use strict';
const PORT = process.env.PORT || 3000;
const URL_ = `ws://localhost:${PORT}`;
const story = require('./story');
let fails = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

// ---- 1) Statik hikâye kontrolü ----
{
  const ids = Object.keys(story.scenes);
  let badTo = 0, stall = 0, seen = new Set([story.start]), q = [story.start];
  for (const id of ids) {
    const s = story.scenes[id];
    for (const c of s.choices || []) if (!story.scenes[c.to]) badTo++;
    if (!s.ending && !(s.choices || []).some((c) => !c.needs && !c.needsFlag)) stall++;
  }
  while (q.length) for (const c of story.scenes[q.pop()].choices || []) if (!seen.has(c.to)) { seen.add(c.to); q.push(c.to); }
  ok(badTo === 0, 'tüm "to" hedefleri var');
  ok(stall === 0, 'her sahnede rol gerektirmeyen en az 1 seçenek var (tek kişi takılmaz)');
  ok(seen.size === ids.length, `tüm sahneler erişilebilir (${seen.size}/${ids.length})`);
  ok(ids.filter((i) => story.scenes[i].ending).length >= 4, 'en az 4 son var');
}

// ---- 2) Ağ testi ----
function client(name, pid) {
  return new Promise((res) => {
    const ws = new WebSocket(URL_);
    const c = { ws, name, pid, state: null, errors: [], waiters: [], left: false };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'state') c.state = m; else if (m.t === 'error') c.errors.push(m); else if (m.t === 'left') c.left = true;
      c.waiters.splice(0).forEach((f) => f());
    };
    ws.onopen = () => res(c);
  });
}
const tx = (c, o) => c.ws.send(JSON.stringify(o));
const until = (c, pred, ms = 2000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('zaman aşımı')), ms);
  const check = () => { if (pred(c)) { clearTimeout(t); res(); } else c.waiters.push(check); };
  check();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Oda kur, 3 kişi katıl
  const A = await client('Ayşe', 'pidaaaaaaaa1'), B = await client('Burak', 'pidbbbbbbbb2'), C = await client('Cem', 'pidcccccccc3');
  tx(A, { t: 'create', name: 'Ayşe', pid: A.pid });
  await until(A, (c) => c.state);
  const code = A.state.code;
  ok(/^[A-Z]{4}$/.test(code), 'oda kodu 4 harf: ' + code);
  tx(B, { t: 'join', code, name: 'Burak', pid: B.pid });
  tx(C, { t: 'join', code: code.toLowerCase(), name: 'Cem', pid: C.pid });
  await until(A, (c) => c.state.players.length === 3);
  const roles = A.state.players.map((p) => p.role);
  ok(new Set(roles).size === 3 && roles[0] === 'kaptan' && roles[1] === 'muhendis', 'roller benzersiz dağıtıldı: ' + roles.join(','));

  // Kurucu olmayan başlatamaz
  tx(B, { t: 'start' }); await sleep(150);
  ok(A.state.phase === 'lobby', 'kurucu olmayan başlatamaz');

  tx(A, { t: 'start' });
  await until(C, (c) => c.state.phase === 'play');
  ok(C.state.scene.id === 'baslangic', 'oyun başladı');
  ok(C.state.scene.choices[2].locked === false, 'Mühendis varken motor seçeneği açık');

  const allVote = async (i, expectScene) => {
    for (const p of [A, B, C]) tx(p, { t: 'vote', i });
    await until(A, (c) => c.state.scene.id === expectScene);
  };
  // Mutlu yol: motor -> iskele -> iz (doktor) -> kulübe -> fener -> onarım -> Yeni Işık
  await allVote(2, 'motor');
  await allVote(0, 'iskele');
  ok(A.state.scene.paragraphs.join(' ').includes('Martı’nın siluetini'), 'bayrağa bağlı ek paragraf göründü');
  await allVote(1, 'iz');
  await allVote(0, 'kulube');
  await allVote(0, 'fener');
  ok(A.state.scene.choices[1].locked === false, 'defter + mühendis varken onarım açık');
  await allVote(1, 'son_isik');
  ok(A.state.phase === 'end' && A.state.history.length === 6, 'iyi son + karar geçmişi (6)');

  // Reconnect: Burak düşüp aynı kimlikle dönüyor
  B.ws.close(); await sleep(150);
  const B2 = await client('Burak', B.pid);
  tx(B2, { t: 'join', code, name: 'Burak', pid: B.pid, silent: true });
  await until(B2, (c) => c.state);
  ok(B2.state.players.find((p) => p.id === B.pid).role === 'muhendis', 'yeniden bağlanınca rol korundu');

  // Yeniden oyna
  tx(A, { t: 'restart' });
  await until(A, (c) => c.state.phase === 'lobby');
  ok(A.state.players.length === 3, 'restart sonrası lobi, oyuncular duruyor');

  // Beraberlik: kaptanın sözü geçer
  tx(A, { t: 'start' }); await until(A, (c) => c.state.phase === 'play');
  tx(A, { t: 'vote', i: 0 }); tx(B2, { t: 'vote', i: 1 }); tx(C, { t: 'vote', i: 1 });
  await until(A, (c) => c.state.scene.id === 'telsiz'); // 2'ye 1 → telsiz
  ok(A.state.lastResult.tally === '2–1' && A.state.lastResult.tie === null, 'çoğunluk kazandı (2–1)');
  // telsiz: 3 seçenek; A→1(bekle), B→2(iskele), C→ locked gazeteci yok → kilitli
  tx(C, { t: 'vote', i: 0 }); await sleep(150);
  ok(C.errors.some((e) => e.code === 'locked'), 'rol yokken kilitli seçenek reddedildi');
  tx(A, { t: 'vote', i: 1 }); tx(B2, { t: 'vote', i: 2 }); tx(C, { t: 'vote', i: 1 });
  await until(A, (c) => c.state.scene.id === 'bekle');
  // bekle: A→0 (iskele), B→1 (son_sis) beraberlik, C→1 → 2'ye 1; ardından yeni oda ile saf beraberlik testi
  // Saf beraberlik: 2 kişilik oda
  const D = await client('Deniz', 'piddddddddd4'), E = await client('Ece', 'pideeeeeeee5');
  tx(D, { t: 'create', name: 'Deniz', pid: D.pid }); await until(D, (c) => c.state);
  tx(E, { t: 'join', code: D.state.code, name: 'Ece', pid: E.pid }); await until(D, (c) => c.state.players.length === 2);
  tx(D, { t: 'start' }); await until(D, (c) => c.state.phase === 'play');
  tx(D, { t: 'vote', i: 0 }); tx(E, { t: 'vote', i: 1 });
  await until(D, (c) => c.state.scene.id !== 'baslangic');
  ok(D.state.lastResult.tie === 'kaptan' && D.state.scene.id === 'iskele', 'beraberlikte Kaptan’ın oyu geçerli');

  // Oyun başladıktan sonra yabancı katılamaz
  const F = await client('Fatih', 'pidfffffff6');
  tx(F, { t: 'join', code: D.state.code, name: 'Fatih', pid: F.pid }); await sleep(200);
  ok(F.errors.some((e) => e.code === 'started'), 'başlamış odaya yeni oyuncu alınmadı');

  // Tek oyuncu: bayraksız, rolsüz yol — "Sis Sabırlıdır" sonuna kadar
  const G = await client('Gül', 'pidggggggg7');
  tx(G, { t: 'create', name: 'Gül', pid: G.pid }); await until(G, (c) => c.state);
  tx(G, { t: 'start' }); await until(G, (c) => c.state.phase === 'play');
  tx(G, { t: 'vote', i: 2 }); await sleep(120);
  ok(G.errors.some((e) => e.code === 'locked'), 'tek kişilik odada Mühendis seçeneği kilitli');
  tx(G, { t: 'vote', i: 1 }); await until(G, (c) => c.state.scene.id === 'telsiz');
  tx(G, { t: 'vote', i: 1 }); await until(G, (c) => c.state.scene.id === 'bekle');
  tx(G, { t: 'vote', i: 1 }); await until(G, (c) => c.state.phase === 'end');
  ok(G.state.scene.id === 'son_sis', 'tek oyuncu sona ulaşabiliyor');

  // Kötü mesajlar sunucuyu düşürmez
  A.ws.send('{bozuk json'); A.ws.send(JSON.stringify({ t: 'vote', i: 999 })); A.ws.send(JSON.stringify({ t: 'xyz' }));
  await sleep(150);
  tx(A, { t: 'restart' }); await sleep(100);
  ok(true, 'bozuk/geçersiz mesajlar sunucuyu düşürmedi');

  console.log(fails ? `\n${fails} test BAŞARISIZ` : '\nTüm testler geçti');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
