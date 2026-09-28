"use client";

/**
 * EditorTabs — open file tabs bar.
 */

import { X, File } from "lucide-react";

export interface OpenTab {
  id: string;
  name: string;
  language: string | null;
  isDirty: boolean;
}

interface Props {
  tabs: OpenTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export default function EditorTabs({ tabs, activeId, onSelect, onClose }: Props) {
  if (tabs.length === 0) {
    return (
      <div className="flex h-9 items-center border-b border-white/10 bg-[#0d0c12] px-4">
        <span className="text-xs text-zinc-600">Open a file from the explorer</span>
      </div>
    );
  }

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-white/10 bg-[#0d0c12]">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group flex cursor-pointer items-center gap-2 border-r border-white/10 px-3 text-xs transition ${
              isActive
                ? "bg-[#09080c] text-white"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            }`}
            style={{ minWidth: "100px", maxWidth: "180px" }}
          >
            <File
              size={11}
              className={isActive ? "shrink-0 text-red-400" : "shrink-0 text-zinc-600"}
            />
            <span className="min-w-0 flex-1 truncate">
              {tab.isDirty && (
                <span className="mr-1 text-amber-400">●</span>
              )}
              {tab.name}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition hover:bg-white/10 group-hover:opacity-100"
              title="Close tab"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
