"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeFriend } from "@/app/actions/friends";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import { useRowContextMenu } from "@/lib/hooks/useRowContextMenu";
import { CreateTempChatWithUserModal } from "./CreateTempChatWithUserModal";

export type FriendshipStatus =
  | "accepted"
  | "pending_sent"
  | "pending_received"
  | "rejected"
  | "none";

// Phase 19: グループチャットUI M1。DM一覧・グループ一覧を同じ配列で扱うため
// 判別共用体にした（`kind`で分岐）。
export type ConversationItem =
  | {
      kind: "dm";
      roomId: string;
      otherUserId: string;
      otherUsername: string;
      otherDisplayName: string;
      otherAvatarUrl: string | null;
      friendshipStatus: FriendshipStatus;
      lastMessagePreview: string | null;
      lastMessageAt: string | null;
      isTemporary: boolean;
      expiresAt: string | null;
      // Phase 28: 一時チャットの名前付け。設定時はotherDisplayNameより優先して表示する。
      roomName: string | null;
      // Phase 31: サイドバー一覧への既読状態反映。ChatRoom.tsxのreadBadgeと同じ
      // 「自分が送った直近メッセージが読まれたか」の意味。自分が最後の送信者でない、
      // またはまだ未読なら false（バッジ非表示）。
      lastMessageRead: boolean;
    }
  | {
      kind: "group";
      roomId: string;
      groupName: string | null;
      avatarUrl: string | null;
      memberNames: string[];
      memberCount: number;
      lastMessagePreview: string | null;
      lastMessageAt: string | null;
      // Phase 31: 自分が送った直近メッセージを読んだメンバー数。read_receipts_enabled
      // がオフ、または直近メッセージが自分の送信でない場合はnull（バッジ非表示）。
      lastMessageReadCount: number | null;
    };

function isDmConversation(
  item: ConversationItem,
): item is Extract<ConversationItem, { kind: "dm" }> {
  return item.kind === "dm";
}

function isGroupConversation(
  item: ConversationItem,
): item is Extract<ConversationItem, { kind: "group" }> {
  return item.kind === "group";
}

