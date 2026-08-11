import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { AuthGate } from "@/components/auth/AuthGate";
import { GatedChatRoomLoader } from "@/components/chat/GatedChatRoomLoader";

const PAGE_SIZE = 30;

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("id, is_group, is_temporary")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    notFound();
  }

  // FR-20「各チャット」スコープ：自分がこの部屋に鍵をかけているか
  // （room_members.auth_required、自分の行のみ。相手には影響しない個人設定）。
  const { data: myMembership } = await supabase
    .from("room_members")
    .select("auth_required")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myMembership) {
    notFound();
  }

  if (myMembership.auth_required) {
    // ゲート有効時は相手のプロフィール・メッセージ本体をサーバー側で一切取得しない
    // （RSCペイロードへの解錠前データ混入を避けるため）。解錠後にクライアントから取得する。
    return (
      <AuthGate
        scopeKey={`room:${roomId}`}
        title="このチャットには鍵がかかっています"
      >
        <GatedChatRoomLoader
          roomId={roomId}
          currentUserId={user.id}
          isTemporary={room.is_temporary}
        />
      </AuthGate>
    );
  }

  const { data: otherMember } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId)
    .neq("user_id", user.id)
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
    notFound();
  }

  // blocks_select_ownのRLSにより、自分がブロックした相手かどうかのみ判定できる
  // （相手が自分をブロックしているかは見えない設計。schema.sql参照）
  const { data: myBlockOfOther } = await supabase
    .from("blocks")
    .select("id")
    .eq("blocker_id", user.id)
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

  // FR-17: 自分がこのルームで非表示にしたメッセージのID一覧。ページングで古いメッセージを
  // 読み込んだ場合もクライアント側でこの一覧を使ってフィルタするため、ルーム全体分を一括取得する。
  const { data: hiddenRows } = await supabase
    .from("message_hidden")
    .select("message_id, messages!inner(room_id)")
    .eq("user_id", user.id)
    .eq("messages.room_id", roomId);

  const initialHiddenMessageIds = (hiddenRows ?? []).map((row) => row.message_id);

  return (
    <ChatRoom
      roomId={roomId}
      currentUserId={user.id}
      otherUser={{
        id: otherProfile.id,
        username: otherProfile.username,
        displayName: otherProfile.display_name,
        avatarUrl: otherProfile.avatar_url,
      }}
      initialMessages={initialMessages}
      initialHasMore={initialHasMore}
      initialIsBlockedByMe={!!myBlockOfOther}
      initialHiddenMessageIds={initialHiddenMessageIds}
      initialAuthRequired={myMembership.auth_required}
      isTemporary={room.is_temporary}
    />
  );
}
