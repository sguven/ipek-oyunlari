// İpek'in Araba Gezisi için otomatik test.
// Çalıştırma:  cd tests && npm install && node araba-test.js   (--quick: otopilot turu atlanır)
// - Tablet/telefon/masaüstü boyutlarında arayüz yerleşimi, düğmeler, dil, menü
// - Kontroller: otomatik gaz, direksiyon, geri, korna, iki parmakla aynı anda gaz+direksiyon
// - Suya giremez; rota boyunca hiçbir yıldız/durak suda değil
// - Otopilot gerçek kontrollerle (ok tuşları) bütün turu sürer: 7 durak, bütün yıldızlar, kutlama
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const THREE_JS = path.join(__dirname, 'node_modules/three/build/three.min.js');

const DEVICES = [
  { name: 'tablet-yatay', width: 1180, height: 820, mobile: true },
  { name: 'ipad-dikey', width: 820, height: 1180, mobile: true },
  { name: 'telefon-yatay', width: 844, height: 390, mobile: true },
  { name: 'telefon-dikey', width: 393, height: 852, mobile: true },
  { name: 'masaustu', width: 1280, height: 800, mobile: false, autopilot: true },
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('nf'); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const G = (page, fn, arg) => page.evaluate(fn, arg);
// oyun içi zamanla bekle (yazılımsal 3D yavaş olduğu için duvar saati yanıltır)
async function waitSim(page, sec, maxMs = 30000) { const t0 = await G(page, () => __game.simT); const s = Date.now(); while (Date.now() - s < maxMs) { await sleep(60); if ((await G(page, () => __game.simT)) - t0 >= sec) return; } }

async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error('görünmüyor: ' + sel);
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function tap(page, dev, sel) {
  await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});
  const [x, y] = await center(page, sel);
  if (dev.mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
// basılı tutma (pointerdown … pointerup), farklı pointerId ile çoklu dokunuş
async function hold(page, sel, ms, id = 1) {
  await page.evaluate(([s, id]) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, isPrimary: id === 1 })); }, [sel, id]);
  if (ms) { await waitSim(page, ms / 1000); await release(page, sel, id); }
}
async function release(page, sel, id = 1) {
  await page.evaluate(([s, id]) => { document.querySelector(s).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch' })); }, [sel, id]);
}

async function runCase(browser, base, dev) {
  const tag = dev.name;
  const context = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.mobile, isMobile: dev.mobile, locale: 'tr-TR' });
  await context.route('**/three.min.js', r => r.fulfill({ path: THREE_JS, contentType: 'text/javascript' }));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await context.newPage();
  const errors = [], clips = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_TUNNEL|ERR_NAME/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { if (r.url().endsWith('.mp3')) clips.push(r.url()); });
  await page.goto(base + '/araba/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 30000 });
  check((await page.title()) === "İpek'in Araba Gezisi", `${tag}: başlık yanlış`);

  // --- başlangıç ekranı: renk seç, başla
  check(await page.locator('#startOv').isVisible(), `${tag}: başlangıç ekranı yok`);
  check((await page.locator('#startOv .col').count()) === 6, `${tag}: renk seçenekleri eksik`);
  await tap(page, dev, '#startOv .col[data-c="2"]');
  check((await G(page, () => JSON.parse(localStorage.getItem('araba-gezisi-v1')).color)) === 2, `${tag}: renk kaydedilmedi`);
  await page.screenshot({ path: path.join(OUT, `araba-${tag}-1-baslangic.png`) });
  await tap(page, dev, '#startGo');
  await sleep(300);
  check(await page.locator('#startOv').isHidden(), `${tag}: başla düğmesi çalışmadı`);

  // --- yerleşim: kontroller ekranda, birbiriyle ve üst çubukla çakışmıyor, yatay taşma yok
  const boxes = await G(page, () => ['#gamesLink', '#stars', '#stickers', '#menuBtn', '#cLeft', '#cRight', '#cGas', '#cBack', '#cHorn'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { s, x: r.x, y: r.y, w: r.width, h: r.height }; }));
  for (const b of boxes) check(b.x >= 0 && b.y >= 0 && b.x + b.w <= dev.width + 1 && b.y + b.h <= dev.height + 1 && b.w > 0, `${tag}: ${b.s} ekran dışında`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
    check(!ov, `${tag}: ${a.s} ile ${b.s} çakışıyor`);
  }
  const small = boxes.filter(b => ['#cLeft', '#cRight', '#cGas'].includes(b.s) && Math.min(b.w, b.h) < 70);
  check(!small.length, `${tag}: ana kontroller çocuk için küçük: ${small.map(b => b.s).join(',')}`);
  check(!(await G(page, () => document.documentElement.scrollWidth > innerWidth + 1)), `${tag}: yatay taşma`);

  // --- otomatik gaz: dokunmadan ilerliyor
  await waitSim(page, 1.5);
  const s1 = await G(page, () => ({ x: __game.pos.x, sp: __game.speed, h: __game.heading }));
  check(s1.sp > 3 && s1.x < 72, `${tag}: otomatik gaz çalışmıyor (hız ${s1.sp.toFixed(1)})`);
  await page.screenshot({ path: path.join(OUT, `araba-${tag}-2-surus.png`) });

  // --- direksiyon + gaz aynı anda (iki parmak)
  await hold(page, '#cGas', 0, 1); await hold(page, '#cLeft', 0, 2);
  await waitSim(page, 0.9);
  const s2 = await G(page, () => ({ sp: __game.speed, h: __game.heading, gasOn: document.getElementById('cGas').classList.contains('on'), leftOn: document.getElementById('cLeft').classList.contains('on') }));
  await release(page, '#cLeft', 2); await release(page, '#cGas', 1);
  check(s2.gasOn && s2.leftOn, `${tag}: iki parmakla aynı anda basılamıyor`);
  check(s2.sp > s1.sp + 2, `${tag}: gaz hızlandırmıyor (${s1.sp.toFixed(1)} → ${s2.sp.toFixed(1)})`);
  check(Math.abs(s2.h - s1.h) > 0.3, `${tag}: direksiyon dönmüyor`);
  // DUR: bir dokunuş durdurur, durmaya devam eder; gaz yeniden başlatır
  await hold(page, '#cBack', 150, 3);
  await waitSim(page, 1.6);
  const sp1 = await G(page, () => Math.abs(__game.speed));
  check(sp1 < 0.3, `${tag}: DUR'a bir kez dokununca araba durmadı (hız ${sp1.toFixed(1)})`);
  await hold(page, '#cGas', 150, 1);
  await waitSim(page, 1.2);
  check((await G(page, () => __game.speed)) > 3, `${tag}: gaza dokununca araba yeniden gitmedi`);
  // rota boyunca yol yüksekliğinde ani düşüş yok (köprü rampaları)
  const drop = await G(page, () => { let worst = 0, at = null; const R = __game.ROUTE; for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); let prev = null; for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n, h = __game.groundInfo(x, z).h; if (prev !== null && Math.abs(h - prev) > worst) { worst = Math.abs(h - prev); at = [x.toFixed(0), z.toFixed(0)]; } prev = h; } } return { worst, at }; });
  check(drop.worst < 1.2, `${tag}: rotada ani yükseklik değişimi ${drop.worst.toFixed(2)} (${drop.at})`);
  // geri
  await hold(page, '#cBack', 1800, 3);
  check((await G(page, () => __game.speed)) < 0, `${tag}: geri gitmiyor`);
  await tap(page, dev, '#cHorn');

  // --- su engeli: kıyıdan suya doğru sür; asla suya girmemeli
  await G(page, () => { __game.teleport(-75, 30); __game.heading = Math.atan2(40, -30); });
  await hold(page, '#cGas', 0, 1);
  let wet = false;
  let toastSeen = false;
  const tw0 = await G(page, () => __game.simT);
  for (let i = 0; i < 400 && (await G(page, () => __game.simT)) - tw0 < 3.5; i++) { await sleep(60); if (await G(page, () => document.getElementById('toast').classList.contains('show'))) toastSeen = true; if (await G(page, () => __game.isWater(__game.groundInfo(__game.pos.x, __game.pos.z)))) wet = true; }
  await release(page, '#cGas', 1);
  check(!wet, `${tag}: araba suya girdi`);
  check(toastSeen, `${tag}: su uyarısı çıkmadı`);
  await page.screenshot({ path: path.join(OUT, `araba-${tag}-3-su.png`) });

  // --- menü: yola dön, İngilizce, kapat
  await tap(page, dev, '#menuBtn'); await sleep(200);
  check(await page.locator('#menuOv').isVisible(), `${tag}: menü açılmadı`);
  check(await G(page, () => __game.paused), `${tag}: menü açıkken oyun durmuyor`);
  await page.screenshot({ path: path.join(OUT, `araba-${tag}-4-menu.png`) });
  await tap(page, dev, '#rescueBtn'); await sleep(300);
  const rp = await G(page, () => [__game.pos.x, __game.pos.z]);
  check(Math.hypot(rp[0] - 70, rp[1]) < 45, `${tag}: "Yola dön" rotaya getirmedi (${rp.map(v => v.toFixed(0))})`);
  await tap(page, dev, '#menuBtn'); await sleep(150);
  await tap(page, dev, '#menuOv .seg[data-opt="lang"] button[data-v="en"]'); await sleep(150);
  check((await page.title()) === "Ipek's Car Trip", `${tag}: İngilizceye geçmedi`);
  await tap(page, dev, '#menuOv .seg[data-opt="lang"] button[data-v="tr"]'); await sleep(150);
  await tap(page, dev, '#menuClose'); await sleep(150);
  check(!(await G(page, () => __game.paused)), `${tag}: menü kapanınca oyun devam etmiyor`);

  // --- durak: ilk durağa ışınla → çıkartma + konfeti + kayıtlı Türkçe övgü
  const before = clips.length;
  await G(page, () => { const s = __game.items.find(i => i.type === 'stop'); __game.teleport(s.x + 1, s.z); });
  await waitSim(page, 0.5);
  for (let i = 0; i < 40 && clips.length === before; i++) await sleep(100);
  check((await G(page, () => __game.stopsDone[0])), `${tag}: ilk durak sayılmadı`);
  check((await page.locator('.stk.got').count()) === 1, `${tag}: çıkartma dolmadı`);
  check(clips.length > before, `${tag}: durakta Türkçe ses çalmadı`);
  await page.screenshot({ path: path.join(OUT, `araba-${tag}-5-durak.png`) });

  if (dev.autopilot && !QUICK) await autopilot(page, tag);

  const trTts = await G(page, () => window.__ttsTr || 0);
  check(!trTts, `${tag}: Türkçe cihaz sesi kullanıldı`);
  check(!errors.length, `${tag}: hatalar: ${errors.join(' | ')}`);
  const fps = await G(page, () => __game.frame / __game.simT).catch(() => 0);
  await context.close();
  console.log(`✓ ${tag}  (test ortamında ~${fps.toFixed(0)} kare/sn)`);
}

