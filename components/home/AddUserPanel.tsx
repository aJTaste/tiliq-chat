"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  cancelFriendRequest,
  markFriendRequestsRead,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/app/actions/friends";
import {
  startDirectMessageWithUser,
  startTemporaryDirectMessage,
  type TempDmDurationOption,
} from "@/app/actions/rooms";
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

type DurationSelection = "normal" | TempDmDurationOption;

// FR-10/3.7: 新規DM作成時のみ有効期限を選べる（既存DMを一時チャット化する機能は対象外）。
const DURATION_OPTIONS: { value: DurationSelection; label: string }[] = [
  { value: "normal", label: "通常のDM" },
  { value: "10m", label: "10分" },
  { value: "1h", label: "1時間" },
  { value: "24h", label: "24時間" },
  { value: "7d", label: "7日間" },
  { value: "custom", label: "カスタム" },
];

/**
 * ユーザー追加UI（FR-15）。PCではサイドバー・スマホではビューポート下部に固定した
 * ボトムバーとして配置する（Phase 9。CSSメディアクエリのみで切り替え、JSでの
 * ブレークポイント判定はしない。AuthGate.tsx/OfflineBanner.tsxが「SSR時はnull→
 * マウント後に実値」という回避策を取っているのと同種のハイドレーション不一致リスクを
 * 避けるため）。PCでは常時展開（Phase 13。パネル本体は常にマウントし`md:flex`で
 * 強制表示することで実現。`open` stateはスマホの折りたたみ制御にのみ意味を持つ）。
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
  const [durationByUser, setDurationByUser] = useState<
    Record<string, DurationSelection>
  >({});
  const [customByUser, setCustomByUser] = useState<
    Record<string, { amount: string; unit: "minutes" | "hours" | "days" }>
  >({});
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequests(initialRequests);
  }, [initialRequests]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlockedUsers(initialBlockedUsers);
  }, [initialBlockedUsers]);

  useEffect(() => {
    if (!open || unreadCount === 0) return;
    // 既読化はバックグラウンド処理のため、通信エラー等で失敗してもUI上は無視する
    // （未処理のPromise rejectionにならないようにcatchのみ行う）。
    markFriendRequestsRead().catch(() => {});
  }, [open, unreadCount]);

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

    const duration = durationByUser[userId] ?? "normal";

    if (duration === "custom") {
      const amount = Number(customByUser[userId]?.amount ?? "");
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("有効期限を正しく入力してください。");
        return;
      }
    }

    startTransition(async () => {
      try {
        const result =
          duration === "normal"
            ? await startDirectMessageWithUser(userId)
            : await startTemporaryDirectMessage(
                userId,
                duration,
                duration === "custom"
                  ? {
                      amount: Number(customByUser[userId]?.amount ?? "0"),
                      unit: customByUser[userId]?.unit ?? "hours",
                    }
                  : undefined,
              );
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        // startDirectMessageWithUser/startTemporaryDirectMessageは成功時にredirect()を
        // 呼ぶため、Next.jsの内部シグナル（digest付きエラー）をここで再送出してから、
        // それ以外（オフライン等の真の通信エラー）だけを扱う。
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
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-band/60 bg-surface md:static md:z-auto md:w-72 md:shrink-0 md:border-t-0 md:border-b-0 md:border-r md:border-band/60">
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

      <div
        className={`${open ? "flex" : "hidden"} max-h-[70vh] flex-col gap-4 overflow-y-auto px-6 pb-5 md:flex md:max-h-none`}
      >
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
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <li
                key={r.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-band/60 px-3 py-2"
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
                  {!r.existingRoomId && (
                    <select
                      value={durationByUser[r.userId] ?? "normal"}
                      onChange={(e) =>
                        setDurationByUser((prev) => ({
                          ...prev,
                          [r.userId]: e.target.value as DurationSelection,
                        }))
                      }
                      aria-label="有効期限"
                      className="rounded-lg border border-band bg-surface px-1.5 py-1 text-xs text-ink-muted"
                    >
                      {DURATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {!r.existingRoomId &&
                    durationByUser[r.userId] === "custom" && (
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          value={customByUser[r.userId]?.amount ?? ""}
                          onChange={(e) =>
                            setCustomByUser((prev) => ({
                              ...prev,
                              [r.userId]: {
                                amount: e.target.value,
                                unit: prev[r.userId]?.unit ?? "hours",
                              },
                            }))
                          }
                          aria-label="有効期限（数値）"
                          className="w-14 rounded-lg border border-band bg-surface px-1.5 py-1 text-xs text-ink"
                        />
                        <select
                          value={customByUser[r.userId]?.unit ?? "hours"}
                          onChange={(e) =>
                            setCustomByUser((prev) => ({
                              ...prev,
                              [r.userId]: {
                                amount: prev[r.userId]?.amount ?? "",
                                unit: e.target.value as
                                  | "minutes"
                                  | "hours"
                                  | "days",
                              },
                            }))
                          }
                          aria-label="有効期限の単位"
                          className="rounded-lg border border-band bg-surface px-1.5 py-1 text-xs text-ink-muted"
                        >
                          <option value="minutes">分</option>
                          <option value="hours">時間</option>
                          <option value="days">日</option>
                        </select>
                      </span>
                    )}
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
    </div>
  );
}
