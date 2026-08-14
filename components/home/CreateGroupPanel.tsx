"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createGroupRoom } from "@/app/actions/rooms";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";

type SearchResult = {
  userId: string;
  username: string;
  displayName: string;
};

const SEARCH_DEBOUNCE_MS = 300;
const GROUP_NAME_MAX_LENGTH = 50;

/**
 * Phase 19: グループチャットUI M1。検索から複数選択したユーザーでグループを作成する。
 * AddUserPanel.tsxと同じ規約（search_users RPCを300msデバウンスで直接呼び出し、
 * useTransition+try/catch+unstable_rethrowでServer Action呼び出しを扱う）を踏襲するが、
 * フレンド状態バッジ等は表示しない簡素な構成にしている（M1のスコープ判断）。
 * 成功時はcreateGroupRoomがredirect()するため、onCreatedコールバックは持たず、
 * キャンセル（作成せず閉じる）時のみonCloseを呼ぶ。
 *
 * サイドバーUI再設計：サイドバー「＋」新規作成メニューから開くモーダルに変更した
 * （旧実装ではHomeTabs.tsxのグループタブ内にインラインカードとして展開していた）。
 * components/ui/Modal.tsxでラップし、GroupMembersPanel.tsxと同じ見た目のタイトル行
 * ＋「×」ボタンを追加した。
 */
export function CreateGroupPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, SearchResult>>(
    new Map(),
  );
  const [groupName, setGroupName] = useState("");
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
          })),
        );
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, supabase]);

  function toggleSelected(user: SearchResult) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(user.userId)) {
        next.delete(user.userId);
      } else {
        next.set(user.userId, user);
      }
      return next;
    });
  }

  function handleCreate() {
    if (selected.size < 2 || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await createGroupRoom(
          Array.from(selected.keys()),
          groupName,
        );
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        // createGroupRoomは成功時にredirect()を呼ぶため、Next.jsの内部シグナル
        // （digest付きエラー）をここで再送出してから、それ以外（オフライン等の
        // 真の通信エラー）だけを扱う（app/actions/rooms.tsの他のDM開始系アクション、
        // AddUserPanel.tsxのhandleMessageと同じパターン）。
        unstable_rethrow(err);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  const selectedList = Array.from(selected.values());

  return (
    <Modal onClose={onClose} labelledBy="create-group-title">
      <div className="flex flex-col gap-2.5 rounded-lg border border-band bg-surface-raised p-3">
        <div className="flex items-center justify-between">
          <p
            id="create-group-title"
            className="font-display text-sm font-semibold text-ink"
          >
            グループを作成
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

        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="グループ名（任意）"
          aria-label="グループ名"
          maxLength={GROUP_NAME_MAX_LENGTH}
          className="w-full rounded-lg border border-band bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
        />

        {selectedList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedList.map((user) => (
              <button
                key={user.userId}
                type="button"
                onClick={() => toggleSelected(user)}
                className="flex items-center gap-1 rounded-full border border-tongue/60 bg-tongue/10 px-2 py-1 font-label text-[10px] text-tongue"
              >
                {user.displayName}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ユーザーIDで検索して追加"
          aria-label="グループに追加するユーザーを検索"
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
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink transition-colors hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={selected.has(user.userId)}
                    onChange={() => toggleSelected(user)}
                    className="shrink-0"
                  />
                  <span className="min-w-0 truncate">
                    {user.displayName}
                    <span className="ml-1 text-xs text-ink-muted">
                      @{user.username}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

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
            disabled={selected.size < 2 || pending}
            className="rounded-lg bg-tongue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
          >
            {pending ? "作成中..." : "グループを作成"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
