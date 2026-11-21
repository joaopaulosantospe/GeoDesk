/**
 * Diagnóstico da splash screen: a versão exibida em ".version-tag" precisa
 * ser a do app (via query string ?v= enviada pelo electron/main.cjs) —
 * nunca uma versão hardcoded no HTML.
 *
 *   node scripts/diag-splash.mjs
 *
 * Pré-condição: `npm run build` (vite build gera dist/splash.html).
 */
import { _electron as electron } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const EXE = process.env.EXE || 'D:/geodesk/dist-builder/win-unpacked/GeoDesk.exe';
const DEV = process.env.DEV === '1'; // true = lança o projeto em dev (electron .)
const SHOTS = 'D:/geodesk/screenshots';
mkdirSync(SHOTS, { recursive: true });

const pkg = JSON.parse(readFileSync('D:/geodesk/package.json', 'utf8'));
const EXPECTED = `v${pkg.version}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

if (!DEV && !existsSync(EXE)) {
  console.error(`[ERRO] App não encontrado: ${EXE}\n       Rode: npm run dist:win (ou DEV=1 para modo dev)`);
  process.exit(1);
}

const app = await electron.launch(
  DEV
    ? { args: ['.'], cwd: 'D:/geodesk', timeout: 60000, env: { ...process.env } }
    : { executablePath: EXE, args: [], timeout: 60000, env: { ...process.env } },
);

// Procura a janela de splash e lê a versão o mais rápido possível
// (a splash fecha sozinha em ~2s).
let splashText = null;
let splashVersion = null;
let shotTaken = false;
const deadline = Date.now() + 30000;
while (Date.now() < deadline && splashVersion === null) {
  for (const page of app.windows()) {
    try {
      const tag = page.locator('#versionTag');
      if ((await tag.count()) > 0) {
        splashText = (await tag.innerText().catch(() => '')).trim();
        const visible = await tag.isVisible().catch(() => false);
        splashVersion = visible ? splashText : '(oculto)';
        if (!shotTaken) {
          await page.screenshot({ path: `${SHOTS}/splash-versao.png` }).catch(() => {});
          shotTaken = true;
        }
        break;
      }
    } catch {
      // janela fechou durante a leitura
    }
  }
  if (splashVersion === null) await new Promise((r) => setTimeout(r, 50));
}

check('Splash screen exibe a versão do app', splashVersion === EXPECTED, `exibido: ${splashVersion} | esperado: ${EXPECTED}`);
check('Screenshot da splash salvo', shotTaken, `${SHOTS}/splash-versao.png`);

try {
  await app.close();
} catch {
  // já fechou
}

console.log('\n───────────────────────────────');
console.log(`${results.filter((r) => r.ok).length}/${results.length} verificações passaram`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
