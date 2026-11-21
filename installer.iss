; =====================================================================
; [LEGADO — NÃO USAR EM NOVOS RELEASES]
; Pipeline antigo: electron-packager (package:win) + Inno Setup.
; O empacotamento atual é o electron-builder (ver electron-builder.yml,
; script npm "dist:win"). Este arquivo é mantido apenas como reserva;
; para voltar ao fluxo antigo: npm run build:installer.
;
; Script Inno Setup para GeoDesk
; Gera um instalador (.exe) autocontido para Windows 64-bit.
; Requer Inno Setup 6.3 ou superior (recomendado: versao 7.x).
;
; A versao e injetada pelo build-installer.bat via /DMyAppVersion=...
; (lida do package.json - fonte unica de verdade). Ao compilar
; diretamente no IDE (F9), usa-se o fallback definido abaixo.
;
; Alem de copiar os arquivos, registra as extensoes geoespaciais
; (.shp, .geojson, .gpkg, .qgs, .qgz) para "Abrir com GeoDesk" /
; duplo clique - o app abre o arquivo ao iniciar (src/import/externalFile.ts).
; =====================================================================

#define MyAppName "GeoDesk"
#ifndef MyAppVersion
#define MyAppVersion "1.1.1"
#endif
#define MyAppPublisher "CENEGED"
#define MyAppURL "https://ceneged.com.br"
#define MyAppExeName "GeoDesk.exe"
#define MyAppSourceDir "dist-win\GeoDesk-win32-x64"

[Setup]
; Identificador unico da aplicacao (GUID) - nao alterar entre versoes
AppId={{C8E1925A-7A58-4C82-9D9E-B3A95E7C8120}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Icone do instalador e do desinstalador
SetupIconFile=geodesk.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}
; Destino do instalador gerado
OutputDir=dist-installer
OutputBaseFilename=GeoDesk_Instalador_v{#MyAppVersion}
; Maxima compressao para instalador rapido e leve
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; Aplicacao exclusiva para Windows 64-bit (x64compatible cobre x64 e ARM64)
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "fileassoc"; Description: "Associar arquivos geoespaciais e projetos ao GeoDesk (.geodesk, .shp, .geojson, .gpkg, .qgs, .qgz)"; GroupDescription: "Arquivos associados"; Flags: checkedonce

[Files]
; Copia todos os arquivos do pacote executavel gerado pelo Electron Packager
Source: "{#MyAppSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Copia o icone para a pasta de instalacao
Source: "geodesk.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Menu Iniciar
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\geodesk.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
; Atalho na Area de Trabalho
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\geodesk.ico"; Tasks: desktopicon

[Registry]
; --- Associacoes de extensao ("Abrir com GeoDesk" / duplo clique) ------------
; A tarefa "fileassoc" fica marcada por padrao; HKA resolve para HKCU na
; instalacao sem privilegios e para HKLM quando instalado como administrador.
; ProgId: .geodesk (Projeto GeoDesk)
Root: HKA; Subkey: "Software\Classes\.geodesk"; ValueType: string; ValueName: ""; ValueData: "GeoDesk.Project"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.Project"; ValueType: string; ValueName: ""; ValueData: "Projeto GeoDesk"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\geodesk.ico"; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: fileassoc
; ProgId: .mxd (ArcMap) — NAO registrado de proposito: o .mxd pertence ao ArcMap,
; que mantem o proprio icone e o programa original ao duplo-clique. O GeoDesk
; continua abrindo .mxd pelo seletor de arquivos ou arrastar-e-soltar.
; ProgId: .shp
Root: HKA; Subkey: "Software\Classes\.shp"; ValueType: string; ValueName: ""; ValueData: "GeoDesk.Shapefile"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.Shapefile"; ValueType: string; ValueName: ""; ValueData: "Shapefile (GeoDesk)"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.Shapefile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\geodesk.ico"; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.Shapefile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: fileassoc
; ProgId: .geojson
Root: HKA; Subkey: "Software\Classes\.geojson"; ValueType: string; ValueName: ""; ValueData: "GeoDesk.GeoJSON"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.GeoJSON"; ValueType: string; ValueName: ""; ValueData: "GeoJSON (GeoDesk)"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.GeoJSON\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\geodesk.ico"; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.GeoJSON\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: fileassoc
; ProgId: .gpkg
Root: HKA; Subkey: "Software\Classes\.gpkg"; ValueType: string; ValueName: ""; ValueData: "GeoDesk.GeoPackage"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.GeoPackage"; ValueType: string; ValueName: ""; ValueData: "GeoPackage (GeoDesk)"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.GeoPackage\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\geodesk.ico"; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.GeoPackage\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: fileassoc
; ProgId: .qgs e .qgz (projeto do QGIS)
Root: HKA; Subkey: "Software\Classes\.qgs"; ValueType: string; ValueName: ""; ValueData: "GeoDesk.QGISProject"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\.qgz"; ValueType: string; ValueName: ""; ValueData: "GeoDesk.QGISProject"; Flags: uninsdeletevalue uninsdeletekeyifempty; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.QGISProject"; ValueType: string; ValueName: ""; ValueData: "Projeto do QGIS (GeoDesk)"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.QGISProject\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\geodesk.ico"; Tasks: fileassoc
Root: HKA; Subkey: "Software\Classes\GeoDesk.QGISProject\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: fileassoc

[Run]
; Opcao para executar o GeoDesk ao concluir a instalacao
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
