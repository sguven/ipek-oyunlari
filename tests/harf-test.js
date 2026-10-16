// Test for İpek's Letter Islands: content checks, letter-strokes page, lessons from start to finish (including writing), playground, layout.
// node harf-test.js [--only=device] [--letters=N]  (on desktop all 29 letters are played silently; on other devices the first N letters with sound)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const ONLY = arg('only'), NL = +(arg('letters') || 3);
const DEVICES0 = [{ name: 'masaustu', width: 1280, height: 800, mobile: false, all: true }, { name: 'iphone-se', width: 375, height: 667, mobile: true }, { name: 'iphone-15', width: 393, height: 852, mobile: true }, { name: 'ipad', width: 820, height: 1180, mobile: true }, { name: 'tablet-yatay', width: 1180, height: 820, mobile: true }, { name: 'telefon-yatay', width: 844, height: 390, mobile: true }];
const DEVICES = DEVICES0.filter(d => !ONLY || d.name === ONLY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = []; const check = (ok, m) => { if (!ok) fails.push(m); };

(async () => {
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  /* 1) content checks + letter-strokes page */
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(base + '/harf/'); await sleep(300);
    const audit = await page.evaluate(() => {
      const H = __harf, out = [], per = {};
      const VOW = 'aeıioöuü';
      for (const l of H.ORDER) {
        if (!H.STROKES[l]) out.push('çizgi yok: ' + l);
        if (!H.SHAPE[l]) out.push('şekil ipucu yok: ' + l);
        if (!H.KEY[l]) out.push('anahtar kelime yok: ' + l);
        (H.STROKES[l] || []).forEach((s, i) => s.forEach(([x, y]) => { if (x < 3 || x > 97 || y < 4 || y > 108) out.push(`kutu dışı ${l}#${i} ${x.toFixed(1)},${y.toFixed(1)}`) }));
        const good = H.PICS.filter(([w]) => l === 'ğ' ? w.includes('ğ') : w[0] === l);
        if (good.length < 2) out.push(`sesi bul için az resim: ${l} (${good.length})`);
        const st = H.buildSteps(l).map(s => s.k);
        per[l] = { steps: st.join(','), sy: H.syllables(l).length, rd: H.readable(l).withL.length, se: H.sentences(l).length };
      }
      // no word/sentence emoji may be empty, and words must not repeat
      const seen = new Set(); H.READ.forEach(([w, e]) => { if (!e) out.push('emoji yok ' + w); if (seen.has(w)) out.push('tekrar kelime ' + w); seen.add(w) });
      // at least one sentence must be readable at the end of each group
      H.GROUPS.forEach(g => { const l = g[g.length - 1]; if (!H.sentences(l).length) out.push('grup sonunda cümle yok: ' + l) });
      return { out, per };
    });
    audit.out.forEach(m => fails.push('içerik: ' + m));
    console.log('Ders adımları:'); for (const [l, v] of Object.entries(audit.per)) console.log(`  ${l}: ${v.steps}  (hece ${v.sy}, kelime ${v.rd}, cümle ${v.se})`);
    // the upright print strokes of all letters on one page (visual check)
    await page.evaluate(() => {
      const H = __harf; const cols = ['#ff5a8a', '#4aa8ff', '#1f9e66', '#ff9f43'];
      document.body.innerHTML = '<div id="sheet" style="display:grid;grid-template-columns:repeat(8,130px);gap:6px;padding:10px;background:#fff">' + H.ORDER.map(l => {
        const paths = H.STROKES[l].map((s, i) => `<path d="M${s.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L')}" stroke="${cols[i % 4]}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="${s[0][0]}" cy="${s[0][1]}" r="3.5" fill="${cols[i % 4]}"/><text x="${s[0][0] + 4}" y="${s[0][1] - 3}" font-size="9" fill="#333">${i + 1}</text>`).join('');
        return `<div style="border:1px solid #ccc"><svg viewBox="0 0 100 112" width="128" height="143"><line x1="0" y1="10" x2="100" y2="10" stroke="#ddd"/><line x1="0" y1="45" x2="100" y2="45" stroke="#bbb" stroke-dasharray="3 2"/><line x1="0" y1="80" x2="100" y2="80" stroke="#e86a7a"/><line x1="0" y1="102" x2="100" y2="102" stroke="#ddd"/>${paths}<text x="4" y="108" font-size="10">${l}</text></svg></div>`
      }).join('') + '</div>';
    });
    await page.locator('#sheet').screenshot({ path: path.join(OUT, 'harf-cizgiler.png') });
    await page.close();
  }

  for (const dev of DEVICES) {
    const tag = dev.name, nLetters = dev.all ? 29 : NL;
    const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.mobile, isMobile: dev.mobile, locale: 'tr-TR' });
    await ctx.route(/fonts\./, r => r.abort());
    const page = await ctx.newPage(); const errs = [], clips = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('request', r => { if (r.url().endsWith('.mp3')) clips.push(r.url()); });
    const center = async loc => { await loc.evaluate(e => e.scrollIntoView({ block: 'center' }), null, { timeout: 5000 }); const b = await loc.boundingBox(); if (!b) throw new Error('görünmüyor'); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const tapL = async loc => { const [x, y] = await center(loc).catch(async e => { throw new Error('dokunulamadı ' + JSON.stringify(await state())) }); if (dev.mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    const tap = (sel, nth = 0) => tapL(page.locator(sel).nth(nth));
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const state = () => page.evaluate(() => { const D = __harf.D, st = D.steps[D.si] || {}; return { k: st.k, l: D.letter, si: D.si, gen: D.gen, ans: D.ans, lock: !!D.lock, done: !document.getElementById('doneOv').hidden, title: document.getElementById('title').textContent } });
    const shots = new Set();
    const shot = async name => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: path.join(OUT, `harf-${tag}-${name}.png`) }); };

    async function drawStroke(pts) {
      const r = await page.evaluate(() => { const b = __trace.box(); return { x: b.left, y: b.top, w: b.width, h: b.height } });
      const P = ([x, y]) => [r.x + x / 100 * r.w, r.y + y / 112 * r.h];
      const [x0, y0] = P(pts[0]); await page.mouse.move(x0, y0); await page.mouse.down();
      for (let i = 1; i < pts.length; i += 2) { const [x, y] = P(pts[i]); await page.mouse.move(x, y); }
      const [x1, y1] = P(pts[pts.length - 1]); await page.mouse.move(x1, y1); await page.mouse.up();
    }

    // plays a lesson or game until doneOv appears; wrongOnce: tries one wrong answer for each step type
    async function playThrough(label, wrongKinds) {
      const t0 = Date.now(); let lastGen = -1, acted = 0;
      while (Date.now() - t0 < 240000) {
        const s = await state();
        if (s.done) return true;
        if (s.k === 'write') {
          await page.locator('#tcv').evaluate(e => e.scrollIntoView({ block: 'center' }));
          if (s.lock) { await sleep(150); continue; }
          const tr = await page.evaluate(() => ({ a: __trace.active, n: __trace.strokes.length, s: __trace.strokes[__trace.active] }));
          if (tr.a >= tr.n) { await sleep(150); continue; }
          if (wrongKinds.has('write')) { wrongKinds.delete('write'); await drawStroke([[10, 20], [30, 25], [50, 30], [70, 35], [90, 40], [92, 60], [80, 100]]); await sleep(200); const a2 = await page.evaluate(() => __trace.active); check(a2 === tr.a, `${tag}: ${label}: yanlış çizgi kabul edildi`); }
          await drawStroke(tr.s); await sleep(120);
          const a3 = await page.evaluate(() => __trace.active);
          if (a3 === tr.a && (await state()).gen === s.gen) { fails.push(`${tag}: ${label}: doğru çizgi kabul edilmedi (${s.l} #${tr.a})`); return false; }
          if (a3 >= tr.n) await shot('yaz-' + (s.l === 'e' ? 'e' : 'x'));
          continue;
        }
        if (s.gen === lastGen) { await sleep(150); continue; }
        await sleep(250);
        const ok = await act(s, label, wrongKinds);
        if (ok) { lastGen = s.gen; acted++; }
        await sleep(200);
      }
      fails.push(`${tag}: ${label}: zaman aşımı ${JSON.stringify(await state())}`); await page.screenshot({ path: path.join(OUT, `harf-${tag}-HATA.png`) }); return false;
    }
    async function act(s, label, wrongKinds) {
      const wrong = wrongKinds.has(s.k); if (wrong) wrongKinds.delete(s.k);
      if (!(await overflow()) === false) fails.push(`${tag}: ${label}: ${s.k} taşıyor`);
      switch (s.k) {
        case 'meet': await shot('1-tanis'); await tap('#go'); return true;
        case 'hunt': {
          await shot('2-av');
          if (wrong) { await tap('.fish[data-ok="0"]'); await sleep(150); }
          const n = await page.locator('.fish[data-ok="1"]').count(); check(n === 5, `${tag}: avda hedef sayısı ${n}`);
          for (let i = 0; i < n; i++) { await tap('.fish[data-ok="1"]:not(.got)'); await sleep(120); }
          return true;
        }
        case 'sound': case 'word': case 'sent': {
          if (await page.locator('.wchip').count()) { // building a sentence
            await shot('7-cumle-kur');
            const words = await page.evaluate(() => __harf.D.words);
            if (wrong && words.length > 1) { await tapL(page.locator('.wchip:not(.used)', { hasText: words[words.length - 1] }).last()); await sleep(150); }
            for (let i = 0; i < words.length; i++) {
              const idx = await page.locator('.wchip').evaluateAll((bs, w) => bs.findIndex(b => !b.classList.contains('used') && b.textContent === w), words[i]);
              await tap('.wchip', idx); await sleep(120);
            }
            return true;
          }
          if (await page.locator('.tiles .tile').count() && s.k === 'word') { // harflerden kelime kur
            await shot('5-kelime-kur');
            const chars = [...s.ans];
            for (const c of chars) { const idx = await page.locator('.tile').evaluateAll((bs, c) => bs.findIndex(b => !b.classList.contains('used') && b.dataset.c === c), c); await tap('.tile', idx); await sleep(100); }
            return true;
          }
          await page.waitForSelector('.choice', { timeout: 5000 });
          await shot({ sound: '3-ses', word: '5-kelime', sent: '6-cumle' }[s.k]);
          const attr = s.k === 'sent' ? 'e' : 'w';
          if (s.k === 'sent' && await page.evaluate(() => document.getElementById('title').textContent) === 'Cümleyi kur') return false;
          const keys = await page.locator('.choice').evaluateAll((b, a) => b.map(x => x.dataset[a]), attr);
          check(keys.filter(k => k === s.ans).length === 1, `${tag}: ${label}: ${s.k} doğru cevap bir kez yok (${s.ans} / ${keys})`);
          if (wrong) { const wi = keys.findIndex(k => k !== s.ans); await tap('.choice', wi); await sleep(150); check(await page.locator('.choice').nth(wi).evaluate(e => e.classList.contains('no')), `${tag}: yanlış işaretlenmedi`); }
          await tap('.choice', keys.indexOf(s.ans));
          if (s.k === 'sent') { await page.waitForFunction(() => document.querySelector('.wchip') || !document.getElementById('doneOv').hidden || __harf.D.steps[__harf.D.si]?.k !== 'sent', null, { timeout: 15000 }).catch(() => fails.push(`${tag}: ${label}: cümle kurma gelmedi`)); }
          return true;
        }
        case 'syll': {
          await shot('4-hece');
          const keys = await page.locator('.balloon').evaluateAll(b => b.map(x => x.dataset.s));
          check(keys.filter(k => k === s.ans).length === 1, `${tag}: hece doğru cevap (${s.ans}/${keys})`);
          if (wrong) { await tap('.balloon', keys.findIndex(k => k !== s.ans)); await sleep(150); }
          await tap('.balloon', keys.indexOf(s.ans)); return true;
        }
        case 'train': {
          await shot('p-tren');
          const keys = await page.locator('.tiles .tile').evaluateAll(b => b.map(x => x.dataset.c));
          check(keys.filter(k => k === s.ans).length === 1, `${tag}: tren doğru cevap (${s.ans}/${keys})`);
          if (wrong) { await tap('.tiles .tile', keys.findIndex(k => k !== s.ans)); await sleep(150); }
          await tap('.tiles .tile', keys.indexOf(s.ans)); return true;
        }
      }
      return false;
    }

    try {
      await page.goto(base + '/harf/'); await sleep(500);
      check((await page.title()) === "İpek'in Harf Adaları", `${tag}: başlık`);
      check(!(await overflow()), `${tag}: ana sayfa taşıyor`);
      await page.screenshot({ path: path.join(OUT, `harf-${tag}-0-ana.png`), fullPage: true });
      // tapping a locked letter must not open a lesson
      await tap('.lt[data-l="l"]'); await sleep(200);
      check(await page.locator('#lesson').isHidden(), `${tag}: kilitli harf açıldı`);
      if (dev.all) await page.evaluate(() => { __harf.S.sound = false });
      for (let i = 0; i < nLetters; i++) {
        const l = await page.evaluate(i => __harf.ORDER[i], i);
        if (i === 0) await tap('.lt.cur'); else { const vis = await page.locator('#doneNext').isVisible(); if (vis) await tap('#doneNext'); }
        await page.waitForFunction(() => !document.getElementById('lesson').hidden, null, { timeout: 5000 });
        const kinds = new Set(i < 6 || i === 28 ? ['hunt', 'sound', 'syll', 'word', 'sent', 'write'] : []);
        const ok = await playThrough('ders ' + l, kinds);
        if (!ok) break;
        const st = await page.evaluate(l => __harf.S.done[l], l);
        check(st >= 1 && st <= 3, `${tag}: ${l} yıldız ${st}`);
        if (l === 'n' || i === nLetters - 1) await shot('8-bitti-' + l);
      }
      if (await page.locator('#doneOv').isVisible()) await tap('#doneMap');
      await sleep(300);
      const learned = await page.evaluate(() => Object.keys(__harf.S.done).length);
      check(learned === nLetters, `${tag}: öğrenilen ${learned}/${nLetters}`);
      await page.screenshot({ path: path.join(OUT, `harf-${tag}-9-harita.png`), fullPage: true });
      // playground
      for (const g of ['hunt', 'train', 'read', 'write']) {
        const ok = await page.evaluate(g => __harf.GAMES.find(x => x.id === g).ok(), g);
        if (!ok) continue;
        await tap(`.game[data-g="${g}"]`); await sleep(300);
        const before = await page.evaluate(() => __harf.S.shells);
        if (await playThrough('oyun ' + g, new Set(['hunt', 'train', 'word']))) {
          const after = await page.evaluate(() => __harf.S.shells);
          check(after > before, `${tag}: oyun ${g} kabuk vermedi`);
          await shot('p-bitti-' + g);
        }
        await tap('#doneMap'); await sleep(300);
      }
      await tap('#albumBtn'); await sleep(200);
      check(await page.locator('.alb.got').count() >= nLetters, `${tag}: albüm eksik`);
      await page.screenshot({ path: path.join(OUT, `harf-${tag}-a-album.png`) });
      await tap('[data-close="albumOv"]');
      if (!dev.all) check(clips.length > 3, `${tag}: kayıtlı ses çalmadı`);
      await page.reload(); await sleep(400);
      check((await page.evaluate(() => Object.keys(__harf.S.done).length)) === nLetters, `${tag}: ilerleme kaydedilmedi`);
    } catch (e) { fails.push(`${tag}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `harf-${tag}-HATA.png`) }).catch(() => { }); }
    check(!errs.length, `${tag}: hatalar: ${errs.join(' | ')}`);
    console.log(`✓ ${tag}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (fails.length) { console.log('\nSORUNLAR:\n- ' + [...new Set(fails)].join('\n- ')); process.exit(1); }
  console.log('\nHarf Adaları testleri geçti.');
})();
