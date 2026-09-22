import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = 8787;
const URL_ = `http://127.0.0.1:${PORT}`;

let server = null;

function startServer() {
  server = spawn(process.execPath.replace(/electron(\.exe)?$/i, "node$1"), [join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: "inherit",
  });
  server.on("exit", (code) => console.log(`agentdesk server exited (${code})`));
}

async function waitForServer(timeoutMs = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`${URL_}/api/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("AgentDesk server did not start");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 560,
    frame: false,               // custom titlebar lives in the web UI (Titlebar.tsx)
    backgroundColor: "#f5f3ee",
    title: "AgentDesk",
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  ipcMain.on("win:minimize", () => win.minimize());
  ipcMain.on("win:toggle-maximize", () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on("win:close", () => win.close());
  win.on("maximize", () => win.webContents.send("win:maximized", true));
  win.on("unmaximize", () => win.webContents.send("win:maximized", false));

  win.loadURL(URL_);
  if (process.argv.includes("--dev")) win.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(async () => {
  startServer();
  await waitForServer();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  server?.kill();
  if (process.platform !== "darwin") app.quit();
});
