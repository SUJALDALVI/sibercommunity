/**
 * GET /api/github/callback?code=<code>&state=<state>
 *
 * GitHub OAuth callback. Verifies the HMAC-signed state (created by
 * /api/github/initiate), extracts userId + communityId, exchanges the
 * authorization code for an access token, encrypts and stores it, then
 * redirects to the community IDE page.
 *
 * The state was signed server-side with IDE_TOKEN_SECRET — we never
 * read browser cookies or trust unverified URL parameters for identity.
 *
 * SERVER-ONLY: uses GITHUB_CLIENT_SECRET and IDE_TOKEN_SECRET.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  exchangeCodeForToken,
  getGitHubUser,
  storeUserGitHubToken,
} from "@/lib/ide/github";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const MAX_STATE_AGE_SECONDS = 600; // 10 minutes

function errorPage(communityId: string | null, message: string): NextResponse {
  // If we know the community, send back to IDE with error param
  const dest = communityId
    ? new URL(`/community/${communityId}/ide`, BASE_URL)
    : new URL("/dashboard", BASE_URL);
  dest.searchParams.set("github_error", message);
  return NextResponse.redirect(dest.toString());
}

type StatePayload = {
  userId: string;
  communityId: string;
  nonce: string;
  iat: number;
};

function verifyState(stateParam: string): StatePayload {
  const tokenSecret = process.env.IDE_TOKEN_SECRET;
  if (!tokenSecret || tokenSecret.length < 32) {
    throw new Error("IDE_TOKEN_SECRET is not configured.");
  }

  // Decode the outer envelope
  const envelope = JSON.parse(
    Buffer.from(stateParam, "base64url").toString("utf8")
  ) as { payload: string; sig: string };

  if (!envelope.payload || !envelope.sig) {
    throw new Error("Malformed state parameter.");
  }

  // Verify HMAC signature (constant-time comparison)
  const expectedSig = createHmac("sha256", tokenSecret)
    .update(envelope.payload)
    .digest("hex");

  const sigBuf = Buffer.from(envelope.sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("State signature verification failed.");
  }

  // Parse inner payload
  const payload = JSON.parse(envelope.payload) as StatePayload;

  if (!payload.userId || !payload.communityId || !payload.iat) {
    throw new Error("Invalid state payload.");
  }

  // Check age
  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  if (ageSeconds > MAX_STATE_AGE_SECONDS) {
    throw new Error("State expired. Please try connecting again.");
  }

  return payload;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return errorPage(null, "GitHub authorization was cancelled or returned an invalid response.");
  }

  // Verify signed state and extract userId + communityId
  let statePayload: StatePayload;
  try {
    statePayload = verifyState(state);
  } catch (err) {
    console.error("[GitHub callback] State verification failed:", err instanceof Error ? err.message : "unknown");
    return errorPage(null, "Invalid OAuth state. Please try connecting again.");
  }

  const { userId, communityId } = statePayload;

  // Exchange code for GitHub access token (server-side only)
  let githubToken: string;
  let githubLogin: string;
  try {
    const tokenData = await exchangeCodeForToken(code);
    githubToken = tokenData.access_token;
    const ghUser = await getGitHubUser(githubToken);
    githubLogin = ghUser.login;
  } catch (err) {
    console.error("[GitHub callback] Token exchange failed:", err instanceof Error ? err.message : "unknown");
    return errorPage(communityId, "Failed to connect GitHub. Please try again.");
  }

  // Encrypt and store the token
  try {
    await storeUserGitHubToken(userId, githubToken, githubLogin);
  } catch (err) {
    console.error("[GitHub callback] Token storage failed:", err instanceof Error ? err.message : "unknown");
    return errorPage(communityId, "Failed to save GitHub connection. Ensure IDE_TOKEN_SECRET is configured.");
  }

  // Redirect back to the community IDE page
  const redirectUrl = new URL(`/community/${communityId}/ide`, BASE_URL);
  redirectUrl.searchParams.set("github_connected", "1");
  return NextResponse.redirect(redirectUrl.toString());
}
