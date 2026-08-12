"use client";

import { useEffect } from "react";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * ルートレイアウト（app/layout.tsx）自体がクラッシュした場合のみ発火する最終防衛ライン
 * （Phase 9・SRS 3.4）。ルートレイアウトを丸ごと置き換えるため<html>/<body>を自前で持ち、
 * app/layout.tsxのCSS・フォントを自動継承しない（Next.js公式ドキュメントで確認済み：
 * 「global-errorはグローバルスタイルを含まないため、アプリのテーマがここには届かない」）。
 * そのため、app/layout.tsxと同じ3フォント（変数名も同一）をここで再宣言し、
 * ./globals.cssを直接importしてデザイントークンを取り込む（意図的な重複。
 * 真の最終エラー画面でも同じブランドの見た目を保つため）。
 * ServiceWorkerRegistrar/OfflineBanner/InstallPromptはここでは描画しない
 * （クラッシュ画面でクライアント副作用を追加するリスクを避けるため）。
 *
 * error.tsxと同じ理由でunstable_retryを使う（{ error, reset }ではない。
 * app/error.tsxのコメント参照）。
 */

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500"],
});

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang="ja"
      className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-surface text-ink">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <h1 className="font-display text-xl font-semibold text-ink">
            エラーが発生しました
          </h1>
          <p className="max-w-xs text-sm text-clay" role="alert">
            エラーが発生しました。再度お試しください。
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-lg bg-tongue px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
          >
            再試行
          </button>
        </main>
      </body>
    </html>
  );
}
