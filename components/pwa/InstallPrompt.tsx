"use client";

import { useEffect, useState } from "react";

// beforeinstallpromptは非標準APIのためlib.dom.d.tsに型が無い。
// anyを避けるためWindowEventMapを拡張してアンビエント宣言する。
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

const DISMISSED_KEY = "tiliqua-install-prompt-dismissed";

/**
 * SRS 2.2/2.4・3.2.1: PWAインストール対応・インストールプロンプト。
 *
 * Next.js公式ガイド（node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md）は
 * beforeinstallpromptによるカスタムボタンを「非推奨（Safari iOS非対応などクロスブラウザでない）」
 * としているが、SRSがPWAインストール対応・インストールプロンプトを明示的に要求していることを踏まえ、
 * Chromium系での能動的な導線を優先してあえて採用している（ユーザー確認済み。CLAUDE.md Phase 7参照）。
 * iOS Safariはbeforeinstallprompt非対応のため、テキスト案内のみのフォールバックで補う。
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");

    function handleBeforeInstallPrompt(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function handleAppInstalled() {
      setDeferredPrompt(null);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  }

  if (isStandalone || dismissed) {
    return null;
  }

  const showIOSHint = isIOS && !deferredPrompt;

  if (!deferredPrompt && !showIOSHint) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-band/60 bg-surface-raised px-6 py-2 text-xs text-ink-muted">
      {deferredPrompt ? (
        <>
          <span>ホーム画面に追加してアプリのように使えます。</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleInstallClick}
              className="rounded-lg bg-tongue px-3 py-1 font-medium text-white transition-opacity hover:opacity-90"
            >
              インストール
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-ink-muted transition-colors hover:text-ink"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </>
      ) : (
        <>
          <span>
            共有ボタンから「ホーム画面に追加」でアプリのように使えます。
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 text-ink-muted transition-colors hover:text-ink"
            aria-label="閉じる"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
