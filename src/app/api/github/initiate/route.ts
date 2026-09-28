/**
 * POST /api/github/initiate
 * Headers: Authorization: Bearer <supabase_access_token>
 * Body: { community_id }
 *
 * Creates a signed OAuth state embedding the authenticated userId and
 * communityId, then returns the GitHub authorization URL.
 *
 * The state is HMAC-SHA256 signed with IDE_TOKEN_SECRET so the callback
 * can verify it without trusting untrusted browser input.
 *
 * Returns: { auth_url: string }
 *
 * SERVER-ONLY: reads GITHUB_CLIENT_ID and IDE_TOKEN_SECRET.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { authenticateRequest, errorResponse } from "@/lib/ide/serverAuth";
import { getGitHubClientId } from "@/lib/ide/github";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  let body: { community_id?: unknown };
  try {
    body = (await request.json()) as { community_id?: unknown };
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { community_id } = body;
  if (typeof community_id !== "string" || !community_id) {
    return errorResponse("community_id is required.", 400);
  }

  let clientId: string;
  try {
    clientId = getGitHubClientId();
  } catch {
    return errorResponse("GitHub integration is not configured.", 503);
  }

  const tokenSecret = process.env.IDE_TOKEN_SECRET;
  if (!tokenSecret || tokenSecret.length < 32) {
    return errorResponse("IDE_TOKEN_SECRET is not configured.", 503);
  }

  // Build state payload: userId + communityId + nonce
  const nonce = randomBytes(16).toString("hex");
  const payload = JSON.stringify({
    userId: auth.userId,
    communityId: community_id,
    nonce,
    iat: Math.floor(Date.now() / 1000),
  });

  // Sign with HMAC-SHA256 so the callback can verify it
  const sig = createHmac("sha256", tokenSecret).update(payload).digest("hex");
  const stateParam = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", "repo,read:user");
  authUrl.searchParams.set("state", stateParam);

  return NextResponse.json({ auth_url: authUrl.toString() });
}
