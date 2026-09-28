/**
 * POST /api/github/commit
 * Headers: Authorization: Bearer <supabase_access_token>
 * Body: { community_id, project_id, file_id, message? }
 *
 * Commits the current content of a single IDE file to GitHub.
 * Uses the GitHub Contents API (create or update).
 * Returns the new github_sha for the file.
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateCommunityMember, errorResponse } from "@/lib/ide/serverAuth";
import { getUserGitHubToken, putFileContent } from "@/lib/ide/github";
import { createClient } from "@supabase/supabase-js";

type CommitBody = {
  community_id?: unknown;
  project_id?: unknown;
  file_id?: unknown;
  message?: unknown;
};

export async function POST(request: NextRequest) {
  let body: CommitBody;
  try {
    body = (await request.json()) as CommitBody;
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { community_id, project_id, file_id, message } = body;

  if (typeof community_id !== "string" || !community_id) {
    return errorResponse("community_id is required.", 400);
  }
  if (typeof project_id !== "string" || !project_id) {
    return errorResponse("project_id is required.", 400);
  }
  if (typeof file_id !== "string" || !file_id) {
    return errorResponse("file_id is required.", 400);
  }

  const commitMessage =
    typeof message === "string" && message.trim()
      ? message.trim().slice(0, 256)
      : "Update from Siber IDE";

  const auth = await authenticateCommunityMember(request, community_id);
  if (!auth.ok) return auth.response;

  // Fetch project
  const { data: project, error: projErr } = await auth.supabase
    .from("ide_projects")
    .select("id, created_by, community_id, github_repo_full_name, github_default_branch")
    .eq("id", project_id)
    .eq("community_id", community_id)
    .maybeSingle();

  if (projErr || !project) {
    return errorResponse("Project not found.", 404);
  }
  if (!project.github_repo_full_name) {
    return errorResponse("This project is not linked to a GitHub repository.", 422);
  }

  // Fetch the file
  const { data: file, error: fileErr } = await auth.supabase
    .from("ide_files")
    .select("id, project_id, name, type, content, github_sha")
    .eq("id", file_id)
    .eq("project_id", project_id)
    .maybeSingle();

  if (fileErr || !file) {
    return errorResponse("File not found.", 404);
  }
  if (file.type === "folder") {
    return errorResponse("Cannot commit a folder directly.", 400);
  }

  const token = await getUserGitHubToken(auth.userId);
  if (!token) {
    return errorResponse("GitHub is not connected.", 403);
  }

  // Build the GitHub path for the file by walking up parent chain
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse("Service not configured.", 503);
  }

  // Resolve full file path by walking parent chain
  const db = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: request.headers.get("authorization") ?? "" } },
  });

  async function buildFilePath(currentFileId: string): Promise<string> {
    const { data: f } = await db
      .from("ide_files")
      .select("name, parent_id")
      .eq("id", currentFileId)
      .single();
    if (!f) return "";
    if (!f.parent_id) return f.name;
    const parentPath = await buildFilePath(f.parent_id);
    return parentPath ? `${parentPath}/${f.name}` : f.name;
  }

  const filePath = await buildFilePath(file_id);
  if (!filePath) {
    return errorResponse("Could not resolve file path.", 500);
  }

  const [owner, repo] = project.github_repo_full_name.split("/");

  // Encode content as base64
  const contentBase64 = Buffer.from((file.content as string) ?? "", "utf8").toString("base64");

  try {
    const result = await putFileContent(
      token,
      owner,
      repo,
      filePath,
      commitMessage,
      contentBase64,
      (file.github_sha as string | null) ?? null
    );

    const newSha = result.content.sha;

    // Update github_sha in our DB (use service role to bypass RLS for update)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const serviceDb = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await serviceDb
        .from("ide_files")
        .update({ github_sha: newSha, updated_at: new Date().toISOString() })
        .eq("id", file_id);
    }

    return NextResponse.json({
      committed: true,
      file_path: filePath,
      github_sha: newSha,
      commit_sha: result.commit.sha,
    });
  } catch (err) {
    console.error(
      "[GitHub commit] Push failed:",
      err instanceof Error ? err.message : "unknown"
    );
    return errorResponse("Failed to commit file to GitHub.", 502);
  }
}
