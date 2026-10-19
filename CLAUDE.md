# CLAUDE.md

Otel kapalı alan navigasyon sistemi (PWA). Bu dosya, yeni bir oturumun projeyi
sıfırdan çözmek zorunda kalmaması için bağlamı ve alınmış kararları tutar.

## Ne yapıyoruz

Misafir, uygulama indirmeden QR/link ile açtığı web sayfasından otel içinde yol bulur:
kat planı üzerinde konumunu görür, hedef seçer (havuz, restoran, resepsiyon…), rota
çizgisi + yön okları + kalan mesafe ile yönlendirilir.

## Komutlar

```bash
npm run dev          # misafir uygulaması (--host açık)
npm run editor       # plan editörü — /editor.html
npm run survey       # saha kaydı (telefon) — /survey.html
npm run build:venue  # survey/*.csv  ->  public/data/venue.json + kat planı SVG'leri
npm run test:route   # rota, konum, doğrulama, CSV ve saha kaydı testleri (67 kontrol)
npm run typecheck
npm run build
```

`build:venue` başka bir tesisin verisini de derleyebilir; `OUT_DIR` verilince kat
planı SVG'leri de oraya yazılır, `public/floors/` ezilmez:
`SURVEY_DIR=survey-x OUT_DIR=public/data/x npm run build:venue`

Sensörler (DeviceMotion/Orientation) ve kamera **yalnızca HTTPS'te** çalışır.
Telefonda test için: `npx cloudflared tunnel --url http://localhost:5173`.

## Mimari

```
QR (?at=KOD) ─┐
manuel seçim ─┼─► PositionEngine ─► snapToGraph ─► PositionFix
adım sayımı  ─┘   (füzyon + geçiş modu)              │
                                                     ▼
                         findRoute (A*) ─► buildSteps ─► computeProgress
                                                     │
                                        MapView (Leaflet) / ArView (kamera)
```

| Dosya | Sorumluluk |
|---|---|
| `src/lib/graph.ts` | Graf kurulumu, A\* rota, yola oturtma |
| `src/lib/directions.ts` | Dönüş talimatları, kalan mesafe, sapma |
| `src/positioning/engine.ts` | Konum füzyonu + asansör/merdiven geçiş modu |
| `src/positioning/sensors.ts` | Adım algılama, pusula, iOS izin akışı |
| `src/components/MapView.tsx` | Leaflet CRS.Simple harita, rota, oklar |
| `scripts/build-venue.ts` | Saha CSV'lerinden venue.json + plan üretimi |
| `src/lib/venueRules.ts` | **Yapısal doğrulama — editör ve derleyicinin ortak kuralları** |
| `src/editor/` | Plan editörü (ayrı giriş: `editor.html`) |
| `src/survey/` | Saha kaydı: yürüyerek harita çıkarma (ayrı giriş: `survey.html`) |

## Alınmış kararlar (tekrar tartışmaya gerek yok)

