"use client";
/* eslint-disable react-hooks/set-state-in-effect */

/**
 * IDEPanel — main Cloud IDE component.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  IDEToolbar (top bar)                               │
 *   ├──────────┬──────────────────────────────────────────┤
 *   │          │  EditorTabs                              │
 *   │  File    ├──────────────────────────────────────────┤
 *   │  Explorer│  Monaco Editor                           │
 *   │          │                                          │
 *   ├──────────┴──────────────────────────────────────────┤
 *   │  IDEStatusBar (bottom)                              │
 *   └─────────────────────────────────────────────────────┘
 *
 * GitHub panel slides in over the right side.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/supabase";
import { buildFileTree } from "@/lib/ide/projects";
import type { IDEFile, IDEProject, FileNode } from "@/lib/ide/types";
import FileExplorer from "./FileExplorer";
import EditorTabs, { type OpenTab } from "./EditorTabs";
import MonacoEditor from "./MonacoEditor";
import IDEToolbar from "./IDEToolbar";
import IDEStatusBar from "./IDEStatusBar";
import GitHubConnect from "./GitHubConnect";
import { Code2, AlertTriangle } from "lucide-react";
import type { editor } from "monaco-editor";

const AUTOSAVE_DELAY_MS = 1500;

interface Props {
  communityId: string;
  communityName: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */

/**
 * Cache the Supabase access token in a module-level variable with a short
 * TTL so repeated authFetch calls within the same burst (e.g. project load
 * + files load) reuse the same token instead of awaiting getSession() twice.
 */
let _cachedToken: string | null = null;
let _tokenExpiry = 0;
const TOKEN_CACHE_MS = 30_000; // 30 s — well within Supabase's ~1h TTL

