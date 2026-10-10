// Minik Kâşif ve Pırıl'ın Gökkuşağı için otomatik testler.
// Çalıştırma:  cd tests && npm install && npm test
// Her oyun birkaç telefon/tablet/masaüstü boyutunda, dokunmatik olarak oynanır;
// görünüm, ses, ödüller, diller ve hatalar kontrol edilir.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const ARGS = process.argv.slice(2);
const QUICK = ARGS.includes('--quick');
const ONLY = (ARGS.find(a => a.startsWith('--game=')) || '').split('=')[1];

const DEVICES = [
  { name: 'iphone-se', width: 375, height: 667, mobile: true },
  { name: 'iphone-15', width: 393, height: 852, mobile: true, deep: true },
  { name: 'android-kucuk', width: 360, height: 740, mobile: true },
  { name: 'telefon-yatay', width: 844, height: 390, mobile: true },
  { name: 'telefon-yatay-kucuk', width: 667, height: 375, mobile: true },
  { name: 'ipad', width: 820, height: 1180, mobile: true },
  { name: 'masaustu', width: 1280, height: 800, mobile: false },
];

const GAMES = {
  'minik-kasif': {
    title: { tr: 'Minik Kâşif İpek', en: 'Little Explorer Ipek' },
    collection: { open: '#albumBtn', overlay: '#albumOv', close: '[data-close="albumOv"]' },
    stateKey: 'minik-kasif-v1',
  },
  unicorn: {
    title: { tr: "İpek ve Pırıl'ın Gökkuşağı", en: "Ipek & Sparkle's Rainbow" },
    collection: { open: '#wardBtn', overlay: '#wardOv', close: '#wardClose' },
    stateKey: 'piril-rainbow-v1',
  },
};

/* ---------- küçük statik sunucu ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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

/* ---------- sayfaya enjekte edilen ölçüm kodu ---------- */
const PROBE = () => {
  window.__probe = { starts: [], tones: 0, speech: [], audioEls: [] };
  const P = window.__probe;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const s = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      P.starts.push({ state: this.context.state, dur: this.buffer ? +this.buffer.duration.toFixed(2) : 0, t: Date.now() });
      return s.apply(this, a);
    };
    const o = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...a) { P.tones++; P.lastToneState = this.context.state; return o.apply(this, a); };
  }
  const ap = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { P.audioEls.push(this.currentSrc || this.src); return ap.apply(this, arguments); };
  if (window.speechSynthesis) {
    const sp = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { P.speech.push(u.text); try { return sp(u); } catch (e) {} };
  }
};

/* ---------- görünüm kontrolleri (sayfada çalışır) ---------- */
const LAYOUT = () => {
  const W = innerWidth, H = innerHeight, issues = [];
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')) + (el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : '');
  if (document.documentElement.scrollWidth > W + 1) issues.push(`yatay kaydırma var (${document.documentElement.scrollWidth}px > ${W}px)`);
  const all = [...document.querySelectorAll('body *')].filter(el => el.id !== 'fx' && vis(el) && !el.closest('svg'));
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > W + 1.5 || r.left < -1.5) { issues.push(`ekrandan taşıyor: ${name(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`); }
  }
  for (const el of all.filter(e => e.matches('button,[role=button]'))) {
    const r = el.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 36) issues.push(`küçük dokunma alanı: ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const el of all.filter(e => e.matches('h1,h2,h3,button,.tile b,.tile span,p'))) {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') issues.push(`kesilmiş yazı: ${name(el)}`);
  }
  const hdr = document.querySelector('header');
  if (hdr) {
    const kids = [...hdr.children].filter(vis).map(e => e.getBoundingClientRect());
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i], b = kids[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) issues.push('başlıktaki öğeler üst üste biniyor');
    }
  }
  for (const ov of [...document.querySelectorAll('.ov')].filter(vis)) {
    const c = ov.querySelector('.card').getBoundingClientRect();
    if (c.bottom > H + 1 || c.top < -1) issues.push(`pencere ekrana sığmıyor: #${ov.id} (${Math.round(c.top)}..${Math.round(c.bottom)} / ${H})`);
    const btn = [...ov.querySelectorAll('button')].filter(vis).pop();
    if (btn) { const r = btn.getBoundingClientRect(); if (r.bottom > H + 1) issues.push(`pencere düğmesine ulaşılamıyor: #${ov.id}`); }
  }
  const play = document.getElementById('play');
  if (play && !play.hidden) {
    const ch = [...document.querySelectorAll('#choices button')];
    if (!ch.length) issues.push('soru ekranında seçenek yok');
    const last = ch[ch.length - 1];
    if (last) {
      const r = last.getBoundingClientRect();
      if (r.bottom > H * 1.6) issues.push(`seçenekler çok aşağıda (${Math.round(r.bottom)}px / ekran ${H}px)`);
    }
    const prompt = document.getElementById('prompt');
    if (!prompt.textContent.trim()) issues.push('soru metni boş');
  }
  return issues;
};

