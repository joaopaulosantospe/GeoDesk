# 🌍 GeoDesk — Estação de Trabalho Geoespacial Moderna

[![Versão](https://img.shields.io/badge/versão-1.4.1-blue.svg)](https://github.com/joaopaulosantospe/geodesk-updates/releases)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows%20x64-brightgreen.svg)](https://github.com/joaopaulosantospe/geodesk-updates/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![OpenLayers](https://img.shields.io/badge/OpenLayers-10-1F6B75.svg)](https://openlayers.org/)
[![Turf.js](https://img.shields.io/badge/Turf.js-7.2-2ECC71.svg)](https://turfjs.org/)

**GeoDesk** é uma estação de trabalho SIG desktop completa, ágil e visualmente refinada desenvolvida para engenharia, saneamento, energia elétrica, meio ambiente e gestão territorial. Reúne visualização cartográfica de alta performance, geoprocessamento em tempo real, integração imersiva com Google Street View 360° e suporte nativo a múltiplos formatos de dados espaciais.

---

## 📸 Visão Geral dos Recursos

```
┌────────────────────────────────────────────────────────────────────────┐
│  GEODESK — ESTAÇÃO DE TRABALHO GEOESPACIAL                             │
├───────────────┬────────────────────────────────────────┬───────────────┤
│ CAMADAS       │ MAPA PRINCIPAL                         │ INSPETOR      │
│ • Trechos BT  │ • Google Híbrido / Satélite / Ruas     │ • Atributos   │
│ • Postes      │ • Street View 360° interativo (Pegman) │ • Buffer      │
│ • Trafos      │ • 15 Marcadores (pin, estrela, etc.)   │ • Interseção  │
│ • Municípios  │ • Zoom de alta precisão até nível 24   │ • Relatórios  │
└───────────────┴────────────────────────────────────────┴───────────────┘
```

---

## ✨ Funcionalidades Principais

### 🗺️ Cartografia & Mapas Base de Fundo
- **Google Maps Integrado:** Google Híbrido, Google Satélite e Google Ruas em alta definição.
- **Cartografia Aberta:** CartoDB Positron (Light), Dark Matter e OpenStreetMap.
- **Zoom Contínuo sem Travamentos:** Suporte a escala ultra-aproximada até o nível de zoom **24** com reamostragem suave de tiles, eliminando erros de "Map data not yet available".

### 🧭 Google Street View 360° Embutido
- Ativação direta pela barra de ferramentas ou atalho **`S`**.
- Marcador interativo **Pegman** sobre o mapa com coordenadas em tempo real.
- Painel flutuante com controles de rotação 360°, navegação por setas nas vias, maximização e atalho para o Google Maps no navegador.

### 📍 Simbologia Cartográfica & Marcadores de Ponto
- **15 formatos visuais de marcadores:** Pinos clássicos (preenchido, outline, ponto central), alvos (bullseye), círculos, quadrados, losangos, triângulos, estrelas, hexágonos, pentágonos, cruzes e "x".
- **Estilização em tempo real:** Controles deslizantes sem travamento para opacidade de preenchimento, espessura de borda e tamanho do ponto.
- **Rótulos inteligentes (Labels):** Configuração de máscara de contorno (halo), tamanho de fonte e posicionamento customizado ao redor das feições.

### 📐 Geoprocessamento & Análise Espacial
- **Zona de Amortecimento (Buffer):** Gera polígonos de raio e faixas de servidão ao redor de pontos, linhas ou polígonos em metros ou quilômetros.
- **Interseção Espacial ($A \cap B$):** Calcula a sobreposição exata entre duas camadas poligonais, preservando e combinando todos os atributos de ambas as tabelas (tratamento automático de colisões com sufixo `_B`).
- **Seleção por Região Livre (Atalho `P`):** Desenho de polígono dinâmico sobre o mapa para filtragem espacial imediata de pontos, cálculo de área e exportação direta para Excel (.xlsx) e KML.
- **Feições de Índice da Grade:** Geração de quadriculação cartográfica em coordenadas geográficas ou UTM.
- **Medição Precisa:** Ferramentas de medição de distância linear contínua (`D`) e cálculo de área poligonal (`A`) com formatação métrica.

### 📂 Suporte Abrangente a Arquivos & Formatos
- **Shapefiles ESRI:** Leitura automática e sincronizada de arquivos irmãos (`.shp`, `.dbf`, `.prj`, `.cpg`) da mesma pasta.
- **GeoPackage (`.gpkg`):** Suporte completo via banco SQLite/WKB integrado.
- **Projetos QGIS:** Importação direta de projetos salvos em formato `.qgs` e `.qgz` (com descompactação interna de layers e estilos).
- **GeoJSON / JSON:** Carregamento instantâneo via arrastar e soltar (drag & drop) ou diálogo nativo.
- **Projetos GeoDesk (`.geodesk`):** Salvamento e restauração do workspace completo (camadas, visibilidade, estilos, ordem, mapa base e zoom).

### 📊 Tabela de Atributos & Gestão de Dados
- Visualização de feições em tabela tabular paginada e ordenável.
- Busca e filtragem rápida por qualquer coluna de atributo.
- Ligar e Relacionar tabelas externas (Join / Relate via CSV ou Excel).
- Exportação em **Excel (.xlsx)**, **CSV**, **GeoJSON**, **KML/KMZ** e **Relatórios em PDF**.

### 🔄 Atualizações Automáticas (OTA)
- Verificação automática integrada ao **GitHub Releases** via `electron-updater`.
- Diálogo informativo premium com lista de destaques da versão, barra de download em tempo real e reinício automático do aplicativo.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
|---|---|
| `Ctrl + S` | Salvar Projeto atual (`.geodesk`) |
| `Ctrl + Shift + S` | Salvar Projeto Como (novo arquivo) |
| `V` | Modo Navegar / Desativar Ferramenta Atual |
| `I` | Identificar Feição (inspecionar atributos no clique) |
| `D` | Medir Distância Linear |
| `A` | Medir Área Poligonal |
| `B` | Abrir ferramenta de Zona de Amortecimento (Buffer) |
| `S` | Ativar Google Street View 360° |
| `P` | Seleção de Pontos por Região Poligonal |
| `Shift + Scroll` | Zoom de Alta Precisão contínuo |
| `Alt + F4` | Fechar o Sistema e encerrar processos |
| `Esc` | Cancelar ferramenta ativa / Fechar janelas |

---

## 🚀 Instalação & Execução

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 20 ou superior)
- [npm](https://www.npmjs.com/)

### Clonar e Instalar
```bash
# Clonar o repositório
git clone https://github.com/joaopaulosantospe/GeoDesk.git
cd GeoDesk

# Instalar dependências
npm install
```

### Comandos de Desenvolvimento
```bash
# Executar em modo de desenvolvimento (Vite + Electron com hot-reload)
npm run dev

# Checagem estática de tipos (TypeScript)
npm run typecheck

# Compilar o código para produção
npm run build

# Executar a versão desktop compilada
npm start
```

### Empacotamento e Publicação para Windows
```bash
# Gerar instalador Windows (.exe) localmente em dist-builder/
npm run dist:win

# Publicar nova release oficial no GitHub (requer gh CLI autenticado)
npm run release:win
```

---

## 🏗️ Estrutura do Projeto

```
geodesk/
├── electron/                 # Processo principal do Electron
│   ├── main.cjs             # Ponto de entrada, IPC, atualizações e janelas
│   ├── preload.cjs          # Context bridge seguro para o renderer
│   ├── registerAssoc.cjs    # Associações de extensões no Windows
│   └── splash-preload.cjs   # Preload da janela de inicialização (Splash)
├── public/                  # Arquivos estáticos públicos e versão
├── src/                     # Código-fonte do Renderer (React + TypeScript)
│   ├── analysis/            # Módulos de análise (Buffer, Intersect, Street View, etc.)
│   ├── components/          # Componentes visuais da interface (Header, Panels, Modais)
│   ├── export/              # Exportadores (Excel, PDF, KML, GeoJSON, PNG)
│   ├── import/              # Carregadores de dados (SHP, GPKG, QGIS, GeoJSON)
│   ├── map/                 # Instância e controles do OpenLayers (mapContext, basemaps)
│   ├── styles/              # Folhas de estilo globais (CSS Moderno)
│   ├── store.ts             # Gerenciamento de estado global (Zustand)
│   ├── types.ts             # Definições de tipos e interfaces do sistema
│   └── App.tsx              # Componente raiz da aplicação
├── electron-builder.yml     # Configuração de empacotamento NSIS e GitHub Releases
├── package.json             # Dependências e scripts do projeto
└── vite.config.ts           # Configuração do Vite bundler
```

---

## 📄 Licença
© João Paulo Santos. Licenciado para João Paulo Santos. Todos os direitos reservados.
