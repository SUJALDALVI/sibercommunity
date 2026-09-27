create table if not exists public.community_polls (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  question text not null check (char_length(question) > 0 and char_length(question) <= 250),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.community_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  option_text text not null check (char_length(option_text) > 0 and char_length(option_text) <= 200),
  created_at timestamptz not null default now(),
  unique (poll_id, option_text)
);

create table if not exists public.community_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  option_id uuid not null references public.community_poll_options (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

create index if not exists community_polls_community_id_idx
  on public.community_polls (community_id, created_at desc);

create index if not exists community_poll_options_poll_id_idx
  on public.community_poll_options (poll_id);

create index if not exists community_poll_votes_poll_id_idx
  on public.community_poll_votes (poll_id, option_id);

create table if not exists public.community_checklists (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null check (char_length(title) > 0 and char_length(title) <= 200),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.community_checklists (id) on delete cascade,
  item_text text not null check (char_length(item_text) > 0 and char_length(item_text) <= 200),
  created_by uuid not null,
  completed boolean not null default false,
  completed_by uuid,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (checklist_id, sort_order)
);

create index if not exists community_checklists_community_id_idx
  on public.community_checklists (community_id, created_at desc);

create index if not exists community_checklist_items_checklist_id_idx
  on public.community_checklist_items (checklist_id, sort_order);

create table if not exists public.community_locations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  created_by uuid not null,
  name text not null check (char_length(name) > 0 and char_length(name) <= 200),
  description text,
  latitude double precision not null,
  longitude double precision not null,
  location_type text not null check (location_type in ('start','checkpoint','campsite','water','viewpoint','danger','destination','other')),
  created_at timestamptz not null default now()
);

create index if not exists community_locations_community_id_idx
  on public.community_locations (community_id, created_at desc);

