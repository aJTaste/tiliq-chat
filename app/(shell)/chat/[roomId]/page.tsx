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

  // Phase 18: room/myMembership/settingsはいずれもroomId・user.idのみに依存し
  // 相互に独立したクエリのため、Promise.allでまとめて発行する（体感速度改善）。
  // otherMember以降は「起動時」ゲート判定（needsGate）の結果次第で丸ごとスキップされる
  // ため、ここには含めない（ゲート中ユーザーへの無駄なDB往復を増やさないため）。
  const [roomResult, myMembershipResult, settingsResult] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, is_group, is_temporary, name")
      .eq("id", roomId)
      .maybeSingle(),
    // FR-20「各チャット」スコープ：自分がこの部屋に鍵をかけているか
    // （room_members.auth_required、自分の行のみ。相手には影響しない個人設定）。
    supabase
      .from("room_members")
      .select("auth_required")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle(),
    // Phase 17: 「起動時」ゲート（user_settings.auth_scope_launch）を、このページ自身も
    // 独立してチェックする。永続サイドバーシェル（app/(shell)/layout.tsx）側のAuthGateは
    // UI表示（サイドバー）を守るだけで、Next.jsの仕様上「親がchildrenをJSXでどう扱うか」は
    // children＝このページ自身のサーバー側データ取得までは止めない。そのため、ルーム個別の
    // 鍵（auth_required）がオフでも起動時ゲートが有効なら、このページを直接URLで開かれた
    // 場合に相手のプロフィール・メッセージが取得されてしまう抜け道が従来あった。
    supabase
      .from("user_settings")
      .select("auth_scope_launch")
      .eq("user_id", user.id)
      .single(),
  ]);

  const room = roomResult.data;

  if (!room) {
    notFound();
  }

  const myMembership = myMembershipResult.data;

  if (!myMembership) {
    notFound();
  }

  const settings = settingsResult.data;

  const launchGateEnabled = settings?.auth_scope_launch ?? false;
  const needsGate = launchGateEnabled || myMembership.auth_required;

  if (needsGate) {
    // ゲート有効時は相手のプロフィール・メッセージ本体をサーバー側で一切取得しない
    // （RSCペイロードへの解錠前データ混入を避けるため）。解錠後にクライアントから取得する。
    //
    // ルーム個別ロックがオンの場合は従来通り room:{roomId} スコープ（起動時ゲートの
    // 有無に関わらず、常にそのルーム固有の解錠が必要）。ルーム個別ロックがオフで
    // 起動時ゲートだけが有効な場合は launch スコープを再利用する。シェル側で既に
    // 解錠済み（sessionStorage["tiliqua-auth-gate:launch"]）のタブでは、この
    // AuthGateは同じキーを見て即座に解錠済みと判定し再入力を求めない。未解錠の
    // フレッシュタブから直接URLで来た場合は、シェル側のAuthGateがサイドバーごと
    // 何も表示しないため、そもそもこのページの出力は画面に現れない。
    const scopeKey = myMembership.auth_required ? `room:${roomId}` : "launch";
    const title = myMembership.auth_required
      ? "このチャットには鍵がかかっています"
      : "起動時の認証";

    return (
      <AuthGate scopeKey={scopeKey} title={title}>
        <GatedChatRoomLoader
          roomId={roomId}
          currentUserId={user.id}
          isTemporary={room.is_temporary}
          isGroup={room.is_group}
        />
      </AuthGate>
    );
  }

  // Phase 19: グループチャットUI M1。DM（相手1人）とグループ（複数人）で
  // 「相手」の取得方法が根本的に異なるため、ここで完全に分岐する。
  if (room.is_group) {
    const { data: memberRows } = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", roomId);

    if (!memberRows) {
      notFound();
    }

    const allMemberIds = memberRows.map((row) => row.user_id);

    // room_members.user_idはauth.users(id)を参照しprofiles(id)への直接FKが無いため、
    // PostgRESTのネスト埋め込みは使えず2段階のクエリになる（既存のDM側otherMember→
    // otherProfileと同じパターン）。
    const { data: memberProfiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", allMemberIds);

    const members = (memberProfiles ?? [])
      .filter((p) => p.id !== user.id)
      .map((p) => ({ id: p.id, displayName: p.display_name }));

    // blocksクエリは省略（グループには1対1のブロックUIが無いM1スコープの制約。
    // 既存のmessages_insert_member_not_blocked RLSは引き続き送信時に効く）。
    const [messagesResult, hiddenResult] = await Promise.all([
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
        .eq("user_id", user.id)
        .eq("messages.room_id", roomId),
    ]);

    const initialMessagesDesc = messagesResult.data;
    const initialMessages = [...(initialMessagesDesc ?? [])].reverse();
    const initialHasMore = (initialMessagesDesc?.length ?? 0) === PAGE_SIZE;

    const hiddenRows = hiddenResult.data;
    const initialHiddenMessageIds = (hiddenRows ?? []).map(
      (row) => row.message_id,
    );

    return (
      <ChatRoom
        roomId={roomId}
        currentUserId={user.id}
        peer={{
          kind: "group",
          roomName: room.name,
          memberCount: allMemberIds.length,
          members,
        }}
        initialMessages={initialMessages}
        initialHasMore={initialHasMore}
        initialIsBlockedByMe={false}
        initialHiddenMessageIds={initialHiddenMessageIds}
        initialAuthRequired={myMembership.auth_required}
        isTemporary={room.is_temporary}
      />
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

  // Phase 18: 以下3クエリはotherProfile確定後は互いに独立している
  // （blocksはotherProfile.idのみ、messages/message_hiddenはroomId/user.idのみに依存）ため
  // Promise.allでまとめて発行する。
  const [blockResult, messagesResult, hiddenResult] = await Promise.all([
    // blocks_select_ownのRLSにより、自分がブロックした相手かどうかのみ判定できる
    // （相手が自分をブロックしているかは見えない設計。schema.sql参照）
    supabase
      .from("blocks")
      .select("id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", otherProfile.id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    // FR-17: 自分がこのルームで非表示にしたメッセージのID一覧。ページングで古いメッセージを
    // 読み込んだ場合もクライアント側でこの一覧を使ってフィルタするため、ルーム全体分を一括取得する。
    supabase
      .from("message_hidden")
      .select("message_id, messages!inner(room_id)")
      .eq("user_id", user.id)
      .eq("messages.room_id", roomId),
  ]);

  const myBlockOfOther = blockResult.data;

  const initialMessagesDesc = messagesResult.data;
  const initialMessages = [...(initialMessagesDesc ?? [])].reverse();
  const initialHasMore = (initialMessagesDesc?.length ?? 0) === PAGE_SIZE;

  const hiddenRows = hiddenResult.data;
  const initialHiddenMessageIds = (hiddenRows ?? []).map((row) => row.message_id);

  return (
    <ChatRoom
      roomId={roomId}
      currentUserId={user.id}
      peer={{
        kind: "dm",
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
