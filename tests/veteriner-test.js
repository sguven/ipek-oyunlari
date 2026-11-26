// Test for İpek's Animal Hospital: every animal is treated from start to finish (tap-a-tool-then-tap on touch devices,
// dragging tools with the mouse on desktop), a wrong tool is tried, then the "all better" party and replay are checked,
// plus layout/overflow, both languages and page errors.
// node veteriner-test.js [--only=device]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const DEVICES0 = [{ name: 'iphone-se', width: 375, height: 667, mobile: true }, { name: 'iphone-15', width: 393, height: 852, mobile: true }, { name: 'ipad', width: 820, height: 1180, mobile: true }, { name: 'telefon-yatay', width: 844, height: 390, mobile: true }, { name: 'masaustu', width: 1280, height: 800, mobile: false }];
const DEVICES = DEVICES0.filter(d => !ONLY || d.name === ONLY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = []; const check = (ok, m) => { if (!ok) fails.push(m); };
(async () => {
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
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
    const TOOL = await (async () => { await page.goto(base + '/veteriner/'); await sleep(400); return page.evaluate(() => __vet.PROB_TOOL); })();
    try {
      check((await page.title()) === "Ipek's Animal Hospital", `${tag}: başlık İngilizce açılmadı`);
      check(!(await overflow()), `${tag}: bekleme odası yana taşıyor`);
      check((await page.locator('.pat').count()) === 5, `${tag}: 5 hayvan yok`);
      await page.screenshot({ path: path.join(OUT, `veteriner-${tag}-1-bekleme.png`), fullPage: true });
      await tap('.lang button[data-lang="tr"]'); await sleep(150);
      check((await page.title()) === "İpek'in Hayvan Hastanesi", `${tag}: TR başlık`);

      const ids = await page.evaluate(() => __vet.ANIMALS.map(a => a.id));
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        await page.locator(`.pat[data-id="${id}"]`).evaluate(e => e.scrollIntoView({ block: 'center' }));
        await tap(`.pat[data-id="${id}"]`); await sleep(500);
        check(await page.evaluate(() => __vet.screen === 'room'), `${tag}: ${id}: tedavi odası açılmadı`);
        check(!(await overflow()), `${tag}: ${id}: tedavi odası yana taşıyor`);
        check(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), `${tag}: ${id}: tedavi odası aşağı taşıyor`);
        for (const t of ['steth', 'sponge', 'bandage', 'medicine', 'food']) check(await inView(`.tool[data-tool="${t}"]`), `${tag}: ${id}: ${t} aleti ekranda değil`);
        if (i === 0) await page.screenshot({ path: path.join(OUT, `veteriner-${tag}-2-tedavi.png`) });

        // a wrong tool first: it shakes and nothing gets fixed
        if (i === 0) {
          const left0 = await page.evaluate(() => __vet.cur.left.size);
          await tap('.tool[data-tool="medicine"]'); await sleep(250);
          check(await page.locator('.tool[data-tool="medicine"]').evaluate(e => e.classList.contains('nope')), `${tag}: yanlış alet sallanmadı`);
          await tap('.tool[data-tool="medicine"]'); await sleep(100); // put it back down
          check(await page.evaluate(() => __vet.cur.left.size) === left0, `${tag}: yanlış alet bir şey düzeltti`);
        }

        let guard = 0;
        while (await page.evaluate(() => __vet.cur && __vet.cur.left.size > 0) && guard++ < 12) {
          const p = await page.evaluate(() => [...__vet.cur.left][0]);
          const t = TOOL[p], tg = await box(`#stage [data-target="${p}"]`);
          if (dev.mobile) {
            if (!(await page.locator(`.tool[data-tool="${t}"].held`).count())) { await tap(`.tool[data-tool="${t}"]`); await sleep(120); }
            await tapXY(tg.x, tg.y);
          } else {
            const tb = await box(`.tool[data-tool="${t}"]`);
            await page.mouse.move(tb.x, tb.y); await page.mouse.down();
            for (let s = 1; s <= 8; s++) await page.mouse.move(tb.x + (tg.x - tb.x) * s / 8, tb.y + (tg.y - tb.y) * s / 8);
            await page.mouse.up();
          }
          await sleep(p === 'steth' ? 2100 : 250);
          if (p === 'boo' || p === 'hungry') {
            // a choice panel: the animal's favourite food, or the bandage colour that was asked for
            await page.waitForSelector('#choice .opt', { timeout: 3000 }).catch(() => fails.push(`${tag}: ${id}: ${p} seçim paneli açılmadı`));
            await sleep(450);
            const want = await page.evaluate(() => __vet.choice && __vet.choice.want);
            const opts = await page.locator('#choice .opt').evaluateAll(b => b.map(x => x.dataset.o));
            check(opts.length === 3 && opts.filter(o => o === want).length === 1, `${tag}: ${id}: seçenekler yanlış ${opts} / ${want}`);
            if (i === 0) {
              await page.screenshot({ path: path.join(OUT, `veteriner-${tag}-2b-secim-${p}.png`) });
              await tap('#choice .opt', opts.findIndex(o => o !== want)); await sleep(250);
              check(await page.evaluate(p => __vet.cur.left.has(p), p), `${tag}: ${id}: yanlış seçim kabul edildi`);
            }
            await tap('#choice .opt', opts.indexOf(want)); await sleep(800);
            check(await page.locator('#choice').count() === 0, `${tag}: ${id}: seçim paneli kapanmadı`);
          }
          check(await page.evaluate(p => !__vet.cur.left.has(p), p), `${tag}: ${id}: ${p} düzelmedi`);
        }
        check(await page.evaluate(() => document.querySelector('#stage svg.an').classList.contains('happy')), `${tag}: ${id}: hayvan mutlu olmadı`);
        if (i === 0) await page.screenshot({ path: path.join(OUT, `veteriner-${tag}-3-iyilesti.png`) });
        if (i < ids.length - 1) {
          await page.waitForFunction(() => __vet.screen === 'home', null, { timeout: 10000 }).catch(() => fails.push(`${tag}: ${id}: bekleme odasına kendiliğinden dönmedi`));
          check(await page.locator(`.pat[data-id="${id}"].well`).count() === 1, `${tag}: ${id}: kartta yıldız yok`);
        }
      }
      await page.waitForFunction(() => !document.getElementById('doneOv').hidden, null, { timeout: 10000 }).catch(() => fails.push(`${tag}: kutlama penceresi gelmedi`));
      await sleep(400);
      await page.screenshot({ path: path.join(OUT, `veteriner-${tag}-4-kutlama.png`) });
      check(await inView('#againBtn'), `${tag}: yeniden oyna düğmesi ekranda değil`);
      const S = await page.evaluate(() => ({ healed: __vet.S.healed.length, total: __vet.S.total }));
      check(S.healed === 5 && S.total === 5, `${tag}: sayaç yanlış ${JSON.stringify(S)}`);
      await tap('#againBtn'); await sleep(300);
      check(await page.locator('.pat.sick').count() === 5, `${tag}: yeniden oyna hayvanları hasta yapmadı`);
      await page.reload(); await sleep(300);
      check(await page.evaluate(() => __vet.S.total) === 5, `${tag}: yıldızlar kaydedilmedi`);
    } catch (e) { fails.push(`${tag}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `veteriner-${tag}-HATA.png`) }).catch(() => { }); }
    errs.forEach(e => fails.push(`${tag}: sayfa hatası: ${e}`));
    console.log(tag, 'bitti');
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('HATALAR:\n' + fails.join('\n')); process.exit(1); }
  console.log('Hayvan Hastanesi: tüm testler geçti');
})();
