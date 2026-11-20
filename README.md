# Sis Adası

1–4 kişilik, hikâyeli, ortak oylamalı tarayıcı oyunu. Telefondan oynanır, bağımlılık yoktur.

## Çalıştırma

Node.js 18+ gerekir (paket kurmaya gerek yok):

    node server.js          # http://localhost:3000
    PORT=8080 node server.js

Aynı Wi-Fi'daki telefonlar `http://BILGISAYARIN-IP:3000` adresinden bağlanır.
İnternetten arkadaşlarla oynamak için klasörü Render / Railway / Fly.io gibi bir Node barındırıcıya
yükle (başlatma komutu: `node server.js`, port: `PORT` ortam değişkeni, WebSocket desteği gerekir).

## Nasıl oynanır

- Biri oda kurar, 4 harfli kodu paylaşır. Herkes bir rol alır (Kaptan, Mühendis, Doktor, Gazeteci).
- Her sahnede herkes oy verir; çoğunluk kazanır. Beraberlikte Kaptan'ın oyu, o yoksa kura belirler.
- Bazı seçenekler rol ya da bulunan bir ipucu ister (🔒). Oyuncular düşüp dönerse aynı rolle devam eder.

## Dosyalar

- `story.js`: tüm hikâye (sahneler, seçenekler, sonlar). Yeni sahne eklemek için burayı düzenle.
- `server.js`: HTTP + WebSocket sunucusu, oylama ve oda mantığı (sunucu otoriter).
- `public/index.html`: telefon odaklı arayüz.
- `test.js`: uçtan uca test (`PORT=3111 node server.js &` sonra `PORT=3111 node test.js`).


## İnternetten multiplayer (Render)

Bu proje WebSocket kullanan bir Node.js Web Service olarak çalışır. `render.yaml` hazırdır.

1. Bu klasörü bir GitHub deposuna yükle.
2. Render'da **New → Web Service** seçip GitHub deponu bağla.
3. Render `render.yaml` dosyasındaki ayarları kullanabilir; elle girersen:
   - Build: `npm install`
   - Start: `npm start`
   - Health Check: `/healthz`
4. Deploy tamamlanınca verilen `https://...onrender.com` adresini telefondan aç.
5. Bir oyuncu **Yeni oda kur** der ve çıkan 4 harfli kodu diğer oyuncularla paylaşır.

Not: WebSocket bağlantısı HTTPS üzerinde otomatik olarak `wss://` kullanır. Sunucu tarafındaki oda durumu RAM'de tutulduğu için tek sunucu örneğiyle küçük arkadaş grupları için uygundur; sunucu yeniden başlarsa aktif odalar sıfırlanır.
