# hotel-navigator-lonicera

Otel kapalı alan navigasyon sistemi (PWA). Misafir uygulama indirmeden, QR veya
link ile açtığı web sayfasından otel içinde yol bulur: kat planı üzerinde konumunu
görür, hedef seçer (havuz, restoran, resepsiyon…), rota çizgisi + yön okları +
kalan mesafe ile yönlendirilir.

Mimari kararlar, saha rehberi ve yol haritası için **[CLAUDE.md](CLAUDE.md)**'ye bakın —
proje bağlamının tamamı orada tutulur.

## Kurulum

```bash
npm install
npm run build:venue   # survey/*.csv -> public/data/venue.json
npm run dev
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Misafir uygulaması |
| `npm run editor` | Plan editörü — kat planı fotoğrafından harita çizme |
| `npm run survey` | Saha kaydı — telefonla yürüyerek harita çıkarma |
| `npm run build:venue` | Saha CSV'lerinden `venue.json` + kat planı SVG'leri üretir |
| `npm run test:route` | Rota, konum, doğrulama ve CSV testleri (tarayıcısız) |
| `npm run typecheck` | TypeScript denetimi |
| `npm run build` | Üretim derlemesi |

Sensörler (DeviceMotion/DeviceOrientation), kamera ve GPS **yalnızca HTTPS'te**
çalışır. Telefonda test için:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

## Üç giriş noktası

| Sayfa | Kim kullanır |
|---|---|
| `/` | **Misafir** — navigasyon |
| `/editor.html` | **Operatör** — kat planı fotoğrafından harita çizer |
| `/survey.html` | **Operatör** — plan yoksa telefonla yürüyerek harita çıkarır |

Editör ve saha kaydı bilerek ayrı paketlerdir; misafir otel WiFi'ında yalnızca
navigasyon kodunu indirir.

> ⚠️ Editör ve saha kaydı sayfalarında **kimlik doğrulama yoktur.** Üretime
> çıkarken `editor.html` ve `survey.html` dağıtıma dahil edilmemeli veya
> kapatılmalıdır. Aynı şekilde `vite.config.ts` içindeki saha kaydı yazma ucu
> (`/__survey/save`) yalnızca geliştirme sunucusunda çalışır.

## Veriyi nereden alıyoruz

`public/data/venue.json` **elle düzenlenmez** — `survey/*.csv` dosyalarından üretilir.
Tek doğruluk kaynağı CSV'lerdir; plan editörü de venue.json değil CSV üretir.

Kat planı için üç yol desteklenir (ayrıntı: [survey/README.md](survey/README.md)):

- **Yol A** — yangın tahliye planının fotoğrafı doğrudan harita olarak kullanılır
- **Yol B** — lazermetre ölçümü, kat planı çizimi `rooms.csv`'den üretilir
- **Yol C** — hiç plan yoksa: telefonla yürüyerek (`npm run survey`)

Başka bir tesisin verisi de derlenebilir:

```bash
SURVEY_DIR=survey-ornek OUT_DIR=public/data/ornek npm run build:venue
```

## Konumlama nasıl çalışır

Beacon kullanılmaz — tarayıcı BLE advertising taraması yapamaz. Konum **QR çapası +
graf üzerine oturtulmuş ölü hesaptan** gelir:

- QR okutulduğu an konum tam, sonra her adımda ~%8 sürüklenir
- Belirsizlik 12 m'yi aşınca harita "en yakın QR'ı okutun" uyarısı verir
- Asansör/merdivende takip **durdurulur** — kabinin ivmesi sahte adım üretir,
  çelik kuyu pusulayı saptırır, kat değişimi tarayıcıdan tespit edilemez

Pratik doğruluk için QR hedefi: **20–30 metrede bir**, asansör ve merdivenlerin
**her iki ucu zorunlu**.

## Lisans

Özel proje — tüm hakları saklıdır.
