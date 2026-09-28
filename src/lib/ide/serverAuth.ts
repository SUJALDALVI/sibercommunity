/**
 * Shared server-side auth helper for IDE API routes.
 *
 * Authenticates the Supabase user from the Bearer token,
 * verifies community membership, and verifies the community
 * goal is Coding or Application Development.
 *
 * SERVER-ONLY — never import in client components.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { isIDECommunity } from "@/lib/ide/types";

export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type AuthResult =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/** Authenticates via Bearer token. Returns userId + scoped Supabase client. */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return { ok: false, response: errorResponse("Authentication required.", 401) };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, response: errorResponse("Service not configured.", 503) };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: errorResponse("Authentication required.", 401) };
  }

  return { ok: true, userId: data.user.id, supabase };
}

type CommunityAuthResult =
  | { ok: true; userId: string; supabase: SupabaseClient; communityId: string }
  | { ok: false; response: NextResponse };

/**
 * Authenticates the request AND verifies the user is a member of communityId
 * AND that the community goal is Coding or Application Development.
 */
export async function authenticateCommunityMember(
  request: NextRequest,
  communityId: string
): Promise<CommunityAuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;

  // Verify community goal
  const { data: community, error: commErr } = await auth.supabase
    .from("communities")
    .select("id, goal")
    .eq("id", communityId)
    .maybeSingle();

  if (commErr || !community) {
    return { ok: false, response: errorResponse("Community not found.", 404) };
  }

  if (!isIDECommunity(community.goal)) {
    return {
      ok: false,
      response: errorResponse(
        "Cloud IDE is only available for Coding and Application Development communities.",
        403
      ),
    };
  }

  // Verify membership
  const { data: membership, error: memErr } = await auth.supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (memErr || !membership) {
    return {
      ok: false,
      response: errorResponse("You are not a member of this community.", 403),
    };
  }

  return { ok: true, userId: auth.userId, supabase: auth.supabase, communityId };
}
