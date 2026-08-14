"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeFriend } from "@/app/actions/friends";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

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
    }
  | {
      kind: "group";
      roomId: string;
      groupName: string | null;
      memberNames: string[];
      memberCount: number;
      lastMessagePreview: string | null;
      lastMessageAt: string | null;
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
}: {
  item: Extract<ConversationItem, { kind: "dm" }>;
  onRemoveFriend: (userId: string, displayName: string) => void;
  removingUserId: string | null;
}) {
  // Phase 8: フレンド解除ボタンを追加。行全体がLinkのため、Link内にbuttonを
  // ネストしない（無効なHTML構造を避ける）よう、Linkとbuttonを兄弟要素として
  // 横並びにしている。
  // デザイン修正：友情状態チップ（「未フレンド」「申請中」等）は情報として不要と
  // 判断され削除した。一覧は「誰と・いつ・何を話したか」の3点に絞る。
  return (
    <div className="flex items-center">
      <Link
        href={`/chat/${item.roomId}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-raised"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-xs text-ink-muted">
          {item.otherDisplayName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-ink">
              {item.otherDisplayName}
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
        <span className="shrink-0 text-[10px] text-ink-muted">
          {formatRelativeTime(item.lastMessageAt)}
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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-xs text-ink-muted">
        {(item.groupName?.slice(0, 1) ?? item.memberNames[0]?.slice(0, 1)) ||
          "G"}
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
      <span className="shrink-0 text-[10px] text-ink-muted">
        {formatRelativeTime(item.lastMessageAt)}
      </span>
    </Link>
  );
}

type TabKey = "all" | "friends" | "strangers" | "group";

/**
 * サイドバー「一覧」タブの中身（SRS 3.2.1）。「すべて／フレンド／ストレンジャー／
 * グループ」の4サブフィルタを持つ。「すべて」は全種別を直近メッセージ順に統合した
 * ビューで、フレンド/ストレンジャー/グループは従来通りの絞り込み表示（サイドバー
 * UI再設計で追加）。サブフィルタの切替はデザイン修正でタブボタン列から
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
  const router = useRouter();

  const dmConversations = conversations.filter(isDmConversation);
  const groupConversations = conversations.filter(isGroupConversation);

  const friends = dmConversations.filter(
    (c) => c.friendshipStatus === "accepted",
  );
  const strangers = dmConversations.filter(
    (c) => c.friendshipStatus !== "accepted",
  );

  const items: ConversationItem[] =
    tab === "all"
      ? [...conversations].sort(byLastMessageDesc)
      : tab === "friends"
        ? friends
        : tab === "strangers"
          ? strangers
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
              item.otherUsername.toLowerCase().includes(normalizedQuery)
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
                  />
                ) : (
                  <GroupConversationRow item={item} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
