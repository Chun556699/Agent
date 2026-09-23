import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

type DesktopBridge = {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximized: (fn: (v: boolean) => void) => () => void;
  notify: (title: string, body?: string) => void;
  openExternal: (url: string) => void;
  onDeepLink: (fn: (url: string) => void) => () => void;
  platform: string;
  versions: { app: string; electron: string; chrome: string; node: string };
};

declare global {
  interface Window {
    agentdeskDesktop?: DesktopBridge;
  }
}

/**
 * Desktop window chrome — only rendered inside the Electron shell
 * (desktop/main.mjs) which exposes window.agentdeskDesktop via preload.
 * Browser usage never sees this bar.
 */
export function Titlebar() {
  const d = window.agentdeskDesktop;
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!d) return;
    d.isMaximized().then(setMaximized).catch(() => {});
    return d.onMaximized(setMaximized);
  }, [d]);
  if (!d) return null;
  const isMac = d.platform === "darwin";

  return (
    <div
      className="h-10 shrink-0 flex items-center border-b border-line bg-paper select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onDoubleClick={(e) => {
        // Standard titlebar behavior — the window buttons are no-drag
        // and never reach this handler.
        if ((e.target as HTMLElement).closest("button")) return;
        d.toggleMaximize();
      }}
    >
      {isMac && <div className="w-[72px] shrink-0" />}
      <div className="flex items-center gap-2 px-4">
        <span className="bolt text-[13px] text-ink" />
        <span className="text-[12px] font-medium tracking-tight">AgentDesk</span>
      </div>
      <div className="flex-1" />
      {!isMac && (
        <div className="flex items-stretch h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <WinBtn title="Minimize" onClick={d.minimize}><Minus size={14} /></WinBtn>
          <WinBtn title={maximized ? "Restore" : "Maximize"} onClick={d.toggleMaximize}>
            {maximized ? <Copy size={11} /> : <Square size={11} />}
          </WinBtn>
          <WinBtn title="Close" onClick={d.close} hoverClass="hover:!bg-[#c42b1c] hover:text-white"><X size={15} /></WinBtn>
        </div>
      )}
    </div>
  );
}

function WinBtn({ children, title, onClick, hoverClass }: { children: React.ReactNode; title: string; onClick: () => void; hoverClass?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-11 h-full text-ink-2 flex items-center justify-center transition-colors hover:bg-fill ${hoverClass ?? ""}`}
    >
      {children}
    </button>
  );
}
