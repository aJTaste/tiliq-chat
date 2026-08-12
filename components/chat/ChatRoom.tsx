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
import { deleteMessage, hideMessage } from "@/app/actions/messages";
import { ChatRoomOptionsMenu } from "./ChatRoomOptionsMenu";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

type MessageRow = Tables<"messages">;

const PAGE_SIZE = 30;
const MESSAGE_MAX_LENGTH = 4000;

// Phase 14: テキスト送信失敗時の自動リトライ（SRS 3.4）。
// 初回送信+自動リトライ3回＝計4回試行し、リトライ毎に指数バックオフで待機する。
const MAX_AUTO_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type UploadStage = "idle" | "compressing" | "uploading";

// Phase 14: 自動リトライ・手動リトライの両方で使い回す送信ペイロード。
// idをクライアント側で1回だけ生成し使い回すことで、タイムアウト等でクライアントが
// 失敗と誤認しても（実際はDB側では成功していた場合）一意制約違反として検出できるようにする。
type PendingMessagePayload = {
  id: string;
  content: string | null;
  image_url: string | null;
};

// 過去メッセージをページングして読む際、時刻のみでは日付の手がかりが無いため、
// 日付が変わったタイミングで区切り行を挿入する（E-2）。
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateDividerLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "今日";
  if (isSameDay(date, yesterday)) return "昨日";

  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
  initialHiddenMessageIds: string[];
  initialAuthRequired: boolean;
  isTemporary: boolean;
};

