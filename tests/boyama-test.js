// Test for İpek's Coloring Book: gallery, fully painting a picture by tapping the hint dots, brush, stamp, undo, save, persistence, layout.
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
    const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.mobile, isMobile: dev.mobile, locale: 'tr-TR', acceptDownloads: true });
    await ctx.route(/fonts\./, r => r.abort());
    const page = await ctx.newPage(); const errs = [], clips = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('request', r => { if (r.url().endsWith('.mp3')) clips.push(r.url()); });
    const tapXY = async (x, y) => { if (dev.mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    const tap = async (sel, nth = 0) => { const l = page.locator(sel).nth(nth); await l.evaluate(e => e.scrollIntoView({ block: 'center' }), null, { timeout: 5000 }); const b = await l.boundingBox(); if (!b) throw new Error('görünmüyor: ' + sel); await tapXY(b.x + b.width / 2, b.y + b.height / 2); };
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const toScreen = (x, y) => page.evaluate(([x, y]) => { const a = document.getElementById('art'), p = new DOMPoint(x, y).matrixTransform(a.getScreenCTM()); return [p.x, p.y]; }, [x, y]);
    try {
      await page.goto(base + '/boyama/'); await sleep(500);
      check((await page.title()) === "İpek'in Boyama Kitabı", `${tag}: başlık`);
      check(await page.locator('.pcard').count() === 13, `${tag}: resim sayısı`);
      check(!(await overflow()), `${tag}: galeri taşıyor`);
      await page.screenshot({ path: path.join(OUT, `boyama-${tag}-1-galeri.png`), fullPage: true });

      // fully paint the butterfly using the hints
      await tap('.pcard[data-p="kelebek"]'); await sleep(400);
      check(!(await overflow()), `${tag}: boyama ekranı taşıyor`);
      const st = await page.locator('.stage').boundingBox();
      check(st && st.y + st.height <= dev.height + 1 && st.width >= 230, `${tag}: resim ekrana sığmıyor ${JSON.stringify(st)}`);
      const t0 = Date.now(); const pts = await page.evaluate(() => __boya.hintPoints()); const ht = Date.now() - t0;
      const regs = await page.evaluate(() => __boya.cur.p.regions.map(r => r[2]));
      check(pts.every(Boolean), `${tag}: ipucu noktası bulunamayan bölge var (${pts.map((p, i) => p ? '' : i).filter(Boolean)})`);
      check(await page.locator('.hints circle').count() === regs.length * 2, `${tag}: ipucu noktaları eksik`);
      await page.screenshot({ path: path.join(OUT, `boyama-${tag}-2-bos.png`) });
      // brush: a line starting inside the wing must stay on the wing
      await tap('.tool[data-t="brush"]'); await tap('.sw[data-c="blue"]');
      const wing = await page.evaluate(() => __boya.hintPoints()[8]);
      const [wx, wy] = await toScreen(wing[0], wing[1]); const [wx2, wy2] = await toScreen(wing[0] + 120, wing[1] + 60);
      await page.mouse.move(wx, wy); await page.mouse.down(); for (let k = 1; k <= 12; k++) await page.mouse.move(wx + (wx2 - wx) * k / 12, wy + (wy2 - wy) * k / 12); await page.mouse.up(); await sleep(150);
      const b = await page.evaluate(() => ({ n: __boya.cur.ps.b.length, r: __boya.cur.ps.b[0] && __boya.cur.ps.b[0].r, inG: document.querySelectorAll('[data-g="8"] .br path').length }));
      check(b.n === 1 && b.r === 8 && b.inG === 1, `${tag}: fırça çizgisi yanlış bölgede ${JSON.stringify(b)}`);
      // paint every region with its suggested colour using the paint bucket
      await tap('.tool[data-t="fill"]');
      let lastC = null;
      for (let i = 0; i < regs.length; i++) {
        if (regs[i] !== lastC) { await tap(`.sw[data-c="${regs[i]}"]`); lastC = regs[i]; }
        const [x, y] = await toScreen(pts[i][0], pts[i][1]);
        if (i === regs.length - 1) await page.screenshot({ path: path.join(OUT, `boyama-${tag}-3-boyaniyor.png`) });
        await tapXY(x, y); await sleep(60);
        const got = await page.evaluate(i => __boya.cur.ps.f[i], i);
        if (got !== regs[i]) { fails.push(`${tag}: bölge ${i} boyanmadı (${got} != ${regs[i]})`); break; }
      }
      await page.waitForFunction(() => !document.getElementById('doneOv').hidden, null, { timeout: 4000 }).catch(() => fails.push(`${tag}: bitince kutlama gelmedi`));
      await sleep(500);
      await page.screenshot({ path: path.join(OUT, `boyama-${tag}-4-bitti.png`) });
      check(await page.locator('.hints circle').count() === 0, `${tag}: doğru boyanınca ipuçları kalkmadı`);
      // save: there must be a download (or share)
      const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null);
      await tap('#saveBtn'); const d = await dl;
      if (d) { const fp = path.join(OUT, `boyama-${tag}-kayit.png`); await d.saveAs(fp); check(fs.statSync(fp).size > 20000, `${tag}: kaydedilen resim çok küçük`); }
      else fails.push(`${tag}: resim kaydedilmedi`);
      await tap('#moreBtn'); await sleep(200);
      // geri al: son boyama
      const lastI = regs.length - 1;
      await tap('#undoBtn'); await sleep(150);
      check(!(await page.evaluate(i => __boya.cur.ps.f[i], lastI)), `${tag}: geri al çalışmadı`);
      // damga
      await tap('.tool[data-t="stamp"]'); await tap('.sub[data-st="heart"]'); await tap('.sw[data-c="red"]');
      const [sx, sy] = await toScreen(60, 60); await tapXY(sx, sy); await sleep(150);
      check(await page.evaluate(() => __boya.cur.ps.s.length === 1 && document.querySelectorAll('#art .stamps > g').length === 1), `${tag}: damga basılmadı`);
      await page.screenshot({ path: path.join(OUT, `boyama-${tag}-5-damga.png`) });
      await tap('#backBtn'); await sleep(300);
      check(await page.locator('.pcard[data-p="kelebek"] .badge').count() === 1, `${tag}: galeride yıldız yok`);
      // empty page: brush is the default
      await tap('.pcard[data-p="serbest"]'); await sleep(300);
      check(await page.evaluate(() => __boya.S.tool) !== 'fill', `${tag}: boş sayfada fırça seçili değil`);
      await tap('.tool[data-t="brush"]'); await tap('.sub[data-s="thin"]');
      const [fx, fy] = await toScreen(100, 100), [fx2, fy2] = await toScreen(300, 280);
      await page.mouse.move(fx, fy); await page.mouse.down(); for (let k = 1; k <= 10; k++) await page.mouse.move(fx + (fx2 - fx) * k / 10, fy + (fy2 - fy) * k / 10 + Math.sin(k) * 20); await page.mouse.up();
      await page.screenshot({ path: path.join(OUT, `boyama-${tag}-6-serbest.png`) });
      await tap('#backBtn'); await sleep(300);
      // persistence + language
      await page.reload(); await sleep(400);
      const S = await page.evaluate(() => ({ k: Object.keys(__boya.S.pics.kelebek.f).length, d: __boya.S.pics.kelebek.done, b: __boya.S.pics.serbest.b.length }));
      check(S.k === regs.length - 1 && S.d && S.b === 1, `${tag}: kaydedilmedi ${JSON.stringify(S)}`);
      await tap('.lang button[data-lang="en"]'); await sleep(200);
      check((await page.locator('.pcard b').first().textContent()) === 'Blank page', `${tag}: İngilizce olmadı`);
      check(clips.length >= 1, `${tag}: kayıtlı ses çalmadı`);
      if (tag === 'masaustu') console.log(`  ipucu hesaplama: ${ht} ms`);
      // every picture must have hint dots
      if (tag === 'masaustu') for (const id of await page.evaluate(() => __boya.PICS.map(p => p.id))) {
        await page.evaluate(id => __boya.openPic(id), id); await sleep(100);
        const miss = await page.evaluate(() => __boya.hintPoints().map((p, i) => p ? -1 : i).filter(i => i >= 0));
        if (miss.length && id !== 'serbest') fails.push(`ipucu yok: ${id} bölgeler ${miss}`);
      }
    } catch (e) { fails.push(`${tag}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `boyama-${tag}-HATA.png`) }).catch(() => { }); }
    check(!errs.length, `${tag}: hatalar: ${errs.join(' | ')}`);
    console.log(`✓ ${tag}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('\nSORUNLAR:\n- ' + [...new Set(fails)].join('\n- ')); process.exit(1); }
  console.log('\nBoyama Kitabı testleri geçti.');
})();
