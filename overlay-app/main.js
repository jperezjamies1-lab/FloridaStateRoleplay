const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let windowRef = null;
const configPath = path.join(__dirname, "overlay-config.json");

function config() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {
      siteUrl: "https://YOUR-PAGES-DOMAIN.pages.dev",
      route: "cad",
      opacity: 0.94,
      width: 420,
      height: 720
    };
  }
}

function createWindow() {
  const settings = config();
  windowRef = new BrowserWindow({
    width: Number(settings.width) || 420,
    height: Number(settings.height) || 720,
    minWidth: 330,
    minHeight: 460,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    opacity: Math.min(1, Math.max(0.55, Number(settings.opacity) || 0.94)),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const site = String(settings.siteUrl || "").replace(/\/$/, "");
  const route = String(settings.route || "cad").replace(/[^a-z0-9-]/gi, "");
  windowRef.loadURL(`${site}/?companion=1#${route}`);
  windowRef.once("ready-to-show", () => windowRef.show());
  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  windowRef.on("closed", () => { windowRef = null; });
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+O", () => {
    if (!windowRef) return createWindow();
    windowRef.isVisible() ? windowRef.hide() : windowRef.show();
  });
  globalShortcut.register("CommandOrControl+Shift+R", () => {
    windowRef?.webContents.executeJavaScript("window.FSRP_LIVE_RADIO?.requestPTT?.(true)").catch(() => undefined);
  });
});

ipcMain.on("overlay:minimize", () => windowRef?.minimize());
ipcMain.on("overlay:close", () => windowRef?.hide());
ipcMain.on("overlay:opacity", (_event, value) => windowRef?.setOpacity(Math.min(1, Math.max(0.55, Number(value) || 0.94))));

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
