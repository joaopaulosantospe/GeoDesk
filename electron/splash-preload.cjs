const { contextBridge, ipcRenderer } = require('electron');

// Exposto apenas para a janela de splash (public/splash.html).
// Quando a animação termina (ou o usuário clica em "Pular"), o renderer
// avisa o processo main para fechar o splash e revelar a janela principal.
contextBridge.exposeInMainWorld('splashAPI', {
  done: () => ipcRenderer.send('geodesk:splash-done'),
});
