"use client";

import { useState } from "react";
import { renameTempChat } from "@/app/actions/rooms";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";

const TEMP_CHAT_NAME_MAX_LENGTH = 50;

/**
 * Phase 30: 一時チャットの作成後リネーム用モーダル。
 * `CreateTempChatWithUserModal.tsx`と同じ「相手が確定済みの状態で開く」単純な構成。
 * 権限チェック（作成者=ownerのみ）はServer Action側（renameTempChat）に委ねており、
 * このモーダル自体はDMの両当事者どちらからでも開ける（非オーナーが保存すると
 * エラーメッセージが表示される。詳細はrenameTempChatのコメント参照）。
 */
export function RenameTempChatModal({
  roomId,
  currentName,
  onRenamed,
  onClose,
}: {
  roomId: string;
  currentName: string | null;
  onRenamed: (name: string | null) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (saving) return;
    setError(null);
    setSaving(true);
    void (async () => {
      try {
        const result = await renameTempChat(roomId, name);
        if (!result.success) {
          setError(result.error);
          return;
        }
        const trimmed = name.trim();
        onRenamed(trimmed.length > 0 ? trimmed : null);
        onClose();
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      } finally {
        setSaving(false);
      }
    })();
  }

  return (
    <Modal onClose={onClose} labelledBy="rename-temp-chat-title">
      <div className="flex flex-col gap-2.5 rounded-lg border border-band bg-surface-raised p-3">
        <div className="flex items-center justify-between">
          <p
            id="rename-temp-chat-title"
            className="font-display text-sm font-semibold text-ink"
          >
            チャット名を変更
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="チャット名（空欄で相手の表示名に戻す）"
          aria-label="一時チャットの名前"
          maxLength={TEMP_CHAT_NAME_MAX_LENGTH}
          className="w-full rounded-lg border border-band bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-tongue"
        />

        {error && (
          <p className="text-xs text-clay" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-tongue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
