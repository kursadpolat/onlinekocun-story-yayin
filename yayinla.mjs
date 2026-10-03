// OnlineKoçun — günlük story yayıncısı (Instagram Graph API, resmi Content Publishing)
// Kullanım:
//   node yayinla.mjs --slot=0|1|2       → o günün o saatindeki story setini paylaşır
//   node yayinla.mjs --slot=1 --kuru    → hiçbir şey göndermeden ne paylaşılacağını yazar
//   node yayinla.mjs --id=vs13          → belirli bir seti paylaşır (elle)
// Ortam: IG_USER_ID, IG_TOKEN, MEDYA_URL (ör. https://onlinekocun-medya.vercel.app)
//        BASLANGIC (YYYY-MM-DD, kuyruğun ilk günü), GRAPH (varsayılan graph.instagram.com)
// Durumsuz: hangi setin paylaşılacağı tarihten hesaplanır → (gün farkı × SLOT_SAYISI + slot) mod kuyruk.
import fs from 'node:fs';

// Gizli ayarlar ~/.config/onlinekocun-ig/env dosyasında (KEY=değer satırları, chmod 600)
const ENV_DOSYA = `${process.env.HOME}/.config/onlinekocun-ig/env`;
if (fs.existsSync(ENV_DOSYA)) for (const s of fs.readFileSync(ENV_DOSYA, 'utf8').split('\n')) {
  const m = s.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const arg = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SLOT_SAYISI = 3;
const kuyruk = JSON.parse(fs.readFileSync(new URL('./kuyruk.json', import.meta.url), 'utf8'));
const { IG_USER_ID, IG_TOKEN, MEDYA_URL, BASLANGIC = '2026-10-04' } = process.env;
const GRAPH = (process.env.GRAPH || 'https://graph.instagram.com') + '/v23.0';

function bugunTR() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }
function setSec() {
  if (arg.id) return kuyruk.find(s => s.id === arg.id) || (() => { throw new Error('set yok: ' + arg.id); })();
  const gun = Math.round((Date.parse(arg.tarih || bugunTR()) - Date.parse(BASLANGIC)) / 864e5);
  if (gun < 0) return null;
  const i = gun * SLOT_SAYISI + Number(arg.slot || 0) - Number(process.env.KAYMA || 0);
  if (i < 0) return null;
  if (i >= kuyruk.length) { console.log('Kuyruk bitti, paylaşılacak set kalmadı.'); process.exit(0); }
  return kuyruk[i];
}

async function api(yol, params, method = 'POST') {
  const u = new URL(`${GRAPH}/${yol}`);
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_TOKEN });
  const r = method === 'GET' ? await fetch(u + '?' + body) : await fetch(u, { method, body });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`${yol}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}
const bekle = ms => new Promise(r => setTimeout(r, ms));

async function kareGonder(url) {
  const { id } = await api(`${IG_USER_ID}/media`, { image_url: url, media_type: 'STORIES' });
  for (let n = 0; n < 20; n++) {
    const { status_code } = await api(id, { fields: 'status_code' }, 'GET');
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`konteyner ${status_code}: ${url}`);
    await bekle(3000);
  }
  const p = await api(`${IG_USER_ID}/media_publish`, { creation_id: id });
  return p.id;
}

const set = setSec();
if (!set) { console.log('Başlangıç tarihi gelmedi, atlandı.'); process.exit(0); }
const urller = set.kare.map(k => `${(MEDYA_URL || '').replace(/\/$/, '')}/${k}`);
console.log(`${arg.tarih || bugunTR()} slot ${arg.slot ?? '-'} → ${set.id} "${set.baslik}" (${urller.length} kare)`);
if (arg.kuru) { urller.forEach(u => console.log('  ' + u)); process.exit(0); }
if (!IG_USER_ID || !IG_TOKEN || !MEDYA_URL) { console.error('IG_USER_ID / IG_TOKEN / MEDYA_URL eksik'); process.exit(1); }
// Uzun ömürlü token 60 gün yaşar. Bulutta: TOKEN_YENILE=1 ise yenile, yeni token'ı YENI_TOKEN_DOSYA'ya yaz
// (workflow onu şifreleyip repoya geri koyar). Mac'te: env dosyası 7 günden eskiyse yenile.
const yas = fs.existsSync(ENV_DOSYA) ? (Date.now() - fs.statSync(ENV_DOSYA).mtimeMs) / 864e5 : 0;
if ((process.env.TOKEN_YENILE === '1' || yas > 7) && GRAPH.includes('graph.instagram.com')) {
  try {
    const r = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${IG_TOKEN}`)).json();
    if (r.access_token) {
      if (process.env.YENI_TOKEN_DOSYA) fs.writeFileSync(process.env.YENI_TOKEN_DOSYA, r.access_token, { mode: 0o600 });
      else fs.writeFileSync(ENV_DOSYA, fs.readFileSync(ENV_DOSYA, 'utf8').replace(/^IG_TOKEN=.*$/m, `IG_TOKEN=${r.access_token}`), { mode: 0o600 });
      process.env.IG_TOKEN = r.access_token; console.log('  token yenilendi');
    }
  } catch (e) { console.log('  token yenilenemedi: ' + e.message); }
}
for (const u of urller) {
  const id = await kareGonder(u);
  console.log(`  ✓ ${u.split('/').slice(-2).join('/')} → ${id}`);
  await bekle(4000); // kareler sırayla görünsün
}
