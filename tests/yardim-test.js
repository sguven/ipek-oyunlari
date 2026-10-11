// İpek'in Yardım Köyü testi: üç mod da baştan sona oynanır (yanlış seçimler dahil), yerleşim/taşma ve hata kontrolü.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const DEVICES0 = [{ name: 'iphone-se', width: 375, height: 667, mobile: true }, { name: 'iphone-15', width: 393, height: 852, mobile: true }, { name: 'ipad', width: 820, height: 1180, mobile: true }, { name: 'tablet-yatay', width: 1180, height: 820, mobile: true }, { name: 'telefon-yatay', width: 844, height: 390, mobile: true }, { name: 'masaustu', width: 1280, height: 800, mobile: false }];
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
    const page = await ctx.newPage(); const errs = [], clips = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('request', r => { if (r.url().endsWith('.mp3')) clips.push(r.url()); });
    const tap = async (sel, nth = 0) => { const l = page.locator(sel).nth(nth); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); const b = await l.boundingBox(); if (!b) throw new Error('görünmüyor: ' + sel); if (dev.mobile) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    let step = '';
    const waitReward = async () => { try { await page.waitForFunction(() => !document.getElementById('rewardOv').hidden, null, { timeout: 15000 }); } catch (e) { await page.screenshot({ path: path.join(OUT, `yardim-${tag}-HATA.png`) }); throw new Error('ödül penceresi gelmedi: ' + step + ' ' + JSON.stringify(await page.evaluate(() => ({ G: { kind: __yardim.G.kind, done: __yardim.G.done, left: __yardim.G.left, basket: __yardim.G.basket, plates: __yardim.G.plates } })))); } };
    try {
      await page.goto(base + '/yardim/'); await sleep(500);
      check((await page.title()) === "İpek'in Yardım Köyü", `${tag}: başlık`);
      check(!(await overflow()), `${tag}: ana sayfa taşıyor`);
      await page.screenshot({ path: path.join(OUT, `yardim-${tag}-1-ana.png`), fullPage: true });

      // YARDIM ET: 3 tur, her turda önce yanlış eşya
      await tap('.tile[data-mode="help"]'); await sleep(500);
      for (let r = 0; r < 3; r++) { step = 'yardım ' + r;
        const st = await page.evaluate(() => ({ kind: __yardim.G.kind, item: __yardim.SC[__yardim.G.kind].item }));
        const keys = await page.locator('.opt').evaluateAll(b => b.map(x => x.dataset.k));
        check(keys.filter(k => k === st.item).length === 1, `${tag}: doğru eşya bir kez yok (${st.kind})`);
        check(new Set(keys).size === keys.length, `${tag}: tekrar eden seçenek`);
        if (r === 0) await page.screenshot({ path: path.join(OUT, `yardim-${tag}-2-yardim.png`) });
        const wrong = keys.findIndex(k => k !== st.item);
        await tap('.opt', wrong); await sleep(200);
        check(await page.locator('.opt').nth(wrong).evaluate(e => e.classList.contains('nope')), `${tag}: yanlış eşya işaretlenmedi`);
        await tap('.opt', keys.indexOf(st.item));
        await waitReward();
        if (r === 0) await page.screenshot({ path: path.join(OUT, `yardim-${tag}-3-tesekkur.png`) });
        check(!(await overflow()), `${tag}: yardım ekranı taşıyor`);
        await tap('#rewardGo'); await sleep(400);
      }
      const h1 = await page.evaluate(() => __yardim.S.hearts);
      check(h1 === 3, `${tag}: 3 yardımdan sonra kalp ${h1}`);
      await tap('#backBtn'); await sleep(300);

      step = 'paylaş';
      // PAYLAŞ: önce hepsini ilk tabağa ver (eşitsiz), sonra düzelt
      await tap('.tile[data-mode="share"]'); await sleep(400);
      let total = await page.evaluate(() => __yardim.G.basket);
      for (let i = 0; i < total; i++) { await tap('.plate', 0); await sleep(80); }
      await page.screenshot({ path: path.join(OUT, `yardim-${tag}-4-esitsiz.png`) });
      check(await page.locator('.plate.hint').count() === 1, `${tag}: eşitsizlikte ipucu yok`);
      for (let i = 0; i < 12 && !(await page.evaluate(() => __yardim.G.done)); i++) { await tap('.plate.hint'); await sleep(120); }
      check(await page.evaluate(() => __yardim.G.done), `${tag}: paylaşım eşitlenmedi`);
      await waitReward(); await tap('#rewardHome'); await sleep(300);

      step = 'topla';
      // TOPLA: önce çiçeğe dokun (kalmalı), sonra bütün çöpler
      await tap('.tile[data-mode="clean"]'); await sleep(500);
      await page.screenshot({ path: path.join(OUT, `yardim-${tag}-5-park.png`) });
      await tap('.thing[data-t="flower"]'); await sleep(200);
      check(await page.locator('.thing[data-t="flower"]').count() === 4 && !(await page.locator('.thing.gone[data-t="flower"]').count()), `${tag}: çiçek toplandı`);
      const n = await page.locator('.thing[data-t="trash"]').count();
      for (let i = 0; i < n; i++) { await tap('.thing[data-t="trash"]:not(.gone)'); await sleep(150); }
      await waitReward();
      await page.screenshot({ path: path.join(OUT, `yardim-${tag}-6-temiz.png`) });
      await tap('#rewardHome'); await sleep(300);
      const S = await page.evaluate(() => __yardim.S);
      check(S.hearts === 6 && S.cleans === 1 && S.shares === 1, `${tag}: sayaçlar yanlış ${JSON.stringify({ h: S.hearts, c: S.cleans, s: S.shares })}`);
      await tap('#albumBtn'); await sleep(200);
      check(await page.locator('.alb.got').count() >= 1, `${tag}: albüm boş`);
      await page.screenshot({ path: path.join(OUT, `yardim-${tag}-7-album.png`) });
      await tap('#albumClose');
      check(clips.length > 3, `${tag}: kayıtlı ses çalmadı`);
      // ilerleme kalıcı
      await page.reload(); await sleep(400);
      check((await page.evaluate(() => __yardim.S.hearts)) === 6, `${tag}: ilerleme kaydedilmedi`);
    } catch (e) { fails.push(`${tag}: ${e.message.split('\n')[0]}`); }
    check(!errs.length, `${tag}: hatalar: ${errs.join(' | ')}`);
    console.log(`✓ ${tag}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('\nSORUNLAR:\n- ' + fails.join('\n- ')); process.exit(1); }
  console.log('\nYardım Köyü testleri geçti.');
})();
