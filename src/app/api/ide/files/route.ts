/**
 * IDE Files API
 *
 * GET    /api/ide/files?project_id=<id>&community_id=<id>         → list all files
 * POST   /api/ide/files                                           → create file/folder
 * PATCH  /api/ide/files                                           → rename or save content
 * DELETE /api/ide/files?file_id=<id>&community_id=<id>&project_id=<id> → delete
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateCommunityMember, errorResponse } from "@/lib/ide/serverAuth";
import { guessLanguage } from "@/lib/ide/projects";

const MAX_CONTENT_BYTES = 1_000_000; // 1 MB per file

/* ── GET ────────────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("project_id");
  const communityId = searchParams.get("community_id");

  if (!projectId || !communityId) {
    return errorResponse("project_id and community_id are required.", 400);
  }

  const auth = await authenticateCommunityMember(request, communityId);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("ide_files")
    .select("*")
    .eq("project_id", projectId)
    .order("name");

  if (error) return errorResponse(error.message, 500);
  return NextResponse.json({ files: data ?? [] });
}

/* ── POST ───────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  let body: {
    community_id?: unknown;
    project_id?: unknown;
    parent_id?: unknown;
    name?: unknown;
    type?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { community_id, project_id, parent_id, name, type } = body;

  if (typeof community_id !== "string") return errorResponse("community_id is required.", 400);
  if (typeof project_id !== "string") return errorResponse("project_id is required.", 400);
  if (typeof name !== "string" || !name.trim()) return errorResponse("name is required.", 400);
  if (type !== "file" && type !== "folder") return errorResponse("type must be 'file' or 'folder'.", 400);

  // Validate name — no path separators
  const cleanName = name.trim();
  if (cleanName.includes("/") || cleanName.includes("\\") || cleanName === "..") {
    return errorResponse("Invalid file name.", 400);
  }

  const auth = await authenticateCommunityMember(request, community_id);
  if (!auth.ok) return auth.response;

  // Verify project belongs to this community
  const { data: project } = await auth.supabase
    .from("ide_projects")
    .select("id")
    .eq("id", project_id)
    .eq("community_id", community_id)
    .maybeSingle();

  if (!project) return errorResponse("Project not found.", 404);

  const { data, error } = await auth.supabase
    .from("ide_files")
    .insert({
      project_id,
      parent_id: typeof parent_id === "string" ? parent_id : null,
      name: cleanName,
      type,
      content: type === "file" ? "" : null,
      language: type === "file" ? guessLanguage(cleanName) : null,
    })
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);
  return NextResponse.json({ file: data }, { status: 201 });
}

/* ── PATCH ──────────────────────────────────────────────────────── */
export async function PATCH(request: NextRequest) {
  let body: {
    community_id?: unknown;
    project_id?: unknown;
    file_id?: unknown;
    name?: unknown;
    content?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { community_id, project_id, file_id, name, content } = body;

  if (typeof community_id !== "string") return errorResponse("community_id is required.", 400);
  if (typeof project_id !== "string") return errorResponse("project_id is required.", 400);
  if (typeof file_id !== "string") return errorResponse("file_id is required.", 400);

  const auth = await authenticateCommunityMember(request, community_id);
  if (!auth.ok) return auth.response;

  // Verify file belongs to project in this community
  const { data: file } = await auth.supabase
    .from("ide_files")
    .select("id, type, project_id")
    .eq("id", file_id)
    .eq("project_id", project_id)
    .maybeSingle();

  if (!file) return errorResponse("File not found.", 404);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof name === "string" && name.trim()) {
    const cleanName = name.trim();
    if (cleanName.includes("/") || cleanName.includes("\\")) {
      return errorResponse("Invalid file name.", 400);
    }
    updates.name = cleanName;
    if (file.type === "file") {
      updates.language = guessLanguage(cleanName);
    }
  }

  if (typeof content === "string") {
    if (file.type === "folder") {
      return errorResponse("Cannot set content on a folder.", 400);
    }
    if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
      return errorResponse("File content exceeds 1 MB limit.", 413);
    }
    updates.content = content;
  }

  const { data, error } = await auth.supabase
    .from("ide_files")
    .update(updates)
    .eq("id", file_id)
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);
  return NextResponse.json({ file: data });
}

/* ── DELETE ─────────────────────────────────────────────────────── */
export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const fileId = searchParams.get("file_id");
  const communityId = searchParams.get("community_id");
  const projectId = searchParams.get("project_id");

  if (!fileId || !communityId || !projectId) {
    return errorResponse("file_id, community_id, and project_id are required.", 400);
  }

  const auth = await authenticateCommunityMember(request, communityId);
  if (!auth.ok) return auth.response;

  // Verify ownership
  const { data: file } = await auth.supabase
    .from("ide_files")
    .select("id, project_id")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!file) return errorResponse("File not found.", 404);

  const { error } = await auth.supabase.from("ide_files").delete().eq("id", fileId);
  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ deleted: true });
}
