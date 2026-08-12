"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";
import { unhideMessage } from "@/app/actions/messages";
import { buildChatImageUrl } from "@/lib/cloudinary/url";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

type MessageRow = Tables<"messages">;

type HiddenItem = {
  hiddenRowId: string;
  message: MessageRow;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * FR-18: 非表示メッセージ一覧。ページ側でAuthGateにより認証済みの場合のみ
 * マウントされる（ゲート無効時はページから直接マウントされる）。
 * message_hiddenとmessagesを2段階のクエリで取得する（embed selectの型推論が
 * isOneToOne=falseのため配列/単体どちらになるか不確実なため避けている）。
 */
export function HiddenMessagesList({
  roomId,
  currentUserId,
}: {
  roomId: string;
  currentUserId: string;
}) {
  const [items, setItems] = useState<HiddenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("message_hidden")
        .select("id, message_id, hidden_at, messages!inner(room_id)")
        .eq("user_id", currentUserId)
        .eq("messages.room_id", roomId)
        .order("hidden_at", { ascending: false });

      if (cancelled) return;
      if (hiddenError) {
        setError("非表示メッセージの取得に失敗しました。");
        return;
      }

      const messageIds = (hiddenRows ?? []).map((row) => row.message_id);
      if (messageIds.length === 0) {
        setItems([]);
        return;
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .in("id", messageIds);

      if (cancelled) return;
      if (messagesError) {
        setError("メッセージの取得に失敗しました。");
        return;
      }

      const messageById = new Map(
        (messageRows ?? []).map((m) => [m.id, m] as const),
      );

      const mapped: HiddenItem[] = (hiddenRows ?? [])
        .map((row) => {
          const message = messageById.get(row.message_id);
          return message ? { hiddenRowId: row.id, message } : null;
        })
        .filter((item): item is HiddenItem => item !== null);

      setItems(mapped);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [roomId, currentUserId]);

  function handleUnhide(messageId: string) {
    setError(null);
    setPendingIds((prev) => new Set(prev).add(messageId));
    void (async () => {
      try {
        const result = await unhideMessage(messageId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setItems((prev) =>
          (prev ?? []).filter((item) => item.message.id !== messageId),
        );
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }
    })();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-6 py-8">
      <header className="flex items-center gap-3">
        <Link
          href={`/chat/${roomId}`}
          className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
        >
          ← チャットに戻る
        </Link>
        <h1 className="font-display text-lg font-semibold text-ink">
          非表示メッセージ一覧
        </h1>
      </header>

      {error && (
        <p className="text-sm text-clay" role="alert">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-ink-muted">読み込み中...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          非表示にしたメッセージはありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.hiddenRowId}
              className="rounded-lg border border-band bg-surface-raised p-3"
            >
              <p className="text-xs text-ink-muted">
                {formatDateTime(item.message.created_at)}
              </p>
              {item.message.content && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
                  {item.message.content}
                </p>
              )}
              {item.message.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={buildChatImageUrl(item.message.image_url)}
                  alt="非表示にした画像"
                  loading="lazy"
                  decoding="async"
                  className="mt-2 max-h-48 w-auto max-w-full rounded-lg"
                />
              )}
              <button
                type="button"
                onClick={() => handleUnhide(item.message.id)}
                disabled={pendingIds.has(item.message.id)}
                className="mt-2 rounded-lg border border-band px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
              >
                復元する
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
