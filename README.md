# 🌍 GeoDesk — Estação de Trabalho Geoespacial Moderna

[![Versão](https://img.shields.io/badge/versão-1.4.1-blue.svg)](https://github.com/joaopaulosantospe/geodesk-updates/releases)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows%20x64-brightgreen.svg)]()
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![OpenLayers](https://img.shields.io/badge/OpenLayers-10-1F6B75.svg)](https://openlayers.org/)

GeoDesk é uma estação de trabalho SIG desktop moderna, ágil e visualmente refinada desenvolvida para operações cartográficas, análise espacial, importação de dados geográficos e visualização 360°.

---

## ✨ Principais Funcionalidades

- **🗺️ Visualização & Mapas Base:**
  - Google Híbrido, Satélite e Ruas integrados em alta definição.
  - CartoDB Light, Dark e OpenStreetMap.
  - Zoom de alta precisão contínuo até nível 24.

- **🧭 Google Street View 360°:**
  - Marcador interativo Pegman acionado pelo mapa ou atalho `S`.
  - Panoramas 360° embutidos com navegação de vias em tempo real.

- **📍 Simbologia & Marcadores:**
  - 15 formatos geométricos e marcadores cartográficos para camadas de pontos (pinos clássicos, alvos, estrelas, cruzes, etc.).
  - Controle de opacidade em tempo real, cores de preenchimento, espessura e raios.
  - Rótulos inteligentes com máscaras de halo e posicionamento customizável.

- **📂 Suporte Amplo a Formatos:**
  - Shapefile (`.shp`, `.dbf`, `.prj`, `.cpg`) com leitura automática de sidecars.
  - GeoJSON / JSON (`.geojson`, `.json`).
  - GeoPackage (`.gpkg`).
  - Projetos QGIS (`.qgs`, `.qgz`).
  - Projetos GeoDesk (`.geodesk`).

- **📐 Geoprocessamento & Medição:**
  - Medição de distâncias lineares (`D`) e áreas poligonais (`A`).
  - Identificação de feições e atributos com destaque visual (`I`).
  - Geração de zonas de amortecimento (Buffer) com múltiplos passos (`B`).
  - Interseção espacial entre camadas.
  - Tabela de atributos com filtros e ordenação.

- **🔄 Atualizações Automáticas (OTA):**
  - Integração com GitHub Releases e `electron-updater`.
  - Notificação automática e download com barra de progresso.

---

## ⌨️ Atalhos de Teclado

| Tecla | Função |
|---|---|
| `Ctrl + S` | Salvar Projeto |
| `Ctrl + Shift + S` | Salvar Projeto Como |
| `V` | Modo Navegar / Cursor |
| `I` | Identificar Feição |
| `D` | Medir Distância |
| `A` | Medir Área Poligonal |
| `B` | Gerar Buffer |
| `S` | Google Street View 360° |
| `Shift + Scroll` | Zoom de Alta Precisão |
| `Alt + F4` | Fechar o Sistema |
| `Esc` | Cancelar Ferramenta / Fechar Modais |

---

## 🚀 Instalação & Desenvolvimento

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 20 ou superior)
- [npm](https://www.npmjs.com/)

### Passos
```bash
# Instalar dependências
npm install

# Iniciar em modo de desenvolvimento
npm run dev

# Compilar para produção
npm run build

# Executar a aplicação desktop compilada
npm start

# Gerar instalador Windows (.exe)
npm run dist:win

# Publicar nova release no GitHub
npm run release:win
```

---

## 📄 Licença
© CENEGED. Todos os direitos reservados.
