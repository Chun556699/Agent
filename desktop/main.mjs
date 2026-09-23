import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from "electron";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Packaged builds run out of app.asar; the server and web bundle must be
// unpacked to real files so the spawned node process can read them.
const ROOT = app.isPackaged
  ? join(process.resourcesPath, "app.asar.unpacked")
  : join(__dirname, "..");
const PORT = 8787;
const APP_URL = `http://127.0.0.1:${PORT}`;
const ICON = join(__dirname, "assets", "icon.png");
const STATE_FILE = join(app.getPath("userData"), "window-state.json");
const LOG_DIR = join(app.getPath("userData"), "logs");
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const DEV = process.argv.includes("--dev");

let server = null;
let win = null;
let tray = null;
let quitting = false;

// node binary for the embedded server: packaged apps reuse the Electron
// binary itself in node mode; dev boxes take AGENTDESK_NODE, else `node`.
const NODE_BIN = app.isPackaged ? process.execPath : (process.env.AGENTDESK_NODE || "node");

// ---------------------------------------------------------------- server ---

function startServer() {
  mkdirSync(LOG_DIR, { recursive: true });
  const out = createWriteStream(join(LOG_DIR, "server.log"), { flags: "a" });
  const env = { ...process.env };
  if (app.isPackaged) {
    env.ELECTRON_RUN_AS_NODE = "1";
    env.AGENTDESK_DATA_DIR ??= join(app.getPath("userData"), "data");
  }
  server = spawn(NODE_BIN, [join(ROOT, "server", "index.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: !IS_WIN, // own process group so we can kill the whole tree
  });
  server.stdout.pipe(out);
  server.stderr.pipe(out);
  server.on("error", (err) => console.error(`agentdesk server failed to spawn: ${err.message}`));
  server.on("exit", (code) => console.log(`agentdesk server exited (${code})`));
}

function killServer() {
  if (!server) return;
  const pid = server.pid;
  server = null;
  if (IS_WIN) {
    // /t kills the whole process tree (MCP child processes included).
    try { spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" }); } catch { /* gone */ }
  } else {
    try { process.kill(-pid, "SIGTERM"); } catch {
      try { process.kill(pid, "SIGTERM"); } catch { /* gone */ }
    }
  }
}

async function serverIsUp() {
  try {
    return (await fetch(`${APP_URL}/api/health`)).ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await serverIsUp()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("AgentDesk server did not start");
}

// ------------------------------------------------------- window state ---

function loadWindowState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (typeof s.width !== "number" || typeof s.height !== "number") return null;
    // Drop the saved position if no display still intersects it.
    if (typeof s.x === "number" && typeof s.y === "number") {
      const onScreen = screen.getAllDisplays().some((d) => {
        const { x, y, width, height } = d.workArea;
        return s.x < x + width && s.x + s.width > x && s.y < y + height && s.y + s.height > y;
      });
      if (!onScreen) { delete s.x; delete s.y; }
    }
    return s;
  } catch {
    return null;
  }
}

function saveWindowState() {
  if (!win) return;
  try {
    const maximized = win.isMaximized();
    const b = maximized ? win.getNormalBounds() : win.getBounds();
    writeFileSync(STATE_FILE, JSON.stringify({ ...b, maximized }));
  } catch { /* first run / fs hiccup */ }
}

// ---------------------------------------------------------------- window ---

function createWindow() {
  const state = loadWindowState() ?? {};

  win = new BrowserWindow({
    width: state.width ?? 1280,
    height: state.height ?? 840,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 560,
    frame: false,               // custom titlebar lives in the web UI (Titlebar.tsx)
    backgroundColor: "#f5f3ee",
    title: "AgentDesk",
    icon: nativeImage.createFromPath(ICON),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (state.maximized) win.maximize();

  win.on("closed", () => { win = null; });
  win.on("close", saveWindowState);
  win.on("maximize", () => win?.webContents.send("win:maximized", true));
  win.on("unmaximize", () => win?.webContents.send("win:maximized", false));

  // External links leave the app: http(s) opens in the system browser,
  // anything else is dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(APP_URL)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(APP_URL)) e.preventDefault();
  });

  // Right-click menu: text-editing roles on inputs, copy/select-all +
  // inspector elsewhere.
  win.webContents.on("context-menu", (_e, params) => {
    const template = params.isEditable
      ? [
          { role: "undo" }, { role: "redo" }, { type: "separator" },
          { role: "cut" }, { role: "copy" }, { role: "paste" },
          { role: "selectAll" },
        ]
      : [
          { role: "copy", enabled: params.selectionText.length > 0 },
          { role: "selectAll" },
          { type: "separator" },
          { label: "Inspect", click: () => win?.webContents.openDevTools({ mode: "detach" }) },
        ];
    Menu.buildFromTemplate(template).popup({ window: win });
  });

  // Chrome-style shortcuts that a frameless window doesn't get for free.
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const mod = input.control || input.meta;
    if (input.key === "F12") {
      win?.webContents.toggleDevTools();
      e.preventDefault();
    } else if (mod && input.key.toLowerCase() === "r") {
      if (input.shift) win?.webContents.reloadIgnoringCache();
      else win?.webContents.reload();
      e.preventDefault();
    } else if (mod && (input.key === "=" || input.key === "+")) {
      win?.webContents.setZoomFactor(Math.min(3, win.webContents.getZoomFactor() + 0.1));
      e.preventDefault();
    } else if (mod && input.key === "-") {
      win?.webContents.setZoomFactor(Math.max(0.4, win.webContents.getZoomFactor() - 0.1));
      e.preventDefault();
    } else if (mod && input.key === "0") {
      win?.webContents.setZoomFactor(1);
      e.preventDefault();
    }
  });

  // Splash races the server boot: on a warm start (server already up)
  // loadApp() aborts this load mid-flight — that rejection is expected.
  win.loadFile(join(__dirname, "splash.html")).catch(() => {});
  win.once("ready-to-show", () => win?.show());
}