1. **Beacon kullanılmıyor.** Tarayıcı BLE advertising taraması yapamaz (Web Bluetooth
   yalnızca eşleşmiş cihaza bağlanır, iOS'ta tarama hiç yok). "PWA + beacon" mümkün değil.
   Konumlama: QR çapası + graf üzerine oturtulmuş ölü hesap. Yükseltme sırası:
   QR yoğunluğu → VPS (Immersal/8thWall) → native köprü (beacon/UWB).
2. **2D önce, 3D sonra.** Leaflet + CRS.Simple ile kat planı görseli harita olarak
   kullanılıyor. 3D (react-three-fiber) faz 3.
3. **AR "compass AR".** iOS Safari WebXR desteklemediği için ok zemine sabitlenemez;
   kameranın üstünde pusulaya göre döner. Gerçek düzlem takibi native veya 8thWall ister.
4. **`public/data/venue.json` elle düzenlenmez** — `survey/*.csv`'den üretilir.
   Plan editörü de venue.json değil **CSV üretir**; tek doğruluk kaynağı CSV olarak kalır.
5. **Asansör/merdivende takip durdurulur** (aşağıda).
6. **Doğrulama kuralları tek yerde:** `src/lib/venueRules.ts`. Editör ve derleyici
   aynı modülü çağırır, yoksa editörde temiz görünen veri derlemede patlar.
   Yeni kural eklerken `route-smoke.ts`'e de bir kontrol ekleyin.
7. **Editör ayrı giriş noktasıdır** (`editor.html`). Misafir otel WiFi'ında editör
   kodunu indirmesin diye bilerek ayrıldı — misafir paketine sızdırmayın.

## En kritik davranış: portal geçiş modu

Adım sayımı + pusula asansör ve merdivende fiziksel olarak çöker: kabinin dikey ivmesi
sahte adım üretir, çelik kuyu pusulayı saptırır, ve web'de barometre API'si olmadığı için
kat değişimi tarayıcıdan tespit **edilemez**.

Bu yüzden portala yaklaşınca (`TRANSIT_TRIGGER_METERS`, `src/App.tsx`) geçiş moduna
girilir: konum portal node'una çivilenir, `PositionEngine.onStep()` hiçbir şey yapmaz,
pusula gizlenir, kullanıcıya "hangi kata çıktınız?" sorulur. Çıkışta QR okutulursa
geçiş kendiliğinden biter.

**Bu davranışı bozmayın.** `npm run test:route` içindeki `phantom steps ignored in
elevator` testi bunu korur: kabinde 20 sahte adım + sapmış pusula, konum değişmemeli.

Konum belirsizliği her adımda büyür; 12 m'yi aşınca (`LOW_CONFIDENCE_METERS`) haritada
"en yakın QR'ı okutun" uyarısı çıkar — yanlış konum doğruymuş gibi gösterilmez.

## Veri durumu — ÖNEMLİ

`survey/*.csv` şu an **örnek bir tesise** ait (2 kat, 35 node, 15 POI). Gerçek otel
verisiyle değiştirilecek. Müşteri mimari çizim (DWG/CAD) veremiyor; bu yüzden
`scripts/build-venue.ts` iki yol destekliyor:

- **Yol A (önerilen):** yangın tahliye planının fotoğrafı doğrudan harita olarak
  kullanılır. `floors.csv` içinde `imageFile` + `scalePxLength` + `scaleMeters` +
  `coordUnits=px`. Türkiye'de her katta asılı olması yasal zorunluluk, ölçekli çizilir.
- **Yol B:** lazermetre ölçümü, `coordUnits=m`; kat planı çizimi `rooms.csv`'den üretilir.
- **Yol C (saha kaydı, `npm run survey`):** hiç plan yoksa — telefonla yürüyerek.
  Dışarıda GPS, içeride adım sayımı + pusula. Çıktı Yol B biçiminde CSV'dir.

Detaylı saha rehberi: `survey/README.md`.

### Plan editörü iş akışı (`npm run editor`)

Koordinatları görsel düzenleyicide imleç gezdirerek okuma işi buradan kalktı:

1. **Kat ekle** → tahliye planı fotoğrafını yükle
2. **Ölçek** aracı → uzunluğunu bildiğin bir öğenin iki ucuna tıkla, metresini gir
   (standart kapı 0.90 m). Ölçeksiz kat doğrulamada hata verir.
3. **Koridor** aracı → koridor boyunca arka arkaya tıkla; node'ları üretir ve bağlar
4. Kavşakta mevcut node'a tıklamak yeni node açmaz, ona bağlanır
5. Asansör/merdiven node'unu **portal** yap, her katta **aynı portal grubunu** ver
6. QR asılacak node'lara kod gir — panel `?at=KOD` adresini gösterir
7. Sağ panelde **hata sayısı sıfırlanana** kadar düzelt
8. **survey/\*.csv indir** → dosyaları `survey/` altına, plan görsellerini
   `public/floors/` altına koy → `npm run build:venue`

Proje tarayıcıda (IndexedDB) saklanır, sunucuya hiçbir şey gitmez. Editörde henüz
kimlik doğrulama **yok** — üretimde `editor.html` dağıtıma dahil edilmemeli veya
kapatılmalı (Faz 2'nin kalan işi). Aynısı `survey.html` için de geçerli.

### Saha kaydı iş akışı (`npm run survey`) — plan hiç yoksa

Telefonda HTTPS üzerinden açılır (`npx cloudflared tunnel --url http://localhost:5173`).

1. **Açık alanda** başlat — ilk GPS sabiti tüm haritanın kökeni olur
2. Kat ekle → dış alanda **Dış (GPS)** modunda gez, havuz/plaj/barları işaretle
3. Binaya girince **İç (adım)** moduna geç: konum artık adım+pusuladan hesaplanır
4. Koridorda **İz kaydet** ile yürü — 8 m'de bir yol noktası bırakır ve bağlar
5. Asansörü işaretle, **her katta aynı grup adını ver**. İkinci kez işaretlediğinde
   konum oraya çivilenir ve biriken adım hatası sıfırlanır — katlar böyle hizalanır.
6. **CSV indir** → `survey/` altına koy → `npm run build:venue`

**Doğruluk gerçeği:** GPS dışarıda 3–10 m, içeride 15–50 m (bu yüzden içeride
kullanılmaz). Ölü hesap kısa mesafede iyidir ama alınan yolun ~%8'i kadar
sürüklenir; asansör/QR gibi bilinen noktalarda yeniden çivilemek şart.

Bu yolla üretilen katlarda gerçek çizim olmadığı için `venue.json`'a
`schematic: true` yazılır ve harita **koridor ağını kendisi çizer** — aksi halde
misafir boş bir zeminde tek bir çizgi görürdü.

360° kamera tek başına yetmez (metrik geometri vermez) — POI doğrulama ve ileride VPS
için değerli, Yol A/B ile birlikte kullanılır.

Derleyici saha hatalarını yakalar: kat dışına düşen koordinat, bağlantısız node, kırık
referans, ve **portalın katlar arası kayması** (katların köken köşesi hizasız demektir —
sahada en sık yapılan hata).

## Müşteriden beklenen bilgiler

1. Kat planı fotoğrafları + her katta bilinen bir referans uzunluk
2. Kaç kat / kaç bina, dış alan (bahçe, plaj) geçişi var mı
3. POI listesi ve dilleri (şu an tr/en/de/ru)
4. QR asılabilecek nokta sayısı (hedef: 20–30 m'de bir; asansör/merdivenlerin **her iki ucu zorunlu**)
5. `northOffsetDeg` — planın "yukarı" yönünün gerçek kuzeyden sapması

## Yol haritası

- **Faz 1 (tamam):** 2D harita, A\* rota, QR konumlama, geçiş modu, çok dil, PWA, compass AR
- **Faz 2:**
  - *(tamam)* plan editörü — görsel yükleme, iki noktalı ölçek, node/kenar/POI çizimi,
    canlı doğrulama, `survey/*.csv` dışa aktarma
  - *(tamam)* saha kaydı — telefonla yürüyerek harita çıkarma (plan bulunamadığında)
  - *(sırada)* QR sticker üretimi (kod + baskıya hazır PDF), asıldığı yerin fotoğrafı
  - *(sırada)* PostgreSQL+PostGIS, multi-tenant, editöre kimlik doğrulama
- **Faz 3:** 3D görünüm, sesli yönlendirme, analitik
- **Faz 4:** doğruluk yetmezse VPS veya native köprü

## Konvansiyonlar

- Yorumlar ve kullanıcıya görünen metinler Türkçe; kod tanımlayıcıları İngilizce.
- Yeni çeviri anahtarı eklerken **dört dili birden** doldurun (`src/i18n/translations.ts`).
- Yeni konum kaynağı eklemek = `src/positioning/types.ts` içindeki `PositionProvider`
  arayüzünü implemente edip `PositionEngine.applyFix()` çağırmak.
- Davranış değiştiren her düzeltmeye `scripts/route-smoke.ts` içine bir kontrol ekleyin.
