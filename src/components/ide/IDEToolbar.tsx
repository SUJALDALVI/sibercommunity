"use client";

/**
 * IDEToolbar — top toolbar with save, commit, and GitHub actions.
 * Code execution UI is temporarily hidden; see /api/execute for the backend.
 */

import { Save, GitBranch, Upload, RefreshCw, Code2 } from "lucide-react";

// SUPPORTED_LANGUAGES and SupportedLanguage are kept here so the
// /api/execute backend and IDEPanel can reference them when re-enabled.
export const SUPPORTED_LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["id"];

interface Props {
  projectName: string;
  communityName: string;
  hasActiveFile: boolean;
  hasGitHub: boolean;
  saving: boolean;
  committing: boolean;
  onSave: () => void;
  onCommit: () => void;
  onOpenGitHub: () => void;
}

export default function IDEToolbar({
  projectName,
  communityName,
  hasActiveFile,
  hasGitHub,
  saving,
  committing,
  onSave,
  onCommit,
  onOpenGitHub,
}: Props) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d0c12] px-4">
      {/* Left: branding */}
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15">
          <Code2 size={14} className="text-red-400" />
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-semibold leading-none text-white">{projectName}</p>
          <p className="mt-0.5 text-[10px] leading-none text-zinc-500">{communityName}</p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Save */}
        <button
          type="button"
          disabled={!hasActiveFile || saving}
          onClick={onSave}
          title="Save file (Ctrl+S)"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <RefreshCw size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          <span className="hidden sm:inline">Save</span>
        </button>

        {/* Commit to GitHub */}
        {hasGitHub && (
          <button
            type="button"
            disabled={!hasActiveFile || committing}
            onClick={onCommit}
            title="Commit file to GitHub"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {committing ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            <span className="hidden sm:inline">Commit</span>
          </button>
        )}

        {/* GitHub connect / manage */}
        <button
          type="button"
          onClick={onOpenGitHub}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
        >
          <GitBranch size={12} />
          <span className="hidden sm:inline">{hasGitHub ? "GitHub" : "Connect GitHub"}</span>
        </button>
      </div>
    </div>
  );
}
