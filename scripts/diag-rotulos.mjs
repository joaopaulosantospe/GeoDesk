// Conferência visual do diálogo "Rótulos" (menu da camada), com os painéis expandidos.
import { _electron as electron } from 'playwright-core';

const NOME_PONTOS = 'Pontos de monitoramento (sintéticos)';

const app = await electron.launch({
  executablePath: 'D:/geodesk/node_modules/electron/dist/electron.exe',
  args: ['.'],
  cwd: 'D:/geodesk',
  timeout: 60000,
});
const page = await app.firstWindow();
const layerByName = (name) =>
  page.locator('.layer-item').filter({ has: page.locator(`.layer-name:text-is("${name}")`) });

await page.waitForSelector('.app-shell', { timeout: 25000 });
await page.click('button:has-text("Amostras")');
await page.click(`button:has-text("${NOME_PONTOS}")`);
await layerByName(NOME_PONTOS).waitFor({ timeout: 30000 });

// Grade para a camada ter rótulos configuráveis
await page.click('.tab:has-text("Análise")');
await page.click('button:has-text("Quadícula")');
await page.fill('#analysis-grid-width', '50000');
await page.fill('#analysis-grid-height', '50000');
await page.fill('#analysis-grid-output', 'GradeRotulosUI');
await page.click('button:has-text("Criar feições de índice da grade")');
await page.waitForSelector('.layer-item:has-text("GradeRotulosUI")', { timeout: 25000 });

// Menu da camada > Rótulos…
const grid = layerByName('GradeRotulosUI');
await grid.click({ button: 'right' });
await page.waitForSelector('.ctx-menu', { timeout: 5000 });
const temItem = (await page.locator('.ctx-menu').textContent())?.includes('Rótulos') ?? false;
await page.click('.ctx-item:has-text("Rótulos")');
await page.waitForSelector('#lbl-field', { timeout: 5000 });

// Abre os dois painéis expansíveis
await page.click('.lbl-modal .btn:text-is("Símbolo…")');
await page.click('.lbl-modal .btn:text-is("Estilos do Rótulo…")');
await page.waitForTimeout(250);
const painel = await page.locator('.lbl-modal').boundingBox();
await page.screenshot({
  path: 'D:/geodesk/screenshots/23-dialogo-rotulos-expandido.png',
  clip: { x: painel.x - 6, y: painel.y - 6, width: painel.width + 12, height: painel.height + 12 },
});

// Aplica o preset "Destaque" e confirma com OK
await page.click('.lbl-preset:has-text("Destaque")');
const fonte = await page.locator('#lbl-font').inputValue();
const tamanho = await page.locator('#lbl-size').inputValue();
await page.click('.lbl-modal .btn:text-is("OK")');
await page.waitForSelector('#lbl-field', { state: 'detached', timeout: 5000 });
// Reabre: a configuração persistiu?
await grid.click({ button: 'right' });
await page.click('.ctx-item:has-text("Rótulos")');
await page.waitForSelector('#lbl-field');
const fonte2 = await page.locator('#lbl-font').inputValue();
const tamanho2 = await page.locator('#lbl-size').inputValue();
console.log(
  `temItem=${temItem} preset Destaque -> fonte=${fonte} tam=${tamanho}; persistiu: fonte=${fonte2} tam=${tamanho2}`,
);

await app.close();
process.exit(0);