async function getSupabaseToken(): Promise<string | null> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;
  const { data } = await supabase.auth.getSession();
  _cachedToken = data.session?.access_token ?? null;
  _tokenExpiry = now + TOKEN_CACHE_MS;
  return _cachedToken;
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getSupabaseToken();
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token ?? ""}`,
      "Content-Type": "application/json",
    },
  });
}

/* ── Component ──────────────────────────────────────────────────── */
export default function IDEPanel({ communityId, communityName }: Props) {
  const [project, setProject] = useState<IDEProject | null>(null);
  const [files, setFiles] = useState<IDEFile[]>([]);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<Map<string, string>>(new Map());
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [committing, setCommitting] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  /* ── Clear autosave timer on unmount to prevent post-unmount state updates ── */
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  /* ── Load files (declared before loadProject to avoid hoisting issues) ── */
  const loadFiles = useCallback(async (projectId: string) => {
    const res = await authFetch(
      `/api/ide/files?project_id=${projectId}&community_id=${communityId}`
    );
    const data = (await res.json()) as { files?: IDEFile[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to load files.");
    const fileList = data.files ?? [];
    setFiles(fileList);
    setTree(buildFileTree(fileList));
  }, [communityId]);

  /* ── Load project + files ────────────────────────────────────── */
  const loadProject = useCallback(async () => {
    setLoadingProject(true);
    setProjectError("");
    try {
      const res = await authFetch(`/api/ide/projects?community_id=${communityId}`);
      const data = (await res.json()) as { project?: IDEProject; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load project.");
      const proj = data.project!;
      setProject(proj);
      await loadFiles(proj.id);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Failed to load IDE project.");
    } finally {
      setLoadingProject(false);
    }
  }, [communityId, loadFiles]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadProject(); }, [communityId]);

  /* ── Check GitHub connection status ────────────────────────────── */
  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch("/api/github/status");
        if (res.ok) {
          const data = (await res.json()) as { connected: boolean };
          setGithubConnected(data.connected);
        }
      } catch { /* Non-critical */ }
    })();
  }, []);

  /* ── Check for github_connected query param on mount ───────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("github_connected") === "1") {
      setShowGitHub(true);
      setGithubConnected(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  /* ── Open file in editor ─────────────────────────────────────── */
  const openFile = useCallback(
    (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file || file.type === "folder") return;

      // Already open?
      if (!openTabs.some((t) => t.id === fileId)) {
        setOpenTabs((prev) => [
          ...prev,
          {
            id: file.id,
            name: file.name,
            language: file.language,
            isDirty: false,
          },
        ]);
        // Load content into map if not already there
        setEditorContent((prev) => {
          if (prev.has(fileId)) return prev;
          const next = new Map(prev);
          next.set(fileId, file.content ?? "");
          return next;
        });
      }
      setActiveTabId(fileId);
    },
    [files, openTabs]
  );

  /* ── Close tab ───────────────────────────────────────────────── */
  const closeTab = (tabId: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[Math.max(0, idx - 1)]?.id ?? null);
      }
      return next;
    });
  };

  /* ── Save file ───────────────────────────────────────────────── */
  const saveFile = useCallback(async (fileId: string, content: string) => {
    if (!project) return;
    setSaveStatus("saving");
    try {
      const res = await authFetch("/api/ide/files", {
        method: "PATCH",
        body: JSON.stringify({
          community_id: communityId,
          project_id: project.id,
          file_id: fileId,
          content,
        }),
      });
      if (!res.ok) throw new Error("Save failed.");
      setSaveStatus("saved");
      setOpenTabs((prev) => prev.map((t) => (t.id === fileId ? { ...t, isDirty: false } : t)));
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, content } : f))
      );
    } catch {
      setSaveStatus("error");
    }
  }, [communityId, project]);

  /* ── Editor change → autosave ────────────────────────────────── */
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeTabId || value === undefined) return;
      setEditorContent((prev) => {
        const next = new Map(prev);
        next.set(activeTabId, value);
        return next;
      });
      setSaveStatus("unsaved");
      setOpenTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isDirty: true } : t))
      );

      // Autosave debounce
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        void saveFile(activeTabId, value);
      }, AUTOSAVE_DELAY_MS);
    },
    [activeTabId, saveFile]
  );

  /* ── Manual save (Ctrl+S) ────────────────────────────────────── */
  const handleManualSave = useCallback(() => {
    if (!activeTabId) return;
    const content = editorContent.get(activeTabId) ?? "";
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    void saveFile(activeTabId, content);
  }, [activeTabId, editorContent, saveFile]);

  /* ── Ctrl+S keyboard shortcut ────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleManualSave]);

  /* ── Create file/folder ──────────────────────────────────────── */
  const handleCreate = async (
    parentId: string | null,
    name: string,
    type: "file" | "folder"
  ) => {
    if (!project) return;
    try {
      const res = await authFetch("/api/ide/files", {
        method: "POST",
        body: JSON.stringify({
          community_id: communityId,
          project_id: project.id,
          parent_id: parentId,
          name,
          type,
        }),
      });
      const data = (await res.json()) as { file?: IDEFile; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Create failed.");
      const newFile = data.file!;
      setFiles((prev) => [...prev, newFile]);
      setTree(buildFileTree([...files, newFile]));
      if (type === "file") {
        setEditorContent((prev) => {
          const next = new Map(prev);
          next.set(newFile.id, "");
          return next;
        });
        openFile(newFile.id);
      }
    } catch (err) {
      console.error("[IDE] Create failed:", err instanceof Error ? err.message : "unknown");
    }
  };

  /* ── Rename ──────────────────────────────────────────────────── */
  const handleRename = async (fileId: string, newName: string) => {
    if (!project) return;
    try {
      const res = await authFetch("/api/ide/files", {
        method: "PATCH",
        body: JSON.stringify({
          community_id: communityId,
          project_id: project.id,
          file_id: fileId,
          name: newName,
        }),
      });
      const data = (await res.json()) as { file?: IDEFile; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rename failed.");
      const updated = data.file!;
      setFiles((prev) => prev.map((f) => (f.id === fileId ? updated : f)));
      setTree(buildFileTree(files.map((f) => (f.id === fileId ? updated : f))));
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.id === fileId ? { ...t, name: newName, language: updated.language } : t
        )
      );
    } catch (err) {
      console.error("[IDE] Rename failed:", err instanceof Error ? err.message : "unknown");
    }
  };

  /* ── Delete ──────────────────────────────────────────────────── */
  const handleDelete = (fileId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    if (!project) return;
    void authFetch(
      `/api/ide/files?file_id=${fileId}&community_id=${communityId}&project_id=${project.id}`,
      { method: "DELETE" }
    ).then((res) => {
      if (res.ok) {
        const updated = files.filter((f) => f.id !== fileId);
        setFiles(updated);
        setTree(buildFileTree(updated));
        closeTab(fileId);
      }
    });
  };

  /* ── Commit to GitHub ────────────────────────────────────────── */
  const handleCommit = async () => {
    if (!activeTabId || !project) return;
    const msg = window.prompt("Commit message:", "Update from Siber IDE");
    if (!msg) return;
    setCommitting(true);
    try {
      const res = await authFetch("/api/github/commit", {
        method: "POST",
        body: JSON.stringify({
          community_id: communityId,
          project_id: project.id,
          file_id: activeTabId,
          message: msg,
        }),
      });
      const data = (await res.json()) as { committed?: boolean; error?: string; github_sha?: string };
      if (!res.ok) throw new Error(data.error ?? "Commit failed.");
      // Update SHA in local state
      if (data.github_sha) {
        setFiles((prev) =>
          prev.map((f) => (f.id === activeTabId ? { ...f, github_sha: data.github_sha! } : f))
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setCommitting(false);
    }
  };

  /* ── Derive active file ──────────────────────────────────────── */
  const activeFile = files.find((f) => f.id === activeTabId) ?? null;
  const activeContent = activeTabId ? (editorContent.get(activeTabId) ?? "") : "";

  /* ── Loading / error ─────────────────────────────────────────── */
  if (loadingProject) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#09080c]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Loading IDE…</p>
        </div>
      </div>
    );
  }

  if (projectError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#09080c]">
        <div className="rounded-2xl border border-white/10 bg-[#0f0e14] p-8 text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
          <p className="text-sm font-semibold text-white">Failed to load IDE</p>
          <p className="mt-1 text-xs text-zinc-500">{projectError}</p>
          <button
            type="button"
            onClick={() => void loadProject()}
            className="mt-4 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#09080c] text-white">
      {/* ── Sidebar: File Explorer ────────────────────────────────── */}
      <div className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#0d0c12] xl:w-64">
        <FileExplorer
          tree={tree}
          selectedFileId={activeTabId}
          onSelectFile={openFile}
          onCreateFile={handleCreate}
          onRenameFile={handleRename}
          onDeleteFile={handleDelete}
        />
      </div>

      {/* ── Main editor area ─────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <IDEToolbar
          projectName={project?.name ?? "IDE Project"}
          communityName={communityName}
          hasActiveFile={!!activeTabId}
          hasGitHub={githubConnected && !!project?.github_repo_full_name}
          saving={saveStatus === "saving"}
          committing={committing}
          onSave={handleManualSave}
          onCommit={handleCommit}
          onOpenGitHub={() => setShowGitHub(true)}
        />

        {/* Tabs */}
        <EditorTabs
          tabs={openTabs}
          activeId={activeTabId}
          onSelect={setActiveTabId}
          onClose={closeTab}
        />

        {/* Editor */}
        <div className="relative flex-1 overflow-hidden">
          {activeTabId ? (
            <MonacoEditor
              key={activeTabId}
              value={activeContent}
              language={activeFile?.language ?? "plaintext"}
              onChange={handleEditorChange}
              onMount={(ed) => {
                editorRef.current = ed;
                ed.onDidChangeCursorPosition((e) => {
                  setCursorPos({
                    line: e.position.lineNumber,
                    col: e.position.column,
                  });
                });
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                <Code2 size={28} className="text-zinc-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-400">No file open</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Select a file from the explorer or create a new one
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <IDEStatusBar
          language={activeFile?.language ?? null}
          line={cursorPos.line}
          col={cursorPos.col}
          saveStatus={saveStatus}
          repoName={project?.github_repo_full_name ?? null}
        />
      </div>

      {/* ── GitHub slide-in panel ─────────────────────────────────── */}
      {showGitHub && project && (
        <div className="absolute inset-y-0 right-0 z-40 w-80 border-l border-white/10 shadow-[-20px_0_60px_rgba(0,0,0,0.6)]">
          <GitHubConnect
            communityId={communityId}
            projectId={project.id}
            linkedRepo={project.github_repo_full_name}
            onClose={() => setShowGitHub(false)}
            onImported={async () => {
              if (project) await loadFiles(project.id);
              // Refresh project to get updated github_repo_full_name
              const res = await authFetch(`/api/ide/projects?community_id=${communityId}`);
              if (res.ok) {
                const data = (await res.json()) as { project?: IDEProject };
                if (data.project) setProject(data.project);
              }
              setGithubConnected(true);
            }}
          />
        </div>
      )}
    </div>
  );
}
