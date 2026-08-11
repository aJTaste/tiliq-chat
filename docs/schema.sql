-- =============================================================================
-- Tiliqua DBスキーマ（Phase 1〜5）
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

-- =============================================================================
-- Phase 3: DM開始用RPC関数
-- rooms + room_members への複数INSERTをアトミックに行い、
-- 既存DMがあればそれを返す（重複DMルーム防止）。
-- is_room_member/is_room_owner等と同じSECURITY DEFINERパターンを踏襲。
-- =============================================================================

create or replace function public.get_or_create_dm_room(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if v_self = p_other_user_id then
    raise exception 'cannot create DM room with self';
  end if;

  -- 相手ユーザーが実在するか確認
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'target user not found';
  end if;

  -- 相互ブロック関係があればDM開始不可（FR-23と整合。blocksテーブルはPhase 5まで空の想定）
  if public.is_blocked(v_self, p_other_user_id) then
    raise exception 'cannot start DM: blocked';
  end if;

  -- 既存のDM（is_group=false かつ両者がメンバー）を検索
  select rm1.room_id into v_room_id
  from public.room_members rm1
  join public.room_members rm2 on rm1.room_id = rm2.room_id
  join public.rooms r on r.id = rm1.room_id
  where rm1.user_id = v_self
    and rm2.user_id = p_other_user_id
    and r.is_group = false
  limit 1;

  if v_room_id is not null then
    return v_room_id;
  end if;

  -- 新規DMルーム作成
  insert into public.rooms (is_group) values (false)
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, role)
  values
    (v_room_id, v_self, 'owner'),
    (v_room_id, p_other_user_id, 'member');

  return v_room_id;
end;
$$;

-- 直接RPC実行はauthenticatedのみに限定（他のヘルパー関数と同じ方針）
revoke execute on function public.get_or_create_dm_room(uuid) from public;
grant execute on function public.get_or_create_dm_room(uuid) to authenticated;

-- =============================================================================
-- Phase 3: Realtime設定
-- postgres_changes購読（ChatRoom.tsxでのメッセージ受信）が機能するには、
-- 対象テーブルを supabase_realtime パブリケーションに追加する必要がある。
-- ダッシュボードの「Database → Publications」からトグルでも設定可能。
-- 注意：Supabaseダッシュボードの「Database → Replication」ページは
-- 物理レプリカ/分析パイプライン用に変わっており、Realtimeの設定場所ではない。
-- また "supabase_realtime_messages_publication" という別のパブリケーションが
-- 自動生成されているが、これはSupabase内部のrealtime.messages用であり無関係。
-- =============================================================================

alter publication supabase_realtime add table public.messages;
-- =============================================================================
-- Phase 5: フレンド・ストレンジャー・ブロック機能
-- SRS FR-11〜FR-13, FR-15, FR-22, FR-23 準拠
-- 適用済み（Supabase MCP: apply_migration "phase5_friends_strangers_blocking"）。
-- このファイルはdocs/schema.sqlの末尾にそのまま追記する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. get_or_create_dm_room の更新
-- 新規DM作成時のみ、相手の dm_from_stranger_enabled（FR-22）をチェックする。
-- 既存DMがある場合・フレンド同士の場合はチェック不要（既存の会話は継続可能）。
-- -----------------------------------------------------------------------------
create or replace function public.get_or_create_dm_room(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_self uuid := auth.uid();
  v_are_friends boolean;
  v_target_allows_strangers boolean;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if v_self = p_other_user_id then
    raise exception 'cannot create DM room with self';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'target user not found';
  end if;

  if public.is_blocked(v_self, p_other_user_id) then
    raise exception 'cannot start DM: blocked';
  end if;

  select rm1.room_id into v_room_id
  from public.room_members rm1
  join public.room_members rm2 on rm1.room_id = rm2.room_id
  join public.rooms r on r.id = rm1.room_id
  where rm1.user_id = v_self
    and rm2.user_id = p_other_user_id
    and r.is_group = false
  limit 1;

  if v_room_id is not null then
    return v_room_id;
  end if;

  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = v_self and addressee_id = p_other_user_id)
        or (requester_id = p_other_user_id and addressee_id = v_self))
  ) into v_are_friends;

  if not v_are_friends then
    select coalesce(dm_from_stranger_enabled, true) into v_target_allows_strangers
    from public.user_settings
    where user_id = p_other_user_id;

    if not coalesce(v_target_allows_strangers, true) then
      raise exception 'target user does not accept DMs from strangers';
    end if;
  end if;

  insert into public.rooms (is_group) values (false)
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, role)
  values
    (v_room_id, v_self, 'owner'),
    (v_room_id, p_other_user_id, 'member');

  return v_room_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. get_conversation_list
