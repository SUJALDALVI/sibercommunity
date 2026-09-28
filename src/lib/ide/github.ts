/**
 * Server-only GitHub App helpers.
 *
 * This file MUST only be imported in API routes (src/app/api/...) or
 * server components. It reads GITHUB_* env vars which are NOT prefixed
 * NEXT_PUBLIC_ and must never reach the browser bundle.
 *
 * SECURITY NOTES:
 * - GitHub App private key is read from env, never logged or returned.
 * - User access tokens are encrypted with IDE_TOKEN_SECRET before storage.
 * - The encryption key (IDE_TOKEN_SECRET) is server-only, 32+ random bytes.
 * - If IDE_TOKEN_SECRET is absent, token storage is refused at runtime.
 */

import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/* ── Constants ─────────────────────────────────────────────────── */
const GITHUB_API = "https://api.github.com";
const ENCRYPTION_ALGO = "aes-256-cbc";
const IV_LENGTH = 16;

/* ── Env helpers (server-only) ─────────────────────────────────── */
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required server env var: ${name}`);
  return val;
}

/** Returns the GitHub App client ID (used to build OAuth URL). */
export function getGitHubClientId(): string {
  return requireEnv("GITHUB_CLIENT_ID");
}

/** Returns the GitHub App client secret (used for token exchange only). */
function getGitHubClientSecret(): string {
  return requireEnv("GITHUB_CLIENT_SECRET");
}

/** Returns the server-only token encryption key. */
function getTokenEncryptionKey(): Buffer {
  const secret = process.env.IDE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "IDE_TOKEN_SECRET must be set (32+ char random string) to store GitHub tokens securely."
    );
  }
  // Derive exactly 32 bytes (AES-256 key)
  return Buffer.from(secret.slice(0, 32), "utf8");
}

/* ── Token encryption/decryption ────────────────────────────────── */
export function encryptToken(plaintext: string): string {
  const key = getTokenEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(ciphertext: string): string {
  const key = getTokenEncryptionKey();
  const [ivHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !encryptedHex) throw new Error("Invalid encrypted token format.");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(ENCRYPTION_ALGO, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/* ── Supabase service-role client (server-only) ──────────────────── */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service-role credentials are not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ── GitHub token exchange (OAuth callback) ──────────────────────── */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type: string;
  scope: string;
}> {
  const clientId = getGitHubClientId();
  const clientSecret = getGitHubClientSecret();

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    token_type?: string;
    scope?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "GitHub token exchange returned no token.");
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type ?? "bearer",
    scope: data.scope ?? "",
  };
}

/* ── Store/retrieve user GitHub tokens ──────────────────────────── */
export async function storeUserGitHubToken(
  supabaseUserId: string,
  accessToken: string,
  githubLogin: string
): Promise<void> {
  const db = getServiceClient();
  const encrypted = encryptToken(accessToken);

  const { error } = await db.from("github_connections").upsert(
    {
      user_id: supabaseUserId,
      encrypted_token: encrypted,
      github_login: githubLogin,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(`Failed to store GitHub token: ${error.message}`);
}

export async function getUserGitHubToken(supabaseUserId: string): Promise<string | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("github_connections")
    .select("encrypted_token")
    .eq("user_id", supabaseUserId)
    .maybeSingle();

  if (error || !data?.encrypted_token) return null;
  try {
    return decryptToken(data.encrypted_token);
  } catch {
    return null;
  }
}

export async function getUserGitHubLogin(supabaseUserId: string): Promise<string | null> {
  const db = getServiceClient();
  const { data } = await db
    .from("github_connections")
    .select("github_login")
    .eq("user_id", supabaseUserId)
    .maybeSingle();
  return data?.github_login ?? null;
}

/* ── GitHub API helpers ─────────────────────────────────────────── */
async function githubFetch<T>(
  path: string,
  token: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${path} returned ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/** Get the authenticated GitHub user's login name. */
export async function getGitHubUser(token: string): Promise<{ login: string; avatar_url: string }> {
  return githubFetch<{ login: string; avatar_url: string }>("/user", token);
}

/** List repositories accessible to the user (up to 100, sorted by updated). */
export async function listUserRepos(
  token: string
): Promise<
  {
    id: number;
    full_name: string;
    name: string;
    private: boolean;
    default_branch: string;
    description: string | null;
    updated_at: string | null;
    language: string | null;
  }[]
> {
  return githubFetch(
    "/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member",
    token
  );
}

/** Fetch the full git tree of a repo (recursive). */
export async function getRepoTree(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{
  sha: string;
  tree: { path: string; type: string; sha: string; size?: number }[];
  truncated: boolean;
}> {
  const branchData = await githubFetch<{ commit: { sha: string } }>(
    `/repos/${owner}/${repo}/branches/${branch}`,
    token
  );
  const treeSha = branchData.commit.sha;
  return githubFetch(
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    token
  );
}

/** Fetch a single file's content from GitHub (returns base64 encoded). */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<{ content: string; sha: string; encoding: string }> {
  return githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token);
}

/** Create or update a file in GitHub via the Contents API. */
export async function putFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  message: string,
  content: string, // base64 encoded
  sha: string | null // null = create, string = update
): Promise<{ content: { sha: string }; commit: { sha: string } }> {
  const body: Record<string, string> = { message, content };
  if (sha) body.sha = sha;

  return githubFetch(
    `/repos/${owner}/${repo}/contents/${path}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
}
