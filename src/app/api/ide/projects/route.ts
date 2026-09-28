/**
 * GET  /api/ide/projects?community_id=<id>   → get or create project
 * PATCH /api/ide/projects                    → update project metadata
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateCommunityMember, errorResponse } from "@/lib/ide/serverAuth";

export async function GET(request: NextRequest) {
  const communityId = request.nextUrl.searchParams.get("community_id");
  if (!communityId) return errorResponse("community_id is required.", 400);

  const auth = await authenticateCommunityMember(request, communityId);
  if (!auth.ok) return auth.response;

  // Fetch existing project
  const { data: existing } = await auth.supabase
    .from("ide_projects")
    .select("*")
    .eq("community_id", communityId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ project: existing });
  }

  // Create project (created_by = authenticated user)
  const { data: created, error } = await auth.supabase
    .from("ide_projects")
    .insert({ community_id: communityId, created_by: auth.userId })
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ project: created });
}

export async function PATCH(request: NextRequest) {
  let body: { community_id?: unknown; project_id?: unknown; name?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { community_id, project_id, name, description } = body;
  if (typeof community_id !== "string") return errorResponse("community_id is required.", 400);
  if (typeof project_id !== "string") return errorResponse("project_id is required.", 400);

  const auth = await authenticateCommunityMember(request, community_id);
  if (!auth.ok) return auth.response;

  // Verify user is project creator
  const { data: project } = await auth.supabase
    .from("ide_projects")
    .select("created_by")
    .eq("id", project_id)
    .eq("community_id", community_id)
    .maybeSingle();

  if (!project) return errorResponse("Project not found.", 404);
  if (project.created_by !== auth.userId) {
    return errorResponse("Only the project creator can update project details.", 403);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof name === "string" && name.trim()) updates.name = name.trim().slice(0, 100);
  if (typeof description === "string") updates.description = description.slice(0, 500);

  const { data, error } = await auth.supabase
    .from("ide_projects")
    .update(updates)
    .eq("id", project_id)
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);
  return NextResponse.json({ project: data });
}