-- ホーム画面の「フレンド」「ストレンジャー」タブ用。
-- 自分が参加するDM（is_group=false）ルームを、相手のプロフィール・
-- フレンド状態・直近メッセージとともに1クエリで返す（旧fetchRoomListのN+1を解消）。
-- ブロック関係（双方向）にあるユーザーとの会話は一覧から除外する。
-- -----------------------------------------------------------------------------
create or replace function public.get_conversation_list()
returns table (
  room_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  friendship_status text,
  last_message_preview text,
  last_message_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with my_rooms as (
    select rm.room_id
    from public.room_members rm
    join public.rooms r on r.id = rm.room_id
    where rm.user_id = auth.uid() and r.is_group = false
  ),
  other as (
    select rm.room_id, rm.user_id as other_user_id
    from public.room_members rm
    where rm.room_id in (select room_id from my_rooms)
      and rm.user_id <> auth.uid()
  ),
  last_msg as (
    select distinct on (m.room_id)
      m.room_id, m.content, m.image_url, m.created_at
    from public.messages m
    where m.room_id in (select room_id from my_rooms)
      and m.deleted_at is null
    order by m.room_id, m.created_at desc
  ),
  fs as (
    select
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as counterpart_id,
      f.status,
      f.requester_id
    from public.friendships f
    where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  )
  select
    o.room_id,
    o.other_user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(
      case
        when fs.status = 'accepted' then 'accepted'
        when fs.status = 'pending' and fs.requester_id = auth.uid() then 'pending_sent'
        when fs.status = 'pending' then 'pending_received'
        when fs.status = 'rejected' then 'rejected'
      end,
      'none'
    ) as friendship_status,
    coalesce(lm.content, case when lm.image_url is not null then '📷 画像' else null end) as last_message_preview,
    lm.created_at as last_message_at
  from other o
  join public.profiles p on p.id = o.other_user_id
  left join last_msg lm on lm.room_id = o.room_id
  left join fs on fs.counterpart_id = o.other_user_id
  where not public.is_blocked(auth.uid(), o.other_user_id)
  order by lm.created_at desc nulls last
$$;

-- -----------------------------------------------------------------------------
-- 3. search_users
-- ユーザー追加UI（FR-15）用。ユーザーID(username)部分一致検索。
-- 自分自身・ブロック関係にあるユーザーは除外。
-- -----------------------------------------------------------------------------
create or replace function public.search_users(p_query text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  friendship_status text,
  existing_room_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  with fs as (
    select
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as counterpart_id,
      f.status,
      f.requester_id
    from public.friendships f
    where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  ),
  existing_dm as (
    select rm1.room_id, rm2.user_id as other_user_id
    from public.room_members rm1
    join public.room_members rm2 on rm1.room_id = rm2.room_id and rm2.user_id <> auth.uid()
    join public.rooms r on r.id = rm1.room_id and r.is_group = false
    where rm1.user_id = auth.uid()
  )
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(
      case
        when fs.status = 'accepted' then 'accepted'
        when fs.status = 'pending' and fs.requester_id = auth.uid() then 'pending_sent'
        when fs.status = 'pending' then 'pending_received'
        when fs.status = 'rejected' then 'rejected'
      end,
      'none'
    ) as friendship_status,
    ed.room_id as existing_room_id
  from public.profiles p
  left join fs on fs.counterpart_id = p.id
  left join existing_dm ed on ed.other_user_id = p.id
  where p.id <> auth.uid()
    and p_query is not null
    and length(trim(p_query)) > 0
    and p.username ilike ('%' || trim(p_query) || '%')
    and not public.is_blocked(auth.uid(), p.id)
  order by p.username
  limit 20
$$;

-- -----------------------------------------------------------------------------
-- 4. get_friend_requests
-- 送受信中（pending）・直近で拒否された（rejected）フレンド申請の一覧。
-- 受信分は承認・拒否UIに、送信分はステータス表示（簡易通知）に使う。
-- -----------------------------------------------------------------------------
create or replace function public.get_friend_requests()
returns table (
  friendship_id uuid,
  direction text,
  counterpart_id uuid,
  counterpart_username text,
  counterpart_display_name text,
  counterpart_avatar_url text,
  status text,
  is_read boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.id,
    case when f.addressee_id = auth.uid() then 'received' else 'sent' end,
    case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end,
    p.username,
    p.display_name,
    p.avatar_url,
    f.status,
    f.is_read,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end
  where (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and f.status in ('pending', 'rejected')
  order by f.created_at desc
$$;

-- -----------------------------------------------------------------------------
-- 5. フレンド申請の操作系RPC
-- -----------------------------------------------------------------------------
create or replace function public.send_friend_request(p_addressee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_existing record;
  v_id uuid;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;
  if v_self = p_addressee_id then
    raise exception 'cannot friend yourself';
  end if;
  if public.is_blocked(v_self, p_addressee_id) then
    raise exception 'blocked';
  end if;
  if not exists (select 1 from public.profiles where id = p_addressee_id) then
    raise exception 'user not found';
  end if;

  select * into v_existing
  from public.friendships
  where (requester_id = v_self and addressee_id = p_addressee_id)
     or (requester_id = p_addressee_id and addressee_id = v_self)
  limit 1;

  if v_existing.id is not null then
    if v_existing.status = 'accepted' then
      raise exception 'already friends';
    elsif v_existing.status = 'pending' then
      raise exception 'request already pending';
    else
      -- rejected: 同方向なら既存行をpendingへ差し戻す。逆方向なら新規行を作る（unique制約はrequester/addresseeの組で判定されるため衝突しない）
      if v_existing.requester_id = v_self then
        update public.friendships
        set status = 'pending', is_read = false, updated_at = now()
        where id = v_existing.id
        returning id into v_id;
        return v_id;
      end if;
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_self, p_addressee_id)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.respond_to_friend_request(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friendships
  set status = case when p_accept then 'accepted' else 'rejected' end,
      is_read = true,
      updated_at = now()
  where id = p_friendship_id
    and addressee_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'request not found or not actionable';
  end if;
end;
$$;

create or replace function public.cancel_friend_request(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
  where id = p_friendship_id
    and requester_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'request not found or not cancellable';
  end if;
end;
$$;

create or replace function public.remove_friend(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
  where status = 'accepted'
    and ((requester_id = auth.uid() and addressee_id = p_other_user_id)
      or (requester_id = p_other_user_id and addressee_id = auth.uid()));

  if not found then
    raise exception 'friendship not found';
  end if;
end;
$$;

create or replace function public.mark_friend_requests_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.friendships
  set is_read = true
  where addressee_id = auth.uid() and status = 'pending' and is_read = false;
$$;

-- -----------------------------------------------------------------------------
-- 6. ブロック操作RPC
-- ブロック時、既存のフレンド関係（承認済み/申請中いずれも）は解消する。
-- -----------------------------------------------------------------------------
create or replace function public.block_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;
  if v_self = p_target_id then
    raise exception 'cannot block yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'user not found';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_self, p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.friendships
  where (requester_id = v_self and addressee_id = p_target_id)
     or (requester_id = p_target_id and addressee_id = v_self);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. EXECUTE権限（既存パターンを踏襲：public/anonからrevoke、authenticatedのみ許可）
-- -----------------------------------------------------------------------------
revoke execute on function public.get_conversation_list() from public;
revoke execute on function public.search_users(text) from public;
revoke execute on function public.get_friend_requests() from public;
revoke execute on function public.send_friend_request(uuid) from public;
revoke execute on function public.respond_to_friend_request(uuid, boolean) from public;
revoke execute on function public.cancel_friend_request(uuid) from public;
revoke execute on function public.remove_friend(uuid) from public;
revoke execute on function public.mark_friend_requests_read() from public;
revoke execute on function public.block_user(uuid) from public;

grant execute on function public.get_conversation_list() to authenticated;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.mark_friend_requests_read() to authenticated;
grant execute on function public.block_user(uuid) to authenticated;

-- =============================================================================
-- Phase 6: 追加認証の基盤（FR-19, FR-20, 3.8）
-- 適用済み（Supabase MCP: apply_migration "phase6_auth_foundation"）。
-- 認証はアカウントにつき1つの秘密（user_settings.auth_type/auth_secret）。
-- 「各チャット」スコープは部屋ごとの個人用トグル（room_members.auth_required）として実装し、
-- 相手の画面には一切影響しない（rooms.lock_type/lock_secretは本Phaseでは未使用のまま据え置く。
-- 経緯はCLAUDE.md Phase 6の設計判断を参照）。
-- ハッシュ化・検証（bcrypt比較）自体はアプリ側（Server Action, bcryptjs）で行い、
-- ここではロック状態・失敗回数カウンタの更新、および自分のroom_members行の更新のみを扱う。
-- =============================================================================

alter table public.room_members
  add column auth_required boolean not null default false;

-- record_auth_attempt: 追加認証（PIN/キー）の検証結果を記録する。
-- 成功時はカウンタ・ロックをクリア。失敗時はカウンタを+1し、5回到達でロック（15分）。
create or replace function public.record_auth_attempt(p_success boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_success then
    update public.user_settings
    set auth_failed_attempts = 0, auth_locked_until = null
    where user_id = v_self;
  else
    update public.user_settings
    set auth_failed_attempts = auth_failed_attempts + 1,
        auth_locked_until = case
          when auth_failed_attempts + 1 >= 5 then now() + interval '15 minutes'
          else auth_locked_until
        end
    where user_id = v_self;
  end if;
end;
$$;

-- set_room_auth_required: 部屋ごとの個人用ロックトグル（FR-20「各チャット」スコープ）。
-- room_members_update_ownerのRLS（owner限定）は緩めず、
-- 「自分自身の行のauth_requiredのみ」を更新できる専用RPCとして提供する。
create or replace function public.set_room_auth_required(p_room_id uuid, p_required boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_room_member(p_room_id) then
    raise exception 'not a member of this room';
  end if;

  update public.room_members
  set auth_required = p_required
  where room_id = p_room_id and user_id = v_self;
end;
$$;

revoke execute on function public.record_auth_attempt(boolean) from public;
revoke execute on function public.set_room_auth_required(uuid, boolean) from public;

grant execute on function public.record_auth_attempt(boolean) to authenticated;
grant execute on function public.set_room_auth_required(uuid, boolean) to authenticated;

-- =============================================================================
-- Phase 6: 一時チャット作成（FR-10, 3.7前半）
-- 適用済み（Supabase MCP: apply_migration "phase6_temp_chat_creation"）。
-- get_conversation_listの戻り値にis_temporary/expires_atを追加（残り時間バッジ表示用）。
-- 戻り値の列構成を変更するためcreate or replaceでは不可（Postgresが拒否する）ため、
-- 一度dropしてから再作成している。
-- create_temp_dm_room: 常に新規roomを作成する一時チャット専用RPC
-- （get_or_create_dm_roomの既存DM検索・マージは行わない）。
-- =============================================================================

drop function public.get_conversation_list();

create function public.get_conversation_list()
returns table (
  room_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  friendship_status text,
  last_message_preview text,
  last_message_at timestamptz,
  is_temporary boolean,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with my_rooms as (
    select rm.room_id, r.is_temporary, r.expires_at
    from public.room_members rm
    join public.rooms r on r.id = rm.room_id
    where rm.user_id = auth.uid() and r.is_group = false
  ),
  other as (
    select rm.room_id, rm.user_id as other_user_id
    from public.room_members rm
    where rm.room_id in (select room_id from my_rooms)
      and rm.user_id <> auth.uid()
  ),
  last_msg as (
    select distinct on (m.room_id)
      m.room_id, m.content, m.image_url, m.created_at
    from public.messages m
    where m.room_id in (select room_id from my_rooms)
      and m.deleted_at is null
    order by m.room_id, m.created_at desc
  ),
  fs as (
    select
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as counterpart_id,
      f.status,
      f.requester_id
    from public.friendships f
    where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  )
  select
    o.room_id,
    o.other_user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(
      case
        when fs.status = 'accepted' then 'accepted'
        when fs.status = 'pending' and fs.requester_id = auth.uid() then 'pending_sent'
        when fs.status = 'pending' then 'pending_received'
        when fs.status = 'rejected' then 'rejected'
      end,
      'none'
    ) as friendship_status,
    coalesce(lm.content, case when lm.image_url is not null then '📷 画像' else null end) as last_message_preview,
    lm.created_at as last_message_at,
    mr.is_temporary,
    mr.expires_at
  from other o
  join public.profiles p on p.id = o.other_user_id
  join my_rooms mr on mr.room_id = o.room_id
  left join last_msg lm on lm.room_id = o.room_id
  left join fs on fs.counterpart_id = o.other_user_id
  where not public.is_blocked(auth.uid(), o.other_user_id)
  order by lm.created_at desc nulls last
$$;

revoke execute on function public.get_conversation_list() from public;
grant execute on function public.get_conversation_list() to authenticated;

-- create_temp_dm_room: 一時チャット専用のDM開始RPC。既存DM検索・マージは行わず、
-- 常に新規roomをis_temporary=true, expires_at=p_expires_atで作成する。
-- ブロックチェック・自己DMチェック・ストレンジャーDMチェックはget_or_create_dm_roomから流用。
create or replace function public.create_temp_dm_room(p_other_user_id uuid, p_expires_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_self uuid := auth.uid();
  v_are_friends boolean;
  v_target_allows_strangers boolean;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if v_self = p_other_user_id then
    raise exception 'cannot create DM room with self';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid expiration time';
  end if;

  if p_expires_at > now() + interval '90 days' then
    raise exception 'expiration time too far in the future';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'target user not found';
  end if;

  if public.is_blocked(v_self, p_other_user_id) then
    raise exception 'cannot start DM: blocked';
  end if;

  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = v_self and addressee_id = p_other_user_id)
        or (requester_id = p_other_user_id and addressee_id = v_self))
  ) into v_are_friends;

  if not v_are_friends then
    select coalesce(dm_from_stranger_enabled, true) into v_target_allows_strangers
    from public.user_settings
    where user_id = p_other_user_id;

    if not coalesce(v_target_allows_strangers, true) then
      raise exception 'target user does not accept DMs from strangers';
    end if;
  end if;

  insert into public.rooms (is_group, is_temporary, expires_at)
  values (false, true, p_expires_at)
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, role)
  values
    (v_room_id, v_self, 'owner'),
    (v_room_id, p_other_user_id, 'member');

  return v_room_id;
end;
$$;

revoke execute on function public.create_temp_dm_room(uuid, timestamptz) from public;
grant execute on function public.create_temp_dm_room(uuid, timestamptz) to authenticated;

-- 注意（apply_migration "phase6_revoke_anon_from_new_rpcs" で追加適用）：
-- Supabaseはスキーマのデフォルト権限（ALTER DEFAULT PRIVILEGES）により、新規作成した関数へ
-- anonロールのEXECUTE権限を自動付与するため、"revoke ... from public"だけでは
-- anonからの直接RPC呼び出しを防げない（has_function_privilegeで実測確認済み）。
-- record_auth_attempt / set_room_auth_required / create_temp_dm_room の3関数について、
-- anonから明示的に剥奪する。
-- なお、この事象はPhase 1〜5の既存RPC（block_user/get_or_create_dm_room/is_room_member等）
-- にも共通して存在することを確認済み（各関数内でauth.uid() is nullをチェックしているため
-- 実害は無いが、"authenticated限定"という意図とは一致していない）。Phase 6のスコープ外のため
-- 未対応。まとめて棚卸しする場合は別途対応を検討。
revoke execute on function public.record_auth_attempt(boolean) from anon;
revoke execute on function public.set_room_auth_required(uuid, boolean) from anon;
revoke execute on function public.create_temp_dm_room(uuid, timestamptz) from anon;

-- =============================================================================
-- Phase 6: 一時チャットの自動削除バッチ（FR-10, 3.7後半）
-- 適用済み（Supabase MCP: apply_migration "phase6_temp_chat_cleanup_batch",
-- "phase6_cleanup_revoke_anon"）。
-- pg_cron + SQL関数のみで完結させる（Edge Functions/Vercel Cron不要）。
-- 理由：SRS 2.5「無料プランでの運用を前提とする」。Vercel Cronは10分間隔・10分以内削除の
-- 要件を満たすにはProプランが必要になるため、Supabase無料プランで完結するpg_cronを採用。
-- =============================================================================

create extension if not exists pg_cron;

-- 失敗ログ記録用（SRS 3.7「削除処理失敗時は次回実行で再試行する。連続失敗はログに記録する」）。
-- 通常運用時のノイズを避けるため、削除件数0件・エラー無しの実行はログに残さない
-- （関数側でdeleted_room_count > 0またはerror_message is not nullの場合のみinsertする）。
create table public.temp_chat_cleanup_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  deleted_room_count integer not null default 0,
  error_message text
);

-- アプリのPostgREST API経由では一切公開しない内部運用テーブル。
-- RLSを有効化した上でポリシーを一切追加しない（authenticated/anonはデフォルト拒否）。
alter table public.temp_chat_cleanup_log enable row level security;

-- cleanup_expired_temp_chats: 期限切れ、または全メンバーがtemp_chat_sessions.closed_atを
-- 設定済みの一時チャットroomを削除する。messages/room_members/temp_chat_sessionsは
-- rooms.idへのon delete cascadeで連鎖削除される。room単位でエラーをcatchし、
-- 1件の失敗が他の削除に波及しないようにする。
create or replace function public.cleanup_expired_temp_chats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_deleted_count integer := 0;
  v_error_message text;
begin
  for v_room in
    select r.id
    from public.rooms r
    where r.is_temporary = true
      and (
        (r.expires_at is not null and r.expires_at < now())
        or not exists (
          select 1
          from public.room_members rm
          left join public.temp_chat_sessions tcs
            on tcs.room_id = rm.room_id and tcs.user_id = rm.user_id
          where rm.room_id = r.id
            and tcs.closed_at is null
        )
      )
  loop
    begin
      delete from public.rooms where id = v_room.id;
      v_deleted_count := v_deleted_count + 1;
    exception when others then
      v_error_message := coalesce(v_error_message || '; ', '') || 'room ' || v_room.id || ': ' || sqlerrm;
    end;
  end loop;

  if v_deleted_count > 0 or v_error_message is not null then
    insert into public.temp_chat_cleanup_log (deleted_room_count, error_message)
    values (v_deleted_count, v_error_message);
  end if;
end;
$$;

-- pg_cronからのみ実行される想定。authenticated/anon双方からEXECUTE権限を剥奪する
-- （認証トリガー専用関数と同じ方針）。
-- 注意：Supabaseはスキーマのデフォルト権限（ALTER DEFAULT PRIVILEGES）により新規関数へ
-- anonのEXECUTEを自動付与するため、"revoke ... from public"だけでは不十分（advisorで検出）。
-- anonへは明示的にrevokeする必要がある。
revoke execute on function public.cleanup_expired_temp_chats() from public;
revoke execute on function public.cleanup_expired_temp_chats() from authenticated;
revoke execute on function public.cleanup_expired_temp_chats() from anon;

select cron.schedule('cleanup-temp-chats', '*/10 * * * *', 'select public.cleanup_expired_temp_chats();');

-- =============================================================================
-- Phase 6 バグ修正: メッセージ削除（FR-16）をRPC経由に変更
-- 適用済み（Supabase MCP: apply_migration "phase6_delete_own_message_rpc"）。
-- 直接のテーブルUPDATE（messages_update_own_delete_onlyポリシー経由）は使わず、
-- delete_own_message RPC（SECURITY DEFINER）経由にしている。理由：PostgreSQLのRLSは
-- UPDATE時に「更新後の新しい行がSELECTポリシーからも見える状態であること」を暗黙的に
-- 要求するため、messages_update_own_delete_onlyのWITH CHECK（sender_id = auth.uid()）自体は
-- 満たしていても、messages_select_member_not_deletedポリシー（deleted_at is nullを要求）と
-- 衝突し、常に"new row violates row-level security policy"で失敗することが実機検証で判明した
-- （ロールバック付きSQLで再現・原因特定済み）。RPC内で明示的にsender_id = auth.uid()を
-- 確認することでRLSと同等の保護を維持しつつ、SECURITY DEFINERによりこの制約を回避している。
-- =============================================================================

create or replace function public.delete_own_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  update public.messages
  set deleted_at = now()
  where id = p_message_id
    and sender_id = v_self
    and deleted_at is null;

  if not found then
    raise exception 'message not found or not deletable';
  end if;
end;
$$;

revoke execute on function public.delete_own_message(uuid) from public;
revoke execute on function public.delete_own_message(uuid) from anon;
grant execute on function public.delete_own_message(uuid) to authenticated;
