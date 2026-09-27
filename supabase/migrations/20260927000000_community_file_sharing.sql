alter table public.community_messages
  add column if not exists message_type text not null default 'text' check (message_type in ('text', 'file')),
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists storage_path text,
  add column if not exists uploaded_at timestamptz;

create index if not exists community_messages_message_type_idx
  on public.community_messages (community_id, message_type, created_at desc);

-- Enforce metadata only for file messages while leaving existing text messages valid.
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
    )
  );

-- Reuse the existing private community-files bucket or create it if absent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-files',
  'community-files',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do nothing;

-- Only members of the community can read files from that community's folder.
drop policy if exists "Community members can read community files" on storage.objects;
create policy "Community members can read community files"
on storage.objects
for select
using (
  bucket_id = 'community-files'
  and auth.uid() is not null
  and exists (
    select 1
    from public.community_members cm
    where cm.user_id = auth.uid()
      and cm.community_id::text = split_part(name, '/', 1)
  )
);

-- Members may upload files only into their own community folder.
drop policy if exists "Community members can upload community files" on storage.objects;
create policy "Community members can upload community files"
on storage.objects
for insert
with check (
  bucket_id = 'community-files'
  and auth.uid() is not null
  and owner = auth.uid()
  and exists (
    select 1
    from public.community_members cm
    where cm.user_id = auth.uid()
      and cm.community_id::text = split_part(name, '/', 1)
  )
);

-- Allow the file owner or community admin/owner to remove uploaded files.
drop policy if exists "Community admins can delete community files" on storage.objects;
create policy "Community admins can delete community files"
on storage.objects
for delete
using (
  bucket_id = 'community-files'
  and auth.uid() is not null
  and (
    owner = auth.uid()
    or exists (
      select 1
      from public.community_members cm
      where cm.user_id = auth.uid()
        and cm.community_id::text = split_part(name, '/', 1)
        and cm.role in ('owner', 'admin')
    )
  )
);

-- Preserve the original membership-only insert check while adding the file-message validation.
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
    )
  )
);
