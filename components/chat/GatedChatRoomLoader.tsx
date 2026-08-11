"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";
import { ChatRoom } from "@/components/chat/ChatRoom";

type MessageRow = Tables<"messages">;

const PAGE_SIZE = 30;

type LoadedState = {
  status: "ready";
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  initialMessages: MessageRow[];
  initialHasMore: boolean;
  initialIsBlockedByMe: boolean;
  initialHiddenMessageIds: string[];
};

/**
 * FR-20「各チャット」スコープでロックされた部屋専用の読み込み経路。
 * AuthGateで解錠されるまで、相手のプロフィール・メッセージ本体はサーバーから
 * 取得しない（RSCペイロードへの解錠前データ混入を避けるため）。
 * app/chat/[roomId]/page.tsxの非ゲート時の取得ロジックと同等の内容をクライアント側で行う。
 */
export function GatedChatRoomLoader({
  roomId,
  currentUserId,
  isTemporary,
}: {
  roomId: string;
  currentUserId: string;
  isTemporary: boolean;
}) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error" } | LoadedState
  >({ status: "loading" });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
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

      const { data: myBlockOfOther } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker_id", currentUserId)
        .eq("blocked_id", otherProfile.id)
        .maybeSingle();

      const { data: initialMessagesDesc } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      const initialMessages = [...(initialMessagesDesc ?? [])].reverse();
      const initialHasMore = (initialMessagesDesc?.length ?? 0) === PAGE_SIZE;

      const { data: hiddenRows } = await supabase
        .from("message_hidden")
        .select("message_id, messages!inner(room_id)")
        .eq("user_id", currentUserId)
        .eq("messages.room_id", roomId);

      const initialHiddenMessageIds = (hiddenRows ?? []).map(
        (row) => row.message_id,
      );

      if (!cancelled) {
        setState({
          status: "ready",
          otherUser: {
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

    void load();
    return () => {
      cancelled = true;
    };
  }, [roomId, currentUserId]);

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
      otherUser={state.otherUser}
      initialMessages={state.initialMessages}
      initialHasMore={state.initialHasMore}
      initialIsBlockedByMe={state.initialIsBlockedByMe}
      initialHiddenMessageIds={state.initialHiddenMessageIds}
      initialAuthRequired
      isTemporary={isTemporary}
    />
  );
}
