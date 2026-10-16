// Test for İpek's Brain Games: the levels of all five games from start to finish (including wrong attempts), drag and drop, robot solutions, layout, persistence.
// node zeka-test.js [--only=device]  (on desktop all levels silently; on other devices the first two levels of each game with sound)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const DEVICES0 = [{ name: 'masaustu', width: 1280, height: 800, mobile: false, all: true }, { name: 'iphone-se', width: 375, height: 667, mobile: true }, { name: 'iphone-15', width: 393, height: 852, mobile: true }, { name: 'ipad', width: 820, height: 1180, mobile: true }, { name: 'tablet-yatay', width: 1180, height: 820, mobile: true }, { name: 'telefon-yatay', width: 844, height: 390, mobile: true }];
const DEVICES = DEVICES0.filter(d => !ONLY || d.name === ONLY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = []; const check = (ok, m) => { if (!ok) fails.push(m); };
(async () => {
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  // are the robot levels solvable
  { const p = await browser.newPage(); await p.goto(base + '/zeka/'); const r = await p.evaluate(() => __zeka.ROB.map((c, i) => { const s = __zeka.robSolve(c); return s ? s.length : -1 })); r.forEach((n, i) => check(n > 0, `robot bölüm ${i + 1} çözülemiyor`)); console.log('robot en kısa yollar:', r.join(' ')); await p.close(); }

  for (const dev of DEVICES) {
    const tag = dev.name;
    const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.mobile, isMobile: dev.mobile, locale: 'tr-TR' });
    await ctx.route(/fonts\./, r => r.abort());
    const page = await ctx.newPage(); const errs = [], clips = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('request', r => { if (r.url().endsWith('.mp3')) clips.push(r.url()); });
    const tapL = async l => { await l.evaluate(e => e.scrollIntoView({ block: 'center' }), null, { timeout: 5000 }); const b = await l.boundingBox(); if (!b) throw new Error('görünmüyor'); if (dev.mobile) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
    const tap = (sel, nth = 0) => tapL(page.locator(sel).nth(nth)).catch(e => { throw new Error('dokunulamadı ' + sel + ' ' + e.message.split('\n')[0]) });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const G = () => page.evaluate(() => { const g = __zeka.G; return { id: g.id, lv: g.lv, gen: g.gen, test: g.test } });
    const waitDone = async (label, ms = 60000) => { await page.waitForFunction(() => !document.getElementById('doneOv').hidden, null, { timeout: ms }).catch(async () => { fails.push(`${tag}: ${label}: bölüm bitmedi`); await page.screenshot({ path: path.join(OUT, `zeka-${tag}-HATA.png`) }); throw new Error('durdu'); }); };
    const shots = new Set(); const shot = async n => { if (shots.has(n)) return; shots.add(n); await page.screenshot({ path: path.join(OUT, `zeka-${tag}-${n}.png`) }); };

    const play = {
      async hafiza(lv, wrong) {
        await page.waitForFunction(() => !document.querySelector('.mc.open'), null, { timeout: 8000 });
        await shot('hafiza');
        const cards = (await G()).test.cards;
        if (wrong) { const a = 0, b = cards.findIndex(e => e !== cards[0]); await tap('.mc', a); await tap('.mc', b); await sleep(1300); check(await page.locator('.mc.open').count() === 0, `${tag}: yanlış kartlar kapanmadı`); }
        const done = new Set();
        for (let i = 0; i < cards.length; i++) { if (done.has(i)) continue; const j = cards.findIndex((e, k) => k !== i && e === cards[i]); done.add(i); done.add(j); await tap('.mc', i); await sleep(80); await tap('.mc', j); await sleep(420); }
      },
      async yapboz(lv, wrong) {
        await sleep(200); await shot('yapboz');
        const t = (await G()).test;
        // drag and drop: the first piece (into a wrong cell first)
        const drag = async (p, c) => { const pb = await page.locator(`.pc[data-p="${p}"]`).boundingBox(); const cb = await page.locator(`.cellj[data-c="${c}"]`).boundingBox(); await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(pb.x + pb.width / 2 + (cb.x + cb.width / 2 - pb.x - pb.width / 2) * k / 8, pb.y + pb.height / 2 + (cb.y + cb.height / 2 - pb.y - pb.height / 2) * k / 8); await page.mouse.up(); await sleep(150); };
        await page.locator('.pc[data-p="0"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
        if (wrong) { await drag(0, 1); check(await page.locator('.cellj.f').count() === 0, `${tag}: yanlış yere parça kondu`); }
        await page.locator('#jb').evaluate(e => e.scrollIntoView({ block: 'start' }));
        await drag(0, 0); check(await page.locator('.cellj[data-c="0"].f').count() === 1, `${tag}: sürükle-bırak çalışmadı`);
        for (let i = 1; i < t.N; i++) { await tap(`.pc[data-p="${i}"]`); await tap(`.cellj[data-c="${i}"]`); await sleep(60); }
      },
      async robot(lv, wrong) {
        await sleep(200); await shot('robot');
        const { sol } = (await G()).test;
        const dir = { u: 'u', d: 'd', l: 'l', r: 'r' };
        if (wrong) { await tap(`.arrow[data-d="${sol[0] === 'u' ? 'd' : 'u'}"]`); await tap('#run'); await sleep(2200); await tap('#del'); }
        for (const d of sol) await tap(`.arrow[data-d="${dir[d]}"]`);
        await shot('robot-prog'); await tap('#run');
      },
      async farkli(lv, wrong) {
        for (let r = 0; r < 5; r++) {
          await page.waitForSelector('.ch:not([disabled])', { timeout: 15000 }); await sleep(250);
          if (r === 0) await shot('farkli');
          const { test, gen } = await G();
          const keys = await page.locator('.ch').evaluateAll(b => b.map(x => x.dataset.e));
          check(keys.filter(k => k === test.odd).length === 1, `${tag}: farklı olan bir tane değil`);
          if (wrong && r === 0) { await tap('.ch', keys.findIndex(k => k !== test.odd)); await sleep(120); }
          await tap('.ch', keys.indexOf(test.odd));
          if (r < 4) await page.waitForFunction(g => __zeka.G.gen !== g, gen, { timeout: 15000 });
        }
      },
      async sirala(lv, wrong) {
        for (let r = 0; r < 4; r++) {
          await page.waitForSelector('.tcard:not([disabled])', { timeout: 15000 }); await sleep(250);
          if (r === 0) await shot('sirala-' + lv);
          const { test, gen } = await G();
          if (wrong && r === 0) { await tap('.tcard[data-i="1"]'); await sleep(100); check(await page.locator('.sl.f').count() === 0, `${tag}: yanlış sıra kabul edildi`); }
          for (let i = 0; i < test.n; i++) { await tap(`.tcard[data-i="${i}"]`); await sleep(80); }
          if (r < 3) await page.waitForFunction(g => __zeka.G.gen !== g, gen, { timeout: 15000 });
        }
      }
    };

    try {
      await page.goto(base + '/zeka/'); await sleep(400);
      check((await page.title()) === "İpek'in Zekâ Oyunları", `${tag}: başlık`);
      check(await page.locator('.gcard').count() === 5, `${tag}: oyun sayısı`);
      check(!(await overflow()), `${tag}: ana sayfa taşıyor`);
      await page.screenshot({ path: path.join(OUT, `zeka-${tag}-0-ana.png`), fullPage: true });
      if (dev.all) await page.evaluate(() => { __zeka.S.sound = false });
      for (const id of ['hafiza', 'yapboz', 'robot', 'farkli', 'sirala']) {
        const n = await page.evaluate(id => __zeka.GAMES[id].levels, id), upto = dev.all ? n : 2;
        await tap(`.gcard[data-g="${id}"]`); await sleep(300);
        for (let lv = 0; lv < upto; lv++) {
          const g = await G(); check(g.id === id && g.lv === lv, `${tag}: ${id} beklenen bölüm ${lv}, gelen ${g.lv}`);
          check(!(await overflow()), `${tag}: ${id} ${lv + 1} taşıyor`);
          await play[id](lv, lv === 0);
          await waitDone(`${id} ${lv + 1}`);
          if (lv === 0) await shot('bitti-' + id);
          const st = await page.evaluate(([id, lv]) => __zeka.S.prog[id][lv], [id, lv]);
          check(st >= 1 && st <= 3, `${tag}: ${id} ${lv + 1} yıldız ${st}`);
          if (lv < upto - 1) await tap('#nextBtn'); await sleep(350);
        }
        if (await page.locator('#doneOv').isVisible()) { if (await page.locator('#homeBtn').isVisible()) await tap('#homeBtn'); else await tap('#nextBtn'); }
        await sleep(300);
        if (await page.locator('#game').isVisible()) await tap('#backBtn');
        await sleep(200);
      }
      await page.screenshot({ path: path.join(OUT, `zeka-${tag}-9-ana-sonra.png`), fullPage: true });
      await page.reload(); await sleep(400);
      const pr = await page.evaluate(() => Object.fromEntries(Object.entries(__zeka.S.prog).map(([k, v]) => [k, v.filter(Boolean).length])));
      for (const id of ['hafiza', 'yapboz', 'robot', 'farkli', 'sirala']) check(pr[id] >= (dev.all ? 5 : 2), `${tag}: ${id} ilerleme kaydedilmedi ${pr[id]}`);
      await page.locator('.lang button[data-lang="en"]').click(); await sleep(200);
      check((await page.locator('.gcard b').first().textContent()) === 'Memory Cards', `${tag}: İngilizce olmadı`);
      if (!dev.all) check(clips.length > 2, `${tag}: kayıtlı ses çalmadı`);
    } catch (e) { if (e.message !== 'durdu') fails.push(`${tag}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `zeka-${tag}-HATA.png`) }).catch(() => { }); }
    check(!errs.length, `${tag}: hatalar: ${errs.join(' | ')}`);
    console.log(`✓ ${tag}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('\nSORUNLAR:\n- ' + [...new Set(fails)].join('\n- ')); process.exit(1); }
  console.log('\nZekâ Oyunları testleri geçti.');
})();
