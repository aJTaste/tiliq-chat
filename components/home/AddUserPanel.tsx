"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  cancelFriendRequest,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/app/actions/friends";
import { startDirectMessageWithUser } from "@/app/actions/rooms";
import { blockUser, unblockUser } from "@/app/actions/blocks";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

export type FriendRequestItem = {
  friendshipId: string;
  direction: "received" | "sent";
  counterpartId: string;
  counterpartUsername: string;
  counterpartDisplayName: string;
  status: string;
  isRead: boolean;
};

export type BlockedUserItem = {
  userId: string;
  username: string;
  displayName: string;
};

type SearchResult = {
  userId: string;
  username: string;
  displayName: string;
  friendshipStatus: string;
  existingRoomId: string | null;
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * サイドバーUI再設計：ユーザー検索・DM開始・フレンド申請の送受信/承認/拒否/取り消し
 * （FR-11）・簡易ブロック/ブロック解除を集約する「検索」タブの中身。
 *
 * 表示/非表示自体は親（components/home/SidebarNav.tsx）の`activeView`状態で
 * 制御されるため、このコンポーネント自身は開閉chrome（旧`open` state・固定配置・
 * PC常時展開）を持たない。未読フレンド申請バッジの表示・既読化トリガーも
 * SidebarNav.tsx側に移した（`activeView === "search"`になった瞬間に発火するため、
 * PC・モバイル問わず一貫して自動既読化される。旧実装のPhase13の既知の制約
 * 「PCでは未読バッジが自動で消えない」はこの移管により解消される）。
 *
 * 一時チャット作成用の有効期限セレクターは`components/home/CreateTempChatPanel.tsx`
 * （サイドバー「＋」メニュー経由）へ移設した。ここでの「メッセージ」ボタンは常に
 * 通常のDM開始（`startDirectMessageWithUser`）のみを行う。
 */
export function AddUserPanel({
  initialRequests,
  initialBlockedUsers,
}: {
  initialRequests: FriendRequestItem[];
  initialBlockedUsers: BlockedUserItem[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState(initialRequests);
  const [blockedUsers, setBlockedUsers] = useState(initialBlockedUsers);
  const [pending, startTransition] = useTransition();
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const receivedPending = requests.filter(
    (r) => r.direction === "received" && r.status === "pending",
  );
  const sentRequests = requests.filter((r) => r.direction === "sent");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequests(initialRequests);
  }, [initialRequests]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlockedUsers(initialBlockedUsers);
  }, [initialBlockedUsers]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const { data, error: searchError } = await supabase.rpc(
          "search_users",
          {
            p_query: trimmed,
          },
        );
        setSearching(false);
        if (searchError || !data) {
          setResults([]);
          return;
        }
        setResults(
          data.map((row) => ({
            userId: row.user_id,
            username: row.username,
            displayName: row.display_name,
            friendshipStatus: row.friendship_status,
            existingRoomId: row.existing_room_id ?? null,
          })),
        );
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, supabase]);

  function handleAddFriend(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendFriendRequest(userId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setResults((prev) =>
          prev.map((r) =>
            r.userId === userId
              ? { ...r, friendshipStatus: "pending_sent" }
              : r,
          ),
        );
        router.refresh();
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleMessage(userId: string, existingRoomId: string | null) {
    setError(null);
    if (existingRoomId) {
      router.push(`/chat/${existingRoomId}`);
      return;
    }

    startTransition(async () => {
      try {
        const result = await startDirectMessageWithUser(userId);
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        // startDirectMessageWithUserは成功時にredirect()を呼ぶため、Next.jsの内部
        // シグナル（digest付きエラー）をここで再送出してから、それ以外（オフライン等の
        // 真の通信エラー）だけを扱う。
        unstable_rethrow(err);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleBlock(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await blockUser(userId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        const blockedTarget = results.find((r) => r.userId === userId);
        setResults((prev) => prev.filter((r) => r.userId !== userId));
        setRequests((prev) =>
          prev.filter(
            (r) => r.direction !== "sent" || r.counterpartId !== userId,
          ),
        );
        if (blockedTarget) {
          setBlockedUsers((prev) => [
            ...prev,
            {
              userId: blockedTarget.userId,
              username: blockedTarget.username,
              displayName: blockedTarget.displayName,
            },
          ]);
        }
        router.refresh();
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleUnblock(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await unblockUser(userId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setBlockedUsers((prev) => prev.filter((u) => u.userId !== userId));
        router.refresh();
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleRespond(friendshipId: string, accept: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await respondToFriendRequest(friendshipId, accept);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setRequests((prev) =>
          prev.filter((r) => r.friendshipId !== friendshipId),
        );
        router.refresh();
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleCancel(friendshipId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelFriendRequest(friendshipId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setRequests((prev) =>
          prev.filter((r) => r.friendshipId !== friendshipId),
        );
        router.refresh();
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ユーザーIDで検索"
        aria-label="ユーザーIDで検索"
        className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
      />

      {error && (
        <p className="text-sm text-clay" role="alert">
          {error}
        </p>
      )}

      {searching && <p className="text-xs text-ink-muted">検索中...</p>}

      {!searching && query.trim().length > 0 && results.length === 0 && (
        <p className="text-xs text-ink-muted">
          ユーザーが見つかりませんでした。
        </p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {results.map((r) => (
            <li
              key={r.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {r.displayName}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  @{r.username}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-1.5">
                {/* Phase 16: 「メッセージ」ボタンはフレンド状態に関わらず常に表示する。
                    DM開始はフレンド関係を要求しないため（get_or_create_dm_room参照）、
                    以前は申請中(pending_sent)の間だけボタンが「申請中」表示に置き換わって
                    消えてしまっていた不具合を修正（申請中ラベルとメッセージボタンを併存させる）。 */}
                {r.friendshipStatus === "pending_sent" && (
                  <span className="text-xs text-ink-muted">申請中</span>
                )}
                {r.friendshipStatus !== "accepted" &&
                  r.friendshipStatus !== "pending_sent" && (
                    <button
                      type="button"
                      onClick={() => handleAddFriend(r.userId)}
                      disabled={pending}
                      className="rounded-lg border border-tongue px-2.5 py-1 text-xs font-medium text-tongue disabled:opacity-60"
                    >
                      フレンド申請
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => handleMessage(r.userId, r.existingRoomId)}
                  disabled={pending}
                  className="rounded-lg bg-tongue px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  メッセージ
                </button>
                <button
                  type="button"
                  onClick={() => handleBlock(r.userId)}
                  disabled={pending}
                  className="text-xs text-ink-muted underline underline-offset-2 disabled:opacity-60"
                >
                  ブロック
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {receivedPending.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-label text-xs uppercase tracking-wide text-ink-muted">
            届いているフレンド申請
          </p>
          <ul className="flex flex-col gap-1.5">
            {receivedPending.map((r) => (
              <li
                key={r.friendshipId}
                className="flex items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.counterpartDisplayName}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    @{r.counterpartUsername}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRespond(r.friendshipId, true)}
                    disabled={pending}
                    className="rounded-lg bg-tongue px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                  >
                    承認
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(r.friendshipId, false)}
                    disabled={pending}
                    className="rounded-lg border border-band px-2.5 py-1 text-xs text-ink-muted disabled:opacity-60"
                  >
                    拒否
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sentRequests.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-label text-xs uppercase tracking-wide text-ink-muted">
            送信したフレンド申請
          </p>
          <ul className="flex flex-col gap-1.5">
            {sentRequests.map((r) => (
              <li
                key={r.friendshipId}
                className="flex items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.counterpartDisplayName}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {r.status === "rejected"
                      ? "拒否されました"
                      : "承認待ち"}
                  </p>
                </div>
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleCancel(r.friendshipId)}
                    disabled={pending}
                    className="shrink-0 text-xs text-ink-muted underline underline-offset-2 disabled:opacity-60"
                  >
                    取り消す
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {blockedUsers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-label text-xs uppercase tracking-wide text-ink-muted">
            ブロック中のユーザー
          </p>
          <ul className="flex flex-col gap-1.5">
            {blockedUsers.map((u) => (
              <li
                key={u.userId}
                className="flex items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {u.displayName}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    @{u.username}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(u.userId)}
                  disabled={pending}
                  className="shrink-0 rounded-lg border border-band px-2.5 py-1 text-xs text-ink-muted disabled:opacity-60"
                >
                  ブロック解除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
