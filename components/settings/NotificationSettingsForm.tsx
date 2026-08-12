"use client";

import { useState, useTransition } from "react";
import {
  updateDmFromStrangerSetting,
  updatePushNotificationsEnabled,
} from "@/app/actions/settings";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

/**
 * FR-24: プッシュ通知オン/オフ、FR-22: 知らない人からのDM受信設定。
 * ホーム画面ヘッダーに暫定配置されていたStrangerDmToggleをPhase 7で本画面へ統合した
 * （AuthSettingsForm.tsxと同じ「即時setState→失敗時ロールバック」パターン）。
 *
 * Phase 8: 各トグルの`await xxxAction(...)`をtry/catchで囲むよう修正した。
 * 従来はオフライン等でリクエスト自体が失敗すると（fetchがTypeErrorをthrowする）
 * ロールバック処理まで到達せず未処理例外になっていた（実機テストで発見・CLAUDE.md記録済み）。
 * あわせて、`{success:false}`分岐でもエラー表示が無くサイレントにロールバックするだけ
 * だった点も、AuthSettingsForm.tsxと同じ見た目のエラー表示に揃えた。
 */
export function NotificationSettingsForm({
  initialPushNotificationsEnabled,
  initialDmFromStrangerEnabled,
}: {
  initialPushNotificationsEnabled: boolean;
  initialDmFromStrangerEnabled: boolean;
}) {
  const [pushEnabled, setPushEnabled] = useState(
    initialPushNotificationsEnabled,
  );
  const [dmFromStrangerEnabled, setDmFromStrangerEnabled] = useState(
    initialDmFromStrangerEnabled,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function togglePush() {
    const next = !pushEnabled;
    setPushEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updatePushNotificationsEnabled(next);
        if (!result.success) {
          setPushEnabled(!next);
          setError(result.error);
        }
      } catch {
        setPushEnabled(!next);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function toggleDmFromStranger() {
    const next = !dmFromStrangerEnabled;
    setDmFromStrangerEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateDmFromStrangerSetting(next);
        if (!result.success) {
          setDmFromStrangerEnabled(!next);
          setError(result.error);
        }
      } catch {
        setDmFromStrangerEnabled(!next);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-band bg-surface-raised p-4">
        <h2 className="font-medium text-ink">通知設定</h2>
        <p className="text-xs text-ink-muted">
          学校PCなど制限された環境では、通知が届かない場合があります。
        </p>
        <label className="flex items-center justify-between gap-3 text-sm text-ink">
          プッシュ通知
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={togglePush}
            disabled={pending}
          />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-band bg-surface-raised p-4">
        <h2 className="font-medium text-ink">DM受信設定</h2>
        <p className="text-xs text-ink-muted">
          フレンドでない相手（ストレンジャー）から新規にDMを開始されることを許可するかどうかの設定です。
        </p>
        <label className="flex items-center justify-between gap-3 text-sm text-ink">
          知らない人からのDMを許可する
          <input
            type="checkbox"
            checked={dmFromStrangerEnabled}
            onChange={toggleDmFromStranger}
            disabled={pending}
          />
        </label>
      </section>

      {error && (
        <p className="text-xs text-clay" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
