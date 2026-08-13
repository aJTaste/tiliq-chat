import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BlockedUserItem, FriendRequestItem } from "@/components/home/AddUserPanel";
import type { ConversationItem, FriendshipStatus } from "@/components/home/HomeTabs";
import { AddUserPanel } from "@/components/home/AddUserPanel";
import { HomeTabs } from "@/components/home/HomeTabs";
import { HomeHeader } from "@/components/home/HomeHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import { GatedShellBody } from "@/components/shell/GatedShellBody";
import { ShellRow } from "@/components/shell/ShellRow";
import { ShellFriendshipsSync } from "@/components/shell/ShellFriendshipsSync";

/**
 * 永続サイドバーシェル（Phase 17・M1）。`/home`・`/chat/[roomId]`をこのRoute Group
 * 配下にまとめ、クライアント側遷移時にこのlayout自体は再マウントされない
 * （サイドバーの状態が保持される）ことを利用する。Route Group自体はURLに
 * 現れないため、proxy.tsのmatcher（pathnameベース）には影響しない。
 *
 * サイドバー（AddUserPanel+HomeTabs）のデータ取得責務は、旧app/home/page.tsx
 * からこのファイルへ移した。ゲート有効時のデータ取得・描画は
 * components/shell/GatedShellBody.tsxに委譲する（旧HomeContent.tsxの
 * GatedHomeBody相当）。
 */
export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // FR-20「起動時」の追加認証：まずゲート要否だけを確認する。ゲートが有効な場合は
  // 以降のプロフィール・会話一覧・フレンド申請・ブロック一覧（＝「誰か」「誰と
  // やり取りしているか」が分かる情報）を一切取得しない（RSCペイロードへの
  // 解錠前データ混入を避けるため）。
  const { data: settings } = await supabase
    .from("user_settings")
    .select("auth_scope_launch")
    .eq("user_id", user.id)
    .single();

  const launchGateEnabled = settings?.auth_scope_launch ?? false;

  if (launchGateEnabled) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <AuthGate scopeKey="launch" title="起動時の認証">
          <GatedShellBody userId={user.id}>{children}</GatedShellBody>
        </AuthGate>
      </div>
    );
  }

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

  // Phase 8: 各クエリいずれかが失敗した場合、空状態と見分けが付かなくなることを防ぐため
  // 明示的にエラーフラグを立ててHomeTabsまで伝播させる。
  let loadError = Boolean(
    profileResult.error ||
      conversationsResult.error ||
      requestsResult.error ||
      blocksResult.error,
  );

  const displayName = profileResult.data?.display_name ?? user.email ?? "Tiliqua";

  const conversations: ConversationItem[] = (conversationsResult.data ?? []).map(
    (row) => ({
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
    }),
  );

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

  if (blockedProfilesResult?.error) loadError = true;

  const blockedUsers: BlockedUserItem[] = (blockedProfilesResult?.data ?? []).map(
    (p) => ({
      userId: p.id,
      username: p.username,
      displayName: p.display_name,
    }),
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <HomeHeader displayName={displayName} />
      <ShellFriendshipsSync userId={user.id} />
      <ShellRow
        sidebar={
          <>
            <AddUserPanel
              initialRequests={friendRequests}
              initialBlockedUsers={blockedUsers}
            />
            <HomeTabs conversations={conversations} loadError={loadError} />
          </>
        }
      >
        {children}
      </ShellRow>
    </div>
  );
}
