/**
 * GET /api/github/status
 * Headers: Authorization: Bearer <supabase_access_token>
 *
 * Returns whether the authenticated user has connected GitHub,
 * and their GitHub login if so.
 * Never returns the stored token.
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest, errorResponse } from "@/lib/ide/serverAuth";
import { getUserGitHubLogin } from "@/lib/ide/github";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const login = await getUserGitHubLogin(auth.userId);

  return NextResponse.json({
    connected: login !== null,
    github_login: login,
  });
}

/**
 * DELETE /api/github/status
 * Removes the user's GitHub connection.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  // Use service role to delete the connection row
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return errorResponse("Service not configured.", 503);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await db
    .from("github_connections")
    .delete()
    .eq("user_id", auth.userId);

  if (error) return errorResponse("Failed to disconnect GitHub.", 500);

  return NextResponse.json({ disconnected: true });
}
