"use client";

import { useEffect, useState } from "react";

/**
 * SRS 3.4: ネットワーク切断時はオフラインバナーを表示し、
 * 再接続を検知したら自動的にバナーを非表示にする。
 * Service Workerには依存せず、navigator.onLine + online/offlineイベントのみで判定する。
 * AuthGate.tsxと同じSSR安全パターン（初期値null→マウント後に実値へ補正）を踏襲する。
 */
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline !== false) {
    return null;
  }

  return (
    <div
      role="alert"
      className="border-b border-band/60 bg-surface-raised px-6 py-2 text-center text-xs text-clay"
    >
      オフラインです。ネットワーク接続を確認してください。
    </div>
  );
}
