-- Safe, additive repair for community_messages inserts used by Trekking poll/checklist chat cards.
-- This preserves the existing text/file message permissions while allowing only valid
-- special poll/checklist messages that reference records in the same community.

-- The DB must also accept poll/checklist message types; otherwise the insert fails before RLS checks.
alter table public.community_messages
  drop constraint if exists community_messages_message_type_check;

alter table public.community_messages
  add constraint community_messages_message_type_check
  check (message_type in ('text', 'file', 'poll', 'checklist'));

-- Replace only the relevant insert policy, keeping the rest of the chat rules intact.
drop policy if exists "Members can insert community messages" on public.community_messages;

create policy "Members can insert community messages"
on public.community_messages
for insert
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and exists (
    select 1 from public.community_members cm
    where cm.community_id = community_messages.community_id
      and cm.user_id = auth.uid()
  )
  and (
    (
      message_type = 'text'
      and char_length(content) > 0
      and char_length(content) <= 2000
      and file_name is null
      and file_size is null
      and mime_type is null
      and storage_path is null
      and poll_id is null
      and checklist_id is null
    )
    or (
      message_type = 'file'
      and char_length(content) > 0
      and char_length(content) <= 2000
      and file_name is not null
      and file_size > 0
      and file_size <= 20971520
      and mime_type is not null
      and storage_path is not null
      and split_part(storage_path, '/', 1) = community_id::text
      and split_part(storage_path, '/', 2) = 'chat'
      and split_part(storage_path, '/', 3) = user_id::text
      and length(split_part(storage_path, '/', 4)) > 0
      and poll_id is null
      and checklist_id is null
    )
    or (
      message_type = 'poll'
      and char_length(content) > 0
      and char_length(content) <= 2000
      and file_name is null
      and file_size is null
      and mime_type is null
      and storage_path is null
      and poll_id is not null
      and checklist_id is null
      and exists (
        select 1
        from public.community_polls cp
        where cp.id = community_messages.poll_id
          and cp.community_id = community_messages.community_id
      )
    )
    or (
      message_type = 'checklist'
      and char_length(content) > 0
      and char_length(content) <= 2000
      and file_name is null
      and file_size is null
      and mime_type is null
      and storage_path is null
      and checklist_id is not null
      and poll_id is null
      and exists (
        select 1
        from public.community_checklists cc
        where cc.id = community_messages.checklist_id
          and cc.community_id = community_messages.community_id
      )
    )
  )
);
