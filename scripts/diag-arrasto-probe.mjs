// Diagnóstico focado: por que o arrasto de camadas não inicia?
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';

const PROFILE = 'C:/Users/CENEGED/AppData/Local/Temp/opencode/geodesk-drag-probe';
try {
  execSync(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'Name=''electron.exe''' | Where-Object { $_.CommandLine -like '*geodesk-drag-probe*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
    { stdio: 'ignore' },
  );
} catch {
  /* sem instâncias */
}

const pageErrors = [];
let app = null;
process.on('uncaughtException', async (err) => {
  console.error(err);
  if (app) {
    try {
      await app.close();
    } catch {
      /* ignora */
    }
  }
  process.exit(1);
});

app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.', `--user-data-dir=${PROFILE}`],
  cwd: 'D:/geodesk',
  timeout: 60000,
});

const page = await (async () => {
  for (let i = 0; i < 120; i++) {
    const main = app.windows().find((w) => !w.url().includes('splash.html'));
    if (main) return main;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('janela principal não abriu');
})();
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console.error:', m.text());
});

await page.waitForSelector('.app-shell', { timeout: 25000 });
await page.waitForTimeout(800);

// Duas amostras rápidas via cards de onboarding
for (const label of ['Brasil — Estados', 'Países do Mundo']) {
  const quick = page.locator(`button.layer-sample-quick-card:has-text("${label}")`);
  if ((await quick.count()) > 0) await quick.click();
  await page.waitForTimeout(1500);
}
await page.waitForSelector('.layer-item', { timeout: 30000 });
await page.waitForTimeout(600);

const items = page.locator('.layer-item');
const count = await items.count();
console.log(`camadas: ${count}`);

// Instrumentação: conta eventos de arrasto no documento
await page.evaluate(() => {
  window.__ev = { dragstart: 0, drag: 0, dragend: 0, drop: 0, mousedown: 0 };
  for (const t of ['dragstart', 'drag', 'dragend', 'drop']) {
    document.addEventListener(t, () => (window.__ev[t] += 1), true);
  }
  document.addEventListener('mousedown', () => (window.__ev.mousedown += 1), true);
});

const last = items.nth(count - 1);
await last.scrollIntoViewIfNeeded();

// Estado ANTES de pressionar a alça
const before = await page.evaluate(() => {
  const handle = document.querySelectorAll('.layer-drag-handle')[
    document.querySelectorAll('.layer-drag-handle').length - 1
  ];
  const item = handle.closest('.layer-item');
  return {
    handleFound: !!handle,
    itemDraggable: item?.getAttribute('draggable'),
    handleRect: handle ? JSON.parse(JSON.stringify(handle.getBoundingClientRect())) : null,
  };
});
console.log('antes do mousedown:', JSON.stringify(before));

const handleBox = await last.locator('.layer-drag-handle').boundingBox();
console.log('handleBox:', JSON.stringify(handleBox));

await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
await page.mouse.down();

// Estado DEPOIS de pressionar (draggable deve estar "true")
await page.waitForTimeout(200);
const during = await page.evaluate(() => {
  const handle = document.querySelectorAll('.layer-drag-handle')[
    document.querySelectorAll('.layer-drag-handle').length - 1
  ];
  const item = handle.closest('.layer-item');
  return {
    itemDraggable: item?.getAttribute('draggable'),
    itemClass: item?.className,
    armedCursor: getComputedStyle(handle).cursor,
  };
});
console.log('depois do mousedown:', JSON.stringify(during));

// Alvo: primeiro item
const tgtBox = await items.nth(0).boundingBox();
await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + 6, { steps: 16 });
await page.waitForTimeout(400);

const mid = await page.evaluate(() => ({
  ev: window.__ev,
  dragging: document.querySelectorAll('.layer-item.dragging').length,
  marked: document.querySelectorAll('.layer-item.drop-above, .layer-item.drop-below').length,
}));
console.log('durante o arrasto:', JSON.stringify(mid));

await page.mouse.up();
await page.waitForTimeout(500);

const after = await page.evaluate(() => ({
  ev: window.__ev,
  order: [...document.querySelectorAll('.layer-item .layer-name')].map((e) => e.textContent.trim()),
  status: document.querySelector('.status-bar')?.textContent ?? '',
}));
console.log('após soltar:', JSON.stringify(after, null, 1));

console.log('pageErrors:', pageErrors.join(' | ') || 'nenhum');
await app.close();
process.exit(0);
