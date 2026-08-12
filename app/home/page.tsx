import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import type { BlockedUserItem, FriendRequestItem } from "@/components/home/AddUserPanel";
import type { ConversationItem, FriendshipStatus } from "@/components/home/HomeTabs";
import { HomeContent } from "@/components/home/HomeContent";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // profile・自分の設定は低感度（このアカウントの持ち主が誰かは、端末を覗いた時点で
  // 既知の情報のため）なのでゲートの有無に関わらず常にサーバー側で取得する。
  const [profileResult, settingsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_settings")
      .select("auth_scope_launch")
      .eq("user_id", user.id)
      .single(),
  ]);

  const profile = profileResult.data;
  const launchGateEnabled = settingsResult.data?.auth_scope_launch ?? false;

  // FR-20「起動時」の追加認証が有効な場合、会話一覧・フレンド申請・ブロック一覧
  // （＝誰とやり取りしているかが分かる情報）はAuthGateで解錠されるまでサーバーから
  // 取得しない（RSCペイロードへの解錠前データ混入を避けるため）。
  // HomeContent側がgated=trueのときクライアントから取得し直す。
  let conversations: ConversationItem[] = [];
  let friendRequests: FriendRequestItem[] = [];
  let blockedUsers: BlockedUserItem[] = [];
  // Phase 8: 3クエリいずれかが失敗した場合、空状態と見分けが付かなくなることを防ぐため
  // 明示的にエラーフラグを立ててHomeTabsまで伝播させる。
  let loadError = false;

  if (!launchGateEnabled) {
    // Phase 3のfetchRoomList（N+1気味の複数クエリ）はget_conversation_list RPCへ置き換え済み
    // （CLAUDE.md Phase 5持ち越し事項#4）。フレンド申請一覧・ブロック一覧と合わせて並列取得する。
    const [conversationsResult, requestsResult, blocksResult] =
      await Promise.all([
        supabase.rpc("get_conversation_list"),
        supabase.rpc("get_friend_requests"),
        supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id),
      ]);

    loadError = Boolean(
      conversationsResult.error || requestsResult.error || blocksResult.error,
    );

    conversations = (conversationsResult.data ?? []).map((row) => ({
      roomId: row.room_id,
      otherUserId: row.other_user_id,
      otherUsername: row.other_username,
      otherDisplayName: row.other_display_name,
      otherAvatarUrl: row.other_avatar_url ?? null,
      friendshipStatus: row.friendship_status as FriendshipStatus,
      lastMessagePreview: row.last_message_preview ?? null,
      lastMessageAt: row.last_message_at ?? null,
      isTemporary: row.is_temporary ?? false,
      expiresAt: row.expires_at ?? null,
    }));

    friendRequests = (requestsResult.data ?? []).map((row) => ({
      friendshipId: row.friendship_id,
      direction: row.direction as "received" | "sent",
      counterpartId: row.counterpart_id,
      counterpartUsername: row.counterpart_username,
      counterpartDisplayName: row.counterpart_display_name,
      status: row.status,
      isRead: row.is_read,
    }));

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

    if (blockedProfilesResult?.error) loadError = true;

    blockedUsers = (blockedProfilesResult?.data ?? []).map((p) => ({
      userId: p.id,
      username: p.username,
      displayName: p.display_name,
    }));
  }

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
          <Link
            href="/settings"
            className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
          >
            設定
          </Link>
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

      {/*
        FR-15: ユーザー追加UIはPCではサイドバー・スマホではボトムバーに配置する
        （Phase 9）。レイアウトの責務はこのファイルに閉じ込め、HomeContent.tsx側は
        データ取得の分岐という既存の役割のまま変更しない。AddUserPanel/HomeTabs自身が
        各ブレークポイントに応じた自分の見た目（幅・固定位置）を持つ。
      */}
      <div className="flex flex-1 flex-col md:flex-row">
        <HomeContent
          userId={user.id}
          gated={launchGateEnabled}
          initialConversations={conversations}
          initialFriendRequests={friendRequests}
          initialBlockedUsers={blockedUsers}
          initialLoadError={loadError}
        />
      </div>
    </main>
  );
}
