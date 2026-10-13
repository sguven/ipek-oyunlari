// İpek'in Kelebek Bahçesi için otomatik test.
// Çalıştırma:  cd tests && npm install && node kelebek-test.js
// Oyun birkaç telefon/tablet/masaüstü boyutunda dokunarak oynanır: üç mod, kavanoz dolumu,
// ödül ve serbest bırakma, albüm, dil değişimi, Türkçe konuşmaların hepsinin kayıtlı sesten gelmesi.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-se', width: 375, height: 667, mobile: true },
  { name: 'iphone-15', width: 393, height: 852, mobile: true },
  { name: 'android-kucuk', width: 360, height: 740, mobile: true },
  { name: 'telefon-yatay', width: 844, height: 390, mobile: true },
  { name: 'ipad', width: 820, height: 1180, mobile: true },
  { name: 'masaustu', width: 1280, height: 800, mobile: false },
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
function check(ok, msg) { if (!ok) fails.push(msg); }

async function tapAt(page, dev, x, y) {
  if (dev.mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
async function dismissReward(page, dev) {
  if (await page.evaluate(() => !document.getElementById('rewardOv').hidden)) { await tapSel(page, dev, '#rewardGo'); await sleep(300); }
}
async function tapSel(page, dev, sel) {
  if (sel !== '#rewardGo') await dismissReward(page, dev);
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(150);
  const b = await loc.boundingBox();
  if (!b) {
    const info = await page.evaluate(() => ({ screen, body: document.body.className, ovs: [...document.querySelectorAll('.ov')].filter(o => !o.hidden).map(o => o.id) }));
    await page.screenshot({ path: path.join(OUT, 'kelebek-hata.png') });
    throw new Error('görünmüyor: ' + sel + ' ' + JSON.stringify(info));
  }
  await tapAt(page, dev, b.x + b.width / 2, b.y + b.height / 2);
}
// Kelebeğin ekrandaki merkezi (oyunun kendi konum bilgisinden)
async function butterflies(page) {
  return page.evaluate(() => {
    const r = document.getElementById('field').getBoundingClientRect();
    return BF.filter(b => b.state !== 'leave' && b.x > 20 && b.x < r.width - 20 && b.y > 20 && b.y < r.height - 20)
      .map(b => ({ ci: b.ci, x: r.left + b.x, y: r.top + b.y + (b.state === 'rest' ? 0 : Math.sin(b.t * 5 + b.ph) * 5) }));
  });
}
async function catchOne(page, dev, filter) {
  for (let i = 0; i < 60; i++) {
    await dismissReward(page, dev);
    const list = (await butterflies(page)).filter(filter || (() => true));
    if (list.length) {
      const before = await page.evaluate(() => S.caught);
      const b = list[0];
      await tapAt(page, dev, b.x, b.y);
      await sleep(60);
      if ((await page.evaluate(() => S.caught)) > before) return true;
    }
    await sleep(120);
  }
  return false;
}
async function waitFor(page, fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await sleep(100); }
  return false;
}

async function runCase(browser, base, dev, deep) {
  const tag = dev.name;
  const context = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.mobile, isMobile: dev.mobile, locale: 'tr-TR' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|fonts\.g/.test(m.text())) errors.push(m.text()); });
  const clips = [];
  page.on('request', r => { if (r.url().endsWith('.mp3')) clips.push(r.url()); });
  await page.addInitScript(() => {
    window.__tts = [];
    try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__tts.push(u.text + '|' + u.lang); }; } catch (e) {}
    window.__missing = [];
  });
  await page.goto(base + '/kelebek/', { waitUntil: 'load' });
  await waitFor(page, () => !!CLIPS.map);
  // Türkçe her konuşma kayıtlı klipten mi? say() sarmalayıp kontrol et
  await page.evaluate(() => {
    const orig = window.say;
    window.say = function (t, q) { const p = (Array.isArray(t) ? t : [t]).filter(Boolean); if (S.lang === 'tr') p.forEach(x => { if (!CLIPS.map.clips[x]) window.__missing.push(x); }); return orig(t, q); };
  });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!(await overflow()), `${tag}: ana sayfa yatay taşıyor`);
  check((await page.title()).includes('Kelebek'), `${tag}: başlık yanlış`);
  await page.screenshot({ path: path.join(OUT, `kelebek-${tag}-home.png`), fullPage: true });

  // --- Kelebek yakala: kavanozu doldur, ödül, serbest bırak
  await tapSel(page, dev, '.tile[data-mode="free"]');
  await sleep(500);
  check(await page.locator('#field').isVisible(), `${tag}: çayır görünmüyor`);
  const fb = await page.locator('#field').boundingBox();
  check(fb.y + fb.height <= dev.height + 2 || dev.height < 420, `${tag}: çayır ekrana sığmıyor (${Math.round(fb.y + fb.height)} > ${dev.height})`);
  check(!(await overflow()), `${tag}: oyun ekranı yatay taşıyor`);
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, `kelebek-${tag}-free.png`) });
  const goal = deep ? 10 : 3;
  for (let i = 0; i < goal; i++) check(await catchOne(page, dev), `${tag}: ${i + 1}. kelebek yakalanamadı`);
  await sleep(1300); // kelebek önce ağa, sonra kavanoza uçar
  const jarTxt = await page.locator('#jarLbl').textContent();
  check(jarTxt.includes(String(goal)), `${tag}: kavanoz sayacı yanlış: ${jarTxt}`);
  check(await page.locator('#emptyBtn').isVisible(), `${tag}: Boşalt düğmesi görünmüyor`);
  check(await page.locator('#rewardOv').isHidden(), `${tag}: kavanoz sınırı hâlâ var (ödül penceresi kendiliğinden açıldı)`);
  if (deep) {
    check(await page.evaluate(() => document.getElementById('jar').classList.contains('over')), `${tag}: kavanoz taşma görüntüsü yok`);
    await page.screenshot({ path: path.join(OUT, `kelebek-${tag}-tasma.png`) });
    await tapSel(page, dev, '#emptyBtn');
    await sleep(300);
    const st = await page.evaluate(() => ({ jar: S.jar.length, stars: S.stars, caught: S.caught }));
    check(st.jar === 0, `${tag}: kavanoz boşalmadı`);
    check(st.stars === goal, `${tag}: ödül yıldızı ${st.stars}, beklenen ${goal}`);
    check(await waitFor(page, () => !document.getElementById('rewardOv').hidden, 4000), `${tag}: 8 yıldızda albüm ödülü çıkmadı`);
    await page.screenshot({ path: path.join(OUT, `kelebek-${tag}-reward.png`) });
    await tapSel(page, dev, '#rewardGo');
    await sleep(700);
    check(st.caught === (await page.evaluate(() => S.caught)), `${tag}: boşaltma kelebek yakaladı`);
    check(await catchOne(page, dev), `${tag}: boşalttıktan sonra yakalama çalışmıyor`);
  }
  await tapSel(page, dev, '#backBtn');
  await sleep(300);

  // --- Renk avı: önce yanlış renk, sonra 3 doğru
  await tapSel(page, dev, '.tile[data-mode="color"]');
  await sleep(1500);
  const target = await page.evaluate(() => CR.target);
  const prompt = await page.locator('#prompt').textContent();
  check(/kelebekleri yakala/.test(prompt), `${tag}: renk avı görevi yazmıyor: ${prompt}`);
  let wrongTapped = false;
  for (let i = 0; i < 120 && !wrongTapped; i++) {
    const all = await butterflies(page), tg = all.filter(b => b.ci === target);
    const far = b => Math.min(1e9, ...tg.map(t => Math.hypot(t.x - b.x, t.y - b.y)));
    const w = all.filter(b => b.ci !== target && far(b) > 90).sort((a, b) => far(b) - far(a))[0];
    if (w) {
      const before = await page.evaluate(() => [S.caught, S.colorStats[1]]);
      await tapAt(page, dev, w.x, w.y); await sleep(80);
      const after = await page.evaluate(() => [S.caught, S.colorStats[1]]);
      if (after[1] > before[1]) { wrongTapped = true; check(after[0] === before[0], `${tag}: yanlış renk yakalandı`); }
    } else await sleep(150);
  }
  check(wrongTapped, `${tag}: yanlış renge dokunma denenemedi`);
  await page.screenshot({ path: path.join(OUT, `kelebek-${tag}-color.png`) });
  for (let i = 0; i < 3; i++) check(await catchOne(page, dev, b => b.ci === target), `${tag}: hedef renk ${i + 1} yakalanamadı`);
  check(await page.evaluate(() => CR.done || CR.hits === 0), `${tag}: renk turu bitmedi`);
  check(await waitFor(page, () => CR.hits === 0 && !CR.done, 6000), `${tag}: yeni renk turu başlamadı`);
  await tapSel(page, dev, '#backBtn');
  await sleep(300);

  // --- Say ve yakala
  await tapSel(page, dev, '.tile[data-mode="count"]');
  await sleep(1200);
  const n = await page.evaluate(() => CN.n);
  check(n >= 2 && n <= 5, `${tag}: hedef sayı garip: ${n}`);
  check((await page.locator('.dot').count()) === n, `${tag}: nokta sayısı hedefle uyuşmuyor`);
  for (let i = 0; i < n; i++) check(await catchOne(page, dev), `${tag}: sayma ${i + 1} yakalanamadı`);
  check(await page.evaluate(() => CN.done), `${tag}: sayma turu bitmedi`);
  // tur bitince fazladan yakalama olmamalı
  const c0 = await page.evaluate(() => S.caught);
  const bl = await butterflies(page); if (bl[0]) await tapAt(page, dev, bl[0].x, bl[0].y);
  await sleep(100);
  check((await page.evaluate(() => S.caught)) === c0, `${tag}: tur bitince yine yakaladı`);
  await page.screenshot({ path: path.join(OUT, `kelebek-${tag}-count.png`) });
  await tapSel(page, dev, '#backBtn');
  await sleep(300);

  // --- Albüm, ebeveyn paneli, dil
  await tapSel(page, dev, '#albumBtn'); await sleep(300);
  check(!(await page.locator('#albumOv').isHidden()), `${tag}: albüm açılmadı`);
  check((await page.locator('.alb.got').count()) === (await page.evaluate(() => Math.min(7, Math.floor(S.stars / 8)))), `${tag}: albümde açılan kelebek sayısı yanlış`);
  await page.screenshot({ path: path.join(OUT, `kelebek-${tag}-album.png`) });
  await tapSel(page, dev, '#albumClose'); await sleep(200);
  await tapSel(page, dev, '#parentBtn'); await sleep(300);
  check(!(await page.locator('#parentOv').isHidden()), `${tag}: ebeveyn paneli açılmadı`);
  await tapSel(page, dev, '#parentClose'); await sleep(200);
  await tapSel(page, dev, '#lang-en'); await sleep(300);
  check((await page.title()).includes('Butterfly'), `${tag}: İngilizceye geçmedi`);
  await tapSel(page, dev, '.tile[data-mode="color"]'); await sleep(600);
  check(/Catch the/.test(await page.locator('#prompt').textContent()), `${tag}: İngilizce görev yok`);
  await tapSel(page, dev, '#backBtn'); await sleep(200);
  await tapSel(page, dev, '#lang-tr'); await sleep(200);

  // --- yenileyince ilerleme kalıyor mu
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kelebek-bahcesi-v1')));
  await page.reload(); await sleep(500);
  check((await page.evaluate(() => S.caught)) === saved.caught, `${tag}: ilerleme kaydedilmedi`);

  const missing = await page.evaluate(() => window.__missing);
  check(!missing.length, `${tag}: kaydı olmayan Türkçe cümle: ${[...new Set(missing)].join(' / ')}`);
  const trTts = (await page.evaluate(() => window.__tts)).filter(t => /\|tr/i.test(t));
  check(!trTts.length, `${tag}: Türkçe cihaz sesi kullanıldı: ${trTts.join(', ')}`);
  check(clips.length > 3, `${tag}: kayıtlı ses klipleri çalınmadı (${clips.length})`);
  check(!errors.length, `${tag}: konsol hataları: ${errors.join(' | ')}`);
  await context.close();
  console.log(`✓ ${tag}`);
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [i, d] of DEVICES.entries()) {
    try { await runCase(browser, base, d, i === 1 || i === 3 || i === 5); }
    catch (e) { fails.push(`${d.name}: ${e.message}`); }
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('\nSORUNLAR:\n- ' + fails.join('\n- ')); process.exit(1); }
  console.log('\nTüm kelebek testleri geçti.');
})();
