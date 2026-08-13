"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HomeHeader } from "@/components/home/HomeHeader";
import { ShellRow } from "@/components/shell/ShellRow";
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

type ShellData = {
  displayName: string;
  conversations: ConversationItem[];
  friendRequests: FriendRequestItem[];
  blockedUsers: BlockedUserItem[];
  loadError: boolean;
};

/**
 * FR-20「起動時」スコープが有効なアカウント専用の読み込み経路（旧
 * components/home/HomeContent.tsxのGatedHomeBodyを、永続サイドバーシェル化に
 * 合わせて移設・拡張したもの）。AuthGateで解錠されるまで、プロフィール
 * （ユーザー名）・会話一覧・フレンド申請・ブロック一覧をRSCペイロードへ
 * 含めない（＝解錠前にサーバーから何も取得しない）ため、解錠後にブラウザから
 * 直接Supabaseを呼び出す。ヘッダー・サイドバーの描画もここに含めることで、
 * ロック中は「誰のアカウントか」も「設定」への導線も、会話一覧も一切
 * 表示されないようにしている。
 *
 * `children`（＝app/(shell)/home/page.tsxやapp/(shell)/chat/[roomId]/page.tsx
 * が描画するメインコンテンツ）はこの解錠後経路の中でのみ画面に表示されるが、
 * Next.jsの仕様上「親がchildrenをJSXでどう扱うか」はchildren自身のサーバー側
 * データ取得を止めない。そのためルーム単位の起動時ゲートチェックは各page.tsx
 * 側にも別途持たせている（app/(shell)/chat/[roomId]/page.tsx参照）。
 */
export function GatedShellBody({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<ShellData | null>(null);
  // Phase 10: friendshipsのRealtime変更を受けてload()を再実行するためのトリガー。
  // router.refresh()はServer Component側の保護データ取得（AuthGate解錠前は取得しない
  // 設計）をバイパスできないため、ここではこのキーを介してクライアント側の再取得を
  // 明示的に起こす。
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [
        profileResult,
        conversationsResult,
        requestsResult,
        blocksResult,
        groupConversationsResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .single(),
        supabase.rpc("get_conversation_list"),
        supabase.rpc("get_friend_requests"),
        supabase.from("blocks").select("blocked_id").eq("blocker_id", userId),
        // Phase 19: グループチャットUI M1
        supabase.rpc("get_group_conversation_list"),
      ]);

      // Phase 8: 空状態と見分けが付かなくなることを防ぐため、いずれかのクエリが
      // 失敗した場合はloadErrorを立ててHomeTabsまで伝播させる（非ゲート時と同じ対応）。
      let loadError = Boolean(
        profileResult.error ||
          conversationsResult.error ||
          requestsResult.error ||
          blocksResult.error ||
          groupConversationsResult.error,
      );

      const displayName = profileResult.data?.display_name ?? "Tiliqua";

      const conversations: ConversationItem[] = (
        conversationsResult.data ?? []
      ).map((row) => ({
        kind: "dm" as const,
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

      const groupConversations: ConversationItem[] = (
        groupConversationsResult.data ?? []
      ).map((row) => ({
        kind: "group" as const,
        roomId: row.room_id,
        groupName: row.name ?? null,
        memberNames: row.member_names ?? [],
        memberCount: row.member_count,
        lastMessagePreview: row.last_message_preview ?? null,
        lastMessageAt: row.last_message_at ?? null,
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
        setData({
          displayName,
          conversations: [...conversations, ...groupConversations],
          friendRequests,
          blockedUsers,
          loadError,
        });
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
      .channel(`shell-friendships-gated:${userId}`)
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
      <ShellRow
        sidebar={
          <>
            <AddUserPanel
              initialRequests={data.friendRequests}
              initialBlockedUsers={data.blockedUsers}
            />
            <HomeTabs
              conversations={data.conversations}
              loadError={data.loadError}
            />
          </>
        }
      >
        {children}
      </ShellRow>
    </>
  );
}
