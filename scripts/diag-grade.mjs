import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.'],
  cwd: 'D:/geodesk',
  timeout: 60000,
});

const page = await app.firstWindow();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('console.error:', msg.text());
});

const dumpCanvases = async (rotulo) => {
  const info = await page.evaluate(() => {
    const list = [...document.querySelectorAll('.ol-viewport canvas')];
    return list.map((canvas, i) => {
      const out = {
        i,
        w: canvas.width,
        h: canvas.height,
        styleZ: canvas.style.zIndex || '',
        dataZ: canvas.dataset.zIndex ?? '',
        size: `${canvas.clientWidth}x${canvas.clientHeight}`,
      };
      try {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const px = (fx, fy) => {
            const d = ctx.getImageData(
              Math.floor(canvas.width * fx),
              Math.floor(canvas.height * fy),
              1,
              1,
            ).data;
            return `${d[0]},${d[1]},${d[2]},${d[3]}`;
          };
          out.center = px(0.5, 0.5);
          out.left = px(0.25, 0.5);
          out.right = px(0.75, 0.5);
        } else {
          out.center = 'sem-ctx2d';
        }
      } catch (e) {
        out.center = `erro: ${e.message}`;
      }
      return out;
    });
  });
  console.log(`\n--- canvases ${rotulo} ---`);
  for (const c of info) console.log(JSON.stringify(c));
};

await page.waitForSelector('.app-shell', { timeout: 25000 });
await page.click('button:has-text("Amostras")');
await page.click('button:has-text("Pontos de monitoramento")');
await page.waitForTimeout(1500);
await dumpCanvases('após amostra');

await page.click('.tab:has-text("Análise")');
await page.click('button:has-text("Quadícula")');
await page.fill('#analysis-grid-output', 'DiagGrade');
await page.click('#analysis-grid-width', { clickCount: 3 });
await page.fill('#analysis-grid-width', '100000');
await page.fill('#analysis-grid-height', '100000');
await page.click('button:has-text("Criar feições de índice da grade")');
try {
  await page.waitForSelector('.layer-item:has-text("DiagGrade")', { timeout: 20000 });
} catch {
  const message = await page.locator('.notice.error').first().textContent().catch(() => null);
  console.log('FALHA AO CRIAR:', message ?? 'sem mensagem');
  await page.screenshot({ path: `${SHOTS}/diag-00-erro.png` });
  await app.close();
  process.exit(1);
}
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/diag-01-criada.png` });
await dumpCanvases('após criar grade');

// Oculta a camada de pontos para isolar a grade
await page
  .locator('.layer-item')
  .filter({ hasText: 'Pontos de mon' })
  .locator('button[title="Ocultar camada"]')
  .click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/diag-02-sem-pontos.png` });
await dumpCanvases('sem camada de pontos');

// Basemap satélite esconde a camada de contexto (estados)
await page.click('.basemap-chip:has-text("Satélite")');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/diag-03-satelite.png` });
await dumpCanvases('satélite');

// Sobe a grade 3 posições (muda o zIndex)
const gridItem = page.locator('.layer-item').filter({ hasText: 'DiagGrade' });
await gridItem.locator('button[title="Subir camada"]').click();
await page.waitForTimeout(600);
await gridItem.locator('button[title="Subir camada"]').click();
await page.waitForTimeout(600);
await gridItem.locator('button[title="Subir camada"]').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/diag-04-grade-suba.png` });
await dumpCanvases('grade subida');

await app.close();
console.log('\nDIAGNÓSTICO CONCLUÍDO');
process.exit(0);
