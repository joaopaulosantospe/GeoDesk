/**
 * Seletores atualizados da interface do GeoDesk (DesktopHeader + RightPanel).
 *
 * A UI passou a usar botões de ícone com `title` (sem rótulo visível), o
 * Inspetor Lateral nasce oculto e as abas do painel direito são
 * `.segmented-tab` — os scripts de teste usam estes atalhos para não
 * espalhar seletores desatualizados.
 */

export const SEL = {
  samples: 'button[title="Carregar Dados de Amostra"]',
  basemapMenu: 'button[title="Alternar Mapa Base de Fundo"]',
  openInspector: 'button[title="Exibir Inspetor Lateral"]',
  hideInspector: 'button[title="Ocultar Inspetor Lateral"]',
  identify: 'button[title="Identificar Atributos da Feição (I)"]',
  measureDistance: 'button[title="Medir Distância Linear (D)"]',
  grid: 'button[title="Criar Grade Cartográfica / Quadícula"]',
  buffer: 'button[title="Zona de Amortecimento / Buffer (B)"]',
  intersect: 'button[title="Interseção Espacial de Camadas"]',
  inspector: '.right-panel',
};

/** Garante que o Inspetor Lateral está aberto (ele inicia oculto). */
export async function openInspector(page) {
  if ((await page.locator(SEL.inspector).count()) > 0) return;
  await page.click(SEL.openInspector);
  await page.waitForSelector(SEL.inspector, { timeout: 8000 });
}

/** Abre o Inspetor (se preciso) e ativa uma das abas: Atributos | Análise | Relatório. */
export async function selectTab(page, label) {
  await openInspector(page);
  await page.click(`.segmented-tab:has-text("${label}")`);
}

/** Carrega uma amostra pelo modal "Carregar Dados de Amostra". */
export async function loadSample(page, label) {
  await page.click(SEL.samples);
  await page.click(`.modal .menu-item:has-text("${label}")`);
}

/** Troca o mapa base pelo seletor compacto do cabeçalho. */
export async function setBasemap(page, label) {
  await page.click(SEL.basemapMenu);
  await page.click(`.desktop-menu-popover .menu-item:has-text("${label}")`);
}

/**
 * Garante que o card colapsável está aberto (a preferência fica no
 * localStorage e pode ter sido gravada fechada em execuções anteriores).
 * Ids: buffer | intersect | grid | selection | region-select | measurement | results
 */
export async function ensureCardOpen(page, id) {
  const body = page.locator(`#card-body-${id}`);
  if ((await body.count()) === 0) return;
  if (await body.isHidden()) {
    await page.click(`button[aria-controls="card-body-${id}"]`);
    await body.waitFor({ state: 'visible', timeout: 5000 });
  }
}

/** Clica com o botão direito na camada e escolhe um item do menu de contexto. */
export async function openLayerContextItem(page, layerName, itemText) {
  const item = page
    .locator('.layer-item')
    .filter({ has: page.locator(`.layer-name:text-is("${layerName}")`) });
  await item.click({ button: 'right' });
  await page.waitForSelector('.ctx-menu', { timeout: 5000 });
  await page.click(`.ctx-item:has-text("${itemText}")`);
}

/** Linha de metadados da camada no Gerenciador de Camadas (geometria · tipo · feições). */
export function layerMeta(page, layerName) {
  return page
    .locator('.layer-item')
    .filter({ has: page.locator(`.layer-name:text-is("${layerName}")`) })
    .locator('.layer-sub-tag');
}
