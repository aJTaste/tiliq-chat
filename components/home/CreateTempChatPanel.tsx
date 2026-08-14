"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  startTemporaryDirectMessage,
  type TempDmDurationOption,
} from "@/app/actions/rooms";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";

type SearchResult = {
  userId: string;
  username: string;
  displayName: string;
  existingRoomId: string | null;
};

const SEARCH_DEBOUNCE_MS = 300;

const DURATION_OPTIONS: { value: TempDmDurationOption; label: string }[] = [
  { value: "10m", label: "10分" },
  { value: "1h", label: "1時間" },
  { value: "24h", label: "24時間" },
  { value: "7d", label: "7日間" },
  { value: "custom", label: "カスタム" },
];

/**
 * サイドバーUI再設計：「＋」新規作成メニューから開く一時チャット作成モーダル。
 * 旧AddUserPanel.tsxの検索結果行に埋め込まれていた有効期限セレクターを、
 * CreateGroupPanel.tsxと同じsearch_users検索パターンに載せ替えて独立させたもの。
 * グループ作成と異なり単一選択（Mapではなくselected: SearchResult | null）。
 * 既にDMルームがある相手（existingRoomIdあり）はcreate_temp_dm_room RPCが既存ルーム
 * 検索をしない仕様のため、重複ルーム防止のガードとして選択不可にする（旧
 * AddUserPanel.tsxの!r.existingRoomIdガードを踏襲）。
 */
export function CreateTempChatPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [duration, setDuration] = useState<TempDmDurationOption>("10m");
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">(
    "hours",
  );
  const [pending, startTransition] = useTransition();
  const [supabase] = useState(() => createClient());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          { p_query: trimmed },
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
            existingRoomId: row.existing_room_id ?? null,
          })),
        );
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, supabase]);

  function handleCreate() {
    if (!selected || pending) return;
    setError(null);

    if (duration === "custom") {
      const amount = Number(customAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("有効期限を正しく入力してください。");
        return;
      }
    }

    startTransition(async () => {
      try {
        const result = await startTemporaryDirectMessage(
          selected.userId,
          duration,
          duration === "custom"
            ? { amount: Number(customAmount), unit: customUnit }
            : undefined,
        );
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        // startTemporaryDirectMessageは成功時にredirect()を呼ぶため、Next.jsの内部
        // シグナル（digest付きエラー）をここで再送出してから、それ以外（オフライン等の
        // 真の通信エラー）だけを扱う（CreateGroupPanel.tsx・旧AddUserPanel.tsxの
        // handleMessageと同じパターン）。
        unstable_rethrow(err);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Modal onClose={onClose} labelledBy="create-temp-chat-title">
      <div className="flex flex-col gap-3 rounded-lg border border-band bg-surface-raised p-4">
        <div className="flex items-center justify-between">
          <p
            id="create-temp-chat-title"
            className="font-display text-sm font-semibold text-ink"
          >
            一時チャットを作成
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-ink-muted transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>

        {selected ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-tongue/60 bg-tongue/10 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {selected.displayName}
              </p>
              <p className="truncate text-xs text-ink-muted">
                @{selected.username}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 text-xs text-ink-muted underline underline-offset-2"
            >
              選び直す
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ユーザーIDで検索"
              aria-label="一時チャットの相手を検索"
              className="w-full rounded-lg border border-band bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
            />

            {searching && (
              <p className="text-xs text-ink-muted">検索中...</p>
            )}

            {!searching && query.trim().length > 0 && results.length === 0 && (
              <p className="text-xs text-ink-muted">
                ユーザーが見つかりませんでした。
              </p>
            )}

            {results.length > 0 && (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {results.map((user) => (
                  <li key={user.userId}>
                    <button
                      type="button"
                      onClick={() => !user.existingRoomId && setSelected(user)}
                      disabled={Boolean(user.existingRoomId)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate">
                        {user.displayName}
                        <span className="ml-1 text-xs text-ink-muted">
                          @{user.username}
                        </span>
                      </span>
                      {user.existingRoomId && (
                        <span className="shrink-0 text-[10px] text-ink-muted">
                          既存DMあり
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="flex items-center gap-1.5">
          <select
            value={duration}
            onChange={(e) =>
              setDuration(e.target.value as TempDmDurationOption)
            }
            aria-label="有効期限"
            className="rounded-lg border border-band bg-surface px-2 py-1.5 text-sm text-ink-muted"
          >
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {duration === "custom" && (
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                aria-label="有効期限（数値）"
                className="w-16 rounded-lg border border-band bg-surface px-1.5 py-1.5 text-sm text-ink"
              />
              <select
                value={customUnit}
                onChange={(e) =>
                  setCustomUnit(
                    e.target.value as "minutes" | "hours" | "days",
                  )
                }
                aria-label="有効期限の単位"
                className="rounded-lg border border-band bg-surface px-1.5 py-1.5 text-sm text-ink-muted"
              >
                <option value="minutes">分</option>
                <option value="hours">時間</option>
                <option value="days">日</option>
              </select>
            </span>
          )}
        </div>

        {error && (
          <p className="text-xs text-clay" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!selected || pending}
            className="rounded-lg bg-tongue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
          >
            {pending ? "作成中..." : "一時チャットを開始"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
