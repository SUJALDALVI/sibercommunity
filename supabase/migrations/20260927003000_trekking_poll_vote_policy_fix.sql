-- Fix the recursive self-reference in the poll vote insert policy.
-- The one-vote-per-user rule is already enforced by the unique index on (poll_id, user_id),
-- so the policy only needs to validate membership and option ownership without scanning the same table.

-- Replace only the vote insert policy to avoid the infinite recursion caused by the previous
-- self-referential NOT EXISTS subquery on community_poll_votes.
drop policy if exists "Members can vote once per poll" on public.community_poll_votes;

create policy "Members can vote once per poll"
on public.community_poll_votes
for insert
with check (
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
