import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import { NewDmForm } from "@/components/chat/NewDmForm";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RoomListItem = {
  roomId: string;
  otherDisplayName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  const rooms = await fetchRoomList(supabase, user.id);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-band/60 px-6 py-4">
        <div>
          <p className="font-label text-xs uppercase tracking-[0.25em] text-ink-muted">
            Tiliqua
          </p>
          <h1 className="font-display text-lg font-semibold text-ink">
            {profile?.display_name ?? user.email}
          </h1>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
          >
            ログアウト
          </button>
        </form>
      </header>

      <section className="border-b border-band/60 px-6 py-4">
        <NewDmForm />
      </section>

      <section className="flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-ink-muted">
            まだチャットがありません。上のフォームからユーザーIDを指定してDMを開始できます。
          </p>
        ) : (
          <ul className="divide-y divide-band/60">
            {rooms.map((room) => (
              <li key={room.roomId}>
                <Link
                  href={`/chat/${room.roomId}`}
                  className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-surface-raised"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-sm text-ink-muted">
                    {room.otherDisplayName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {room.otherDisplayName}
                    </p>
                    <p className="truncate text-sm text-ink-muted">
                      {room.lastMessagePreview ?? "まだメッセージがありません"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ---- ルーム一覧取得ロジック ----
// Phase 3 MVP方針：フレンド機能（Phase 5）が未実装のため、
// 自分が参加している「DM（is_group=false）ルーム」のみを対象に、
// 直近メッセージ時刻の降順で一覧化する。
// N+1気味の複数クエリだが、Phase 3時点ではルーム数が小さいため許容し、
// 件数が増えてきたらビュー化・RPC化を検討する（要検討事項としてCLAUDE.mdに記録予定）。
async function fetchRoomList(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<RoomListItem[]> {
  // 1. 自分が参加しているルームID一覧
  const { data: myMemberships } = await supabase
    .from("room_members")
    .select("room_id")
    .eq("user_id", userId);

  const roomIds = (myMemberships ?? []).map((m) => m.room_id);
  if (roomIds.length === 0) return [];

  // 2. 各ルームの「自分以外のメンバー」（DM想定なので1名）
  const { data: otherMembers } = await supabase
    .from("room_members")
    .select("room_id, user_id")
    .in("room_id", roomIds)
    .neq("user_id", userId);

  const otherUserIds = Array.from(
    new Set((otherMembers ?? []).map((m) => m.user_id)),
  );

  // 3. 相手のプロフィール
  const { data: otherProfiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", otherUserIds.length > 0 ? otherUserIds : [""]);

  const profileMap = new Map((otherProfiles ?? []).map((p) => [p.id, p]));
  const roomToOtherUser = new Map(
    (otherMembers ?? []).map((m) => [m.room_id, m.user_id]),
  );

  // 4. 各ルームの直近メッセージ（論理削除除く）
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("room_id, content, image_url, created_at")
    .in("room_id", roomIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const lastMessageByRoom = new Map<
    string,
    { content: string | null; image_url: string | null; created_at: string }
  >();
  for (const m of recentMessages ?? []) {
    if (!lastMessageByRoom.has(m.room_id)) {
      lastMessageByRoom.set(m.room_id, m);
    }
  }

  const items: RoomListItem[] = roomIds.map((roomId) => {
    const otherUserId = roomToOtherUser.get(roomId);
    const otherProfile = otherUserId ? profileMap.get(otherUserId) : undefined;
    const lastMessage = lastMessageByRoom.get(roomId);

    return {
      roomId,
      otherDisplayName: otherProfile?.display_name ?? "不明なユーザー",
      lastMessagePreview: lastMessage
        ? (lastMessage.content ?? (lastMessage.image_url ? "📷 画像" : null))
        : null,
      lastMessageAt: lastMessage?.created_at ?? null,
    };
  });

  // 直近メッセージ時刻の降順（メッセージが無いルームは末尾）
  items.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0;
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });

  return items;
}
