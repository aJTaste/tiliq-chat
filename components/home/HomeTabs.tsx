"use client";

import { useState } from "react";
import Link from "next/link";

export type FriendshipStatus =
  | "accepted"
  | "pending_sent"
  | "pending_received"
  | "rejected"
  | "none";

export type ConversationItem = {
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
};

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

function ConversationRow({ item }: { item: ConversationItem }) {
  return (
    <Link
      href={`/chat/${item.roomId}`}
      className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-surface-raised"
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
 * 「検索」タブはAddUserPanelがユーザー追加パネルとして兼ねているため統合し、
 * グループチャットUIはPhase未割り当て（CLAUDE.md参照）のためプレースホルダーとする。
 */
export function HomeTabs({
  conversations,
}: {
  conversations: ConversationItem[];
}) {
  const [tab, setTab] = useState<TabKey>("friends");

  const friends = conversations.filter(
    (c) => c.friendshipStatus === "accepted",
  );
  const strangers = conversations.filter(
    (c) => c.friendshipStatus !== "accepted",
  );

  const items =
    tab === "friends" ? friends : tab === "strangers" ? strangers : [];

  return (
    <div className="flex flex-1 flex-col">
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
          active={tab === "group"}
          onClick={() => setTab("group")}
          disabled
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "group" ? (
          <p className="px-6 py-8 text-center text-sm text-ink-muted">
            グループチャットは準備中です。
          </p>
        ) : items.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-ink-muted">
            {tab === "friends"
              ? "まだフレンドとの会話がありません。"
              : "まだストレンジャーとの会話がありません。"}
          </p>
        ) : (
          <ul className="divide-y divide-band/60">
            {items.map((item) => (
              <li key={item.roomId}>
                <ConversationRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
