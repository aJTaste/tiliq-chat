import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import {
  AddUserPanel,
  type BlockedUserItem,
  type FriendRequestItem,
} from "@/components/home/AddUserPanel";
import {
  HomeTabs,
  type ConversationItem,
  type FriendshipStatus,
} from "@/components/home/HomeTabs";
import { StrangerDmToggle } from "@/components/home/StrangerDmToggle";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Phase 3のfetchRoomList（N+1気味の複数クエリ）はget_conversation_list RPCへ置き換え済み
  // （CLAUDE.md Phase 5持ち越し事項#4）。フレンド申請一覧・自分の設定・ブロック一覧と合わせて並列取得する。
  const [
    profileResult,
    conversationsResult,
    requestsResult,
    settingsResult,
    blocksResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single(),
    supabase.rpc("get_conversation_list"),
    supabase.rpc("get_friend_requests"),
    supabase
      .from("user_settings")
      .select("dm_from_stranger_enabled")
      .eq("user_id", user.id)
      .single(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id),
  ]);

  const profile = profileResult.data;

  const conversations: ConversationItem[] = (
    conversationsResult.data ?? []
  ).map((row) => ({
    roomId: row.room_id,
    otherUserId: row.other_user_id,
    otherUsername: row.other_username,
    otherDisplayName: row.other_display_name,
    otherAvatarUrl: row.other_avatar_url ?? null,
    friendshipStatus: row.friendship_status as FriendshipStatus,
    lastMessagePreview: row.last_message_preview ?? null,
    lastMessageAt: row.last_message_at ?? null,
  }));

  const friendRequests: FriendRequestItem[] = (requestsResult.data ?? []).map(
    (row) => ({
      friendshipId: row.friendship_id,
      direction: row.direction as "received" | "sent",
      counterpartId: row.counterpart_id,
      counterpartUsername: row.counterpart_username,
      counterpartDisplayName: row.counterpart_display_name,
      status: row.status,
      isRead: row.is_read,
    }),
  );

  // ホーム画面・検索結果はどちらもブロック中のユーザーを除外するため、
  // ブロック解除の唯一の導線になる。チャットルームのブロック解除ボタンは
  // 相手が一覧・検索から消えた時点で到達不能になるため、ここが必須の導線。
  const blockedIds = (blocksResult.data ?? []).map((b) => b.blocked_id);

  const blockedProfilesResult =
    blockedIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", blockedIds)
      : null;

  const blockedUsers: BlockedUserItem[] = (
    blockedProfilesResult?.data ?? []
  ).map((p) => ({
    userId: p.id,
    username: p.username,
    displayName: p.display_name,
  }));

  const dmFromStrangerEnabled =
    settingsResult.data?.dm_from_stranger_enabled ?? true;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-band/60 px-6 py-4">
        <div className="min-w-0">
          <p className="font-label text-xs uppercase tracking-[0.25em] text-ink-muted">
            Tiliqua
          </p>
          <h1 className="truncate font-display text-lg font-semibold text-ink">
            {profile?.display_name ?? user.email}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StrangerDmToggle initialEnabled={dmFromStrangerEnabled} />
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <AddUserPanel
        initialRequests={friendRequests}
        initialBlockedUsers={blockedUsers}
      />

      <HomeTabs conversations={conversations} />
    </main>
  );
}
