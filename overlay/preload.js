const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronOverlay', {
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send('set-ignore-mouse-events', Boolean(ignore));
  },
  setContentProtection: (enabled) => {
    ipcRenderer.send('set-content-protection', Boolean(enabled));
  },
  onCursorMove: (callback) => {
    ipcRenderer.on('os-cursor-move', (_event, coords) => {
      callback(coords);
    });
  },
  closeOverlay: () => {
    ipcRenderer.send('close-overlay');
  }
});

