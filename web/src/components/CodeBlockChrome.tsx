import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Frame of a code block — dark slab, language label, copy button. */
export function CodeBlockChrome({ lang, code, children }: { lang: string; code: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{lang}</span>
        <button className="codeblock-copy" onClick={copy}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      {children}
    </div>
  );
}
