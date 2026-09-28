/**
 * Supabase helpers for IDE projects and files.
 * Used in both server API routes and client components.
 * Client-side calls use the anon key (RLS enforced).
 * Server-side calls in API routes use a per-request Supabase client
 * with the user's Bearer token.
 */

import { supabase } from "@/lib/supabase/supabase";
import type { IDEProject, IDEFile, FileNode } from "@/lib/ide/types";

/* ── Client-side helpers (anon key + RLS) ───────────────────────── */

/** Get or create an IDE project for a community. Returns existing or new. */
export async function getOrCreateProject(communityId: string): Promise<IDEProject> {
  // Try fetching existing first
  const { data: existing, error: fetchError } = await supabase
    .from("ide_projects")
    .select("*")
    .eq("community_id", communityId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (existing) return existing as IDEProject;

  // Create new project
  const { data: created, error: createError } = await supabase
    .from("ide_projects")
    .insert({ community_id: communityId })
    .select("*")
    .single();

  if (createError) throw new Error(createError.message);
  return created as IDEProject;
}

/** Fetch all files/folders for a project. */
export async function fetchProjectFiles(projectId: string): Promise<IDEFile[]> {
  const { data, error } = await supabase
    .from("ide_files")
    .select("*")
    .eq("project_id", projectId)
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as IDEFile[];
}

/** Build a tree structure from a flat file list. */
export function buildFileTree(files: IDEFile[]): FileNode[] {
  const nodeMap = new Map<string, FileNode>();
  const roots: FileNode[] = [];

  for (const f of files) {
    nodeMap.set(f.id, {
      id: f.id,
      parent_id: f.parent_id,
      name: f.name,
      type: f.type,
      language: f.language,
      children: f.type === "folder" ? [] : undefined,
    });
  }

  for (const node of nodeMap.values()) {
    if (node.parent_id === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parent_id);
      if (parent?.children) {
        parent.children.push(node);
      } else {
        // Orphan — add to root
        roots.push(node);
      }
    }
  }

  // Sort: folders first, then alpha
  function sortNodes(nodes: FileNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  }
  sortNodes(roots);

  return roots;
}

/** Create a file or folder. */
export async function createFile(
  projectId: string,
  parentId: string | null,
  name: string,
  type: "file" | "folder",
  language: string | null = null
): Promise<IDEFile> {
  const { data, error } = await supabase
    .from("ide_files")
    .insert({
      project_id: projectId,
      parent_id: parentId,
      name,
      type,
      content: type === "file" ? "" : null,
      language: type === "file" ? (language ?? guessLanguage(name)) : null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as IDEFile;
}

/** Update file content (autosave). */
export async function saveFileContent(
  fileId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from("ide_files")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", fileId);

  if (error) throw new Error(error.message);
}

/** Rename a file or folder. */
export async function renameFile(fileId: string, newName: string): Promise<void> {
  const { error } = await supabase
    .from("ide_files")
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq("id", fileId);

  if (error) throw new Error(error.message);
}

/** Delete a file or folder (cascade handled by DB). */
export async function deleteFile(fileId: string): Promise<void> {
  const { error } = await supabase.from("ide_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
}

/** Update github_sha on a file after a successful commit. */
export async function updateFileSha(fileId: string, sha: string): Promise<void> {
  const { error } = await supabase
    .from("ide_files")
    .update({ github_sha: sha, updated_at: new Date().toISOString() })
    .eq("id", fileId);
  if (error) throw new Error(error.message);
}

/** Update project GitHub metadata after import/link. */
export async function updateProjectGitHub(
  projectId: string,
  repoFullName: string,
  defaultBranch: string
): Promise<void> {
  const { error } = await supabase
    .from("ide_projects")
    .update({
      github_repo_full_name: repoFullName,
      github_default_branch: defaultBranch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

/* ── Language detection ────────────────────────────────────────── */
const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "csharp",
  rs: "rust",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  xml: "xml",
  svg: "xml",
  txt: "plaintext",
  env: "plaintext",
  gitignore: "plaintext",
  dockerfile: "dockerfile",
};

export function guessLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === ".env" || lower.startsWith(".env.")) return "plaintext";
  const ext = lower.split(".").pop() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}
