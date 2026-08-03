-- =============================================================================
-- Tiliqua DBスキーマ（Phase 1）
-- Supabase project: tiliq-chat (ref: xewprddypddcxkwvcytu / ap-northeast-1)
-- 参照用ファイル。実際の適用は Supabase の migration 履歴（apply_migration）で管理。
-- SRS: docs/srs.md 3.5（データモデル）を、profiles / user_settings に分割して実装。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. コアテーブル: profiles / user_settings / rooms / room_members
-- -----------------------------------------------------------------------------

-- profiles: 全認証ユーザーが読める公開プロフィール情報
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9]{3,20}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 30)
);

-- user_settings: オーナーのみ読める非公開設定・認証情報
-- SRSのUser.emailはここに保持（auth.users.emailはMXバイパス用の内部ドメインアドレスの場合があるため別管理）
-- auth_scope_launch / auth_scope_hidden_list / auth_failed_attempts / auth_locked_until は
-- SRS FR-19/FR-20/3.8の要件を満たすためにSRSのUserモデルへ追加したカラム（要確認）
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  auth_type text check (auth_type in ('pin', 'key')),
  auth_secret text,
  auth_scope_launch boolean not null default false,
  auth_scope_hidden_list boolean not null default false,
  auth_failed_attempts integer not null default 0,
  auth_locked_until timestamptz,
  dm_from_stranger_enabled boolean not null default true,
  push_notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- rooms: DM・グループチャットの単位
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean not null default false,
  is_temporary boolean not null default false,
  expires_at timestamptz,
  lock_type text not null default 'none' check (lock_type in ('none', 'pin', 'key')),
  lock_secret text,
  created_at timestamptz not null default now()
);

-- room_members: ルームの参加者
create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index idx_room_members_user on public.room_members(user_id);


-- -----------------------------------------------------------------------------
-- 2. メッセージ関連: messages / message_hidden
-- -----------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  content text,
  image_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_or_image check (content is not null or image_url is not null)
);

create index idx_messages_room_created on public.messages(room_id, created_at desc);

create table public.message_hidden (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  unique (message_id, user_id)
);


-- -----------------------------------------------------------------------------
-- 3. ソーシャル機能: friendships / blocks / temp_chat_sessions
-- -----------------------------------------------------------------------------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  constraint no_self_friendship check (requester_id <> addressee_id)
);

create index idx_friendships_addressee on public.friendships(addressee_id);
create index idx_friendships_requester on public.friendships(requester_id);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index idx_blocks_blocker on public.blocks(blocker_id);

create table public.temp_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  closed_at timestamptz,
  unique (room_id, user_id)
);


-- -----------------------------------------------------------------------------
-- 4. RLSヘルパー関数
-- 自己参照テーブル（room_members等）のRLSで無限再帰を避けるため、
-- SECURITY DEFINER関数として切り出す（Supabase公式の定番パターン）。
-- 直接のRPC実行は authenticated ロールのみに制限（anon/publicへのEXECUTE権限は revoke 済み）。
-- -----------------------------------------------------------------------------

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_room_owner(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.is_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;


-- -----------------------------------------------------------------------------
-- 5. RLS有効化 + ポリシー
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_hidden enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.temp_chat_sessions enable row level security;

-- profiles: 全員読める、自分の分だけ更新可
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- user_settings: 自分の分だけ読み書き可
create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using (user_id = auth.uid());

create policy "user_settings_update_own" on public.user_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- rooms: メンバーのみ閲覧、ログイン済みなら作成可、更新・削除はオーナーのみ
create policy "rooms_select_member" on public.rooms
  for select to authenticated using (public.is_room_member(id));

create policy "rooms_insert_authenticated" on public.rooms
  for insert to authenticated with check (auth.uid() is not null);

create policy "rooms_update_owner" on public.rooms
  for update to authenticated using (public.is_room_owner(id)) with check (public.is_room_owner(id));

create policy "rooms_delete_owner" on public.rooms
  for delete to authenticated using (public.is_room_owner(id));

-- room_members: メンバーのみ閲覧、追加は自分自身 or オーナー、更新はオーナーのみ、削除は自分 or オーナー
create policy "room_members_select_member" on public.room_members
  for select to authenticated using (public.is_room_member(room_id));

create policy "room_members_insert_self_or_owner" on public.room_members
  for insert to authenticated with check (
    user_id = auth.uid() or public.is_room_owner(room_id)
  );

create policy "room_members_update_owner" on public.room_members
  for update to authenticated using (public.is_room_owner(room_id)) with check (public.is_room_owner(room_id));

create policy "room_members_delete_self_or_owner" on public.room_members
  for delete to authenticated using (
    user_id = auth.uid() or public.is_room_owner(room_id)
  );

-- messages: 論理削除済みは誰にも見せない。送信はブロック関係が無い場合のみ。削除(deleted_at設定)は送信者のみ
create policy "messages_select_member_not_deleted" on public.messages
  for select to authenticated using (
    deleted_at is null and public.is_room_member(room_id)
  );

create policy "messages_insert_member_not_blocked" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and public.is_room_member(room_id)
    and not exists (
      select 1 from public.room_members rm
      where rm.room_id = messages.room_id
        and rm.user_id <> auth.uid()
        and public.is_blocked(auth.uid(), rm.user_id)
    )
  );

