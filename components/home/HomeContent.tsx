"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthGate } from "@/components/auth/AuthGate";
import { HomeHeader } from "@/components/home/HomeHeader";
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

type HomeData = {
  displayName: string;
  conversations: ConversationItem[];
  friendRequests: FriendRequestItem[];
  blockedUsers: BlockedUserItem[];
  loadError: boolean;
};

/**
 * FR-20「起動時」スコープが有効なアカウント専用の読み込み経路。
 * AuthGateで解錠されるまで、プロフィール（ユーザー名）・会話一覧・フレンド申請・
 * ブロック一覧をRSCペイロードへ含めない（＝解錠前にサーバーから何も取得しない）ため、
 * 解錠後にブラウザから直接Supabaseを呼び出す。ヘッダー（HomeHeader）の描画も
 * ここに含めることで、ロック中は「誰のアカウントか」も「設定」への導線も一切
 * 表示されないようにしている（Phase 16。app/home/page.tsxがゲート有効時は
 * このコンポーネント以外を何も描画しないことと対になる設計）。
 */
function GatedHomeBody({ userId }: { userId: string }) {
  const [data, setData] = useState<HomeData | null>(null);
  // Phase 10: friendshipsのRealtime変更を受けてload()を再実行するためのトリガー。
  // router.refresh()はServer Component側の保護データ取得（AuthGate解錠前は取得しない
  // 設計）をバイパスできないため、ここではこのキーを介してクライアント側の再取得を
  // 明示的に起こす。
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [profileResult, conversationsResult, requestsResult, blocksResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", userId)
            .single(),
          supabase.rpc("get_conversation_list"),
          supabase.rpc("get_friend_requests"),
          supabase
            .from("blocks")
            .select("blocked_id")
            .eq("blocker_id", userId),
        ]);

      // Phase 8: 空状態と見分けが付かなくなることを防ぐため、いずれかのクエリが
      // 失敗した場合はloadErrorを立ててHomeTabsまで伝播させる（非ゲート時と同じ対応）。
      let loadError = Boolean(
        profileResult.error ||
          conversationsResult.error ||
          requestsResult.error ||
          blocksResult.error,
      );

      const displayName = profileResult.data?.display_name ?? "Tiliqua";

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
        isTemporary: row.is_temporary ?? false,
        expiresAt: row.expires_at ?? null,
      }));

      const friendRequests: FriendRequestItem[] = (
        requestsResult.data ?? []
      ).map((row) => ({
        friendshipId: row.friendship_id,
        direction: row.direction as "received" | "sent",
        counterpartId: row.counterpart_id,
        counterpartUsername: row.counterpart_username,
        counterpartDisplayName: row.counterpart_display_name,
        status: row.status,
        isRead: row.is_read,
      }));

      const blockedIds = (blocksResult.data ?? []).map((b) => b.blocked_id);
      const blockedProfilesResult =
        blockedIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, username, display_name")
              .in("id", blockedIds)
          : null;

      if (blockedProfilesResult?.error) loadError = true;

      const blockedUsers: BlockedUserItem[] = (
        blockedProfilesResult?.data ?? []
      ).map((p) => ({
        userId: p.id,
        username: p.username,
        displayName: p.display_name,
      }));

      if (!cancelled) {
        setData({ displayName, conversations, friendRequests, blockedUsers, loadError });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  // Phase 10: フレンド申請の送信・承認・拒否・取り消し・解除（friendships）を
  // Realtimeで購読し、相手側の操作もリロード無しで反映する。friendships_select_involved
  // のRLS（requester_id/addressee_idどちらでも参照可）により、フィルタを指定しなくても
  // 自分が関与する行のイベントのみが届く（docs/schema.sql参照）。blocksは
  // blocks_select_ownのRLS（blocker_idのみ）で相手の操作が原理的に見えない設計のため
  // 購読しない（自分の操作は既存のUIで即時反映済み）。
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`home-friendships-gated:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => setReloadKey((k) => k + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (!data) {
    return <p className="px-6 py-8 text-sm text-ink-muted">読み込み中...</p>;
  }

  return (
    <>
      <HomeHeader displayName={data.displayName} />
      <div className="flex flex-1 flex-col md:flex-row">
        <AddUserPanel
          initialRequests={data.friendRequests}
          initialBlockedUsers={data.blockedUsers}
        />
        <HomeTabs conversations={data.conversations} loadError={data.loadError} />
      </div>
    </>
  );
}

export function HomeContent({
  userId,
  gated,
  initialConversations,
  initialFriendRequests,
  initialBlockedUsers,
  initialLoadError,
}: {
  userId: string;
  gated: boolean;
  initialConversations: ConversationItem[];
  initialFriendRequests: FriendRequestItem[];
  initialBlockedUsers: BlockedUserItem[];
  initialLoadError: boolean;
}) {
  const router = useRouter();

  // Phase 10: 非ゲート時のfriendships購読。GatedHomeBody側とは別に用意する
  // （Reactのフック規約上、下のif (!gated)による早期returnより手前で無条件に
  // フックを呼ぶ必要があるため）。ゲート時はこのeffect内で早期returnし、
  // GatedHomeBody自身の購読に委ねる。
  useEffect(() => {
    if (gated) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`home-friendships:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gated, userId, router]);

  if (!gated) {
    return (
      <>
        <AddUserPanel
          initialRequests={initialFriendRequests}
          initialBlockedUsers={initialBlockedUsers}
        />
        <HomeTabs
          conversations={initialConversations}
          loadError={initialLoadError}
        />
      </>
    );
  }

  return (
    <AuthGate scopeKey="launch" title="起動時の認証">
      <GatedHomeBody userId={userId} />
    </AuthGate>
  );
}