export function ChatRoom({
  roomId,
  currentUserId,
  otherUser,
  initialMessages,
  initialHasMore,
  initialIsBlockedByMe,
  initialHiddenMessageIds,
  initialAuthRequired,
  isTemporary,
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

  // Phase 6: メッセージ削除（FR-16）・非表示（FR-17）。
  // 非表示は自分の画面にのみ影響するローカルなフィルタなのでRealtime購読は不要。
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    () => new Set(initialHiddenMessageIds),
  );
  const [messageActionError, setMessageActionError] = useState<string | null>(
    null,
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");

  // Phase 14: 自動リトライ（初回+最大3回）を使い切った送信を手動リトライに切り替えるための保留状態。
  const [retryPayload, setRetryPayload] =
    useState<PendingMessagePayload | null>(null);
  const [retrying, setRetrying] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingScrollAdjustRef = useRef<number | null>(null);
  const pendingScrollToBottomRef = useRef(false);
  const isMountedRef = useRef(true);

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

  // Phase 14: 自動リトライの指数バックオフ待機中に別ルームへ遷移する等でアンマウントされた場合、
  // その後に解決したPromiseがsetStateを呼ばないようにするためのガード。
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          // FR-16: 相手が削除した（deleted_atが設定された）メッセージを自分の画面からも消す。
          const updated = payload.new as MessageRow;
          setMessages((prev) => {
            if (updated.deleted_at) {
              return prev.filter((m) => m.id !== updated.id);
            }
            return prev.map((m) => (m.id === updated.id ? updated : m));
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

  // Phase 14: DBへのinsertを初回+最大3回（計4回）まで指数バックオフで自動リトライする。
  // 同一payload.idを使い回すため、途中の試行が実はDB側で成功していた（タイムアウト等で
  // クライアントが誤って失敗と判定した）場合は一意制約違反（23505）として検出でき、
  // その場合は該当行を取得して成功扱いにする（二重送信の防止）。
  async function insertMessageWithRetry(
    payload: PendingMessagePayload,
  ): Promise<{ data: MessageRow | null; error: boolean }> {
    for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          id: payload.id,
          room_id: roomId,
          sender_id: currentUserId,
          content: payload.content,
          image_url: payload.image_url,
        })
        .select()
        .single();

      if (!error && data) {
        return { data, error: false };
      }

      if (error?.code === "23505") {
        const { data: existing } = await supabase
          .from("messages")
          .select("*")
          .eq("id", payload.id)
          .maybeSingle();
        if (existing) {
          return { data: existing, error: false };
        }
      }

      if (attempt < MAX_AUTO_RETRIES) {
        await delay(RETRY_BACKOFF_MS[attempt]);
        if (!isMountedRef.current) return { data: null, error: true };
      }
    }

    return { data: null, error: true };
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

    const payload: PendingMessagePayload = {
      id: crypto.randomUUID(),
      content: content.length > 0 ? content : null,
      image_url: imageUrl,
    };

    const { data, error } = await insertMessageWithRetry(payload);

    if (!isMountedRef.current) return;
    setSending(false);

    if (error || !data) {
      // SRS 3.4: 自動リトライ（最大3回）を使い切った後は手動リトライに切り替える。
      setRetryPayload(payload);
      return;
    }

    pendingScrollToBottomRef.current = true;
    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) return prev;
      return [...prev, data];
    });
    clearSelectedImage();
  }

  async function handleRetrySend() {
    if (!retryPayload || retrying) return;
    setRetrying(true);

    const { data, error } = await insertMessageWithRetry(retryPayload);

    if (!isMountedRef.current) return;
    setRetrying(false);

    if (error || !data) {
      // 失敗した場合はバナー（保留ペイロード）をそのまま残し、再度手動リトライできるようにする。
      return;
    }

    setRetryPayload(null);
    pendingScrollToBottomRef.current = true;
    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) return prev;
      return [...prev, data];
    });
  }

  function handleDiscardRetry() {
    setRetryPayload(null);
  }

  function handleDeleteMessage(messageId: string) {
    if (!window.confirm("このメッセージを削除しますか？元に戻せません。")) {
      return;
    }
    setMessageActionError(null);
    void (async () => {
      try {
        const result = await deleteMessage(messageId);
        if (!result.success) {
          setMessageActionError(result.error);
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch {
        setMessageActionError(NETWORK_ERROR_MESSAGE);
      }
    })();
  }

  function handleHideMessage(messageId: string) {
    setMessageActionError(null);
    void (async () => {
      try {
        const result = await hideMessage(messageId);
        if (!result.success) {
          setMessageActionError(result.error);
          return;
        }
        setHiddenIds((prev) => new Set(prev).add(messageId));
      } catch {
        setMessageActionError(NETWORK_ERROR_MESSAGE);
      }
    })();
  }

  function handleToggleBlock() {
    setBlockError(null);
    const next = !isBlockedByMe;
    startBlockTransition(async () => {
      try {
        const result = next
          ? await blockUser(otherUser.id)
          : await unblockUser(otherUser.id);

        if (!result.success) {
          setBlockError(result.error);
          return;
        }
        setIsBlockedByMe(next);
        router.refresh();
      } catch {
        setBlockError(NETWORK_ERROR_MESSAGE);
      }
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
        <ChatRoomOptionsMenu
          roomId={roomId}
          initialAuthRequired={initialAuthRequired}
          isTemporary={isTemporary}
        />
      </header>
      {blockError && (
        <p
          className="border-b border-band/60 px-4 py-2 text-xs text-clay"
          role="alert"
        >
          {blockError}
        </p>
      )}
      {messageActionError && (
        <p
          className="border-b border-band/60 px-4 py-2 text-xs text-clay"
          role="alert"
        >
          {messageActionError}
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
          {(() => {
            const visibleMessages = messages.filter(
              (message) => !hiddenIds.has(message.id),
            );

            if (visibleMessages.length === 0 && !hasMore) {
              return (
                <p className="px-2 py-8 text-center text-sm text-ink-muted">
                  まだメッセージがありません。最初のメッセージを送ってみましょう。
                </p>
              );
            }

            return visibleMessages.map((message, index) => {
              const previous = visibleMessages[index - 1];
              const showDateDivider =
                !previous ||
                !isSameDay(
                  new Date(previous.created_at),
                  new Date(message.created_at),
                );

              return (
                <div key={message.id}>
                  {showDateDivider && (
                    <div className="my-2 flex items-center justify-center">
                      <span className="rounded-full bg-surface-raised px-3 py-1 font-label text-[10px] text-ink-muted">
                        {formatDateDividerLabel(message.created_at)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    isOwn={message.sender_id === currentUserId}
                    onDelete={handleDeleteMessage}
                    onHide={handleHideMessage}
                  />
                </div>
              );
            });
          })()}
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
                alt="選択した画像"
                className="h-16 w-16 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={clearSelectedImage}
                disabled={sending}
                aria-label="画像の添付を取り消す"
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-clay text-xs text-white disabled:opacity-60"
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
            maxLength={MESSAGE_MAX_LENGTH}
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
            {sending ? "送信中..." : "送信"}
          </button>
        </div>
      </form>
      {sendError && (
        <p className="px-4 pb-2 text-sm text-clay" role="alert">
          {sendError}
        </p>
      )}
      {retryPayload && (
        <div
          className="flex items-center justify-between gap-3 px-4 pb-2 text-sm text-clay"
          role="alert"
        >
          <span>送信に失敗しました。</span>
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void handleRetrySend()}
              disabled={retrying}
              className="rounded-lg border border-clay px-3 py-1 text-xs text-clay transition-colors hover:bg-clay/10 disabled:opacity-60"
            >
              {retrying ? "再試行中..." : "再試行"}
            </button>
            <button
              type="button"
              onClick={handleDiscardRetry}
              disabled={retrying}
              className="rounded-lg px-3 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-raised disabled:opacity-60"
            >
              取り消し
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
