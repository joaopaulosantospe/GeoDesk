# Atualizações do GeoDesk (electron-builder + electron-updater + GitHub)

O GeoDesk verifica atualizações pelo menu **Ajuda > Verificar Atualizações**.

- **App instalado (empacotado):** o `electron-updater` consulta o repositório
  público de releases no GitHub, **baixa a atualização dentro do próprio
  app** (barra de progresso) e, ao clicar em **"Instalar agora e Reiniciar"**,
  executa o instalador NSIS (pt-BR) e relança o aplicativo.
- **Desenvolvimento (`npm run dev`):** cai para o manifesto `version.json`
  (ver `public/version.json`) e abre o link do instalador no navegador.
  A URL pode ser sobrescrita pela variável de ambiente `GEODESK_UPDATE_URL`.
  Teste automatizado: `node scripts/diag-atualizacao.mjs`.

## Canal de atualização (gratuito, GitHub Releases)

| Item | Valor |
| --- | --- |
| Repositório | https://github.com/joaopaulosantospe/geodesk-updates (público) |
| Feed consultado pelo app | `https://github.com/joaopaulosantospe/geodesk-updates/releases/latest` |
| Release atual | https://github.com/joaopaulosantospe/geodesk-updates/releases/tag/v1.3.1 |
| Autenticação do publicador | `gh auth login` (o token é lido em tempo de execução, nunca gravado) |

A cada release o GitHub recebe 3 assets: instalador `.exe`, `.blockmap`
(download diferencial) e `latest.yml` (manifesto lido pelo updater).

> O repositório precisa ser **público**: o app consulta sem token. Repositório
> privado exigiria embutir um token no instalador (não recomendado).

## Componentes

| Arquivo | Papel |
| --- | --- |
| `electron-builder.yml` | Empacotamento (NSIS per-user, associações, publish GitHub) |
| `scripts/release-win.mjs` | Cria a tag, gera o build e publica a release no GitHub (3 assets) |
| `scripts/diag-atualizacao-empacotado.mjs` | Testa o app compilado contra o GitHub real |
| `electron/main.cjs` | IPCs `geodesk:check-update` / `download-update` / `install-update` + eventos de progresso |
| `electron/preload.cjs` | API `window.geodeskUpdate` |
| `src/components/DesktopHeader.tsx` | Menu Ajuda e diálogo de atualização |
| `src/types/update.d.ts` | Tipos da API de atualização |

## Fluxo de release (novo padrão)

1. **Atualize a versão** em `package.json` (fonte única de verdade —
   `x.y.z`, sempre maior que a publicada).
2. **Gere e publique:**
   ```bat
   npm run release:win
   ```
   O script:
   - lê a versão do `package.json`;
   - cria a tag `v<versão>` no repositório (exigência do GitHub para release
     pública; re-execuções da mesma versão pulam esse passo);
   - roda `electron-builder --win --publish never` (só gera os arquivos);
   - publica a release **com `gh release create`, anexando os 3 assets de uma
     vez** (instalador + blockmap + `latest.yml`) e **confirma** que os 3
     estão lá antes de encerrar.

   Saída esperada: `[OK] Release vX.Y.Z publicada com 3 assets: https://github.com/...`

   > Por que não usar o `--publish always` do electron-builder: o publisher
   > dele pode criar dois publishers em paralelo para a mesma tag (corrida),
   > gerando **duas releases** com os assets divididos — o app então falha com
   > `404 .../latest.yml`. Criar a release manualmente elimina o problema
   > (corrigido em 17/11/2026; as duplicadas v1.2.0/v1.3.0 foram removidas).
3. **Confirme** em uma máquina com o app instalado:
   Ajuda > Verificar Atualizações > Baixar Atualização > Instalar agora e Reiniciar.

Para gerar os arquivos **sem** publicar (ex.: testar o instalador localmente):

```bat
npm run dist:win
```

## Testes automatizados

