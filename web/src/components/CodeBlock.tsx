import type { CSSProperties } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import ts from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { CodeBlockChrome } from "./CodeBlockChrome";

SyntaxHighlighter.registerLanguage("javascript", js);
SyntaxHighlighter.registerLanguage("typescript", ts);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("yaml", yaml);

/* Muted "ink slab" palette for dark code blocks on paper. */
const inkTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': { color: "#e8e4d8", background: "none", textShadow: "none" },
  'pre[class*="language-"]': { color: "#e8e4d8", background: "none", textShadow: "none" },
  comment: { color: "#8a857a", fontStyle: "italic" },
  prolog: { color: "#8a857a" },
  doctype: { color: "#8a857a" },
  cdata: { color: "#8a857a" },
  punctuation: { color: "#a39d8d" },
  property: { color: "#9db8d9" },
  tag: { color: "#d8a26e" },
  constant: { color: "#d8a26e" },
  symbol: { color: "#d8a26e" },
  deleted: { color: "#d88a7a" },
  boolean: { color: "#d8a26e" },
  number: { color: "#d8a26e" },
  selector: { color: "#9dbf9e" },
  "attr-name": { color: "#9dbf9e" },
  string: { color: "#9dbf9e" },
  char: { color: "#9dbf9e" },
  builtin: { color: "#9db8d9" },
  inserted: { color: "#9dbf9e" },
  operator: { color: "#c0b8a6", background: "none" },
  entity: { color: "#9db8d9", cursor: "help" },
  url: { color: "#9db8d9" },
  atrule: { color: "#d8b26e" },
  "attr-value": { color: "#9dbf9e" },
  function: { color: "#9db8d9" },
  "class-name": { color: "#d8b26e" },
  keyword: { color: "#d8b26e" },
  regex: { color: "#9dbf9e" },
  important: { color: "#d8a26e", fontWeight: "bold" },
  variable: { color: "#e8e4d8" },
};

export default function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <CodeBlockChrome lang={lang} code={code}>
      <SyntaxHighlighter language={lang} style={inkTheme} PreTag="pre">
        {code}
      </SyntaxHighlighter>
    </CodeBlockChrome>
  );
}
