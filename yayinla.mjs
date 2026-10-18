// OnlineKoçun — Instagram otomatik yayıncı (resmi Graph API / Content Publishing)
// Türler: story (günde 3 set), reel (günde 1), karusel (günde 1). Takvim TAKVIM.md'de.
// Kullanım:
//   node yayinla.mjs --tur=story --slot=0|1|2   → o günün o slotundaki içeriği paylaşır
//   node yayinla.mjs --tur=reel --kuru           → paylaşmadan ne gideceğini yazar
//   node yayinla.mjs --tur=karusel --id=k01      → belirli bir içeriği paylaşır (elle)
//   --tarih=YYYY-MM-DD ile başka bir günü hesaplatabilirsin (test için)
// Ortam: IG_USER_ID, IG_TOKEN, MEDYA_URL.
// DURUMLU (2026-10-18): paylaşılanlar paylasilan.json'da id bazlı tutulur (workflow paylaşım sonrası commit+push eder).
// Sıradaki içerik = kuyrukta paylaşılmamış ilk öğe. Hata olursa öğe yanmaz, sonraki slotta yeniden denenir.
// Aynı (tarih, tür, slot) için zaten kayıt varsa çift paylaşım yapılmaz. Kuyruğa araya içerik eklemek serbest (id bazlı).
//   --deneme → API çağırmadan sırayı ilerletir (STATE_DOSYA ile geçici kopyada simülasyon için)
import fs from 'node:fs';

// Mac'te elle çalıştırırken gizli ayarlar ~/.config/onlinekocun-ig/env dosyasından okunur
const ENV_DOSYA = `${process.env.HOME}/.config/onlinekocun-ig/env`;
if (fs.existsSync(ENV_DOSYA)) for (const s of fs.readFileSync(ENV_DOSYA, 'utf8').split('\n')) {
  const m = s.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const arg = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const TUR = arg.tur || 'story';
const AYAR = {
  story:   { dosya: 'kuyruk.json',         gunluk: 3, baslangic: '2026-10-03', kayma: 1 },
  reel:    { dosya: 'kuyruk-reel.json',    gunluk: 1, baslangic: '2026-10-03', kayma: 0 },
  karusel: { dosya: 'kuyruk-karusel.json', gunluk: 1, baslangic: '2026-10-19', kayma: 0 },
}[TUR];
if (!AYAR) { console.error('bilinmeyen tür: ' + TUR); process.exit(1); }
const STATE = process.env.STATE_DOSYA || new URL('./paylasilan.json', import.meta.url).pathname;
const durum = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
durum[TUR] ||= []; durum.kismi ||= {};
const kaydet = () => fs.writeFileSync(STATE, JSON.stringify(durum, null, 1) + '\n');
const kuyruk = JSON.parse(fs.readFileSync(new URL('./' + AYAR.dosya, import.meta.url), 'utf8'));
const { IG_USER_ID, IG_TOKEN, MEDYA_URL } = process.env;
const GRAPH = 'https://graph.instagram.com/v23.0';

function bugunTR() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }
function icerikSec() {
  if (arg.id) return kuyruk.find(s => s.id === arg.id) || (() => { throw new Error('içerik yok: ' + arg.id); })();
  const tarih = arg.tarih || bugunTR(), slot = Number(arg.slot || 0);
  if (Date.parse(tarih) < Date.parse(AYAR.baslangic)) return null;
  const onceki = durum[TUR].find(k => k.tarih === tarih && k.slot === slot);
  if (onceki) { console.log(`${tarih} ${TUR} slot ${slot} zaten paylaşıldı (${onceki.id}), çıkılıyor.`); process.exit(0); }
  const bitti = new Set(durum[TUR].map(k => k.id));
  const sira = kuyruk.find(s => !bitti.has(s.id));
  if (!sira) { console.log('Kuyruk bitti, paylaşılacak içerik kalmadı.'); process.exit(0); }
  return sira;
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
const url = k => `${(MEDYA_URL || '').replace(/\/$/, '')}/${k}`;

// Konteyner hazır olana kadar bekle (video işleme birkaç dakika sürebilir)
async function hazirBekle(id, sure = 60) {
  for (let n = 0; n < sure; n++) {
    const { status_code } = await api(id, { fields: 'status_code' }, 'GET');
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`konteyner ${status_code}: ${id}`);
    await bekle(5000);
  }
  throw new Error('konteyner zaman aşımı: ' + id);
}
async function yayinla(id) { return (await api(`${IG_USER_ID}/media_publish`, { creation_id: id })).id; }

