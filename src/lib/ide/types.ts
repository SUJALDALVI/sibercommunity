/**
 * Shared types for Siber Cloud IDE.
 * Safe to import in both server and client code — contains no secrets.
 */

export type IDEProject = {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  github_repo_full_name: string | null; // e.g. "owner/repo"
  github_default_branch: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type IDEFile = {
  id: string;
  project_id: string;
  parent_id: string | null; // null = root
  name: string;
  type: "file" | "folder";
  content: string | null; // null for folders
  language: string | null; // monaco language id
  github_sha: string | null; // last committed SHA
  created_at: string;
  updated_at: string;
};

/** Lightweight tree node used in client-side file explorer */
export type FileNode = {
  id: string;
  parent_id: string | null;
  name: string;
  type: "file" | "folder";
  language: string | null;
  children?: FileNode[];
};

/** GitHub repo as returned by /api/github/repos */
export type GitHubRepo = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string | null;
  language: string | null;
};

/** GitHub connection status as returned by /api/github/status */
export type GitHubConnectionStatus = {
  connected: boolean;
  github_login: string | null;
};

/** IDE goals that enable the Cloud IDE */
export const IDE_GOALS = ["Coding", "Application Development"] as const;
export type IDEGoal = (typeof IDE_GOALS)[number];

export function isIDECommunity(goal: string | null | undefined): goal is IDEGoal {
  if (!goal) return false;
  return (IDE_GOALS as readonly string[]).includes(goal.trim());
}
