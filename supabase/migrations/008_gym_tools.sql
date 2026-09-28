-- ============================================================
-- 008_gym_tools.sql  — Gym Community Tools
-- All tables are scoped by (community_id, user_id).
-- Only communities with goal = 'Gym' use these tables.
-- ============================================================

-- ── Gym fitness profile (per user per community) ──────────────
create table if not exists public.gym_profiles (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  user_id       uuid not null,
  weight_unit   text not null default 'kg' check (weight_unit in ('kg', 'lbs')),
  height_cm     numeric(5,1),
  current_weight numeric(6,2),
  target_weight  numeric(6,2),
  fitness_goal  text default 'general',
  daily_water_target_ml integer not null default 2500,
  weekly_workout_target  integer not null default 4,
  daily_calories_target  integer,
  daily_protein_target   numeric(6,1),
  daily_carbs_target     numeric(6,1),
  daily_fat_target       numeric(6,1),
  competition_opted_in   boolean not null default false,
  admin_report_consent   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (community_id, user_id)
);

create index if not exists gym_profiles_community_user_idx on public.gym_profiles(community_id, user_id);
alter table public.gym_profiles enable row level security;

drop policy if exists "Members manage own gym profile" on public.gym_profiles;
create policy "Members manage own gym profile"
  on public.gym_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins read consented gym profiles" on public.gym_profiles;
create policy "Admins read consented gym profiles"
  on public.gym_profiles for select
  using (
    admin_report_consent = true
    and exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_profiles.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  );

