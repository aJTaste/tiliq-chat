"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeFriend } from "@/app/actions/friends";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import { CreateGroupPanel } from "./CreateGroupPanel";

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

const FRIENDSHIP_BADGE: Partial<Record<FriendshipStatus, string>> = {
  pending_sent: "申請中",
  pending_received: "申請あり",
  rejected: "未フレンド",
  none: "未フレンド",
};

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
  return (
    <div className="flex items-center">
      <Link
        href={`/chat/${item.roomId}`}
        className="flex min-w-0 flex-1 items-center gap-3 px-6 py-4 transition-colors hover:bg-surface-raised"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-sm text-ink-muted">
          {item.otherDisplayName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-ink">
              {item.otherDisplayName}
            </p>
            {item.friendshipStatus !== "accepted" && (
              <span className="shrink-0 rounded-full border border-band px-1.5 py-0.5 font-label text-[10px] text-ink-muted">
                {FRIENDSHIP_BADGE[item.friendshipStatus] ?? "未フレンド"}
              </span>
            )}
            {item.isTemporary && (
              <span className="shrink-0 rounded-full border border-clay/60 px-1.5 py-0.5 font-label text-[10px] text-clay">
                {formatRemainingTime(item.expiresAt) ?? "一時チャット"}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-ink-muted">
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
          className="mr-4 shrink-0 rounded-lg border border-band px-2 py-1 font-label text-[10px] text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
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
      className="flex min-w-0 flex-1 items-center gap-3 px-6 py-4 transition-colors hover:bg-surface-raised"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-sm text-ink-muted">
        {(item.groupName?.slice(0, 1) ?? item.memberNames[0]?.slice(0, 1)) ||
          "G"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-ink">{displayName}</p>
          <span className="shrink-0 rounded-full border border-band px-1.5 py-0.5 font-label text-[10px] text-ink-muted">
            {item.memberCount}人
          </span>
        </div>
        <p className="truncate text-sm text-ink-muted">
          {item.lastMessagePreview ?? "まだメッセージがありません"}
        </p>
      </div>
      <span className="shrink-0 text-[10px] text-ink-muted">
        {formatRelativeTime(item.lastMessageAt)}
      </span>
    </Link>
  );
}

type TabKey = "friends" | "strangers" | "group";

function TabButton({
  label,
  count,
  active,
  onClick,
  disabled,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative px-4 py-3 font-label text-xs uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "text-tongue" : "text-ink-muted hover:text-ink"
      }`}
    >
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="ml-1 text-ink-muted">({count})</span>
      )}
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-tongue" />
      )}
    </button>
  );
}

/**
 * ホーム画面の「フレンド／ストレンジャー／グループ」タブ（SRS 3.2.1）。
 * 「検索」タブはAddUserPanelがユーザー追加パネルとして兼ねているため統合。
 *
 * Phase 8: `app/actions/friends.ts`のremoveFriendはPhase 5から実装済みだったが
 * 呼び出すUIが無かったため、フレンド行に「解除」ボタンを追加した。一覧の更新は
 * AddUserPanel.tsxの他のハンドラと同じくrouter.refresh()で行う（このコンポーネント
 * 自身はconversationsをローカルstateへ複製せず、親から渡されたpropsをそのまま使う設計の
 * ため）。
 *
 * Phase 19: グループチャットUI M1。グループタブを有効化し、検索欄の代わりに
 * 「＋ グループを作成」ボタン→CreateGroupPanelの開閉を配置する。
 */
export function HomeTabs({
  conversations,
  loadError = false,
}: {
  conversations: ConversationItem[];
  loadError?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("friends");
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
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
    tab === "friends" ? friends : tab === "strangers" ? strangers : groupConversations;

  // FR-14: フレンド・ストレンジャー一覧内の検索（AddUserPanel.tsxの新規ユーザー追加検索＝
  // FR-15とは別物）。グループタブでは検索欄自体を表示しないため対象外。
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems =
    normalizedQuery.length === 0
      ? items
      : items.filter((item) =>
          isDmConversation(item)
            ? item.otherDisplayName.toLowerCase().includes(normalizedQuery) ||
              item.otherUsername.toLowerCase().includes(normalizedQuery)
            : false,
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
    <div className="flex flex-1 flex-col md:min-w-0">
      <div className="flex border-b border-band/60 px-2">
        <TabButton
          label="フレンド"
          count={friends.length}
          active={tab === "friends"}
          onClick={() => setTab("friends")}
        />
        <TabButton
          label="ストレンジャー"
          count={strangers.length}
          active={tab === "strangers"}
          onClick={() => setTab("strangers")}
        />
        <TabButton
          label="グループ"
          count={groupConversations.length}
          active={tab === "group"}
          onClick={() => setTab("group")}
        />
      </div>

      {!loadError && tab !== "group" && (
        <div className="px-6 py-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="フレンド・ストレンジャーを検索"
            aria-label="フレンド・ストレンジャーを検索"
            className="w-full rounded-lg border border-band bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
          />
        </div>
      )}

      {!loadError && tab === "group" && (
        <div className="px-6 py-2">
          <button
            type="button"
            onClick={() => setCreateGroupOpen((prev) => !prev)}
            className="w-full rounded-lg border border-band px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
          >
            {createGroupOpen ? "閉じる" : "＋ グループを作成"}
          </button>
          {createGroupOpen && (
            <div className="mt-2">
              <CreateGroupPanel onClose={() => setCreateGroupOpen(false)} />
            </div>
          )}
        </div>
      )}

      {removeError && (
        <p className="px-6 py-2 text-xs text-clay" role="alert">
          {removeError}
        </p>
      )}

      <div className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {loadError ? (
          <p className="px-6 py-8 text-center text-sm text-clay" role="alert">
            読み込みに失敗しました。再読み込みしてください。
          </p>
        ) : items.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-ink-muted">
            {tab === "friends"
              ? "まだフレンドとの会話がありません。"
              : tab === "strangers"
                ? "まだストレンジャーとの会話がありません。"
                : "まだグループチャットがありません。"}
          </p>
        ) : filteredItems.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-ink-muted">
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
