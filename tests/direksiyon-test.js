// Test for "Ipek at the Wheel" (direksiyon): pick a car and a place by touch, drive the whole trip (steering into star
// lanes, finding the asked balloon colour, waiting at the traffic light, honking at the animals on the road), then the
// arrival card, "drive again", the garage stickers, layout/overflow at several sizes, both languages and page errors.
// node direksiyon-test.js [--only=device]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const DEVICES0 = [
  { name: 'iphone-se', width: 375, height: 667, mobile: true, car: 'car', place: 'farm', lang: 'tr' },
  { name: 'iphone-15', width: 393, height: 852, mobile: true, car: 'bus', place: 'beach', lang: 'en' },
  { name: 'ipad', width: 820, height: 1180, mobile: true, car: 'ice', place: 'park', lang: 'tr' },
  { name: 'telefon-yatay', width: 844, height: 390, mobile: true, car: 'fire', place: 'forest', lang: 'tr' },
  { name: 'masaustu', width: 1280, height: 800, mobile: false, car: 'car', place: 'park', lang: 'en' }];
const DEVICES = DEVICES0.filter(d => !ONLY || d.name === ONLY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = []; const check = (ok, m) => { if (!ok) fails.push(m); };
(async () => {
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  // every Turkish line the game can say must have a recorded clip
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'direksiyon/audio/manifest.json'), 'utf8'));
  for (const dev of DEVICES) {
    const tag = dev.name;
    const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.mobile, isMobile: dev.mobile, locale: 'tr-TR' });
    await ctx.route(/fonts\./, r => r.abort());
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    const box = async (sel, nth = 0) => { const b = await page.locator(sel).nth(nth).boundingBox(); if (!b) throw new Error('görünmüyor: ' + sel); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
    const tapXY = async (x, y) => { if (dev.mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    const tap = async (sel, nth = 0) => { const c = await box(sel, nth); await tapXY(c.x, c.y); };
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const inView = async sel => { const b = (await box(sel)).b; return b.x >= -1 && b.y >= -1 && b.x + b.width <= dev.width + 1 && b.y + b.height <= dev.height + 1; };
    try {
      await page.goto(base + '/direksiyon/'); await sleep(400);
      check((await page.title()) === 'Ipek at the Wheel', `${tag}: başlık İngilizce açılmadı`);
      if (dev.name === DEVICES[0].name) {
        const lines = await page.evaluate(() => { const out = []; const walk = v => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
          const t = __drv.T.tr; ['pickCar', 'pickPlace', 'cars', 'go', 'arrive', 'start', 'nums', 'praise', 'find', 'thisIs', 'yes', 'light', 'cross', 'bye', 'hint', 'half', 'lots'].forEach(k => walk(t[k])); return out; });
        const missing = lines.filter(l => !man.clips[l] || !fs.existsSync(path.join(ROOT, 'direksiyon/audio/kadin', man.clips[l] + '.mp3')));
        check(!missing.length, `ses kaydı eksik: ${missing.join(' | ')}`);
      }
      if (dev.lang === 'tr') { await tap('.lang button[data-lang="tr"]'); await sleep(150); check((await page.title()) === 'İpek Direksiyonda', `${tag}: TR başlık`); }
      check(!(await overflow()), `${tag}: garaj yana taşıyor`);
      check((await page.locator('.pick.car').count()) === 4, `${tag}: 4 araba yok`);
      for (let i = 0; i < 4; i++) check(await inView(`.pick.car >> nth=${i}`), `${tag}: araba kartı ${i} ekranda değil`);
      await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-1-araba.png`) });
      await tap(`.pick[data-car="${dev.car}"]`); await sleep(400);
      check((await page.locator('.pick.place').count()) === 4, `${tag}: 4 yer yok`);
      for (let i = 0; i < 4; i++) check(await inView(`.pick.place >> nth=${i}`), `${tag}: yer kartı ${i} ekranda değil`);
      await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-2-yer.png`) });
      await tap(`.pick[data-place="${dev.place}"]`); await sleep(300);
      check(await page.evaluate(() => __drv.screen === 'drive'), `${tag}: sürüş başlamadı`);
      check(await page.evaluate(([c, p]) => __drv.G.car === c && __drv.G.place === p, [dev.car, dev.place]), `${tag}: araba/yer yanlış`);
      for (const b of ['#leftBtn', '#rightBtn', '#horn', '#homeBtn', '#dstars']) check(await inView(b), `${tag}: ${b} ekranda değil`);
      check(!(await overflow()), `${tag}: sürüş ekranı yana taşıyor`);
      await page.evaluate(() => __drv.setFast(3));
      await sleep(1500);
      check(await page.evaluate(() => __drv.G.speed > 1000), `${tag}: araba gitmiyor`);
      await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-3-yol.png`) });
      // steering with the big buttons
      const lane0 = await page.evaluate(() => __drv.G.lane);
      await tap(lane0 < 1 ? '#rightBtn' : '#leftBtn'); await sleep(80);
      check(await page.evaluate(l => __drv.G.lane !== l, lane0), `${tag}: şerit değişmedi`);

      // drive: keep to the lane of the next star / the asked balloon, honk at the animals
      let shotLight = false, shotCross = false, shotBalloon = false, honked = false, guard = 0;
      while (!(await page.evaluate(() => __drv.G.arrived)) && guard++ < 400) {
        const s = await page.evaluate(() => { const G = __drv.G, ps = Math.floor((G.pos + __drv.PZ) / 200);
          const b = G.items.find(it => it.type === 'balloon' && !it.done && it.color === it.ev.target && it.seg >= ps - 12);
          const st = G.items.find(it => it.type === 'star' && !it.done && !it.passed && it.seg >= ps - 12);
          const want = b && b.seg < ps + 60 ? b.x : st ? st.x : 0;
          return { lane: G.lane, want: Math.round(want / (2 / 3)), light: G.ev.find(e => e.type === 'light'), cross: G.ev.find(e => e.type === 'cross'), task: !document.getElementById('task').hidden, speed: G.speed }; });
        if (s.want !== s.lane) await tap(s.want > s.lane ? '#rightBtn' : '#leftBtn');
        if (s.task && !shotBalloon) { shotBalloon = true; await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-4-balon.png`) }); }
        if (s.light.wait > 0.3 && !shotLight) { shotLight = true; await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-5-isik.png`) }); }
        if (s.cross.go && !s.cross.clear && s.speed < 5) {
          if (!shotCross) { shotCross = true; await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-6-hayvanlar.png`) }); check(await page.locator('#horn.glow').count() === 1, `${tag}: korna parlamıyor`); }
          await tap('#horn'); honked = true;
        }
        await sleep(120);
      }
      const G = await page.evaluate(() => { const G = __drv.G; return { stars: G.stars, light: G.ev[1].state, cross: G.ev[2].clear, balloon: G.ev[0].resolved, said: __drv.said.slice() }; });
      check(shotLight && G.light === 'green', `${tag}: trafik ışığında durup yeşili beklemedi`);
      check(shotCross && honked && G.cross, `${tag}: hayvanlar yoldan geçmedi`);
      check(G.balloon, `${tag}: istenen balon bulunmadı`);
      check(G.stars >= 20, `${tag}: çok az yıldız toplandı (${G.stars})`);
      await page.waitForFunction(() => !document.getElementById('doneOv').hidden, null, { timeout: 8000 }).catch(() => fails.push(`${tag}: varış kartı gelmedi`));
      await sleep(500);
      await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-7-varis.png`) });
      check(await inView('#againBtn') && await inView('#otherBtn'), `${tag}: varış düğmeleri ekranda değil`);
      const shown = await page.evaluate(() => +document.querySelector('#doneStars span').textContent);
      check(shown === G.stars, `${tag}: varışta yıldız sayısı yanlış ${shown}/${G.stars}`);
      const L = await page.evaluate(() => __drv.T[__drv.S.lang]);
      for (const want of [L.go[dev.place], L.light.red, L.light.yellow, L.light.green, L.cross[{ beach: 'crab', farm: 'cow', forest: 'rabbit', park: 'duck' }[dev.place]], L.bye]) check(G.said.includes(want), `${tag}: "${want}" söylenmedi`);
      // drive again: a fresh trip from the start
      await tap('#againBtn'); await sleep(300);
      check(await page.evaluate(() => __drv.G.pos < 2000 && !__drv.G.arrived && document.getElementById('doneOv').hidden), `${tag}: yine git çalışmadı`);
      await tap('#homeBtn'); await sleep(300);
      check(await page.evaluate(() => __drv.screen === 'garage'), `${tag}: garaja dönmedi`);
      await tap(`.pick[data-car="${dev.car}"]`); await sleep(300);
      check(await page.locator(`.pick[data-place="${dev.place}"] .got`).count() === 1, `${tag}: gidilen yerde rozet yok`);
      const total = await page.evaluate(() => __drv.S.total);
      await page.reload(); await sleep(300);
      check(await page.evaluate(() => __drv.S.total) === total && total >= G.stars, `${tag}: yıldızlar kaydedilmedi`);
    } catch (e) { fails.push(`${tag}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `direksiyon-${tag}-HATA.png`) }).catch(() => { }); }
    errs.forEach(e => fails.push(`${tag}: sayfa hatası: ${e}`));
    console.log(tag, 'bitti');
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('HATALAR:\n' + fails.join('\n')); process.exit(1); }
  console.log('İpek Direksiyonda: tüm testler geçti');
})();
