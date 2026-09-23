import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentdeskDesktop", {
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  close: () => ipcRenderer.send("win:close"),
  isMaximized: () => ipcRenderer.invoke("win:is-maximized"),
  onMaximized: (fn) => {
    const h = (_e, v) => fn(v);
    ipcRenderer.on("win:maximized", h);
    return () => ipcRenderer.removeListener("win:maximized", h);
  },
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
  openExternal: (url) => ipcRenderer.send("shell:open-external", url),
  onDeepLink: (fn) => {
    const h = (_e, url) => fn(url);
    ipcRenderer.on("deeplink", h);
    return () => ipcRenderer.removeListener("deeplink", h);
  },
  platform: process.platform,
  versions: {
    app: "0.1.0",
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
