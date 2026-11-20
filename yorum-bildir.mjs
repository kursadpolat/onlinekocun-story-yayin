// @onlinekocun son medyalarındaki yeni yorumları Telegram'a bildirir. SALT OKUMA: IG'ye yazma yok.
// Ortam: IG_TOKEN, IG_USER_ID, TG_BOT_TOKEN, TG_CHAT_ID. Bildirilen yorum id'leri yorum-bildirilen.json'da (yalnız id).
// İlk çalıştırma (kayıt dosyası yok): eski yorumları bildirmez, yalnız id'leri kaydeder.
import fs from 'node:fs';
const GRAPH = 'https://graph.instagram.com/v23.0';
const KAYIT = new URL('./yorum-bildirilen.json', import.meta.url).pathname;
const kuru = process.argv.includes('--kuru');
const { IG_TOKEN, IG_USER_ID, TG_BOT_TOKEN, TG_CHAT_ID } = process.env;
if (!IG_TOKEN || !IG_USER_ID) { console.error('IG_TOKEN / IG_USER_ID eksik'); process.exit(1); }
if (!kuru && (!TG_BOT_TOKEN || !TG_CHAT_ID)) { console.error('TG_BOT_TOKEN / TG_CHAT_ID eksik'); process.exit(1); }

async function get(yol, params) {
  const r = await fetch(`${GRAPH}/${yol}?` + new URLSearchParams({ ...params, access_token: IG_TOKEN }));
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`${yol}: ${JSON.stringify(j.error || j).replace(IG_TOKEN, '***').slice(0, 300)}`);
  return j;
}
const ilkCalistirma = !fs.existsSync(KAYIT);
const bildirilen = new Set(ilkCalistirma ? [] : JSON.parse(fs.readFileSync(KAYIT, 'utf8')).idler);
const md = s => String(s ?? '').replace(/([_*`\[])/g, '\\$1');

const medya = (await get(`${IG_USER_ID}/media`, { fields: 'id,caption,permalink,timestamp', limit: '15' })).data || [];
let okunan = 0, yeni = [];
for (const m of medya) {
  let yorumlar;
  try { yorumlar = (await get(`${m.id}/comments`, { fields: 'id,text,username,timestamp', limit: '50' })).data || []; }
  catch (e) { console.error('yorum okunamadı: ' + e.message); if (/permission|OAuth|\(#10\)|code":(10|200|190)/i.test(e.message)) process.exitCode = 2; continue; }
  okunan += yorumlar.length;
  for (const y of yorumlar) if (!bildirilen.has(y.id)) yeni.push({ ...y, link: m.permalink });
}
console.log(`medya ${medya.length}, yorum okundu ${okunan}, yeni ${yeni.length}${ilkCalistirma ? ' (ilk çalıştırma: yalnız kayıt)' : ''}`);

let gonderilen = 0;
if (!ilkCalistirma && !kuru) {
  yeni.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  for (const y of yeni) {
    const metin = `*📸 ONLINEKOÇUN IG*\n@${md(y.username)}\n${md(y.text)}\n${y.link}`;
    const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: metin, parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }) });
    if (!r.ok) { console.error('telegram HTTP ' + r.status); break; }
    bildirilen.add(y.id); gonderilen++;
  }
}
if (!kuru) {
  if (ilkCalistirma) yeni.forEach(y => bildirilen.add(y.id));
  const idler = [...bildirilen].slice(-2000);
  if (ilkCalistirma || gonderilen) fs.writeFileSync(KAYIT, JSON.stringify({ idler }) + '\n');
}
console.log(`bildirilen ${gonderilen}`);