-- ── Weight entries ────────────────────────────────────────────
create table if not exists public.gym_weight_entries (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  user_id       uuid not null,
  entry_date    date not null,
  weight_value  numeric(6,2) not null check (weight_value > 0),
  weight_unit   text not null default 'kg' check (weight_unit in ('kg','lbs')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (community_id, user_id, entry_date)
);

create index if not exists gym_weight_entries_user_date_idx on public.gym_weight_entries(community_id, user_id, entry_date desc);
alter table public.gym_weight_entries enable row level security;

drop policy if exists "Members manage own weight entries" on public.gym_weight_entries;
create policy "Members manage own weight entries"
  on public.gym_weight_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins read consented weight entries" on public.gym_weight_entries;
create policy "Admins read consented weight entries"
  on public.gym_weight_entries for select
  using (
    exists (
      select 1 from public.gym_profiles gp
      where gp.community_id = gym_weight_entries.community_id
        and gp.user_id = gym_weight_entries.user_id
        and gp.admin_report_consent = true
    )
    and exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_weight_entries.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  );

-- ── Meal logs ─────────────────────────────────────────────────
create table if not exists public.gym_meal_logs (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  user_id       uuid not null,
  log_date      date not null,
  meal_type     text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  food_name     text not null,
  serving_size  numeric(8,2) not null default 100,
  serving_unit  text not null default 'g',
  calories      numeric(8,2),
  protein_g     numeric(8,2),
  carbs_g       numeric(8,2),
  fat_g         numeric(8,2),
  fiber_g       numeric(8,2),
  fdc_id        text,
  data_source   text default 'manual',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gym_meal_logs_user_date_idx on public.gym_meal_logs(community_id, user_id, log_date desc);
alter table public.gym_meal_logs enable row level security;

drop policy if exists "Members manage own meal logs" on public.gym_meal_logs;
create policy "Members manage own meal logs"
  on public.gym_meal_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins read consented meal logs" on public.gym_meal_logs;
create policy "Admins read consented meal logs"
  on public.gym_meal_logs for select
  using (
    exists (
      select 1 from public.gym_profiles gp
      where gp.community_id = gym_meal_logs.community_id
        and gp.user_id = gym_meal_logs.user_id
        and gp.admin_report_consent = true
    )
    and exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_meal_logs.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  );

-- ── Gym attendance ────────────────────────────────────────────
create table if not exists public.gym_attendance (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities(id) on delete cascade,
  user_id         uuid not null,
  attendance_date date not null,
  duration_min    integer check (duration_min >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (community_id, user_id, attendance_date)
);

create index if not exists gym_attendance_user_date_idx on public.gym_attendance(community_id, user_id, attendance_date desc);
alter table public.gym_attendance enable row level security;

drop policy if exists "Members manage own attendance" on public.gym_attendance;
create policy "Members manage own attendance"
  on public.gym_attendance for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins read attendance for leaderboard" on public.gym_attendance;
create policy "Admins read attendance for leaderboard"
  on public.gym_attendance for select
  using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_attendance.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  );

drop policy if exists "Opted-in members visible for leaderboard" on public.gym_attendance;
create policy "Opted-in members visible for leaderboard"
  on public.gym_attendance for select
  using (
    exists (
      select 1 from public.gym_profiles gp
      where gp.community_id = gym_attendance.community_id
        and gp.user_id = gym_attendance.user_id
        and gp.competition_opted_in = true
    )
    and exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_attendance.community_id
        and cm.user_id = auth.uid()
    )
  );

-- ── Water intake ──────────────────────────────────────────────
create table if not exists public.gym_water_logs (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  user_id       uuid not null,
  log_date      date not null,
  amount_ml     integer not null check (amount_ml > 0),
  logged_at     timestamptz not null default now(),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists gym_water_logs_user_date_idx on public.gym_water_logs(community_id, user_id, log_date desc);
alter table public.gym_water_logs enable row level security;

drop policy if exists "Members manage own water logs" on public.gym_water_logs;
create policy "Members manage own water logs"
  on public.gym_water_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Workout sessions ──────────────────────────────────────────
create table if not exists public.gym_workout_sessions (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities(id) on delete cascade,
  user_id         uuid not null,
  session_date    date not null,
  workout_type    text not null default 'general',
  duration_min    integer check (duration_min >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists gym_workout_sessions_user_date_idx on public.gym_workout_sessions(community_id, user_id, session_date desc);
alter table public.gym_workout_sessions enable row level security;

drop policy if exists "Members manage own workout sessions" on public.gym_workout_sessions;
create policy "Members manage own workout sessions"
  on public.gym_workout_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Opted-in workout sessions visible for leaderboard" on public.gym_workout_sessions;
create policy "Opted-in workout sessions visible for leaderboard"
  on public.gym_workout_sessions for select
  using (
    exists (
      select 1 from public.gym_profiles gp
      where gp.community_id = gym_workout_sessions.community_id
        and gp.user_id = gym_workout_sessions.user_id
        and gp.competition_opted_in = true
    )
    and exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_workout_sessions.community_id
        and cm.user_id = auth.uid()
    )
  );

-- ── Workout exercises (per session) ──────────────────────────
create table if not exists public.gym_workout_exercises (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.gym_workout_sessions(id) on delete cascade,
  exercise_name   text not null,
  sets            integer check (sets >= 0),
  reps            integer check (reps >= 0),
  weight_kg       numeric(7,2) check (weight_kg >= 0),
  duration_min    integer check (duration_min >= 0),
  distance_km     numeric(7,3) check (distance_km >= 0),
  notes           text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists gym_workout_exercises_session_idx on public.gym_workout_exercises(session_id);
alter table public.gym_workout_exercises enable row level security;

drop policy if exists "Members manage own exercises" on public.gym_workout_exercises;
create policy "Members manage own exercises"
  on public.gym_workout_exercises for all
  using (
    exists (
      select 1 from public.gym_workout_sessions ws
      where ws.id = gym_workout_exercises.session_id
        and ws.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.gym_workout_sessions ws
      where ws.id = gym_workout_exercises.session_id
        and ws.user_id = auth.uid()
    )
  );

-- ── Community challenges ──────────────────────────────────────
create table if not exists public.gym_challenges (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  created_by    uuid not null,
  title         text not null,
  description   text,
  challenge_type text not null check (challenge_type in ('attendance','workout_count','streak','duration','community')),
  target_value  integer not null check (target_value > 0),
  start_date    date not null,
  end_date      date not null check (end_date >= start_date),
  is_published  boolean not null default false,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gym_challenges_community_idx on public.gym_challenges(community_id, start_date desc);
alter table public.gym_challenges enable row level security;

drop policy if exists "Members read published challenges" on public.gym_challenges;
create policy "Members read published challenges"
  on public.gym_challenges for select
  using (
    (is_published = true or created_by = auth.uid())
    and exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_challenges.community_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Admins manage challenges" on public.gym_challenges;
create policy "Admins manage challenges"
  on public.gym_challenges for all
  using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_challenges.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = gym_challenges.community_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  );

-- ── Challenge participants ────────────────────────────────────
create table if not exists public.gym_challenge_participants (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.gym_challenges(id) on delete cascade,
  user_id       uuid not null,
  joined_at     timestamptz not null default now(),
  progress      integer not null default 0,
  completed     boolean not null default false,
  completed_at  timestamptz,
  unique (challenge_id, user_id)
);

create index if not exists gym_challenge_participants_challenge_idx on public.gym_challenge_participants(challenge_id);
alter table public.gym_challenge_participants enable row level security;

drop policy if exists "Members manage own challenge participation" on public.gym_challenge_participants;
create policy "Members manage own challenge participation"
  on public.gym_challenge_participants for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Members read all participants of joined challenges" on public.gym_challenge_participants;
create policy "Members read all participants of joined challenges"
  on public.gym_challenge_participants for select
  using (
    exists (
      select 1 from public.gym_challenge_participants me
      where me.challenge_id = gym_challenge_participants.challenge_id
        and me.user_id = auth.uid()
    )
    or exists (
      select 1 from public.community_members cm
      join public.gym_challenges gc on gc.id = gym_challenge_participants.challenge_id
      where gc.community_id = cm.community_id and cm.user_id = auth.uid() and cm.role in ('owner','admin')
    )
  );

-- ── Updated_at triggers ────────────────────────────────────────
create or replace function public.handle_updated_at_generic()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'gym_profiles_updated_at') then
    create trigger gym_profiles_updated_at before update on public.gym_profiles for each row execute function public.handle_updated_at_generic();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gym_weight_entries_updated_at') then
    create trigger gym_weight_entries_updated_at before update on public.gym_weight_entries for each row execute function public.handle_updated_at_generic();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gym_meal_logs_updated_at') then
    create trigger gym_meal_logs_updated_at before update on public.gym_meal_logs for each row execute function public.handle_updated_at_generic();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gym_attendance_updated_at') then
    create trigger gym_attendance_updated_at before update on public.gym_attendance for each row execute function public.handle_updated_at_generic();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gym_workout_sessions_updated_at') then
    create trigger gym_workout_sessions_updated_at before update on public.gym_workout_sessions for each row execute function public.handle_updated_at_generic();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gym_challenges_updated_at') then
    create trigger gym_challenges_updated_at before update on public.gym_challenges for each row execute function public.handle_updated_at_generic();
  end if;
end $$;
