"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
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
import { GroupMembersPanel } from "./GroupMembersPanel";
import { CreateTempChatWithUserModal } from "@/components/home/CreateTempChatWithUserModal";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

type MessageRow = Tables<"messages">;
type RoomMemberRow = Tables<"room_members">;

const PAGE_SIZE = 30;
const MESSAGE_MAX_LENGTH = 4000;

// Phase 14: テキスト送信失敗時の自動リトライ（SRS 3.4）。
// 初回送信+自動リトライ3回＝計4回試行し、リトライ毎に指数バックオフで待機する。
const MAX_AUTO_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];
// 実機フィードバックで判明した「送信中のまま固まる」バグの修正：1試行あたりの
// ネットワーク待ち上限（詳細はinsertMessageWithRetryのコメント参照）。
const SEND_ATTEMPT_TIMEOUT_MS = 10000;

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

// Phase 19: グループチャットUI M1。「相手」を単一のDM相手だけでなく複数人の
// グループメンバーも表せるよう判別共用体にした（従来の`otherUser`から`peer`へ改名。
// 複数人を表すのに"other user"は単数感が強すぎるため）。
// Phase 21: グループメンバー管理M2。membersに自分を含む全メンバー（role付き）を
// 持たせるよう変更した（メンバー管理パネルで「自分がオーナーか」「誰がオーナーか」を
// 判定する必要があるため）。memberCountはmembers.lengthで代替できるため削除した。
// Phase 28: 一時チャットの名前付け。roomNameが設定されていればDMヘッダー・一覧の
// 表示名を上書きする（相手の実名displayNameはサブテキストとして残し、識別性を保つ）。
// Phase 29: 既読機能。DMはlastReadAt（相手のroom_members.last_read_at）を、
// グループはreadReceiptsEnabled（オーナーが切替可能なON/OFF）とmembers各行の
// lastReadAtを持たせる。既読状態そのものはChatRoom.tsx側でreadStateByUserId
// （Realtime購読で更新される別state）として一元管理するため、ここは初期値の受け渡しのみ。
export type ChatPeer =
  | {
      kind: "dm";
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      roomName: string | null;
      lastReadAt: string | null;
    }
  | {
      kind: "group";
      roomName: string | null;
      avatarUrl: string | null;
      readReceiptsEnabled: boolean;
      members: {
        id: string;
        displayName: string;
        role: "owner" | "member";
        lastReadAt: string | null;
      }[];
    };

