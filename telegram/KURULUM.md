# Telegram kanal hattı: Kürşad'ın yapacakları

1. Telegram'da @BotFather > /newbot ile bot oluştur, verdiği token'ı kopyala.
2. Token'ı Mac'te `~/.config/onlinekocun-tg/env` dosyasına `TG_BOT_TOKEN=...` olarak yaz (başka yere yapıştırma).
3. t.me/onlinekocun kanalı > Yöneticiler > bu botu ekle, "Mesaj gönder" iznini aç.
4. Claude'a "token hazır" de: GitHub secret `TG_BOT_TOKEN` env dosyasından eklenir, medya projesi (Gün 7 videosu `public/t/v27.mp4`) deploy edilir, push yapılır.
5. Test: Actions > "Telegram yayını" > Run workflow (kuru=true). Hat 22 Ekim 20:30 TR'de kendiliğinden başlar; kuyruk 27 Ekim'de biter, devamı `telegram/kuyruk.json`'a eklenir.
