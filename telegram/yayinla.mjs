// OnlineKoçun — Telegram kanalı otomatik yayıncı (Bot API: sendVideo / sendMessage / sendPoll)
// Kullanım: node telegram/yayinla.mjs [--dry-run] [--tarih=YYYY-MM-DD] [--saat=HH:MM]
// Ortam: TG_BOT_TOKEN (Mac'te ~/.config/onlinekocun-tg/env), MEDYA_URL. Kanal: @onlinekocun
// Şu anki TR saatine (±60 dk) en yakın slottaki, gönderilmemiş ve ertelenmemiş öğeyi gönderir; gonderilen.json'a işler.
// Aynı id ikinci kez gönderilmez. tur: video (caption) | metin (link önizlemeli) | anket (anonim).
import fs from 'node:fs';

const ENV_DOSYA = `${process.env.HOME}/.config/onlinekocun-tg/env`;
if (fs.existsSync(ENV_DOSYA)) for (const s of fs.readFileSync(ENV_DOSYA, 'utf8').split('\n')) {
  const m = s.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const arg = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const KANAL_ID = '@onlinekocun';
const MEDYA_URL = (process.env.MEDYA_URL || 'https://onlinekocun-medya.vercel.app').replace(/\/$/, '');
const SITE = 'https://www.onlinekocun.com';
const UTM = '?utm_source=telegram&utm_medium=kanal&utm_campaign=yayin';
const KANAL = 'https://t.me/onlinekocun';
const STATE = process.env.STATE_DOSYA || new URL('./gonderilen.json', import.meta.url).pathname;
const kuyruk = JSON.parse(fs.readFileSync(new URL('./kuyruk.json', import.meta.url), 'utf8'));
const durum = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { gonderilen: [] };
durum.gonderilen ||= [];

const trsimdi = new Date(Date.now() + 3 * 3600e3).toISOString();
const tarih = arg.tarih || trsimdi.slice(0, 10);
const saat = arg.saat || trsimdi.slice(11, 16);
const dk = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const aday = kuyruk
  .filter(k => k.tarih === tarih && Math.abs(dk(k.saat || '20:30') - dk(saat)) <= 60)
  .sort((x, y) => Math.abs(dk(x.saat || '20:30') - dk(saat)) - Math.abs(dk(y.saat || '20:30') - dk(saat)));
const oge = aday[0];
if (!oge) { console.log(`${tarih} ${saat} için slot yok, çıkılıyor.`); process.exit(0); }
if (oge.ertelendi) { console.log(`${oge.id} (${tarih} ${oge.saat}) ertelendi, gönderilmiyor.`); process.exit(0); }
if (durum.gonderilen.some(g => g.id === oge.id)) { console.log(`${oge.id} (${tarih} ${oge.saat}) zaten gönderildi, çıkılıyor.`); process.exit(0); }

const link = SITE + (oge.link_yol || '/') + UTM;
const metin = (oge.metin || '').replaceAll('{LINK}', link).replaceAll('{KANAL}', KANAL);
const tur = oge.tur || 'video';
let yontem, govde, ozet;
if (tur === 'video') {
  if (metin.length > 1024) { console.error(`caption ${metin.length} karakter, Telegram sınırı 1024`); process.exit(1); }
  const video = `${MEDYA_URL}/${oge.video}`;
  yontem = 'sendVideo'; govde = { chat_id: KANAL_ID, video, caption: metin, supports_streaming: true };
  ozet = `video: ${video}\ncaption (${metin.length} krk):\n${metin}`;
} else if (tur === 'metin') {
  if (metin.length > 4096) { console.error(`metin ${metin.length} karakter, sınır 4096`); process.exit(1); }
  yontem = 'sendMessage'; govde = { chat_id: KANAL_ID, text: metin, link_preview_options: { is_disabled: false } };
  ozet = `metin (${metin.length} krk, link önizleme açık):\n${metin}`;
} else if (tur === 'anket') {
  const { soru, secenekler } = oge.anket || {};
  if (!soru || soru.length > 300 || !secenekler || secenekler.length < 2 || secenekler.length > 10 || secenekler.some(s => s.length > 100)) { console.error('anket geçersiz (soru ≤300, 2-10 seçenek, her biri ≤100)'); process.exit(1); }
  yontem = 'sendPoll'; govde = { chat_id: KANAL_ID, question: soru, options: secenekler.map(text => ({ text })), is_anonymous: true };
  ozet = `anket: ${soru}\n- ${secenekler.join('\n- ')}`;
} else { console.error(`bilinmeyen tur: ${tur}`); process.exit(1); }

if (arg['dry-run']) {
  console.log(`[dry-run] ${tarih} ${saat} -> ${oge.id} (${oge.saat}, ${tur}, ${yontem}) -> ${KANAL_ID}\n${ozet}`);
  process.exit(0);
}
const token = process.env.TG_BOT_TOKEN;
if (!token) { console.error('TG_BOT_TOKEN yok'); process.exit(1); }

const r = await fetch(`https://api.telegram.org/bot${token}/${yontem}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(govde),
});
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.ok) { console.error(`${yontem} hata: ${r.status} ${String(j.description || '').slice(0, 200)}`); process.exit(1); }
durum.gonderilen.push({ id: oge.id, tarih, saat: oge.saat, mesaj_id: j.result?.message_id });
fs.writeFileSync(STATE, JSON.stringify(durum, null, 1) + '\n');
console.log(`gönderildi: ${oge.id} (${yontem}) mesaj ${j.result?.message_id}`);
