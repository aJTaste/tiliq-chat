"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";
import { MessageBubble } from "./MessageBubble";
import {
  ImageValidationError,
  compressImage,
  validateImageFile,
} from "@/lib/images/compress";
import {
  ImageUploadError,
  uploadImageToCloudinary,
} from "@/lib/cloudinary/upload";

type MessageRow = Tables<"messages">;

const PAGE_SIZE = 30;

type UploadStage = "idle" | "compressing" | "uploading";

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

  // Phase 4: 画像添付関連の状態
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 過去メッセージを先頭に追加する直前のscrollHeightを一時保持し、
  // 追加後にスクロール位置がガクッと動かないよう補正するために使う
  const pendingScrollAdjustRef = useRef<number | null>(null);
  // 新着メッセージ（自分の送信 / Realtime受信）が来たとき、
  // 「次にmessagesがDOMへ反映された後」に最下部へスクロールすることを予約するフラグ
  const pendingScrollToBottomRef = useRef(false);

  // スクロールコンテナが「ほぼ最下部」にあるかどうかを判定する。
  // Realtimeで新着メッセージを受信した際、過去のメッセージを読んでいる最中なら
  // 自動スクロールで割り込まない（会話を追っている最中の人だけ追従させる）ために使う。
  const NEAR_BOTTOM_THRESHOLD_PX = 120;
  function isScrolledNearBottom() {
    const container = scrollContainerRef.current;
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      NEAR_BOTTOM_THRESHOLD_PX
    );
  }

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

  // 新着メッセージ（自分の送信 / Realtime受信）を最下部へスクロールする。
  //
  // 以前は setMessages(...) の直後に同期で bottomRef.current?.scrollIntoView() を呼んでいたが、
  // Reactの状態更新はDOMへの反映が非同期（次のコミット）のため、
  // その時点ではまだ新しいメッセージがDOMに挿入されておらず、
  // 「新メッセージが追加される前の一番下」を基準にスクロールしてしまっていた。
  // 結果として、実際に新メッセージが挿入された後は「最新メッセージの少し上」で
  // 止まって見えるバグになっていた（テキスト・画像問わず発生）。
  //
  // messagesが実際にコミットされた後に発火するuseLayoutEffect側でスクロールすることで、
  // 常に正しい最下部へ届くようにした。
  useLayoutEffect(() => {
    if (pendingScrollToBottomRef.current) {
      pendingScrollToBottomRef.current = false;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // 選択中の画像プレビュー用Object URLは使い終わったら必ず解放する（メモリリーク防止）
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
          // 過去のメッセージを読んでいる最中（最下部から離れている）なら自動スクロールしない。
          // 判定は新メッセージがDOMに追加される「前」の現在のスクロール位置で行う。
          if (isScrolledNearBottom()) {
            pendingScrollToBottomRef.current = true;
          }
          setMessages((prev) => {
            // 自分の送信分はhandleSend側で既に追加済みの場合があるため重複を防ぐ
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
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

  function clearSelectedImage() {
    setSelectedFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // 同じファイルを続けて選び直してもchangeイベントが発火するようにリセットしておく
    e.target.value = "";
    if (!file) return;

    try {
      validateImageFile(file);
    } catch (err) {
      setSendError(
        err instanceof ImageValidationError
          ? err.message
          : "画像を選択できませんでした。",
      );
      return;
    }

    setSendError(null);
    clearSelectedImage();
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function sendMessage() {
    const content = inputValue.trim();
    if (!content && !selectedFile) return;
    if (sending) return;

    setSending(true);
    setSendError(null);

    let imageUrl: string | null = null;

    if (selectedFile) {
      try {
        setUploadStage("compressing");
        const compressed = await compressImage(selectedFile);
        setUploadStage("uploading");
        imageUrl = await uploadImageToCloudinary(
          compressed,
          selectedFile.name,
          roomId,
        );
      } catch (err) {
        setUploadStage("idle");
        setSending(false);
        setSendError(
          err instanceof ImageUploadError
            ? err.message
            : "画像のアップロードに失敗しました。もう一度お試しください。",
        );
        // 本文・選択中の画像はどちらも保持し、そのまま再送信ボタンで再試行できるようにする
        return;
      }
      setUploadStage("idle");
    }

    setInputValue("");

    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        sender_id: currentUserId,
        content: content.length > 0 ? content : null,
        image_url: imageUrl,
      })
      .select()
      .single();

    setSending(false);

    if (error || !data) {
      setSendError("送信に失敗しました。もう一度お試しください。");
      setInputValue(content);
      // 画像は selectedFile に残ったままなので、再送信時に再アップロードされる
      return;
    }

    // 自分の送信時は、閲覧中のスクロール位置に関わらず常に最下部へ移動する
    // （Realtime受信時と異なり、自分が送った内容は必ず見せたいため）
    pendingScrollToBottomRef.current = true;
    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) return prev;
      return [...prev, data];
    });
    clearSelectedImage();
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

  const canSend =
    !sending && (inputValue.trim().length > 0 || selectedFile !== null);

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
        className="flex flex-col gap-2 border-t border-band/60 px-4 py-3"
      >
        {previewUrl && (
          <div className="flex items-center gap-2">
            <div className="relative">
              {/* 送信前のローカルプレビューなのでCloudinary変換は不要、素の<img>でよい */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="h-16 w-16 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={clearSelectedImage}
                disabled={sending}
                aria-label="画像の添付を取り消す"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-clay text-xs text-white disabled:opacity-60"
              >
                ×
              </button>
            </div>
            {uploadStage !== "idle" && (
              <p className="text-xs text-ink-muted">
                {uploadStage === "compressing"
                  ? "画像を処理中..."
                  : "アップロード中..."}
              </p>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="画像を添付"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-band text-ink-muted transition-colors hover:bg-surface-raised disabled:opacity-60"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
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
            disabled={!canSend}
            className="rounded-lg bg-tongue px-4 py-2 font-medium text-white transition-opacity disabled:opacity-60"
          >
            送信
          </button>
        </div>
      </form>
      {sendError && (
        <p className="px-4 pb-2 text-sm text-clay" role="alert">
          {sendError}
        </p>
      )}
    </div>
  );
}