// Gerçek kontrollerle (ok tuşları) bütün turu sür
async function autopilot(page, tag) {
  await G(page, () => { __game.teleport(74, 0); __game.heading = -Math.PI / 2; });
  await page.evaluate(() => {
    const send = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));
    const state = {};
    const press = (code, on) => { if (!!state[code] !== on) { state[code] = on; send(code, on); } };
    window.__ap = setInterval(() => {
      const G = window.__game, it = G.items.find((x, i) => !x.done);
      if (!it) { ['ArrowUp', 'ArrowLeft', 'ArrowRight'].forEach(c => press(c, false)); return; }
      const want = Math.atan2(it.x - G.pos.x, it.z - G.pos.z);
      let d = want - G.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      press('ArrowLeft', d > 0.06); press('ArrowRight', d < -0.06);
      press('ArrowUp', Math.abs(d) < 0.5);
    }, 30);
  });
  const t0 = Date.now(); let lastDone = -1, lastChange = Date.now(), wet = false;
  while (Date.now() - t0 < 420000) {
    await sleep(1000);
    const st = await G(page, () => ({ done: __game.items.filter(i => i.done).length, total: __game.items.length, win: !document.getElementById('winOv').hidden, wet: __game.isWater(__game.groundInfo(__game.pos.x, __game.pos.z)), p: [__game.pos.x, __game.pos.z] }));
    if (st.wet) wet = true;
    if (st.done !== lastDone) { lastDone = st.done; lastChange = Date.now(); }
    if (st.win) break;
    if (Date.now() - lastChange > 60000) { fails.push(`${tag}: otopilot takıldı (${st.done}/${st.total}, konum ${st.p.map(v => v.toFixed(0))})`); break; }
  }
  await page.evaluate(() => clearInterval(window.__ap));
  const res = await G(page, () => ({ stars: __game.starsGot, total: __game.STAR_TOTAL, stops: __game.stopsDone.filter(Boolean).length, win: !document.getElementById('winOv').hidden }));
  console.log(`  otopilot: ${Math.round((Date.now() - t0) / 1000)} sn, ${res.stops}/7 durak, ${res.stars}/${res.total} yıldız`);
  check(res.win, `${tag}: tur sonu kutlaması çıkmadı`);
  check(res.stops === 7 && res.stars === res.total, `${tag}: otopilot her şeyi toplayamadı (${res.stops}/7, ${res.stars}/${res.total})`);
  check(!wet, `${tag}: otopilot sırasında suya girildi`);
  await page.screenshot({ path: path.join(OUT, `araba-${tag}-6-kutlama.png`) });
  // tekrar oyna
  if (res.win) { await page.click('#winAgain'); await sleep(300); check((await G(page, () => __game.starsGot)) === 0, `${tag}: yeni tur sıfırlanmadı`); }
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const d of DEVICES.filter(d => !ONLY || d.name === ONLY)) {
    try { await runCase(browser, base, d); } catch (e) { fails.push(`${d.name}: ${e.message.split('\n')[0]}`); }
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('\nSORUNLAR:\n- ' + fails.join('\n- ')); process.exit(1); }
  console.log('\nTüm araba testleri geçti.');
})();