/* ---------- yardımcılar ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tap(page, dev, sel) {
  const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
  // ödül penceresi geç açıldıysa önce onu kapat (çocuk da önce onu görür)
  if (sel !== '#rewardGo' && await page.locator('#rewardOv').isVisible() && !(await el.evaluate(n => !!n.closest('#rewardOv')).catch(() => false))) {
    await page.locator('#rewardGo').click({ timeout: 5000 }); await page.clock.runFor(600);
  }
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 5000 });
    if (dev.mobile) await el.tap({ timeout: 5000 }); else await el.click({ timeout: 5000 });
  } catch (e) {
    const why = (e.message.match(/(<[^\n]{0,120}intercepts pointer events|not visible|not stable|outside of the viewport|detached)[^\n]*/) || [''])[0];
    throw new Error(`dokunulamadı: ${typeof sel === 'string' ? sel : await el.evaluate(n => n.outerHTML.slice(0, 60)).catch(() => '?')} ${why}`);
  }
}
async function advance(page, ms) { await page.clock.runFor(ms); await sleep(30); }

async function answerRound(page, dev, wrongFirst) {
  const q = await page.evaluate(() => ({ cat: Q.cat, answer: String(Q.answer) }));
  const btns = page.locator('#choices button');
  const n = await btns.count();
  const vals = [];
  for (let i = 0; i < n; i++) vals.push(await btns.nth(i).getAttribute('data-v'));
  const problems = [];
  if (new Set(vals).size !== vals.length) problems.push(`tekrarlanan seçenek (${q.cat}: ${vals})`);
  const ci = vals.indexOf(q.answer);
  if (vals.filter(v => v === q.answer).length !== 1) problems.push(`doğru cevap ${vals.filter(v => v === q.answer).length} kez var (${q.cat})`);
  if (ci < 0) return { problems, cat: q.cat };
  if (q.cat === 'count') { const objs = page.locator('#stage .o'); const k = await objs.count(); for (let i = 0; i < k; i++) await tap(page, dev, objs.nth(i)); }
  if (wrongFirst && n > 1) {
    const wi = ci === 0 ? 1 : 0;
    await tap(page, dev, btns.nth(wi));
    await advance(page, 500);
    const cls = await btns.nth(wi).getAttribute('class');
    if (!/\bno\b/.test(cls)) problems.push('yanlış cevap işaretlenmedi');
  }
  await tap(page, dev, btns.nth(ci));
  const cls = await btns.nth(ci).getAttribute('class');
  if (!/\bok\b/.test(cls)) problems.push('doğru cevap işaretlenmedi');
  await advance(page, 4000);
  return { problems, cat: q.cat };
}

