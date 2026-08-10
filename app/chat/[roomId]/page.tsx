import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "@/components/chat/ChatRoom";

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
    .select("id, is_group")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    notFound();
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
    />
  );
}
