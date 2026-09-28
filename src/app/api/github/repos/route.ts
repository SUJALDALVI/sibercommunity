/**
 * GET /api/github/repos?community_id=<id>
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Returns the list of GitHub repos accessible to the authenticated user.
 * Requires community membership + IDE goal (Coding / Application Development).
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateCommunityMember, errorResponse } from "@/lib/ide/serverAuth";
import { getUserGitHubToken, listUserRepos } from "@/lib/ide/github";

export async function GET(request: NextRequest) {
  const communityId = request.nextUrl.searchParams.get("community_id");
  if (!communityId) {
    return errorResponse("community_id is required.", 400);
  }

  const auth = await authenticateCommunityMember(request, communityId);
  if (!auth.ok) return auth.response;

  const token = await getUserGitHubToken(auth.userId);
  if (!token) {
    return NextResponse.json({ connected: false, repos: [] });
  }

  try {
    const repos = await listUserRepos(token);
    return NextResponse.json({
      connected: true,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        name: r.name,
        private: r.private,
        default_branch: r.default_branch,
        description: r.description,
        updated_at: r.updated_at,
        language: r.language,
      })),
    });
  } catch (err) {
    console.error("[GitHub repos] Failed to list repos:", err instanceof Error ? err.message : "unknown");
    return errorResponse("Failed to fetch repositories from GitHub.", 502);
  }
}
