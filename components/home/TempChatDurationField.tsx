"use client";

import type { TempDmDurationOption } from "@/app/actions/rooms";

const DURATION_OPTIONS: { value: TempDmDurationOption; label: string }[] = [
  { value: "10m", label: "10分" },
  { value: "1h", label: "1時間" },
  { value: "24h", label: "24時間" },
  { value: "7d", label: "7日間" },
  { value: "custom", label: "カスタム" },
];

/**
 * 一時チャットの有効期限選択UI（Phase 25で共通化）。元は
 * CreateTempChatPanel.tsxに個別実装されていたが、チャット画面・右クリック
 * メニューから相手を指定済みで一時チャットを作成するCreateTempChatWithUserModal.tsx
 * でも同じUIが必要になったため、フォーム部分だけをこのコンポーネントへ切り出した
 * （検索・相手選択のロジックは呼び出し元ごとに異なるため据え置き）。
 */
export function TempChatDurationField({
  duration,
  onDurationChange,
  customAmount,
  onCustomAmountChange,
  customUnit,
  onCustomUnitChange,
}: {
  duration: TempDmDurationOption;
  onDurationChange: (value: TempDmDurationOption) => void;
  customAmount: string;
  onCustomAmountChange: (value: string) => void;
  customUnit: "minutes" | "hours" | "days";
  onCustomUnitChange: (value: "minutes" | "hours" | "days") => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={duration}
        onChange={(e) => onDurationChange(e.target.value as TempDmDurationOption)}
        aria-label="有効期限"
        className="rounded-lg border border-band bg-surface px-2 py-1.5 text-sm text-ink-muted"
      >
        {DURATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {duration === "custom" && (
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            value={customAmount}
            onChange={(e) => onCustomAmountChange(e.target.value)}
            aria-label="有効期限（数値）"
            className="w-16 rounded-lg border border-band bg-surface px-1.5 py-1.5 text-sm text-ink"
          />
          <select
            value={customUnit}
            onChange={(e) =>
              onCustomUnitChange(e.target.value as "minutes" | "hours" | "days")
            }
            aria-label="有効期限の単位"
            className="rounded-lg border border-band bg-surface px-1.5 py-1.5 text-sm text-ink-muted"
          >
            <option value="minutes">分</option>
            <option value="hours">時間</option>
            <option value="days">日</option>
          </select>
        </span>
      )}
    </div>
  );
}
