#!/usr/bin/env node
/**
 * Gera o instalador do GeoDesk e publica a release no GitHub.
 *
 *   npm run release:win
 *
 * O que faz:
 *   1. Lê a versão do package.json (fonte única de verdade).
 *   2. Garante que a tag v<versão> exista no repositório (exigência do
 *      GitHub para release pública).
 *   3. Roda `electron-builder --win --publish never` (só gera os arquivos).
 *   4. Publica a release com `gh release create`, anexando de UMA vez os
 *      3 assets: instalador .exe, .blockmap e latest.yml.
 *
 * Por que não usar o `--publish always` do electron-builder: o publisher
 * dele pode criar DOIS publishers em paralelo para a mesma tag (corrida),
 * gerando duas releases com os assets divididos e o app falhando com
 * "404 .../latest.yml". Criar a release manualmente evita isso.
 *
 * Pré-requisitos:
 *   - `gh auth login` já feito (conta com permissão de escrita no repo)
 *   - Versão incrementada em package.json (a tag da release é v<versão>)
 *
 * Use `npm run dist:win` se quiser só gerar os arquivos sem publicar.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'joaopaulosantospe/geodesk-updates';

function fail(message) {
  console.error(`\n[ERRO] ${message}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  // shell só onde é obrigatório (npx é .cmd no Windows); os comandos `gh`
  // rodam direto para que caracteres especiais nos argumentos (ex.: ">")
  // não sejam interpretados pelo shell.
  const res = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
  if (res.error) fail(`${cmd} ${args.join(' ')}: ${res.error.message}`);
  return res;
}

// 1) Versão atual (fonte única de verdade: package.json).
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+/.test(version)) {
  fail(`Versão inválida em package.json: "${version}"`);
}
const tag = `v${version}`;
console.log(`Versão a publicar: ${tag}`);

// 2) Tag da release: o GitHub exige que uma release PÚBLICA tenha a tag
//    (v<versão>) já existente no repositório — o electron-builder não a cria.
{
  const ref = run('gh', ['api', `repos/${REPO}/git/ref/tags/${tag}`]);
  if (ref.status === 0) {
    console.log(`Tag ${tag} já existe no repositório.`);
  } else {
    const head = run('gh', ['api', `repos/${REPO}/git/ref/heads/main`, '--jq', '.object.sha']);
    const sha = (head.stdout || '').trim();
    if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
      fail(`Não foi possível ler o commit principal do repositório:\n       ${head.stderr || head.stdout}`);
    }
    const created = run('gh', [
      'api', `repos/${REPO}/git/refs`,
      '-f', `ref=refs/tags/${tag}`,
      '-f', `sha=${sha}`,
    ]);
    if (created.status !== 0) {
      fail(`Não foi possível criar a tag ${tag}:\n       ${created.stderr || created.stdout}`);
    }
    console.log(`Tag ${tag} criada no repositório.`);
  }
}

// 3) Build local (sem publicar — a release é criada no passo 4).
console.log(`\n> npx electron-builder --win --publish never\n`);
const build = run('npx', ['electron-builder', '--win', '--publish', 'never'], { stdio: 'inherit', shell: true });
if (build.status !== 0) {
  fail(`electron-builder terminou com código ${build.status}.`);
}

// 4) Arquivos da release.
const installer = path.join(root, 'dist-builder', `GeoDesk_Instalador_v${version}.exe`);
const blockmap = `${installer}.blockmap`;
const manifest = path.join(root, 'dist-builder', 'latest.yml');
const missing = [installer, blockmap, manifest].filter((f) => !existsSync(f));
if (missing.length) {
  fail(`Arquivos do build não encontrados:\n       ${missing.join('\n       ')}`);
}

// 5) Publica (ou atualiza) a release com os 3 assets de uma só vez.
const exists = run('gh', ['release', 'view', tag, '--repo', REPO]);
if (exists.status === 0) {
  console.log(`\nRelease ${tag} já existe — atualizando assets com --clobber...`);
  const up = run('gh', ['release', 'upload', tag, installer, blockmap, manifest, '--repo', REPO, '--clobber'], {
    stdio: 'inherit',
  });
  if (up.status !== 0) fail(`Falha ao enviar os assets: código ${up.status}.`);
} else {
  console.log(`\nCriando release ${tag} com os 3 assets...`);
  const notes = [
    `## Novidades do GeoDesk ${version}:`,
    ``,
    `• Verificação de alterações não salvas: ao fechar o sistema com edições pendentes, exibe diálogo com opções Salvar, Não Salvar e Cancelar`,
    `• Encerramento seguro e definitivo ao confirmar fechamento do sistema`,
    `• Indicador dinâmico de alterações não salvas (*) na barra de título`,
  ].join('\n');
  const create = run(
    'gh',
    ['release', 'create', tag, installer, blockmap, manifest, '--repo', REPO, '--title', `v${version}`, '--notes', notes],
    { stdio: 'inherit' },
  );
  if (create.status !== 0) fail(`Falha ao criar a release: código ${create.status}.`);
}

// 6) Confirmação: os 3 assets precisam estar na release.
const check = run('gh', ['release', 'view', tag, '--repo', REPO, '--json', 'assets', '--jq', '.assets | length']);
const count = parseInt((check.stdout || '').trim(), 10);
if (count !== 3) {
  fail(`A release ${tag} tem ${count} assets (esperado 3: .exe, .blockmap, latest.yml).`);
}

const url = `https://github.com/${REPO}/releases/tag/${tag}`;
console.log(`\n[OK] Release ${tag} publicada com 3 assets: ${url}`);
console.log('Os clientes com versão anterior já enxergam a atualização em');
console.log('Ajuda > Verificar Atualizações.\n');
