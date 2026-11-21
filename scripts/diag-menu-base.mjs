// Verifica o caso relatado: camada na base do painel → menu de contexto
// precisa aparecer inteiro (nenhuma opção cortada na base da janela).
import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Perfil próprio (não conflita com outros diagnósticos em paralelo).
const PROFILE = 'C:/Users/CENEGED/AppData/Local/Temp/opencode/geodesk-menu-base';
try {
  execSync(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'Name=''electron.exe''' | Where-Object { $_.CommandLine -like '*geodesk-menu-base*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
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

// Janela no tamanho MÍNIMO (1080x640): caso real do relato. A janela é
// maximizada ao abrir, então é preciso desmaximizar antes de redimensionar.
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  win.unmaximize();
  win.setSize(1080, 640);
  win.center();
});
await page.waitForTimeout(800);

const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
console.log(`viewport forçado: ${vp.w}x${vp.h}`);
check('janela chegou ao tamanho mínimo', vp.w <= 1080 && vp.h <= 640, JSON.stringify(vp));

const items = page.locator('.layer-item');
const count = await items.count();
console.log(`camadas: ${count}`);

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

// ── 1) Botão "⋮" da camada de baixo ─────────────────────────────────────
const last = items.nth(count - 1);
await last.scrollIntoViewIfNeeded();
await last.locator('button[title="Mais opções da camada"]').click();
await assertMenuIntact('botão ⋮ (camada de baixo)');
await page.screenshot({ path: `${SHOTS}/menu-base-1-botao.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 2) Clique direito na camada de baixo ────────────────────────────────
await last.click({ button: 'right' });
await assertMenuIntact('clique direito (camada de baixo)');
await page.screenshot({ path: `${SHOTS}/menu-base-2-clique-direito.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 3) Camada de cima (regressão: continua abrindo para baixo) ──────────
const first = items.nth(0);
await first.scrollIntoViewIfNeeded();
await first.locator('button[title="Mais opções da camada"]').click();
await assertMenuIntact('botão ⋮ (camada do topo)');
await page.screenshot({ path: `${SHOTS}/menu-base-3-topo.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 4) Menu ainda acessível: clica em uma opção ─────────────────────────
await last.locator('button[title="Mais opções da camada"]').click();
await page.waitForSelector('.ctx-menu');
await page.click('.ctx-item:has-text("Tabela de Atributos")');
await page.waitForTimeout(500);
const rightOpen = await page.locator('.right-panel').count();
check('opção "Tabela de Atributos" responde ao clique', rightOpen > 0, `right-panel=${rightOpen}`);

check('sem erros de página', pageErrors.length === 0, pageErrors.join(' | '));
await app.close();
console.log(fails === 0 ? '\nTUDO OK' : `\n${fails} FALHA(S)`);
process.exit(fails === 0 ? 0 : 1);
