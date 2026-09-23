import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = 8787;
const URL_ = `http://127.0.0.1:${PORT}`;

let server = null;
let win = null;

// node binary for the embedded server: AGENTDESK_NODE env override (dev
// boxes), else plain `node` from PATH.
const NODE_BIN = process.env.AGENTDESK_NODE || "node";

function startServer() {
  server = spawn(NODE_BIN, [join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: "inherit",
  });
  server.on("exit", (code) => console.log(`agentdesk server exited (${code})`));
}

function killServer() {
  server?.kill();
  server = null;
}

async function serverIsUp() {
  try {
    return (await fetch(`${URL_}/api/health`)).ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await serverIsUp()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("AgentDesk server did not start");
}

function createWindow() {
  win = new BrowserWindow({
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

  win.on("closed", () => { win = null; });
  win.on("maximize", () => win?.webContents.send("win:maximized", true));
  win.on("unmaximize", () => win?.webContents.send("win:maximized", false));

  win.loadURL(URL_);
  if (process.argv.includes("--dev")) win.webContents.openDevTools({ mode: "detach" });
}

// Window controls — registered once; re-creating the window (macOS
// "activate") must not stack duplicate handlers on a stale window ref.
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:toggle-maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());

app.whenReady().then(async () => {
  // Reuse an already-running AgentDesk server (e.g. dev box); only spawn
  // our own when nothing is listening yet.
  if (!(await serverIsUp())) startServer();
  try {
    await waitForServer();
  } catch (err) {
    dialog.showErrorBox(
      "AgentDesk",
      `The embedded server did not start.\n\n${err.message}\n\nSet AGENTDESK_NODE to a Node >=22 binary if 'node' isn't on PATH.`,
    );
    app.quit();
    return;
  }
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Cmd+Q on macOS skips window-all-closed — kill the child on quit too.
app.on("before-quit", killServer);

app.on("window-all-closed", () => {
  killServer();
  if (process.platform !== "darwin") app.quit();
});
