-- =============================================================================
-- Siber Cloud IDE — Database Migration
-- Creates three new tables for IDE functionality:
--   1. github_connections  — per-user encrypted GitHub OAuth tokens
--   2. ide_projects        — one project per community
--   3. ide_files           — virtual file system entries
--
-- Follows existing naming conventions and RLS patterns used in the project.
-- Does NOT modify any existing tables.
-- =============================================================================

-- ─── 1. github_connections ───────────────────────────────────────────────────
-- Stores one encrypted GitHub OAuth access token per Siber user.
-- The encrypted_token is AES-256-CBC encrypted server-side using
-- IDE_TOKEN_SECRET. RLS ensures users cannot read other users' rows.
-- The service role key (never exposed to clients) is used for writes.

CREATE TABLE IF NOT EXISTS public.github_connections (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_login    TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

-- RLS: users can only see their own connection status (not the encrypted token directly)
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "github_connections: users can read own row"
  ON public.github_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Writes are handled exclusively by the service role (server-side API routes).
-- No INSERT/UPDATE/DELETE policies for authenticated users intentionally.

-- ─── 2. ide_projects ─────────────────────────────────────────────────────────
-- One IDE project per community. Stores project metadata and optional
-- GitHub repo linkage.

CREATE TABLE IF NOT EXISTS public.ide_projects (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id            UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name                    TEXT        NOT NULL DEFAULT 'My Project',
  description             TEXT,
  github_repo_full_name   TEXT,         -- e.g. 'owner/repo'
  github_default_branch   TEXT,         -- e.g. 'main'
  created_by              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id)                -- one project per community
);

ALTER TABLE public.ide_projects ENABLE ROW LEVEL SECURITY;

-- Community members can read their community's project
CREATE POLICY "ide_projects: members can read"
  ON public.ide_projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = ide_projects.community_id
        AND cm.user_id = auth.uid()
    )
  );

-- Any community member can create a project (only one allowed due to UNIQUE)
CREATE POLICY "ide_projects: members can insert"
  ON public.ide_projects
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = ide_projects.community_id
        AND cm.user_id = auth.uid()
    )
  );

-- Only the project creator can update
CREATE POLICY "ide_projects: creator can update"
  ON public.ide_projects
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- ─── 3. ide_files ────────────────────────────────────────────────────────────
-- Virtual file system. Each row is a file or folder within an ide_project.
-- parent_id = NULL means root-level entry.
-- Folder deletions cascade via application logic (or can be handled by trigger).

CREATE TABLE IF NOT EXISTS public.ide_files (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID        NOT NULL REFERENCES public.ide_projects(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES public.ide_files(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('file', 'folder')),
  content     TEXT,                   -- NULL for folders
  language    TEXT,                   -- Monaco language id (e.g. 'typescript')
  github_sha  TEXT,                   -- Last committed SHA from GitHub Contents API
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enforce unique names within the same parent (NULL parent = root)
  CONSTRAINT ide_files_unique_name_in_parent
    UNIQUE NULLS NOT DISTINCT (project_id, parent_id, name)
);

-- Index for fast listing by project
CREATE INDEX IF NOT EXISTS idx_ide_files_project_id ON public.ide_files (project_id);
CREATE INDEX IF NOT EXISTS idx_ide_files_parent_id  ON public.ide_files (parent_id);

ALTER TABLE public.ide_files ENABLE ROW LEVEL SECURITY;

-- Community members can read files (via project → community membership)
CREATE POLICY "ide_files: members can read"
  ON public.ide_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.ide_projects p
      JOIN public.community_members cm ON cm.community_id = p.community_id
      WHERE p.id = ide_files.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- Community members can insert files into any project in their community
CREATE POLICY "ide_files: members can insert"
  ON public.ide_files
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ide_projects p
      JOIN public.community_members cm ON cm.community_id = p.community_id
      WHERE p.id = ide_files.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- Community members can update files (autosave, rename)
CREATE POLICY "ide_files: members can update"
  ON public.ide_files
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.ide_projects p
      JOIN public.community_members cm ON cm.community_id = p.community_id
      WHERE p.id = ide_files.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- Community members can delete files
CREATE POLICY "ide_files: members can delete"
  ON public.ide_files
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.ide_projects p
      JOIN public.community_members cm ON cm.community_id = p.community_id
      WHERE p.id = ide_files.project_id
        AND cm.user_id = auth.uid()
    )
  );