async function loadApp() {
  if (!win) return;
  await win.loadURL(APP_URL);
  if (DEV) win.webContents.openDevTools({ mode: "detach" });
}

// Window controls — registered once; re-creating the window (macOS
// "activate") must not stack duplicate handlers on a stale window ref.
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:toggle-maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());
ipcMain.handle("win:is-maximized", () => win?.isMaximized() ?? false);

ipcMain.on("notify", (_e, { title, body }) => {
  if (!Notification.isSupported() || typeof title !== "string") return;
  const n = new Notification({ title, body: String(body ?? ""), icon: nativeImage.createFromPath(ICON) });
  n.on("click", () => { win?.show(); win?.focus(); });
  n.show();
});

ipcMain.on("shell:open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ------------------------------------------------------------------ tray ---

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("AgentDesk");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show AgentDesk", click: () => { win?.show(); win?.focus(); } },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", () => { win?.isVisible() ? win.hide() : (win?.show(), win?.focus()); });
}

// --------------------------------------------------------------- startup ---

// One running instance: a second launch just focuses the existing window
// (and forwards any agentdesk:// deep link it was opened with).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId("com.agentdesk.app");
  app.setAsDefaultProtocolClient("agentdesk");

  app.on("second-instance", (_e, argv) => {
    const link = argv.find((a) => a.startsWith("agentdesk://"));
    if (link) win?.webContents.send("deeplink", link);
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });

  app.on("open-url", (e, url) => {
    e.preventDefault();
    win?.webContents.send("deeplink", url);
  });

  // macOS: a real menu is required for Cmd+C/V/etc to work in inputs.
  if (IS_MAC) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]));
  }

  app.whenReady().then(async () => {
    createWindow();
    createTray();

    // Reuse an already-running AgentDesk server (e.g. dev box); only
    // spawn our own when nothing is listening yet.
    if (!(await serverIsUp())) startServer();
    try {
      await waitForServer();
    } catch (err) {
      dialog.showErrorBox(
        "AgentDesk",
        `The embedded server did not start.\n\n${err.message}\n\nSet AGENTDESK_NODE to a Node >=22 binary if 'node' isn't on PATH.\n\nServer log: ${join(LOG_DIR, "server.log")}`,
      );
      app.quit();
      return;
    }
    await loadApp();

    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("before-quit", () => { quitting = true; killServer(); });

  app.on("window-all-closed", () => {
    killServer();
    if (!IS_MAC) app.quit();
  });
}

// Closing to the tray instead of quitting is a common desktop-agent
// pattern; hook it here if we want it later:
// win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