// サイドバーUI再設計：「すべて」タブ用に、DM・グループを直近メッセージ順で統合
// ソートする。両バリアントとも`lastMessageAt`を持つ判別共用体のため型的な障害は
// 無い。まだメッセージが無い会話（null）は最下部に送る。
function byLastMessageDesc(a: ConversationItem, b: ConversationItem): number {
  if (!a.lastMessageAt && !b.lastMessageAt) return 0;
  if (!a.lastMessageAt) return 1;
  if (!b.lastMessageAt) return -1;
  return (
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;

  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// FR-10/3.7: 一時チャットの残り時間バッジ表示用
function formatRemainingTime(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "期限切れ";

  const diffMin = Math.ceil(diffMs / 60000);
  if (diffMin < 60) return `残り${diffMin}分`;

  const diffHour = Math.ceil(diffMin / 60);
  if (diffHour < 24) return `残り${diffHour}時間`;

  const diffDay = Math.ceil(diffHour / 24);
  return `残り${diffDay}日`;
}

function ConversationRow({
  item,
  onRemoveFriend,
  removingUserId,
  onCreateTempChat,
}: {
  item: Extract<ConversationItem, { kind: "dm" }>;
  onRemoveFriend: (userId: string, displayName: string) => void;
  removingUserId: string | null;
  onCreateTempChat: (userId: string, displayName: string, username: string) => void;
}) {
  // Phase 8: フレンド解除ボタンを追加。行全体がLinkのため、Link内にbuttonを
  // ネストしない（無効なHTML構造を避ける）よう、Linkとbuttonを兄弟要素として
  // 横並びにしている。
  // デザイン修正：友情状態チップ（「未フレンド」「申請中」等）は情報として不要と
  // 判断され削除した。一覧は「誰と・いつ・何を話したか」の3点に絞る。
  // Phase 25: 右クリック/長押しで「一時チャットを作成」を選べるその場メニューを追加。
  // MessageBubble.tsxと同じ「常時は隠れたケバブボタン（ホバー/フォーカスで表示、
  // キーボード操作対応）＋右クリック/長押しの併用」パターンをuseRowContextMenuに
  // 切り出して使う。
  const { open, setOpen, close, wrapperRef, rowHandlers } =
    useRowContextMenu<HTMLDivElement>();

  return (
    <div
      ref={wrapperRef}
      className="group relative flex items-center"
      {...rowHandlers}
    >
      <Link
        href={`/chat/${item.roomId}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-raised"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-xs text-ink-muted">
          {item.otherDisplayName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Phase 28: 一時チャットに名前が付いていればそちらを優先表示する
                （アバターの頭文字は識別性維持のため相手の実名基準のまま据え置き）。 */}
            <p className="truncate text-sm font-medium text-ink">
              {item.roomName ?? item.otherDisplayName}
            </p>
            {item.isTemporary && (
              <span className="shrink-0 rounded-full border border-clay/60 px-1.5 py-0.5 font-label text-[10px] text-clay">
                {formatRemainingTime(item.expiresAt) ?? "一時チャット"}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-ink-muted">
            {item.lastMessagePreview ?? "まだメッセージがありません"}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-ink-muted">
          {formatRelativeTime(item.lastMessageAt)}
          {/* Phase 31: チャット画面内の既読バッジ（MessageBubble.tsx）と同じ文言・
              同じ条件（自分が送った直近メッセージが読まれた場合のみ）を一覧にも表示する。 */}
          {item.lastMessageRead && <span className="text-tongue">既読</span>}
        </span>
      </Link>
      {item.friendshipStatus === "accepted" && (
        <button
          type="button"
          onClick={() =>
            onRemoveFriend(item.otherUserId, item.otherDisplayName)
          }
          disabled={removingUserId === item.otherUserId}
          aria-label={`${item.otherDisplayName}とのフレンドを解除`}
          className="mr-3 shrink-0 rounded-lg border border-band px-2 py-1 font-label text-[10px] text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
        >
          解除
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`${item.otherDisplayName}の操作`}
        className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted opacity-0 transition-opacity hover:bg-band/30 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-2 top-full z-10 mt-1 flex w-48 flex-col overflow-hidden rounded-lg border border-band bg-surface-raised text-xs shadow-lg">
          <button
            type="button"
            onClick={() => {
              close();
              onCreateTempChat(
                item.otherUserId,
                item.otherDisplayName,
                item.otherUsername,
              );
            }}
            className="whitespace-nowrap px-3 py-2 text-left text-ink transition-colors hover:bg-band/30"
          >
            一時チャットを作成
          </button>
        </div>
      )}
    </div>
  );
}

// Phase 19: グループチャットUI M1。DM用ConversationRowと違い「相手1人」の
// プロフィール情報が無いため、グループ名 or メンバー名の連結＋人数バッジで表示する。
// メンバー管理（追加・削除・退出）UIはM1スコープ外のため「解除」相当のボタンは無い。
function GroupConversationRow({ item }: { item: ConversationItem & { kind: "group" } }) {
  const displayName =
    item.groupName ?? item.memberNames.join("、") ?? "グループ";

  return (
    <Link
      href={`/chat/${item.roomId}`}
      className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-raised"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-band/60 font-label text-xs text-ink-muted">
        {item.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/imageは不採用（docs/lessons.md参照）。
          <img
            src={item.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          (item.groupName?.slice(0, 1) ?? item.memberNames[0]?.slice(0, 1)) ||
          "G"
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{displayName}</p>
          <span className="shrink-0 rounded-full border border-band px-1.5 py-0.5 font-label text-[10px] text-ink-muted">
            {item.memberCount}人
          </span>
        </div>
        <p className="truncate text-xs text-ink-muted">
          {item.lastMessagePreview ?? "まだメッセージがありません"}
        </p>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-ink-muted">
        {formatRelativeTime(item.lastMessageAt)}
        {/* Phase 31: グループはChatRoom.tsxと同じ「既読N」件数表示（既読者の名前列挙は
            人数が多いと煩雑になるため、既存のチャット画面内既読バッジと同様に件数のみ）。
            ChatRoom.tsxのreadBadgeと同じく、既読0件（誰もまだ読んでいない）の間は
            バッジ自体を出さない（「既読0」表示は情報として不要なノイズのため）。 */}
        {item.lastMessageReadCount !== null && item.lastMessageReadCount > 0 && (
          <span className="text-tongue">既読{item.lastMessageReadCount}</span>
        )}
      </span>
    </Link>
  );
}

type TabKey = "all" | "friends" | "strangers" | "temp" | "group";

/**
 * サイドバー「一覧」タブの中身（SRS 3.2.1）。「すべて／フレンド／ストレンジャー／
 * 一時チャット／グループ」の5サブフィルタを持つ。「すべて」は全種別を直近メッセージ順に
 * 統合したビューで、フレンド/ストレンジャー/一時チャット/グループは従来通りの絞り込み
 * 表示（サイドバーUI再設計で追加）。サブフィルタの切替はデザイン修正でタブボタン列から
 * `<select>`に変更した（縦方向のスペースを取らないようにするため、検索欄と
 * 同じ行に配置）。グループ作成の導線（旧：グループタブ内のインライン展開）は
 * サイドバー「＋」メニュー（components/home/SidebarNav.tsx）に移管したため、
 * このコンポーネントはCreateGroupPanel.tsxを知らない。
 *
 * Phase 8: `app/actions/friends.ts`のremoveFriendはPhase 5から実装済みだったが
 * 呼び出すUIが無かったため、フレンド行に「解除」ボタンを追加した。一覧の更新は
 * AddUserPanel.tsxの他のハンドラと同じくrouter.refresh()で行う（このコンポーネント
 * 自身はconversationsをローカルstateへ複製せず、親から渡されたpropsをそのまま使う設計の
 * ため）。
 *
 * Phase 25: 「一時チャット」サブフィルタを追加（isTemporary=trueのDMのみ。一時
 * グループという概念は無いためgroupConversationsは対象外）。「すべて」タブでの
 * 通常DM/一時チャットの区別は元々ConversationRowのisTemporaryバッジで済んでいた
 * ため変更不要（通常DMの見た目は据え置き）。ConversationRowの右クリック/長押し
 * メニューから開く一時チャット作成モーダル（CreateTempChatWithUserModal）の
 * 対象ユーザーはこのコンポーネントでstateとして持つ（行ごとに個別のモーダルstateを
 * 持たせると同時に複数開けてしまうため、一覧全体で1つに統一する）。
 */
export function HomeTabs({
  conversations,
  loadError = false,
}: {
  conversations: ConversationItem[];
  loadError?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tempChatTarget, setTempChatTarget] = useState<{
    userId: string;
    displayName: string;
    username: string;
  } | null>(null);
  const router = useRouter();

  const dmConversations = conversations.filter(isDmConversation);
  const groupConversations = conversations.filter(isGroupConversation);

  const friends = dmConversations.filter(
    (c) => c.friendshipStatus === "accepted",
  );
  const strangers = dmConversations.filter(
    (c) => c.friendshipStatus !== "accepted",
  );
  const tempChats = dmConversations.filter((c) => c.isTemporary);

  const items: ConversationItem[] =
    tab === "all"
      ? [...conversations].sort(byLastMessageDesc)
      : tab === "friends"
        ? friends
        : tab === "strangers"
          ? strangers
          : tab === "temp"
            ? tempChats
            : groupConversations;

  // FR-14: フレンド・ストレンジャー・グループ一覧内の検索（AddUserPanel.tsxの
  // 新規ユーザー追加検索＝FR-15とは別物）。統合ビューでも一貫性を保つため、
  // グループも名前・メンバー名で検索対象に含める。
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems =
    normalizedQuery.length === 0
      ? items
      : items.filter((item) =>
          isDmConversation(item)
            ? item.otherDisplayName.toLowerCase().includes(normalizedQuery) ||
              item.otherUsername.toLowerCase().includes(normalizedQuery) ||
              (item.roomName?.toLowerCase().includes(normalizedQuery) ?? false)
            : (item.groupName?.toLowerCase().includes(normalizedQuery) ??
                false) ||
              item.memberNames.some((name) =>
                name.toLowerCase().includes(normalizedQuery),
              ),
        );

  function handleRemoveFriend(userId: string, displayName: string) {
    if (!window.confirm(`${displayName}とのフレンドを解除しますか？`)) {
      return;
    }
    setRemoveError(null);
    setRemovingUserId(userId);
    void (async () => {
      try {
        const result = await removeFriend(userId);
        if (!result.success) {
          setRemoveError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setRemoveError(NETWORK_ERROR_MESSAGE);
      } finally {
        setRemovingUserId(null);
      }
    })();
  }

  return (
    <div className="flex flex-1 flex-col">
      {!loadError && (
        <div className="flex gap-2 px-4 py-2">
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value as TabKey)}
            aria-label="会話の絞り込み"
            className="w-32 shrink-0 rounded-lg border border-band bg-surface-raised px-2 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
          >
            <option value="all">すべて</option>
            <option value="friends">フレンド</option>
            <option value="strangers">ストレンジャー</option>
            <option value="temp">一時チャット</option>
            <option value="group">グループ</option>
          </select>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="会話を検索"
            aria-label="会話を検索"
            className="min-w-0 flex-1 rounded-lg border border-band bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
          />
        </div>
      )}

      {removeError && (
        <p className="px-4 py-2 text-xs text-clay" role="alert">
          {removeError}
        </p>
      )}

      <div className="flex-1 overflow-y-auto">
        {loadError ? (
          <p className="px-4 py-8 text-center text-sm text-clay" role="alert">
            読み込みに失敗しました。再読み込みしてください。
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            {tab === "all"
              ? "まだ会話がありません。"
              : tab === "friends"
                ? "まだフレンドとの会話がありません。"
                : tab === "strangers"
                  ? "まだストレンジャーとの会話がありません。"
                  : tab === "temp"
                    ? "まだ一時チャットがありません。"
                    : "まだグループチャットがありません。"}
          </p>
        ) : filteredItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            検索条件に一致する会話がありません。
          </p>
        ) : (
          <ul className="divide-y divide-band/60">
            {filteredItems.map((item) => (
              <li key={item.roomId}>
                {isDmConversation(item) ? (
                  <ConversationRow
                    item={item}
                    onRemoveFriend={handleRemoveFriend}
                    removingUserId={removingUserId}
                    onCreateTempChat={(userId, displayName, username) =>
                      setTempChatTarget({ userId, displayName, username })
                    }
                  />
                ) : (
                  <GroupConversationRow item={item} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {tempChatTarget && (
        <CreateTempChatWithUserModal
          targetUserId={tempChatTarget.userId}
          targetDisplayName={tempChatTarget.displayName}
          targetUsername={tempChatTarget.username}
          onClose={() => setTempChatTarget(null)}
        />
      )}
    </div>
  );
}