```bat
node scripts/diag-atualizacao.mjs              :: modo dev (version.json) — 5 verificações
node scripts/diag-atualizacao-empacotado.mjs   :: app compilado vs GitHub real — 3 verificações
EXPECT=available node scripts/diag-atualizacao-empacotado.mjs   :: exige release mais nova publicada
node scripts/e2e-instalar-agora.mjs            :: fluxo real no app INSTALADO (baixa + instala)
```

### Teste real executado em 17/11/2026 (máquina com Windows)

Fluxo completo validado na instalação real do Windows (`%LOCALAPPDATA%\Programs\GeoDesk`):

1. Instalação antiga (Inno Setup, v1.1.1) desinstalada com `unins000.exe /SILENT` —
   removeu os arquivos e a entrada de registro sem deixar resíduo.
2. Instalação **v1.2.0 (NSIS)** feita por cima com o instalador do `dist-builder/`
   (mesma pasta, per-user, sem admin) — registro e atalho atualizados.
3. App v1.2.0 → Ajuda > Verificar Atualizações detectou a **v1.3.0** publicada no
   GitHub → **Baixar Atualização** (119 MB, barra de progresso) →
   **Instalar agora e Reiniciar** (`quitAndInstall(false, true)`).
4. O instalador NSIS foi disparado com `--updated` e **concluiu a atualização**
   para **v1.3.0**; o app reaberto confirmou: *"Você já está na versão
   mais recente: v1.3.0"* — e o Painel de Controle mostrava **uma única** entrada
   de desinstalação (NSIS), sem duplicidade do Inno.

Auxiliares usados no teste:

- `scripts/e2e-instalar-agora.mjs` — automatiza o fluxo acima com Playwright.
- `scripts/auto-instalador.ps1` — conclui as páginas do instalador NSIS
  (detecta a janela e envia Enter na página final). Na execução real o
  instalador com `--force-run` concluiu sozinho após a instalação.

> O script `release:win` já **falha se os 3 assets não estiverem** na release.
> Se ainda assim quiser conferir à mão:
> `gh release view v<X.Y.Z> --repo joaopaulosantospe/geodesk-updates`.
> Correção manual de uma release incompleta:
> `gh release upload v<X.Y.Z> <arquivos> --repo joaopaulosantospe/geodesk-updates --clobber`.

## Observações de migração

- **Pipeline legado mantido:** `installer.iss`, `build-installer.bat` e os
  scripts `package:win` / `build:installer` continuam no repo como reserva,
  marcados como LEGADO. O padrão passa a ser `release:win` (ou `dist:win`).
- **Usuários vindos do Inno Setup antigo:** o instalador NSIS usa outro
  identificador (AppId `br.com.ceneged.geodesk`), então após instalar a
  primeira versão do electron-builder podem aparecer **duas entradas de
  desinstalação** no Painel de Controle (a antiga, GUID
  `{C8E1925A-7A58-4C82-9D9E-B3A95E7C8120}`, e a nova). Remova manualmente a
  entrada antiga.
- **Instalação por usuário:** assim como o Inno antigo
  (`PrivilegesRequired=lowest`), tudo vai para `%LOCALAPPDATA%\Programs`
  sem pedir administrador.
- **Sem assinatura de código:** o Windows pode exibir "Aplicativo não
  reconhecido" na primeira execução (SmartScreen) — mesmo comportamento do
  instalador anterior. Para eliminar o aviso seria necessário um certificado
  de assinatura (`win.signtoolOptions` no `electron-builder.yml`).
- **Associações de extensão** (`.geodesk .shp .geojson .gpkg .qgs .qgz`):
  registradas pelo NSIS no registro do usuário (HKCU) e reforçadas em runtime
  por `electron/registerAssoc.cjs` (ícone em `resources/geodesk.ico`).
- **Repositório de releases:** `joaopaulosantospe/geodesk-updates` contém só
  um README + as releases — não publicar código-fonte nele.
