"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { closeTempChat, toggleRoomAuthRequired } from "@/app/actions/rooms";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import type { ChatPeer } from "./ChatRoom";

/**
 * チャットオプションメニュー（Phase 6）。
 * FR-18の非表示一覧への導線、FR-20「各チャット」スコープの個人用ロックトグル、
 * 一時チャットの場合はFR-10の「チャットを閉じる」をまとめる。
 * Phase 21: グループの場合のみ「メンバー一覧」エントリを表示する
 * （新ルートは作らず、onOpenMembersでChatRoom.tsx側のモーダルを開くだけ）。
 */
export function ChatRoomOptionsMenu({
  roomId,
  initialAuthRequired,
  isTemporary,
  peer,
  onOpenMembers,
}: {
  roomId: string;
  initialAuthRequired: boolean;
  isTemporary: boolean;
  peer: ChatPeer;
  onOpenMembers: () => void;
}) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [authRequired, setAuthRequired] = useState(initialAuthRequired);
  const [togglePending, startToggleTransition] = useTransition();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function toggleAuthRequired() {
    const next = !authRequired;
    setAuthRequired(next);
    setError(null);
    startToggleTransition(async () => {
      try {
        const result = await toggleRoomAuthRequired(roomId, next);
        if (!result.success) {
          setAuthRequired(!next);
          setError(result.error);
        }
      } catch {
        setAuthRequired(!next);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleCloseTempChat() {
    if (closing) return;
    if (!window.confirm("このチャットを閉じますか？")) return;
    setClosing(true);
    setError(null);
    void (async () => {
      try {
        const result = await closeTempChat(roomId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push("/home");
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      } finally {
        setClosing(false);
      }
    })();
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="チャットオプション"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-band text-ink-muted transition-colors hover:bg-surface-raised"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 flex w-60 flex-col overflow-hidden rounded-lg border border-band bg-surface-raised text-sm shadow-lg">
          <Link
            href={`/chat/${roomId}/hidden`}
            onClick={() => setOpen(false)}
            className="px-3 py-2 text-left text-ink transition-colors hover:bg-band/30"
          >
            非表示メッセージ一覧
          </Link>
          {peer.kind === "group" && (
            <button
              type="button"
              onClick={() => {
                onOpenMembers();
                setOpen(false);
              }}
              className="px-3 py-2 text-left text-ink transition-colors hover:bg-band/30"
            >
              メンバー一覧
            </button>
          )}
          <button
            type="button"
            onClick={toggleAuthRequired}
            disabled={togglePending}
            className="flex items-center justify-between gap-2 px-3 py-2 text-left text-ink transition-colors hover:bg-band/30 disabled:opacity-60"
          >
            このチャットに鍵をかける
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                authRequired ? "bg-tongue" : "bg-band"
              }`}
              aria-hidden="true"
            />
          </button>
          {isTemporary && (
            <button
              type="button"
              onClick={handleCloseTempChat}
              disabled={closing}
              className="px-3 py-2 text-left text-clay transition-colors hover:bg-band/30 disabled:opacity-60"
            >
              チャットを閉じる
            </button>
          )}
        </div>
      )}

      {error && (
        <p
          className="absolute right-0 top-full mt-1 w-60 text-xs text-clay"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
