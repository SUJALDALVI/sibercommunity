"use client";

/**
 * MonacoEditor — dynamic wrapper around @monaco-editor/react.
 * Always loaded client-side only (no SSR).
 */

import dynamic from "next/dynamic";
import type { OnChange, OnMount } from "@monaco-editor/react";

// Dynamically import to prevent SSR issues (Monaco requires `window`)
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0d0c12]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
    </div>
  ),
});

interface Props {
  value: string;
  language: string;
  onChange?: OnChange;
  onMount?: OnMount;
  readOnly?: boolean;
}

export default function MonacoEditor({ value, language, onChange, onMount, readOnly = false }: Props) {
  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language={language}
      value={value}
      onChange={onChange}
      onMount={onMount}
      options={{
        readOnly,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontLigatures: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        lineNumbers: "on",
        renderLineHighlight: "line",
        cursorBlinking: "smooth",
        smoothScrolling: true,
        contextmenu: true,
        folding: true,
        bracketPairColorization: { enabled: true },
        padding: { top: 12, bottom: 12 },
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
      }}
    />
  );
}
