"use client";

import { useState, useTransition } from "react";
import { updateDmFromStrangerSetting } from "@/app/actions/settings";

/**
 * FR-22: 知らない人からのDM受信設定。
 * 専用の設定画面ができるまでの暫定配置としてホーム画面ヘッダーに置く。
 */
export function StrangerDmToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await updateDmFromStrangerSetting(next);
      if (!result.success) {
        setEnabled(!next);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={enabled}
      title="知らない人からのDM受信設定"
      className="flex items-center gap-2 rounded-full border border-band px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-raised disabled:opacity-60"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-tongue" : "bg-band"}`}
        aria-hidden="true"
      />
      知らない人からのDM {enabled ? "許可" : "拒否"}
    </button>
  );
}
