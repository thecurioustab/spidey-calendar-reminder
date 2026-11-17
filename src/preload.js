const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spidey', {
  onShow: (cb) => ipcRenderer.on('show-reminder', (_e, ev) => cb(ev)),
  done: (key, reason) => ipcRenderer.send('reminder-done', { key, reason }),
  openUrl: (url) => ipcRenderer.send('open-url', url),
  setInteractive: (on) => ipcRenderer.send('set-interactive', on),
  ready: () => ipcRenderer.send('overlay-ready'),
});
