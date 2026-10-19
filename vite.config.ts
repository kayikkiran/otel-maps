import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// package.json "type": "module" olduğu için __dirname yok.
const here = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/** Saha kaydının yazabileceği dosyalar — başka hiçbir ad kabul edilmez. */
const SURVEY_FILES = new Set([
  'venue.csv',
  'floors.csv',
  'nodes.csv',
  'edges.csv',
  'pois.csv',
  'rooms.csv',
  'survey-kayit.json'
]);

/**
 * Telefondaki saha kaydını doğrudan survey/ klasörüne yazar.
 *
 * Mobil tarayıcılar arka arkaya 6 dosya indirmeyi engeller, üstelik dosyaları
 * telefondan bilgisayara taşımak ayrı bir dert. Bunun yerine telefon kaydı
 * geliştirme sunucusuna POST eder, sunucu diske yazar.
 *
 * GÜVENLİK: yalnızca geliştirme sunucusunda çalışır (`apply: 'serve'`), yalnızca
 * yukarıdaki sabit dosya adlarını ve yalnızca survey/ altına yazar — dosya adı
 * beyaz listeden geçmiyorsa atılır, yol gezinmesi mümkün değildir. Yine de
 * tünel açıkken adresi bilen herkes bu uca POST edebilir; taramayı bitirince
 * tüneli kapatın.
 */
function surveyReceiver(): Plugin {
  return {
    name: 'survey-receiver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__survey/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8_000_000) req.destroy();
        });
        req.on('end', () => {
          res.setHeader('content-type', 'application/json');
          try {
            const files = JSON.parse(body) as Record<string, string>;
            const dir = here('./survey');
            mkdirSync(dir, { recursive: true });
            const written: string[] = [];
            for (const [name, content] of Object.entries(files)) {
              if (!SURVEY_FILES.has(name) || typeof content !== 'string') continue;
              writeFileSync(join(dir, name), content, 'utf8');
              written.push(name);
            }
            server.config.logger.info(`saha kaydi alindi: ${written.join(', ')}`);
            res.end(JSON.stringify({ ok: true, written }));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), surveyReceiver()],
  build: {
    rollupOptions: {
      // Üç ayrı giriş: misafir uygulaması, plan editörü, saha kaydı.
      // Araç kodu misafir paketine girmez — otel WiFi'ında indirilen dosya küçük kalsın.
      input: {
        main: here('./index.html'),
        editor: here('./editor.html'),
        survey: here('./survey.html')
      }
    }
  },
  server: {
    // Sensörler (DeviceMotion/Orientation), kamera ve GPS yalnızca güvenli kaynakta çalışır.
    // Telefondan test için HTTPS tüneli şart: npx cloudflared tunnel --url http://localhost:5173
    host: true,
    port: 5173,
    // Vite 6 tanımadığı Host başlığını 403 ile reddeder; tünel alan adları buradan
    // izinlenir. Yalnızca geliştirme sunucusunu ilgilendirir, üretim derlemesine girmez.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt']
  }
});
