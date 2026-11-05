const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

// Parse --ws-port argument
const portArg = process.argv.find((arg) => arg.startsWith('--ws-port='));
const wsPort = portArg ? parseInt(portArg.split('=')[1], 10) : 49821;

let overlayWin = null;
let cursorTimer = null;

// Ensure smooth transparent rendering on Windows
app.commandLine.appendSwitch('enable-transparent-visuals');

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  overlayWin = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--ws-port=${wsPort}`]
    }
  });

  // Float above normal windows including maximized VS Code
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // By default, pass clicks through to VS Code underneath while forwarding mouse move events
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  overlayWin.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { wsPort: String(wsPort) }
  });

  // Real-time 60 FPS OS-level mouse tracker via Electron screen.getCursorScreenPoint()
  let lastX = -1;
  let lastY = -1;
  cursorTimer = setInterval(() => {
    if (!overlayWin || overlayWin.isDestroyed()) {
      return;
    }
    try {
      const pt = screen.getCursorScreenPoint();
      const relX = pt.x - x;
      const relY = pt.y - y;
      if (relX !== lastX || relY !== lastY) {
        lastX = relX;
        lastY = relY;
        overlayWin.webContents.send('os-cursor-move', {
          x: relX,
          y: relY,
          screenWidth: width,
          screenHeight: height
        });
      }
    } catch {
      // ignore if window is closing
    }
  }, 16);

  overlayWin.on('closed', () => {
    if (cursorTimer) {
      clearInterval(cursorTimer);
      cursorTimer = null;
    }
    overlayWin = null;
  });
}

// Toggle click-through when mouse enters/leaves the bird or its speech bubble
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (!overlayWin || overlayWin.isDestroyed()) {
    return;
  }
  if (ignore) {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
  } else {
    overlayWin.setIgnoreMouseEvents(false);
  }
});

// Toggle OS-level screen-capture / screen-share invisibility (Zoom / Meet / OBS / Teams)
ipcMain.on('set-content-protection', (event, enabled) => {
  if (!overlayWin || overlayWin.isDestroyed()) {
    return;
  }
  overlayWin.setContentProtection(Boolean(enabled));
});

ipcMain.on('close-overlay', () => {
  app.quit();
});

app.whenReady().then(() => {
  createOverlayWindow();
});

app.on('window-all-closed', () => {
  if (cursorTimer) {
    clearInterval(cursorTimer);
  }
  app.quit();
});

