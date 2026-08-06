"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";
import { MessageBubble } from "./MessageBubble";

type MessageRow = Tables<"messages">;

const PAGE_SIZE = 30;

type ChatRoomProps = {
  roomId: string;
  currentUserId: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  initialMessages: MessageRow[];
  initialHasMore: boolean;
};

export function ChatRoom({
  roomId,
  currentUserId,
  otherUser,
  initialMessages,
  initialHasMore,
}: ChatRoomProps) {
  // createClient()は毎回新しいインスタンスを返すため、useState の遅延初期化で1回だけ生成する
  // （useRef(createClient())だと引数が毎レンダー評価されてしまい無駄が多い）
  const [supabase] = useState(() => createClient());

  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 過去メッセージを先頭に追加する直前のscrollHeightを一時保持し、
  // 追加後にスクロール位置がガクッと動かないよう補正するために使う
  const pendingScrollAdjustRef = useRef<number | null>(null);

  // 初回マウント時に最下部へスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 過去メッセージをmessages配列の先頭に追加した直後、スクロール位置を維持する
  useLayoutEffect(() => {
    if (pendingScrollAdjustRef.current !== null && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop =
        container.scrollHeight - pendingScrollAdjustRef.current;
      pendingScrollAdjustRef.current = null;
    }
  }, [messages]);

  // 入力内容に合わせてtextareaの高さを自動調整する。
  // heightを一旦"auto"に戻してからscrollHeightを測るのがポイント
  // （そうしないと、行が減ったときに高さが縮まらない）。
  // 実際の見た目の上限は className側の max-h-32 が担い、
  // それを超えたらCSSが自動でスクロール可能にする。
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [inputValue]);

  // Realtime購読：このルームへの新規メッセージINSERTのみ購読する。
  // 画面表示時のみ購読・離脱時に解除（SRS 3.6の要件）。
  useEffect(() => {
    const channel = supabase
      .channel(`room-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMessage = payload.new as MessageRow;
          setMessages((prev) => {
            // 自分の送信分はhandleSend側で既に追加済みの場合があるため重複を防ぐ
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  async function loadOlderMessages() {
    if (messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);

    const oldest = messages[0];
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    setLoadingOlder(false);

    if (error || !data) return;
    if (data.length < PAGE_SIZE) setHasMore(false);
    if (data.length === 0) return;

    pendingScrollAdjustRef.current =
      scrollContainerRef.current?.scrollHeight ?? null;
    setMessages((prev) => [...[...data].reverse(), ...prev]);
  }

  async function sendMessage() {
    const content = inputValue.trim();
    if (!content || sending) return;

    setInputValue("");
    setSending(true);
    setSendError(null);

    const { data, error } = await supabase
      .from("messages")
      .insert({ room_id: roomId, sender_id: currentUserId, content })
      .select()
      .single();

    setSending(false);

    if (error || !data) {
      setSendError("送信に失敗しました。もう一度お試しください。");
      setInputValue(content);
      return;
    }

    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) return prev;
      return [...prev, data];
    });
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-band/60 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-sm text-ink-muted">
          {otherUser.displayName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {otherUser.displayName}
          </p>
          <p className="truncate text-xs text-ink-muted">
            @{otherUser.username}
          </p>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {hasMore && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadOlderMessages()}
              disabled={loadingOlder}
              className="rounded-full border border-band px-3 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-raised disabled:opacity-60"
            >
              {loadingOlder ? "読み込み中..." : "過去のメッセージを読み込む"}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.sender_id === currentUserId}
            />
          ))}
        </div>

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-band/60 px-4 py-3"
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="メッセージを入力"
          className="max-h-32 flex-1 resize-none overflow-y-auto rounded-lg border border-band bg-surface-raised px-3 py-2 text-ink outline-none focus-visible:border-tongue"
        />
        <button
          type="submit"
          disabled={sending || inputValue.trim().length === 0}
          className="rounded-lg bg-tongue px-4 py-2 font-medium text-white transition-opacity disabled:opacity-60"
        >
          送信
        </button>
      </form>
      {sendError && (
        <p className="px-4 pb-2 text-sm text-clay" role="alert">
          {sendError}
        </p>
      )}
    </div>
  );
}