alter table public.community_polls enable row level security;
alter table public.community_poll_options enable row level security;
alter table public.community_poll_votes enable row level security;
alter table public.community_checklists enable row level security;
alter table public.community_checklist_items enable row level security;
alter table public.community_locations enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_polls'
      AND policyname = 'Members can view community polls'
  ) THEN
    CREATE POLICY "Members can view community polls"
    ON public.community_polls
    FOR SELECT
    USING (
      auth.uid() is not null and exists (
        select 1 from public.community_members cm
        where cm.community_id = community_polls.community_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_polls'
      AND policyname = 'Members can create community polls'
  ) THEN
    CREATE POLICY "Members can create community polls"
    ON public.community_polls
    FOR INSERT
    WITH CHECK (
      auth.uid() is not null
      and created_by = auth.uid()
      and exists (
        select 1 from public.community_members cm
        where cm.community_id = community_polls.community_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_polls'
      AND policyname = 'Creators and admins can update community polls'
  ) THEN
    CREATE POLICY "Creators and admins can update community polls"
    ON public.community_polls
    FOR UPDATE
    USING (
      auth.uid() is not null and (
        created_by = auth.uid() or exists (
          select 1
          from public.community_members cm
          where cm.community_id = community_polls.community_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner','admin')
        )
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_poll_options'
      AND policyname = 'Members can view poll options'
  ) THEN
    CREATE POLICY "Members can view poll options"
    ON public.community_poll_options
    FOR SELECT
    USING (
      auth.uid() is not null and exists (
        select 1
        from public.community_polls cp
        join public.community_members cm
          on cm.community_id = cp.community_id
        where cp.id = community_poll_options.poll_id
          and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_poll_options'
      AND policyname = 'Members can create poll options'
  ) THEN
    CREATE POLICY "Members can create poll options"
    ON public.community_poll_options
    FOR INSERT
    WITH CHECK (
      auth.uid() is not null and exists (
        select 1
        from public.community_polls cp
        join public.community_members cm
          on cm.community_id = cp.community_id
        where cp.id = community_poll_options.poll_id
          and cp.created_by = auth.uid()
          and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_poll_votes'
      AND policyname = 'Members can view poll votes'
  ) THEN
    CREATE POLICY "Members can view poll votes"
    ON public.community_poll_votes
    FOR SELECT
    USING (
      auth.uid() is not null and exists (
        select 1
        from public.community_polls cp
        join public.community_members cm
          on cm.community_id = cp.community_id
        where cp.id = community_poll_votes.poll_id
          and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_poll_votes'
      AND policyname = 'Members can vote once per poll'
  ) THEN
    CREATE POLICY "Members can vote once per poll"
    ON public.community_poll_votes
    FOR INSERT
    WITH CHECK (
      auth.uid() is not null
      and user_id = auth.uid()
      and exists (
        select 1
        from public.community_poll_options cpo
        join public.community_polls cp on cp.id = cpo.poll_id
        join public.community_members cm on cm.community_id = cp.community_id
        where cpo.id = community_poll_votes.option_id
          and cp.id = community_poll_votes.poll_id
          and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_checklists'
      AND policyname = 'Members can view community checklists'
  ) THEN
    CREATE POLICY "Members can view community checklists"
    ON public.community_checklists
    FOR SELECT
    USING (
      auth.uid() is not null and exists (
        select 1 from public.community_members cm
        where cm.community_id = community_checklists.community_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_checklists'
      AND policyname = 'Members can create checklists'
  ) THEN
    CREATE POLICY "Members can create checklists"
    ON public.community_checklists
    FOR INSERT
    WITH CHECK (
      auth.uid() is not null
      and created_by = auth.uid()
      and exists (
        select 1 from public.community_members cm
        where cm.community_id = community_checklists.community_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_checklists'
      AND policyname = 'Checklist creators and admins can update delete checklists'
  ) THEN
    CREATE POLICY "Checklist creators and admins can update delete checklists"
    ON public.community_checklists
    FOR UPDATE
    USING (
      auth.uid() is not null and (
        created_by = auth.uid() or exists (
          select 1
          from public.community_members cm
          where cm.community_id = community_checklists.community_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner','admin')
        )
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_checklist_items'
      AND policyname = 'Members can view checklist items'
  ) THEN
    CREATE POLICY "Members can view checklist items"
    ON public.community_checklist_items
    FOR SELECT
    USING (
      auth.uid() is not null and exists (
        select 1
        from public.community_checklists cc
        join public.community_members cm on cm.community_id = cc.community_id
        where cc.id = community_checklist_items.checklist_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_checklist_items'
      AND policyname = 'Members can create checklist items'
  ) THEN
    CREATE POLICY "Members can create checklist items"
    ON public.community_checklist_items
    FOR INSERT
    WITH CHECK (
      auth.uid() is not null
      and created_by = auth.uid()
      and exists (
        select 1
        from public.community_checklists cc
        join public.community_members cm on cm.community_id = cc.community_id
        where cc.id = community_checklist_items.checklist_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_checklist_items'
      AND policyname = 'Members can update checklist items they created or admins can update any'
  ) THEN
    CREATE POLICY "Members can update checklist items they created or admins can update any"
    ON public.community_checklist_items
    FOR UPDATE
    USING (
      auth.uid() is not null and (
        created_by = auth.uid() or exists (
          select 1
          from public.community_checklists cc
          join public.community_members cm on cm.community_id = cc.community_id
          where cc.id = community_checklist_items.checklist_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner','admin')
        )
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_checklist_items'
      AND policyname = 'Checklist item creators and admins can delete items'
  ) THEN
    CREATE POLICY "Checklist item creators and admins can delete items"
    ON public.community_checklist_items
    FOR DELETE
    USING (
      auth.uid() is not null and (
        created_by = auth.uid() or exists (
          select 1
          from public.community_checklists cc
          join public.community_members cm on cm.community_id = cc.community_id
          where cc.id = community_checklist_items.checklist_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner','admin')
        )
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_locations'
      AND policyname = 'Members can view community locations'
  ) THEN
    CREATE POLICY "Members can view community locations"
    ON public.community_locations
    FOR SELECT
    USING (
      auth.uid() is not null and exists (
        select 1 from public.community_members cm
        where cm.community_id = community_locations.community_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_locations'
      AND policyname = 'Members can create community locations'
  ) THEN
    CREATE POLICY "Members can create community locations"
    ON public.community_locations
    FOR INSERT
    WITH CHECK (
      auth.uid() is not null
      and created_by = auth.uid()
      and exists (
        select 1 from public.community_members cm
        where cm.community_id = community_locations.community_id and cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_locations'
      AND policyname = 'Location creators and admins can update locations'
  ) THEN
    CREATE POLICY "Location creators and admins can update locations"
    ON public.community_locations
    FOR UPDATE
    USING (
      auth.uid() is not null and (
        created_by = auth.uid() or exists (
          select 1
          from public.community_members cm
          where cm.community_id = community_locations.community_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner','admin')
        )
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_locations'
      AND policyname = 'Location creators and admins can delete locations'
  ) THEN
    CREATE POLICY "Location creators and admins can delete locations"
    ON public.community_locations
    FOR DELETE
    USING (
      auth.uid() is not null and (
        created_by = auth.uid() or exists (
          select 1
          from public.community_members cm
          where cm.community_id = community_locations.community_id
            and cm.user_id = auth.uid()
            and cm.role in ('owner','admin')
        )
      )
    );
  END IF;
END $$;
