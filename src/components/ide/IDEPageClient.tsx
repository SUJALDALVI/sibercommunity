"use client";
/* eslint-disable react-hooks/set-state-in-effect */

/**
 * IDEPageClient — client component that resolves the communityId param
 * from the Promise, verifies the community goal is IDE-eligible, then
 * renders IDEPanel.
 *
 * Shows an access-denied message for non-Coding/AppDev communities.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Code2, AlertTriangle } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { fetchCommunityById } from "@/lib/communities";
import { isIDECommunity } from "@/lib/ide/types";
import IDEPanel from "./IDEPanel";

interface Community {
  id: string;
  name: string;
  goal: string;
}

export default function IDEPageClient({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const router = useRouter();
  const { communityId } = use(params);
  const { loading: authLoading } = useAuth();

  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [githubError, setGithubError] = useState("");

  useEffect(() => {
    if (!communityId || authLoading) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const comm = await fetchCommunityById(communityId);
        if (mounted) setCommunity(comm as Community | null);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load community.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => { mounted = false; };
  }, [communityId, authLoading]);

  // Pick up github_error query param from callback redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const ghErr = p.get("github_error");
    if (ghErr) {
      setGithubError(decodeURIComponent(ghErr));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09080c]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Loading IDE…</p>
        </div>
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09080c]">
        <div className="rounded-2xl border border-white/10 bg-[#0f0e14] p-8 text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
          <p className="text-sm font-semibold text-white">Community not found</p>
          <p className="mt-1 text-xs text-zinc-500">{error || "This community does not exist."}</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-4 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Goal gate — IDE is only for Coding and Application Development
  if (!isIDECommunity(community.goal)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09080c]">
        <div className="rounded-2xl border border-white/10 bg-[#0f0e14] p-8 text-center max-w-sm">
          <Code2 size={32} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm font-semibold text-white">Cloud IDE not available</p>
          <p className="mt-2 text-xs text-zinc-400">
            The Cloud IDE is only available for <span className="text-white font-medium">Coding</span> and{" "}
            <span className="text-white font-medium">Application Development</span> communities.
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            This community goal is: <span className="text-zinc-300">{community.goal}</span>
          </p>
          <button
            type="button"
            onClick={() => router.push(`/community/${communityId}`)}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            <ArrowLeft size={13} /> Back to Community
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#09080c]">
      {/* Top back-nav bar */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#0d0c12] px-4 py-2">
        <button
          type="button"
          onClick={() => router.push(`/community/${communityId}/chat`)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft size={14} /> Back to chat
        </button>
        <span className="text-zinc-700">·</span>
        <span className="text-xs text-zinc-500">{community.name}</span>
        <span className="ml-auto rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
          Cloud IDE
        </span>
      </div>

      {/* GitHub OAuth error banner */}
      {githubError && (
        <div className="flex items-center justify-between border-b border-red-500/20 bg-red-500/10 px-4 py-2">
          <span className="text-xs text-red-300">GitHub: {githubError}</span>
          <button
            type="button"
            onClick={() => setGithubError("")}
            className="ml-4 text-xs text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* IDE fills remaining height */}
      <div className="relative flex-1 overflow-hidden">
        <IDEPanel communityId={communityId} communityName={community.name} />
      </div>
    </div>
  );
}