type ChatRoomProps = {
  roomId: string;
  currentUserId: string;
  peer: ChatPeer;
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
  peer,
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

  // Phase 21: グループメンバー管理M2。peer.membersをpropsから1回だけ初期化し、
  // 以降はメンバー追加・削除の結果をローカルで反映する（router.refresh()は
  // GatedChatRoomLoader経由のグループでは効かないため、ローカルstate更新に一本化した）。
  // ヘッダー表示・memberNameById・isGroupOwnerの導出は全てpeer.membersではなく
  // このgroupMembersを参照する（追加・削除後に即座に一致させるため）。
  // lastReadAtはgroupMembersではなく別state（readStateByUserId）で一元管理するため
  // （Phase 29参照）、初期化時点で切り落として既存のGroupMember型（GroupMembersPanel.tsxの
  // props型）との整合を保つ。
  const [groupMembers, setGroupMembers] = useState(() =>
    peer.kind === "group"
      ? peer.members.map(({ id, displayName, role }) => ({
          id,
          displayName,
          role,
        }))
      : [],
  );
  // Phase 24: グループ名・アバターも同じ理由（GatedChatRoomLoader経由ではrouter.refresh()が
  // 効かない）でローカルstateに一本化し、GroupMembersPanelのonProfileChangeで更新する。
  const [groupName, setGroupName] = useState(() =>
    peer.kind === "group" ? peer.roomName : null,
  );
  const [groupAvatarUrl, setGroupAvatarUrl] = useState(() =>
    peer.kind === "group" ? peer.avatarUrl : null,
  );
  // Phase 29: 既読機能。グループのオーナーが切替可能な既読表示ON/OFF
  // （GroupMembersPanelのonReadReceiptsChangeで更新）。
  const [groupReadReceiptsEnabled, setGroupReadReceiptsEnabled] = useState(() =>
    peer.kind === "group" ? peer.readReceiptsEnabled : false,
  );
  // Phase 29: 既読機能。DM/グループ共通で「相手（達）が最後にこのルームを開いた時刻」を
  // user_id単位で保持する。room_membersのRealtime UPDATE購読で更新される。
  const [readStateByUserId, setReadStateByUserId] = useState<
    Map<string, string | null>
  >(() => {
    if (peer.kind === "dm") return new Map([[peer.id, peer.lastReadAt]]);
    if (peer.kind === "group") {
      return new Map(peer.members.map((m) => [m.id, m.lastReadAt]));
    }
    return new Map();
  });
  const [membersOpen, setMembersOpen] = useState(false);
  // Phase 25: チャット画面からその場でDM相手との一時チャットを作成する導線。
  const [tempChatOpen, setTempChatOpen] = useState(false);

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
  //
  // 実機フィードバックで判明した「送信中のまま固まる」バグの真因（Phase 24）：
  // このeffectがcleanupのみでsetup本体を持たなかったため、React（開発時のStrict Mode）が
  // 初回マウント直後に行う「マウント→アンマウント→再マウント」の合成サイクルで、
  // cleanupが1回実行されisMountedRef.currentがfalseになった後、それをtrueへ戻す処理が
  // どこにも無かった。結果としてこのrefは実際にはマウントされ続けている画面でも
  // 開発時は常にfalseのままになり、sendMessage()内の`if (!isMountedRef.current) return;`が
  // 毎回早期returnしてsetSending(false)に到達できず、送信ボタンが永久に「送信中...」の
  // まま固まっていた（メッセージ自体はRealtime購読側のsetMessagesで正常に届いて
  // 見えていたため、一見「送信は成功しているのにボタンだけ戻らない」ように見えていた）。
  // 修正：effect本体でも明示的にtrueへ戻すことで、Strict Modeの合成再マウント後も
  // 正しい状態に復帰させる（本番ビルドではStrict Modeの二重実行が無いため実害は無かった
  // はずだが、`next dev`で常時再現するため開発体験として致命的だった）。
  useEffect(() => {
    isMountedRef.current = true;
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
          // Phase 29: 既読機能。チャットを開いている間に届いた新着メッセージは
          // 即座に「読んだ」ものとして扱う（LINE等の一般的なチャットアプリと同じ挙動）。
          // 失敗しても致命的ではないベストエフォート機能のため、エラーは無視する。
          void supabase.rpc("mark_room_read", { p_room_id: roomId });
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
      // Phase 29: 既読機能。他メンバーのlast_read_at更新をリアルタイムに反映し、
      // 「既読」バッジが相手の閲覧後すぐに表示されるようにする。
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updated = payload.new as RoomMemberRow;
          setReadStateByUserId((prev) => {
            const next = new Map(prev);
            next.set(updated.user_id, updated.last_read_at);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  // Phase 29: 既読機能。このチャットを開いた（roomIdが変わった）タイミングで
  // 自分の閲覧位置を更新する。ベストエフォートのためエラーは無視する。
  useEffect(() => {
    void supabase.rpc("mark_room_read", { p_room_id: roomId });
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
  //
  // 実機フィードバックで判明したバグの修正：この関数は元々try/catchを一切持たず、
  // かつSupabaseクライアントのfetchにタイムアウトを設定していなかった。ネットワークが
  // 一瞬詰まってfetchが解決も拒否もしないまま止まる（ブラウザ/OS側のTCPタイムアウトは
  // 数分〜無期限になりうる）と、このawaitが永久に返らず、呼び出し元sendMessage()の
  // setSending(false)（成功/失敗どちらの経路にも到達できない）が実行されないまま
  // 「送信中...」ボタンが固まり続けていた（コンソールにエラーは出ない＝Promiseが
  // 例外を投げたのではなく単に未解決のまま止まっていたことと整合する）。
  // .abortSignal(AbortSignal.timeout(...))で1試行あたりの上限を設け、かつtry/catchで
  // 例外（AbortError含む）も通常のerror扱いにフォールバックさせることで、
  // ネットワークが本当に詰まっていても最終的には手動再試行バナー（handleRetrySend）に
  // 必ず合流できるようにする。
  async function insertMessageWithRetry(
    payload: PendingMessagePayload,
  ): Promise<{ data: MessageRow | null; error: boolean }> {
    for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
      try {
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
          .abortSignal(AbortSignal.timeout(SEND_ATTEMPT_TIMEOUT_MS))
          .single();

        if (!error && data) {
          return { data, error: false };
        }

        if (error?.code === "23505") {
          const { data: existing } = await supabase
            .from("messages")
            .select("*")
            .eq("id", payload.id)
            .abortSignal(AbortSignal.timeout(SEND_ATTEMPT_TIMEOUT_MS))
            .maybeSingle();
          if (existing) {
            return { data: existing, error: false };
          }
        }
      } catch {
        // タイムアウト（AbortError）・その他の予期しない例外も、通常のerror扱いとして
        // 下の再試行ループへ合流させる（例外を外へ漏らさない＝sendMessage側の
        // setSending(false)に必ず到達させるための防御）。
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
    // Phase 19: グループチャットには1対1のブロック概念が無い（M1スコープ外）ため、
    // このハンドラ自体グループ側からは呼ばれない（ボタンを非表示にしている）が、念のためガードする。
    if (peer.kind !== "dm") return;
    setBlockError(null);
    const next = !isBlockedByMe;
    startBlockTransition(async () => {
      try {
        const result = next
          ? await blockUser(peer.id)
          : await unblockUser(peer.id);

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

  // Phase 19: ブロックはDMのみの概念（グループには1対1のブロックUIが無いM1スコープの
  // 制約）。isBlockedByMeを直接使っていた各所をこの派生値に置き換え、グループでは常に
  // 送信可能な状態にする。
  const blockGateActive = peer.kind === "dm" && isBlockedByMe;

  // Phase 19: グループチャットで自分以外のメッセージに送信者名を表示するためのマップ。
  // Phase 21: groupMembers（自分を含む）から作るが、!isOwnの場合のみ参照されるため
  // 自分の行が含まれていても実害は無い（フィルタ不要）。
  const memberNameById = useMemo(
    () =>
      peer.kind === "group"
        ? new Map(groupMembers.map((m) => [m.id, m.displayName]))
        : null,
    [peer, groupMembers],
  );

  // Phase 21: グループメンバー管理M2。自分がオーナーかどうかの判定。
  const isGroupOwner =
    peer.kind === "group" &&
    groupMembers.some((m) => m.id === currentUserId && m.role === "owner");

  const canSend =
    !sending &&
    !blockGateActive &&
    (inputValue.trim().length > 0 || selectedFile !== null);

  // Phase 25/9由来の非表示フィルタを1箇所に集約（従来はレンダー内IIFEで都度計算していたが、
  // Phase 29の既読バッジ計算でも同じフィルタ済み一覧が必要になったためuseMemo化した）。
  const visibleMessages = useMemo(
    () => messages.filter((message) => !hiddenIds.has(message.id)),
    [messages, hiddenIds],
  );

  // Phase 29: 既読機能。LINE等と同じ「自分が送った最新の既読済みメッセージにのみバッジを
  // 付ける」方式（全ての既読済みメッセージに付けると冗長になるため）。DMは"既読"固定文言、
  // グループは既読人数（読んだ人の名前列挙はグループ人数が多いと煩雑になるため件数のみ、
  // ユーザー確認済み）。groupReadReceiptsEnabledがfalseの場合はグループ全体で非表示にする。
  const readBadge = useMemo<{ messageId: string; label: string } | null>(() => {
    if (peer.kind === "dm") {
      const otherLastReadAt = readStateByUserId.get(peer.id) ?? null;
      if (!otherLastReadAt) return null;
      let candidate: MessageRow | null = null;
      for (const message of visibleMessages) {
        if (message.sender_id !== currentUserId) continue;
        if (new Date(message.created_at) <= new Date(otherLastReadAt)) {
          candidate = message;
        }
      }
      return candidate ? { messageId: candidate.id, label: "既読" } : null;
    }

    if (peer.kind === "group") {
      if (!groupReadReceiptsEnabled) return null;
      let candidate: MessageRow | null = null;
      let candidateCount = 0;
      for (const message of visibleMessages) {
        if (message.sender_id !== currentUserId) continue;
        const count = groupMembers.reduce((acc, member) => {
          if (member.id === currentUserId) return acc;
          const lastReadAt = readStateByUserId.get(member.id);
          return lastReadAt && new Date(lastReadAt) >= new Date(message.created_at)
            ? acc + 1
            : acc;
        }, 0);
        if (count > 0) {
          candidate = message;
          candidateCount = count;
        }
      }
      return candidate
        ? { messageId: candidate.id, label: `既読${candidateCount}` }
        : null;
    }

    return null;
  }, [
    peer,
    visibleMessages,
    readStateByUserId,
    currentUserId,
    groupMembers,
    groupReadReceiptsEnabled,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-band/60 px-4 py-3">
        {/* 実機フィードバック対応：モバイル幅ではShellRowがサイドバーとチャットを
            排他表示するため、チャットを開くと戻る手段が無かった。/homeへ遷移すると
            useSelectedLayoutSegment()の判定でShellRowが自動的にサイドバー側へ
            切り替わるため、ここではLinkを置くだけでよい（ShellRow側の変更は不要）。
            PC幅（md:）はサイドバーが常時表示のため不要＝md:hiddenで隠す。 */}
        <Link
          href="/home"
          aria-label="ホームに戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-band text-ink-muted transition-colors hover:bg-surface-raised md:hidden"
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
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        {peer.kind === "dm" ? (
          <>
            {/* Phase 28: アバターの頭文字は常に相手の実名（peer.displayName）基準のまま
                （チャット名で上書きすると「誰との会話か」が視覚的に分からなくなるため）。
                タイトルはroomName優先、設定時は実名を@usernameと並べてサブテキストに残す。 */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-band/60 font-label text-sm text-ink-muted">
              {peer.displayName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">
                {peer.roomName ?? peer.displayName}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {peer.roomName ? `${peer.displayName} · ` : ""}@{peer.username}
              </p>
            </div>
          </>
        ) : (
          // Phase 19: グループチャットのヘッダー。名前が無い場合はメンバー名の連結で代替する
          // （Phase 21: groupMembersは自分を含むため、名前結合のみ自分を除外して
          // M1時点の見た目を維持する。アバター文字フォールバックは誰の頭文字でも
          // 実害が無いためgroupMembers[0]のままでよい）。
          // Phase 24: peer.roomName/peer.avatarUrlではなくローカルstateのgroupName/
          // groupAvatarUrlを参照する（GroupMembersPanelでの編集を即時反映するため）。
          <>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-band/60 font-label text-sm text-ink-muted">
              {groupAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- next/imageは不採用（docs/lessons.md参照）。
                <img
                  src={groupAvatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                (groupName?.slice(0, 1) ??
                  groupMembers[0]?.displayName.slice(0, 1)) ||
                "G"
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">
                {groupName ??
                  groupMembers
                    .filter((m) => m.id !== currentUserId)
                    .map((m) => m.displayName)
                    .join("、")}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {groupMembers.length}人
              </p>
            </div>
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {peer.kind === "dm" && (
            <button
              type="button"
              onClick={handleToggleBlock}
              disabled={blockPending}
              className="rounded-lg border border-band px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-raised disabled:opacity-60"
            >
              {isBlockedByMe ? "ブロック解除" : "ブロック"}
            </button>
          )}
          <ChatRoomOptionsMenu
            roomId={roomId}
            initialAuthRequired={initialAuthRequired}
            isTemporary={isTemporary}
            peer={peer}
            onOpenMembers={() => setMembersOpen(true)}
            onOpenTempChat={() => setTempChatOpen(true)}
          />
        </div>
      </header>
      {tempChatOpen && peer.kind === "dm" && (
        <CreateTempChatWithUserModal
          targetUserId={peer.id}
          targetDisplayName={peer.displayName}
          targetUsername={peer.username}
          onClose={() => setTempChatOpen(false)}
        />
      )}
      {membersOpen && peer.kind === "group" && (
        <GroupMembersPanel
          roomId={roomId}
          currentUserId={currentUserId}
          members={groupMembers}
          isOwner={isGroupOwner}
          roomName={groupName}
          avatarUrl={groupAvatarUrl}
          readReceiptsEnabled={groupReadReceiptsEnabled}
          onMembersChange={setGroupMembers}
          onProfileChange={(next) => {
            setGroupName(next.roomName);
            setGroupAvatarUrl(next.avatarUrl);
          }}
          onReadReceiptsChange={setGroupReadReceiptsEnabled}
          onClose={() => setMembersOpen(false)}
        />
      )}
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
                    senderName={
                      peer.kind === "group" &&
                      message.sender_id !== currentUserId
                        ? (memberNameById?.get(message.sender_id ?? "") ??
                          "不明なメンバー")
                        : undefined
                    }
                    readLabel={
                      readBadge?.messageId === message.id
                        ? readBadge.label
                        : undefined
                    }
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
            disabled={sending || blockGateActive}
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
            disabled={blockGateActive}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={
              blockGateActive ? "ブロック中は送信できません" : "メッセージを入力"
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
