"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthGate } from "@/components/auth/AuthGate";
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
  conversations: ConversationItem[];
  friendRequests: FriendRequestItem[];
  blockedUsers: BlockedUserItem[];
};

/**
 * FR-20「起動時」スコープが有効なアカウント専用の読み込み経路。
 * AuthGateで解錠されるまで、会話一覧・フレンド申請・ブロック一覧をRSCペイロードへ
 * 含めない（＝解錠前にサーバーから何も取得しない）ため、解錠後にブラウザから
 * 直接Supabaseを呼び出す。
 */
function GatedHomeBody({ userId }: { userId: string }) {
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [conversationsResult, requestsResult, blocksResult] =
        await Promise.all([
          supabase.rpc("get_conversation_list"),
          supabase.rpc("get_friend_requests"),
          supabase
            .from("blocks")
            .select("blocked_id")
            .eq("blocker_id", userId),
        ]);

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

      const blockedUsers: BlockedUserItem[] = (
        blockedProfilesResult?.data ?? []
      ).map((p) => ({
        userId: p.id,
        username: p.username,
        displayName: p.display_name,
      }));

      if (!cancelled) {
        setData({ conversations, friendRequests, blockedUsers });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!data) {
    return <p className="px-6 py-8 text-sm text-ink-muted">読み込み中...</p>;
  }

  return (
    <>
      <AddUserPanel
        initialRequests={data.friendRequests}
        initialBlockedUsers={data.blockedUsers}
      />
      <HomeTabs conversations={data.conversations} />
    </>
  );
}

export function HomeContent({
  userId,
  gated,
  initialConversations,
  initialFriendRequests,
  initialBlockedUsers,
}: {
  userId: string;
  gated: boolean;
  initialConversations: ConversationItem[];
  initialFriendRequests: FriendRequestItem[];
  initialBlockedUsers: BlockedUserItem[];
}) {
  if (!gated) {
    return (
      <>
        <AddUserPanel
          initialRequests={initialFriendRequests}
          initialBlockedUsers={initialBlockedUsers}
        />
        <HomeTabs conversations={initialConversations} />
      </>
    );
  }

  return (
    <AuthGate scopeKey="launch" title="起動時の認証">
      <GatedHomeBody userId={userId} />
    </AuthGate>
  );
}
