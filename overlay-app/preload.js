const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("FSRP_OVERLAY", {
  minimize: () => ipcRenderer.send("overlay:minimize"),
  close: () => ipcRenderer.send("overlay:close"),
  opacity: (value) => ipcRenderer.send("overlay:opacity", value)
});
