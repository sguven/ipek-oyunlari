// Turkish voice test: every recorded clip listed in a game's audio/manifest.json exists,
// and in Turkish the games speak with the recorded natural voice, not the device voice.
// node ses-test.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const fails = []; const check = (ok, m) => { if (!ok) fails.push(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) manifests: every clip file exists and is a real mp3
const games = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'audio', 'manifest.json')));
for (const g of games) {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, g, 'audio', 'manifest.json'), 'utf8'));
  for (const v of m.voices) for (const [text, id] of Object.entries(m.clips)) {
    const f = path.join(ROOT, g, 'audio', v, id + '.mp3');
    check(fs.existsSync(f) && fs.statSync(f).size > 1500, `${g}: "${text}" kaydı eksik (${v}/${id}.mp3)`);
  }
}
check(games.includes('veteriner'), 'veteriner: audio/manifest.json yok');

// 2) Animal Hospital in Turkish: speech comes from the recordings, the device voice is never used
(async () => {
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  // a fake Turkish device voice, so a missing recording would show up as device speech
  await ctx.addInitScript(() => {
    window.__tts = [];
    const fake = [{ name: 'Yelda', lang: 'tr-TR', default: false, localService: true, voiceURI: 'y' }, { name: 'Samantha', lang: 'en-US', default: true, localService: true, voiceURI: 's' }];
    try { Object.defineProperty(speechSynthesis, 'getVoices', { value: () => fake }); speechSynthesis.speak = () => { }; } catch (e) { }
    const O = window.SpeechSynthesisUtterance;
    window.SpeechSynthesisUtterance = function (t) { window.__tts.push(String(t)); const u = new O(t); return new Proxy(u, { set(o, k, v) { try { o[k] = v; } catch (e) { } return true; }, get(o, k) { const x = o[k]; return typeof x === 'function' ? x.bind(o) : x; } }); };
  });
  const page = await ctx.newPage(); const errs = [], clips = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('request', q => { if (/\/audio\/kadin\/.*\.mp3$/.test(q.url())) clips.push(q.url()); });
  await page.goto(base + '/veteriner/'); await sleep(500);
  await page.click('.lang button[data-lang="tr"]'); await sleep(200);
  await page.click('#helloSpeak'); await sleep(400);
  const ids = await page.evaluate(() => __vet.ANIMALS.map(a => a.id));
  for (const id of ids.slice(0, 2)) {
    await page.evaluate(() => __vet.goHome());
    await page.locator(`.pat[data-id="${id}"]`).click(); await sleep(600);
    await page.click('#speakBtn'); await sleep(400);
  }
  const tts = await page.evaluate(() => window.__tts);
  check(clips.length >= 3, `veteriner: Türkçe kayıtlar çalınmadı (${clips.length} istek)`);
  check(tts.length === 0, `veteriner: Türkçede cihaz sesi kullanıldı: ${JSON.stringify(tts)}`);
  errs.forEach(e => fails.push('veteriner: sayfa hatası: ' + e));
  await browser.close(); srv.close();
  if (fails.length) { console.log('HATALAR:\n' + fails.join('\n')); process.exit(1); }
  console.log(`Sesler: ${games.length} oyunun kayıtları tam, veteriner Türkçede kayıtlı sesle konuşuyor`);
})();
