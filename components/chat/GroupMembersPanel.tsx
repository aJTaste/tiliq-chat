"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  addGroupMembers,
  deleteGroup,
  leaveGroup,
  removeGroupMember,
  transferGroupOwnership,
  updateGroupProfile,
  updateGroupReadReceiptsEnabled,
} from "@/app/actions/rooms";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import {
  compressImage,
  validateImageFile,
  ImageValidationError,
} from "@/lib/images/compress";
import { uploadImageToCloudinary, ImageUploadError } from "@/lib/cloudinary/upload";
import { Modal } from "@/components/ui/Modal";

type GroupMember = {
  id: string;
  displayName: string;
  role: "owner" | "member";
};

type SearchResult = {
  userId: string;
  username: string;
  displayName: string;
};

const SEARCH_DEBOUNCE_MS = 300;
// CreateGroupPanel.tsxと同じ上限値（create_group_room RPCの"group name too long"と揃える）。
// 2箇所での定数複製はこのファイルの既存方針（mapAddMembersError等のコメント参照）に倣う。
const GROUP_NAME_MAX_LENGTH = 50;

/**
 * Phase 21: グループチャットメンバー管理M2。ChatRoom.tsxからモーダルとして開かれる
 * （新ルートは作らない。既にゲート通過後にのみレンダリングされるChatRoom.tsx配下に
 * 置くことで、Phase 18で修正した「起動時ゲートの独立チェック漏れ」というバグ種別を
 * 再導入しない設計）。メンバー一覧表示・オーナーによる追加/削除・非オーナーの退出を
 * まとめる。メンバー追加は`CreateGroupPanel.tsx`と同じsearch_users検索パターンを
 * 流用するが、グループ名入力・選択数の下限は無い（1人からでも追加可）。
 * Phase 22: オーナー譲渡・グループ削除を追加。ChatRoom.tsxのisGroupOwnerは
 * groupMembers（このコンポーネントのonMembersChangeでパッチされる）から毎レンダー
 * 導出されるため、譲渡成功時にmembersを書き換えるだけで自動的に反映される
 * （ChatRoom.tsx・ChatRoomOptionsMenu.tsxは無改修）。
 * Phase 24: グループ名・アバター編集（グループ設定セクション）を追加。画像選択は
 * ChatRoom.tsxのselectedFile/previewUrlと同じ「選択直後はアップロードせずプレビューのみ、
 * 保存ボタン押下時に初めてcompressImage→uploadImageToCloudinaryする」ステージング方式。
 * Phase 29: 既読機能。グループのオーナーが既読表示のON/OFFを切り替えるトグルを
 * グループ設定セクションに追加（名前・アバターと違い即時保存。名前・アバターのような
 * ステージング方式にする必要が薄い単純なON/OFFのため）。
 * サイドバー再設計の残タスク：`components/ui/Modal.tsx`へ追従（背景クリック・Escapeキーの
 * onClose呼び出しをModal側に委譲）。内側のパディング・タイトル行はModal導入前の見た目を
 * 変えないためそのままこのファイル側に残す（Modal.tsxのコメント参照）。
 */
