"use client";

/**
 * GitHubConnect — panel for connecting GitHub and importing/managing repos.
 *
 * Shown as a slide-in sheet from IDEPanel.
 * Users NEVER enter tokens or passwords — they click "Connect GitHub"
 * which calls /api/github/initiate (authenticated POST) then redirects
 * to GitHub with a server-signed state token. The callback redirects
 * back to the same community IDE page.
 */

import { startTransition, useEffect, useState } from "react";
import { GitBranch, X, ExternalLink, RefreshCw, Download, Check, Unlink } from "lucide-react";
import type { GitHubRepo, GitHubConnectionStatus } from "@/lib/ide/types";
import { supabase } from "@/lib/supabase/supabase";

interface Props {
  communityId: string;
  projectId: string;
  linkedRepo: string | null;
  onClose: () => void;
  onImported: () => void;
}

export default function GitHubConnect({
  communityId,
  projectId,
  linkedRepo,
  onClose,
  onImported,
}: Props) {
  const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = await getToken();
    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ""}`,
        "Content-Type": "application/json",
      },
    });
  }

  async function loadStatus() {
    setLoadingStatus(true);
    setError("");
    try {
      const res = await authFetch("/api/github/status");
      if (!res.ok) throw new Error("Failed to load GitHub status.");
      const data = (await res.json()) as GitHubConnectionStatus;
      setStatus(data);
    } catch {
      setError("Could not check GitHub connection status.");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function loadRepos() {
    setLoadingRepos(true);
    setError("");
    try {
      const res = await authFetch(`/api/github/repos?community_id=${communityId}`);
      if (!res.ok) throw new Error("Failed to load repositories.");
      const data = (await res.json()) as { repos: GitHubRepo[] };
      setRepos(data.repos ?? []);
    } catch {
      setError("Could not fetch repositories from GitHub.");
    } finally {
      setLoadingRepos(false);
    }
  }

  async function handleImport(repo: GitHubRepo) {
    setImporting(repo.full_name);
    setError("");
    try {
      const res = await authFetch("/api/github/import", {
        method: "POST",
        body: JSON.stringify({
          community_id: communityId,
          project_id: projectId,
          repo_full_name: repo.full_name,
          branch: repo.default_branch,
        }),
      });
      const data = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect GitHub? Your imported files will remain in the IDE.")) return;
    try {
      await authFetch("/api/github/status", { method: "DELETE" });
      setStatus({ connected: false, github_login: null });
      setRepos([]);
    } catch {
      setError("Failed to disconnect GitHub.");
    }
  }

  /**
   * Initiates the GitHub OAuth flow.
   * Calls /api/github/initiate (authenticated POST) which returns a
   * server-signed GitHub authorization URL. We then navigate there.
   * The callback will redirect back to /community/[id]/ide.
   */
  async function handleConnect() {
    setError("");
    try {
      const res = await authFetch("/api/github/initiate", {
        method: "POST",
        body: JSON.stringify({ community_id: communityId }),
      });
      const data = (await res.json()) as { auth_url?: string; error?: string };
      if (!res.ok || !data.auth_url) {
        throw new Error(data.error ?? "Failed to start GitHub authorization.");
      }
      // Navigate to GitHub — full page redirect
      window.location.href = data.auth_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect GitHub.");
    }
  }

  useEffect(() => {
    startTransition(() => { void loadStatus(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.connected) startTransition(() => { void loadRepos(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  return (
    <div className="flex h-full flex-col bg-[#0d0c12]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-zinc-400" />
          <span className="text-sm font-semibold text-white">GitHub</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loadingStatus && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <RefreshCw size={14} className="animate-spin" /> Checking connection…
          </div>
        )}

        {/* Not connected */}
        {!loadingStatus && status && !status.connected && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#111118] p-4">
              <p className="text-sm font-semibold text-white">Connect GitHub</p>
              <p className="mt-1 text-xs text-zinc-400">
                Connect your GitHub account to import repositories and push changes directly from the IDE.
                You will never need to enter a token or password.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleConnect()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-100"
            >
              <GitBranch size={15} />
              Connect GitHub
            </button>
          </div>
        )}

        {/* Connected */}
        {!loadingStatus && status?.connected && (
          <div className="space-y-4">
            {/* Account info */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#111118] p-3">
              <div className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400" />
                <span className="text-sm text-white">
                  Connected as <span className="font-semibold">{status.github_login}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-red-400"
              >
                <Unlink size={11} /> Disconnect
              </button>
            </div>

            {/* Linked repo */}
            {linkedRepo && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Linked Repository
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white">
                  <GitBranch size={13} className="text-zinc-400" />
                  {linkedRepo}
                  <a
                    href={`https://github.com/${linkedRepo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-zinc-500 hover:text-white"
                  >
                    <ExternalLink size={12} />
                  </a>
                </p>
              </div>
            )}

            {/* Repos list */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Your Repositories
                </p>
                <button
                  type="button"
                  onClick={loadRepos}
                  disabled={loadingRepos}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-white/5 hover:text-white"
                >
                  <RefreshCw size={11} className={loadingRepos ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              {loadingRepos ? (
                <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
                  <RefreshCw size={14} className="animate-spin" /> Loading repos…
                </div>
              ) : repos.length === 0 ? (
                <p className="text-sm text-zinc-500">No repositories found.</p>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {repos.map((repo) => {
                    const isLinked = repo.full_name === linkedRepo;
                    const isImporting = importing === repo.full_name;
                    return (
                      <div
                        key={repo.id}
                        className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 ${
                          isLinked
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-white/10 bg-[#111118]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{repo.name}</p>
                          {repo.description && (
                            <p className="truncate text-xs text-zinc-500">{repo.description}</p>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-600">
                            {repo.language && <span>{repo.language}</span>}
                            {repo.private && <span>Private</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isImporting || isLinked}
                          onClick={() => handleImport(repo)}
                          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isImporting ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : isLinked ? (
                            <Check size={11} className="text-emerald-400" />
                          ) : (
                            <Download size={11} />
                          )}
                          {isLinked ? "Imported" : "Import"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
