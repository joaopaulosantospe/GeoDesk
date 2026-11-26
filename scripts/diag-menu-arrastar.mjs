// Diagnóstico: (1) menu da camada não pode ser cortado quando a camada fica
// na base do painel; (2) a camada deve poder ser reordenada arrastando com o mouse.
import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Encerra instâncias órfãs do diagnóstico anterior (a trava de instância única
// do Electron faria o novo lançamento sair imediatamente).
try {
  execSync(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'Name=''electron.exe''' | Where-Object { $_.CommandLine -like '*geodesk-e2e-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
    { stdio: 'ignore' },
  );
} catch {
  /* nenhuma instância para encerrar */
}

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) fails++;
};

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
  // Perfil separado: o GeoDesk em execução segura a trava de instância única.
  args: ['.', `--user-data-dir=${path.join(tmpdir(), 'geodesk-e2e-profile')}`],
  cwd: 'D:/geodesk',
  timeout: 60000,
});

const page = await (async () => {
  // A primeira janela é a splash (electron/main.cjs); esperamos a principal.
  for (let i = 0; i < 120; i++) {
    const main = app.windows().find((w) => !w.url().includes('splash.html'));
    if (main) return main;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('janela principal não abriu');
})();
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.waitForSelector('.app-shell', { timeout: 25000 });
await page.waitForTimeout(800);

async function loadSample(label) {
  const quick = page.locator(`button.layer-sample-quick-card:has-text("${label}")`);
  if ((await quick.count()) > 0) {
    await quick.click();
    return;
  }
  await page.click('button.toolbar-btn[title="Carregar Dados de Amostra"]');
  await page.click(`.modal button.menu-item:has-text("${label}")`);
}

await loadSample('Brasil — Estados');
await page.waitForSelector('.layer-item:has-text("Brasil")', { timeout: 30000 });
await loadSample('Países (mundo)');
await page.waitForSelector('.layer-item:has-text("Países")', { timeout: 30000 });
await loadSample('Pontos de monitoramento (sintéticos)');
await page.waitForSelector('.layer-item:has-text("Pontos")', { timeout: 30000 });
await page.waitForTimeout(600);

// Janela no tamanho mínimo: a camada de baixo fica rente à base do painel,
// que era exatamente o caso em que o menu era cortado.
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (win.isMaximized()) win.unmaximize();
  win.setSize(1080, 640);
});
await page.waitForTimeout(600);

const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
const items = page.locator('.layer-item');
const count = await items.count();
console.log(`camadas: ${count} · viewport: ${vp.w}x${vp.h}`);

const names = () => page.$$eval('.layer-item .layer-name', (els) => els.map((e) => e.textContent.trim()));

async function assertMenuIntact(label) {
  await page.waitForSelector('.ctx-menu', { timeout: 5000 });
  const box = await page.locator('.ctx-menu').boundingBox();
  check(
    `${label}: menu inteiro dentro da janela`,
    !!box && box.y >= 0 && box.y + box.height <= vp.h + 0.5 && box.x + box.width <= vp.w + 0.5,
    JSON.stringify({ box, vp }),
  );

  const ctx = page.locator('.ctx-item');
  const ctxCount = await ctx.count();
  let detail = '';
  let allVisible = true;
  for (let i = 0; i < ctxCount; i++) {
    const b = await ctx.nth(i).boundingBox();
    if (!b || b.y < 0 || b.y + b.height > vp.h + 0.5) {
      allVisible = false;
      detail = `item ${i} cortado: ${JSON.stringify(b)}`;
      break;
    }
  }
  check(`${label}: todas as ${ctxCount} opções visíveis`, allVisible, detail || `${ctxCount} opções`);
}

// ── 1) Menu pelo botão "⋮" da camada de baixo ──────────────────────────
const last = items.nth(count - 1);
await last.scrollIntoViewIfNeeded();
await last.locator('button[title="Mais opções da camada"]').click();
await assertMenuIntact('botão ⋮ (camada de baixo)');
await page.screenshot({ path: `${SHOTS}/diag-menu-por-baixo.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 2) Menu pelo clique direito na camada de baixo ─────────────────────
await last.click({ button: 'right' });
await assertMenuIntact('clique direito (camada de baixo)');
await page.screenshot({ path: `${SHOTS}/diag-menu-clique-direito.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 3) Arrastar a camada de baixo para o topo ──────────────────────────
await page.evaluate(() => {
  window.__dragstarts = 0;
  window.__cls = [];
  document.addEventListener('dragstart', () => (window.__dragstarts += 1), true);
  const list = document.querySelector('.layer-list');
  const mo = new MutationObserver(() => {
    for (const el of document.querySelectorAll('.layer-item')) {
      const c = el.className;
      if ((c.includes('dragging') || c.includes('drop-')) && window.__cls[window.__cls.length - 1] !== c) {
        window.__cls.push(c);
      }
    }
  });
  mo.observe(list, { subtree: true, attributes: true, attributeFilter: ['class'] });
});

const antes = await names();
const srcHandle = items.nth(count - 1).locator('.layer-drag-handle');
const tgtItem = items.nth(0);
const srcBox = await srcHandle.boundingBox();
const tgtBox = await tgtItem.boundingBox();

// Tentativa 1: sequência nativa de mouse (mousedown + movimento + mouseup)
await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
await page.mouse.down();
const armed = await page.evaluate(() => document.querySelectorAll('.layer-item[draggable="true"]').length);
await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + 6, { steps: 14 });
await page.waitForTimeout(350);
const dragstartsAposMouse = await page.evaluate(() => window.__dragstarts);
await page.screenshot({ path: `${SHOTS}/diag-arrastando.png` });
await page.mouse.up();
await page.waitForTimeout(400);

// Tentativa 2: se o gesto bruto de mouse não iniciou o arrasto nativo,
// usa a API de arrasto do Playwright.
if (dragstartsAposMouse === 0) {
  console.log('gesto de mouse não iniciou arrasto nativo; tentando locator.dragTo()');
  await srcHandle.dragTo(tgtItem, { targetPosition: { x: tgtBox.width / 2, y: 6 } });
  await page.waitForTimeout(400);
}

const dragstarts = await page.evaluate(() => window.__dragstarts);
const classes = await page.evaluate(() => window.__cls);
const depois = await names();
const status = (await page.textContent('.status-bar')) ?? '';

check('alça marca a camada como arrastável ao pressionar', armed === 1, `armados=${armed}`);
check('dragstart disparado durante o arrasto', dragstarts > 0, `dragstarts=${dragstarts}`);
check(
  'item arrastado e alvo marcados durante o arrasto',
  classes.some((c) => c.includes('dragging')) && classes.some((c) => c.includes('drop-')),
  JSON.stringify(classes),
);
check(
  'camada foi para o topo da lista',
  depois[0] === antes[antes.length - 1],
  JSON.stringify({ antes, depois }),
);
check('status informa a reposição', status.includes('reposicionada'), status.slice(0, 140));
check('sem erros de página', pageErrors.length === 0, pageErrors.join(' | '));
await page.screenshot({ path: `${SHOTS}/diag-apos-arrasto.png` });

await app.close();
console.log(fails === 0 ? '\nTUDO OK' : `\n${fails} FALHA(S)`);
process.exit(fails === 0 ? 0 : 1);
