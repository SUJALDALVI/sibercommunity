/**
 * POST /api/execute
 * Headers: Authorization: Bearer <supabase_access_token>
 * Body: { community_id, code, language_id }
 *
 * Secure server-side proxy to a self-hosted Judge0 CE instance.
 * User code is NEVER executed on this Next.js server — it is forwarded
 * to Judge0 via a server-to-server call.
 *
 * Security:
 * - Authenticates the Supabase user
 * - Verifies community membership + IDE goal
 * - Only allows a whitelist of language IDs
 * - Enforces input size limits
 * - Enforces execution time/memory limits
 * - Rate-limits per user (10 submissions per minute)
 * - Never exposes JUDGE0_URL to the client
 *
 * If JUDGE0_URL is not set, returns 503 with a clear message.
 */

import { type NextRequest, NextResponse } from "next/server";
import { authenticateCommunityMember, errorResponse } from "@/lib/ide/serverAuth";

/* ── Constants ─────────────────────────────────────────────────── */
const MAX_CODE_BYTES = 65_536;    // 64 KB source code limit
const MAX_STDIN_BYTES = 4_096;    // 4 KB stdin limit
const MAX_OUTPUT_CHARS = 16_384;  // 16 KB output truncation
const EXECUTION_TIME_LIMIT = 10;  // seconds
const MEMORY_LIMIT_KB = 128_000;  // 128 MB
const JUDGE0_POLL_INTERVAL_MS = 600;
const JUDGE0_MAX_POLLS = 20;      // 20 × 600ms = 12s max wait

/**
 * Judge0 language IDs for the approved subset.
 * https://ce.judge0.com/languages/
 */
const ALLOWED_LANGUAGES: Record<string, number> = {
  javascript: 93,  // Node.js 18
  typescript: 94,  // TypeScript 5 (via ts-node)
  python: 71,      // Python 3.11
  go: 95,          // Go 1.21
  java: 62,        // Java 17
  c: 50,           // C (GCC 9.2.0)
  cpp: 54,         // C++ 17 (GCC 9.2.0)
};

/* ── Simple in-memory rate limiter ─────────────────────────────── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

/* ── Types ──────────────────────────────────────────────────────── */
type ExecuteBody = {
  community_id?: unknown;
  code?: unknown;
  language?: unknown;
  stdin?: unknown;
};

type Judge0Submission = {
  token: string;
};

type Judge0Status = {
  id: number;
  description: string;
};

type Judge0Result = {
  status: Judge0Status;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  exit_code: number | null;
};

/* ── Handler ─────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  // 1. Parse body early so we have community_id for auth check
  let body: ExecuteBody;
  try {
    body = (await request.json()) as ExecuteBody;
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { community_id, code, language, stdin } = body;

  if (typeof community_id !== "string" || !community_id) {
    return errorResponse("community_id is required.", 400);
  }

  // 2. Check Judge0 is configured
  const judge0Url = process.env.JUDGE0_URL;
  if (!judge0Url) {
    return NextResponse.json(
      {
        error: "Code execution is not configured.",
        configured: false,
      },
      { status: 503 }
    );
  }

  // 3. Authenticate + community check
  const auth = await authenticateCommunityMember(request, community_id);
  if (!auth.ok) return auth.response;

  // 4. Rate limit
  if (!checkRateLimit(auth.userId)) {
    return errorResponse("Too many execution requests. Please wait a minute.", 429);
  }

  // 5. Validate language
  if (typeof language !== "string" || !ALLOWED_LANGUAGES[language.toLowerCase()]) {
    return errorResponse(
      `Language '${String(language)}' is not supported. Allowed: ${Object.keys(ALLOWED_LANGUAGES).join(", ")}`,
      400
    );
  }
  const languageId = ALLOWED_LANGUAGES[language.toLowerCase()];

  // 6. Validate code
  if (typeof code !== "string") {
    return errorResponse("code must be a string.", 400);
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return errorResponse(`Code exceeds ${MAX_CODE_BYTES / 1024} KB limit.`, 413);
  }

  // 7. Validate stdin
  const stdinValue = typeof stdin === "string" ? stdin : "";
  if (Buffer.byteLength(stdinValue, "utf8") > MAX_STDIN_BYTES) {
    return errorResponse(`Stdin exceeds ${MAX_STDIN_BYTES / 1024} KB limit.`, 413);
  }

  // 8. Submit to Judge0
  const judge0Base = judge0Url.replace(/\/$/, "");
  let submissionToken: string;

  try {
    const submitRes = await fetch(`${judge0Base}/submissions?base64_encoded=true&wait=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language_id: languageId,
        source_code: Buffer.from(code, "utf8").toString("base64"),
        stdin: Buffer.from(stdinValue, "utf8").toString("base64"),
        cpu_time_limit: EXECUTION_TIME_LIMIT,
        memory_limit: MEMORY_LIMIT_KB,
        enable_network: false,
      }),
    });

    if (!submitRes.ok) {
      console.error("[Execute] Judge0 submit failed:", submitRes.status);
      return errorResponse("Execution service returned an error.", 502);
    }

    const submission = (await submitRes.json()) as Judge0Submission;
    if (!submission.token) {
      return errorResponse("Execution service returned no token.", 502);
    }
    submissionToken = submission.token;
  } catch (err) {
    console.error("[Execute] Judge0 unreachable:", err instanceof Error ? err.message : "unknown");
    return errorResponse("Execution service is unreachable.", 502);
  }

  // 9. Poll for result
  let result: Judge0Result | null = null;
  for (let i = 0; i < JUDGE0_MAX_POLLS; i++) {
    await new Promise((res) => setTimeout(res, JUDGE0_POLL_INTERVAL_MS));
    try {
      const pollRes = await fetch(
        `${judge0Base}/submissions/${submissionToken}?base64_encoded=true&fields=status,stdout,stderr,compile_output,message,time,memory,exit_code`,
        { headers: { Accept: "application/json" } }
      );
      if (!pollRes.ok) continue;
      result = (await pollRes.json()) as Judge0Result;

      // Status IDs: 1=In Queue, 2=Processing, 3+=done
      if (result.status.id >= 3) break;
    } catch {
      // Transient poll error — keep retrying
    }
  }

  if (!result) {
    return errorResponse("Execution timed out waiting for result.", 504);
  }

  // 10. Decode base64 outputs and truncate
  function decodeB64(val: string | null): string {
    if (!val) return "";
    try {
      const decoded = Buffer.from(val, "base64").toString("utf8");
      return decoded.length > MAX_OUTPUT_CHARS
        ? decoded.slice(0, MAX_OUTPUT_CHARS) + "\n[output truncated]"
        : decoded;
    } catch {
      return val;
    }
  }

  const stdout = decodeB64(result.stdout);
  const stderr = decodeB64(result.stderr);
  const compileOutput = decodeB64(result.compile_output);

  return NextResponse.json({
    status: result.status,
    stdout,
    stderr,
    compile_output: compileOutput,
    time: result.time,
    memory: result.memory,
    exit_code: result.exit_code,
  });
}
