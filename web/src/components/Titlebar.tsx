import { useEffect, useState } from "react";

type DesktopBridge = {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  onMaximized: (fn: (v: boolean) => void) => () => void;
  platform: string;
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
  useEffect(() => d?.onMaximized(setMaximized), [d]);
  if (!d) return null;
  const isMac = d.platform === "darwin";

  return (
    <div
      className="h-10 shrink-0 flex items-center border-b border-line bg-paper select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {isMac && <div className="w-[72px] shrink-0" />}
      <div className="flex items-center gap-2 px-4">
        <span className="bolt text-[13px] text-ink" />
        <span className="text-[12px] font-medium tracking-tight">AgentDesk</span>
      </div>
      <div className="flex-1" />
      {!isMac && (
        <div className="flex items-stretch h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <WinBtn label="–" title="Minimize" onClick={d.minimize} />
          <WinBtn label={maximized ? "❐" : "□"} title={maximized ? "Restore" : "Maximize"} onClick={d.toggleMaximize} />
          <WinBtn label="×" title="Close" onClick={d.close} hoverClass="hover:!bg-[#c42b1c] hover:text-white" />
        </div>
      )}
    </div>
  );
}

function WinBtn({ label, title, onClick, hoverClass }: { label: string; title: string; onClick: () => void; hoverClass?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-11 h-full text-ink-2 text-[13px] transition-colors hover:bg-fill ${hoverClass ?? ""}`}
    >
      {label}
    </button>
  );
}
