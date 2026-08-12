"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Tables } from "@/types/supabase";
import { buildChatImageUrl } from "@/lib/cloudinary/url";

type MessageRow = Tables<"messages">;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// FR-16/FR-17: 長押し（タッチ）・右クリック（PC）でメッセージごとの操作メニューを開く
const LONG_PRESS_MS = 500;

export function MessageBubble({
  message,
  isOwn,
  onDelete,
  onHide,
}: {
  message: MessageRow;
  isOwn: boolean;
  onDelete?: (messageId: string) => void;
  onHide?: (messageId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    // SRS 3.3: キーボード操作対応。Escapeでもメニューを閉じられるようにする。
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside as EventListener);
    document.addEventListener("touchstart", handleOutside as EventListener);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside as EventListener,
      );
      document.removeEventListener(
        "touchstart",
        handleOutside as EventListener,
      );
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function clearLongPressTimer() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchStart() {
    clearLongPressTimer();
    longPressTimer.current = setTimeout(
      () => setMenuOpen(true),
      LONG_PRESS_MS,
    );
  }

  function handleContextMenu(e: MouseEvent) {
    if (!onDelete && !onHide) return;
    e.preventDefault();
    setMenuOpen(true);
  }

  const hasMenu = Boolean(onDelete || onHide);

  return (
    <div className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div ref={wrapperRef} className="relative max-w-[75%]">
        {hasMenu && (
          // SRS 3.3: 長押し（タッチ）・右クリック（PC）に加え、キーボードでも操作メニューを
          // 開けるようにする（ChatRoomOptionsMenu.tsxと同じ「実ボタン＋トグル」パターン）。
          // 通常は非表示にし、ホバー・フォーカス時のみ表示する（マウス操作時にUIを煩雑にしないため）。
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="メッセージの操作"
            className={`absolute top-0 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-ink-muted opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${
              isOwn ? "-left-7" : "-right-7"
            }`}
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
        )}
        <div
          onContextMenu={handleContextMenu}
          onTouchStart={hasMenu ? handleTouchStart : undefined}
          onTouchEnd={hasMenu ? clearLongPressTimer : undefined}
          onTouchMove={hasMenu ? clearLongPressTimer : undefined}
          className={`select-none rounded-2xl px-4 py-2 text-sm ${
            isOwn ? "bg-tongue text-white" : "bg-surface-raised text-ink"
          }`}
        >
          {message.content && (
            <p className="whitespace-pre-wrap break-words">
              {message.content}
            </p>
          )}
          {message.image_url && (
            // next/image（Vercelの画像最適化API）は使わず、Cloudinary側のf_auto,q_auto変換URLを
            // そのまま<img>で配信する（詳細はlib/cloudinary/url.tsのコメント参照）
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={buildChatImageUrl(message.image_url)}
              alt="送信された画像"
              loading="lazy"
              decoding="async"
              className="mt-1 max-h-64 w-auto max-w-full rounded-lg"
            />
          )}
          <p
            className={`mt-1 text-right text-[10px] ${
              isOwn ? "text-white/70" : "text-ink-muted"
            }`}
          >
            {formatTime(message.created_at)}
          </p>
        </div>

        {menuOpen && hasMenu && (
          <div
            className={`absolute top-0 z-10 flex flex-col overflow-hidden rounded-lg border border-band bg-surface-raised text-xs shadow-lg ${
              isOwn ? "right-0" : "left-0"
            }`}
          >
            {isOwn && onDelete && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(message.id);
                }}
                className="whitespace-nowrap px-3 py-2 text-left text-clay transition-colors hover:bg-band/30"
              >
                削除
              </button>
            )}
            {onHide && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onHide(message.id);
                }}
                className="whitespace-nowrap px-3 py-2 text-left text-ink-muted transition-colors hover:bg-band/30"
              >
                非表示
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
