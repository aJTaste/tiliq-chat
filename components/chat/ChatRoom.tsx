"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
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
import { blockUser, unblockUser } from "@/app/actions/blocks";

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
  initialIsBlockedByMe: boolean;
};

export function ChatRoom({
  roomId,
  currentUserId,
  otherUser,
  initialMessages,
  initialHasMore,
  initialIsBlockedByMe,
}: ChatRoomProps) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();

  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Phase 5: ブロック機能（FR-23）。相手が自分をブロックしているかはRLS上見えないため、
  // ここで扱うのは「自分が相手をブロックしているか」のみ。相手側からブロックされている場合は
  // メッセージ送信時にRLSで弾かれ、汎用のsendErrorとして表示される。
  const [isBlockedByMe, setIsBlockedByMe] = useState(initialIsBlockedByMe);
  const [blockPending, startBlockTransition] = useTransition();
  const [blockError, setBlockError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingScrollAdjustRef = useRef<number | null>(null);
  const pendingScrollToBottomRef = useRef(false);

  const NEAR_BOTTOM_THRESHOLD_PX = 120;
  function isScrolledNearBottom() {
    const container = scrollContainerRef.current;
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      NEAR_BOTTOM_THRESHOLD_PX
    );
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollAdjustRef.current !== null && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop =
        container.scrollHeight - pendingScrollAdjustRef.current;
      pendingScrollAdjustRef.current = null;
    }
  }, [messages]);

  useLayoutEffect(() => {
    if (pendingScrollToBottomRef.current) {
      pendingScrollToBottomRef.current = false;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [inputValue]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
          if (isScrolledNearBottom()) {
            pendingScrollToBottomRef.current = true;
          }
          setMessages((prev) => {
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
      return;
    }

    pendingScrollToBottomRef.current = true;
    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) return prev;
      return [...prev, data];
    });
    clearSelectedImage();
  }

  function handleToggleBlock() {
    setBlockError(null);
    const next = !isBlockedByMe;
    startBlockTransition(async () => {
      const result = next
        ? await blockUser(otherUser.id)
        : await unblockUser(otherUser.id);

      if (!result.success) {
        setBlockError(result.error);
        return;
      }
      setIsBlockedByMe(next);
      router.refresh();
    });
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
    !sending &&
    !isBlockedByMe &&
    (inputValue.trim().length > 0 || selectedFile !== null);

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
        <button
          type="button"
          onClick={handleToggleBlock}
          disabled={blockPending}
          className="ml-auto shrink-0 rounded-lg border border-band px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-raised disabled:opacity-60"
        >
          {isBlockedByMe ? "ブロック解除" : "ブロック"}
        </button>
      </header>
      {blockError && (
        <p
          className="border-b border-band/60 px-4 py-2 text-xs text-clay"
          role="alert"
        >
          {blockError}
        </p>
      )}

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
            disabled={sending || isBlockedByMe}
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
            disabled={isBlockedByMe}
            placeholder={
              isBlockedByMe ? "ブロック中は送信できません" : "メッセージを入力"
            }
            className="max-h-32 flex-1 resize-none overflow-y-auto rounded-lg border border-band bg-surface-raised px-3 py-2 text-ink outline-none focus-visible:border-tongue disabled:opacity-60"
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
