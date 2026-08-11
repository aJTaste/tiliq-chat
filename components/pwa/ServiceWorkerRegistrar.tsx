"use client";

import { useEffect } from "react";

/**
 * Phase 7: PWAインストール可能性のためのService Worker登録。
 * Next.js公式ガイド（node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md）の
 * 実装パターンに準拠（feature detectionガード→useEffect内でregister）。
 * 何も描画しない。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Service Worker登録失敗はPWAインストール導線に影響するのみで、
        // 通常のチャット機能には影響しないため、ユーザー向けエラー表示は行わない。
      });
  }, []);

  return null;
}
