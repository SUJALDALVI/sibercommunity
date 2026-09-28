"use client";

/**
 * IDEStatusBar — bottom status bar showing language, line/col, autosave status.
 */

interface Props {
  language: string | null;
  line: number;
  col: number;
  saveStatus: "saved" | "saving" | "unsaved" | "error";
  repoName: string | null;
}

const SAVE_LABELS: Record<Props["saveStatus"], { label: string; color: string }> = {
  saved: { label: "Saved", color: "text-emerald-400" },
  saving: { label: "Saving…", color: "text-zinc-400" },
  unsaved: { label: "Unsaved changes", color: "text-amber-400" },
  error: { label: "Save failed", color: "text-red-400" },
};

export default function IDEStatusBar({ language, line, col, saveStatus, repoName }: Props) {
  const { label, color } = SAVE_LABELS[saveStatus];

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/10 bg-[#0d0c12] px-4 text-[11px] text-zinc-500">
      <div className="flex items-center gap-4">
        {language && (
          <span className="capitalize">{language}</span>
        )}
        <span>
          Ln {line}, Col {col}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {repoName && (
          <span className="truncate max-w-[200px]">
            <span className="text-zinc-600">GitHub: </span>
            {repoName}
          </span>
        )}
        <span className={color}>{label}</span>
      </div>
    </div>
  );
}
