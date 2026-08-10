"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  cancelFriendRequest,
  markFriendRequestsRead,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/app/actions/friends";
import { startDirectMessageWithUser } from "@/app/actions/rooms";
import { blockUser, unblockUser } from "@/app/actions/blocks";

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
 * ユーザー追加UI（FR-15）。PC/スマホの配置差（サイドバー/ボトムバー）は
 * Phase 7のレイアウト仕上げまでの暫定として、開閉式パネルに統一している。
 * フレンド申請の送受信・承認・拒否・取り消し（FR-11）もここに集約する。
 */
export function AddUserPanel({
  initialRequests,
  initialBlockedUsers,
}: {
  initialRequests: FriendRequestItem[];
  initialBlockedUsers: BlockedUserItem[];
}) {
  const [open, setOpen] = useState(false);
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
  const unreadCount = receivedPending.filter((r) => !r.isRead).length;

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  useEffect(() => {
    setBlockedUsers(initialBlockedUsers);
  }, [initialBlockedUsers]);

  useEffect(() => {
    if (!open || unreadCount === 0) return;
    void markFriendRequestsRead();
  }, [open, unreadCount]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length === 0) {
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
      const result = await sendFriendRequest(userId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setResults((prev) =>
        prev.map((r) =>
          r.userId === userId ? { ...r, friendshipStatus: "pending_sent" } : r,
        ),
      );
      router.refresh();
    });
  }

  function handleMessage(userId: string, existingRoomId: string | null) {
    setError(null);
    if (existingRoomId) {
      router.push(`/chat/${existingRoomId}`);
      return;
    }
    startTransition(async () => {
      const result = await startDirectMessageWithUser(userId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function handleBlock(userId: string) {
    setError(null);
    startTransition(async () => {
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
    });
  }

  function handleUnblock(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await unblockUser(userId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setBlockedUsers((prev) => prev.filter((u) => u.userId !== userId));
      router.refresh();
    });
  }

  function handleRespond(friendshipId: string, accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondToFriendRequest(friendshipId, accept);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRequests((prev) =>
        prev.filter((r) => r.friendshipId !== friendshipId),
      );
      router.refresh();
    });
  }

  function handleCancel(friendshipId: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelFriendRequest(friendshipId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRequests((prev) =>
        prev.filter((r) => r.friendshipId !== friendshipId),
      );
      router.refresh();
    });
  }

  return (
    <div className="border-b border-band/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex w-full items-center justify-between px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">＋</span> ユーザーを追加
        </span>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1.5 text-[10px] font-medium text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-4 px-6 pb-5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ユーザーIDで検索"
            className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
          />

          {error && (
            <p className="text-sm text-clay" role="alert">
              {error}
            </p>
          )}

          {searching && <p className="text-xs text-ink-muted">検索中...</p>}

          {results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((r) => (
                <li
                  key={r.userId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {r.displayName}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      @{r.username}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.friendshipStatus === "accepted" ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleMessage(r.userId, r.existingRoomId)
                        }
                        disabled={pending}
                        className="rounded-lg bg-tongue px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                      >
                        メッセージ
                      </button>
                    ) : r.friendshipStatus === "pending_sent" ? (
                      <span className="text-xs text-ink-muted">申請中</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAddFriend(r.userId)}
                          disabled={pending}
                          className="rounded-lg border border-tongue px-2.5 py-1 text-xs font-medium text-tongue disabled:opacity-60"
                        >
                          フレンド申請
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleMessage(r.userId, r.existingRoomId)
                          }
                          disabled={pending}
                          className="rounded-lg bg-tongue px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                        >
                          メッセージ
                        </button>
                      </>
                    )}
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
            <div className="flex flex-col gap-2">
              <p className="font-label text-xs uppercase tracking-wide text-ink-muted">
                届いているフレンド申請
              </p>
              <ul className="flex flex-col gap-2">
                {receivedPending.map((r) => (
                  <li
                    key={r.friendshipId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-2"
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
            <div className="flex flex-col gap-2">
              <p className="font-label text-xs uppercase tracking-wide text-ink-muted">
                送信したフレンド申請
              </p>
              <ul className="flex flex-col gap-2">
                {sentRequests.map((r) => (
                  <li
                    key={r.friendshipId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-2"
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
            <div className="flex flex-col gap-2">
              <p className="font-label text-xs uppercase tracking-wide text-ink-muted">
                ブロック中のユーザー
              </p>
              <ul className="flex flex-col gap-2">
                {blockedUsers.map((u) => (
                  <li
                    key={u.userId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-2"
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
      )}
    </div>
  );
}
