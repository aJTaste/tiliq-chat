"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";
import { ChatRoom, type ChatPeer } from "@/components/chat/ChatRoom";

type MessageRow = Tables<"messages">;

const PAGE_SIZE = 30;

type LoadedState = {
  status: "ready";
  peer: ChatPeer;
  initialMessages: MessageRow[];
  initialHasMore: boolean;
  initialIsBlockedByMe: boolean;
  initialHiddenMessageIds: string[];
};

/**
 * FR-20「各チャット」スコープでロックされた部屋専用の読み込み経路。
 * AuthGateで解錠されるまで、相手のプロフィール・メッセージ本体はサーバーから
 * 取得しない（RSCペイロードへの解錠前データ混入を避けるため）。
 * app/(shell)/chat/[roomId]/page.tsxの非ゲート時の取得ロジックと同等の内容をクライアント側で行う。
 * Phase 19: isGroupにより、DM（相手1人）とグループ（複数人）で取得方法を分岐する。
 */
export function GatedChatRoomLoader({
  roomId,
  currentUserId,
  isTemporary,
  isGroup,
}: {
  roomId: string;
  currentUserId: string;
  isTemporary: boolean;
  isGroup: boolean;
}) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error" } | LoadedState
  >({ status: "loading" });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadGroup() {
      // Phase 21: グループメンバー管理M2のためroleも取得し、自分を除外せず
      // members配列に含める。
      const { data: memberRows } = await supabase
        .from("room_members")
        .select("user_id, role")
        .eq("room_id", roomId);

      if (!memberRows) {
        if (!cancelled) setState({ status: "error" });
        return;
      }

      const allMemberIds = memberRows.map((row) => row.user_id);
      const roleById = new Map(memberRows.map((row) => [row.user_id, row.role]));

      const [{ data: room }, { data: memberProfiles }] = await Promise.all([
        supabase
          .from("rooms")
          .select("name, avatar_url")
          .eq("id", roomId)
          .single(),
        supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", allMemberIds),
      ]);

      const members = (memberProfiles ?? []).map((p) => ({
        id: p.id,
        displayName: p.display_name,
        role: (roleById.get(p.id) === "owner" ? "owner" : "member") as
          | "owner"
          | "member",
      }));

      const [
        { data: initialMessagesDesc, error: messagesError },
        { data: hiddenRows },
      ] = await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .eq("room_id", roomId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from("message_hidden")
          .select("message_id, messages!inner(room_id)")
          .eq("user_id", currentUserId)
          .eq("messages.room_id", roomId),
      ]);

      if (messagesError) {
        if (!cancelled) setState({ status: "error" });
        return;
      }

      const initialMessages = [...(initialMessagesDesc ?? [])].reverse();
      const initialHasMore = (initialMessagesDesc?.length ?? 0) === PAGE_SIZE;
      const initialHiddenMessageIds = (hiddenRows ?? []).map(
        (row) => row.message_id,
      );

      if (!cancelled) {
        setState({
          status: "ready",
          peer: {
            kind: "group",
            roomName: room?.name ?? null,
            avatarUrl: room?.avatar_url ?? null,
            members,
          },
          initialMessages,
          initialHasMore,
          initialIsBlockedByMe: false,
          initialHiddenMessageIds,
        });
      }
    }

    async function loadDm() {
      const { data: otherMember } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", currentUserId)
        .maybeSingle();

      const otherProfileResult = otherMember
        ? await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", otherMember.user_id)
            .single()
        : null;

      const otherProfile = otherProfileResult?.data ?? null;

      if (!otherProfile) {
        if (!cancelled) setState({ status: "error" });
        return;
      }

      // Phase 18: otherProfile確定後は以下3クエリが互いに独立している
      // （blocksはotherProfile.idのみ、messages/message_hiddenはroomId/currentUserIdのみに
      // 依存）ため、Promise.allでまとめて発行する（app/(shell)/chat/[roomId]/page.tsxの
      // 非ゲート経路と同じ並列化）。
      const [
        { data: myBlockOfOther },
        { data: initialMessagesDesc, error: messagesError },
        { data: hiddenRows },
      ] = await Promise.all([
        supabase
          .from("blocks")
          .select("id")
          .eq("blocker_id", currentUserId)
          .eq("blocked_id", otherProfile.id)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("*")
          .eq("room_id", roomId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from("message_hidden")
          .select("message_id, messages!inner(room_id)")
          .eq("user_id", currentUserId)
          .eq("messages.room_id", roomId),
      ]);

      // Phase 8: メッセージ取得自体が失敗した場合、空のチャットとして
      // 表示してしまわないようotherProfile欠如時と同じエラー状態に合流させる
      // （ブロック状態・非表示ID取得の失敗は既存の?? null/?? []フォールバックのまま許容する）。
      if (messagesError) {
        if (!cancelled) setState({ status: "error" });
        return;
      }

      const initialMessages = [...(initialMessagesDesc ?? [])].reverse();
      const initialHasMore = (initialMessagesDesc?.length ?? 0) === PAGE_SIZE;

      const initialHiddenMessageIds = (hiddenRows ?? []).map(
        (row) => row.message_id,
      );

      if (!cancelled) {
        setState({
          status: "ready",
          peer: {
            kind: "dm",
            id: otherProfile.id,
            username: otherProfile.username,
            displayName: otherProfile.display_name,
            avatarUrl: otherProfile.avatar_url,
          },
          initialMessages,
          initialHasMore,
          initialIsBlockedByMe: !!myBlockOfOther,
          initialHiddenMessageIds,
        });
      }
    }

    void (isGroup ? loadGroup() : loadDm());
    return () => {
      cancelled = true;
    };
  }, [roomId, currentUserId, isGroup]);

  if (state.status === "loading") {
    return <p className="px-6 py-8 text-sm text-ink-muted">読み込み中...</p>;
  }

  if (state.status === "error") {
    return (
      <p className="px-6 py-8 text-sm text-clay">
        チャットを読み込めませんでした。
      </p>
    );
  }

  return (
    <ChatRoom
      roomId={roomId}
      currentUserId={currentUserId}
      peer={state.peer}
      initialMessages={state.initialMessages}
      initialHasMore={state.initialHasMore}
      initialIsBlockedByMe={state.initialIsBlockedByMe}
      initialHiddenMessageIds={state.initialHiddenMessageIds}
      initialAuthRequired
      isTemporary={isTemporary}
    />
  );
}