create policy "messages_update_own_delete_only" on public.messages
  for update to authenticated
  using (sender_id = auth.uid() and deleted_at is null)
  with check (sender_id = auth.uid());

-- message_hidden: 自分の非表示設定のみ読み書き可
create policy "message_hidden_select_own" on public.message_hidden
  for select to authenticated using (user_id = auth.uid());

create policy "message_hidden_insert_own" on public.message_hidden
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_room_member(m.room_id)
    )
  );

create policy "message_hidden_delete_own" on public.message_hidden
  for delete to authenticated using (user_id = auth.uid());

-- friendships: 当事者のみ閲覧・更新・削除可、申請作成はブロック関係が無い場合のみ
create policy "friendships_select_involved" on public.friendships
  for select to authenticated using (
    requester_id = auth.uid() or addressee_id = auth.uid()
  );

create policy "friendships_insert_requester" on public.friendships
  for insert to authenticated with check (
    requester_id = auth.uid()
    and not public.is_blocked(requester_id, addressee_id)
  );

create policy "friendships_update_involved" on public.friendships
  for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "friendships_delete_involved" on public.friendships
  for delete to authenticated using (
    requester_id = auth.uid() or addressee_id = auth.uid()
  );

-- blocks: ブロックした本人のみ閲覧・作成・削除可（ブロックされた側からは見えない）
create policy "blocks_select_own" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

create policy "blocks_insert_own" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());

create policy "blocks_delete_own" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- temp_chat_sessions: 自分の分のみ読み書き可
create policy "temp_chat_sessions_select_own" on public.temp_chat_sessions
  for select to authenticated using (user_id = auth.uid());

create policy "temp_chat_sessions_insert_own" on public.temp_chat_sessions
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_room_member(room_id)
  );

create policy "temp_chat_sessions_update_own" on public.temp_chat_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- 6. トリガー
-- -----------------------------------------------------------------------------

-- 新規ユーザー作成時に profiles / user_settings を自動生成
-- raw_user_meta_data に username / display_name / avatar_url / real_email を
-- 渡すこと（Phase 2の signUp 実装側で対応）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'New User'),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.user_settings (user_id, email)
  values (
    new.id,
    new.raw_user_meta_data->>'real_email'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create trigger set_friendships_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 7. service_role への権限付与
-- SQL Editor / migration API 経由で作成したテーブルはservice_roleへの権限が
-- 自動付与されないため明示的に実行（過去プロジェクトからの学び）。
-- -----------------------------------------------------------------------------

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;


-- -----------------------------------------------------------------------------
-- 8. セキュリティ強化（Supabase Advisorの指摘への対応）
-- -----------------------------------------------------------------------------

-- RLSヘルパー関数への直接RPC実行権限を authenticated のみに限定
revoke execute on function public.is_room_member(uuid) from public;
revoke execute on function public.is_room_owner(uuid) from public;
revoke execute on function public.is_blocked(uuid, uuid) from public;
revoke execute on function public.handle_new_user() from public;

grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_room_owner(uuid) to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