export function GroupMembersPanel({
  roomId,
  currentUserId,
  members,
  isOwner,
  roomName,
  avatarUrl,
  readReceiptsEnabled,
  onMembersChange,
  onProfileChange,
  onReadReceiptsChange,
  onClose,
}: {
  roomId: string;
  currentUserId: string;
  members: GroupMember[];
  isOwner: boolean;
  roomName: string | null;
  avatarUrl: string | null;
  readReceiptsEnabled: boolean;
  onMembersChange: (next: GroupMember[]) => void;
  onProfileChange: (next: { roomName: string | null; avatarUrl: string | null }) => void;
  onReadReceiptsChange: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removePending, startRemoveTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  // Phase 22: グループチャットM3（オーナー譲渡・グループ削除）。
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferPending, startTransferTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  // Phase 24: グループ設定（名前・アバター）。
  const [profileName, setProfileName] = useState(roomName ?? "");
  const [stagedAvatarFile, setStagedAvatarFile] = useState<File | null>(null);
  const [stagedAvatarPreviewUrl, setStagedAvatarPreviewUrl] = useState<
    string | null
  >(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Phase 29: 既読機能のON/OFFトグル。名前・アバターと違いステージング不要（即時保存）。
  const [readReceiptsPending, setReadReceiptsPending] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, SearchResult>>(
    new Map(),
  );
  const [addPending, startAddTransition] = useTransition();
  const [supabase] = useState(() => createClient());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!addOpen) return;
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
        const memberIds = new Set(members.map((m) => m.id));
        setResults(
          data
            .filter((row) => !memberIds.has(row.user_id))
            .map((row) => ({
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
  }, [query, supabase, addOpen, members]);

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

  function handleAddMembers() {
    if (selected.size === 0 || addPending) return;
    setError(null);
    startAddTransition(async () => {
      try {
        const result = await addGroupMembers(
          roomId,
          Array.from(selected.keys()),
        );
        if (!result.success) {
          setError(result.error);
          return;
        }
        const added: GroupMember[] = Array.from(selected.values()).map(
          (u) => ({ id: u.userId, displayName: u.displayName, role: "member" }),
        );
        onMembersChange([...members, ...added]);
        setSelected(new Map());
        setQuery("");
        setResults([]);
        setAddOpen(false);
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleRemove(member: GroupMember) {
    if (
      !window.confirm(`${member.displayName}をグループから削除しますか？`)
    ) {
      return;
    }
    setError(null);
    setRemovingId(member.id);
    startRemoveTransition(async () => {
      try {
        const result = await removeGroupMember(roomId, member.id);
        if (!result.success) {
          setError(result.error);
          return;
        }
        onMembersChange(members.filter((m) => m.id !== member.id));
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      } finally {
        setRemovingId(null);
      }
    });
  }

  function handleLeave() {
    if (leaving) return;
    if (!window.confirm("このグループから退出しますか？")) return;
    setError(null);
    setLeaving(true);
    void (async () => {
      try {
        const result = await leaveGroup(roomId);
        if (!result.success) {
          setError(result.error);
          setLeaving(false);
          return;
        }
        router.push("/home");
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
        setLeaving(false);
      }
    })();
  }

  // Phase 22: グループチャットM3。オーナー譲渡。行の追加・削除ではなく2行のrole書き換えのため
  // .filter()ではなく.map()を使う。
  function handleTransferOwnership(member: GroupMember) {
    if (
      !window.confirm(
        `${member.displayName}をオーナーにしますか？あなたはメンバーになります。`,
      )
    ) {
      return;
    }
    setError(null);
    setTransferringId(member.id);
    startTransferTransition(async () => {
      try {
        const result = await transferGroupOwnership(roomId, member.id);
        if (!result.success) {
          setError(result.error);
          return;
        }
        onMembersChange(
          members.map((m) => {
            if (m.id === currentUserId) return { ...m, role: "member" };
            if (m.id === member.id) return { ...m, role: "owner" };
            return m;
          }),
        );
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      } finally {
        setTransferringId(null);
      }
    });
  }

  function handleDeleteGroup() {
    if (deleting) return;
    if (
      !window.confirm(
        "このグループを完全に削除しますか？元に戻せません。全メンバーがこのグループにアクセスできなくなります。",
      )
    ) {
      return;
    }
    setError(null);
    setDeleting(true);
    void (async () => {
      try {
        const result = await deleteGroup(roomId);
        if (!result.success) {
          setError(result.error);
          setDeleting(false);
          return;
        }
        router.push("/home");
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
        setDeleting(false);
      }
    })();
  }

  // Phase 24: グループ設定。ChatRoom.tsxのclearSelectedImageと同じrevoke方式。
  function clearStagedAvatar() {
    setStagedAvatarFile(null);
    setStagedAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function handleAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    try {
      validateImageFile(file);
    } catch (err) {
      setError(
        err instanceof ImageValidationError
          ? err.message
          : "画像を選択できませんでした。",
      );
      return;
    }

    setError(null);
    clearStagedAvatar();
    setStagedAvatarFile(file);
    setStagedAvatarPreviewUrl(URL.createObjectURL(file));
  }

  function handleSaveProfile() {
    if (savingProfile) return;
    setError(null);
    setSavingProfile(true);
    void (async () => {
      try {
        let nextAvatarUrl = avatarUrl;
        if (stagedAvatarFile) {
          const compressed = await compressImage(stagedAvatarFile);
          nextAvatarUrl = await uploadImageToCloudinary(
            compressed,
            stagedAvatarFile.name,
            roomId,
          );
        }
        const result = await updateGroupProfile(roomId, {
          name: profileName,
          avatarUrl: nextAvatarUrl,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        const trimmed = profileName.trim();
        onProfileChange({
          roomName: trimmed.length > 0 ? trimmed : null,
          avatarUrl: nextAvatarUrl,
        });
        clearStagedAvatar();
      } catch (err) {
        setError(
          err instanceof ImageValidationError || err instanceof ImageUploadError
            ? err.message
            : NETWORK_ERROR_MESSAGE,
        );
      } finally {
        setSavingProfile(false);
      }
    })();
  }

  // Phase 29: 既読機能のON/OFF切替。名前・アバターと違い保存ボタンを介さず即時反映する
  // （AuthSettingsForm.tsxのtoggleScopeLaunch等と同じ「楽観的更新→失敗時ロールバック」方式）。
  function handleToggleReadReceipts() {
    const next = !readReceiptsEnabled;
    onReadReceiptsChange(next);
    setError(null);
    setReadReceiptsPending(true);
    void (async () => {
      try {
        const result = await updateGroupReadReceiptsEnabled(roomId, next);
        if (!result.success) {
          onReadReceiptsChange(!next);
          setError(result.error);
        }
      } catch {
        onReadReceiptsChange(!next);
        setError(NETWORK_ERROR_MESSAGE);
      } finally {
        setReadReceiptsPending(false);
      }
    })();
  }

  const displayAvatarUrl = stagedAvatarPreviewUrl ?? avatarUrl;

  return (
    <Modal onClose={onClose} labelledBy="group-members-title">
      <div className="flex flex-col gap-3 rounded-lg border border-band bg-surface-raised p-4">
        <div className="flex items-center justify-between">
          <p
            id="group-members-title"
            className="font-display text-sm font-semibold text-ink"
          >
            メンバー一覧
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

        {isOwner && (
          <div className="flex flex-col gap-2 border-b border-band/60 pb-3">
            <p className="font-label text-[10px] uppercase tracking-wide text-ink-muted">
              グループ設定
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-band/60 font-label text-sm text-ink-muted">
                {displayAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CloudinaryのURLをそのまま表示する。next/imageは不採用（docs/lessons.md参照）。
                  <img
                    src={displayAvatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (profileName.trim().slice(0, 1) ||
                    members[0]?.displayName.slice(0, 1)) ||
                  "G"
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  className="text-left text-xs text-tongue"
                >
                  画像を変更
                </button>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarFileChange}
                  aria-label="グループのアバター画像を選択"
                  className="hidden"
                />
              </div>
            </div>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="グループ名（未設定ならメンバー名で表示）"
              aria-label="グループ名"
              maxLength={GROUP_NAME_MAX_LENGTH}
              className="w-full rounded-lg border border-band bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="rounded-lg bg-tongue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
              >
                {savingProfile ? "保存中..." : "保存"}
              </button>
            </div>
            {/* Phase 29: 既読機能。バックログの条件付き要望通り、オーナーがグループ全体の
                既読表示ON/OFFを切り替えられるようにする（DMは常時ONで対象外）。 */}
            <label className="flex items-center justify-between gap-3 text-sm text-ink">
              既読表示
              <input
                type="checkbox"
                checked={readReceiptsEnabled}
                onChange={handleToggleReadReceipts}
                disabled={readReceiptsPending}
              />
            </label>
          </div>
        )}

        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm text-ink">
                  {member.displayName}
                </span>
                {member.role === "owner" && (
                  <span className="shrink-0 rounded-full border border-tongue/60 bg-tongue/10 px-1.5 py-0.5 font-label text-[10px] text-tongue">
                    オーナー
                  </span>
                )}
              </span>
              {isOwner &&
                member.role !== "owner" &&
                member.id !== currentUserId && (
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleTransferOwnership(member)}
                      disabled={
                        transferPending && transferringId === member.id
                      }
                      className="rounded-lg border border-band px-2 py-1 font-label text-[10px] text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
                    >
                      {transferPending && transferringId === member.id
                        ? "譲渡中..."
                        : "オーナーを譲渡"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      disabled={removePending && removingId === member.id}
                      className="rounded-lg border border-band px-2 py-1 font-label text-[10px] text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
                    >
                      {removePending && removingId === member.id
                        ? "削除中..."
                        : "削除"}
                    </button>
                  </span>
                )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <div className="flex flex-col gap-2 border-t border-band/60 pt-3">
            <button
              type="button"
              onClick={() => setAddOpen((prev) => !prev)}
              className="text-left text-xs text-tongue"
            >
              {addOpen ? "閉じる" : "＋ メンバーを追加"}
            </button>
            {addOpen && (
              <div className="flex flex-col gap-2">
                {selected.size > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(selected.values()).map((user) => (
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
                  placeholder="ユーザーIDで検索"
                  aria-label="追加するユーザーを検索"
                  className="w-full rounded-lg border border-band bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
                />
                {searching && (
                  <p className="text-xs text-ink-muted">検索中...</p>
                )}
                {!searching &&
                  query.trim().length > 0 &&
                  results.length === 0 && (
                    <p className="text-xs text-ink-muted">
                      ユーザーが見つかりませんでした。
                    </p>
                  )}
                {results.length > 0 && (
                  <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
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
                <button
                  type="button"
                  onClick={handleAddMembers}
                  disabled={selected.size === 0 || addPending}
                  className="rounded-lg bg-tongue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
                >
                  {addPending ? "追加中..." : "追加する"}
                </button>
              </div>
            )}

            {/* Phase 22: グループチャットM3。オーナーの退出・オーナー譲渡・グループ削除の
                「削除」だけがここに残る（退出はオーナー不可＝!isOwnerセクション側、
                譲渡は各メンバー行）。既存の退出ボタンと同じ危険操作スタイルを使う。 */}
            <button
              type="button"
              onClick={handleDeleteGroup}
              disabled={deleting}
              className="rounded-lg border border-clay px-3 py-1.5 text-xs text-clay transition-colors hover:bg-clay/10 disabled:opacity-60"
            >
              {deleting ? "削除中..." : "グループを削除"}
            </button>
          </div>
        )}

        {!isOwner && (
          <button
            type="button"
            onClick={handleLeave}
            disabled={leaving}
            className="rounded-lg border border-clay px-3 py-1.5 text-xs text-clay transition-colors hover:bg-clay/10 disabled:opacity-60"
          >
            {leaving ? "退出中..." : "退出する"}
          </button>
        )}

        {error && (
          <p className="text-xs text-clay" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
