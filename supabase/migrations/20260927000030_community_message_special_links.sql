-- Add the missing special-message link columns only.
-- This is a follow-up migration for a DB that already has the earlier file-sharing schema in place.

alter table public.community_messages
  add column if not exists poll_id uuid references public.community_polls (id) on delete set null,
  add column if not exists checklist_id uuid references public.community_checklists (id) on delete set null;

create index if not exists community_messages_poll_id_idx
  on public.community_messages (poll_id);

create index if not exists community_messages_checklist_id_idx
  on public.community_messages (checklist_id);

-- Keep the existing file-sharing schema intact, but allow poll/checklist special messages too.
alter table public.community_messages
  drop constraint if exists community_messages_file_message_check;

alter table public.community_messages
  add constraint community_messages_file_message_check
  check (
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
      message_type in ('poll', 'checklist')
      and char_length(content) > 0
      and char_length(content) <= 2000
      and file_name is null
      and file_size is null
      and mime_type is null
      and storage_path is null
      and (
        (message_type = 'poll' and poll_id is not null and checklist_id is null)
        or (message_type = 'checklist' and checklist_id is not null and poll_id is null)
      )
    )
  );
