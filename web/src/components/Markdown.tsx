import { Suspense, lazy } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlockChrome } from "./CodeBlockChrome";

const CodeBlock = lazy(() => import("./CodeBlock"));

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Block code renders its own chrome; unwrap the default <pre>.
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const raw = String(children ?? "");
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang || raw.includes("\n")) {
              const code = raw.replace(/\n$/, "");
              return (
                // Highlighter chunk loads lazily — show raw code until it's ready.
                <Suspense
                  fallback={
                    <CodeBlockChrome lang={lang ?? "text"} code={code}>
                      <pre className="px-3.5 py-3 overflow-x-auto text-[12px] leading-relaxed text-[#e8e4d8] font-mono whitespace-pre">{code}</pre>
                    </CodeBlockChrome>
                  }
                >
                  <CodeBlock lang={lang ?? "text"} code={code} />
                </Suspense>
              );
            }
            return <code className="md-inline">{raw}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
