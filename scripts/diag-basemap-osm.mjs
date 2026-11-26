import { _electron as electron } from 'playwright-core';

const app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.'],
  cwd: 'D:/geodesk',
  timeout: 60000,
});
const page = await app.firstWindow();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console.error:', m.text());
});

await page.waitForSelector('.app-shell', { timeout: 25000 });
await page.waitForTimeout(4000);

const info = await page.evaluate(() => {
  const viewport = document.querySelector('.ol-viewport');
  const imgs = [...document.querySelectorAll('.ol-viewport img')];
  return {
    viewport: !!viewport,
    viewportBg: viewport ? viewport.style.backgroundColor : null,
    imgCount: imgs.length,
    srcs: imgs.slice(0, 6).map((i) => i.getAttribute('src')),
    osm: imgs.filter((i) => (i.getAttribute('src') ?? '').includes('openstreetmap')).length,
    google: imgs.filter((i) => (i.getAttribute('src') ?? '').includes('google')).length,
    esri: imgs.filter((i) => (i.getAttribute('src') ?? '').includes('arcgisonline')).length,
    attribution: document.querySelector('.ol-attribution')?.textContent ?? null,
    basemapBtn: [...document.querySelectorAll('.toolbar-btn')].map((b) => b.textContent?.trim()).filter((t) => t && t.length < 30),
    status: document.querySelector('.status-bar')?.textContent ?? null,
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: 'D:/geodesk/screenshots/55-basemap-debug.png' });
await app.close();
process.exit(0);
