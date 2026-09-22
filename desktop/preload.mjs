import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentdeskDesktop", {
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  close: () => ipcRenderer.send("win:close"),
  onMaximized: (fn) => {
    const h = (_e, v) => fn(v);
    ipcRenderer.on("win:maximized", h);
    return () => ipcRenderer.removeListener("win:maximized", h);
  },
  platform: process.platform,
});
