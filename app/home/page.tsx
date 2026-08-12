import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BlockedUserItem, FriendRequestItem } from "@/components/home/AddUserPanel";
import type { ConversationItem, FriendshipStatus } from "@/components/home/HomeTabs";
import { HomeContent } from "@/components/home/HomeContent";
import { HomeHeader } from "@/components/home/HomeHeader";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // FR-20「起動時」の追加認証：まずゲート要否だけを確認する。これは低感度な
  // 設定値のため常に取得してよいが、ゲートが有効な場合は以降のプロフィール・
  // 会話一覧・フレンド申請・ブロック一覧（＝「誰か」「誰とやり取りしているか」が
  // 分かる情報）を一切取得しない（RSCペイロードへの解錠前データ混入を避けるため）。
  const { data: settings } = await supabase
    .from("user_settings")
    .select("auth_scope_launch")
    .eq("user_id", user.id)
    .single();

  const launchGateEnabled = settings?.auth_scope_launch ?? false;

  let displayName = "";
  let conversations: ConversationItem[] = [];
  let friendRequests: FriendRequestItem[] = [];
  let blockedUsers: BlockedUserItem[] = [];
  // Phase 8: 各クエリいずれかが失敗した場合、空状態と見分けが付かなくなることを防ぐため
  // 明示的にエラーフラグを立ててHomeTabsまで伝播させる。
  let loadError = false;

  if (!launchGateEnabled) {
    const [profileResult, conversationsResult, requestsResult, blocksResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .single(),
        supabase.rpc("get_conversation_list"),
        supabase.rpc("get_friend_requests"),
        supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id),
      ]);

    loadError = Boolean(
      profileResult.error ||
        conversationsResult.error ||
        requestsResult.error ||
        blocksResult.error,
    );

    displayName = profileResult.data?.display_name ?? user.email ?? "Tiliqua";

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

  // Phase 16: ゲート有効時は、ヘッダー（ユーザー名表示・設定/ログアウトへの導線）を
  // 含めロック中は何もレンダリングしない。理由は2点：①ユーザー名という「誰のアカウントか」
  // が分かる情報を、解錠前の覗き見から守るため、②「設定」からゲート自体を無効化できて
  // しまう（認証をバイパスする実質的な抜け道になる）ため。ヘッダーの描画自体を
  // HomeContent→AuthGate解錠後のGatedHomeBodyへ委譲することで、AuthGate自身が
  // ページの唯一のコンテンツになり、/chat/[roomId]と同じ box constraint（残り高さ
  // いっぱい）になるため、縦位置も自然に揃う（副次効果）。
  if (launchGateEnabled) {
    return (
      <main className="flex min-h-screen flex-col">
        <HomeContent
          userId={user.id}
          gated={true}
          initialConversations={[]}
          initialFriendRequests={[]}
          initialBlockedUsers={[]}
          initialLoadError={false}
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <HomeHeader displayName={displayName} />

      {/*
        FR-15: ユーザー追加UIはPCではサイドバー・スマホではボトムバーに配置する
        （Phase 9）。レイアウトの責務はこのファイルに閉じ込め、HomeContent.tsx側は
        データ取得の分岐という既存の役割のまま変更しない。AddUserPanel/HomeTabs自身が
        各ブレークポイントに応じた自分の見た目（幅・固定位置）を持つ。
      */}
      <div className="flex flex-1 flex-col md:flex-row">
        <HomeContent
          userId={user.id}
          gated={false}
          initialConversations={conversations}
          initialFriendRequests={friendRequests}
          initialBlockedUsers={blockedUsers}
          initialLoadError={loadError}
        />
      </div>
    </main>
  );
}
