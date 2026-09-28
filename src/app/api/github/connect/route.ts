/**
 * GET /api/github/connect?community_id=<id>
 *
 * Builds a GitHub OAuth authorization URL and redirects the user.
 * The community_id is carried through the OAuth state parameter so
 * the callback knows where to send the user back.
 *
 * SERVER-ONLY: reads GITHUB_CLIENT_ID from env. Never exposed to browser.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getGitHubClientId } from "@/lib/ide/github";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  const communityId = request.nextUrl.searchParams.get("community_id");
  if (!communityId) {
    return NextResponse.json({ error: "community_id is required." }, { status: 400 });
  }

  let clientId: string;
  try {
    clientId = getGitHubClientId();
  } catch {
    return NextResponse.json({ error: "GitHub integration is not configured." }, { status: 503 });
  }

  // Encode communityId in the state param (opaque to GitHub)
  const statePayload = Buffer.from(
    JSON.stringify({ communityId, nonce: randomBytes(8).toString("hex") })
  ).toString("base64url");

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", "repo,read:user");
  authUrl.searchParams.set("state", statePayload);

  return NextResponse.redirect(authUrl.toString());
}
