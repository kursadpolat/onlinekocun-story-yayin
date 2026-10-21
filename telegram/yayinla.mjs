// OnlineKoçun — Telegram kanalı otomatik yayıncı (Bot API sendVideo, URL ile)
// Kullanım: node telegram/yayinla.mjs [--dry-run] [--tarih=YYYY-MM-DD]
// Ortam: TG_BOT_TOKEN (Mac'te ~/.config/onlinekocun-tg/env), MEDYA_URL. Kanal: @onlinekocun
// Bugünün (TR) tarihine eşit, gönderilmemiş öğeyi gönderir; gonderilen.json'a işler. Aynı gün ikinci çalışma tekrar göndermez.
import fs from 'node:fs';

const ENV_DOSYA = `${process.env.HOME}/.config/onlinekocun-tg/env`;
if (fs.existsSync(ENV_DOSYA)) for (const s of fs.readFileSync(ENV_DOSYA, 'utf8').split('\n')) {
  const m = s.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const arg = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const KANAL_ID = '@onlinekocun';
const MEDYA_URL = (process.env.MEDYA_URL || 'https://onlinekocun-medya.vercel.app').replace(/\/$/, '');
const LINK = 'https://www.onlinekocun.com/?utm_source=telegram&utm_medium=kanal&utm_campaign=yayin';
const KANAL = 'https://t.me/onlinekocun';
const STATE = process.env.STATE_DOSYA || new URL('./gonderilen.json', import.meta.url).pathname;
const kuyruk = JSON.parse(fs.readFileSync(new URL('./kuyruk.json', import.meta.url), 'utf8'));
const durum = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { gonderilen: [] };
durum.gonderilen ||= [];

const tarih = arg.tarih || new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const oge = kuyruk.find(k => k.tarih === tarih);
if (!oge) { console.log(`${tarih} için kuyrukta öğe yok, çıkılıyor.`); process.exit(0); }
if (durum.gonderilen.some(g => g.id === oge.id)) { console.log(`${oge.id} (${tarih}) zaten gönderildi, çıkılıyor.`); process.exit(0); }

const caption = oge.metin.replaceAll('{LINK}', LINK).replaceAll('{KANAL}', KANAL);
const video = `${MEDYA_URL}/${oge.video}`;
if (caption.length > 1024) { console.error(`caption ${caption.length} karakter, Telegram sınırı 1024`); process.exit(1); }

if (arg['dry-run']) {
  console.log(`[dry-run] ${tarih} ${oge.id} -> ${KANAL_ID}\nvideo: ${video}\ncaption (${caption.length} krk):\n${caption}`);
  process.exit(0);
}
const token = process.env.TG_BOT_TOKEN;
if (!token) { console.error('TG_BOT_TOKEN yok'); process.exit(1); }

const r = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: KANAL_ID, video, caption, supports_streaming: true }),
});
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.ok) { console.error(`sendVideo hata: ${r.status} ${String(j.description || '').slice(0, 200)}`); process.exit(1); }
durum.gonderilen.push({ id: oge.id, tarih, mesaj_id: j.result?.message_id });
fs.writeFileSync(STATE, JSON.stringify(durum, null, 1) + '\n');
console.log(`gönderildi: ${oge.id} mesaj ${j.result?.message_id}`);
