/**
 * POST /api/github/import
 * Headers: Authorization: Bearer <supabase_access_token>
 * Body: { community_id, project_id, repo_full_name, branch? }
 *
 * Imports a GitHub repository's file tree into an IDE project.
 * Fetches the git tree (recursive) and creates ide_files rows for
 * each blob (file) and tree (folder) entry.
 *
 * Binary files (images, archives etc.) are skipped.
 * Files > 500KB are imported as empty stubs with a note in content.
 * Max 200 files per import to prevent abuse.
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateCommunityMember, errorResponse } from "@/lib/ide/serverAuth";
import { getUserGitHubToken, getRepoTree, getFileContent } from "@/lib/ide/github";
import { guessLanguage } from "@/lib/ide/projects";
import { createClient } from "@supabase/supabase-js";

const MAX_FILES = 200;
const MAX_FILE_BYTES = 500_000;

const SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "svg",
  "woff", "woff2", "ttf", "eot", "otf",
  "mp4", "mp3", "ogg", "wav",
  "zip", "tar", "gz", "7z", "rar",
  "pdf", "exe", "dll", "so", "dylib",
  "lock", // e.g. package-lock.json — importable but usually skip
]);

function shouldSkip(path: string): boolean {
  const lower = path.toLowerCase();
  // Skip .git internals, node_modules, build output
  if (
    lower.startsWith(".git/") ||
    lower.includes("/node_modules/") ||
    lower.startsWith("node_modules/") ||
    lower.includes("/.next/") ||
    lower.startsWith(".next/") ||
    lower.includes("/dist/") ||
    lower.includes("/build/")
  )
    return true;
  const ext = lower.split(".").pop() ?? "";
  return SKIP_EXTENSIONS.has(ext);
}

type ImportBody = {
  community_id?: unknown;
  project_id?: unknown;
  repo_full_name?: unknown;
  branch?: unknown;
};

export async function POST(request: NextRequest) {
  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { community_id, project_id, repo_full_name, branch } = body;

  if (typeof community_id !== "string" || !community_id) {
    return errorResponse("community_id is required.", 400);
  }
  if (typeof project_id !== "string" || !project_id) {
    return errorResponse("project_id is required.", 400);
  }
  if (typeof repo_full_name !== "string" || !repo_full_name.includes("/")) {
    return errorResponse("repo_full_name must be 'owner/repo'.", 400);
  }

  const auth = await authenticateCommunityMember(request, community_id);
  if (!auth.ok) return auth.response;

  // Verify the user owns (created) the project
  const { data: project, error: projErr } = await auth.supabase
    .from("ide_projects")
    .select("id, created_by, community_id")
    .eq("id", project_id)
    .eq("community_id", community_id)
    .maybeSingle();

  if (projErr || !project) {
    return errorResponse("Project not found.", 404);
  }
  if (project.created_by !== auth.userId) {
    return errorResponse("Only the project creator can import a repository.", 403);
  }

  const token = await getUserGitHubToken(auth.userId);
  if (!token) {
    return errorResponse("GitHub is not connected. Connect GitHub first.", 403);
  }

  const [owner, repo] = repo_full_name.split("/");
  const targetBranch = typeof branch === "string" && branch ? branch : "main";

  let tree: { sha: string; tree: { path: string; type: string; sha: string; size?: number }[] };
  try {
    tree = await getRepoTree(token, owner, repo, targetBranch);
  } catch (err) {
    // Try "master" if "main" fails
    if (targetBranch === "main") {
      try {
        tree = await getRepoTree(token, owner, repo, "master");
      } catch {
        console.error("[GitHub import] getRepoTree failed:", err instanceof Error ? err.message : "unknown");
        return errorResponse("Failed to fetch repository tree from GitHub.", 502);
      }
    } else {
      console.error("[GitHub import] getRepoTree failed:", err instanceof Error ? err.message : "unknown");
      return errorResponse("Failed to fetch repository tree from GitHub.", 502);
    }
  }

  // Filter entries
  const folders = tree.tree
    .filter((e) => e.type === "tree" && !shouldSkip(e.path + "/"))
    .slice(0, MAX_FILES);

  const files = tree.tree
    .filter(
      (e) =>
        e.type === "blob" &&
        !shouldSkip(e.path) &&
        (e.size === undefined || e.size <= MAX_FILE_BYTES)
    )
    .slice(0, MAX_FILES);

  if (files.length + folders.length === 0) {
    return errorResponse("No importable files found in this repository.", 422);
  }

  // Build path→id map for folder hierarchy
  const pathToId = new Map<string, string>();

  // Use service client for bulk inserts (avoids RLS insert restrictions)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return errorResponse("Service not configured.", 503);
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Clear existing files in the project before import
  await db.from("ide_files").delete().eq("project_id", project_id);

  // Insert folders first (sorted by depth so parents exist before children)
  const sortedFolders = folders
    .map((e) => ({ ...e, depth: e.path.split("/").length }))
    .sort((a, b) => a.depth - b.depth);

  for (const folderEntry of sortedFolders) {
    const parts = folderEntry.path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parentId = parentPath ? (pathToId.get(parentPath) ?? null) : null;

    const { data, error } = await db
      .from("ide_files")
      .insert({
        project_id,
        parent_id: parentId,
        name,
        type: "folder",
        content: null,
        language: null,
      })
      .select("id")
      .single();

    if (!error && data) {
      pathToId.set(folderEntry.path, data.id);
    }
  }

  // Insert files (fetch content in batches of 5 to avoid rate limiting)
  const fileInserts: {
    project_id: string;
    parent_id: string | null;
    name: string;
    type: "file";
    content: string;
    language: string;
    github_sha: string;
  }[] = [];

  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    await Promise.allSettled(
      batch.map(async (fileEntry) => {
        const parts = fileEntry.path.split("/");
        const name = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join("/");
        const parentId = parentPath ? (pathToId.get(parentPath) ?? null) : null;

        let content = "";
        try {
          const ghFile = await getFileContent(token, owner, repo, fileEntry.path);
          if (ghFile.encoding === "base64") {
            content = Buffer.from(ghFile.content.replace(/\n/g, ""), "base64").toString("utf8");
          }
        } catch {
          content = "// Failed to fetch file content from GitHub.";
        }

        fileInserts.push({
          project_id,
          parent_id: parentId,
          name,
          type: "file",
          content,
          language: guessLanguage(name),
          github_sha: fileEntry.sha,
        });
      })
    );
  }

  if (fileInserts.length > 0) {
    const { error: insertError } = await db.from("ide_files").insert(fileInserts);
    if (insertError) {
      console.error("[GitHub import] File insert error:", insertError.message);
      return errorResponse("Failed to import files.", 500);
    }
  }

  // Update project with repo info
  await db
    .from("ide_projects")
    .update({
      github_repo_full_name: repo_full_name,
      github_default_branch: targetBranch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", project_id);

  return NextResponse.json({
    imported: fileInserts.length,
    folders: sortedFolders.length,
    repo_full_name,
    branch: targetBranch,
  });
}
