"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * SRS 3.4「予期しないエラー発生時は汎用エラー画面（「エラーが発生しました。
 * 再度お試しください」）を表示する」対応（Phase 9）。
 *
 * Next.js 16.2.12ではerror.tsxが受け取るpropsは{ error, unstable_retry }であり、
 * 従来の{ error, reset }ではない（node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.mdで実際に確認済み。unstable_retryはv16.2.0で追加され、
 * 公式ドキュメントもreset()よりunstable_retry()の使用を推奨している）。
 *
 * error.messageは本番ビルドでは秘匿情報保護のため汎用文言に置き換えられる仕様のため、
 * 画面にはSRS固定文言のみを表示する（error.digestはログ相関用にのみ使う）。
 * このファイルはapp/layout.tsx配下のセグメント（/home・/chat/[roomId]・/settings等）の
 * レンダリング時例外のみを捕捉する。ルートレイアウト自体のクラッシュはapp/global-error.tsxの
 * 役目（そちらは別ファイルとして併設する）。
 */
export default function ErrorPage({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="font-display text-xl font-semibold text-ink">
        エラーが発生しました
      </h1>
      <p className="max-w-xs text-sm text-clay" role="alert">
        エラーが発生しました。再度お試しください。
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-lg bg-tongue px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
        >
          再試行
        </button>
        <Link
          href="/home"
          className="rounded-lg border border-band px-5 py-2.5 text-ink-muted transition-colors hover:bg-surface-raised"
        >
          ホームに戻る
        </Link>
      </div>
    </main>
  );
}