const PAYLAS = {
  async story(x) {
    const yapilan = durum.kismi[x.id] ||= [];
    for (const k of x.kare) {
      if (yapilan.includes(k)) continue; // önceki yarım denemede paylaşılmış kare
      const { id } = await api(`${IG_USER_ID}/media`, { image_url: url(k), media_type: 'STORIES' });
      await hazirBekle(id, 20);
      console.log(`  ✓ ${k} → ${await yayinla(id)}`);
      yapilan.push(k); kaydet();
      await bekle(4000); // kareler sırayla görünsün
    }
  },
  async reel(x) {
    const p = { media_type: 'REELS', video_url: url(x.video), caption: x.altyazi, share_to_feed: 'true' };
    if (x.kapak) p.cover_url = url(x.kapak);
    const { id } = await api(`${IG_USER_ID}/media`, p);
    await hazirBekle(id, 60);
    console.log(`  ✓ reel → ${await yayinla(id)}`);
  },
  async karusel(x) {
    const cocuk = [];
    for (const k of x.kare.slice(0, 10)) {
      const { id } = await api(`${IG_USER_ID}/media`, { image_url: url(k), is_carousel_item: 'true' });
      cocuk.push(id);
    }
    for (const c of cocuk) await hazirBekle(c, 20);
    const { id } = await api(`${IG_USER_ID}/media`, { media_type: 'CAROUSEL', children: cocuk.join(','), caption: x.altyazi });
    await hazirBekle(id, 20);
    console.log(`  ✓ karusel (${cocuk.length} kare) → ${await yayinla(id)}`);
  },
};

const x = icerikSec();
if (!x) { console.log('Başlangıç tarihi gelmedi, atlandı.'); process.exit(0); }
console.log(`${arg.tarih || bugunTR()} ${TUR} slot ${arg.slot ?? '-'} → ${x.id} "${x.baslik}"`);
if (arg.kuru) { console.log('  ' + JSON.stringify({ kare: x.kare?.length, video: x.video, altyazi: (x.altyazi || '').slice(0, 80) })); process.exit(0); }
if (!IG_USER_ID || !IG_TOKEN || !MEDYA_URL) { console.error('IG_USER_ID / IG_TOKEN / MEDYA_URL eksik'); process.exit(1); }

// Uzun ömürlü token 60 gün yaşar. Bulutta: TOKEN_YENILE=1 ise yenile, yeni token'ı YENI_TOKEN_DOSYA'ya yaz
// (workflow onu şifreleyip repoya geri koyar). Mac'te: env dosyası 7 günden eskiyse yenile.
const yas = fs.existsSync(ENV_DOSYA) ? (Date.now() - fs.statSync(ENV_DOSYA).mtimeMs) / 864e5 : 0;
if (process.env.TOKEN_YENILE === '1' || yas > 7) {
  try {
    const r = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${IG_TOKEN}`)).json();
    if (r.access_token) {
      if (process.env.YENI_TOKEN_DOSYA) fs.writeFileSync(process.env.YENI_TOKEN_DOSYA, r.access_token, { mode: 0o600 });
      else fs.writeFileSync(ENV_DOSYA, fs.readFileSync(ENV_DOSYA, 'utf8').replace(/^IG_TOKEN=.*$/m, `IG_TOKEN=${r.access_token}`), { mode: 0o600 });
      process.env.IG_TOKEN = r.access_token; console.log('  token yenilendi');
    }
  } catch (e) { console.log('  token yenilenemedi: ' + e.message); }
}
if (arg.deneme) console.log('  (deneme: API çağrılmadı)'); else await PAYLAS[TUR](x);
durum[TUR].push({ id: x.id, tarih: arg.tarih || bugunTR(), slot: Number(arg.slot || 0) });
delete durum.kismi[x.id];
kaydet();
