"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import {
  startTemporaryDirectMessage,
  type TempDmDurationOption,
} from "@/app/actions/rooms";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";
import { Modal } from "@/components/ui/Modal";
import { TempChatDurationField } from "./TempChatDurationField";

/**
 * Phase 25：相手が既に確定している状態（チャット画面のオプションメニュー・
 * ホーム一覧/検索結果の右クリックメニューから開く）で一時チャットを作成する
 * モーダル。CreateTempChatPanel.tsxとの違いは相手の検索ステップを持たないことのみ。
 *
 * 既存の通常DM・既存の一時チャットの有無に関わらず常に新規roomを作成できる
 * （create_temp_dm_room RPCはそもそも既存ルームとのマージを行わない設計のため、
 * ここでは相手が既存DM相手かどうかのチェック自体を行わない＝何個でも作成できる）。
 */
export function CreateTempChatWithUserModal({
  targetUserId,
  targetDisplayName,
  targetUsername,
  onClose,
}: {
  targetUserId: string;
  targetDisplayName: string;
  targetUsername: string;
  onClose: () => void;
}) {
  const [duration, setDuration] = useState<TempDmDurationOption>("10m");
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">(
    "hours",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    if (pending) return;
    setError(null);

    if (duration === "custom") {
      const amount = Number(customAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("有効期限を正しく入力してください。");
        return;
      }
    }

    startTransition(async () => {
      try {
        const result = await startTemporaryDirectMessage(
          targetUserId,
          duration,
          duration === "custom"
            ? { amount: Number(customAmount), unit: customUnit }
            : undefined,
        );
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        // startTemporaryDirectMessageは成功時にredirect()を呼ぶため、Next.jsの内部
        // シグナル（digest付きエラー）をここで再送出してから、それ以外（オフライン等の
        // 真の通信エラー）だけを扱う（CreateTempChatPanel.tsxと同じパターン）。
        unstable_rethrow(err);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Modal onClose={onClose} labelledBy="create-temp-chat-with-user-title">
      <div className="flex flex-col gap-2.5 rounded-lg border border-band bg-surface-raised p-3">
        <div className="flex items-center justify-between">
          <p
            id="create-temp-chat-with-user-title"
            className="font-display text-sm font-semibold text-ink"
          >
            一時チャットを作成
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

        <div className="rounded-lg border border-tongue/60 bg-tongue/10 px-3 py-2">
          <p className="truncate text-sm font-medium text-ink">
            {targetDisplayName}
          </p>
          <p className="truncate text-xs text-ink-muted">@{targetUsername}</p>
        </div>

        <TempChatDurationField
          duration={duration}
          onDurationChange={setDuration}
          customAmount={customAmount}
          onCustomAmountChange={setCustomAmount}
          customUnit={customUnit}
          onCustomUnitChange={setCustomUnit}
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
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={pending}
            className="rounded-lg bg-tongue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
          >
            {pending ? "作成中..." : "一時チャットを開始"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