/* ---------- tek oyun + tek cihaz ---------- */
async function runCase(browser, base, gameKey, dev) {
  const G = GAMES[gameKey];
  const res = { game: gameKey, device: dev.name, fails: [], warns: [], notes: [] };
  const fail = m => res.fails.push(m), warn = m => res.warns.push(m);
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.mobile ? 2 : 1,
    isMobile: dev.mobile && dev.width < 1000, hasTouch: dev.mobile, locale: 'tr-TR',
    userAgent: dev.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : undefined,
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [], missing = [], mp3 = [];
  page.on('pageerror', e => errors.push('sayfa hatası: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('konsol: ' + m.text()); });
  page.on('response', r => { const u = r.url(); if (r.status() >= 400 && !u.endsWith('favicon.ico')) missing.push(`${r.status()} ${u.replace(base, '')}`); if (u.endsWith('.mp3')) mp3.push(u.replace(base, '')); });
  await page.addInitScript(PROBE);
  await page.clock.install();
  await page.goto(`${base}/${gameKey}/`, { waitUntil: 'load' });
  await advance(page, 1500);
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const layout = async where => {
    await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 3000))]));
    await advance(page, 50);
    for (const i of await page.evaluate(LAYOUT)) fail(`[${where}] ${i}`);
  };
  const shot = async n => page.screenshot({ path: path.join(OUT, `${gameKey}-${dev.name}-${n}.png`), fullPage: false });

  const title = await page.title();
  if (title !== G.title.tr) fail(`başlık beklenen "${G.title.tr}", gelen "${title}"`);
  const manifest = await page.evaluate(() => typeof CLIPS !== 'undefined' && !!CLIPS.map);
  if (!manifest) fail('ses kayıtları listesi (manifest) yüklenmedi');
  if (!(await page.locator('#voiceSel').isVisible())) fail('Türkçe ses seçimi görünmüyor');
  const homeText = await page.locator('#home').innerText();
  if (!/İpek/.test(homeText)) fail('ana sayfada İpek adı yok');
  await layout('ana sayfa'); await shot('1-ana');

  // ilk dokunuş: ses motoru açılmalı ve soru kayıttan okunmalı
  await tap(page, dev, '.tile[data-mode="mix"]');
  await advance(page, 900); await sleep(400); await advance(page, 300);
  const p1 = await page.evaluate(() => ({ starts: __probe.starts.slice(), speech: __probe.speech.slice(), ctx: typeof AC !== 'undefined' && AC ? AC.state : 'yok' }));
  const played = p1.starts.filter(s => s.dur > 0.2);
  if (!played.length) fail(`ilk soru seslendirilmedi (ses motoru: ${p1.ctx})`);
  else if (played.some(s => s.state !== 'running')) fail(`ses kilitli motorda çalındı, duyulmaz (durum: ${played.map(s => s.state).join(',')})`);
  if (p1.speech.length) fail(`Türkçe cihaz sesine düştü: ${p1.speech[0]}`);
  const greetId = await page.evaluate(() => CLIPS.map && CLIPS.map.clips[L().greet]);
  await sleep(3500); await advance(page, 200);
  if (!greetId || !mp3.some(u => u.includes(greetId))) fail('ilk soruda "Merhaba İpek" karşılaması çalmadı');
  else if ((await page.evaluate(() => __probe.starts.filter(s => s.dur > 0.2).length)) < 2) fail('karşılamadan sonra soru okunmadı');
  await layout('soru ekranı'); await shot('2-soru');

  // oyun turları
  const rounds = QUICK ? 6 : dev.deep ? 45 : 12;
  const cats = {}; let rewards = 0;
  for (let r = 0; r < rounds; r++) {
    if (await page.locator('#rewardOv').isVisible()) {
      rewards++; await layout('ödül penceresi'); if (rewards === 1) await shot('3-odul');
      await tap(page, dev, '#rewardGo'); await advance(page, 600);
    }
    const out = await answerRound(page, dev, r % 3 === 1);
    out.problems.forEach(fail); cats[out.cat] = (cats[out.cat] || 0) + 1;
    if (r % 5 === 4) await layout(`tur ${r + 1}`);
  }
  if (await page.locator('#rewardOv').isVisible()) { rewards++; await tap(page, dev, '#rewardGo'); await advance(page, 600); }
  res.notes.push(`${rounds} tur, kategoriler ${JSON.stringify(cats)}, ödül ${rewards}`);
  const p2 = await page.evaluate(() => ({ n: __probe.starts.length, bad: __probe.starts.filter(s => s.dur > 0.2 && s.state !== 'running').length, speech: __probe.speech.length }));
  if (p2.bad) fail(`${p2.bad} kayıt kilitli ses motorunda çalındı`);
  if (p2.speech) fail(`${p2.speech} cümle cihaz sesine düştü`);
  if (rounds >= 10 && rewards < 1) fail('10+ doğru cevaptan sonra ödül gelmedi');
  const st = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), G.stateKey);
  if ((st.total || 0) !== rounds) fail(`doğru cevap sayacı ${st.total}, beklenen ${rounds}`);

  // geri / koleksiyon / ebeveyn paneli
  await tap(page, dev, '#backBtn'); await advance(page, 300);
  if (!(await page.locator('#home').isVisible())) fail('geri düğmesi ana sayfaya dönmedi');
  await tap(page, dev, G.collection.open); await advance(page, 300);
  await layout('koleksiyon'); await shot('4-koleksiyon');
  await tap(page, dev, G.collection.close); await advance(page, 200);
  await tap(page, dev, '#parentBtn'); await advance(page, 300);
  await layout('ebeveyn paneli'); await shot('5-panel');
  const panel = await page.locator('#stats').innerText();
  if (!new RegExp(String(rounds)).test(panel)) fail('ebeveyn panelinde toplam doğru sayısı yok');
  await tap(page, dev, '[data-close="parentOv"]'); await advance(page, 200);

  // ses seçimi: Erkek
  await tap(page, dev, '#voiceSel [data-voice="erkek"]'); await advance(page, 1500); await sleep(300);
  if (!mp3.some(u => u.includes('/erkek/'))) fail('Erkek seçilince Erkek kaydı çalınmadı');

  // ses kapalı: hiçbir kayıt çalmamalı
  await tap(page, dev, '#soundBtn'); await advance(page, 200);
  const before = await page.evaluate(() => __probe.starts.length);
  await tap(page, dev, '.tile[data-mode="mix"]'); await advance(page, 1500);
  await answerRound(page, dev, false);
  if ((await page.evaluate(() => __probe.starts.length)) !== before) fail('ses kapalıyken ses çaldı');
  await tap(page, dev, '#backBtn'); await advance(page, 200);
  await tap(page, dev, '#soundBtn'); await advance(page, 200);

  // İngilizce
  await tap(page, dev, '#lang-en'); await advance(page, 400);
  if ((await page.title()) !== G.title.en) fail('İngilizceye geçince başlık değişmedi');
  if (await page.locator('#voiceSel').isVisible()) fail('İngilizcede Türkçe ses seçimi görünmemeli');
  const trLeft = await page.evaluate(() => { const t = document.getElementById('home').innerText; return /[ığşİ]/.test(t) ? t.match(/\S*[ığşİ]\S*/)[0] : null; });
  if (trLeft) fail(`İngilizce ekranda Türkçe yazı kaldı: "${trLeft}"`);
  await layout('İngilizce ana sayfa'); await shot('6-en');
  await tap(page, dev, '#lang-tr'); await advance(page, 300);

  // sıfırlama (iki dokunuş)
  await tap(page, dev, '#parentBtn'); await advance(page, 200);
  await tap(page, dev, '#resetBtn'); await advance(page, 100); await tap(page, dev, '#resetBtn'); await advance(page, 200);
  const st2 = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), G.stateKey);
  if ((st2.total || 0) !== 0) fail('sıfırlama ilerlemeyi silmedi');
  if (st2.lang !== 'tr') fail('sıfırlama dil tercihini kaybetti');

  errors.forEach(e => fail(e));
  missing.forEach(m => fail('bulunamayan dosya: ' + m));
  await ctx.close();
  return res;
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  const results = [];
  for (const g of Object.keys(GAMES).filter(g => !ONLY || g === ONLY)) {
    for (const d of DEVICES) {
      try { results.push(await runCase(browser, base, g, d)); }
      catch (e) { results.push({ game: g, device: d.name, fails: ['test çöktü: ' + e.message.split('\n')[0]], warns: [], notes: [] }); }
      const r = results[results.length - 1];
      console.log(`${r.fails.length ? 'HATA' : 'TAMAM'}  ${g} @ ${d.name}  ${r.notes.join(' ')}`);
      [...new Set(r.fails)].forEach(f => console.log('   - ' + f));
    }
  }
  await browser.close(); srv.close();
  const failed = results.filter(r => r.fails.length);
  fs.writeFileSync(path.join(OUT, 'sonuc.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} senaryo geçti. Ekran görüntüleri: tests/out/`);
  process.exit(failed.length ? 1 : 0);
})();
