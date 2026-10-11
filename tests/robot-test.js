// Kelebek oyunu "Robota öğret" modu testi: tutarlı bir kuralla öğret, robotun tahminlerini dürüstçe değerlendir,
// robot öğrenip bitirmeli; yerleşim taşmamalı; hata olmamalı.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const DEVICES = [{ name: 'iphone-se', width: 375, height: 667, mobile: true }, { name: 'ipad', width: 820, height: 1180, mobile: true }, { name: 'telefon-yatay', width: 844, height: 390, mobile: true }, { name: 'masaustu', width: 1280, height: 800, mobile: false }];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = []; const check = (ok, m) => { if (!ok) fails.push(m); };
const rule = ci => (ci <= 2 ? 0 : 1); // kırmızı/sarı → pembe, mavi/mor → mavi
(async () => {
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  for (const dev of DEVICES) {
    const tag = dev.name;
    const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.mobile, isMobile: dev.mobile, locale: 'tr-TR' });
    await ctx.route(/fonts\./, r => r.abort());
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    const tap = async sel => { const l = page.locator(sel).first(); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); const b = await l.boundingBox(); if (dev.mobile) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
    await page.goto(base + '/kelebek/'); await sleep(500);
    check(await page.locator('.tile[data-mode="robot"]').isVisible(), `${tag}: Robota öğret kutusu yok`);
    await tap('.tile[data-mode="robot"]'); await sleep(400);
    check(await page.locator('#robotPlay').isVisible(), `${tag}: robot ekranı açılmadı`);
    await page.screenshot({ path: path.join(OUT, `robot-${tag}-1-ogret.png`) });
    let steps = 0, sawUnknown = false, sawWrong = false, sawGuess = false, done = false;
    while (steps++ < 40) {
      await page.waitForFunction(() => !AI.busy && (AI.phase === 'teach' || AI.phase === 'fix' || !document.getElementById('rCheck').hidden || !document.getElementById('rewardOv').hidden), null, { timeout: 15000 });
      const st = await page.evaluate(() => ({ phase: AI.phase, cur: AI.cur, guess: AI.guess, check: !document.getElementById('rCheck').hidden, reward: !document.getElementById('rewardOv').hidden }));
      if (st.reward) { done = true; break; }
      if (st.check) {
        sawGuess = true;
        const right = st.guess === rule(st.cur);
        if (!right) sawWrong = true;
        if (steps === 6) await page.screenshot({ path: path.join(OUT, `robot-${tag}-2-tahmin.png`) });
        await tap(right ? '#rYes' : '#rNo'); await sleep(250);
      } else {
        if (st.phase === 'fix' && st.guess == null) sawUnknown = true;
        await tap(`#robotPlay .home[data-h="${rule(st.cur)}"]`); await sleep(250);
      }
    }
    check(done, `${tag}: robot turu bitmedi (${steps} adım)`);
    check(sawGuess, `${tag}: robot hiç tahmin etmedi`);
    const acc = await page.evaluate(() => AI.ex.length);
    await page.screenshot({ path: path.join(OUT, `robot-${tag}-3-bitti.png`) });
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${tag}: yatay taşma`);
    check((await page.evaluate(() => S.stars)) >= 3, `${tag}: bitince yıldız verilmedi`);
    check(!errs.length, `${tag}: hatalar: ${errs.join(' | ')}`);
    console.log(`✓ ${tag}: ${steps} adım, ${acc} örnek, görmediği renk=${sawUnknown}, yanılma=${sawWrong}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('\nSORUNLAR:\n- ' + fails.join('\n- ')); process.exit(1); }
  console.log('\nRobot modu testleri geçti.');
})();
